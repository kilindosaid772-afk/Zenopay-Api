const ControlNumber = require('../models/ControlNumber');
const Payment = require('../models/Payment');

/**
 * Control Number Controller - Handles control number generation and validation
 */
class ControlNumberController {

  constructor() {
    // Bind all methods to ensure proper 'this' context
    this.generateControlNumber = this.generateControlNumber.bind(this);
    this.validateControlNumber = this.validateControlNumber.bind(this);
    this.getMerchantControlNumbers = this.getMerchantControlNumbers.bind(this);
    this.useControlNumber = this.useControlNumber.bind(this);
    this.generateBatch = this.generateBatch.bind(this);
    this.getStatistics = this.getStatistics.bind(this);
    this.cleanupExpired = this.cleanupExpired.bind(this);
    this.getPaymentInstructions = this.getPaymentInstructions.bind(this);
  }

  /**
   * Generate a new control number
   */
  async generateControlNumber(req, res) {
    try {
      const {
        amount,
        currency = 'TZS',
        description,
        paymentMethod = 'mobile_money',
        provider = 'any',
        expiresInHours = 24,
        validForHours = 24,
        isReusable = false,
        maxUses = 1,
        customerInfo
      } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid amount is required'
        });
      }

      // Generate unique control number
      let controlNumber;
      let attempts = 0;
      const maxAttempts = 10;

      do {
        controlNumber = ControlNumber.generateControlNumber();
        attempts++;

        if (attempts >= maxAttempts) {
          return res.status(500).json({
            success: false,
            message: 'Unable to generate unique control number'
          });
        }
      } while (await ControlNumber.findOneWithTimeout({ controlNumber }));

      // Calculate expiration dates
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (expiresInHours * 60 * 60 * 1000));
      const validUntil = new Date(now.getTime() + (validForHours * 60 * 60 * 1000));

      // Create control number record
      const controlNum = new ControlNumber({
        controlNumber,
        amount,
        currency,
        description,
        paymentMethod: {
          type: paymentMethod,
          provider
        },
        merchant: req.user.id || req.user.type === 'api_key' ? 'zenopay_api_user' : req.user.id,
        generatedBy: req.user.id || req.user.type === 'api_key' ? 'zenopay_api_user' : req.user.id,
        expiresAt,
        validUntil,
        isReusable,
        maxUses,
        customer: customerInfo
      });

      await controlNum.save();

      res.status(201).json({
        success: true,
        message: 'Control number generated successfully',
        data: {
          controlNumber: controlNum.controlNumber,
          amount: controlNum.amount,
          currency: controlNum.currency,
          expiresAt: controlNum.expiresAt,
          validUntil: controlNum.validUntil,
          paymentMethod: controlNum.paymentMethod,
          description: controlNum.description,
          instructions: this.getPaymentInstructions(controlNum)
        }
      });

    } catch (error) {
      console.error('❌ Control number generation error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Validate control number
   */
  async validateControlNumber(req, res) {
    try {
      const { controlNumber } = req.params;
      const { amount, phoneNumber, network } = req.query;

      const controlNum = await ControlNumber.validateControlNumber(controlNumber);

      if (!controlNum) {
        return res.status(404).json({
          success: false,
          message: 'Control number not found or expired'
        });
      }

      // Check if amount matches (if provided)
      if (amount && parseFloat(amount) !== controlNum.amount) {
        return res.status(400).json({
          success: false,
          message: `Amount mismatch. Expected: ${controlNum.amount}, Received: ${amount}`,
          expectedAmount: controlNum.amount
        });
      }

      res.status(200).json({
        success: true,
        valid: true,
        data: {
          controlNumber: controlNum.controlNumber,
          amount: controlNum.amount,
          currency: controlNum.currency,
          description: controlNum.description,
          expiresAt: controlNum.expiresAt,
          paymentMethod: controlNum.paymentMethod,
          merchantName: controlNum.merchant?.name || (typeof controlNum.merchant === 'string' ? 'Merchant' : 'Merchant'),
          instructions: this.getPaymentInstructions(controlNum, network)
        }
      });

    } catch (error) {
      console.error('❌ Control number validation error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get control numbers for merchant
   */
  async getMerchantControlNumbers(req, res) {
    try {
      const { status = 'active', limit = 50, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const controlNumbers = await ControlNumber.findWithTimeout({
        merchant: req.user.id || req.user.type === 'api_key' ? 'zenopay_api_user' : req.user.id,
        status: status
      })
      .populate('paymentReference', 'amount currency status createdAt')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

      const total = await ControlNumber.countDocuments({
        merchant: req.user.id || req.user.type === 'api_key' ? 'zenopay_api_user' : req.user.id,
        status: status
      });

      res.status(200).json({
        success: true,
        data: {
          controlNumbers: controlNumbers.map(cn => ({
            controlNumber: cn.controlNumber,
            amount: cn.amount,
            currency: cn.currency,
            status: cn.status,
            description: cn.description,
            createdAt: cn.createdAt,
            expiresAt: cn.expiresAt,
            usedAt: cn.usedAt,
            usedBy: cn.usedBy,
            paymentReference: cn.paymentReference,
            isExpired: cn.isExpired,
            isValid: cn.isValid
          })),
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('❌ Merchant control numbers fetch error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Mark control number as used
   */
  async useControlNumber(req, res) {
    try {
      const { controlNumber } = req.params;
      const { paymentReference, customerInfo, network } = req.body;

      const controlNum = await ControlNumber.findOneWithTimeout({
        controlNumber,
        status: 'active'
      });

      if (!controlNum) {
        return res.status(404).json({
          success: false,
          message: 'Control number not found or already used'
        });
      }

      if (!controlNum.canBeUsed()) {
        return res.status(400).json({
          success: false,
          message: 'Control number is expired or invalid'
        });
      }

      // Mark as used
      controlNum.markAsUsed(paymentReference, customerInfo, network);
      await controlNum.save();

      res.status(200).json({
        success: true,
        message: 'Control number marked as used successfully',
        data: {
          controlNumber: controlNum.controlNumber,
          status: controlNum.status,
          usedAt: controlNum.usedAt,
          usedBy: controlNum.usedBy
        }
      });

    } catch (error) {
      console.error('❌ Control number usage error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Generate multiple control numbers (batch)
   */
  async generateBatch(req, res) {
    try {
      const {
        count = 10,
        amount,
        currency = 'TZS',
        paymentMethod = 'mobile_money',
        provider = 'any',
        expiresInDays = 7,
        validForDays = 7,
        description,
        isReusable = false,
        maxUses = 1
      } = req.body;

      if (count < 1 || count > 100) {
        return res.status(400).json({
          success: false,
          message: 'Count must be between 1 and 100'
        });
      }

      const batchResult = await ControlNumber.generateBatch({
        count,
        amount,
        currency,
        paymentMethod,
        merchant: req.user.id || req.user.type === 'api_key' ? 'zenopay_api_user' : req.user.id,
        generatedBy: req.user.id || req.user.type === 'api_key' ? 'zenopay_api_user' : req.user.id,
        expiresInDays,
        validForDays,
        isReusable,
        maxUses
      });

      res.status(201).json({
        success: true,
        message: `${batchResult.count} control numbers generated successfully`,
        data: {
          batchId: batchResult.batchId,
          count: batchResult.count,
          controlNumbers: batchResult.controlNumbers.map(cn => ({
            controlNumber: cn.controlNumber,
            amount: cn.amount,
            currency: cn.currency,
            expiresAt: cn.expiresAt
          }))
        }
      });

    } catch (error) {
      console.error('❌ Batch control number generation error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get control number statistics
   */
  async getStatistics(req, res) {
    try {
      const merchantId = req.user.id || req.user.type === 'api_key' ? 'zenopay_api_user' : req.user.id;

      const stats = await ControlNumber.aggregate([
        { $match: { merchant: merchantId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', 'active'] },
                      { $gt: ['$expiresAt', new Date()] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            used: { $sum: { $cond: [{ $eq: ['$status', 'used'] }, 1, 0] } },
            expired: { $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] } },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      const result = stats[0] || {
        total: 0,
        active: 0,
        used: 0,
        expired: 0,
        totalAmount: 0
      };

      res.status(200).json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('❌ Control number statistics error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get payment instructions for different mobile money networks
   */
  getPaymentInstructions(controlNum, network = null) {
    const instructions = {
      all: {
        steps: [
          `1. Open your mobile money app`,
          `2. Select "Pay Bill" or "Send to Business"`,
          `3. Enter Control Number: ${controlNum.controlNumber}`,
          `4. Enter Amount: ${controlNum.amount}`,
          `5. Confirm payment`
        ]
      }
    };

    // Network-specific instructions
    if (network === 'mtn' || controlNum.paymentMethod?.provider === 'mtn') {
      instructions.mpesa = {
        app: 'M-Pesa',
        steps: [
          '1. Open M-Pesa App',
          '2. Select "Pay Bill"',
          '3. Enter Business Number: ' + controlNum.controlNumber,
          '4. Enter Amount: ' + controlNum.amount,
          '5. Enter Reference: Your name or order ID',
          '6. Confirm Payment'
        ]
      };
    }

    if (network === 'airtel' || controlNum.paymentMethod?.provider === 'airtel') {
      instructions.airtel = {
        app: 'Airtel Money',
        steps: [
          '1. Open Airtel Money App',
          '2. Select "Make Payments"',
          '3. Choose "Pay Bill"',
          '4. Enter Till Number: ' + controlNum.controlNumber,
          '5. Enter Amount: ' + controlNum.amount,
          '6. Confirm Payment'
        ]
      };
    }

    return instructions;
  }

  /**
   * Clean up expired control numbers
   */
  async cleanupExpired(req, res) {
    try {
      const expiredControlNumbers = await ControlNumber.findExpiredWithTimeout();

      for (const controlNum of expiredControlNumbers) {
        controlNum.status = 'expired';
        await controlNum.save();
      }

      res.status(200).json({
        success: true,
        message: `${expiredControlNumbers.length} control numbers marked as expired`,
        expiredCount: expiredControlNumbers.length
      });

    } catch (error) {
      console.error('❌ Control number cleanup error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new ControlNumberController();
