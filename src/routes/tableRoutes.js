const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tableController');

/**
 * @swagger
 * /api/tables:
 *   get:
 *     tags: [Tables]
 *     summary: ดึงโต๊ะทั้งหมด
 *     responses:
 *       200:
 *         description: รายการโต๊ะ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/TableInfo' }
 */
router.get('/', ctrl.getAll);

/**
 * @swagger
 * /api/tables/{id}:
 *   get:
 *     tags: [Tables]
 *     summary: ดึงโต๊ะตาม table_info_id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: ข้อมูลโต๊ะ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/TableInfo' }
 *       404:
 *         description: ไม่พบโต๊ะ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:id', ctrl.getById);

/**
 * @swagger
 * /api/tables:
 *   post:
 *     tags: [Tables]
 *     summary: เพิ่มโต๊ะใหม่
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TableInput' }
 *     responses:
 *       201:
 *         description: เพิ่มโต๊ะสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 table_info_id: { type: integer }
 *       400:
 *         description: ข้อมูลไม่ครบ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', ctrl.create);

/**
 * @swagger
 * /api/tables/{id}:
 *   put:
 *     tags: [Tables]
 *     summary: แก้ไขโต๊ะ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TableInput' }
 *     responses:
 *       200:
 *         description: แก้ไขสำเร็จ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       404:
 *         description: ไม่พบโต๊ะ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.put('/:id', ctrl.update);

/**
 * @swagger
 * /api/tables/{id}:
 *   delete:
 *     tags: [Tables]
 *     summary: ลบโต๊ะ
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SuccessResponse' }
 *       404:
 *         description: ไม่พบโต๊ะ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/:id', ctrl.remove);

module.exports = router;
