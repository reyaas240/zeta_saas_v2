import { getMasterDb } from './db.js';

/**
 * Fetch all available app menus from saas_app_menus
 */
export async function getAllMenus() {
  const db = getMasterDb();
  const [rows] = await db.query(
    `SELECT menuID, menuKey, menuTitle, parentKey, icon, sortOrder 
     FROM saas_app_menus 
     ORDER BY sortOrder ASC`
  );
  return rows;
}

/**
 * Fetch permitted menu keys for a given user (by EidNo).
 * If user isSystemAdmin, returns all menu keys.
 * Otherwise returns menuKeys where hasAccess = 1 (or defaults to all if user rights not configured).
 */
export async function getUserAllowedMenus(userID, isSystemAdmin) {
  const allMenus = await getAllMenus();
  
  if (isSystemAdmin) {
    return allMenus.map(m => m.menuKey);
  }

  const db = getMasterDb();
  const [rights] = await db.query(
    `SELECT menuKey, hasAccess FROM saas_user_menu_rights WHERE userID = ?`,
    [userID]
  );

  // If no custom rights defined yet for user, default to all menus enabled
  if (!rights || rights.length === 0) {
    return allMenus.map(m => m.menuKey);
  }

  const rightsMap = new Map(rights.map(r => [r.menuKey, Boolean(r.hasAccess)]));
  
  return allMenus
    .filter(m => rightsMap.has(m.menuKey) ? rightsMap.get(m.menuKey) : true)
    .map(m => m.menuKey);
}

/**
 * Save user menu rights overrides
 */
export async function saveUserMenuRights(targetUserID, menuRightsMap) {
  const db = getMasterDb();
  
  for (const [menuKey, hasAccess] of Object.entries(menuRightsMap)) {
    await db.query(`
      INSERT INTO saas_user_menu_rights (userID, menuKey, hasAccess)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE hasAccess = VALUES(hasAccess)
    `, [targetUserID, menuKey, hasAccess ? 1 : 0]);
  }
}
