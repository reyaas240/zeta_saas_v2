import express from 'express';
import { getMasterDb, getTenantDb } from './db.js';
import { requireTenantAuth } from './authRouter.js';
import { getAllMenus, saveUserMenuRights } from './rbacUtil.js';

export const adminRouter = express.Router();

// Middleware to ensure user is System Admin
function requireSystemAdmin(req, res, next) {
  if (!req.tenantContext || !req.tenantContext.isSystemAdmin) {
    return res.status(403).json({ success: false, error: 'Access denied. System Administrator privileges required.' });
  }
  next();
}

adminRouter.use(requireTenantAuth, requireSystemAdmin);

/**
 * List all users under the school/master DB, filtered by logged-in user's school.
 * Employee names are fetched from the tenant DB's srp_employeesdetails table,
 * linked via EidNo (user.empID) <-> srp_employeesdetails.empID.
 */
adminRouter.get('/users', async (req, res) => {
  try {
    const masterDb = getMasterDb();

    // Fetch users from master DB for the current school only
    const [users] = await masterDb.query(
      `SELECT EidNo, empID, Username, email, isSystemAdmin, schMasterID, branchID
       FROM user
       WHERE schMasterID = ?
       ORDER BY EidNo ASC`,
      [req.tenantContext.schMasterID]
    );

    // Fetch employee names from tenant DB
    // Link: user.empID (maindb) <-> srp_employeesdetails.EIdNo (tenant db)
    let enrichedUsers = [];
    try {
      const tenantDb = await getTenantDb(req.tenantContext.schMasterID);
      const [empRows] = await tenantDb.query('SELECT EIdNo, Ename1, isLeft FROM srp_employeesdetails');
      // Map: EIdNo -> { Ename1, isLeft }
      const empMap = new Map(empRows.map(r => [r.EIdNo, { name: r.Ename1, isLeft: r.isLeft }]));

      enrichedUsers = users
        .filter(u => {
          const emp = empMap.get(u.empID);
          // Include user only if they have an active employee record (isLeft = 0 or null)
          return emp && (emp.isLeft === 0 || emp.isLeft === null || emp.isLeft === '0');
        })
        .map(u => ({
          userID: u.EidNo,
          username: u.Username,
          email: u.email,
          isSystemAdmin: Boolean(u.isSystemAdmin),
          schMasterID: u.schMasterID,
          branchID: u.branchID,
          employeeName: empMap.get(u.empID)?.name || u.Username
        }));
    } catch (tenantErr) {
      console.warn('[Admin API warning] Tenant DB fetch failed, returning users without employee names:', tenantErr.message);
      enrichedUsers = users.map(u => ({
        userID: u.EidNo,
        username: u.Username,
        email: u.email,
        isSystemAdmin: Boolean(u.isSystemAdmin),
        schMasterID: u.schMasterID,
        branchID: u.branchID,
        employeeName: u.Username
      }));
    }

    res.json({ success: true, users: enrichedUsers });
  } catch (err) {
    console.error('[Admin API error]:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch users.' });
  }
});

/**
 * Get all available menus and current access rights for a specific user
 */
adminRouter.get('/user-rights/:userID', async (req, res) => {
  try {
    const targetUserID = parseInt(req.params.userID, 10);
    const db = getMasterDb();

    const [userRows] = await db.query('SELECT EidNo, Username, isSystemAdmin FROM user WHERE EidNo = ?', [targetUserID]);
    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    const targetUser = userRows[0];

    const allMenus = await getAllMenus();
    const [rights] = await db.query('SELECT menuKey, hasAccess FROM saas_user_menu_rights WHERE userID = ?', [targetUserID]);

    const rightsMap = new Map(rights.map(r => [r.menuKey, Boolean(r.hasAccess)]));

    const menusWithStatus = allMenus.map(m => ({
      menuKey: m.menuKey,
      menuTitle: m.menuTitle,
      parentKey: m.parentKey,
      icon: m.icon,
      hasAccess: rightsMap.has(m.menuKey) ? rightsMap.get(m.menuKey) : true
    }));

    res.json({
      success: true,
      user: {
        userID: targetUser.EidNo,
        username: targetUser.Username,
  
        isSystemAdmin: Boolean(targetUser.isSystemAdmin)
      },
      menus: menusWithStatus
    });
  } catch (err) {
    console.error('[Admin API error]:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch user rights.' });
  }
});

/**
 * Save user menu access rights
 */
adminRouter.post('/user-rights/:userID', async (req, res) => {
  try {
    const targetUserID = parseInt(req.params.userID, 10);
    const { menuRights } = req.body;

    if (!menuRights || typeof menuRights !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid menuRights payload.' });
    }

    await saveUserMenuRights(targetUserID, menuRights);

    res.json({ success: true, message: 'User menu rights updated successfully.' });
  } catch (err) {
    console.error('[Admin API error]:', err);
    res.status(500).json({ success: false, error: 'Failed to save user menu rights.' });
  }
});
