require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// อ่านจาก .env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in environment variables.');
  process.exit(1);
}

// สร้าง client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
  },
});

/**
 * ทดสอบการเชื่อมต่อกับ Supabase โดย select ข้อมูลจาก table เล็กๆ
 */
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('product_id')
      .limit(1);

    if (error) {
      // ถ้า table products ยังไม่มี ลอง auth session แทน
      const { error: authErr } = await supabase.auth.getSession();
      if (authErr) {
        throw authErr;
      }
      console.log('✅ Connected to Supabase (auth session retrieved).');
    } else {
      console.log('✅ เชื่อมต่อ Supabase สำเร็จ -', SUPABASE_URL);
    }
  } catch (err) {
    console.error('❌ เชื่อมต่อ Supabase ไม่สำเร็จ:', err.message || err);
    process.exit(1);
  }
}

// ทดสอบการเชื่อมต่อเมื่อโมดูลถูกโหลด
testConnection();

// ส่งออก client เพื่อใช้งานในส่วนอื่นของแอป
module.exports = supabase;
