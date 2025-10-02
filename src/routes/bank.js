const express = require('express');
const router = express.Router();

// Bank specific routes
router.get('/currencies', (req, res) => {
  const bankPaymentService = require('../services/bankPaymentService');
  res.json({
    success: true,
    currencies: bankPaymentService.getSupportedCurrencies()
  });
});

router.get('/transfer-types', (req, res) => {
  const bankPaymentService = require('../services/bankPaymentService');
  res.json({
    success: true,
    transferTypes: bankPaymentService.getSupportedTransferTypes()
  });
});

router.get('/status', (req, res) => {
  const bankPaymentService = require('../services/bankPaymentService');
  res.json({
    success: true,
    configured: bankPaymentService.isConfigured()
  });
});

module.exports = router;
