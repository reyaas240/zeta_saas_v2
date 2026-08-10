import { getMasterDb, getTenantDb, getSchoolTenantInfo } from '../src/db.js';

async function runDbTest() {
  console.log('=== Step 1 Test: Master DB & Dynamic Tenant Connection Layer ===\n');

  try {
    const masterDb = getMasterDb();

    // 1. Query Master DB users & schools
    console.log('1. Querying Master DB (zetaplus_maindb)...');
    const [schools] = await masterDb.query('SELECT SchMasterID, SchNameEn, db_name, host, db_username, db_password FROM srp_schoolmaster LIMIT 5');
    console.log(`Found ${schools.length} school(s) in srp_schoolmaster:`);
    console.table(schools.map(s => ({
      SchMasterID: s.SchMasterID,
      SchNameEn: s.SchNameEn,
      db_name: s.db_name,
      host: s.host,
      db_username: s.db_username,
      db_password_masked: s.db_password ? s.db_password.substring(0, 3) + '***' : '(empty)'
    })));

    if (schools.length === 0) {
      console.error('ERROR: No schools found in srp_schoolmaster!');
      process.exit(1);
    }

    const testSchool = schools[0];
    const schMasterID = testSchool.SchMasterID;

    // 2. Test Tenant Connection Factory
    console.log(`\n2. Testing tenant connection factory for schMasterID=${schMasterID} (${testSchool.SchNameEn})...`);
    const tenantPool = await getTenantDb(schMasterID);

    // 3. Run query in Tenant DB
    const [branches] = await tenantPool.query('SELECT * FROM srp_schbranches LIMIT 5');
    console.log(`Successfully connected to Tenant DB (${testSchool.db_name})! Found ${branches.length} branch(es):`);
    console.table(branches);

    console.log('\n✅ STEP 1 PASSED: DB Connectivity & Tenant Pooling Layer working seamlessly.');
  } catch (err) {
    console.error('\n❌ STEP 1 FAILED:', err.message);
    console.error(err);
  } finally {
    process.exit(0);
  }
}

runDbTest();
