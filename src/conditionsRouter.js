import express from 'express';
import { requireTenantAuth } from './authRouter.js';
import { getTenantDb } from './db.js';

const conditionsRouter = express.Router();

conditionsRouter.use(requireTenantAuth);

/**
 * Helper to get DB based on req.tenantContext
 */
async function getDb(req) {
  const { schMasterID } = req.tenantContext;
  return await getTenantDb(schMasterID);
}

// 1. Get all condition masters
conditionsRouter.get('/master', async (req, res) => {
  try {
    const tenantDb = await getDb(req);
    const [rows] = await tenantDb.query(
      `SELECT conditionMasID, conditionName, conditionModuleType
       FROM saas_conditionmaster
       ORDER BY conditionName ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Conditions Master Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get details for a specific condition master
conditionsRouter.get('/details/:masID', async (req, res) => {
  try {
    const tenantDb = await getDb(req);
    const masID = parseInt(req.params.masID, 10);
    const [rows] = await tenantDb.query(
      `SELECT conMasDetID, conditionMasID, conformula, conditionActive, passMark, branchID, syllabusID
       FROM saas_conditionsdetails
       WHERE conditionMasID = ?`,
      [masID]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Conditions Details Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Save details for a condition master
conditionsRouter.post('/details', async (req, res) => {
  try {
    const tenantDb = await getDb(req);
    const { conditionMasID, conformula, conditionActive, passMark, branchID, syllabusID } = req.body;

    // Check if exists
    const [existing] = await tenantDb.query(
      `SELECT conMasDetID FROM saas_conditionsdetails WHERE conditionMasID = ?`,
      [conditionMasID]
    );

    if (existing.length > 0) {
      // Update
      await tenantDb.query(
        `UPDATE saas_conditionsdetails 
         SET conformula = ?, conditionActive = ?, passMark = ?, branchID = ?, syllabusID = ?
         WHERE conditionMasID = ?`,
        [conformula, conditionActive ? 1 : 0, passMark || null, branchID || 0, syllabusID || 0, conditionMasID]
      );
    } else {
      // Insert
      await tenantDb.query(
        `INSERT INTO saas_conditionsdetails (conditionMasID, conformula, conditionActive, passMark, branchID, syllabusID)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [conditionMasID, conformula, conditionActive ? 1 : 0, passMark || null, branchID || 0, syllabusID || 0]
      );
    }

    res.json({ success: true, message: 'Condition details saved successfully.' });
  } catch (err) {
    console.error('[Save Conditions Details Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export { conditionsRouter };
