const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Tackypat2244',
  database: process.env.DB_NAME || 'demo',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ทดสอบการเชื่อมต่อ
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ เชื่อมต่อ MySQL สำเร็จ - database:', process.env.DB_NAME || 'demo');
    conn.release();
  } catch (error) {
    console.error('❌ เชื่อมต่อ MySQL ไม่สำเร็จ:', error.message);
    process.exit(1);
  }
}

testConnection();

module.exports = pool;
