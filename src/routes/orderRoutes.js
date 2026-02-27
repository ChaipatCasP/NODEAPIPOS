const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orderController');

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.patch('/:id/close', ctrl.closeOrder);
router.patch('/details/:id/status', ctrl.updateDetailStatus);

module.exports = router;
