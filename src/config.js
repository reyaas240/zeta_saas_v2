import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'zetapro_secret',
  jwtExpiresIn: '8h',
  jwtCookieMaxAge: 8 * 3600 * 1000, // 8 hours in milliseconds
  
  // Master DB
  masterDb: {
    host: process.env.MASTER_DB_HOST || '127.0.0.1',
    port: parseInt(process.env.MASTER_DB_PORT || '3306', 10),
    user: process.env.MASTER_DB_USER || 'zetaplususer',
    password: process.env.MASTER_DB_PASSWORD || '',
    database: process.env.MASTER_DB_NAME || 'zetaplus_maindb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  },
  
  // Tenant DB Configuration (for multi-tenant architecture)
  tenantDb: {
    host: process.env.TENANT_DB_HOST || process.env.MASTER_DB_HOST || '127.0.0.1',
    port: parseInt(process.env.TENANT_DB_PORT || process.env.MASTER_DB_PORT || '3306', 10),
    user: process.env.TENANT_DB_USER || process.env.MASTER_DB_USER || 'zetaplususer',
    password: process.env.TENANT_DB_PASSWORD || process.env.MASTER_DB_PASSWORD || ''
  },
  
  // Tenant DB Pool Settings
  tenantPool: {
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    idleTimeoutMs: 10 * 60 * 1000 // 10 minutes
  },
  
  // Security
  isProduction: process.env.NODE_ENV === 'production',
  
  // Grading
  passingGrades: ['A*', 'A', 'B', 'C', 'P', 'PASS']
};

export default config;
