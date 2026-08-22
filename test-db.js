import { getTenantDb } from './src/db.js';

async function test() {
  try {
    const db = await getTenantDb(10);
    const [rows] = await db.query(
      `SELECT conMasDetID, conditionMasID, conformula, conditionActive, passMark, branchID, syllabusID
       FROM saas_conditionsdetails
       WHERE conditionMasID = ?`,
      [1]
    );
    console.log('GET:', rows);

    const [existing] = await db.query(
      `SELECT conMasDetID FROM saas_conditionsdetails WHERE conditionMasID = ?`,
      [1]
    );
    
    console.log('EXISTING:', existing);

    await db.query(
      `UPDATE saas_conditionsdetails 
       SET conformula = ?, conditionActive = ?, passMark = ?, branchID = ?, syllabusID = ?
       WHERE conditionMasID = ?`,
      ['new formula', 1, null, null, null, 1]
    );
    console.log('UPDATE DONE');
  } catch(e) {
    console.error('ERROR:', e);
  }
  process.exit(0);
}

test();
