const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const PaymentController = require('../controllers/paymentController');

// All payment routes require Zenopay API key authentication
router.use(authenticateApiKey);

// Mobile Money Payment (Tanzania) - matches Zenopay API
router.post('/mobile_money_tanzania', PaymentController.initiateMobileMoneyPayment);

// Check payment status - matches Zenopay API
router.get('/order-status/:orderId', PaymentController.checkPaymentStatus);

// Webhook endpoint for Zenopay callbacks
router.post('/webhook', PaymentController.handleWebhook);

// Payment management (requires authentication)
router.get('/list', PaymentController.getPayments);
router.get('/:orderId', PaymentController.getPayment);

// Zenopay API information
router.get('/info', PaymentController.getZenopayInfo);

module.exports = router;
