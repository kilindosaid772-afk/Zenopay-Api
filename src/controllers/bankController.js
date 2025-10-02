const PaymentController = require('./paymentController');

/**
 * Bank Controller - Handles bank transfer operations through Zenopay
 * This controller acts as a bridge to the main PaymentController for bank transfers
 */
class BankController {

  /**
   * Initiate bank transfer (redirects to PaymentController)
   */
  async initiateTransfer(req, res) {
    try {
      // Transform the request to match PaymentController expectations
      const transferData = {
        amount: req.body.amount,
        currency: req.body.currency,
        toAccount: req.body.toAccount,
        toBank: req.body.toBank,
        toAccountName: req.body.toAccountName,
        description: req.body.description,
        transferType: req.body.transferType,
        webhookUrl: req.body.callbackUrl,
        metadata: req.body.metadata
      };

      // Create a new request object for PaymentController
      const paymentReq = {
        ...req,
        body: transferData
      };

      // Call the PaymentController method
      await PaymentController.initiateBankTransfer(paymentReq, res);

    } catch (error) {
      console.error('Bank transfer initiation error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check transfer status (redirects to PaymentController)
   */
  async checkTransferStatus(req, res) {
    try {
      // Transform the request to match PaymentController expectations
      const statusReq = {
        ...req,
        params: {
          orderId: req.params.reference
        }
      };

      // Call the PaymentController method
      await PaymentController.checkBankTransferStatus(statusReq, res);

    } catch (error) {
      console.error('Transfer status check error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Validate bank account (redirects to PaymentController)
   */
  async validateAccount(req, res) {
    try {
      // Transform the request to match PaymentController expectations
      const validationData = {
        accountNumber: req.body.accountNumber,
        bankCode: req.body.bankCode,
        accountType: req.body.accountType
      };

      // Create a new request object for PaymentController
      const validationReq = {
        ...req,
        body: validationData
      };

      // Call the PaymentController method
      await PaymentController.validateBankAccount(validationReq, res);

    } catch (error) {
      console.error('Account validation error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Calculate transfer fees (redirects to PaymentController)
   */
  async calculateFees(req, res) {
    try {
      // Transform the request to match PaymentController expectations
      const feeData = {
        amount: req.body.amount,
        transferType: req.body.transferType
      };

      // Create a new request object for PaymentController
      const feeReq = {
        ...req,
        body: feeData
      };

      // Call the PaymentController method
      await PaymentController.calculateBankTransferFees(feeReq, res);

    } catch (error) {
      console.error('Fee calculation error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Handle bank webhook (redirects to PaymentController)
   */
  async handleWebhook(req, res) {
    try {
      // Transform the webhook data to match Zenopay format
      const webhookData = {
        order_id: req.body.reference,
        transfer_status: req.body.status,
        reference: req.body.reference,
        transaction_id: req.body.transactionId,
        metadata: req.body.metadata || {}
      };

      // Create a new request object for PaymentController
      const webhookReq = {
        ...req,
        body: webhookData
      };

      // Call the PaymentController webhook handler
      await PaymentController.handleWebhook(webhookReq, res);

    } catch (error) {
      console.error('Webhook processing error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get bank configuration status (uses Zenopay service)
   */
  getStatus(req, res) {
    try {
      const zenopayService = require('../services/zenopayService');
      const isConfigured = zenopayService.validateApiKey();
      const supportedCurrencies = zenopayService.getSupportedCurrencies();
      const supportedNetworks = zenopayService.getSupportedNetworks();

      res.status(200).json({
        success: true,
        data: {
          configured: isConfigured,
          supportedCurrencies,
          supportedNetworks,
          bankTransferSupported: supportedNetworks.includes('bank_transfer'),
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Status check error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new BankController();
