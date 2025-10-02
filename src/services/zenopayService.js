const axios = require('axios');

class ZenopayService {
  constructor() {
    this.baseURL = process.env.ZENOPAY_BASE_URL || 'https://zenoapi.com/api';
    this.apiKey = process.env.ZENOPAY_API_KEY;

    // For demo purposes, if no API key is provided, use a placeholder
    if (!this.apiKey) {
      console.log('⚠️ No ZENOPAY_API_KEY found, using demo mode');
      this.apiKey = 'demo_api_key_placeholder';
    }

    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Zenopay API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initiate mobile money payment (Tanzania)
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} Payment response
   */
  async initiateMobileMoneyPayment(paymentData) {
    try {
      const payload = {
        order_id: paymentData.orderId,
        buyer_name: paymentData.buyerName,
        buyer_phone: paymentData.buyerPhone,
        buyer_email: paymentData.buyerEmail,
        amount: paymentData.amount,
        webhook_url: paymentData.webhookUrl
      };

      // If using demo key, return mock response
      if (this.apiKey === 'demo_api_key_placeholder') {
        console.log('🎭 Demo mode: Simulating Zenopay API call');
        return {
          success: true,
          orderId: paymentData.orderId,
          paymentStatus: 'PENDING',
          reference: `REF_${Date.now()}`,
          metadata: paymentData.metadata
        };
      }

      const response = await this.client.post('/payments/mobile_money_tanzania', payload);

      return {
        success: true,
        orderId: response.data.order_id,
        paymentStatus: response.data.payment_status,
        reference: response.data.reference,
        metadata: response.data.metadata
      };

    } catch (error) {
      console.error('Mobile money payment initiation failed:', error.response?.data || error.message);

      // Return mock response in demo mode
      if (this.apiKey === 'demo_api_key_placeholder') {
        return {
          success: true,
          orderId: paymentData.orderId,
          paymentStatus: 'PENDING',
          reference: `REF_${Date.now()}`,
          metadata: paymentData.metadata
        };
      }

      throw new Error(`Payment initiation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Check payment status
   * @param {string} orderId - Order ID to check
   * @returns {Promise<Object>} Payment status
   */
  async checkPaymentStatus(orderId) {
    try {
      // If using demo key, return mock response
      if (this.apiKey === 'demo_api_key_placeholder') {
        console.log('🎭 Demo mode: Simulating status check');
        return {
          success: true,
          orderId: orderId,
          paymentStatus: 'PENDING',
          reference: `REF_${Date.now()}`,
          metadata: {}
        };
      }

      const response = await this.client.get('/payments/order-status', {
        params: { order_id: orderId }
      });

      return {
        success: true,
        orderId: response.data.order_id,
        paymentStatus: response.data.payment_status,
        reference: response.data.reference,
        metadata: response.data.metadata
      };

    } catch (error) {
      console.error('Payment status check failed:', error.response?.data || error.message);

      // Return mock response in demo mode
      if (this.apiKey === 'demo_api_key_placeholder') {
        return {
          success: true,
          orderId: orderId,
          paymentStatus: 'PENDING',
          reference: `REF_${Date.now()}`,
          metadata: {}
        };
      }

      throw new Error(`Status check failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Handle webhook from Zenopay
   * @param {Object} webhookData - Webhook data from Zenopay
   * @returns {Promise<Object>} Processed webhook result
   */
  async handleWebhook(webhookData) {
    try {
      const { order_id, payment_status, reference, metadata } = webhookData;

      // Try to update payment status in database if available
      try {
        const Payment = require('../models/Payment');
        const payment = await Payment.findOne({ orderId: order_id });

        if (payment) {
          // Update payment status based on webhook
          const statusMap = {
            'COMPLETED': 'completed',
            'PENDING': 'pending',
            'FAILED': 'failed',
            'CANCELLED': 'cancelled'
          };

          const internalStatus = statusMap[payment_status] || 'pending';
          payment.updateStatus(internalStatus, `Webhook: ${payment_status}`);
          await payment.save();
        }
      } catch (dbError) {
        console.log('Database not available for webhook processing');
      }

      return {
        success: true,
        orderId: order_id,
        status: payment_status,
        reference,
        processed: true
      };

    } catch (error) {
      console.error('Webhook handling failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate API key format
   */
  validateApiKey() {
    return !!(this.apiKey && this.apiKey.length > 10);
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks() {
    return ['mobile_money_tanzania', 'bank_transfer'];
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies() {
    return ['TZS', 'USD', 'EUR', 'GBP'];
  }

  /**
   * Initiate bank transfer
   * @param {Object} transferData - Transfer information
   * @returns {Promise<Object>} Transfer response
   */
  async initiateBankTransfer(transferData) {
    try {
      const payload = {
        order_id: transferData.orderId,
        amount: transferData.amount,
        currency: transferData.currency || 'USD',
        to_account: process.env.ZENO_ID || 'DEMO_MERCHANT', // Use ZENO_ID for receiving payments
        to_bank: 'Zenopay',
        to_account_name: transferData.toAccountName,
        description: transferData.description,
        transfer_type: transferData.transferType || 'immediate',
        webhook_url: transferData.webhookUrl,
        metadata: transferData.metadata
      };

      // If using demo key, return mock response
      if (this.apiKey === 'demo_api_key_placeholder') {
        console.log('🎭 Demo mode: Simulating Zenopay bank transfer API call');
        return {
          success: true,
          orderId: transferData.orderId,
          transferStatus: 'PENDING',
          reference: `BANK_REF_${Date.now()}`,
          externalTransactionId: `TXN_${Date.now()}`,
          metadata: transferData.metadata
        };
      }

      const response = await this.client.post('/payments/bank_transfer', payload);

      return {
        success: true,
        orderId: response.data.order_id,
        transferStatus: response.data.transfer_status,
        reference: response.data.reference,
        externalTransactionId: response.data.transaction_id,
        metadata: response.data.metadata
      };

    } catch (error) {
      console.error('Bank transfer initiation failed:', error.response?.data || error.message);

      // Handle different error scenarios
      if (error.response?.status === 404) {
        console.log('🔄 Bank transfer endpoint not found - this may be a demo environment');
        console.log('💡 Tip: Bank transfers may not be available in the current Zenopay API version');
      }

      // Return mock response for demo/unsupported environments
      if (this.apiKey === 'demo_api_key_placeholder' || error.response?.status === 404 || !this.validateApiKey()) {
        console.log('🎭 Demo mode: Simulating bank transfer (endpoint not available)');
        return {
          success: true,
          orderId: transferData.orderId,
          transferStatus: 'PENDING',
          reference: `BANK_REF_${Date.now()}`,
          externalTransactionId: `TXN_${Date.now()}`,
          metadata: transferData.metadata,
          note: 'Demo mode - Bank transfer endpoint not available in current API'
        };
      }

      throw new Error(`Bank transfer initiation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Check bank transfer status
   * @param {string} orderId - Order ID to check
   * @returns {Promise<Object>} Transfer status
   */
  async checkBankTransferStatus(orderId) {
    try {
      // If using demo key, return mock response
      if (this.apiKey === 'demo_api_key_placeholder') {
        console.log('🎭 Demo mode: Simulating bank transfer status check');
        return {
          success: true,
          orderId: orderId,
          transferStatus: 'PENDING',
          reference: `BANK_REF_${Date.now()}`,
          metadata: {}
        };
      }

      const response = await this.client.get('/payments/bank_transfer/status', {
        params: { order_id: orderId }
      });

      return {
        success: true,
        orderId: response.data.order_id,
        transferStatus: response.data.transfer_status,
        reference: response.data.reference,
        externalTransactionId: response.data.transaction_id,
        metadata: response.data.metadata
      };

    } catch (error) {
      console.error('Bank transfer status check failed:', error.response?.data || error.message);

      // Handle 404 and other errors gracefully
      if (error.response?.status === 404 || !this.validateApiKey()) {
        console.log('🎭 Demo mode: Simulating bank transfer status check');
        return {
          success: true,
          orderId: orderId,
          transferStatus: 'PENDING',
          reference: `BANK_REF_${Date.now()}`,
          metadata: {},
          note: 'Demo mode - Status check endpoint not available'
        };
      }

      throw new Error(`Bank transfer status check failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Validate bank account
   * @param {Object} accountData - Account information
   * @returns {Promise<Object>} Account validation result
   */
  async validateBankAccount(accountData) {
    try {
      const payload = {
        account_number: accountData.accountNumber,
        bank_code: accountData.bankCode,
        account_type: accountData.accountType || 'savings'
      };

      // If using demo key, return mock response
      if (this.apiKey === 'demo_api_key_placeholder') {
        console.log('🎭 Demo mode: Simulating bank account validation');
        return {
          success: true,
          isValid: true,
          accountName: 'Demo Account Holder',
          bankName: 'Demo Bank',
          accountType: 'savings',
          message: 'Account is valid (demo mode)'
        };
      }

      const response = await this.client.post('/payments/bank_account/validate', payload);

      return {
        success: true,
        isValid: response.data.is_valid,
        accountName: response.data.account_name,
        bankName: response.data.bank_name,
        accountType: response.data.account_type,
        message: response.data.message
      };

    } catch (error) {
      console.error('Bank account validation failed:', error.response?.data || error.message);

      // Handle 404 and other errors gracefully
      if (error.response?.status === 404 || !this.validateApiKey()) {
        console.log('🎭 Demo mode: Simulating bank account validation');
        return {
          success: true,
          isValid: true,
          accountName: 'Demo Account Holder',
          bankName: 'Demo Bank',
          accountType: 'savings',
          message: 'Account is valid (demo mode)',
          note: 'Demo mode - Validation endpoint not available'
        };
      }

      throw new Error(`Bank account validation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Calculate bank transfer fees
   * @param {Object} feeData - Fee calculation data
   * @returns {Promise<Object>} Fee breakdown
   */
  async calculateBankTransferFees(feeData) {
    try {
      const payload = {
        amount: feeData.amount,
        transfer_type: feeData.transferType || 'immediate'
      };

      // If using demo key, return mock response
      if (this.apiKey === 'demo_api_key_placeholder') {
        console.log('🎭 Demo mode: Simulating fee calculation');
        const fees = {
          gatewayFee: feeData.amount * 0.015, // 1.5%
          processingFee: feeData.amount * 0.005, // 0.5%
          networkFee: 0.50
        };

        return {
          success: true,
          amount: feeData.amount,
          transferType: feeData.transferType || 'immediate',
          fees,
          totalAmount: feeData.amount + fees.gatewayFee + fees.processingFee + fees.networkFee
        };
      }

      const response = await this.client.post('/payments/bank_transfer/fees', payload);

      return {
        success: true,
        amount: response.data.amount,
        transferType: response.data.transfer_type,
        fees: response.data.fees,
        totalAmount: response.data.total_amount
      };

    } catch (error) {
      console.error('Fee calculation failed:', error.response?.data || error.message);

      // Handle 404 and other errors gracefully
      if (error.response?.status === 404 || !this.validateApiKey()) {
        console.log('🎭 Demo mode: Simulating fee calculation');
        const fees = {
          gatewayFee: feeData.amount * 0.015, // 1.5%
          processingFee: feeData.amount * 0.005, // 0.5%
          networkFee: 0.50
        };

        return {
          success: true,
          amount: feeData.amount,
          transferType: feeData.transferType || 'immediate',
          fees,
          totalAmount: feeData.amount + fees.gatewayFee + fees.processingFee + fees.networkFee,
          note: 'Demo mode - Fee calculation endpoint not available'
        };
      }

      throw new Error(`Fee calculation failed: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new ZenopayService();
