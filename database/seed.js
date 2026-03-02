// รัน: node database/seed.js
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'demo',
  });

  console.log('🌱 Seeding roles...');
  await conn.query(`
    INSERT IGNORE INTO roles (role_id, role_code, role_name, is_active, created_at) VALUES
    (UUID(), 'admin',   'Administrator', 1, NOW()),
    (UUID(), 'staff',   'Staff',         1, NOW()),
    (UUID(), 'manager', 'Manager',       1, NOW())
  `);

  console.log('🌱 Seeding permissions...');
  const perms = [
    ['product:read',   'ดูสินค้า',              'product'],
    ['product:write',  'เพิ่ม/แก้ไขสินค้า',    'product'],
    ['product:delete', 'ลบสินค้า',              'product'],
    ['order:read',     'ดูออเดอร์',             'order'],
    ['order:write',    'สร้าง/แก้ไขออเดอร์',   'order'],
    ['order:close',    'ปิดออเดอร์',            'order'],
    ['table:read',     'ดูโต๊ะ',                'table'],
    ['table:write',    'เพิ่ม/แก้ไขโต๊ะ',      'table'],
    ['user:manage',    'จัดการผู้ใช้',          'user'],
  ];
  for (const [code, name, mod] of perms) {
    await conn.query(
      'INSERT IGNORE INTO permissions (perm_id, perm_code, perm_name, module, created_at) VALUES (UUID(), ?, ?, ?, NOW())',
      [code, name, mod]
    );
  }

  console.log('🌱 Seeding role_permissions (admin → all)...');
  await conn.query(`
    INSERT IGNORE INTO role_permissions (role_id, perm_id, granted_at)
    SELECT r.role_id, p.perm_id, NOW()
    FROM roles r, permissions p
    WHERE r.role_code = 'admin'
  `);

  console.log('🌱 Seeding role_permissions (staff → limited)...');
  await conn.query(`
    INSERT IGNORE INTO role_permissions (role_id, perm_id, granted_at)
    SELECT r.role_id, p.perm_id, NOW()
    FROM roles r
    JOIN permissions p ON p.perm_code IN ('product:read','order:read','order:write','order:close','table:read')
    WHERE r.role_code = 'staff'
  `);

  const [roles] = await conn.query('SELECT role_code, role_name FROM roles');
  const [[{ c: permCount }]] = await conn.query('SELECT COUNT(*) AS c FROM permissions');
  const [[{ c: rpCount }]] = await conn.query('SELECT COUNT(*) AS c FROM role_permissions');

  console.log('✅ Roles:', roles.map((r) => r.role_code).join(', '));
  console.log('✅ Permissions:', permCount);
  console.log('✅ Role-Permissions:', rpCount);
  await conn.end();
  console.log('🎉 Seed complete!');
})().catch((e) => {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
});
