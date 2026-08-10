import { getMasterDb } from '../src/db.js';

async function setupRbacTables() {
  console.log('=== Setting up RBAC Tables in zetaplus_maindb ===\n');

  try {
    const db = getMasterDb();

    // 1. Create saas_app_menus table
    console.log('1. Creating saas_app_menus table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS saas_app_menus (
        menuID INT AUTO_INCREMENT PRIMARY KEY,
        menuKey VARCHAR(50) NOT NULL UNIQUE,
        menuTitle VARCHAR(100) NOT NULL,
        parentKey VARCHAR(50) NULL,
        icon VARCHAR(50) NOT NULL,
        sortOrder INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Create saas_user_menu_rights table
    console.log('2. Creating saas_user_menu_rights table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS saas_user_menu_rights (
        rightID INT AUTO_INCREMENT PRIMARY KEY,
        userID INT NOT NULL,
        menuKey VARCHAR(50) NOT NULL,
        hasAccess TINYINT(1) DEFAULT 1,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_menu (userID, menuKey)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Seed default menus
    console.log('3. Seeding default menus...');
    const defaultMenus = [
      { menuKey: 'dashboard', menuTitle: 'Dashboard', parentKey: null, icon: '📊', sortOrder: 1 },
      { menuKey: 'dashboard_exam', menuTitle: 'Exam Analytics', parentKey: 'dashboard', icon: '📝', sortOrder: 2 },
      { menuKey: 'dashboard_fee', menuTitle: 'Fee Analytics', parentKey: 'dashboard', icon: '💳', sortOrder: 3 },
      { menuKey: 'dashboard_attendance', menuTitle: 'Attendance Analytics', parentKey: 'dashboard', icon: '📅', sortOrder: 4 },
      { menuKey: 'students', menuTitle: 'Students', parentKey: null, icon: '👨‍🎓', sortOrder: 5 },
      { menuKey: 'staff', menuTitle: 'Staff & Faculty', parentKey: null, icon: '👩‍🏫', sortOrder: 6 },
      { menuKey: 'timetable', menuTitle: 'Timetable & Exams', parentKey: null, icon: '📅', sortOrder: 7 },
      { menuKey: 'fees', menuTitle: 'Fees & Billing', parentKey: null, icon: '💳', sortOrder: 8 },
      { menuKey: 'settings', menuTitle: 'Settings', parentKey: null, icon: '⚙️', sortOrder: 9 }
    ];

    for (const m of defaultMenus) {
      await db.query(`
        INSERT INTO saas_app_menus (menuKey, menuTitle, parentKey, icon, sortOrder)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          menuTitle = VALUES(menuTitle),
          parentKey = VALUES(parentKey),
          icon = VALUES(icon),
          sortOrder = VALUES(sortOrder);
      `, [m.menuKey, m.menuTitle, m.parentKey, m.icon, m.sortOrder]);
    }

    console.log('\n✅ RBAC Tables setup and seeded successfully!');
  } catch (err) {
    console.error('\n❌ RBAC setup failed:', err.message);
    console.error(err);
  } finally {
    process.exit(0);
  }
}

setupRbacTables();
