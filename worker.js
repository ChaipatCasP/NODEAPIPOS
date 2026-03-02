/**
 * worker.js  –  Cloudflare Workers entry point
 * Framework : Hono  (edge-compatible router)
 * Database  : Supabase (HTTP-based, works in Workers)
 * Auth      : jose (JWT), bcryptjs (nodejs_compat)
 *
 * Run locally : npx wrangler dev
 * Deploy      : npx wrangler deploy
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import { SignJWT, jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

// bcrypt cost factor lowered to 6 for Cloudflare's CPU-time limit
// (existing passwords hashed at cost 10 are still VERIFIED correctly –
//  the cost is embedded in the hash string itself)
const SALT_ROUNDS = 6;
const MAX_FAILED_LOGIN = 5;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Create a Supabase client bound to this request's env secrets */
const sb = (env) => createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

/** Sign a JWT access token using jose (Works in edge runtime) */
async function signAccessToken(payload, env) {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN || '7d')
    .sign(secret);
}

/** Hex-encode ArrayBuffer → string */
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 hex digest using Web Crypto (available in Workers) */
async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return bufToHex(buf);
}

/** Generate a random hex string of `bytes` bytes */
function randomHex(bytes = 40) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bufToHex(arr.buffer);
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

const authMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, 401);
  }
  try {
    const token = authHeader.slice(7);
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' }, 401);
  }
};

// ─── App ─────────────────────────────────────────────────────────────────────

const app = new Hono();

app.use('*', cors());

// ── OpenAPI spec ─────────────────────────────────────────────────────────────
const openApiSpec = {
  openapi: '3.0.0',
  info: { title: 'Node API POS', version: '1.0.0', description: 'POS API – Cloudflare Workers + Supabase' },
  servers: [{ url: 'https://nodeapipos.baby-pat-tac.workers.dev', description: 'Cloudflare Workers' }],
  tags: [
    { name: 'Auth', description: 'Login / Register / Profile' },
    { name: 'Products', description: 'จัดการสินค้า' },
    { name: 'Tables', description: 'จัดการโต๊ะ' },
    { name: 'Orders', description: 'จัดการออเดอร์' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth'], summary: 'สมัครสมาชิก',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email','password'], properties: { email: { type: 'string', example: 'user@pos.com' }, password: { type: 'string', example: 'pass1234' }, role_code: { type: 'string', example: 'staff' } } } } } },
        responses: { 201: { description: 'สำเร็จ' }, 409: { description: 'email ซ้ำ' } },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'], summary: 'เข้าสู่ระบบ',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email','password'], properties: { email: { type: 'string', example: 'admin@pos.com' }, password: { type: 'string', example: 'admin1234' } } } } } },
        responses: { 200: { description: 'คืน access_token + refresh_token' }, 401: { description: 'ข้อมูลไม่ถูกต้อง' } },
      },
    },
    '/api/auth/profile': {
      get: {
        tags: ['Auth'], summary: 'ดูโปรไฟล์ตัวเอง',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'ข้อมูล user + roles + permissions' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'], summary: 'ออกจากระบบ',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'สำเร็จ' } },
      },
    },
    '/api/auth/change-password': {
      put: {
        tags: ['Auth'], summary: 'เปลี่ยนรหัสผ่าน',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['old_password','new_password'], properties: { old_password: { type: 'string' }, new_password: { type: 'string' } } } } } },
        responses: { 200: { description: 'สำเร็จ' } },
      },
    },
    '/api/products': {
      get: { tags: ['Products'], summary: 'ดึงสินค้าทั้งหมด', responses: { 200: { description: 'รายการสินค้า' } } },
      post: {
        tags: ['Products'], summary: 'เพิ่มสินค้า',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['code','name_th','price'], properties: { code: { type: 'string' }, name_th: { type: 'string' }, name_en: { type: 'string' }, price: { type: 'number' }, product_status: { type: 'string', example: 'active' } } } } } },
        responses: { 201: { description: 'สำเร็จ' } },
      },
    },
    '/api/products/{id}': {
      get: { tags: ['Products'], summary: 'ดึงสินค้าตาม ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'ข้อมูลสินค้า' }, 404: { description: 'ไม่พบ' } } },
      put: { tags: ['Products'], summary: 'แก้ไขสินค้า', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'สำเร็จ' } } },
      delete: { tags: ['Products'], summary: 'ลบสินค้า', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'สำเร็จ' } } },
    },
    '/api/tables': {
      get: { tags: ['Tables'], summary: 'ดึงโต๊ะทั้งหมด', responses: { 200: { description: 'รายการโต๊ะ' } } },
      post: {
        tags: ['Tables'], summary: 'เพิ่มโต๊ะ',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['code','name_th'], properties: { code: { type: 'string' }, name_th: { type: 'string' }, name_en: { type: 'string' }, total_sit: { type: 'integer' }, table_status: { type: 'string', example: 'available' } } } } } },
        responses: { 201: { description: 'สำเร็จ' } },
      },
    },
    '/api/tables/{id}': {
      get: { tags: ['Tables'], summary: 'ดึงโต๊ะตาม ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'ข้อมูลโต๊ะ' } } },
      put: { tags: ['Tables'], summary: 'แก้ไขโต๊ะ', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'สำเร็จ' } } },
      delete: { tags: ['Tables'], summary: 'ลบโต๊ะ', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'สำเร็จ' } } },
    },
    '/api/orders': {
      get: { tags: ['Orders'], summary: 'ดึงออเดอร์ทั้งหมด', responses: { 200: { description: 'รายการออเดอร์' } } },
      post: {
        tags: ['Orders'], summary: 'สร้างออเดอร์พร้อมสินค้า',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['items'], properties: { customer_name: { type: 'string' }, table_info_id: { type: 'integer' }, open_by: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { product_id: { type: 'integer' } } } } } } } } },
        responses: { 201: { description: 'สำเร็จ' } },
      },
    },
    '/api/orders/{id}': {
      get: { tags: ['Orders'], summary: 'ดึงออเดอร์ตาม ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'ข้อมูลออเดอร์ + รายการสินค้า' } } },
    },
    '/api/orders/open': {
      post: {
        tags: ['Orders'], summary: 'เปิดออเดอร์ (ยังไม่มีสินค้า)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { customer_name: { type: 'string' }, table_info_id: { type: 'integer' }, open_by: { type: 'string' } } } } } },
        responses: { 201: { description: 'สำเร็จ' } },
      },
    },
    '/api/orders/add': {
      post: {
        tags: ['Orders'], summary: 'เพิ่มสินค้าเข้าออเดอร์',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['order_header_id','items'], properties: { order_header_id: { type: 'integer' }, create_by: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { product_id: { type: 'integer' }, quantity: { type: 'integer' } } } } } } } } },
        responses: { 201: { description: 'สำเร็จ' } },
      },
    },
    '/api/orders/close': {
      post: {
        tags: ['Orders'], summary: 'ปิดออเดอร์',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['order_header_id'], properties: { order_header_id: { type: 'integer' }, close_by: { type: 'string' } } } } } },
        responses: { 200: { description: 'สำเร็จ' } },
      },
    },
    '/api/orders/{id}/status': {
      patch: {
        tags: ['Orders'], summary: 'อัปเดตสถานะรายการ order_details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { order_status: { type: 'string', example: 'done' }, update_by: { type: 'string' } } } } } },
        responses: { 200: { description: 'สำเร็จ' } },
      },
    },
  },
};

app.get('/openapi.json', (c) => c.json(openApiSpec));
app.get('/api-docs', swaggerUI({ url: '/openapi.json' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (c) =>
  c.json({
    success: true,
    message: 'Node API POS – Cloudflare Workers',
    runtime: 'cloudflare-workers',
    database: 'supabase',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      orders: '/api/orders',
      tables: '/api/tables',
    },
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (c) => {
  try {
    const { email, password, role_code } = await c.req.json();
    if (!email || !password)
      return c.json({ success: false, message: 'กรุณากรอก email และ password' }, 400);
    if (password.length < 6)
      return c.json({ success: false, message: 'password ต้องมีอย่างน้อย 6 ตัวอักษร' }, 400);

    const db = sb(c.env);
    const { data: existing } = await db.from('users').select('user_id').eq('email', email).single();
    if (existing) return c.json({ success: false, message: 'email นี้ถูกใช้แล้ว' }, 409);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error } = await db.from('users').insert({
      user_id: userId,
      email,
      password_hash: passwordHash,
      status: 'ACTIVE',
      failed_login_count: 0,
      created_at: now,
      updated_at: now,
    });
    if (error) return c.json({ success: false, message: error.message }, 500);

    if (role_code) {
      const { data: role } = await db.from('roles').select('role_id').eq('role_code', role_code).single();
      if (role) await db.from('user_roles').insert({ user_id: userId, role_id: role.role_id });
    }

    return c.json(
      { success: true, message: 'สมัครสมาชิกสำเร็จ', user: { user_id: userId, email, status: 'ACTIVE' } },
      201
    );
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password)
      return c.json({ success: false, message: 'กรุณากรอก email และ password' }, 400);

    const db = sb(c.env);
    const { data: user } = await db.from('users').select('*').eq('email', email).single();
    if (!user) return c.json({ success: false, message: 'email หรือ password ไม่ถูกต้อง' }, 401);
    if (user.status === 'LOCKED')
      return c.json({ success: false, message: 'บัญชีถูกล็อค กรุณาติดต่อผู้ดูแล' }, 403);
    if (user.status === 'DISABLED')
      return c.json({ success: false, message: 'บัญชีถูกระงับ' }, 403);

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      const newCount = (user.failed_login_count || 0) + 1;
      const updates = { failed_login_count: newCount, updated_at: new Date().toISOString() };
      if (newCount >= MAX_FAILED_LOGIN) updates.status = 'LOCKED';
      await db.from('users').update(updates).eq('user_id', user.user_id);
      return c.json({ success: false, message: 'email หรือ password ไม่ถูกต้อง' }, 401);
    }

    await db
      .from('users')
      .update({ failed_login_count: 0, last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', user.user_id);

    // Get roles
    const { data: urData } = await db
      .from('user_roles')
      .select('roles(role_code)')
      .eq('user_id', user.user_id);
    const roles = (urData || []).map((r) => r.roles?.role_code).filter(Boolean);

    // Create session
    const refreshToken = randomHex(40);
    const tokenHash = await sha256hex(refreshToken);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || null;
    const userAgent = c.req.header('user-agent') || null;

    await db.from('user_sessions').insert({
      session_id: sessionId,
      user_id: user.user_id,
      refresh_token_hash: tokenHash,
      issued_at: new Date().toISOString(),
      expires_at: expiresAt,
      ip,
      user_agent: userAgent,
    });

    const accessToken = await signAccessToken({ user_id: user.user_id, email: user.email, roles }, c.env);

    return c.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      access_token: accessToken,
      refresh_token: refreshToken,
      session_id: sessionId,
      user: { user_id: user.user_id, email: user.email, status: user.status, roles },
    });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// GET /api/auth/profile  (requires auth)
app.get('/api/auth/profile', authMiddleware, async (c) => {
  try {
    const { user_id } = c.get('user');
    const db = sb(c.env);

    const { data: user, error } = await db
      .from('users')
      .select('user_id, email, status, last_login_at, created_at, updated_at')
      .eq('user_id', user_id)
      .single();
    if (error || !user) return c.json({ success: false, message: 'ไม่พบผู้ใช้' }, 404);

    const { data: urData } = await db
      .from('user_roles')
      .select('roles(role_id, role_code, role_name)')
      .eq('user_id', user_id);
    const roles = (urData || []).map((r) => r.roles).filter(Boolean);
    const roleIds = roles.map((r) => r.role_id);

    let permissions = [];
    if (roleIds.length > 0) {
      const { data: rpData } = await db
        .from('role_permissions')
        .select('permissions(perm_code, module)')
        .in('role_id', roleIds);
      permissions = (rpData || []).map((r) => r.permissions).filter(Boolean);
    }

    return c.json({ success: true, data: { ...user, roles, permissions } });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// POST /api/auth/logout  (requires auth)
app.post('/api/auth/logout', authMiddleware, async (c) => {
  try {
    const { user_id } = c.get('user');
    const db = sb(c.env);
    await db
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .is('revoked_at', null);
    return c.json({ success: true, message: 'ออกจากระบบสำเร็จ' });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// PUT /api/auth/change-password  (requires auth)
app.put('/api/auth/change-password', authMiddleware, async (c) => {
  try {
    const { old_password, new_password } = await c.req.json();
    if (!old_password || !new_password)
      return c.json({ success: false, message: 'กรุณากรอก old_password และ new_password' }, 400);
    if (new_password.length < 6)
      return c.json({ success: false, message: 'new_password ต้องมีอย่างน้อย 6 ตัวอักษร' }, 400);

    const { user_id } = c.get('user');
    const db = sb(c.env);

    const { data: user } = await db.from('users').select('password_hash').eq('user_id', user_id).single();
    if (!user) return c.json({ success: false, message: 'ไม่พบผู้ใช้' }, 404);

    const isValid = await bcrypt.compare(old_password, user.password_hash);
    if (!isValid)
      return c.json({ success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' }, 400);

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await db
      .from('users')
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq('user_id', user_id);
    await db
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .is('revoked_at', null);

    return c.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/products', async (c) => {
  try {
    const { data, error } = await sb(c.env).from('products').select('*').order('product_id', { ascending: true });
    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.get('/api/products/:id', async (c) => {
  try {
    const { data, error } = await sb(c.env).from('products').select('*').eq('product_id', c.req.param('id')).single();
    if (error) {
      if (error.code === 'PGRST116') return c.json({ success: false, message: 'ไม่พบสินค้า' }, 404);
      return c.json({ success: false, message: error.message }, 500);
    }
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.post('/api/products', async (c) => {
  try {
    const { code, name_en, name_th, price, picture, product_status } = await c.req.json();
    if (!code || !name_th || price === undefined)
      return c.json({ success: false, message: 'กรุณากรอก code, name_th และ price' }, 400);
    const { data, error } = await sb(c.env)
      .from('products')
      .insert({ code, name_en: name_en || null, name_th, price, picture: picture || null, product_status: product_status || 'active' })
      .select('product_id')
      .single();
    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, message: 'เพิ่มสินค้าสำเร็จ', product_id: data.product_id }, 201);
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.put('/api/products/:id', async (c) => {
  try {
    const body = await c.req.json();
    const { data, error } = await sb(c.env)
      .from('products')
      .update(body)
      .eq('product_id', c.req.param('id'))
      .select('product_id');
    if (error) return c.json({ success: false, message: error.message }, 500);
    if (!data || data.length === 0) return c.json({ success: false, message: 'ไม่พบสินค้า' }, 404);
    return c.json({ success: true, message: 'แก้ไขสินค้าสำเร็จ' });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.delete('/api/products/:id', async (c) => {
  try {
    const { data, error } = await sb(c.env)
      .from('products')
      .delete()
      .eq('product_id', c.req.param('id'))
      .select('product_id');
    if (error) return c.json({ success: false, message: error.message }, 500);
    if (!data || data.length === 0) return c.json({ success: false, message: 'ไม่พบสินค้า' }, 404);
    return c.json({ success: true, message: 'ลบสินค้าสำเร็จ' });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TABLES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/tables', async (c) => {
  try {
    const { data, error } = await sb(c.env).from('table_info').select('*').order('table_info_id', { ascending: true });
    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.get('/api/tables/:id', async (c) => {
  try {
    const { data, error } = await sb(c.env).from('table_info').select('*').eq('table_info_id', c.req.param('id')).single();
    if (error) {
      if (error.code === 'PGRST116') return c.json({ success: false, message: 'ไม่พบโต๊ะ' }, 404);
      return c.json({ success: false, message: error.message }, 500);
    }
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.post('/api/tables', async (c) => {
  try {
    const { code, name_en, name_th, total_sit, picture, table_status } = await c.req.json();
    if (!code || !name_th) return c.json({ success: false, message: 'กรุณากรอก code และ name_th' }, 400);
    const { data, error } = await sb(c.env)
      .from('table_info')
      .insert({ code, name_en: name_en || null, name_th, total_sit: total_sit || 0, picture: picture || null, table_status: table_status || 'available' })
      .select('table_info_id')
      .single();
    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, message: 'เพิ่มโต๊ะสำเร็จ', table_info_id: data.table_info_id }, 201);
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.put('/api/tables/:id', async (c) => {
  try {
    const body = await c.req.json();
    const { data, error } = await sb(c.env)
      .from('table_info')
      .update(body)
      .eq('table_info_id', c.req.param('id'))
      .select('table_info_id');
    if (error) return c.json({ success: false, message: error.message }, 500);
    if (!data || data.length === 0) return c.json({ success: false, message: 'ไม่พบโต๊ะ' }, 404);
    return c.json({ success: true, message: 'แก้ไขโต๊ะสำเร็จ' });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.delete('/api/tables/:id', async (c) => {
  try {
    const { data, error } = await sb(c.env)
      .from('table_info')
      .delete()
      .eq('table_info_id', c.req.param('id'))
      .select('table_info_id');
    if (error) return c.json({ success: false, message: error.message }, 500);
    if (!data || data.length === 0) return c.json({ success: false, message: 'ไม่พบโต๊ะ' }, 404);
    return c.json({ success: true, message: 'ลบโต๊ะสำเร็จ' });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/orders
app.get('/api/orders', async (c) => {
  try {
    const { data, error } = await sb(c.env)
      .from('order_header')
      .select('*, table_info!left(name_th), order_details!left(order_details_id, price)')
      .order('order_header_id', { ascending: false });
    if (error) return c.json({ success: false, message: error.message }, 500);
    const rows = data.map(({ table_info, order_details, ...rest }) => ({
      ...rest,
      table_name: table_info?.name_th || null,
      total_items: order_details?.length || 0,
      total_amount: order_details?.reduce((s, d) => s + (Number(d.price) || 0), 0) || 0,
    }));
    return c.json({ success: true, data: rows });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// GET /api/orders/:id
app.get('/api/orders/:id', async (c) => {
  try {
    const db = sb(c.env);
    const { data: order, error: orderErr } = await db
      .from('order_header')
      .select('*, table_info!left(name_th)')
      .eq('order_header_id', c.req.param('id'))
      .single();
    if (orderErr) {
      if (orderErr.code === 'PGRST116') return c.json({ success: false, message: 'ไม่พบคำสั่งซื้อ' }, 404);
      return c.json({ success: false, message: orderErr.message }, 500);
    }
    const { data: items, error: itemsErr } = await db
      .from('order_details')
      .select('*, products!left(name_th, name_en, code)')
      .eq('order_header_id', c.req.param('id'));
    if (itemsErr) return c.json({ success: false, message: itemsErr.message }, 500);
    const { table_info, ...orderRest } = order;
    const formattedItems = items.map(({ products, ...d }) => ({
      ...d,
      product_name: products?.name_th || null,
      name_en: products?.name_en || null,
      code: products?.code || null,
    }));
    return c.json({ success: true, data: { ...orderRest, table_name: table_info?.name_th || null, items: formattedItems } });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// POST /api/orders  (create with items)
app.post('/api/orders', async (c) => {
  try {
    const { customer_name, customer_tel, table_info_id, open_by, items } = await c.req.json();
    if (!items || items.length === 0)
      return c.json({ success: false, message: 'กรุณาระบุสินค้าอย่างน้อย 1 รายการ' }, 400);

    const db = sb(c.env);
    let orderId = null;
    const { data: orderData, error: orderErr } = await db
      .from('order_header')
      .insert({ customer_name: customer_name || 'ลูกค้าทั่วไป', customer_tel: customer_tel || null, table_info_id: table_info_id || null, open_by: open_by || null, open_date: new Date().toISOString() })
      .select('order_header_id')
      .single();
    if (orderErr) return c.json({ success: false, message: orderErr.message }, 500);
    orderId = orderData.order_header_id;

    try {
      for (const item of items) {
        const { data: product, error: pErr } = await db.from('products').select('price').eq('product_id', item.product_id).single();
        if (pErr || !product) throw new Error(`ไม่พบสินค้า product_id: ${item.product_id}`);
        const { error: detailErr } = await db.from('order_details').insert({
          order_header_id: orderId, product_id: item.product_id, price: product.price,
          order_status: 'pending', create_by: open_by || null, create_date: new Date().toISOString(),
        });
        if (detailErr) throw detailErr;
      }
    } catch (itemErr) {
      await db.from('order_header').delete().eq('order_header_id', orderId);
      return c.json({ success: false, message: itemErr.message }, 500);
    }

    return c.json({ success: true, message: 'สร้างคำสั่งซื้อสำเร็จ', order_header_id: orderId }, 201);
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// POST /api/orders/open  (open order without items)
app.post('/api/orders/open', async (c) => {
  try {
    const { customer_name, customer_tel, table_info_id, open_by } = await c.req.json();
    const db = sb(c.env);
    let tableUpdated = false;
    let order_header_id = null;

    if (table_info_id) {
      const { data: tableData, error: tableErr } = await db
        .from('table_info')
        .select('table_info_id, table_status')
        .eq('table_info_id', table_info_id)
        .single();
      if (tableErr || !tableData)
        return c.json({ success: false, message: `ไม่พบโต๊ะ table_info_id: ${table_info_id}` }, 404);
      if (tableData.table_status === 'occupied')
        return c.json({ success: false, message: 'โต๊ะนี้มีออเดอร์เปิดอยู่แล้ว' }, 400);
      const { error: updateErr } = await db
        .from('table_info')
        .update({ table_status: 'occupied' })
        .eq('table_info_id', table_info_id);
      if (updateErr) return c.json({ success: false, message: updateErr.message }, 500);
      tableUpdated = true;
    }

    const { data: orderData, error: orderErr } = await db
      .from('order_header')
      .insert({ customer_name: customer_name || 'ลูกค้าทั่วไป', customer_tel: customer_tel || null, table_info_id: table_info_id || null, open_by: open_by || null, open_date: new Date().toISOString() })
      .select('order_header_id')
      .single();

    if (orderErr) {
      if (tableUpdated && table_info_id)
        await db.from('table_info').update({ table_status: 'available' }).eq('table_info_id', table_info_id);
      return c.json({ success: false, message: orderErr.message }, 500);
    }

    order_header_id = orderData.order_header_id;
    const { data: fullOrder, error: fetchErr } = await db
      .from('order_header')
      .select('*, table_info!left(name_th, code)')
      .eq('order_header_id', order_header_id)
      .single();
    if (fetchErr) return c.json({ success: false, message: fetchErr.message }, 500);

    const { table_info, ...rest } = fullOrder;
    return c.json({
      success: true,
      message: 'เปิดออเดอร์สำเร็จ',
      data: { ...rest, table_name: table_info?.name_th || null, table_code: table_info?.code || null },
    }, 201);
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// POST /api/orders/add  (add items to existing order)
app.post('/api/orders/add', async (c) => {
  try {
    const { order_header_id, items, create_by } = await c.req.json();
    if (!order_header_id) return c.json({ success: false, message: 'กรุณาระบุ order_header_id' }, 400);
    if (!items || items.length === 0) return c.json({ success: false, message: 'กรุณาระบุสินค้าอย่างน้อย 1 รายการ' }, 400);

    const db = sb(c.env);
    const { data: orderData, error: orderErr } = await db
      .from('order_header')
      .select('order_header_id, close_date')
      .eq('order_header_id', order_header_id)
      .single();
    if (orderErr || !orderData)
      return c.json({ success: false, message: `ไม่พบ order_header_id: ${order_header_id}` }, 404);
    if (orderData.close_date)
      return c.json({ success: false, message: 'ออเดอร์นี้ปิดไปแล้ว ไม่สามารถเพิ่มรายการได้' }, 400);

    const inserted = [];
    const insertedIds = [];

    try {
      for (const item of items) {
        if (!item.product_id) throw new Error('กรุณาระบุ product_id ในแต่ละรายการ');
        const { data: product, error: pErr } = await db
          .from('products')
          .select('product_id, name_th, price')
          .eq('product_id', item.product_id)
          .single();
        if (pErr || !product) throw new Error(`ไม่พบสินค้า product_id: ${item.product_id}`);
        const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
        for (let i = 0; i < qty; i++) {
          const { data: detail, error: detailErr } = await db
            .from('order_details')
            .insert({ order_header_id, product_id: item.product_id, price: product.price, order_status: 'pending', create_by: create_by || null, create_date: new Date().toISOString() })
            .select('order_details_id')
            .single();
          if (detailErr) throw detailErr;
          insertedIds.push(detail.order_details_id);
          inserted.push({ order_details_id: detail.order_details_id, product_id: item.product_id, name_th: product.name_th, price: product.price, order_status: 'pending' });
        }
      }
    } catch (itemErr) {
      if (insertedIds.length > 0) await db.from('order_details').delete().in('order_details_id', insertedIds);
      return c.json({ success: false, message: itemErr.message }, 500);
    }

    return c.json({
      success: true,
      message: `เพิ่มสินค้าเข้า order #${order_header_id} สำเร็จ ${inserted.length} รายการ`,
      order_header_id,
      inserted,
    }, 201);
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// POST /api/orders/close
app.post('/api/orders/close', async (c) => {
  try {
    const { order_header_id, close_by } = await c.req.json();
    if (!order_header_id) return c.json({ success: false, message: 'กรุณาระบุ order_header_id' }, 400);
    const { data, error } = await sb(c.env)
      .from('order_header')
      .update({ close_date: new Date().toISOString(), close_by: close_by || null, status: 'closed' })
      .eq('order_header_id', order_header_id)
      .select('order_header_id');
    if (error) return c.json({ success: false, message: error.message }, 500);
    if (!data || data.length === 0) return c.json({ success: false, message: `ไม่พบ order_header_id: ${order_header_id}` }, 404);
    return c.json({ success: true, message: 'ปิดออเดอร์สำเร็จ', order_header_id });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// PATCH /api/orders/:id/status
app.patch('/api/orders/:id/status', async (c) => {
  try {
    const { order_status, update_by } = await c.req.json();
    const { data, error } = await sb(c.env)
      .from('order_details')
      .update({ order_status, update_by: update_by || null, update_date: new Date().toISOString() })
      .eq('order_details_id', c.req.param('id'))
      .select('order_details_id');
    if (error) return c.json({ success: false, message: error.message }, 500);
    if (!data || data.length === 0) return c.json({ success: false, message: 'ไม่พบรายการ' }, 404);
    return c.json({ success: true, message: 'อัปเดตสถานะสำเร็จ' });
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
export default app;
