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
    return ['mobile_money_tanzania'];
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies() {
    return ['TZS', 'USD'];
  }
}

module.exports = new ZenopayService();
