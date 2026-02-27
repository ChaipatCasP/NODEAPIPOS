const db = require('../config/db');

// GET /api/orders - ดึงคำสั่งซื้อทั้งหมด
const getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT oh.*,
        ti.name_th AS table_name,
        COUNT(od.order_details_id) AS total_items,
        SUM(od.price) AS total_amount
      FROM order_header oh
      LEFT JOIN order_details od ON oh.order_header_id = od.order_header_id
      LEFT JOIN table_info ti ON oh.table_info_id = ti.table_info_id
      GROUP BY oh.order_header_id
      ORDER BY oh.order_header_id DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/orders/:id - ดึงคำสั่งซื้อตาม order_header_id พร้อมรายละเอียด
const getById = async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT oh.*, ti.name_th AS table_name
       FROM order_header oh
       LEFT JOIN table_info ti ON oh.table_info_id = ti.table_info_id
       WHERE oh.order_header_id = ?`,
      [req.params.id]
    );
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบคำสั่งซื้อ' });
    }
    const [items] = await db.query(
      `SELECT od.*, p.name_th AS product_name, p.name_en, p.code
       FROM order_details od
       LEFT JOIN products p ON od.product_id = p.product_id
       WHERE od.order_header_id = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...orders[0], items } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/orders - สร้างคำสั่งซื้อใหม่
// body: { customer_name, customer_tel, table_info_id, open_by, items: [{ product_id }] }
const create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { customer_name, customer_tel, table_info_id, open_by, items } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุสินค้าอย่างน้อย 1 รายการ' });
    }

    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      `INSERT INTO order_header (customer_name, customer_tel, table_info_id, open_by, open_date)
       VALUES (?, ?, ?, ?, NOW())`,
      [customer_name || 'ลูกค้าทั่วไป', customer_tel || null, table_info_id || null, open_by || null]
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      const [products] = await conn.query('SELECT price FROM products WHERE product_id = ?', [item.product_id]);
      if (products.length === 0) throw new Error(`ไม่พบสินค้า product_id: ${item.product_id}`);
      const price = products[0].price;
      await conn.query(
        `INSERT INTO order_details (order_header_id, product_id, price, order_status, create_by, create_date)
         VALUES (?, ?, ?, 'pending', ?, NOW())`,
        [orderId, item.product_id, price, open_by || null]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, message: 'สร้างคำสั่งซื้อสำเร็จ', order_header_id: orderId });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    conn.release();
  }
};

// PATCH /api/orders/:id/close - ปิดออเดอร์
const closeOrder = async (req, res) => {
  try {
    const { close_by } = req.body;
    const [result] = await db.query(
      'UPDATE order_header SET close_date = NOW(), close_by = ? WHERE order_header_id = ?',
      [close_by || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบคำสั่งซื้อ' });
    }
    res.json({ success: true, message: 'ปิดออเดอร์สำเร็จ' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/orders/:id/status - อัปเดตสถานะรายการ order_details
const updateDetailStatus = async (req, res) => {
  try {
    const { order_status, update_by } = req.body;
    const [result] = await db.query(
      'UPDATE order_details SET order_status = ?, update_by = ?, update_date = NOW() WHERE order_details_id = ?',
      [order_status, update_by || null, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    }
    res.json({ success: true, message: 'อัปเดตสถานะสำเร็จ' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/orders/open - เปิดออเดอร์ใหม่ (ยังไม่ต้องมีรายการสินค้า)
// body: { customer_name, customer_tel, table_info_id, open_by }
const fun_open_order = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { customer_name, customer_tel, table_info_id, open_by } = req.body;

    await conn.beginTransaction();

    // ตรวจสอบว่าโต๊ะมีอยู่จริง (ถ้าระบุ table_info_id)
    if (table_info_id) {
      const [tables] = await conn.query(
        'SELECT table_info_id, table_status FROM table_info WHERE table_info_id = ?',
        [table_info_id]
      );
      if (tables.length === 0) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: `ไม่พบโต๊ะ table_info_id: ${table_info_id}` });
      }
      if (tables[0].table_status === 'occupied') {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'โต๊ะนี้มีออเดอร์เปิดอยู่แล้ว' });
      }

      // อัปเดตสถานะโต๊ะเป็น occupied
      await conn.query(
        "UPDATE table_info SET table_status = 'occupied' WHERE table_info_id = ?",
        [table_info_id]
      );
    }

    // สร้าง order_header
    const [result] = await conn.query(
      `INSERT INTO order_header (customer_name, customer_tel, table_info_id, open_by, open_date)
       VALUES (?, ?, ?, ?, NOW())`,
      [customer_name || 'ลูกค้าทั่วไป', customer_tel || null, table_info_id || null, open_by || null]
    );
    const order_header_id = result.insertId;

    await conn.commit();

    // ดึงข้อมูล order ที่เพิ่งสร้างพร้อมชื่อโต๊ะ
    const [orderRows] = await db.query(
      `SELECT oh.*, ti.name_th AS table_name, ti.code AS table_code
       FROM order_header oh
       LEFT JOIN table_info ti ON oh.table_info_id = ti.table_info_id
       WHERE oh.order_header_id = ?`,
      [order_header_id]
    );

    res.status(201).json({
      success: true,
      message: 'เปิดออเดอร์สำเร็จ',
      data: orderRows[0],
    });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    conn.release();
  }
};

module.exports = { getAll, getById, create, closeOrder, updateDetailStatus, fun_open_order };
