const db = require('../config/db');

// GET /api/products - ดึงสินค้าทั้งหมด
const getAll = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM products ORDER BY product_id ASC');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/products/:id - ดึงสินค้าตาม product_id
const getById = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE product_id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/products - เพิ่มสินค้า
// body: { code, name_en, name_th, price, picture, product_status }
const create = async (req, res) => {
  try {
    const { code, name_en, name_th, price, picture, product_status } = req.body;
    if (!code || !name_th || price === undefined) {
      return res.status(400).json({ success: false, message: 'กรุณากรอก code, name_th และ price' });
    }
    const [result] = await db.query(
      'INSERT INTO products (code, name_en, name_th, price, picture, product_status) VALUES (?, ?, ?, ?, ?, ?)',
      [code, name_en || null, name_th, price, picture || null, product_status || 'active']
    );
    res.status(201).json({ success: true, message: 'เพิ่มสินค้าสำเร็จ', product_id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/products/:id - แก้ไขสินค้า
const update = async (req, res) => {
  try {
    const { code, name_en, name_th, price, picture, product_status } = req.body;
    const [result] = await db.query(
      'UPDATE products SET code = ?, name_en = ?, name_th = ?, price = ?, picture = ?, product_status = ? WHERE product_id = ?',
      [code, name_en, name_th, price, picture, product_status, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
    }
    res.json({ success: true, message: 'แก้ไขสินค้าสำเร็จ' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/products/:id - ลบสินค้า
const remove = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM products WHERE product_id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
    }
    res.json({ success: true, message: 'ลบสินค้าสำเร็จ' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAll, getById, create, update, remove };
