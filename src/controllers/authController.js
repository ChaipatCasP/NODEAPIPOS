const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { client, dbType } = require('../config/database');

const SALT_ROUNDS = 10;
const MAX_FAILED_LOGIN = 5; // ล็อคบัญชีหลังจาก login ผิด N ครั้ง

// ─── helpers ─────────────────────────────────────────────────────────────────

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}

async function findUserByEmail(email) {
  if (dbType === 'supabase') {
    const { data, error } = await client.from('users').select('*').eq('email', email).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }
  const [rows] = await client.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function findUserById(userId) {
  if (dbType === 'supabase') {
    const { data, error } = await client.from('users').select('*').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }
  const [rows] = await client.query('SELECT * FROM users WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0] || null;
}

async function getUserRoles(userId) {
  if (dbType === 'supabase') {
    const { data } = await client.from('user_roles').select('roles(role_id, role_code, role_name)').eq('user_id', userId);
    return (data || []).map((r) => r.roles).filter(Boolean);
  }
  const [rows] = await client.query(
    `SELECT r.role_id, r.role_code, r.role_name
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.role_id AND r.is_active = 1
     WHERE ur.user_id = ?`,
    [userId]
  );
  return rows;
}

async function getRolePermissions(roleIds) {
  if (!roleIds.length) return [];
  if (dbType === 'supabase') {
    const { data } = await client.from('role_permissions').select('permissions(perm_code, module)').in('role_id', roleIds);
    return (data || []).map((r) => r.permissions).filter(Boolean);
  }
  const placeholders = roleIds.map(() => '?').join(',');
  const [rows] = await client.query(
    `SELECT DISTINCT p.perm_code, p.module
     FROM role_permissions rp
     JOIN permissions p ON rp.perm_id = p.perm_id
     WHERE rp.role_id IN (${placeholders})`,
    roleIds
  );
  return rows;
}

async function createSession(userId, ip, userAgent) {
  const crypto = require('crypto');
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 วัน

  if (dbType === 'supabase') {
    await client.from('user_sessions').insert({
      session_id: sessionId, user_id: userId, refresh_token_hash: tokenHash,
      issued_at: new Date().toISOString(), expires_at: expiresAt.toISOString(),
      ip: ip || null, user_agent: userAgent || null,
    });
  } else {
    await client.query(
      `INSERT INTO user_sessions (session_id, user_id, refresh_token_hash, issued_at, expires_at, ip, user_agent)
       VALUES (?, ?, ?, NOW(), ?, ?, ?)`,
      [sessionId, userId, tokenHash, expiresAt, ip || null, userAgent || null]
    );
  }
  return { refreshToken, sessionId };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// body: { email, password, role_code? }
// ─────────────────────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { email, password, role_code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'กรุณากรอก email และ password' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'password ต้องมีอย่างน้อย 6 ตัวอักษร' });
    }

    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ success: false, message: 'email นี้ถูกใช้แล้ว' });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = uuidv4();

    if (dbType === 'supabase') {
      const { error } = await client.from('users').insert({
        user_id: userId, email, password_hash: passwordHash,
        status: 'ACTIVE', failed_login_count: 0,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } else {
      await client.query(
        `INSERT INTO users (user_id, email, password_hash, status, failed_login_count, created_at, updated_at)
         VALUES (?, ?, ?, 'ACTIVE', 0, NOW(), NOW())`,
        [userId, email, passwordHash]
      );
    }

    // กำหนด role ถ้าระบุ role_code
    if (role_code) {
      let roleRow = null;
      if (dbType === 'supabase') {
        const { data } = await client.from('roles').select('role_id').eq('role_code', role_code).eq('is_active', true).single();
        roleRow = data;
      } else {
        const [rows] = await client.query('SELECT role_id FROM roles WHERE role_code = ? AND is_active = 1 LIMIT 1', [role_code]);
        roleRow = rows[0];
      }
      if (roleRow) {
        if (dbType === 'supabase') {
          await client.from('user_roles').insert({ user_id: userId, role_id: roleRow.role_id, assigned_at: new Date().toISOString() });
        } else {
          await client.query('INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, NOW())', [userId, roleRow.role_id]);
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'สมัครสมาชิกสำเร็จ',
      user: { user_id: userId, email, status: 'ACTIVE' },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// body: { email, password }
// ─────────────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'กรุณากรอก email และ password' });
    }

    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ success: false, message: 'email หรือ password ไม่ถูกต้อง' });

    if (user.status === 'DISABLED') {
      return res.status(403).json({ success: false, message: 'บัญชีนี้ถูกระงับการใช้งาน' });
    }
    if (user.status === 'LOCKED') {
      return res.status(403).json({ success: false, message: 'บัญชีถูกล็อค กรุณาติดต่อผู้ดูแลระบบ' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      // นับจำนวนครั้งที่ login ผิด
      const newCount = (user.failed_login_count || 0) + 1;
      const newStatus = newCount >= MAX_FAILED_LOGIN ? 'LOCKED' : user.status;
      if (dbType === 'supabase') {
        await client.from('users').update({ failed_login_count: newCount, status: newStatus, updated_at: new Date().toISOString() }).eq('user_id', user.user_id);
      } else {
        await client.query('UPDATE users SET failed_login_count = ?, status = ?, updated_at = NOW() WHERE user_id = ?', [newCount, newStatus, user.user_id]);
      }
      const remaining = MAX_FAILED_LOGIN - newCount;
      const msg = newStatus === 'LOCKED'
        ? 'บัญชีถูกล็อคเนื่องจาก login ผิดหลายครั้ง'
        : `email หรือ password ไม่ถูกต้อง (เหลือโอกาสอีก ${remaining} ครั้ง)`;
      return res.status(401).json({ success: false, message: msg });
    }

    // login สำเร็จ: reset failed_login_count + update last_login_at
    if (dbType === 'supabase') {
      await client.from('users').update({ failed_login_count: 0, last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', user.user_id);
    } else {
      await client.query('UPDATE users SET failed_login_count = 0, last_login_at = NOW(), updated_at = NOW() WHERE user_id = ?', [user.user_id]);
    }

    // ดึง roles
    const roles = await getUserRoles(user.user_id);
    const roleCodes = roles.map((r) => r.role_code);

    // สร้าง access token
    const accessToken = signAccessToken({ user_id: user.user_id, email: user.email, roles: roleCodes });

    // สร้าง session (refresh token)
    const { refreshToken, sessionId } = await createSession(user.user_id, req.ip, req.headers['user-agent']);

    res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      access_token: accessToken,
      refresh_token: refreshToken,
      session_id: sessionId,
      user: { user_id: user.user_id, email: user.email, status: user.status, roles: roleCodes },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/profile  (ต้องมี access_token)
// ─────────────────────────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const user = await findUserById(req.user.user_id);
    if (!user) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });

    const roles = await getUserRoles(user.user_id);
    const permissions = await getRolePermissions(roles.map((r) => r.role_id));

    const { password_hash, failed_login_count, ...profile } = user;
    res.json({ success: true, data: { ...profile, roles, permissions } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout  (ต้องมี access_token)
// body: { session_id? }  — ถ้าไม่ส่งจะ revoke ทุก session
// ─────────────────────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    const { session_id } = req.body;
    const userId = req.user.user_id;

    if (dbType === 'supabase') {
      let q = client.from('user_sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).is('revoked_at', null);
      if (session_id) q = q.eq('session_id', session_id);
      await q;
    } else if (session_id) {
      await client.query('UPDATE user_sessions SET revoked_at = NOW() WHERE session_id = ? AND user_id = ?', [session_id, userId]);
    } else {
      await client.query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
    }
    res.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/auth/change-password  (ต้องมี access_token)
// body: { old_password, new_password }
// ─────────────────────────────────────────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      return res.status(400).json({ success: false, message: 'กรุณากรอก old_password และ new_password' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'new_password ต้องมีอย่างน้อย 6 ตัวอักษร' });
    }

    const user = await findUserById(req.user.user_id);
    if (!user) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });

    const isMatch = await bcrypt.compare(old_password, user.password_hash);
    if (!isMatch) return res.status(401).json({ success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' });

    const hashed = await bcrypt.hash(new_password, SALT_ROUNDS);
    if (dbType === 'supabase') {
      await client.from('users').update({ password_hash: hashed, updated_at: new Date().toISOString() }).eq('user_id', req.user.user_id);
    } else {
      await client.query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE user_id = ?', [hashed, req.user.user_id]);
    }

    // revoke sessions ทั้งหมดหลังเปลี่ยนรหัสผ่าน
    if (dbType === 'supabase') {
      await client.from('user_sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', req.user.user_id).is('revoked_at', null);
    } else {
      await client.query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [req.user.user_id]);
    }

    res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณา Login ใหม่' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { register, login, getProfile, logout, changePassword };
