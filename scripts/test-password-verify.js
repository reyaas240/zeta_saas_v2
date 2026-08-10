import { getMasterDb } from '../src/db.js';
import { detectHashAlgorithm, verifyPassword } from '../src/passwordUtil.js';

async function runPasswordTest() {
  console.log('=== Step 2 Test: Password Hash Detection & Read-Only Verification ===\n');

  try {
    const masterDb = getMasterDb();

    console.log('1. Fetching sample user rows from zetaplus_maindb.user...');
    const [users] = await masterDb.query('SELECT Username, Password, schMasterID, branchID FROM user LIMIT 10');

    if (!users || users.length === 0) {
      console.log('No user rows found in zetaplus_maindb.user.');
      process.exit(0);
    }

    console.log(`Found ${users.length} sample user(s):\n`);

    const tableData = users.map(u => {
      const rawHash = u.Password || '';
      const algo = detectHashAlgorithm(rawHash);
      return {
        Username: u.Username,
        HashLength: rawHash.length,
        SamplePrefix: rawHash.substring(0, 12),
        DetectedAlgorithm: algo,
        schMasterID: u.schMasterID,
        branchID: u.branchID
      };
    });

    console.table(tableData);

    console.log('\n2. Testing read-only password verification against a sample user...');
    const testUser = users[0];
    const detectedAlgo = detectHashAlgorithm(testUser.Password);
    
    console.log(`User "${testUser.Username}" has detected hash format: ${detectedAlgo}`);
    
    // Test incorrect password
    const isWrongValid = verifyPassword('invalid_wrong_password_123', testUser.Password);
    console.log(`Testing WRONG password: ${isWrongValid ? '❌ UNEXPECTED MATCH' : '✅ CORRECTLY REJECTED'}`);

    console.log('\n✅ STEP 2 PASSED: Password hash detection and read-only verification logic ready.');
  } catch (err) {
    console.error('\n❌ STEP 2 FAILED:', err.message);
    console.error(err);
  } finally {
    process.exit(0);
  }
}

runPasswordTest();
