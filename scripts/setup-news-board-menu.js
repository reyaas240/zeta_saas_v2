import { getMasterDb } from '../src/db.js';

const db = getMasterDb();

try {
  await db.query(
    `INSERT INTO saas_app_menus (menuKey, menuTitle, parentKey, icon, sortOrder)
     VALUES ('news_board', 'Notice Board', NULL, '📢', 11)
     ON DUPLICATE KEY UPDATE menuTitle = VALUES(menuTitle), icon = VALUES(icon), sortOrder = VALUES(sortOrder)`,
  );
  console.log('Notice Board menu is ready.');
} finally {
  await db.end();
}
