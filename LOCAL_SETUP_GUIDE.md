# 🚀 Local Development Setup Guide

## Multi-Tenant Architecture with MySQL on localhost:3306

This guide explains how to run the **ZetaPlus SaaS Platform** locally using your existing MySQL databases:
- **Master DB**: `zetaplus_maindb` (tenant metadata)
- **Tenant DB**: `zetaplus_cfs` (Carmel Convent School - primary test tenant)

---

## ✅ Prerequisites

1. **MySQL Server** running on `localhost:3306`
2. **Node.js 18+** installed
3. **Databases already created**:
   - `zetaplus_maindb` (master database)
   - `zetaplus_cfs` (tenant database for CFS school)

---

## 🔧 Configuration

### 1. Environment Variables (.env)

The `.env` file has been configured for your local setup:

```env
MASTER_DB_HOST=127.0.0.1
MASTER_DB_PORT=3306
MASTER_DB_USER=zetaplususer
MASTER_DB_PASSWORD=Wire2010!*
MASTER_DB_NAME=zetaplus_maindb

JWT_SECRET=super_secret_zetapro_saas_key_2026
PORT=3000

# Tenant Database Configuration (for multi-tenant architecture)
TENANT_DB_HOST=127.0.0.1
TENANT_DB_PORT=3306
TENANT_DB_USER=zetaplususer
TENANT_DB_PASSWORD=Wire2010!*
```

> **Note**: We use `127.0.0.1` instead of `localhost` to force TCP connection instead of Unix socket.

---

## 📦 Installation Steps

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Initialize Master Database

Run the master database setup script to create required tables and seed data:

```bash
mysql -u zetaplususer -p'Wire2010!*' -h 127.0.0.1 zetaplus_maindb < scripts/setup-master-db.sql
```

This will:
- Create `srp_schoolmaster` table (tenant metadata)
- Create `saas_app_menus` table (RBAC menus)
- Create `saas_user_menu_rights` table (permissions)
- Seed default application menus
- Register two test tenants:
  - **CFS** (Carmel Convent School) → resolves to `zetaplus_cfs`
  - **testschool** → resolves to `zetaplus_testschool`

### Step 3: Initialize Tenant Databases

Create the tenant databases with sample data:

```bash
mysql -u zetaplususer -p'Wire2010!*' -h 127.0.0.1 < scripts/setup-tenant-db.sql
```

This will:
- Create `zetaplus_cfs` database (Carmel Convent School)
- Create `zetaplus_testschool` database (Test School)
- Seed sample branches, academic years, classes, and students

---

## 🏗️ Multi-Tenant Architecture Explained

### How It Works

```
┌─────────────────────────────────────────────────────┐
│              ZetaPlus Application                    │
│                   (localhost:3000)                   │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│  Master DB      │   │  Tenant DBs     │
│  zetaplus_maindb│   │  zetaplus_cfs   │
│                 │   │  zetaplus_...   │
│ - srp_schoolmaster  │ - srp_students    │
│ - saas_app_menus     │ - srp_classes     │
│ - permissions        │ - ...            │
└─────────────────┘   └─────────────────┘
```

### Tenant Resolution Flow

1. **Request arrives** with `schMasterID` (e.g., from JWT token)
2. **Query master DB** (`srp_schoolmaster`) to get tenant metadata
3. **Resolve database name** using `SchShortCode`:
   - `cfs` → `zetaplus_cfs`
   - `testschool` → `zetaplus_testschool`
4. **Create connection pool** to tenant database
5. **Cache pool** for subsequent requests (with idle eviction)

### Dynamic Database Resolution

The system automatically resolves tenant databases by matching patterns:

1. `zetaplus_{shortcode}` (e.g., `zetaplus_cfs`)
2. `zetaplus_{shortcode}db` (e.g., `zetaplus_cfsdb`)
3. Any database containing the shortcode
4. Fallback: `zetaplus_schooldb`

---

## ▶️ Running the Application

### Start the Server

```bash
npm start
```

Or in development mode with hot reload:

```bash
npm run dev
```

The server will start on **http://localhost:3000**

---

## 🧪 Testing the Setup

### Verify Master Database

```bash
mysql -u zetaplususer -p'Wire2010!*' -h 127.0.0.1 zetaplus_maindb -e "SELECT * FROM srp_schoolmaster;"
```

Expected output:
```
+-------------+---------------------+--------------+----------+
| SchMasterID | SchNameEn          | SchShortCode | host     |
+-------------+---------------------+--------------+----------+
|           1 | Carmel Convent School | cfs        | 127.0.0.1|
|           2 | Test School         | testschool | 127.0.0.1|
+-------------+---------------------+--------------+----------+
```

### Verify Tenant Database

```bash
mysql -u zetaplususer -p'Wire2010!*' -h 127.0.0.1 zetaplus_cfs -e "SHOW TABLES; SELECT COUNT(*) AS student_count FROM srp_students;"
```

### Test API Endpoints

```bash
# Health check
curl http://localhost:3000/api/health

# Get school info (requires authentication)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3000/api/school/profile
```

---

## 🔍 Troubleshooting

### Connection Issues

**Problem**: `Can't connect to local server through socket`

**Solution**: Use `127.0.0.1` instead of `localhost` (already configured in `.env`)

```bash
# Wrong
mysql -u user -p -h localhost

# Correct
mysql -u user -p -h 127.0.0.1
```

### Permission Denied

**Problem**: `Access denied for user 'zetaplususer'@'localhost'`

**Solution**: Grant proper permissions:

```sql
-- Run as root in MySQL
GRANT ALL PRIVILEGES ON zetaplus_maindb.* TO 'zetaplususer'@'127.0.0.1';
GRANT ALL PRIVILEGES ON zetaplus_cfs.* TO 'zetaplususer'@'127.0.0.1';
GRANT ALL PRIVILEGES ON zetaplus_testschool.* TO 'zetaplususer'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### Database Not Found

**Problem**: `Unknown database 'zetaplus_cfs'`

**Solution**: Ensure tenant database exists:

```bash
mysql -u zetaplususer -p'Wire2010!*' -h 127.0.0.1 -e "CREATE DATABASE IF NOT EXISTS zetaplus_cfs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

---

## 🏫 Adding New Tenants

To add a new school tenant:

### 1. Insert Record in Master DB

```sql
INSERT INTO srp_schoolmaster (SchNameEn, SchShortCode, host)
VALUES ('New School', 'newschool', '127.0.0.1');
```

### 2. Create Tenant Database

```bash
mysql -u zetaplususer -p'Wire2010!*' -h 127.0.0.1 -e "CREATE DATABASE zetaplus_newschool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 3. Initialize Schema

```bash
mysql -u zetaplususer -p'Wire2010!*' -h 127.0.0.1 zetaplus_newschool < scripts/setup-tenant-db.sql
```

The application will automatically detect and connect to the new tenant database!

---

## 📝 Next Steps

1. **Set up RBAC**: Run `npm run setup:rbac` to initialize role-based access control
2. **Create admin user**: Add initial admin credentials to the system
3. **Configure frontend**: Point your React/Vue frontend to `http://localhost:3000`
4. **Start developing**: Build features for your multi-tenant SaaS platform!

---

## 📚 Additional Resources

- [Multi-Tenant Architecture Best Practices](https://docs.microsoft.com/en-us/azure/architecture/multitenant/)
- [MySQL Connection Pooling](https://github.com/sidorares/node-mysql2#using-pools)
- [Express.js Security Guidelines](https://expressjs.com/en/advanced/best-practice-security.html)

---

**Happy Coding! 🎉**
