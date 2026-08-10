import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Master DB Pool Connection
const masterPool = mysql.createPool({
  host: process.env.MASTER_DB_HOST || 'localhost',
  port: parseInt(process.env.MASTER_DB_PORT || '3306', 10),
  user: process.env.MASTER_DB_USER || 'root',
  password: process.env.MASTER_DB_PASSWORD || '',
  database: process.env.MASTER_DB_NAME || 'zetaplus_maindb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Get a connection pool to the Master DB (zetaplus_maindb)
 */
export function getMasterDb() {
  return masterPool;
}

// Tenant Pool Cache: Map<schMasterID, { pool: mysql.Pool, lastUsed: number, credentials: object }>
const tenantPoolCache = new Map();
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle timeout

// Periodically evict idle pools
setInterval(() => {
  const now = Date.now();
  for (const [schMasterID, item] of tenantPoolCache.entries()) {
    if (now - item.lastUsed > IDLE_TIMEOUT_MS) {
      console.log(`[Tenant DB Cache] Evicting idle pool for schMasterID=${schMasterID}`);
      item.pool.end().catch(err => console.error(`Error closing idle pool for schMasterID=${schMasterID}:`, err));
      tenantPoolCache.delete(schMasterID);
    }
  }
}, 60 * 1000);

/**
 * Resolves connection details from srp_schoolmaster for schMasterID
 * and returns or creates a pooled connection to the TENANT database.
 * 
 * Since host/db_name/db_username/db_password in srp_schoolmaster are AES-encrypted,
 * we resolve the correct tenant DB dynamically by matching the school's SchShortCode
 * against available databases on the local MySQL server.
 */
export async function getTenantDb(schMasterID) {
  if (!schMasterID) {
    throw new Error('schMasterID is required to get a tenant database connection');
  }

  // Check cached pool
  if (tenantPoolCache.has(schMasterID)) {
    const cached = tenantPoolCache.get(schMasterID);
    cached.lastUsed = Date.now();
    return cached.pool;
  }

  // Fetch tenant DB credentials from zetaplus_maindb.srp_schoolmaster
  const [rows] = await masterPool.query(
    `SELECT SchMasterID, host, db_username, db_password, db_name, SchNameEn, SchNameOther, SchShortCode, SchLogo, SecondarySchLogo 
     FROM srp_schoolmaster 
     WHERE SchMasterID = ?`,
    [schMasterID]
  );

  if (!rows || rows.length === 0) {
    throw new Error(`School tenant metadata not found for schMasterID: ${schMasterID}`);
  }

  const tenantConfig = rows[0];

  // Connection settings
  let host = process.env.MASTER_DB_HOST || 'localhost';
  let port = parseInt(process.env.MASTER_DB_PORT || '3306', 10);
  let db_username = process.env.MASTER_DB_USER || 'zetaplususer';
  let db_password = process.env.MASTER_DB_PASSWORD || 'Wire2010!*';
  let db_name = null;

  // Check if raw credentials from DB are unencrypted plain values
  const isEncrypted = (val) => val && (val.includes('/') || val.includes('+') || val.includes('='));

  if (tenantConfig.host && !isEncrypted(tenantConfig.host)) {
    if (tenantConfig.host.includes(':')) {
      const parts = tenantConfig.host.split(':');
      host = parts[0];
      port = parseInt(parts[1], 10) || port;
    } else {
      host = tenantConfig.host;
    }
  }

  if (tenantConfig.db_name && !isEncrypted(tenantConfig.db_name)) {
    db_name = tenantConfig.db_name;
  }

  if (tenantConfig.db_username && !isEncrypted(tenantConfig.db_username)) {
    db_username = tenantConfig.db_username;
  }

  if (tenantConfig.db_password && !isEncrypted(tenantConfig.db_password)) {
    db_password = tenantConfig.db_password;
  }

  // If db_name is still unknown (encrypted), resolve dynamically
  if (!db_name) {
    db_name = await resolveTenantDbName(tenantConfig.SchShortCode, schMasterID);
  }

  console.log(`[Tenant DB Cache] Initializing pool for schMasterID=${schMasterID} -> DB: ${db_name} on ${host}:${port}`);

  const pool = mysql.createPool({
    host: host,
    port: port,
    user: db_username,
    password: db_password,
    database: db_name,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  tenantPoolCache.set(schMasterID, {
    pool,
    lastUsed: Date.now(),
    config: {
      SchMasterID: tenantConfig.SchMasterID,
      SchNameEn: tenantConfig.SchNameEn,
      SchNameOther: tenantConfig.SchNameOther,
      SchShortCode: tenantConfig.SchShortCode,
      SchLogo: tenantConfig.SchLogo,
      SecondarySchLogo: tenantConfig.SecondarySchLogo
    }
  });

  return pool;
}

/**
 * Resolves the tenant database name by matching the school's SchShortCode
 * against available databases on the MySQL server.
 * 
 * Matching strategy (in priority order):
 *   1. zetaplus_{SchShortCode lowercase}  (e.g. zetaplus_cfs for CFS)
 *   2. zetaplus_{SchShortCode lowercase}db (e.g. zetaplus_schooldb)
 *   3. Any database containing the SchShortCode (case-insensitive)
 *   4. Fallback: env TENANT_DB_NAME or 'zetaplus_schooldb'
 */
async function resolveTenantDbName(schShortCode, schMasterID) {
  const fallback = process.env.TENANT_DB_NAME || 'zetaplus_schooldb';

  if (!schShortCode) {
    console.warn(`[Tenant DB Resolve] No SchShortCode for schMasterID=${schMasterID}, using fallback: ${fallback}`);
    return fallback;
  }

  const shortLower = schShortCode.trim().toLowerCase().replace(/\s+/g, '');

  // Get all available databases from the server
  const [dbRows] = await masterPool.query(`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA`);
  const allDbs = dbRows.map(r => r.SCHEMA_NAME);

  // Priority 1: Exact match zetaplus_{shortcode}
  const exact = `zetaplus_${shortLower}`;
  if (allDbs.includes(exact)) {
    console.log(`[Tenant DB Resolve] Matched schMasterID=${schMasterID} (${schShortCode}) -> ${exact}`);
    return exact;
  }

  // Priority 2: zetaplus_{shortcode}db
  const withDb = `zetaplus_${shortLower}db`;
  if (allDbs.includes(withDb)) {
    console.log(`[Tenant DB Resolve] Matched schMasterID=${schMasterID} (${schShortCode}) -> ${withDb}`);
    return withDb;
  }

  // Priority 3: Any zetaplus_ database containing the shortcode
  const partial = allDbs.find(db => db.startsWith('zetaplus_') && db.toLowerCase().includes(shortLower));
  if (partial) {
    console.log(`[Tenant DB Resolve] Partial matched schMasterID=${schMasterID} (${schShortCode}) -> ${partial}`);
    return partial;
  }

  console.warn(`[Tenant DB Resolve] No matching DB for schMasterID=${schMasterID} (${schShortCode}), using fallback: ${fallback}`);
  return fallback;
}

/**
 * Helper to fetch school tenant branding/info from master DB
 */
export async function getSchoolTenantInfo(schMasterID) {
  const [rows] = await masterPool.query(
    `SELECT SchMasterID, host, db_username, db_password, db_name, SchNameEn, SchNameOther, SchShortCode, SchLogo, SecondarySchLogo 
     FROM srp_schoolmaster 
     WHERE SchMasterID = ?`,
    [schMasterID]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const r = rows[0];

  // Check if db_password might be plaintext in database
  if (r.db_password && !r.db_password.startsWith('enc:') && r.db_password.length < 30) {
    // Flagged for notification, but not silently altered
    console.warn(`[SECURITY FLAG] Tenant DB Password for schMasterID=${schMasterID} appears to be plaintext in srp_schoolmaster.`);
  }

  return r;
}
