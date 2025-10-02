const express = require('express');
const router = express.Router();
const bankController = require('../controllers/bankController');
const { authenticate } = require('../middleware/auth');

// All bank routes require authentication
router.use(authenticate);

// Initiate bank transfer
router.post('/initiate', bankController.initiateTransfer);

// Check transfer status
router.get('/status/:reference', bankController.checkTransferStatus);

// Validate bank account
router.post('/validate-account', bankController.validateAccount);

// Calculate transfer fees
router.post('/calculate-fees', bankController.calculateFees);

// Bank webhook endpoint
router.post('/webhook', bankController.handleWebhook);

module.exports = router;
