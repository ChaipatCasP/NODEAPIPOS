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
/**
 * @swagger
 * /api/orders/open:
 *   post:
 *     tags: [Orders]
 *     summary: fun_open_order - เปิดออเดอร์ใหม่
 *     description: |
 *       สร้าง order_header ใหม่โดยยังไม่ต้องมีสินค้า
 *       หากระบุ table_info_id จะอัปเดตสถานะโต๊ะเป็น **occupied** อัตโนมัติ
 *       และจะตรวจสอบว่าโต๊ะไม่ได้ถูกใช้งานอยู่แล้ว
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customer_name:
 *                 type: string
 *                 example: สมชาย ใจดี
 *               customer_tel:
 *                 type: string
 *                 example: '0812345678'
 *               table_info_id:
 *                 type: integer
 *                 example: 1
 *               open_by:
 *                 type: string
 *                 example: staff01
 *     responses:
 *       201:
 *         description: เปิดออเดอร์สำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: เปิดออเดอร์สำเร็จ }
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_header_id: { type: integer, example: 5 }
 *                     customer_name: { type: string, example: สมชาย ใจดี }
 *                     customer_tel: { type: string, example: '0812345678' }
 *                     table_info_id: { type: integer, example: 1 }
 *                     table_name: { type: string, example: โต๊ะ A1 }
 *                     table_code: { type: string, example: T01 }
 *                     open_by: { type: string, example: staff01 }
 *                     open_date: { type: string, format: date-time }
 *                     close_date: { type: string, nullable: true }
 *                     close_by: { type: string, nullable: true }
 *       400:
 *         description: โต๊ะมีออเดอร์เปิดอยู่แล้ว
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: ไม่พบโต๊ะที่ระบุ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/open', ctrl.fun_open_order);

/**
 * @swagger
 * /api/orders/add:
 *   post:
 *     tags: [Orders]
 *     summary: fun_add_order - เพิ่มสินค้าเข้า order ที่มีอยู่
 *     description: |
 *       เพิ่มรายการสินค้าเข้า `order_details` ของ order ที่ระบุด้วย `order_header_id`
 *       - ดึงราคาจากตาราง `products` อัตโนมัติ
 *       - รองรับ `quantity` (ค่า default = 1)
 *       - ตรวจสอบว่า order ยังไม่ถูกปิด (close_date เป็น NULL)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_header_id, items]
 *             properties:
 *               order_header_id:
 *                 type: integer
 *                 example: 1
 *               create_by:
 *                 type: string
 *                 example: staff01
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [product_id]
 *                   properties:
 *                     product_id:
 *                       type: integer
 *                       example: 2
 *                     quantity:
 *                       type: integer
 *                       example: 2
 *                       description: จำนวนที่ต้องการเพิ่ม (default = 1)
 *     responses:
 *       201:
 *         description: เพิ่มสินค้าสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "เพิ่มสินค้าเข้า order #1 สำเร็จ 2 รายการ" }
 *                 order_header_id: { type: integer, example: 1 }
 *                 inserted:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       order_details_id: { type: integer }
 *                       product_id: { type: integer }
 *                       name_th: { type: string }
 *                       price: { type: number }
 *                       order_status: { type: string, example: pending }
 *       400:
 *         description: ออเดอร์ปิดแล้ว หรือข้อมูลไม่ครบ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: ไม่พบ order หรือสินค้า
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/add', ctrl.fun_add_order);

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
 * /api/orders/close:
 *   post:
 *     tags: [Orders]
 *     summary: ปิด order (บันทึก close_date, close_by)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_header_id]
 *             properties:
 *               order_header_id: { type: integer, example: 1 }
 *               close_by: { type: string, example: staff01 }
 *     responses:
 *       200:
 *         description: ปิด order สำเร็จ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       400:
 *         description: ไม่ระบุ order_header_id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: ไม่พบ order
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/close', ctrl.closeOrder);

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
