-- =====================================================
-- ZetaPlus SaaS Platform - Master Database Setup Script
-- =====================================================
-- Run this script to initialize the master database (zetaplus_maindb)
-- with all required tables for multi-tenant architecture.
-- =====================================================

-- Create master database if not exists
CREATE DATABASE IF NOT EXISTS zetaplus_maindb 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE zetaplus_maindb;

-- =====================================================
-- Table: srp_schoolmaster
-- Stores tenant school metadata and DB connection info
-- =====================================================
CREATE TABLE IF NOT EXISTS srp_schoolmaster (
  SchMasterID INT AUTO_INCREMENT PRIMARY KEY,
  SchNameEn VARCHAR(255) NOT NULL,
  SchNameOther VARCHAR(255),
  SchShortCode VARCHAR(20) NOT NULL UNIQUE,
  host VARCHAR(255) DEFAULT 'localhost',
  db_name VARCHAR(255),
  db_username VARCHAR(100),
  db_password VARCHAR(255),
  SchLogo VARCHAR(500),
  SecondarySchLogo VARCHAR(500),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shortcode (SchShortCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Table: saas_app_menus
-- Stores application menu items for RBAC
-- =====================================================
CREATE TABLE IF NOT EXISTS saas_app_menus (
  menuID INT AUTO_INCREMENT PRIMARY KEY,
  menuKey VARCHAR(50) NOT NULL UNIQUE,
  menuTitle VARCHAR(100) NOT NULL,
  parentKey VARCHAR(50) NULL,
  icon VARCHAR(50) NOT NULL,
  sortOrder INT DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_parent (parentKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Table: saas_user_menu_rights
-- Stores user-menu access permissions
-- =====================================================
CREATE TABLE IF NOT EXISTS saas_user_menu_rights (
  rightID INT AUTO_INCREMENT PRIMARY KEY,
  userID INT NOT NULL,
  menuKey VARCHAR(50) NOT NULL,
  hasAccess TINYINT(1) DEFAULT 1,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_menu (userID, menuKey),
  INDEX idx_userID (userID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Seed Default Application Menus
-- =====================================================
INSERT INTO saas_app_menus (menuKey, menuTitle, parentKey, icon, sortOrder) VALUES
  ('dashboard', 'Dashboard', NULL, '📊', 1),
  ('dashboard_exam', 'Exam Analytics', 'dashboard', '📝', 2),
  ('dashboard_fee', 'Fee Analytics', 'dashboard', '💳', 3),
  ('dashboard_attendance', 'Attendance Analytics', 'dashboard', '📅', 4),
  ('students', 'Students', NULL, '👨‍🎓', 5),
  ('staff', 'Staff & Faculty', NULL, '👩‍🏫', 6),
  ('timetable', 'Timetable & Exams', NULL, '📅', 7),
  ('fees', 'Fees & Billing', NULL, '💳', 8),
  ('settings', 'Settings', NULL, '⚙️', 9),
  ('news_board', 'Notice Board', NULL, '📢', 11)
ON DUPLICATE KEY UPDATE 
  menuTitle = VALUES(menuTitle),
  parentKey = VALUES(parentKey),
  icon = VALUES(icon),
  sortOrder = VALUES(sortOrder);

-- =====================================================
-- Insert Sample Test School Tenant (CFS)
-- =====================================================
-- This creates a test school for local development
-- The tenant database will be resolved dynamically as 'zetaplus_cfs'
-- =====================================================
INSERT INTO srp_schoolmaster (SchNameEn, SchShortCode, host, db_name, db_username, db_password)
VALUES (
  'Carmel Convent School',
  'cfs',
  '127.0.0.1',
  NULL,  -- Will resolve to 'zetaplus_cfs' automatically
  NULL,  -- Will use TENANT_DB_USER from .env (zetaplususer)
  NULL   -- Will use TENANT_DB_PASSWORD from .env
)
ON DUPLICATE KEY UPDATE 
  SchNameEn = VALUES(SchNameEn),
  host = VALUES(host);

-- =====================================================
-- Insert Secondary Test School (for multi-tenant testing)
-- =====================================================
INSERT INTO srp_schoolmaster (SchNameEn, SchShortCode, host, db_name, db_username, db_password)
VALUES (
  'Test School',
  'testschool',
  '127.0.0.1',
  NULL,  -- Will resolve to 'zetaplus_testschool' automatically
  NULL,  -- Will use TENANT_DB_USER from .env
  NULL   -- Will use TENANT_DB_PASSWORD from .env
)
ON DUPLICATE KEY UPDATE 
  SchNameEn = VALUES(SchNameEn),
  host = VALUES(host);

-- =====================================================
-- Display setup summary
-- =====================================================
SELECT '✅ Master database setup complete!' AS status;
SELECT COUNT(*) AS total_schools FROM srp_schoolmaster;
SELECT COUNT(*) AS total_menus FROM saas_app_menus;

SHOW TABLES;
