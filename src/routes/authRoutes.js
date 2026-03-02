const express = require('express');
const router = express.Router();
const { register, login, getProfile, logout, changePassword } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Login / Register / Profile
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: สมัครสมาชิก
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: secret123
 *               role_code:
 *                 type: string
 *                 description: role_code จากตาราง roles (เช่น staff, admin)
 *                 example: staff
 *     responses:
 *       201:
 *         description: สมัครสำเร็จ
 *       409:
 *         description: email ซ้ำ
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: เข้าสู่ระบบ
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: secret123
 *     responses:
 *       200:
 *         description: เข้าสู่ระบบสำเร็จ ได้ access_token + refresh_token
 *       401:
 *         description: email/password ไม่ถูกต้อง
 *       403:
 *         description: บัญชีถูกล็อคหรือระงับ
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: ดูข้อมูลโปรไฟล์พร้อม roles และ permissions
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ข้อมูลโปรไฟล์ + roles + permissions
 *       401:
 *         description: ไม่มี Token หรือ Token หมดอายุ
 */
router.get('/profile', authMiddleware, getProfile);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: ออกจากระบบ (revoke session)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               session_id:
 *                 type: string
 *                 description: ถ้าไม่ส่งจะ revoke ทุก session
 *     responses:
 *       200:
 *         description: ออกจากระบบสำเร็จ
 */
router.post('/logout', authMiddleware, logout);

/**
 * @swagger
 * /api/auth/change-password:
 *   put:
 *     summary: เปลี่ยนรหัสผ่าน (revoke ทุก session อัตโนมัติ)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [old_password, new_password]
 *             properties:
 *               old_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *     responses:
 *       200:
 *         description: เปลี่ยนรหัสผ่านสำเร็จ
 */
router.put('/change-password', authMiddleware, changePassword);

module.exports = router;
