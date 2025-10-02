const zenopayService = require('../services/zenopayService');
const { v4: uuidv4 } = require('uuid');

class PaymentController {

  // Mobile Money Payment (Tanzania) - Zenopay API Format
  async initiateMobileMoneyPayment(req, res) {
    try {
      const {
        buyerName,
        buyerPhone,
        buyerEmail,
        amount,
        webhookUrl,
        metadata
      } = req.body;

      if (!buyerName || !buyerPhone || !buyerEmail || !amount) {
        return res.status(400).json({
          success: false,
          message: 'Buyer name, phone, email, and amount are required'
        });
      }

      // Generate unique order ID (UUID format as per Zenopay)
      const orderId = uuidv4();

      const paymentData = {
        orderId,
        buyerName,
        buyerPhone,
        buyerEmail,
        amount,
        webhookUrl: webhookUrl || `${req.protocol}://${req.get('host')}/api/payments/webhook`,
        metadata
      };

      // Call actual Zenopay API
      const result = await zenopayService.initiateMobileMoneyPayment(paymentData);

      // Try to save to database if available
      try {
        const Payment = require('../models/Payment');
        const payment = new Payment({
          orderId,
          amount,
          currency: 'TZS', // Default for Tanzania mobile money
          description: `Mobile Money Payment - ${buyerName}`,
          paymentMethod: {
            type: 'mobile_money',
            provider: 'mobile_money_tanzania'
          },
          payer: {
            name: buyerName,
            email: buyerEmail,
            phone: buyerPhone
          },
          merchant: req.user.id,
          status: result.paymentStatus === 'COMPLETED' ? 'completed' : 'pending',
          externalReference: result.reference,
          metadata: result.metadata
        });

        await payment.save();
      } catch (dbError) {
        console.log('Database not available, continuing without saving payment record');
      }

      res.json({
        success: true,
        message: 'Mobile money payment initiated',
        data: {
          orderId: result.orderId,
          paymentStatus: result.paymentStatus,
          reference: result.reference,
          amount: amount
        }
      });

    } catch (error) {
      console.error('Mobile money payment initiation failed:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Check payment status - Zenopay API Format
  async checkPaymentStatus(req, res) {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required'
        });
      }

      const result = await zenopayService.checkPaymentStatus(orderId);

      // Try to update database if available
      try {
        const Payment = require('../models/Payment');
        const payment = await Payment.findOne({ orderId });

        if (payment) {
          const statusMap = {
            'COMPLETED': 'completed',
            'PENDING': 'pending',
            'FAILED': 'failed',
            'CANCELLED': 'cancelled'
          };

          const internalStatus = statusMap[result.paymentStatus] || 'pending';
          if (payment.status !== internalStatus) {
            payment.updateStatus(internalStatus, `Status updated from Zenopay`);
            await payment.save();
          }
        }
      } catch (dbError) {
        console.log('Database not available for status update');
      }

      res.json({
        success: true,
        data: {
          orderId: result.orderId,
          paymentStatus: result.paymentStatus,
          reference: result.reference,
          metadata: result.metadata
        }
      });

    } catch (error) {
      console.error('Payment status check failed:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Handle webhook from Zenopay
  async handleWebhook(req, res) {
    try {
      const webhookData = req.body;

      const result = await zenopayService.handleWebhook(webhookData);

      res.json({
        success: true,
        message: 'Webhook processed successfully',
        data: result
      });

    } catch (error) {
      console.error('Webhook handling failed:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get payments list - requires database
  async getPayments(req, res) {
    try {
      try {
        const Payment = require('../models/Payment');
        const {
          page = 1,
          limit = 20,
          status,
          startDate,
          endDate
        } = req.query;

        const query = { merchant: req.user.id };

        if (status) query.status = status;

        if (startDate || endDate) {
          query.createdAt = {};
          if (startDate) query.createdAt.$gte = new Date(startDate);
          if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const skip = (page - 1) * limit;

        const payments = await Payment.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate('merchant', 'name businessName');

        const total = await Payment.countDocuments(query);

        res.json({
          success: true,
          data: {
            payments,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total,
              pages: Math.ceil(total / limit)
            }
          }
        });

      } catch (dbError) {
        res.status(503).json({
          success: false,
          message: 'Database not available. Payment tracking features require MongoDB.'
        });
      }

    } catch (error) {
      console.error('Payment retrieval failed:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get payment by order ID - requires database
  async getPayment(req, res) {
    try {
      const { orderId } = req.params;

      try {
        const Payment = require('../models/Payment');
        const payment = await Payment.findOne({
          orderId,
          merchant: req.user.id
        }).populate('merchant', 'name businessName');

        if (!payment) {
          return res.status(404).json({
            success: false,
            message: 'Payment not found'
          });
        }

        res.json({
          success: true,
          data: payment
        });

      } catch (dbError) {
        res.status(503).json({
          success: false,
          message: 'Database not available. Payment lookup requires MongoDB.'
        });
      }

    } catch (error) {
      console.error('Payment retrieval failed:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get Zenopay API information
  async getZenopayInfo(req, res) {
    res.json({
      success: true,
      data: {
        name: 'Zenopay Payment Gateway',
        version: '1.0.0',
        baseUrl: process.env.ZENOPAY_BASE_URL,
        supportedNetworks: zenopayService.getSupportedNetworks(),
        supportedCurrencies: zenopayService.getSupportedCurrencies(),
        apiKeyRequired: true,
        authenticationHeader: 'x-api-key',
        webhookSupported: true,
        databaseConnected: false // Will be true when MongoDB is available
      }
    });
  }
}

module.exports = new PaymentController();
