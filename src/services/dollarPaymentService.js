const axios = require('axios');

class DollarPaymentService {
  constructor() {
    this.stripe = null;
    this.paypal = null;
    this.initializeServices();
  }

  initializeServices() {
    // Initialize Stripe
    if (process.env.STRIPE_SECRET_KEY) {
      const Stripe = require('stripe');
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }

    // Initialize PayPal (basic setup)
    if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
      this.paypal = {
        clientId: process.env.PAYPAL_CLIENT_ID,
        clientSecret: process.env.PAYPAL_CLIENT_SECRET,
        mode: process.env.PAYPAL_MODE || 'sandbox',
        baseUrl: process.env.PAYPAL_MODE === 'live'
          ? 'https://api-m.paypal.com'
          : 'https://api-m.sandbox.paypal.com'
      };
    }
  }

  /**
   * Create Stripe payment intent
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} Payment intent response
   */
  async createStripePaymentIntent(paymentData) {
    try {
      if (!this.stripe) {
        throw new Error('Stripe not configured');
      }

      const {
        amount,
        currency = 'usd',
        description,
        customerEmail,
        customerName,
        metadata = {}
      } = paymentData;

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        description: description || 'Payment via Zenopay',
        receipt_email: customerEmail,
        metadata: {
          customerName,
          ...metadata
        },
        automatic_payment_methods: {
          enabled: true,
        }
      });

      return {
        success: true,
        provider: 'stripe',
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: 'pending',
        amount: amount,
        currency: currency
      };

    } catch (error) {
      console.error('Stripe payment intent creation failed:', error.message);
      throw new Error(`Stripe payment failed: ${error.message}`);
    }
  }

  /**
   * Confirm Stripe payment
   * @param {string} paymentIntentId - Payment intent ID
   * @returns {Promise<Object>} Payment confirmation
   */
  async confirmStripePayment(paymentIntentId) {
    try {
      if (!this.stripe) {
        throw new Error('Stripe not configured');
      }

      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      return {
        success: true,
        provider: 'stripe',
        paymentIntentId,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        charges: paymentIntent.charges
      };

    } catch (error) {
      console.error('Stripe payment confirmation failed:', error.message);
      throw new Error(`Payment confirmation failed: ${error.message}`);
    }
  }

  /**
   * Create PayPal payment order
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} PayPal order response
   */
  async createPayPalOrder(paymentData) {
    try {
      if (!this.paypal) {
        throw new Error('PayPal not configured');
      }

      const accessToken = await this.getPayPalAccessToken();

      const {
        amount,
        currency = 'USD',
        description,
        customerEmail,
        returnUrl,
        cancelUrl
      } = paymentData;

      const payload = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: amount.toString()
          },
          description: description || 'Payment via Zenopay'
        }],
        payer: {
          email_address: customerEmail
        },
        application_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl,
          brand_name: 'Zenopay',
          user_action: 'PAY_NOW'
        }
      };

      const response = await axios.post(
        `${this.paypal.baseUrl}/v2/checkout/orders`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        provider: 'paypal',
        orderId: response.data.id,
        status: 'pending',
        approvalUrl: response.data.links.find(link => link.rel === 'approve')?.href,
        amount: amount,
        currency: currency
      };

    } catch (error) {
      console.error('PayPal order creation failed:', error.message);
      throw new Error(`PayPal payment failed: ${error.message}`);
    }
  }

  /**
   * Capture PayPal payment
   * @param {string} orderId - PayPal order ID
   * @returns {Promise<Object>} Payment capture result
   */
  async capturePayPalPayment(orderId) {
    try {
      if (!this.paypal) {
        throw new Error('PayPal not configured');
      }

      const accessToken = await this.getPayPalAccessToken();

      const response = await axios.post(
        `${this.paypal.baseUrl}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        provider: 'paypal',
        orderId,
        status: response.data.status === 'COMPLETED' ? 'completed' : 'pending',
        captureId: response.data.purchase_units[0].payments.captures[0].id,
        amount: parseFloat(response.data.purchase_units[0].amount.value),
        currency: response.data.purchase_units[0].amount.currency_code
      };

    } catch (error) {
      console.error('PayPal payment capture failed:', error.message);
      throw new Error(`Payment capture failed: ${error.message}`);
    }
  }

  /**
   * Get PayPal access token
   * @returns {Promise<string>} Access token
   */
  async getPayPalAccessToken() {
    try {
      const auth = Buffer.from(
        `${this.paypal.clientId}:${this.paypal.clientSecret}`
      ).toString('base64');

      const response = await axios.post(
        `${this.paypal.baseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return response.data.access_token;

    } catch (error) {
      console.error('PayPal access token failed:', error.message);
      throw new Error('Failed to authenticate with PayPal');
    }
  }

  /**
   * Handle Stripe webhook
   * @param {Object} webhookData - Webhook data from Stripe
   * @returns {Promise<Object>} Processed webhook result
   */
  async handleStripeWebhook(webhookData) {
    try {
      const { type, data } = webhookData;

      if (type === 'payment_intent.succeeded') {
        const paymentIntent = data.object;

        return await this.processStripePaymentSuccess(paymentIntent);
      } else if (type === 'payment_intent.payment_failed') {
        const paymentIntent = data.object;

        return await this.processStripePaymentFailure(paymentIntent);
      }

      return { success: true, processed: false, type };

    } catch (error) {
      console.error('Stripe webhook handling failed:', error.message);
      throw error;
    }
  }

  /**
   * Handle PayPal webhook
   * @param {Object} webhookData - Webhook data from PayPal
   * @returns {Promise<Object>} Processed webhook result
   */
  async handlePayPalWebhook(webhookData) {
    try {
      const { event_type, resource } = webhookData;

      if (event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        return await this.processPayPalPaymentSuccess(resource);
      } else if (event_type === 'PAYMENT.CAPTURE.DENIED') {
        return await this.processPayPalPaymentFailure(resource);
      }

      return { success: true, processed: false, event_type };

    } catch (error) {
      console.error('PayPal webhook handling failed:', error.message);
      throw error;
    }
  }

  /**
   * Process successful Stripe payment
   */
  async processStripePaymentSuccess(paymentIntent) {
    const Payment = require('../models/Payment');
    const payment = await Payment.findOne({
      'metadata.stripePaymentIntentId': paymentIntent.id
    });

    if (payment) {
      payment.updateStatus('completed', 'Payment successful via Stripe');
      await payment.save();
    }

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      status: 'completed'
    };
  }

  /**
   * Process failed Stripe payment
   */
  async processStripePaymentFailure(paymentIntent) {
    const Payment = require('../models/Payment');
    const payment = await Payment.findOne({
      'metadata.stripePaymentIntentId': paymentIntent.id
    });

    if (payment) {
      payment.updateStatus('failed', `Payment failed: ${paymentIntent.last_payment_error?.message}`);
      await payment.save();
    }

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      status: 'failed'
    };
  }

  /**
   * Process successful PayPal payment
   */
  async processPayPalPaymentSuccess(resource) {
    const Payment = require('../models/Payment');
    const payment = await Payment.findOne({
      'metadata.paypalOrderId': resource.id
    });

    if (payment) {
      payment.updateStatus('completed', 'Payment successful via PayPal');
      await payment.save();
    }

    return {
      success: true,
      orderId: resource.id,
      status: 'completed'
    };
  }

  /**
   * Process failed PayPal payment
   */
  async processPayPalPaymentFailure(resource) {
    const Payment = require('../models/Payment');
    const payment = await Payment.findOne({
      'metadata.paypalOrderId': resource.id
    });

    if (payment) {
      payment.updateStatus('failed', 'Payment failed via PayPal');
      await payment.save();
    }

    return {
      success: true,
      orderId: resource.id,
      status: 'failed'
    };
  }

  /**
   * Map Stripe status to internal status
   */
  mapStripeStatus(stripeStatus) {
    const statusMap = {
      'requires_payment_method': 'pending',
      'requires_confirmation': 'pending',
      'processing': 'processing',
      'succeeded': 'completed',
      'canceled': 'cancelled',
      'requires_action': 'pending'
    };

    return statusMap[stripeStatus] || 'pending';
  }

  /**
   * Calculate fees for dollar payments
   * @param {number} amount - Payment amount
   * @param {string} provider - Payment provider
   * @returns {Object} Fee breakdown
   */
  calculateFees(amount, provider = 'stripe') {
    const fees = {
      gatewayFee: 0,
      processingFee: 0,
      networkFee: 0
    };

    if (provider === 'stripe') {
      // Stripe fees: 2.9% + $0.30
      fees.processingFee = amount * 0.029 + 0.30;
    } else if (provider === 'paypal') {
      // PayPal fees: 2.9% + $0.30 for US payments
      fees.processingFee = amount * 0.029 + 0.30;
    }

    fees.gatewayFee = amount * 0.01; // 1% gateway fee

    return fees;
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies() {
    return ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
  }

  /**
   * Get supported providers
   */
  getSupportedProviders() {
    const providers = [];
    if (this.stripe) providers.push('stripe');
    if (this.paypal) providers.push('paypal');
    return providers;
  }

  /**
   * Check if provider is configured
   */
  isProviderConfigured(provider) {
    switch (provider) {
      case 'stripe':
        return !!this.stripe;
      case 'paypal':
        return !!this.paypal;
      default:
        return false;
    }
  }
}

module.exports = new DollarPaymentService();
