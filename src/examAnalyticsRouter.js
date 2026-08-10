import express from 'express';
import { requireTenantAuth } from './authRouter.js';
import { getTenantDb } from './db.js';

export const examAnalyticsRouter = express.Router();

examAnalyticsRouter.use(requireTenantAuth);

/**
 * Shared helper: fetch all subjects for a school ordered by SortOrder.
 * Used by any analytics endpoint that needs a canonical subject list.
 * GET /api/analytics/exam/subjects
 */
examAnalyticsRouter.get('/subjects', async (req, res) => {
  try {
    const { schMasterID, branchID } = req.tenantContext;
    const tenantDb = await getTenantDb(schMasterID);
    const subjects = await getSubjectsOrdered(tenantDb, schMasterID, branchID);
    res.json({ success: true, subjects });
  } catch (err) {
    console.error('[Subjects Error]:', err);
    res.status(500).json({ success: false, error: 'Failed to load subjects.' });
  }
});

/**
 * Reusable helper – returns subjects for a school/branch ordered by SortOrder ASC.
 * @param {object} tenantDb  - mysql2 pool for the tenant
 * @param {number} schMasterID
 * @param {number} branchID
 */
async function getSubjectsOrdered(tenantDb, schMasterID, branchID) {
  let where = `WHERE SchMasterID = ? AND isDeleted = 0`;
  const params = [schMasterID];
  if (branchID) {
    where += ` AND branchID = ?`;
    params.push(branchID);
  }
  const [rows] = await tenantDb.query(
    `SELECT SubId AS subjectID, SubjectE AS subjectName, SubjectA AS subjectNameAlt,
            SortOrder, ShortCode
     FROM srp_subjects
     ${where}
     ORDER BY SortOrder ASC, SubId ASC`,
    params
  );
  return rows;
}

/**
 * GET /api/analytics/exam/filters
 * Fetches dropdown options: Academic Years, Terms, Classes, Groups
 */
examAnalyticsRouter.get('/filters', async (req, res) => {
  try {
    const { schMasterID, branchID } = req.tenantContext;
    const tenantDb = await getTenantDb(schMasterID);

    // 1. Fetch Academic Years
    const [academicYears] = await tenantDb.query(
      `SELECT ad.AcademicYear, ay.AY_AutoID, ay.AY_Description, ad.ActiveAY 
       FROM srp_academicdetails ad
       LEFT JOIN srp_academicyearmaster ay ON ay.AY_AutoID = ad.AcademicYear
       WHERE ad.SchMasterId = ? AND ad.BranchID = ? AND ad.isDeleted = 0
       ORDER BY ad.ActiveAY DESC, ay.AY_AutoID DESC`,
      [schMasterID, branchID]
    );

    // 2. Fetch Terms
    const [terms] = await tenantDb.query(
      `SELECT TermID, TermDescription, AcademicYearID 
       FROM srp_termmaster 
       WHERE SchMasterID = ? AND BranchID = ? AND (isDeleted = 0 OR isDeleted IS NULL)
       ORDER BY TermID ASC`,
      [schMasterID, branchID]
    );

    // 3. Fetch Classes
    const [classes] = await tenantDb.query(
      `SELECT ClassId AS classID, Class AS className 
       FROM srp_classes 
       WHERE SchMasterID = ? AND branchID = ? AND isDeleted = 0 
       ORDER BY SortOrder ASC, ClassId ASC`,
      [schMasterID, branchID]
    );

    // 4. Fetch Groups
    const [groups] = await tenantDb.query(
      `SELECT GrpID AS grpID, GroupID AS groupName, GroupShortCode 
       FROM srp_groups 
       WHERE SchMasterId = ? AND BranchID = ? AND isDeleted = 0
       ORDER BY sortOrder ASC, GrpID ASC`,
      [schMasterID, branchID]
    );

    // Identify active AY
    const activeAyRow = academicYears.find(ay => ay.ActiveAY === 1) || academicYears[0];

    res.json({
      success: true,
      defaultAcademicYearID: activeAyRow ? activeAyRow.AcademicYear : null,
      academicYears: academicYears.map(ay => ({
        academicYearID: ay.AcademicYear,
        description: ay.AY_Description || `Academic Year ${ay.AcademicYear}`,
        isActive: Boolean(ay.ActiveAY)
      })),
      terms: terms.map(t => ({
        termID: t.TermID,
        termDescription: t.TermDescription,
        academicYearID: t.AcademicYearID
      })),
      classes: classes.map(c => ({
        classID: c.classID,
        className: c.className
      })),
      groups: groups.map(g => ({
        grpID: g.grpID,
        groupName: g.groupName || g.GroupShortCode || `Group ${g.grpID}`
      }))
    });
  } catch (err) {
    console.error('[Exam Analytics Filters Error]:', err);
    res.status(500).json({ success: false, error: 'Failed to load analytics filters.' });
  }
});

/**
 * GET /api/analytics/exam/data
 * Computes analytics aggregations for selected filters
 */
examAnalyticsRouter.get('/data', async (req, res) => {
  try {
    const { schMasterID, branchID } = req.tenantContext;
    const tenantDb = await getTenantDb(schMasterID);

    let { academicYearID, termID, classID, grpID } = req.query;

    academicYearID = academicYearID ? parseInt(academicYearID, 10) : req.tenantContext.academicYear;
    termID = termID ? parseInt(termID, 10) : null;
    classID = classID ? parseInt(classID, 10) : null;
    grpID = grpID ? parseInt(grpID, 10) : null;

    // Build dynamic SQL WHERE conditions for srp_termreportmarks
    let marksWhere = `WHERE m.SchMasterID = ? AND m.BranchID = ?`;
    let marksParams = [schMasterID, branchID];

    if (academicYearID) {
      marksWhere += ` AND m.AcademicYearID = ?`;
      marksParams.push(academicYearID);
    }
    if (termID) {
      marksWhere += ` AND m.TermMasterID = ?`;
      marksParams.push(termID);
    }
    if (classID) {
      marksWhere += ` AND trm.ClassID = ?`;
      marksParams.push(classID);
    }
    if (grpID) {
      marksWhere += ` AND (m.GrpID = ? OR m.GradeID = ?)`;
      marksParams.push(grpID, grpID);
    }

    // 1. Summary KPIs & Grade Distribution
    const [gradeRows] = await tenantDb.query(
      `SELECT m.FinalGrade, COUNT(*) as count, AVG(m.FinalMarks) as avgMarks, MAX(m.FinalMarks) as maxMarks, COUNT(DISTINCT m.StudentID) as distinctStudents
       FROM srp_termreportmarks m
       LEFT JOIN srp_termreportmaster trm ON trm.TermID = m.TermMasterID AND trm.SchMasterID = m.SchMasterID AND trm.BranchID = m.BranchID
       ${marksWhere}
       GROUP BY m.FinalGrade`,
      marksParams
    );

    let totalEvaluated = 0;
    let sumMarks = 0;
    let highestScore = 0;
    let passingCount = 0;
    const gradeDistribution = {};

    gradeRows.forEach(row => {
      const grade = row.FinalGrade || 'Unassigned';
      const count = parseInt(row.count, 10);
      gradeDistribution[grade] = count;
      totalEvaluated += count;
      sumMarks += (row.avgMarks || 0) * count;
      if (row.maxMarks > highestScore) highestScore = row.maxMarks;
      if (['A*', 'A', 'B', 'C', 'P', 'PASS'].includes(grade.toUpperCase())) {
        passingCount += count;
      }
    });

    const overallAverage = totalEvaluated > 0 ? (sumMarks / totalEvaluated).toFixed(1) : 0;
    const passRate = totalEvaluated > 0 ? ((passingCount / totalEvaluated) * 100).toFixed(1) : 0;

    // 2. Subject Averages & Highest Scores (from srp_termreportmarksaverage)
    //    Join via TermReportMasterID to srp_termreportmaster for classID/grpID filtering
    let avgWhere = `WHERE a.SchMasterID = ? AND a.BranchID = ?`;
    let avgParams = [schMasterID, branchID];
    let avgJoin = `JOIN srp_termreportmaster trm ON trm.TermReportMasterID = a.TermReportMasterID`;

    if (academicYearID) {
      avgWhere += ` AND a.AcademicYearID = ?`;
      avgParams.push(academicYearID);
    }
    if (termID) {
      avgWhere += ` AND a.TermMasterID = ?`;
      avgParams.push(termID);
    }
    if (classID) {
      avgWhere += ` AND trm.ClassID = ?`;
      avgParams.push(classID);
    }
    if (grpID) {
      avgWhere += ` AND trm.GrpID = ?`;
      avgParams.push(grpID);
    }

    const [subjectRows] = await tenantDb.query(
      `SELECT s.SubjectE AS subjectName,
              ROUND(AVG(a.SubClassAverage), 2) AS classAvg,
              ROUND(MAX(a.SubHighestMarks), 2) AS highestMark,
              s.SortOrder
       FROM srp_termreportmarksaverage a
       ${avgJoin}
       JOIN srp_subjects s ON s.SubId = a.SubID
       ${avgWhere}
       GROUP BY a.SubID, s.SubjectE, s.SortOrder
       ORDER BY s.SortOrder ASC, s.SubId ASC
       LIMIT 15`,
      avgParams
    );

    // 3. Term-over-Term Trend
    const [termTrendRows] = await tenantDb.query(
      `SELECT t.TermDescription, ROUND(AVG(m.FinalMarks), 1) as termAvg
       FROM srp_termreportmarks m
       JOIN srp_termmaster t ON t.TermID = m.TermMasterID
       WHERE m.SchMasterID = ? AND m.BranchID = ? AND m.AcademicYearID = ?
       GROUP BY m.TermMasterID, t.TermDescription
       ORDER BY m.TermMasterID ASC`,
      [schMasterID, branchID, academicYearID]
    );

    // 4. Class Averages
    const [classAvgRows] = await tenantDb.query(
      `SELECT c.Class AS className, ROUND(AVG(m.FinalMarks), 1) as classAvg
       FROM srp_termreportmarks m
       JOIN srp_termreportmaster trm ON trm.TermID = m.TermMasterID AND trm.SchMasterID = m.SchMasterID AND trm.BranchID = m.BranchID
       JOIN srp_classes c ON c.ClassId = trm.ClassID
       WHERE m.SchMasterID = ? AND m.BranchID = ? AND m.AcademicYearID = ?
       GROUP BY trm.ClassID, c.Class
       ORDER BY classAvg DESC
       LIMIT 10`,
      [schMasterID, branchID, academicYearID]
    );

    res.json({
      success: true,
      kpis: {
        totalEvaluated,
        overallAverage,
        passRate,
        highestScore
      },
      gradeDistribution,
      subjectPerformance: subjectRows.map(r => ({
        subjectName: r.subjectName || 'Subject',
        classAvg: parseFloat(r.classAvg) || 0,
        highestMark: parseFloat(r.highestMark) || 0
      })),
      termTrend: termTrendRows.map(r => ({
        termDescription: r.TermDescription,
        termAvg: parseFloat(r.termAvg) || 0
      })),
      classPerformance: classAvgRows.map(r => ({
        className: r.className,
        classAvg: parseFloat(r.classAvg) || 0
      }))
    });

  } catch (err) {
    console.error('[Exam Analytics Data Error]:', err);
    res.status(500).json({ success: false, error: 'Failed to compute exam analytics data.' });
  }
});
