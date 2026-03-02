require('dotenv').config();

/**
 * DB_TYPE=mysql   → ใช้ MySQL ผ่าน mysql2
 * DB_TYPE=supabase → ใช้ Supabase (Postgres)
 */
const DB_TYPE = (process.env.DB_TYPE || 'mysql').toLowerCase();

if (!['mysql', 'supabase'].includes(DB_TYPE)) {
  console.error(`❌ DB_TYPE ไม่ถูกต้อง: "${DB_TYPE}" (ใช้ได้: mysql, supabase)`);
  process.exit(1);
}

const client = DB_TYPE === 'supabase'
  ? require('./supabaseClient')
  : require('./db');

console.log(`🔌 Database mode: ${DB_TYPE.toUpperCase()}`);

module.exports = { client, dbType: DB_TYPE };
