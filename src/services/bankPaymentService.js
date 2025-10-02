const axios = require('axios');
const crypto = require('crypto');

class BankPaymentService {
  constructor() {
    this.config = {
      baseUrl: process.env.BANK_BASE_URL,
      apiKey: process.env.BANK_API_KEY,
      apiSecret: process.env.BANK_API_SECRET,
      timeout: 60000 // Longer timeout for bank operations
    };

    this.client = null;
    this.initializeClient();
  }

  initializeClient() {
    if (this.config.apiKey && this.config.apiSecret) {
      this.client = axios.create({
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-API-Key': this.config.apiKey,
          'X-API-Secret': this.config.apiSecret
        }
      });

      // Add request interceptor for authentication
      this.client.interceptors.request.use(
        (config) => {
          config.headers['X-Timestamp'] = new Date().toISOString();
          config.headers['X-Signature'] = this.generateSignature(config.data);
          return config;
        },
        (error) => Promise.reject(error)
      );

      // Add response interceptor for error handling
      this.client.interceptors.response.use(
        (response) => response,
        (error) => {
          console.error('Bank API Error:', error.response?.data || error.message);
          return Promise.reject(error);
        }
      );
    }
  }

  generateSignature(data) {
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify(data) + timestamp + this.config.apiSecret;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Initiate bank transfer
   * @param {Object} transferData - Transfer information
   * @returns {Promise<Object>} Transfer response
   */
  async initiateTransfer(transferData) {
    try {
      if (!this.client) {
        throw new Error('Bank payment client not configured');
      }

      const payload = {
        amount: transferData.amount,
        currency: transferData.currency || 'USD',
        fromAccount: transferData.fromAccount,
        toAccount: transferData.toAccount,
        toBank: transferData.toBank,
        toAccountName: transferData.toAccountName,
        reference: transferData.reference,
        description: transferData.description || 'Bank transfer via Zenopay',
        callbackUrl: transferData.callbackUrl,
        transferType: transferData.transferType || 'immediate' // immediate, scheduled
      };

      const response = await this.client.post('/v1/transfers/initiate', payload);

      return {
        success: true,
        reference: transferData.reference,
        externalTransactionId: response.data.transactionId,
        status: 'pending',
        response: response.data
      };

    } catch (error) {
      console.error('Failed to initiate bank transfer:', error.message);
      throw new Error(`Bank transfer initiation failed: ${error.message}`);
    }
  }

  /**
   * Check transfer status
   * @param {string} reference - Transfer reference
   * @returns {Promise<Object>} Transfer status
   */
  async checkTransferStatus(reference) {
    try {
      if (!this.client) {
        throw new Error('Bank payment client not configured');
      }

      const response = await this.client.get('/v1/transfers/status', {
        params: { reference }
      });

      return {
        success: true,
        reference,
        status: this.mapStatus(response.data.status),
        externalTransactionId: response.data.transactionId,
        response: response.data
      };

    } catch (error) {
      console.error('Failed to check transfer status:', error.message);
      throw new Error(`Transfer status check failed: ${error.message}`);
    }
  }

  /**
   * Get bank account details
   * @param {string} accountNumber - Account number to verify
   * @returns {Promise<Object>} Account details
   */
  async getAccountDetails(accountNumber) {
    try {
      if (!this.client) {
        throw new Error('Bank payment client not configured');
      }

      const response = await this.client.get('/v1/accounts/verify', {
        params: { accountNumber }
      });

      return {
        success: true,
        accountNumber: response.data.accountNumber,
        accountName: response.data.accountName,
        bankName: response.data.bankName,
        accountType: response.data.accountType,
        isValid: response.data.isValid
      };

    } catch (error) {
      console.error('Failed to get account details:', error.message);
      throw new Error(`Account verification failed: ${error.message}`);
    }
  }

  /**
   * Handle bank transfer callback
   * @param {Object} callbackData - Callback data from bank
   * @returns {Promise<Object>} Processed callback result
   */
  async handleCallback(callbackData) {
    try {
      this.validateCallbackData(callbackData);

      const { reference, status, transactionId } = callbackData;

      // Update payment status in database
      const Payment = require('../models/Payment');
      const payment = await Payment.findOne({ reference });

      if (!payment) {
        throw new Error(`Payment not found for reference: ${reference}`);
      }

      // Map external status to internal status
      const internalStatus = this.mapStatus(status);
      payment.updateStatus(internalStatus, `Bank callback: ${status}`, null);

      // Create transaction record
      const Transaction = require('../models/Transaction');
      const transaction = new Transaction({
        type: 'transfer',
        category: payment.amount > 0 ? 'incoming' : 'outgoing',
        amount: Math.abs(payment.amount),
        currency: payment.currency,
        paymentMethod: {
          type: 'bank_transfer',
          provider: 'bank'
        },
        status: internalStatus,
        paymentReference: payment._id,
        externalTransactionId: transactionId,
        from: {
          account: callbackData.fromAccount,
          bank: callbackData.fromBank,
          type: 'external'
        },
        to: {
          user: payment.merchant,
          type: 'merchant'
        }
      });

      await transaction.save();
      await payment.save();

      return {
        success: true,
        reference,
        status: internalStatus,
        transactionId: transaction.transactionId
      };

    } catch (error) {
      console.error('Bank callback handling failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate callback data
   */
  validateCallbackData(data) {
    const requiredFields = ['reference', 'status', 'transactionId'];

    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }

  /**
   * Map external status to internal status
   */
  mapStatus(externalStatus) {
    const statusMap = {
      'INITIATED': 'pending',
      'PENDING': 'pending',
      'PROCESSING': 'processing',
      'IN_PROGRESS': 'processing',
      'COMPLETED': 'completed',
      'SUCCESSFUL': 'completed',
      'SETTLED': 'completed',
      'FAILED': 'failed',
      'REJECTED': 'failed',
      'CANCELLED': 'cancelled',
      'RETURNED': 'failed'
    };

    return statusMap[externalStatus] || 'pending';
  }

  /**
   * Calculate bank transfer fees
   * @param {number} amount - Transfer amount
   * @param {string} transferType - Type of transfer
   * @returns {Object} Fee breakdown
   */
  calculateFees(amount, transferType = 'immediate') {
    const fees = {
      gatewayFee: 0,
      processingFee: 0,
      networkFee: 0
    };

    // Base processing fee (percentage)
    fees.processingFee = amount * 0.015; // 1.5%

    // Transfer type specific fees
    if (transferType === 'immediate') {
      fees.gatewayFee = amount * 0.005; // 0.5% for immediate
    } else if (transferType === 'scheduled') {
      fees.gatewayFee = amount * 0.002; // 0.2% for scheduled
    }

    // Minimum fees
    fees.processingFee = Math.max(fees.processingFee, 1.00);
    fees.gatewayFee = Math.max(fees.gatewayFee, 0.50);

    return fees;
  }

  /**
   * Validate bank account
   * @param {Object} accountData - Account information
   * @returns {Promise<Object>} Validation result
   */
  async validateAccount(accountData) {
    try {
      const { accountNumber, bankCode, accountType } = accountData;

      if (!accountNumber || !bankCode) {
        throw new Error('Account number and bank code are required');
      }

      // Basic format validation
      if (!/^\d{10,18}$/.test(accountNumber)) {
        throw new Error('Invalid account number format');
      }

      // Get account details from bank API
      const accountDetails = await this.getAccountDetails(accountNumber);

      return {
        isValid: accountDetails.isValid,
        accountName: accountDetails.accountName,
        bankName: accountDetails.bankName,
        accountType: accountDetails.accountType,
        message: accountDetails.isValid ? 'Account is valid' : 'Account verification failed'
      };

    } catch (error) {
      console.error('Account validation failed:', error.message);
      return {
        isValid: false,
        message: error.message
      };
    }
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies() {
    return ['USD', 'EUR', 'GBP', 'Local'];
  }

  /**
   * Get supported transfer types
   */
  getSupportedTransferTypes() {
    return ['immediate', 'scheduled'];
  }

  /**
   * Check if service is configured
   */
  isConfigured() {
    return !!(this.config.apiKey && this.config.apiSecret && this.client);
  }
}

module.exports = new BankPaymentService();
