const ControlNumber = require('../models/ControlNumber');

class ControlNumberService {
  constructor() {
    this.defaultPrefix = process.env.CONTROL_NUMBER_PREFIX || 'ZENO';
    this.defaultLength = parseInt(process.env.CONTROL_NUMBER_LENGTH) || 12;
  }

  /**
   * Generate a single control number
   * @param {Object} options - Control number options
   * @returns {Promise<Object>} Generated control number
   */
  async generateControlNumber(options = {}) {
    try {
      const {
        amount,
        currency = 'USD',
        paymentMethod,
        merchant,
        generatedBy,
        description,
        prefix = this.defaultPrefix,
        expiresInDays = 7,
        validForDays = 7,
        isReusable = false,
        maxUses = 1,
        customer = {}
      } = options;

      // Validate required fields
      if (!amount || !merchant || !generatedBy) {
        throw new Error('Amount, merchant, and generatedBy are required');
      }

      if (!paymentMethod || !paymentMethod.type) {
        throw new Error('Payment method and type are required');
      }

      const expiresAt = new Date(Date.now() + (expiresInDays * 24 * 60 * 60 * 1000));
      const validUntil = new Date(Date.now() + (validForDays * 24 * 60 * 60 * 1000));

      const controlNumber = new ControlNumber({
        amount,
        currency,
        paymentMethod,
        merchant,
        generatedBy,
        description,
        prefix,
        expiresAt,
        validUntil,
        isReusable,
        maxUses,
        customer
      });

      const saved = await controlNumber.save();

      return {
        success: true,
        controlNumber: saved.controlNumber,
        reference: saved._id,
        amount: saved.amount,
        currency: saved.currency,
        expiresAt: saved.expiresAt,
        validUntil: saved.validUntil,
        status: saved.status
      };

    } catch (error) {
      console.error('Control number generation failed:', error.message);
      throw new Error(`Failed to generate control number: ${error.message}`);
    }
  }

  /**
   * Generate multiple control numbers in batch
   * @param {Object} options - Batch options
   * @returns {Promise<Object>} Batch generation result
   */
  async generateBatch(options = {}) {
    try {
      const {
        count = 1,
        amount,
        currency = 'USD',
        paymentMethod,
        merchant,
        generatedBy,
        description,
        prefix = this.defaultPrefix,
        expiresInDays = 7,
        validForDays = 7,
        isReusable = false,
        maxUses = 1
      } = options;

      if (count < 1 || count > 1000) {
        throw new Error('Batch count must be between 1 and 1000');
      }

      const batchResult = await ControlNumber.generateBatch({
        count,
        amount,
        currency,
        paymentMethod,
        merchant,
        generatedBy,
        prefix,
        expiresInDays,
        validForDays,
        isReusable,
        maxUses
      });

      return {
        success: true,
        batchId: batchResult.batchId,
        count: batchResult.count,
        controlNumbers: batchResult.controlNumbers.map(cn => ({
          controlNumber: cn.controlNumber,
          amount: cn.amount,
          currency: cn.currency,
          expiresAt: cn.expiresAt
        }))
      };

    } catch (error) {
      console.error('Batch control number generation failed:', error.message);
      throw new Error(`Batch generation failed: ${error.message}`);
    }
  }

  /**
   * Validate control number
   * @param {string} controlNumber - Control number to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateControlNumber(controlNumber) {
    try {
      if (!controlNumber) {
        throw new Error('Control number is required');
      }

      const cn = await ControlNumber.findOne({
        controlNumber: controlNumber.toUpperCase(),
        status: 'active'
      });

      if (!cn) {
        return {
          isValid: false,
          message: 'Control number not found or expired'
        };
      }

      if (cn.isExpired) {
        return {
          isValid: false,
          message: 'Control number has expired'
        };
      }

      if (!cn.canBeUsed()) {
        return {
          isValid: false,
          message: 'Control number cannot be used'
        };
      }

      return {
        isValid: true,
        controlNumber: cn.controlNumber,
        amount: cn.amount,
        currency: cn.currency,
        paymentMethod: cn.paymentMethod,
        merchant: cn.merchant,
        expiresAt: cn.expiresAt,
        validUntil: cn.validUntil,
        isReusable: cn.isReusable,
        maxUses: cn.maxUses,
        currentUses: cn.currentUses
      };

    } catch (error) {
      console.error('Control number validation failed:', error.message);
      return {
        isValid: false,
        message: error.message
      };
    }
  }

  /**
   * Use control number for payment
   * @param {string} controlNumber - Control number to use
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} Usage result
   */
  async useControlNumber(controlNumber, paymentData = {}) {
    try {
      const { phoneNumber, customerName, network } = paymentData;

      const cn = await ControlNumber.findOne({
        controlNumber: controlNumber.toUpperCase(),
        status: 'active'
      });

      if (!cn) {
        throw new Error('Control number not found or not active');
      }

      if (!cn.canBeUsed()) {
        throw new Error('Control number cannot be used');
      }

      // Mark as used
      const paymentReference = `CN_${controlNumber}_${Date.now()}`;
      cn.markAsUsed(paymentReference, {
        name: customerName,
        phone: phoneNumber,
        network
      });

      await cn.save();

      return {
        success: true,
        controlNumber: cn.controlNumber,
        paymentReference,
        amount: cn.amount,
        currency: cn.currency,
        status: 'used'
      };

    } catch (error) {
      console.error('Control number usage failed:', error.message);
      throw new Error(`Failed to use control number: ${error.message}`);
    }
  }

  /**
   * Get control number details
   * @param {string} controlNumber - Control number
   * @returns {Promise<Object>} Control number details
   */
  async getControlNumberDetails(controlNumber) {
    try {
      const cn = await ControlNumber.findOne({ controlNumber: controlNumber.toUpperCase() })
        .populate('merchant', 'name businessName email')
        .populate('generatedBy', 'name email')
        .populate('paymentReference');

      if (!cn) {
        throw new Error('Control number not found');
      }

      return {
        success: true,
        controlNumber: cn.controlNumber,
        amount: cn.amount,
        currency: cn.currency,
        status: cn.status,
        paymentMethod: cn.paymentMethod,
        merchant: cn.merchant,
        generatedBy: cn.generatedBy,
        customer: cn.customer,
        expiresAt: cn.expiresAt,
        validUntil: cn.validUntil,
        usedAt: cn.usedAt,
        usedBy: cn.usedBy,
        isReusable: cn.isReusable,
        maxUses: cn.maxUses,
        currentUses: cn.currentUses,
        createdAt: cn.createdAt,
        paymentReference: cn.paymentReference
      };

    } catch (error) {
      console.error('Failed to get control number details:', error.message);
      throw new Error(`Failed to retrieve control number: ${error.message}`);
    }
  }

  /**
   * Extend control number validity
   * @param {string} controlNumber - Control number to extend
   * @param {number} days - Days to extend
   * @returns {Promise<Object>} Extension result
   */
  async extendControlNumber(controlNumber, days = 7) {
    try {
      const cn = await ControlNumber.findOne({
        controlNumber: controlNumber.toUpperCase(),
        status: 'active'
      });

      if (!cn) {
        throw new Error('Control number not found or not active');
      }

      cn.extendValidity(days);
      await cn.save();

      return {
        success: true,
        controlNumber: cn.controlNumber,
        extendedUntil: cn.validUntil,
        days: days
      };

    } catch (error) {
      console.error('Control number extension failed:', error.message);
      throw new Error(`Failed to extend control number: ${error.message}`);
    }
  }

  /**
   * Cancel control number
   * @param {string} controlNumber - Control number to cancel
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelControlNumber(controlNumber) {
    try {
      const cn = await ControlNumber.findOneAndUpdate(
        {
          controlNumber: controlNumber.toUpperCase(),
          status: 'active'
        },
        {
          status: 'cancelled',
          cancelledAt: new Date()
        },
        { new: true }
      );

      if (!cn) {
        throw new Error('Control number not found or not active');
      }

      return {
        success: true,
        controlNumber: cn.controlNumber,
        status: 'cancelled'
      };

    } catch (error) {
      console.error('Control number cancellation failed:', error.message);
      throw new Error(`Failed to cancel control number: ${error.message}`);
    }
  }

  /**
   * Search control numbers
   * @param {Object} filters - Search filters
   * @returns {Promise<Object>} Search results
   */
  async searchControlNumbers(filters = {}) {
    try {
      const {
        merchant,
        status,
        paymentMethod,
        amountMin,
        amountMax,
        currency,
        expiresAfter,
        expiresBefore,
        usedAfter,
        usedBefore,
        page = 1,
        limit = 20
      } = filters;

      const query = {};

      if (merchant) query.merchant = merchant;
      if (status) query.status = status;
      if (paymentMethod) query['paymentMethod.type'] = paymentMethod;
      if (currency) query.currency = currency;

      if (amountMin || amountMax) {
        query.amount = {};
        if (amountMin) query.amount.$gte = amountMin;
        if (amountMax) query.amount.$lte = amountMax;
      }

      if (expiresAfter || expiresBefore) {
        query.expiresAt = {};
        if (expiresAfter) query.expiresAt.$gte = expiresAfter;
        if (expiresBefore) query.expiresAt.$lte = expiresBefore;
      }

      if (usedAfter || usedBefore) {
        query.usedAt = {};
        if (usedAfter) query.usedAt.$gte = usedAfter;
        if (usedBefore) query.usedAt.$lte = usedBefore;
      }

      const skip = (page - 1) * limit;

      const controlNumbers = await ControlNumber.find(query)
        .populate('merchant', 'name businessName')
        .populate('generatedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ControlNumber.countDocuments(query);

      return {
        success: true,
        controlNumbers: controlNumbers.map(cn => ({
          controlNumber: cn.controlNumber,
          amount: cn.amount,
          currency: cn.currency,
          status: cn.status,
          paymentMethod: cn.paymentMethod,
          merchant: cn.merchant,
          expiresAt: cn.expiresAt,
          usedAt: cn.usedAt,
          createdAt: cn.createdAt
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      console.error('Control number search failed:', error.message);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Get control number statistics
   * @param {Object} filters - Date range filters
   * @returns {Promise<Object>} Statistics
   */
  async getControlNumberStats(filters = {}) {
    try {
      const { merchant, startDate, endDate } = filters;

      const matchStage = {};

      if (merchant) matchStage.merchant = merchant;

      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = startDate;
        if (endDate) matchStage.createdAt.$lte = endDate;
      }

      const stats = await ControlNumber.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              status: '$status',
              paymentMethod: '$paymentMethod.type',
              currency: '$currency'
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      // Overall stats
      const overallStats = await ControlNumber.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalGenerated: { $sum: 1 },
            totalUsed: {
              $sum: { $cond: [{ $eq: ['$status', 'used'] }, 1, 0] }
            },
            totalActive: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            totalExpired: {
              $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
            },
            totalAmount: { $sum: '$amount' },
            usedAmount: {
              $sum: { $cond: [{ $eq: ['$status', 'used'] }, '$amount', 0] }
            }
          }
        }
      ]);

      return {
        success: true,
        overall: overallStats[0] || {},
        breakdown: stats
      };

    } catch (error) {
      console.error('Control number statistics failed:', error.message);
      throw new Error(`Statistics retrieval failed: ${error.message}`);
    }
  }
}

module.exports = new ControlNumberService();
