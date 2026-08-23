-- =====================================================
-- ZetaPlus SaaS Platform - Sample Tenant Database Schema
-- =====================================================
-- Run this script to create sample tenant databases 
-- for local development and testing.
-- Creates: zetaplus_cfs (Carmel Convent School)
--          zetaplus_testschool (Test School)
-- =====================================================

-- =====================================================
-- Create CFS tenant database (Carmel Convent School)
-- =====================================================
CREATE DATABASE IF NOT EXISTS zetaplus_cfs 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE zetaplus_cfs;

-- =====================================================
-- Table: srp_schbranches
-- Stores school branch information
-- =====================================================
CREATE TABLE IF NOT EXISTS srp_schbranches (
  BranchID INT AUTO_INCREMENT PRIMARY KEY,
  BranchName VARCHAR(255) NOT NULL,
  BranchCode VARCHAR(50) NOT NULL UNIQUE,
  BranchAddress TEXT,
  BranchPhone VARCHAR(20),
  BranchEmail VARCHAR(100),
  isActive TINYINT(1) DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_branchcode (BranchCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Table: srp_academicyears
-- Stores academic year definitions
-- =====================================================
CREATE TABLE IF NOT EXISTS srp_academicyears (
  AcademicYearID INT AUTO_INCREMENT PRIMARY KEY,
  YearName VARCHAR(50) NOT NULL,
  StartDate DATE NOT NULL,
  EndDate DATE NOT NULL,
  isActive TINYINT(1) DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_active (isActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Table: srp_classes
-- Stores class/grade definitions
-- =====================================================
CREATE TABLE IF NOT EXISTS srp_classes (
  ClassID INT AUTO_INCREMENT PRIMARY KEY,
  ClassName VARCHAR(50) NOT NULL,
  ClassCode VARCHAR(20) NOT NULL UNIQUE,
  AcademicYearID INT,
  BranchID INT,
  isActive TINYINT(1) DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (AcademicYearID) REFERENCES srp_academicyears(AcademicYearID),
  FOREIGN KEY (BranchID) REFERENCES srp_schbranches(BranchID),
  INDEX idx_classcode (ClassCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Table: srp_students
-- Stores student records
-- =====================================================
CREATE TABLE IF NOT EXISTS srp_students (
  StudentID INT AUTO_INCREMENT PRIMARY KEY,
  AdmissionNo VARCHAR(50) NOT NULL UNIQUE,
  FirstName VARCHAR(100) NOT NULL,
  LastName VARCHAR(100),
  DateOfBirth DATE,
  Gender ENUM('Male', 'Female', 'Other'),
  ClassID INT,
  BranchID INT,
  ParentPhone VARCHAR(20),
  ParentEmail VARCHAR(100),
  Address TEXT,
  isActive TINYINT(1) DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ClassID) REFERENCES srp_classes(ClassID),
  FOREIGN KEY (BranchID) REFERENCES srp_schbranches(BranchID),
  INDEX idx_admission (AdmissionNo),
  INDEX idx_student_class (ClassID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Seed Sample Data for CFS
-- =====================================================

-- Insert main branch
INSERT INTO srp_schbranches (BranchName, BranchCode) 
VALUES ('Main Branch', 'MAIN')
ON DUPLICATE KEY UPDATE BranchName = VALUES(BranchName);

-- Insert current academic year
INSERT INTO srp_academicyears (YearName, StartDate, EndDate) 
VALUES ('2024-2025', '2024-04-01', '2025-03-31')
ON DUPLICATE KEY UPDATE YearName = VALUES(YearName);

-- Insert sample classes
INSERT INTO srp_classes (ClassName, ClassCode, BranchID) 
VALUES 
  ('Grade 1', 'G1', 1),
  ('Grade 2', 'G2', 1),
  ('Grade 3', 'G3', 1),
  ('Grade 4', 'G4', 1),
  ('Grade 5', 'G5', 1)
ON DUPLICATE KEY UPDATE ClassName = VALUES(ClassName);

-- Insert sample students
INSERT INTO srp_students (AdmissionNo, FirstName, LastName, DateOfBirth, Gender, ClassID, BranchID, ParentPhone, ParentEmail) 
VALUES 
  ('ADM2024001', 'John', 'Doe', '2015-06-15', 'Male', 1, 1, '9876543210', 'parent1@example.com'),
  ('ADM2024002', 'Jane', 'Smith', '2015-08-20', 'Female', 1, 1, '9876543211', 'parent2@example.com'),
  ('ADM2024003', 'Alice', 'Johnson', '2014-03-10', 'Female', 2, 1, '9876543212', 'parent3@example.com')
ON DUPLICATE KEY UPDATE FirstName = VALUES(FirstName);

SELECT '✅ CFS tenant database (zetaplus_cfs) setup complete!' AS status;
SELECT COUNT(*) AS total_branches FROM srp_schbranches;
SELECT COUNT(*) AS total_classes FROM srp_classes;
SELECT COUNT(*) AS total_students FROM srp_students;
SHOW TABLES;

-- =====================================================
-- Create testschool tenant database (secondary test tenant)
-- =====================================================
CREATE DATABASE IF NOT EXISTS zetaplus_testschool 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE zetaplus_testschool;

-- Recreate tables for testschool (same schema as CFS)
CREATE TABLE IF NOT EXISTS srp_schbranches (
  BranchID INT AUTO_INCREMENT PRIMARY KEY,
  BranchName VARCHAR(255) NOT NULL,
  BranchCode VARCHAR(50) NOT NULL UNIQUE,
  BranchAddress TEXT,
  BranchPhone VARCHAR(20),
  BranchEmail VARCHAR(100),
  isActive TINYINT(1) DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_branchcode (BranchCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS srp_academicyears (
  AcademicYearID INT AUTO_INCREMENT PRIMARY KEY,
  YearName VARCHAR(50) NOT NULL,
  StartDate DATE NOT NULL,
  EndDate DATE NOT NULL,
  isActive TINYINT(1) DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_active (isActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS srp_classes (
  ClassID INT AUTO_INCREMENT PRIMARY KEY,
  ClassName VARCHAR(50) NOT NULL,
  ClassCode VARCHAR(20) NOT NULL UNIQUE,
  AcademicYearID INT,
  BranchID INT,
  isActive TINYINT(1) DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (AcademicYearID) REFERENCES srp_academicyears(AcademicYearID),
  FOREIGN KEY (BranchID) REFERENCES srp_schbranches(BranchID),
  INDEX idx_classcode (ClassCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS srp_students (
  StudentID INT AUTO_INCREMENT PRIMARY KEY,
  AdmissionNo VARCHAR(50) NOT NULL UNIQUE,
  FirstName VARCHAR(100) NOT NULL,
  LastName VARCHAR(100),
  DateOfBirth DATE,
  Gender ENUM('Male', 'Female', 'Other'),
  ClassID INT,
  BranchID INT,
  ParentPhone VARCHAR(20),
  ParentEmail VARCHAR(100),
  Address TEXT,
  isActive TINYINT(1) DEFAULT 1,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ClassID) REFERENCES srp_classes(ClassID),
  FOREIGN KEY (BranchID) REFERENCES srp_schbranches(BranchID),
  INDEX idx_admission (AdmissionNo),
  INDEX idx_student_class (ClassID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Sample Data for testschool
INSERT INTO srp_schbranches (BranchName, BranchCode) 
VALUES ('Main Branch', 'MAIN')
ON DUPLICATE KEY UPDATE BranchName = VALUES(BranchName);

INSERT INTO srp_academicyears (YearName, StartDate, EndDate) 
VALUES ('2024-2025', '2024-04-01', '2025-03-31')
ON DUPLICATE KEY UPDATE YearName = VALUES(YearName);

INSERT INTO srp_classes (ClassName, ClassCode, BranchID) 
VALUES 
  ('Grade 1', 'G1', 1),
  ('Grade 2', 'G2', 1),
  ('Grade 3', 'G3', 1)
ON DUPLICATE KEY UPDATE ClassName = VALUES(ClassName);

INSERT INTO srp_students (AdmissionNo, FirstName, LastName, DateOfBirth, Gender, ClassID, BranchID, ParentPhone, ParentEmail) 
VALUES 
  ('ADM2024001', 'Test', 'Student', '2015-06-15', 'Male', 1, 1, '9876543210', 'test@example.com')
ON DUPLICATE KEY UPDATE FirstName = VALUES(FirstName);

SELECT '✅ testschool tenant database (zetaplus_testschool) setup complete!' AS status;
