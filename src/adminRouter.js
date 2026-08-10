import express from 'express';
import { getMasterDb } from './db.js';
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
 * List all users under the school/master DB
 */
adminRouter.get('/users', async (req, res) => {
  try {
    const db = getMasterDb();
    const [users] = await db.query(
      `SELECT EidNo, Username, email, isSystemAdmin, schMasterID, branchID 
       FROM user 
       WHERE schMasterID = ? OR isSystemAdmin = 1 
       ORDER BY EidNo ASC`,
      [req.tenantContext.schMasterID]
    );

    res.json({
      success: true,
      users: users.map(u => ({
        userID: u.EidNo,
        username: u.Username,
        email: u.email,
        isSystemAdmin: Boolean(u.isSystemAdmin),
        schMasterID: u.schMasterID
      }))
    });
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

    // Fetch user info
    const [userRows] = await db.query(`SELECT EidNo, Username, isSystemAdmin FROM user WHERE EidNo = ?`, [targetUserID]);
    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    const targetUser = userRows[0];

    const allMenus = await getAllMenus();
    const [rights] = await db.query(`SELECT menuKey, hasAccess FROM saas_user_menu_rights WHERE userID = ?`, [targetUserID]);
    
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
    const { menuRights } = req.body; // e.g. { dashboard_exam: true, dashboard_fee: false }

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
