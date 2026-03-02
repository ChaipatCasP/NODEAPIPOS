-- สร้าง database (ถ้ายังไม่มี)
CREATE DATABASE IF NOT EXISTS demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE demo;

-- ตาราง products (สินค้า)
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  category VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ตาราง orders (คำสั่งซื้อ)
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(255) DEFAULT 'ลูกค้าทั่วไป',
  status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ตาราง order_items (รายการในคำสั่งซื้อ)
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  price DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ข้อมูลตัวอย่าง
INSERT INTO products (name, price, stock, category) VALUES
('น้ำดื่ม 600ml', 7.00, 100, 'เครื่องดื่ม'),
('โค้ก 325ml', 15.00, 80, 'เครื่องดื่ม'),
('ขนมปังแผ่น', 25.00, 50, 'อาหาร'),
('บะหมี่กึ่งสำเร็จรูป', 6.00, 200, 'อาหาร'),
('สบู่ก้อน', 35.00, 60, 'ของใช้');

-- ─────────────────────────────────────────────────────────────────
-- Seed: roles สำหรับระบบ Auth (รันครั้งเดียว)
-- ─────────────────────────────────────────────────────────────────
INSERT IGNORE INTO roles (role_id, role_code, role_name, is_active, created_at) VALUES
  (UUID(), 'admin', 'Administrator', 1, NOW()),
  (UUID(), 'staff', 'Staff',         1, NOW()),
  (UUID(), 'manager', 'Manager',     1, NOW());

-- Seed: permissions
INSERT IGNORE INTO permissions (perm_id, perm_code, perm_name, module, created_at) VALUES
  (UUID(), 'product:read',   'ดูสินค้า',         'product', NOW()),
  (UUID(), 'product:write',  'เพิ่ม/แก้ไขสินค้า', 'product', NOW()),
  (UUID(), 'product:delete', 'ลบสินค้า',          'product', NOW()),
  (UUID(), 'order:read',     'ดูออเดอร์',         'order',   NOW()),
  (UUID(), 'order:write',    'สร้าง/แก้ไขออเดอร์', 'order',  NOW()),
  (UUID(), 'table:read',     'ดูโต๊ะ',            'table',   NOW()),
  (UUID(), 'table:write',    'เพิ่ม/แก้ไขโต๊ะ',   'table',   NOW()),
  (UUID(), 'user:manage',    'จัดการผู้ใช้',        'user',    NOW());

-- Seed: admin role ได้ทุก permission
INSERT IGNORE INTO role_permissions (role_id, perm_id, granted_at)
SELECT r.role_id, p.perm_id, NOW()
FROM roles r, permissions p
WHERE r.role_code = 'admin';

-- Seed: staff role ได้ read + order:write + table:read
INSERT IGNORE INTO role_permissions (role_id, perm_id, granted_at)
SELECT r.role_id, p.perm_id, NOW()
FROM roles r
JOIN permissions p ON p.perm_code IN ('product:read','order:read','order:write','table:read')
WHERE r.role_code = 'staff';
