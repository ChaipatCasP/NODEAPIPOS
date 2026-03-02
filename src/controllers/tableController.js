const { client, dbType } = require('../config/database');

// GET /api/tables - ดึงโต๊ะทั้งหมด
const getAll = async (req, res) => {
  try {
    if (dbType === 'supabase') {
      const { data, error } = await client.from('table_info').select('*').order('table_info_id', { ascending: true });
      if (error) throw error;
      res.json({ success: true, data });
    } else {
      const [rows] = await client.query('SELECT * FROM table_info ORDER BY table_info_id ASC');
      res.json({ success: true, data: rows });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/tables/:id
const getById = async (req, res) => {
  try {
    if (dbType === 'supabase') {
      const { data, error } = await client.from('table_info').select('*').eq('table_info_id', req.params.id).single();
      if (error) {
        if (error.code === 'PGRST116') return res.status(404).json({ success: false, message: 'ไม่พบโต๊ะ' });
        throw error;
      }
      res.json({ success: true, data });
    } else {
      const [rows] = await client.query('SELECT * FROM table_info WHERE table_info_id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบโต๊ะ' });
      res.json({ success: true, data: rows[0] });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/tables
// body: { code, name_en, name_th, total_sit, picture, table_status }
const create = async (req, res) => {
  try {
    const { code, name_en, name_th, total_sit, picture, table_status } = req.body;
    if (!code || !name_th) {
      return res.status(400).json({ success: false, message: 'กรุณากรอก code และ name_th' });
    }
    if (dbType === 'supabase') {
      const { data, error } = await client.from('table_info')
        .insert({ code, name_en: name_en || null, name_th, total_sit: total_sit || 0, picture: picture || null, table_status: table_status || 'available' })
        .select('table_info_id').single();
      if (error) throw error;
      res.status(201).json({ success: true, message: 'เพิ่มโต๊ะสำเร็จ', table_info_id: data.table_info_id });
    } else {
      const [result] = await client.query(
        'INSERT INTO table_info (code, name_en, name_th, total_sit, picture, table_status) VALUES (?, ?, ?, ?, ?, ?)',
        [code, name_en || null, name_th, total_sit || 0, picture || null, table_status || 'available']
      );
      res.status(201).json({ success: true, message: 'เพิ่มโต๊ะสำเร็จ', table_info_id: result.insertId });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/tables/:id
const update = async (req, res) => {
  try {
    const { code, name_en, name_th, total_sit, picture, table_status } = req.body;
    if (dbType === 'supabase') {
      const { data, error } = await client.from('table_info')
        .update({ code, name_en, name_th, total_sit, picture, table_status })
        .eq('table_info_id', req.params.id).select('table_info_id');
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบโต๊ะ' });
      res.json({ success: true, message: 'แก้ไขโต๊ะสำเร็จ' });
    } else {
      const [result] = await client.query(
        'UPDATE table_info SET code = ?, name_en = ?, name_th = ?, total_sit = ?, picture = ?, table_status = ? WHERE table_info_id = ?',
        [code, name_en, name_th, total_sit, picture, table_status, req.params.id]
      );
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบโต๊ะ' });
      res.json({ success: true, message: 'แก้ไขโต๊ะสำเร็จ' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/tables/:id
const remove = async (req, res) => {
  try {
    if (dbType === 'supabase') {
      const { data, error } = await client.from('table_info').delete().eq('table_info_id', req.params.id).select('table_info_id');
      if (error) throw error;
      if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบโต๊ะ' });
      res.json({ success: true, message: 'ลบโต๊ะสำเร็จ' });
    } else {
      const [result] = await client.query('DELETE FROM table_info WHERE table_info_id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบโต๊ะ' });
      res.json({ success: true, message: 'ลบโต๊ะสำเร็จ' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getAll, getById, create, update, remove };
