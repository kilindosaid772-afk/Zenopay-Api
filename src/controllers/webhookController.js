const Payment = require('../models/Payment');
const Service = require('../models/Service');

/**
 * Webhook Controller - Handles payment status updates and service delivery
 */
class WebhookController {

  /**
   * Handle Zenopay payment webhook
   */
  async handleZenopayWebhook(req, res) {
    try {
      const webhookData = req.body;
      console.log('🎣 Zenopay webhook received:', JSON.stringify(webhookData, null, 2));

      const { order_id, payment_status, reference, transaction_id, metadata } = webhookData;

      if (!order_id) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required'
        });
      }

      // Find the payment record
      const payment = await Payment.findOne({ orderId: order_id });

      if (!payment) {
        console.log(`Payment not found for order ID: ${order_id}`);
        return res.status(404).json({
          success: false,
          message: 'Payment not found'
        });
      }

      // Update payment status
      const statusMap = {
        'COMPLETED': 'completed',
        'PENDING': 'pending',
        'PROCESSING': 'processing',
        'FAILED': 'failed',
        'CANCELLED': 'cancelled'
      };

      const newStatus = statusMap[payment_status] || 'pending';

      if (payment.status !== newStatus) {
        payment.updateStatus(newStatus, `Webhook: ${payment_status}`, 'webhook');
        payment.externalTransactionId = transaction_id;
        payment.externalReference = reference;

        await payment.save();
        console.log(`✅ Payment ${order_id} status updated to: ${newStatus}`);

        // If payment completed, deliver associated services
        if (newStatus === 'completed') {
          await this.deliverServices(payment);
        }
      } else {
        console.log(`Payment ${order_id} status unchanged: ${newStatus}`);
      }

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        paymentId: payment._id,
        status: payment.status
      });

    } catch (error) {
      console.error('❌ Webhook processing error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Webhook processing failed',
        error: error.message
      });
    }
  }

  /**
   * Deliver services associated with completed payment
   */
  async deliverServices(payment) {
    try {
      console.log(`🚀 Delivering services for payment: ${payment.orderId}`);

      // Find all services linked to this payment
      const services = await Service.find({ paymentId: payment._id, status: 'pending' });

      if (services.length === 0) {
        console.log(`No pending services found for payment: ${payment.orderId}`);
        return;
      }

      for (const service of services) {
        await this.deliverSingleService(service, payment);
      }

      console.log(`✅ Delivered ${services.length} service(s) for payment: ${payment.orderId}`);

    } catch (error) {
      console.error('❌ Service delivery failed:', error.message);
    }
  }

  /**
   * Deliver a single service
   */
  async deliverSingleService(service, payment) {
    try {
      service.deliveryAttempts += 1;
      service.lastDeliveryAttempt = new Date();

      // Activate the service
      service.activate();
      service.deliveryStatus = 'completed';

      // Generate access token if needed
      if (!service.accessToken) {
        service.accessToken = this.generateAccessToken();
      }

      await service.save();
      console.log(`✅ Service ${service.serviceId} activated for customer ${service.customerId}`);

      // Send notification to customer (optional)
      await this.notifyCustomer(service, payment);

    } catch (error) {
      service.deliveryStatus = 'failed';
      service.deliveryError = error.message;
      await service.save();

      console.error(`❌ Failed to deliver service ${service.serviceId}:`, error.message);
    }
  }

  /**
   * Generate unique access token
   */
  generateAccessToken() {
    return 'ACCESS_' + Date.now() + '_' + Math.random().toString(36).substring(7);
  }

  /**
   * Notify customer about service activation (optional)
   */
  async notifyCustomer(service, payment) {
    try {
      // Here you could integrate with email service, SMS, etc.
      console.log(`📧 Notifying customer ${payment.customerInfo.email} about service activation`);

      // Example email notification structure
      const notification = {
        to: payment.customerInfo.email,
        subject: `Service Activated: ${service.name}`,
        template: 'service_activated',
        data: {
          customerName: payment.customerInfo.name,
          serviceName: service.name,
          serviceType: service.type,
          accessToken: service.accessToken,
          expiresAt: service.expiresAt,
          dashboardUrl: `${process.env.FRONTEND_URL}/services/${service.serviceId}`
        }
      };

      // TODO: Integrate with your email service (SendGrid, Mailgun, etc.)
      // await emailService.send(notification);

    } catch (error) {
      console.error('❌ Customer notification failed:', error.message);
    }
  }

  /**
   * Handle bank transfer webhook (if different from main webhook)
   */
  async handleBankTransferWebhook(req, res) {
    try {
      const callbackData = req.body;
      console.log('🏦 Bank transfer webhook received:', JSON.stringify(callbackData, null, 2));

      // Transform bank webhook data to standard format
      const webhookData = {
        order_id: callbackData.reference || callbackData.orderId,
        payment_status: callbackData.transferStatus || callbackData.status,
        reference: callbackData.reference,
        transaction_id: callbackData.externalTransactionId || callbackData.transactionId,
        metadata: callbackData.metadata || {}
      };

      // Process using the main webhook handler
      await this.handleZenopayWebhook({ body: webhookData }, res);

    } catch (error) {
      console.error('❌ Bank transfer webhook error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Bank transfer webhook processing failed'
      });
    }
  }

  /**
   * Get webhook status and recent activity
   */
  async getWebhookStatus(req, res) {
    try {
      // Get recent webhook activity (last 10)
      const recentPayments = await Payment.find({})
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('orderId status updatedAt paymentStatus statusHistory');

      res.status(200).json({
        success: true,
        data: {
          recentActivity: recentPayments,
          totalWebhooksProcessed: recentPayments.length,
          lastWebhookAt: recentPayments[0]?.updatedAt || null,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Webhook status check error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new WebhookController();
