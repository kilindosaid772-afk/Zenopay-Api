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

// Bank Transfer endpoints - Zenopay API Format
router.post('/bank-transfer/initiate', PaymentController.initiateBankTransfer);
router.get('/bank-transfer/status/:orderId', PaymentController.checkBankTransferStatus);
router.post('/bank-transfer/validate-account', PaymentController.validateBankAccount);
router.post('/bank-transfer/calculate-fees', PaymentController.calculateBankTransferFees);

module.exports = router;
