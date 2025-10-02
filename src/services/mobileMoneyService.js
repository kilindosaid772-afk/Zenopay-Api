const axios = require('axios');
const crypto = require('crypto');

class MobileMoneyService {
  constructor() {
    // Network configurations
    this.networks = {
      mtn: {
        name: 'MTN Mobile Money',
        baseUrl: process.env.MTN_BASE_URL,
        apiKey: process.env.MTN_API_KEY,
        apiSecret: process.env.MTN_API_SECRET,
        timeout: 30000
      },
      airtel: {
        name: 'Airtel Money',
        baseUrl: process.env.AIRTEL_BASE_URL,
        apiKey: process.env.AIRTEL_API_KEY,
        apiSecret: process.env.AIRTEL_API_SECRET,
        timeout: 30000
      },
      vodafone: {
        name: 'Vodafone Cash',
        baseUrl: process.env.VODAFONE_BASE_URL,
        apiKey: process.env.VODAFONE_API_KEY,
        apiSecret: process.env.VODAFONE_API_SECRET,
        timeout: 30000
      },
      tigo: {
        name: 'Tigo Pesa',
        baseUrl: process.env.TIGO_BASE_URL,
        apiKey: process.env.TIGO_API_KEY,
        apiSecret: process.env.TIGO_API_SECRET,
        timeout: 30000
      }
    };

    // Initialize axios instances for each network
    this.clients = {};
    this.initializeClients();
  }

  initializeClients() {
    Object.keys(this.networks).forEach(network => {
      const config = this.networks[network];

      if (config.apiKey && config.apiSecret) {
        this.clients[network] = axios.create({
          baseURL: config.baseUrl,
          timeout: config.timeout,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
            'X-API-Key': config.apiKey,
            'X-API-Secret': config.apiSecret
          }
        });

        // Add request interceptor for authentication
        this.clients[network].interceptors.request.use(
          (config) => {
            // Add timestamp and signature for some APIs
            if (network === 'mtn' || network === 'airtel') {
              config.headers['X-Timestamp'] = new Date().toISOString();
              config.headers['X-Signature'] = this.generateSignature(network, config.data);
            }
            return config;
          },
          (error) => Promise.reject(error)
        );

        // Add response interceptor for error handling
        this.clients[network].interceptors.response.use(
          (response) => response,
          (error) => {
            console.error(`Mobile Money ${network.toUpperCase()} API Error:`, error.response?.data || error.message);
            return Promise.reject(error);
          }
        );
      }
    });
  }

  generateSignature(network, data) {
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify(data) + timestamp + this.networks[network].apiSecret;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Initiate mobile money payment
   * @param {string} network - Network name (mtn, airtel, vodafone, tigo)
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} Payment response
   */
  async initiatePayment(network, paymentData) {
    try {
      const client = this.clients[network];
      if (!client) {
        throw new Error(`Mobile money client not configured for ${network}`);
      }

      const payload = {
        subscriberMsisdn: paymentData.phoneNumber,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        reference: paymentData.reference,
        callbackUrl: paymentData.callbackUrl,
        description: paymentData.description || 'Payment via Zenopay'
      };

      let endpoint = '';
      switch (network) {
        case 'mtn':
          endpoint = '/v1/payments/initiate';
          break;
        case 'airtel':
          endpoint = '/api/v1/payments';
          break;
        case 'vodafone':
          endpoint = '/api/payments/initiate';
          break;
        case 'tigo':
          endpoint = '/api/v1/payments/initiate';
          break;
        default:
          throw new Error(`Unsupported network: ${network}`);
      }

      const response = await client.post(endpoint, payload);

      return {
        success: true,
        network,
        reference: paymentData.reference,
        externalTransactionId: response.data.transactionId || response.data.reference,
        status: 'pending',
        response: response.data
      };

    } catch (error) {
      console.error(`Failed to initiate ${network} payment:`, error.message);
      throw new Error(`Mobile money payment initiation failed: ${error.message}`);
    }
  }

  /**
   * Check payment status
   * @param {string} network - Network name
   * @param {string} reference - Payment reference
   * @returns {Promise<Object>} Payment status
   */
  async checkPaymentStatus(network, reference) {
    try {
      const client = this.clients[network];
      if (!client) {
        throw new Error(`Mobile money client not configured for ${network}`);
      }

      let endpoint = '';
      let payload = { reference };

      switch (network) {
        case 'mtn':
          endpoint = '/v1/payments/status';
          break;
        case 'airtel':
          endpoint = `/api/v1/payments/${reference}/status`;
          break;
        case 'vodafone':
          endpoint = '/api/payments/status';
          break;
        case 'tigo':
          endpoint = '/api/v1/payments/status';
          break;
        default:
          throw new Error(`Unsupported network: ${network}`);
      }

      const response = await client.get(endpoint, { params: payload });

      return {
        success: true,
        network,
        reference,
        status: this.mapStatus(network, response.data.status),
        externalTransactionId: response.data.transactionId,
        response: response.data
      };

    } catch (error) {
      console.error(`Failed to check ${network} payment status:`, error.message);
      throw new Error(`Payment status check failed: ${error.message}`);
    }
  }

  /**
   * Process mobile money payment using control number
   * @param {string} network - Network name
   * @param {Object} paymentData - Payment data with control number
   * @returns {Promise<Object>} Payment response
   */
  async processControlNumberPayment(network, paymentData) {
    try {
      const { controlNumber, phoneNumber, amount } = paymentData;

      // First verify the control number exists and is valid
      const ControlNumber = require('../models/ControlNumber');
      const controlNumDoc = await ControlNumber.findOne({
        controlNumber,
        status: 'active'
      });

      if (!controlNumDoc) {
        throw new Error('Invalid or expired control number');
      }

      if (controlNumDoc.amount !== amount) {
        throw new Error('Amount does not match control number amount');
      }

      // Initiate the payment
      const paymentResult = await this.initiatePayment(network, {
        ...paymentData,
        reference: `CN_${controlNumber}_${Date.now()}`
      });

      // Mark control number as used
      controlNumDoc.markAsUsed(paymentResult.reference, {
        name: paymentData.customerName,
        phone: phoneNumber,
        network
      });

      await controlNumDoc.save();

      return {
        success: true,
        controlNumber,
        paymentReference: paymentResult.reference,
        network,
        status: 'pending'
      };

    } catch (error) {
      console.error(`Control number payment failed for ${network}:`, error.message);
      throw error;
    }
  }

  /**
   * Handle payment callback from mobile money provider
   * @param {string} network - Network name
   * @param {Object} callbackData - Callback data from provider
   * @returns {Promise<Object>} Processed callback result
   */
  async handleCallback(network, callbackData) {
    try {
      // Validate callback data based on network
      this.validateCallbackData(network, callbackData);

      const { reference, status, transactionId } = callbackData;

      // Update payment status in database
      const Payment = require('../models/Payment');
      const payment = await Payment.findOne({ reference });

      if (!payment) {
        throw new Error(`Payment not found for reference: ${reference}`);
      }

      // Map external status to internal status
      const internalStatus = this.mapStatus(network, status);
      payment.updateStatus(internalStatus, `Callback from ${network}`, null);

      // Create transaction record
      const Transaction = require('../models/Transaction');
      const transaction = new Transaction({
        type: 'payment',
        category: 'incoming',
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: {
          type: 'mobile_money',
          provider: network
        },
        status: internalStatus,
        paymentReference: payment._id,
        externalTransactionId: transactionId,
        from: {
          phone: callbackData.phoneNumber || callbackData.customerPhone,
          type: 'customer'
        },
        to: {
          account: process.env.ZENO_ID || 'DEMO_MERCHANT',
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
      console.error(`Mobile money callback handling failed for ${network}:`, error.message);
      throw error;
    }
  }

  /**
   * Initiate mobile money payment to merchant account
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
        merchant_account_id: process.env.ZENO_ID || 'DEMO_MERCHANT', // Use ZENO_ID for receiving payments
        webhook_url: paymentData.webhookUrl,
        description: paymentData.description || 'Mobile money payment'
      };

      // If using demo key, return mock response
      if (this.apiKey === 'demo_api_key_placeholder') {
        console.log('🎭 Demo mode: Simulating mobile money payment');
        return {
          success: true,
          orderId: paymentData.orderId,
          paymentStatus: 'PENDING',
          reference: `MM_${Date.now()}`,
          merchantAccountId: process.env.ZENO_ID || 'DEMO_MERCHANT',
          metadata: paymentData.metadata
        };
      }

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

      // Return mock response in demo mode
      if (this.apiKey === 'demo_api_key_placeholder') {
        return {
          success: true,
          orderId: paymentData.orderId,
          paymentStatus: 'PENDING',
          reference: `MM_${Date.now()}`,
          merchantAccountId: process.env.ZENO_ID || 'DEMO_MERCHANT',
          metadata: paymentData.metadata
        };
      }

      throw new Error(`Payment initiation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Map external status to internal status
   */
  mapStatus(network, externalStatus) {
    const statusMappings = {
      mtn: {
        'PENDING': 'pending',
        'PROCESSING': 'processing',
        'COMPLETED': 'completed',
        'FAILED': 'failed',
        'CANCELLED': 'cancelled'
      },
      airtel: {
        'INITIATED': 'pending',
        'PROCESSING': 'processing',
        'SUCCESSFUL': 'completed',
        'FAILED': 'failed',
        'CANCELLED': 'cancelled'
      },
      vodafone: {
        'PENDING': 'pending',
        'IN_PROGRESS': 'processing',
        'COMPLETED': 'completed',
        'FAILED': 'failed',
        'CANCELLED': 'cancelled'
      },
      tigo: {
        'PENDING': 'pending',
        'PROCESSING': 'processing',
        'SUCCESS': 'completed',
        'FAILED': 'failed',
        'CANCELLED': 'cancelled'
      }
    };

    return statusMappings[network]?.[externalStatus] || 'pending';
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks() {
    return Object.keys(this.networks);
  }

  /**
   * Check if network is supported
   */
  isNetworkSupported(network) {
    return this.getSupportedNetworks().includes(network);
  }

  /**
   * Get network configuration
   */
  getNetworkConfig(network) {
    return this.networks[network];
  }
}

module.exports = new MobileMoneyService();
