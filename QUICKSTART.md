# Quick Start - Local Development Setup

## Prerequisites
- Node.js v18+
- MySQL Server running on localhost:3306

## 1. Update `.env` File

Edit the `.env` file with your MySQL credentials:

```bash
MASTER_DB_HOST=localhost
MASTER_DB_PORT=3306
MASTER_DB_USER=root              # Change to your MySQL username
MASTER_DB_PASSWORD=your_password # Change to your MySQL password
MASTER_DB_NAME=zetaplus_maindb

JWT_SECRET=super_secret_zetapro_saas_key_2026
PORT=3000
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Setup Databases

### Option A: Using MySQL Command Line (Recommended)

```bash
# Setup master database
mysql -u root -p < scripts/setup-master-db.sql

# Setup sample tenant database
mysql -u root -p < scripts/setup-tenant-db.sql
```

### Option B: Using MySQL Workbench or phpMyAdmin

1. Open `scripts/setup-master-db.sql` and execute it
2. Open `scripts/setup-tenant-db.sql` and execute it

## 4. Test Database Connection

```bash
npm run test:db
```

Expected output should show:
- ✅ Master DB connection successful
- ✅ Tenant DB resolution working
- ✅ Sample data loaded

## 5. Start the Application

```bash
# Development mode (with auto-reload)
npm run dev

# Or production mode
npm start
```

Visit: http://localhost:3000

---

## What's Created?

### Master Database (`zetaplus_maindb`)
- `srp_schoolmaster` - Tenant school metadata
- `saas_app_menus` - Application menus for RBAC
- `saas_user_menu_rights` - User-menu permissions
- 1 sample school: "Test School" (SchShortCode: testschool)

### Tenant Database (`zetaplus_testschool`)
- `srp_schbranches` - School branches
- `srp_academicyears` - Academic years
- `srp_classes` - Classes/Grades
- `srp_students` - Student records
- Sample data: 1 branch, 5 classes, 3 students

---

## Adding More Schools (Tenants)

To add another school tenant:

```sql
-- In zetaplus_maindb
INSERT INTO srp_schoolmaster (SchNameEn, SchShortCode) 
VALUES ('Cambridge International School', 'cis');

-- Create tenant database
CREATE DATABASE zetaplus_cis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Run setup-tenant-db.sql on the new database (adjust DB name)
```

The system will automatically resolve `cis` → `zetaplus_cis`.

---

## Troubleshooting

**Connection refused?**
```bash
# Check if MySQL is running
sudo systemctl status mysql  # Linux
# or open MySQL Workbench (Windows/Mac)
```

**Access denied?**
```sql
-- Grant privileges
GRANT ALL PRIVILEGES ON zetaplus_maindb.* TO 'root'@'localhost';
GRANT SELECT ON information_schema.SCHEMATA TO 'root'@'localhost';
FLUSH PRIVILEGES;
```

**Tenant DB not found?**
```sql
SHOW DATABASES LIKE 'zetaplus%';
-- Ensure zetaplus_testschool exists
```

For detailed instructions, see [LOCAL_SETUP_GUIDE.md](./LOCAL_SETUP_GUIDE.md)
