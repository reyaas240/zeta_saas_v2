import express from 'express';
import { requireTenantAuth } from './authRouter.js';
import { getTenantDb } from './db.js';
import config from './config.js';

const templateRouter = express.Router();
templateRouter.use(requireTenantAuth);

async function getDb(req) {
  const { schMasterID } = req.tenantContext;
  return await getTenantDb(schMasterID);
}

// GET /api/template/filters — academic years, terms, classes, subjects
templateRouter.get('/filters', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID } = req.tenantContext;

    const [academicYears] = await db.query(
      `SELECT AY_AutoID AS id, AY_Description AS label
       FROM srp_academicyearmaster
       WHERE SchMasterID = ? AND isDeleted = 0
       ORDER BY AY_AutoID DESC`, [schMasterID]
    );

    const [terms] = await db.query(
      `SELECT TermID AS id, TermDescription AS label
       FROM srp_termmaster
       WHERE SchMasterID = ? AND isDeleted = 0
       ORDER BY SortOrder ASC`, [schMasterID]
    );

    const [classes] = await db.query(
      `SELECT ClassId AS id, Class AS label
       FROM srp_classes
       WHERE SchMasterID = ? AND branchID = ? AND isDeleted = 0
       ORDER BY SortOrder ASC`, [schMasterID, branchID]
    );

    const [subjects] = await db.query(
      `SELECT SubId AS id, SubjectE AS label
       FROM srp_subjects
       WHERE SchMasterID = ? AND branchID = ? AND isDeleted = 0
       ORDER BY SortOrder ASC`, [schMasterID, branchID]
    );

    res.json({ success: true, academicYears, terms, classes, subjects });
  } catch (err) {
    console.error('[Template Filters Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/template/exams — exams filtered by ay/term/class/subject
templateRouter.get('/exams', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID } = req.tenantContext;
    const { ayID, termID, classID, subID } = req.query;

    let where = 'WHERE tm.SchMasterID = ? AND tm.BranchID = ? AND tm.isDeleted = 0';
    const params = [schMasterID, branchID];

    if (ayID)    { where += ' AND tm.AcademicYearID = ?'; params.push(ayID); }
    if (termID)  { where += ' AND tm.SelectedTermID = ?'; params.push(termID); }
    if (classID) { where += ' AND tm.ClassID = ?'; params.push(classID); }
    if (subID)   { where += ' AND tm.SubID = ?'; params.push(subID); }

    const [rows] = await db.query(
      `SELECT tm.TestMasterID AS id, tm.TestDes AS label,
              tm.AcademicYearID, tm.SelectedTermID, tm.ClassID, tm.SubID
       FROM srp_testmaster tm
       ${where}
       ORDER BY tm.TestMasterID DESC
       LIMIT 100`, params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Template Exams Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/template/columns/:examID — get template columns + marks categories for an exam
templateRouter.get('/columns/:examID', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID } = req.tenantContext;
    const examID = parseInt(req.params.examID, 10);

    // Existing template columns
    const [columns] = await db.query(
      `SELECT TemplateColID, TestMasterID, ColType, TestMarksID, ColLabel, Formula, SortOrder
       FROM saas_test_template_config
       WHERE TestMasterID = ? AND SchMasterID = ?
       ORDER BY SortOrder ASC`, [examID, schMasterID]
    );

    // Available marks categories for this exam (for reference in formula)
    const [marksCategories] = await db.query(
      `SELECT TestMarksID AS id, TestMarksDes AS label, TestFullMarks AS maxMarks
       FROM srp_testmarkscategory
       WHERE TestMasterID = ? AND SchMasterID = ?
       ORDER BY TestMarksID ASC`, [examID, schMasterID]
    );

    res.json({ success: true, columns, marksCategories });
  } catch (err) {
    console.error('[Template Columns Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/template/columns — save template columns for an exam (full replace)
templateRouter.post('/columns', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID } = req.tenantContext;
    const { examID, columns } = req.body;

    if (!examID || !Array.isArray(columns)) {
      return res.status(400).json({ success: false, error: 'examID and columns[] are required.' });
    }

    // Delete old config for this exam
    await db.query(
      `DELETE FROM saas_test_template_config WHERE TestMasterID = ? AND SchMasterID = ?`,
      [examID, schMasterID]
    );

    // Insert new rows
    if (columns.length > 0) {
      const values = columns.map((col, idx) => [
        examID,
        col.colType,
        col.testMarksID || null,
        col.colLabel,
        col.formula || null,
        idx + 1,
        schMasterID,
        branchID
      ]);
      await db.query(
        `INSERT INTO saas_test_template_config
          (TestMasterID, ColType, TestMarksID, ColLabel, Formula, SortOrder, SchMasterID, BranchID)
         VALUES ?`, [values]
      );
    }

    res.json({ success: true, message: 'Template configuration saved successfully.' });
  } catch (err) {
    console.error('[Template Save Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export { templateRouter };
