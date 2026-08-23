import express from 'express';
import { requireTenantAuth } from './authRouter.js';
import { getTenantDb } from './db.js';
import config from './config.js';

const marksEntryRouter = express.Router();
marksEntryRouter.use(requireTenantAuth);

async function getDb(req) {
  const { schMasterID } = req.tenantContext;
  return await getTenantDb(schMasterID);
}

// GET /api/marks-entry/filters — academic years, terms, classes, subjects
marksEntryRouter.get('/filters', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID, isSystemAdmin, empID: sessionEmpID } = req.tenantContext;
    
    // If admin, they can pass empID in query. If not, forcefully restrict to their own session empID.
    const targetEmpID = isSystemAdmin ? (req.query.empID || null) : sessionEmpID;

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

    let employees = [];
    if (isSystemAdmin) {
      const [empRows] = await db.query(
        `SELECT EIdNo AS id, Ename1 AS label 
         FROM srp_employeesdetails 
         WHERE SchMasterId = ? AND isDeleted = 0 
         ORDER BY Ename1 ASC`, [schMasterID]
      );
      employees = empRows;
    }

    let classQuery = `SELECT ClassId AS id, Class AS label FROM srp_classes WHERE SchMasterID = ? AND branchID = ? AND isDeleted = 0`;
    let subQuery = `SELECT SubId AS id, SubjectE AS label FROM srp_subjects WHERE SchMasterID = ? AND branchID = ? AND isDeleted = 0`;

    if (targetEmpID) {
      classQuery = `SELECT DISTINCT c.ClassId AS id, c.Class AS label, c.SortOrder
                    FROM srp_classes c
                    JOIN srp_empsubjects es ON c.ClassId = es.ClassID
                    WHERE c.SchMasterID = ? AND c.branchID = ? AND c.isDeleted = 0
                      AND es.EmpID = ${db.escape(targetEmpID)} AND es.isDeleted = 0`;

      subQuery = `SELECT DISTINCT s.SubId AS id, s.SubjectE AS label, s.SortOrder
                  FROM srp_subjects s
                  JOIN srp_empsubjects es ON s.SubId = es.SubID
                  WHERE s.SchMasterID = ? AND s.branchID = ? AND s.isDeleted = 0
                    AND es.EmpID = ${db.escape(targetEmpID)} AND es.isDeleted = 0`;
    }

    classQuery += ` ORDER BY SortOrder ASC`;
    subQuery += ` ORDER BY SortOrder ASC`;

    const [classes] = await db.query(classQuery, [schMasterID, branchID]);
    const [subjects] = await db.query(subQuery, [schMasterID, branchID]);

    res.json({ success: true, academicYears, terms, classes, subjects, employees, isSystemAdmin });
  } catch (err) {
    console.error('[Marks Entry Filters Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/marks-entry/exams — exams filtered by ay/term/class/subject that HAVE a template
marksEntryRouter.get('/exams', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID } = req.tenantContext;
    const { ayID, termID, classID, subID } = req.query;

    let where = `WHERE tm.SchMasterID = ? AND tm.BranchID = ? AND tm.isDeleted = 0
                 AND EXISTS (SELECT 1 FROM saas_test_template_config tc WHERE tc.TestMasterID = tm.TestMasterID AND tc.SchMasterID = tm.SchMasterID)`;
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
    console.error('[Marks Entry Exams Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/marks-entry/grid/:examID — return template columns + students + existing marks
marksEntryRouter.get('/grid/:examID', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID } = req.tenantContext;
    const examID = parseInt(req.params.examID, 10);

    // 1. Get template config for this exam
    const [columns] = await db.query(
      `SELECT TemplateColID, ColType, TestMarksID, ColLabel, Formula, SortOrder
       FROM saas_test_template_config
       WHERE TestMasterID = ? AND SchMasterID = ?
       ORDER BY SortOrder ASC`, [examID, schMasterID]
    );

    // 2. Get marks categories (for INPUT columns that map to srp_testmarkscategory)
    const [marksCategories] = await db.query(
      `SELECT TestMarksID AS id, TestMarksDes AS label, TestFullMarks AS maxMarks
       FROM srp_testmarkscategory
       WHERE TestMasterID = ? AND SchMasterID = ?
       ORDER BY TestMarksID ASC`, [examID, schMasterID]
    );

    // 3. Get the exam details
    const [[exam]] = await db.query(
      `SELECT ClassID, SubID, AcademicYearID, MarksOutOff,
              isSubjectCommentRequired, isEffortCodeRequired, SubjectCommentLength
       FROM srp_testmaster WHERE TestMasterID = ? AND SchMasterID = ?`,
      [examID, schMasterID]
    );

    if (!exam) {
      return res.status(404).json({ success: false, error: 'Exam not found.' });
    }

    // Fetch marking scheme for real-time calculation in UI
    const [markingScheme] = await db.query(
      `SELECT MarkFrom, MarkTo, Grade FROM srp_marking_scheme
       WHERE SubID = ? AND AcademicYearID = ? AND SchMasterID = ? AND isDeleted = 0
       ORDER BY GrpID DESC, MarkFrom DESC`,
      [exam.SubID, exam.AcademicYearID, schMasterID]
    );

    // Fetch effort codes if required
    let effortCodes = [];
    if (exam.isEffortCodeRequired) {
      const [efforts] = await db.query(
        `SELECT EffortID AS id, EffortCode AS code, EffortDes AS label
         FROM srp_effortcodemaster
         WHERE AcademicYearID = ? AND SchMasterID = ? AND isDeleted = 0
         ORDER BY EffortID ASC`,
        [exam.AcademicYearID, schMasterID]
      );
      effortCodes = efforts;
    }

    // 4. Get students for the class who are present in srp_marks for this exam
    const [students] = await db.query(
      `SELECT sd.StudentID AS id, 
              TRIM(CONCAT(COALESCE(sd.fName, ''), ' ', COALESCE(sd.surname, ''))) AS name,
              sd.studentCode AS admNo
       FROM srp_studentdetails sd
       INNER JOIN srp_marks m ON m.StudentID = sd.StudentID
       WHERE sd.ClassId = ? AND sd.schMasterId = ? AND sd.branchId = ?
         AND sd.isDeleted = 0 AND sd.isLeft = 0
         AND m.TestID = ?
       ORDER BY sd.fName ASC`, [exam.ClassID, schMasterID, branchID, examID]
    );

    // 5. Get existing marks for the exam students
    const studentIDs = students.map(s => s.id);
    let existingMarks = [];
    if (studentIDs.length > 0) {
      const [marks] = await db.query(
        `SELECT StuID, TestMarksID, Marks, stuAb_status
         FROM srp_markscategorywise
         WHERE TestMasterID = ? AND SchMasterID = ? AND StuID IN (?)`,
        [examID, schMasterID, studentIDs]
      );
      existingMarks = marks;
    }

    // 6. Get existing SubjectComment and EffortID from srp_marks
    let existingMasterMarks = [];
    if (studentIDs.length > 0) {
      const [masterMarks] = await db.query(
        `SELECT StudentID, SubjectComment, EffortID
         FROM srp_marks
         WHERE TestID = ? AND SchMasterID = ? AND StudentID IN (?)`,
        [examID, schMasterID, studentIDs]
      );
      existingMasterMarks = masterMarks;
    }

    res.json({ 
      success: true, 
      columns, 
      marksCategories, 
      students, 
      existingMarks,
      existingMasterMarks,
      markingScheme, 
      marksOutOff: exam.MarksOutOff || 100,
      isSubjectCommentRequired: exam.isSubjectCommentRequired || 0,
      isEffortCodeRequired: exam.isEffortCodeRequired || 0,
      subjectCommentLength: exam.SubjectCommentLength || 50,
      effortCodes
    });
  } catch (err) {
    console.error('[Marks Entry Grid Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/marks-entry/save — save/update marks for students
marksEntryRouter.post('/save', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID, userID, userName } = req.tenantContext;
    const { examID, marks, finalTotals, finalGrades, subjectComments, effortIDs } = req.body;

    if (!examID || !Array.isArray(marks) || marks.length === 0) {
      return res.status(400).json({ success: false, error: 'examID and marks[] are required.' });
    }

    // 1. Fetch exam details to find SubID, AcademicYearID
    const [[exam]] = await db.query(
      `SELECT SubID, AcademicYearID FROM srp_testmaster WHERE TestMasterID = ? AND SchMasterID = ?`,
      [examID, schMasterID]
    );

    // 2. Fetch marking scheme for this subject and year
    let markingScheme = [];
    if (exam) {
      const [schemes] = await db.query(
        `SELECT MarkFrom, MarkTo, Grade FROM srp_marking_scheme
         WHERE SubID = ? AND AcademicYearID = ? AND SchMasterID = ? AND isDeleted = 0
         ORDER BY GrpID DESC, MarkFrom DESC`,
        [exam.SubID, exam.AcademicYearID, schMasterID]
      );
      markingScheme = schemes;
    }

    // 3. Fetch max marks for test marks categories to calculate percentage
    const [categories] = await db.query(
      `SELECT TestMarksID, TestFullMarks FROM srp_testmarkscategory WHERE TestMasterID = ? AND SchMasterID = ?`,
      [examID, schMasterID]
    );
    const categoryMaxMarks = {};
    categories.forEach(c => { categoryMaxMarks[c.TestMarksID] = c.TestFullMarks; });

    for (const entry of marks) {
      const { stuID, testMarksID, marks: markValue, stuAb_status } = entry;
      
      // Calculate grade (based on percentage out of 100)
      let calculatedGrade = null;
      if (stuAb_status === 1) {
        calculatedGrade = null;
      } else if (markingScheme.length > 0 && markValue != null) {
        const maxMarks = categoryMaxMarks[testMarksID] || 100;
        const percentage = maxMarks > 0 ? (markValue / maxMarks) * 100 : markValue;
        
        const matchingScheme = markingScheme.find(s => percentage >= s.MarkFrom && percentage <= s.MarkTo);
        if (matchingScheme) {
          calculatedGrade = matchingScheme.Grade;
        }
      }

      // Check existing
      const [[existing]] = await db.query(
        `SELECT CatMarksID FROM srp_markscategorywise
         WHERE TestMasterID = ? AND TestMarksID = ? AND StuID = ? AND SchMasterID = ?`,
        [examID, testMarksID, stuID, schMasterID]
      );

      if (existing) {
        await db.query(
          `UPDATE srp_markscategorywise
           SET Marks = ?, Grade = ?, stuAb_status = ?, ModifiedUserName = ?, Timestamp = NOW()
           WHERE CatMarksID = ?`,
          [markValue ?? 0, calculatedGrade, stuAb_status ?? 0, userName || 'system', existing.CatMarksID]
        );
      } else {
        await db.query(
          `INSERT INTO srp_markscategorywise
           (TestMasterID, TestMarksID, StuID, Marks, Grade, stuAb_status, SchMasterID, BranchID, CreatedUserName, CreatedDate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [examID, testMarksID, stuID, markValue ?? 0, calculatedGrade, stuAb_status ?? 0, schMasterID, branchID, userName || 'system']
        );
      }
    }
    
    // 4. Save Final Totals, Grades, SubjectComments, EffortIDs to srp_marks
    if (finalTotals && typeof finalTotals === 'object') {
      for (const [stuID, totalMark] of Object.entries(finalTotals)) {
        const finalGrade = (finalGrades && finalGrades[stuID]) ? finalGrades[stuID] : null;
        const subjectComment = (subjectComments && subjectComments[stuID]) ? subjectComments[stuID] : null;
        const effortID = (effortIDs && effortIDs[stuID]) ? parseInt(effortIDs[stuID], 10) : 0;
        const studentID = parseInt(stuID, 10);
        
        const [[existingMark]] = await db.query(
          `SELECT ExamMarksID FROM srp_marks WHERE TestID = ? AND StudentID = ? AND SchMasterID = ?`,
          [examID, studentID, schMasterID]
        );
        
        if (existingMark) {
          await db.query(
            `UPDATE srp_marks
             SET Marks = ?, Grade = ?, SubjectComment = ?, EffortID = ?, ModifiedUserName = ?, Timestamp = NOW()
             WHERE ExamMarksID = ?`,
            [totalMark || 0, finalGrade || '', subjectComment, effortID, userID || userName || 'system', existingMark.ExamMarksID]
          );
        } else {
          await db.query(
            `INSERT INTO srp_marks
             (TestID, StudentID, SubID, AcademicYearID, Marks, Grade, SubjectComment, EffortID, SchMasterID, BranchID, CreatedUserName, CreatedDate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [examID, studentID, exam.SubID, exam.AcademicYearID, totalMark || 0, finalGrade || '', subjectComment, effortID, schMasterID, branchID, userID || userName || 'system']
          );
        }
      }

      // 5. Recalculate Position (rank students by total marks DESC, excluding absent)
      const [allStudentMarks] = await db.query(
        `SELECT ExamMarksID, Marks FROM srp_marks
         WHERE TestID = ? AND SchMasterID = ? AND isDeleted = 0
         ORDER BY Marks DESC`,
        [examID, schMasterID]
      );

      let position = 1;
      let prevMark = null;
      let sameRankCount = 0;
      for (let i = 0; i < allStudentMarks.length; i++) {
        const row = allStudentMarks[i];
        if (prevMark !== null && row.Marks < prevMark) {
          position += sameRankCount;
          sameRankCount = 1;
        } else {
          sameRankCount++;
        }
        prevMark = row.Marks;
        await db.query(
          `UPDATE srp_marks SET Position = ? WHERE ExamMarksID = ?`,
          [String(position), row.ExamMarksID]
        );
      }
    }

    res.json({ success: true, message: `${marks.length} mark(s) saved successfully.` });
  } catch (err) {
    console.error('[Marks Entry Save Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export { marksEntryRouter };
