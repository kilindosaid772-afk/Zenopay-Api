const express = require('express');
const router = express.Router();
const controlNumberController = require('../controllers/controlNumberController');
const { authenticate } = require('../middleware/auth');

// All control number routes require authentication
router.use(authenticate);

// Generate control number
router.post('/generate', controlNumberController.generateControlNumber);

// Generate batch of control numbers
router.post('/generate-batch', controlNumberController.generateBatch);

// Validate control number (can be used without auth for customer validation)
router.get('/validate/:controlNumber', controlNumberController.validateControlNumber);

// Get merchant's control numbers
router.get('/merchant', controlNumberController.getMerchantControlNumbers);

// Mark control number as used
router.put('/use/:controlNumber', controlNumberController.useControlNumber);

// Get control number statistics
router.get('/stats', controlNumberController.getStatistics);

// Clean up expired control numbers (admin function)
router.post('/cleanup-expired', controlNumberController.cleanupExpired);

module.exports = router;
