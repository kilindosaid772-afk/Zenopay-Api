const express = require('express');
const router = express.Router();

// Mobile Money specific routes
router.get('/networks', (req, res) => {
  const mobileMoneyService = require('../services/mobileMoneyService');
  res.json({
    success: true,
    networks: mobileMoneyService.getSupportedNetworks()
  });
});

router.get('/networks/:network', (req, res) => {
  const mobileMoneyService = require('../services/mobileMoneyService');
  const { network } = req.params;

  if (!mobileMoneyService.isNetworkSupported(network)) {
    return res.status(404).json({
      success: false,
      message: `Network ${network} not supported`
    });
  }

  res.json({
    success: true,
    network: mobileMoneyService.getNetworkConfig(network)
  });
});

module.exports = router;
