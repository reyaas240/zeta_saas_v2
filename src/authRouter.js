import express from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { getMasterDb, getTenantDb, getSchoolTenantInfo } from './db.js';
import { verifyPassword } from './passwordUtil.js';
import { getUserAllowedMenus, getAllMenus } from './rbacUtil.js';
import config from './config.js';

export const authRouter = express.Router();

// Middleware to authenticate JWT cookie and attach tenant context
export function requireTenantAuth(req, res, next) {
  const token = req.cookies.tenant_session;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. No session found.' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.tenantContext = decoded; // { userID, username, schMasterID, branchID, syllabusID, academicYear }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session token.' });
  }
}

/**
 * Step 3: Login Endpoint (/api/auth/login)
 * Implements 11-step authentication & tenant scoping flow
 */
authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    const masterDb = getMasterDb();

    // 2. Look up user in zetaplus_maindb.user by Username
    const [userRows] = await masterDb.query(
      `SELECT EidNo, Username, Password, schMasterID, branchID, isSystemAdmin, empID 
       FROM user 
       WHERE Username = ? 
       LIMIT 1`,
      [username]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const user = userRows[0];

    // 3. Verify password read-only
    const isPasswordValid = verifyPassword(password, user.Password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    // 4. Take schMasterID & branchID from user row
    const schMasterID = user.schMasterID;
    let branchID = user.branchID;

    // 5. Query zetaplus_maindb.srp_schoolmaster for school branding & metadata
    const schoolInfo = await getSchoolTenantInfo(schMasterID);
    if (!schoolInfo) {
      return res.status(404).json({ success: false, error: 'School metadata not found.' });
    }

    // 6. Open / get pooled connection to TENANT database
    const tenantDb = await getTenantDb(schMasterID);

    // 7. Query srp_schbranches in TENANT DB for available branches
    let [branches] = await tenantDb.query(
      `SELECT branchID, BranchDes, BranchShortCode, Address1 
       FROM srp_schbranches 
       WHERE schMasterID = ?`,
      [schMasterID]
    );

    // Fallback: If tenant DB srp_schbranches rows do not match schMasterID = 10 filter, query all branches in tenant DB
    if (!branches || branches.length === 0) {
      [branches] = await tenantDb.query(
        `SELECT branchID, BranchDes, BranchShortCode, Address1 FROM srp_schbranches`
      );
    }

    if (!branches || branches.length === 0) {
      return res.status(400).json({ success: false, error: 'No active branches found for this school.' });
    }

    // If initial user branchID isn't valid in branches list, default to first available branch
    const availableBranchIDs = branches.map(b => b.branchID);
    if (!branchID || !availableBranchIDs.includes(branchID)) {
      branchID = branches[0].branchID;
    }

    // 8. Query srp_syllabusmaster WHERE SchMasterID & BranchID
    const [syllabuses] = await tenantDb.query(
      `SELECT SyllabusID, SyllabusDescription 
       FROM srp_syllabusmaster 
       WHERE SchMasterID = ? AND BranchID = ?`,
      [schMasterID, branchID]
    );

    const currentSyllabusID = syllabuses.length > 0 ? syllabuses[0].SyllabusID : null;

    // 9. Query srp_academicdetails (ActiveAY = 1) and join srp_academicyearmaster
    const [academicRows] = await tenantDb.query(
      `SELECT ad.AcademicYear, ay.AY_AutoID, ay.AY_Description 
       FROM srp_academicdetails ad
       LEFT JOIN srp_academicyearmaster ay ON ay.AY_AutoID = ad.AcademicYear
       WHERE ad.SchMasterId = ? AND ad.BranchID = ? AND ad.ActiveAY = 1 AND ad.isDeleted = 0
       LIMIT 1`,
      [schMasterID, branchID]
    );

    let activeAcademicYearId = null;
    let activeAcademicYearDes = 'Academic Year Not Configured';

    if (academicRows && academicRows.length > 0) {
      activeAcademicYearId = academicRows[0].AcademicYear;
      activeAcademicYearDes = academicRows[0].AY_Description || `Academic Year (${academicRows[0].AcademicYear})`;
    }

    // Fetch permitted menus for user
    const userMenus = await getUserAllowedMenus(user.EidNo, Boolean(user.isSystemAdmin));

    // 10. Establish server session via HTTP-only cookie
    const tokenPayload = {
      userID: user.EidNo,
      empID: user.empID,
      username: user.Username,
      schMasterID,
      branchID,
      syllabusID: currentSyllabusID,
      academicYear: activeAcademicYearId,
      isSystemAdmin: Boolean(user.isSystemAdmin)
    };

    const token = jwt.sign(tokenPayload, config.jwtSecret, { 
      expiresIn: config.jwtExpiresIn 
    });

    res.cookie('tenant_session', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: config.jwtCookieMaxAge
    });

    // 11. Return payload to frontend (NO raw DB credentials)
    res.json({
      success: true,
      platform: 'ZetaPlus School SaaS',
      user: {
        userID: user.EidNo,
        empID: user.empID,
        username: user.Username,
        isSystemAdmin: Boolean(user.isSystemAdmin)
      },
      userMenus,
      school: {
        schMasterID: schoolInfo.SchMasterID,
        schNameEn: schoolInfo.SchNameEn,
        schNameOther: schoolInfo.SchNameOther,
        schShortCode: schoolInfo.SchShortCode,
        schLogo: schoolInfo.SchLogo,
        secondarySchLogo: schoolInfo.SecondarySchLogo
      },
      context: {
        branchID,
        syllabusID: currentSyllabusID,
        academicYear: activeAcademicYearId,
        academicYearDes: activeAcademicYearDes
      },
      branches: branches.map(b => ({
        branchID: b.branchID,
        branchDes: b.BranchDes,
        branchShortCode: b.BranchShortCode,
        address: b.Address1
      })),
      syllabuses: syllabuses.map(s => ({
        syllabusID: s.SyllabusID,
        serviceName: s.SyllabusDescription
      }))
    });

  } catch (err) {
    console.error('[Login Flow Error]:', err);
    res.status(500).json({ success: false, error: 'Authentication failed due to internal error.' });
  }
});

/**
 * Get active session context (/api/auth/me)
 */
authRouter.get('/me', requireTenantAuth, async (req, res) => {
  try {
    const { schMasterID, branchID, syllabusID } = req.tenantContext;

    const schoolInfo = await getSchoolTenantInfo(schMasterID);
    const tenantDb = await getTenantDb(schMasterID);

    let [branches] = await tenantDb.query(
      `SELECT branchID, BranchDes, BranchShortCode, Address1 FROM srp_schbranches WHERE schMasterID = ?`,
      [schMasterID]
    );
    // Fallback: If tenant DB srp_schbranches rows do not match schMasterID = 10 filter, query all branches in tenant DB
    if (!branches || branches.length === 0) {
      [branches] = await tenantDb.query(
        `SELECT branchID, BranchDes, BranchShortCode, Address1 FROM srp_schbranches`
      );
    }

    const [syllabuses] = await tenantDb.query(
      `SELECT SyllabusID, SyllabusDescription FROM srp_syllabusmaster WHERE SchMasterID = ? AND BranchID = ?`,
      [schMasterID, branchID]
    );

    const [academicRows] = await tenantDb.query(
      `SELECT ad.AcademicYear, ay.AY_Description 
       FROM srp_academicdetails ad
       LEFT JOIN srp_academicyearmaster ay ON ay.AY_AutoID = ad.AcademicYear
       WHERE ad.SchMasterId = ? AND ad.BranchID = ? AND ad.ActiveAY = 1 AND ad.isDeleted = 0
       LIMIT 1`,
      [schMasterID, branchID]
    );

    const activeAcademicYearDes = academicRows.length > 0 ? (academicRows[0].AY_Description || `Academic Year (${academicRows[0].AcademicYear})`) : 'Academic Year Not Configured';

    const userMenus = await getUserAllowedMenus(req.tenantContext.userID, Boolean(req.tenantContext.isSystemAdmin));
    const allMenus = await getAllMenus();

    res.json({
      success: true,
      user: {
        userID: req.tenantContext.userID,
        empID: req.tenantContext.empID,
        username: req.tenantContext.username,
        isSystemAdmin: Boolean(req.tenantContext.isSystemAdmin)
      },
      userMenus,
      allMenus,
      school: {
        schMasterID: schoolInfo.SchMasterID,
        schNameEn: schoolInfo.SchNameEn,
        schNameOther: schoolInfo.SchNameOther,
        schShortCode: schoolInfo.SchShortCode,
        schLogo: schoolInfo.SchLogo,
        secondarySchLogo: schoolInfo.SecondarySchLogo
      },
      context: {
        branchID,
        syllabusID,
        academicYear: req.tenantContext.academicYear,
        academicYearDes: activeAcademicYearDes
      },
      branches: branches.map(b => ({
        branchID: b.branchID,
        branchDes: b.BranchDes,
        branchShortCode: b.BranchShortCode
      })),
      syllabuses: syllabuses.map(s => ({
        syllabusID: s.SyllabusID,
        serviceName: s.SyllabusDescription
      }))
    });

  } catch (err) {
    console.error('[Auth me error]:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve session state.' });
  }
});

/**
 * Step 4: Branch & Syllabus Switch Endpoint (/api/auth/switch-context)
 */
authRouter.post('/switch-context', requireTenantAuth, async (req, res) => {
  try {
    const { schMasterID, userID, username } = req.tenantContext;
    let { branchID, syllabusID } = req.body;

    branchID = parseInt(branchID, 10) || req.tenantContext.branchID;
    const tenantDb = await getTenantDb(schMasterID);

    // Verify branch availability
    let [branches] = await tenantDb.query(
      `SELECT branchID, BranchDes, BranchShortCode FROM srp_schbranches WHERE schMasterID = ?`,
      [schMasterID]
    );
    // Fallback: If tenant DB srp_schbranches rows do not match schMasterID = 10 filter, query all branches in tenant DB
    if (!branches || branches.length === 0) {
      [branches] = await tenantDb.query(
        `SELECT branchID, BranchDes, BranchShortCode FROM srp_schbranches`
      );
    }

    const validBranch = branches.find(b => b.branchID === branchID);
    if (!validBranch) {
      return res.status(400).json({ success: false, error: 'Invalid branch selection for this school.' });
    }

    // Re-query syllabuses for newly selected branch
    const [syllabuses] = await tenantDb.query(
      `SELECT SyllabusID, SyllabusDescription FROM srp_syllabusmaster WHERE SchMasterID = ? AND BranchID = ?`,
      [schMasterID, branchID]
    );

    let selectedSyllabusID = parseInt(syllabusID, 10);
    const validSyllabus = syllabuses.find(s => s.SyllabusID === selectedSyllabusID);
    if (!validSyllabus) {
      selectedSyllabusID = syllabuses.length > 0 ? syllabuses[0].SyllabusID : null;
    }

    // Re-query active academic year for newly selected branch
    const [academicRows] = await tenantDb.query(
      `SELECT ad.AcademicYear, ay.AY_Description 
       FROM srp_academicdetails ad
       LEFT JOIN srp_academicyearmaster ay ON ay.AY_AutoID = ad.AcademicYear
       WHERE ad.SchMasterId = ? AND ad.BranchID = ? AND ad.ActiveAY = 1 AND ad.isDeleted = 0
       LIMIT 1`,
      [schMasterID, branchID]
    );

    let activeAcademicYearId = null;
    let activeAcademicYearDes = 'Academic Year Not Configured';

    if (academicRows && academicRows.length > 0) {
      activeAcademicYearId = academicRows[0].AcademicYear;
      activeAcademicYearDes = academicRows[0].AY_Description || `Academic Year (${academicRows[0].AcademicYear})`;
    }

    // Update JWT token with new context
    const updatedPayload = {
      userID,
      username,
      schMasterID,
      branchID,
      syllabusID: selectedSyllabusID,
      academicYear: activeAcademicYearId
    };

    const token = jwt.sign(updatedPayload, config.jwtSecret, { 
      expiresIn: config.jwtExpiresIn 
    });

    res.cookie('tenant_session', token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: config.jwtCookieMaxAge
    });

    res.json({
      success: true,
      message: 'Tenant context updated successfully.',
      context: {
        branchID,
        syllabusID: selectedSyllabusID,
        academicYear: activeAcademicYearId,
        academicYearDes: activeAcademicYearDes
      },
      syllabuses: syllabuses.map(s => ({
        syllabusID: s.SyllabusID,
        serviceName: s.SyllabusDescription
      }))
    });

  } catch (err) {
    console.error('[Context switch error]:', err);
    res.status(500).json({ success: false, error: 'Failed to switch branch/syllabus context.' });
  }
});

/**
 * Logout Endpoint (/api/auth/logout)
 */
authRouter.post('/logout', (req, res) => {
  res.clearCookie('tenant_session');
  res.json({ success: true, message: 'Logged out successfully.' });
});
