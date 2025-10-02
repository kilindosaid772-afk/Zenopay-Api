const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { authenticate } = require('../middleware/auth');

// All service routes require authentication (except access checking)
router.use(authenticate);

// Service management
router.post('/create', serviceController.createService);
router.get('/:serviceId', serviceController.getService);

// Service access (customers check access here)
router.get('/:serviceId/access', serviceController.checkServiceAccess);

// Customer services
router.get('/customer/:customerId', serviceController.getCustomerServices);

// Service payment initiation
router.post('/initiate-payment', serviceController.initiateServicePayment);

// Admin: Check for expired services
router.post('/check-expired', serviceController.checkExpiredServices);

module.exports = router;
