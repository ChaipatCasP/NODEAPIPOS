const { client, dbType } = require('../config/database');

// GET /api/orders - ดึงคำสั่งซื้อทั้งหมด
const getAll = async (req, res) => {
  try {
    if (dbType === 'supabase') {
      const { data, error } = await client
        .from('order_header')
        .select('*, table_info!left(name_th), order_details!left(order_details_id, price)')
        .order('order_header_id', { ascending: false });
      if (error) throw error;
      const rows = data.map(({ table_info, order_details, ...rest }) => ({
        ...rest,
        table_name: table_info?.name_th || null,
        total_items: order_details?.length || 0,
        total_amount: order_details?.reduce((sum, d) => sum + (Number(d.price) || 0), 0) || 0,
      }));
      res.json({ success: true, data: rows });
    } else {
      const [rows] = await client.query(`
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
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/orders/:id - ดึงคำสั่งซื้อตาม order_header_id พร้อมรายละเอียด
const getById = async (req, res) => {
  try {
    if (dbType === 'supabase') {
      const { data: order, error: orderErr } = await client
        .from('order_header')
        .select('*, table_info!left(name_th)')
        .eq('order_header_id', req.params.id)
        .single();
      if (orderErr) {
        if (orderErr.code === 'PGRST116') return res.status(404).json({ success: false, message: 'ไม่พบคำสั่งซื้อ' });
        throw orderErr;
      }
      const { data: items, error: itemsErr } = await client
        .from('order_details')
        .select('*, products!left(name_th, name_en, code)')
        .eq('order_header_id', req.params.id);
      if (itemsErr) throw itemsErr;
      const { table_info, ...orderRest } = order;
      const formattedItems = items.map(({ products, ...d }) => ({
        ...d,
        product_name: products?.name_th || null,
        name_en: products?.name_en || null,
        code: products?.code || null,
      }));
      res.json({ success: true, data: { ...orderRest, table_name: table_info?.name_th || null, items: formattedItems } });
    } else {
      const [orders] = await client.query(
        `SELECT oh.*, ti.name_th AS table_name
         FROM order_header oh
         LEFT JOIN table_info ti ON oh.table_info_id = ti.table_info_id
         WHERE oh.order_header_id = ?`,
        [req.params.id]
      );
      if (orders.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบคำสั่งซื้อ' });
      const [items] = await client.query(
        `SELECT od.*, p.name_th AS product_name, p.name_en, p.code
         FROM order_details od
         LEFT JOIN products p ON od.product_id = p.product_id
         WHERE od.order_header_id = ?`,
        [req.params.id]
      );
      res.json({ success: true, data: { ...orders[0], items } });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/orders - สร้างคำสั่งซื้อใหม่
// body: { customer_name, customer_tel, table_info_id, open_by, items: [{ product_id }] }
const create = async (req, res) => {
  const { customer_name, customer_tel, table_info_id, open_by, items } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุสินค้าอย่างน้อย 1 รายการ' });
  }

  if (dbType === 'supabase') {
    let orderId = null;
    try {
      const { data: orderData, error: orderErr } = await client
        .from('order_header')
        .insert({ customer_name: customer_name || 'ลูกค้าทั่วไป', customer_tel: customer_tel || null, table_info_id: table_info_id || null, open_by: open_by || null, open_date: new Date().toISOString() })
        .select('order_header_id').single();
      if (orderErr) throw orderErr;
      orderId = orderData.order_header_id;
      for (const item of items) {
        const { data: product, error: pErr } = await client.from('products').select('price').eq('product_id', item.product_id).single();
        if (pErr || !product) throw new Error(`ไม่พบสินค้า product_id: ${item.product_id}`);
        const { error: detailErr } = await client.from('order_details').insert({ order_header_id: orderId, product_id: item.product_id, price: product.price, order_status: 'pending', create_by: open_by || null, create_date: new Date().toISOString() });
        if (detailErr) throw detailErr;
      }
      res.status(201).json({ success: true, message: 'สร้างคำสั่งซื้อสำเร็จ', order_header_id: orderId });
    } catch (error) {
      if (orderId) await client.from('order_header').delete().eq('order_header_id', orderId);
      res.status(500).json({ success: false, message: error.message });
    }
  } else {
    const conn = await client.getConnection();
    try {
      await conn.beginTransaction();
      const [orderResult] = await conn.query(
        `INSERT INTO order_header (customer_name, customer_tel, table_info_id, open_by, open_date) VALUES (?, ?, ?, ?, NOW())`,
        [customer_name || 'ลูกค้าทั่วไป', customer_tel || null, table_info_id || null, open_by || null]
      );
      const orderId = orderResult.insertId;
      for (const item of items) {
        const [products] = await conn.query('SELECT price FROM products WHERE product_id = ?', [item.product_id]);
        if (products.length === 0) throw new Error(`ไม่พบสินค้า product_id: ${item.product_id}`);
        await conn.query(
          `INSERT INTO order_details (order_header_id, product_id, price, order_status, create_by, create_date) VALUES (?, ?, ?, 'pending', ?, NOW())`,
          [orderId, item.product_id, products[0].price, open_by || null]
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
  }
};

// POST /api/orders/close - ปิดออเดอร์
// body: { order_header_id, close_by }
const closeOrder = async (req, res) => {
  try {
    const { order_header_id, close_by } = req.body;
    if (!order_header_id) return res.status(400).json({ success: false, message: 'กรุณาระบุ order_header_id' });
    if (dbType === 'supabase') {
      const { data, error } = await client.from('order_header')
        .update({ close_date: new Date().toISOString(), close_by: close_by || null, status: 'closed' })
        .eq('order_header_id', order_header_id).select('order_header_id');
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ success: false, message: `ไม่พบ order_header_id: ${order_header_id}` });
    } else {
      const [result] = await client.query(
        'UPDATE order_header SET close_date = NOW(), close_by = ?, status = ? WHERE order_header_id = ?',
        [close_by || null, 'closed', order_header_id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: `ไม่พบ order_header_id: ${order_header_id}` });
    }
    res.json({ success: true, message: 'ปิดออเดอร์สำเร็จ', order_header_id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PATCH /api/orders/:id/status - อัปเดตสถานะรายการ order_details
const updateDetailStatus = async (req, res) => {
  try {
    const { order_status, update_by } = req.body;
    if (dbType === 'supabase') {
      const { data, error } = await client.from('order_details')
        .update({ order_status, update_by: update_by || null, update_date: new Date().toISOString() })
        .eq('order_details_id', req.params.id).select('order_details_id');
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    } else {
      const [result] = await client.query(
        'UPDATE order_details SET order_status = ?, update_by = ?, update_date = NOW() WHERE order_details_id = ?',
        [order_status, update_by || null, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    }
    res.json({ success: true, message: 'อัปเดตสถานะสำเร็จ' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/orders/open - เปิดออเดอร์ใหม่ (ยังไม่ต้องมีรายการสินค้า)
// body: { customer_name, customer_tel, table_info_id, open_by }
const fun_open_order = async (req, res) => {
  const { customer_name, customer_tel, table_info_id, open_by } = req.body;

  if (dbType === 'supabase') {
    let tableUpdated = false;
    let order_header_id = null;
    try {
      if (table_info_id) {
        const { data: tableData, error: tableErr } = await client.from('table_info').select('table_info_id, table_status').eq('table_info_id', table_info_id).single();
        if (tableErr || !tableData) return res.status(404).json({ success: false, message: `ไม่พบโต๊ะ table_info_id: ${table_info_id}` });
        if (tableData.table_status === 'occupied') return res.status(400).json({ success: false, message: 'โต๊ะนี้มีออเดอร์เปิดอยู่แล้ว' });
        const { error: updateErr } = await client.from('table_info').update({ table_status: 'occupied' }).eq('table_info_id', table_info_id);
        if (updateErr) throw updateErr;
        tableUpdated = true;
      }
      const { data: orderData, error: orderErr } = await client.from('order_header')
        .insert({ customer_name: customer_name || 'ลูกค้าทั่วไป', customer_tel: customer_tel || null, table_info_id: table_info_id || null, open_by: open_by || null, open_date: new Date().toISOString() })
        .select('order_header_id').single();
      if (orderErr) throw orderErr;
      order_header_id = orderData.order_header_id;
      const { data: fullOrder, error: fetchErr } = await client.from('order_header').select('*, table_info!left(name_th, code)').eq('order_header_id', order_header_id).single();
      if (fetchErr) throw fetchErr;
      const { table_info, ...rest } = fullOrder;
      res.status(201).json({ success: true, message: 'เปิดออเดอร์สำเร็จ', data: { ...rest, table_name: table_info?.name_th || null, table_code: table_info?.code || null } });
    } catch (error) {
      if (order_header_id) await client.from('order_header').delete().eq('order_header_id', order_header_id);
      if (tableUpdated && table_info_id) await client.from('table_info').update({ table_status: 'available' }).eq('table_info_id', table_info_id);
      res.status(500).json({ success: false, message: error.message });
    }
  } else {
    const conn = await client.getConnection();
    try {
      await conn.beginTransaction();
      if (table_info_id) {
        const [tables] = await conn.query('SELECT table_info_id, table_status FROM table_info WHERE table_info_id = ?', [table_info_id]);
        if (tables.length === 0) { await conn.rollback(); return res.status(404).json({ success: false, message: `ไม่พบโต๊ะ table_info_id: ${table_info_id}` }); }
        if (tables[0].table_status === 'occupied') { await conn.rollback(); return res.status(400).json({ success: false, message: 'โต๊ะนี้มีออเดอร์เปิดอยู่แล้ว' }); }
        await conn.query("UPDATE table_info SET table_status = 'occupied' WHERE table_info_id = ?", [table_info_id]);
      }
      const [result] = await conn.query(
        `INSERT INTO order_header (customer_name, customer_tel, table_info_id, open_by, open_date) VALUES (?, ?, ?, ?, NOW())`,
        [customer_name || 'ลูกค้าทั่วไป', customer_tel || null, table_info_id || null, open_by || null]
      );
      const order_header_id = result.insertId;
      await conn.commit();
      const [orderRows] = await client.query(
        `SELECT oh.*, ti.name_th AS table_name, ti.code AS table_code FROM order_header oh LEFT JOIN table_info ti ON oh.table_info_id = ti.table_info_id WHERE oh.order_header_id = ?`,
        [order_header_id]
      );
      res.status(201).json({ success: true, message: 'เปิดออเดอร์สำเร็จ', data: orderRows[0] });
    } catch (error) {
      await conn.rollback();
      res.status(500).json({ success: false, message: error.message });
    } finally {
      conn.release();
    }
  }
};

// POST /api/orders/add - เพิ่มสินค้าเข้า order ที่มีอยู่แล้ว
// body: { order_header_id, items: [{ product_id, quantity? }], create_by }
const fun_add_order = async (req, res) => {
  const { order_header_id, items, create_by } = req.body;
  if (!order_header_id) return res.status(400).json({ success: false, message: 'กรุณาระบุ order_header_id' });
  if (!items || items.length === 0) return res.status(400).json({ success: false, message: 'กรุณาระบุสินค้าอย่างน้อย 1 รายการ' });

  if (dbType === 'supabase') {
    const insertedIds = [];
    try {
      const { data: orderData, error: orderErr } = await client.from('order_header').select('order_header_id, close_date').eq('order_header_id', order_header_id).single();
      if (orderErr || !orderData) return res.status(404).json({ success: false, message: `ไม่พบ order_header_id: ${order_header_id}` });
      if (orderData.close_date) return res.status(400).json({ success: false, message: 'ออเดอร์นี้ปิดไปแล้ว ไม่สามารถเพิ่มรายการได้' });
      const inserted = [];
      for (const item of items) {
        if (!item.product_id) throw new Error('กรุณาระบุ product_id ในแต่ละรายการ');
        const { data: product, error: pErr } = await client.from('products').select('product_id, name_th, price').eq('product_id', item.product_id).single();
        if (pErr || !product) throw new Error(`ไม่พบสินค้า product_id: ${item.product_id}`);
        const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
        for (let i = 0; i < qty; i++) {
          const { data: detail, error: detailErr } = await client.from('order_details')
            .insert({ order_header_id, product_id: item.product_id, price: product.price, order_status: 'pending', create_by: create_by || null, create_date: new Date().toISOString() })
            .select('order_details_id').single();
          if (detailErr) throw detailErr;
          insertedIds.push(detail.order_details_id);
          inserted.push({ order_details_id: detail.order_details_id, product_id: item.product_id, name_th: product.name_th, price: product.price, order_status: 'pending' });
        }
      }
      res.status(201).json({ success: true, message: `เพิ่มสินค้าเข้า order #${order_header_id} สำเร็จ ${inserted.length} รายการ`, order_header_id, inserted });
    } catch (error) {
      if (insertedIds.length > 0) await client.from('order_details').delete().in('order_details_id', insertedIds);
      res.status(500).json({ success: false, message: error.message });
    }
  } else {
    const conn = await client.getConnection();
    try {
      await conn.beginTransaction();
      const [orders] = await conn.query('SELECT order_header_id, close_date FROM order_header WHERE order_header_id = ?', [order_header_id]);
      if (orders.length === 0) { await conn.rollback(); return res.status(404).json({ success: false, message: `ไม่พบ order_header_id: ${order_header_id}` }); }
      if (orders[0].close_date) { await conn.rollback(); return res.status(400).json({ success: false, message: 'ออเดอร์นี้ปิดไปแล้ว ไม่สามารถเพิ่มรายการได้' }); }
      const inserted = [];
      for (const item of items) {
        if (!item.product_id) throw new Error('กรุณาระบุ product_id ในแต่ละรายการ');
        const [products] = await conn.query('SELECT product_id, name_th, price FROM products WHERE product_id = ?', [item.product_id]);
        if (products.length === 0) throw new Error(`ไม่พบสินค้า product_id: ${item.product_id}`);
        const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
        const price = products[0].price;
        for (let i = 0; i < qty; i++) {
          const [detail] = await conn.query(
            `INSERT INTO order_details (order_header_id, product_id, price, order_status, create_by, create_date) VALUES (?, ?, ?, 'pending', ?, NOW())`,
            [order_header_id, item.product_id, price, create_by || null]
          );
          inserted.push({ order_details_id: detail.insertId, product_id: item.product_id, name_th: products[0].name_th, price, order_status: 'pending' });
        }
      }
      await conn.commit();
      res.status(201).json({ success: true, message: `เพิ่มสินค้าเข้า order #${order_header_id} สำเร็จ ${inserted.length} รายการ`, order_header_id, inserted });
    } catch (error) {
      await conn.rollback();
      res.status(500).json({ success: false, message: error.message });
    } finally {
      conn.release();
    }
  }
};

module.exports = { getAll, getById, create, closeOrder, updateDetailStatus, fun_open_order, fun_add_order };
