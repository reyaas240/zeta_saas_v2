import express from 'express';
import { requireTenantAuth } from './authRouter.js';
import { getTenantDb } from './db.js';

export const newsBoardRouter = express.Router();
newsBoardRouter.use(requireTenantAuth);

async function getDb(req) {
  return getTenantDb(req.tenantContext.schMasterID);
}

function asFlag(value) {
  return value ? 1 : 0;
}

function validDate(value, fieldName, required = true) {
  if (!value && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error(`${fieldName} must be a valid date.`);
  }
  return value;
}

async function canManageNotices(db, context) {
  if (context.isSystemAdmin) return true;
  const [rows] = await db.query(
    `SELECT 1 FROM srp_employeedesignation
     WHERE EmpID = ? AND SchMasterID = ? AND BranchID = ?
       AND DesignationTypeID = 2 AND isActive = 1
     LIMIT 1`,
    [context.userID, context.schMasterID, context.branchID]
  );
  return rows.length > 0;
}

function audienceText(notice) {
  const audiences = [];
  if (notice.isForEmployees) audiences.push('Staff');
  if (notice.isForStudents) audiences.push('Students');
  if (notice.isForParents) audiences.push('Parents');
  return audiences.join(', ') || 'All audiences';
}

function textValue(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data).toString('utf8');
  return value ?? '';
}

function normalizeNotice(notice) {
  return {
    ...notice,
    subject: textValue(notice.subject),
    description: textValue(notice.description),
    audience: audienceText(notice)
  };
}

async function getNoticeList(req) {
  const db = await getDb(req);
  const { schMasterID, branchID } = req.tenantContext;
  const canManage = await canManageNotices(db, req.tenantContext);
  const { date, status = 'active' } = req.query;
  const params = [schMasterID, branchID];
  let where = 'WHERE n.SchMasterID = ? AND n.BranchID = ?';

  if (date) {
    validDate(date, 'Date');
    where += ' AND n.NewsDate = ?';
    params.push(date);
  }
  if (status === 'active') where += ' AND (n.ExpiresOn IS NULL OR n.ExpiresOn >= CURDATE())';
  if (status === 'expired') where += ' AND n.ExpiresOn < CURDATE()';
  if (!['all', 'active', 'expired'].includes(status)) throw new Error('Invalid status filter.');

  // The CI module allowed non-managers to view notices intended for parents.
  if (!canManage) where += ' AND (n.isForParents IS NULL OR n.isForParents = 1)';

  const [notices] = await db.query(
    `SELECT n.NewsBoardID AS id, DATE_FORMAT(n.NewsDate, '%Y-%m-%d') AS newsDate, DATE_FORMAT(n.ExpiresOn, '%Y-%m-%d') AS expiresOn,
            n.isForEmployees AS isForEmployees, n.isForStudents AS isForStudents,
            n.isForParents AS isForParents, n.isSubmited AS isSubmitted,
            FROM_BASE64(n.NewsSubject) AS subject,
            FROM_BASE64(n.NewsDescription) AS description,
            n.NewsAttachment AS coverImage, n.email_used AS emailUsed,
            n.CreatedDate AS createdDate, n.Timestamp AS modifiedDate,
            COALESCE(NULLIF(TRIM(CONCAT(COALESCE(e.Ename1, ''), ' ', COALESCE(e.Ename3, ''))), ''), n.NewsFrom) AS author
     FROM srp_newsboard n
     LEFT JOIN srp_employeesdetails e ON e.EIdNo = n.NewsFrom
       AND e.SchMasterID = n.SchMasterID AND e.BranchID = n.BranchID
     ${where}
     ORDER BY n.NewsDate DESC, n.CreatedDate DESC`,
    params
  );

  return { notices: notices.map(normalizeNotice), canManage };
}

newsBoardRouter.get('/dates', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID } = req.tenantContext;
    const [dates] = await db.query(
      `SELECT DISTINCT DATE_FORMAT(NewsDate, '%Y-%m-%d') AS date FROM srp_newsboard
       WHERE SchMasterID = ? AND BranchID = ? ORDER BY NewsDate DESC`,
      [schMasterID, branchID]
    );
    res.json({ success: true, dates: dates.map(row => row.date) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

newsBoardRouter.get('/', async (req, res) => {
  try {
    res.json({ success: true, ...(await getNoticeList(req)) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

newsBoardRouter.get('/:id', async (req, res) => {
  try {
    const db = await getDb(req);
    const { schMasterID, branchID } = req.tenantContext;
    const [rows] = await db.query(
      `SELECT NewsBoardID AS id, DATE_FORMAT(NewsDate, '%Y-%m-%d') AS newsDate, DATE_FORMAT(ExpiresOn, '%Y-%m-%d') AS expiresOn,
              isForEmployees, isForStudents, isForParents, isSubmited AS isSubmitted,
              FROM_BASE64(NewsSubject) AS subject,
              FROM_BASE64(NewsDescription) AS description,
              NewsAttachment AS coverImage, email_used AS emailUsed
       FROM srp_newsboard WHERE NewsBoardID = ? AND SchMasterID = ? AND BranchID = ?`,
      [req.params.id, schMasterID, branchID]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Notice not found.' });
    res.json({ success: true, notice: normalizeNotice(rows[0]) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

async function saveNotice(req, res, isUpdate) {
  try {
    const db = await getDb(req);
    const context = req.tenantContext;
    if (!(await canManageNotices(db, context))) {
      return res.status(403).json({ success: false, error: 'You do not have permission to manage notices.' });
    }
    const { subject, description, newsDate, expiresOn, isForEmployees, isForStudents, isForParents, isSubmitted, coverImage, emailUsed } = req.body;
    if (!String(subject || '').trim()) return res.status(400).json({ success: false, error: 'Subject is required.' });
    if (!String(description || '').trim()) return res.status(400).json({ success: false, error: 'Description is required.' });
    const safeNewsDate = validDate(newsDate, 'News date');
    const safeExpiresOn = validDate(expiresOn, 'Expiry date', false);
    if (safeExpiresOn && safeExpiresOn < safeNewsDate) return res.status(400).json({ success: false, error: 'Expiry date cannot be before the news date.' });

    const base = [
      safeNewsDate, safeExpiresOn, asFlag(isForEmployees), asFlag(isForParents), asFlag(isForStudents),
      Buffer.from(String(subject).trim()).toString('base64'), Buffer.from(String(description).trim()).toString('base64'),
      asFlag(isSubmitted), String(coverImage || '').trim() || null, asFlag(emailUsed)
    ];
    if (isUpdate) {
      const [result] = await db.query(
        `UPDATE srp_newsboard SET NewsDate = ?, ExpiresOn = ?, isForEmployees = ?, isForParents = ?, isForStudents = ?,
         NewsSubject = ?, NewsDescription = ?, isSubmited = ?, NewsAttachment = ?, email_used = ?,
         ModifiedUserName = ?, Timestamp = NOW(), ModifiedPC = ?
         WHERE NewsBoardID = ? AND SchMasterID = ? AND BranchID = ?`,
        [...base, context.userID, 'ZetaPlus', req.params.id, context.schMasterID, context.branchID]
      );
      if (!result.affectedRows) return res.status(404).json({ success: false, error: 'Notice not found.' });
      return res.json({ success: true, message: 'Notice updated.' });
    }
    const [result] = await db.query(
      `INSERT INTO srp_newsboard
       (NewsDate, ExpiresOn, isForEmployees, isForParents, isForStudents, NewsSubject, NewsDescription,
        isSubmited, NewsAttachment, email_used, NewsFrom, SchMasterID, BranchID, CreatedUserName, CreatedDate, CreatedPC)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [...base, context.userID, context.schMasterID, context.branchID, context.userID, 'ZetaPlus']
    );
    res.status(201).json({ success: true, id: result.insertId, message: 'Notice created.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

newsBoardRouter.post('/', (req, res) => saveNotice(req, res, false));
newsBoardRouter.put('/:id', (req, res) => saveNotice(req, res, true));

newsBoardRouter.delete('/:id', async (req, res) => {
  try {
    const db = await getDb(req);
    const context = req.tenantContext;
    if (!(await canManageNotices(db, context))) {
      return res.status(403).json({ success: false, error: 'You do not have permission to manage notices.' });
    }
    const [result] = await db.query(
      'DELETE FROM srp_newsboard WHERE NewsBoardID = ? AND SchMasterID = ? AND BranchID = ?',
      [req.params.id, context.schMasterID, context.branchID]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, error: 'Notice not found.' });
    res.json({ success: true, message: 'Notice deleted.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});
