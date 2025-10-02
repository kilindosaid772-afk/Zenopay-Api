const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Webhook endpoints (no authentication required)
router.post('/zenopay', webhookController.handleZenopayWebhook);
router.post('/bank-transfer', webhookController.handleBankTransferWebhook);

// Webhook status and monitoring
router.get('/status', webhookController.getWebhookStatus);

module.exports = router;
