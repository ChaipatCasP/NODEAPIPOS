const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orderController');

/**
 * @swagger
 * /api/orders:
 *   get:
 *     tags: [Orders]
 *     summary: ดึง order_header ทั้งหมด
 *     responses:
 *       200:
 *         description: รายการคำสั่งซื้อ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/OrderHeader' }
 */
router.get('/', ctrl.getAll);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: ดึงคำสั่งซื้อพร้อมรายละเอียด order_details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: ข้อมูลคำสั่งซื้อและรายการสินค้า
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/OrderHeader' }
 *       404:
 *         description: ไม่พบคำสั่งซื้อ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:id', ctrl.getById);

/**
 * @swagger
 * /api/orders:
 *   post:
 *     tags: [Orders]
 *     summary: สร้างคำสั่งซื้อใหม่ (transaction)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OrderInput' }
 *     responses:
 *       201:
 *         description: สร้างคำสั่งซื้อสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 order_header_id: { type: integer }
 *       400:
 *         description: ข้อมูลไม่ครบ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', ctrl.create);

/**
 * @swagger
 * /api/orders/{id}/close:
 *   patch:
 *     tags: [Orders]
 *     summary: ปิด order (บันทึก close_date, close_by)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               close_by: { type: string, example: staff01 }
 *     responses:
 *       200:
 *         description: ปิด order สำเร็จ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       404:
 *         description: ไม่พบคำสั่งซื้อ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:id/close', ctrl.closeOrder);

/**
 * @swagger
 * /api/orders/details/{id}/status:
 *   patch:
 *     tags: [Orders]
 *     summary: อัปเดตสถานะ order_details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: order_details_id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_status]
 *             properties:
 *               order_status: { type: string, example: completed }
 *               update_by: { type: string, example: staff01 }
 *     responses:
 *       200:
 *         description: อัปเดตสำเร็จ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       404:
 *         description: ไม่พบรายการ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/details/:id/status', ctrl.updateDetailStatus);

module.exports = router;
