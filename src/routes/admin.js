const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

// Admin dashboard
router.get('/dashboard', authenticate, authorize('admin'), async (req, res) => {
  try {
    const User = require('../models/User');
    const Payment = require('../models/Payment');
    const Transaction = require('../models/Transaction');

    // Get overall statistics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalPayments = await Payment.countDocuments();
    const completedPayments = await Payment.countDocuments({ status: 'completed' });

    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('paymentReference');

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers
        },
        payments: {
          total: totalPayments,
          completed: completedPayments
        },
        recentTransactions
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving dashboard data'
    });
  }
});

// System health check
router.get('/health', authenticate, authorize('admin'), (req, res) => {
  const os = require('os');
  const process = require('process');

  res.json({
    success: true,
    data: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: os.cpus(),
      loadavg: os.loadavg(),
      platform: os.platform(),
      nodeVersion: process.version
    }
  });
});

module.exports = router;
