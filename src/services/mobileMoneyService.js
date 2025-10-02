const axios = require('axios');

/**
 * Mobile Money Service - Handles mobile money payments for Tanzania
 * This service integrates with the main Zenopay service for receiving payments
 */
class MobileMoneyService {
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
        console.error('Mobile Money API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Initiate mobile money payment to merchant account (Receiving payments)
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
        merchant_account_id: process.env.ZENO_ID || 'DEMO_MERCHANT',
        webhook_url: paymentData.webhookUrl,
        description: paymentData.description || 'Mobile money payment'
      };

      const response = await this.client.post('/payments/mobile_money_tanzania', payload);

      return {
        success: true,
        orderId: response.data.order_id,
        paymentStatus: response.data.payment_status,
        reference: response.data.reference,
        merchantAccountId: response.data.merchant_account_id,
        metadata: response.data.metadata
      };

    } catch (error) {
      console.error('Mobile money payment initiation failed:', error.response?.data || error.message);
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
      throw new Error(`Status check failed: ${error.response?.data?.message || error.message}`);
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

module.exports = new MobileMoneyService();
