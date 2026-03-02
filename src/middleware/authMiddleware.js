const jwt = require('jsonwebtoken');

/**
 * Middleware ตรวจสอบ JWT Token
 * Header: Authorization: Bearer <token>
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'ไม่มี Token กรุณา Login ก่อน' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { user_id, email, roles }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token หมดอายุ กรุณา Login ใหม่' });
    }
    return res.status(401).json({ success: false, message: 'Token ไม่ถูกต้อง' });
  }
};

/**
 * Middleware ตรวจสอบ Role
 * ใช้ต่อจาก authMiddleware
 * @param {...string} roles - role_code ที่อนุญาต เช่น 'admin', 'staff'
 */
const requireRole = (...roles) => (req, res, next) => {
  const userRoles = req.user?.roles || [];
  const hasRole = roles.some((r) => userRoles.includes(r));
  if (!hasRole) {
    return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์เข้าถึง' });
  }
  next();
};

module.exports = { authMiddleware, requireRole };
