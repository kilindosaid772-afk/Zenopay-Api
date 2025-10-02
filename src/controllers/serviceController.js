const Service = require('../models/Service');
const Payment = require('../models/Payment');

/**
 * Service Controller - Handles service delivery and access control
 */
class ServiceController {

  /**
   * Create a new service (to be delivered after payment)
   */
  async createService(req, res) {
    try {
      const { type, name, description, customerId, serviceData } = req.body;

      if (!type || !name || !customerId) {
        return res.status(400).json({
          success: false,
          message: 'Type, name, and customer ID are required'
        });
      }

      // Generate unique service ID
      const serviceId = `SVC_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const service = new Service({
        serviceId,
        customerId,
        type,
        name,
        description,
        serviceData: serviceData || {}
      });

      await service.save();

      res.status(201).json({
        success: true,
        message: 'Service created successfully',
        data: {
          serviceId: service.serviceId,
          type: service.type,
          name: service.name,
          status: service.status
        }
      });

    } catch (error) {
      console.error('❌ Service creation error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check service access (requires completed payment)
   */
  async checkServiceAccess(req, res) {
    try {
      const { serviceId } = req.params;

      const service = await Service.findOne({ serviceId })
        .populate('paymentId');

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      // Check if payment is completed
      if (!service.paymentId || service.paymentId.status !== 'completed') {
        return res.status(402).json({
          success: false,
          message: 'Payment required',
          paymentStatus: service.paymentId?.status || 'not_found',
          serviceId: service.serviceId
        });
      }

      // Activate service if not already active
      if (service.status !== 'active') {
        service.activate();
        await service.save();
      }

      // Record access
      service.recordAccess();
      await service.save();

      res.status(200).json({
        success: true,
        access: true,
        service: {
          serviceId: service.serviceId,
          type: service.type,
          name: service.name,
          status: service.status,
          accessToken: service.accessToken,
          expiresAt: service.expiresAt,
          lastAccessedAt: service.lastAccessedAt,
          accessCount: service.accessCount,
          serviceData: service.serviceData
        }
      });

    } catch (error) {
      console.error('❌ Service access check error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get customer's active services
   */
  async getCustomerServices(req, res) {
    try {
      const { customerId } = req.params;

      const services = await Service.findActiveForCustomer(customerId)
        .populate('paymentId', 'amount currency createdAt')
        .sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: {
          customerId,
          services: services.map(service => ({
            serviceId: service.serviceId,
            type: service.type,
            name: service.name,
            status: service.status,
            expiresAt: service.expiresAt,
            lastAccessedAt: service.lastAccessedAt,
            accessCount: service.accessCount,
            paymentAmount: service.paymentId?.amount,
            paymentCurrency: service.paymentId?.currency,
            paymentDate: service.paymentId?.createdAt
          }))
        }
      });

    } catch (error) {
      console.error('❌ Customer services fetch error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Initiate service payment (creates service + payment together)
   */
  async initiateServicePayment(req, res) {
    try {
      const {
        serviceType,
        serviceName,
        serviceDescription,
        customerId,
        customerInfo,
        amount,
        currency,
        description,
        serviceData
      } = req.body;

      if (!serviceType || !serviceName || !customerId || !amount) {
        return res.status(400).json({
          success: false,
          message: 'Service type, name, customer ID, and amount are required'
        });
      }

      // Generate unique service ID
      const serviceId = `SVC_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Create service record first
      const service = new Service({
        serviceId,
        customerId,
        type: serviceType,
        name: serviceName,
        description: serviceDescription,
        serviceData: serviceData || {},
        status: 'pending'
      });

      // Generate order ID for payment
      const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Prepare payment data
      const transferData = {
        orderId,
        amount,
        currency: currency || 'USD',
        toAccount: process.env.ZENO_ID || 'DEMO_MERCHANT',
        toBank: 'Zenopay',
        toAccountName: serviceName,
        description: description || `Payment for ${serviceName}`,
        transferType: 'immediate',
        webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/zenopay`,
        metadata: {
          serviceId: service.serviceId,
          customerId,
          serviceType
        }
      };

      // Create payment record
      const payment = new Payment({
        orderId,
        amount,
        currency: currency || 'USD',
        status: 'pending',
        paymentMethod: {
          type: 'bank_transfer',
          provider: 'zenopay_bank'
        },
        customerInfo: {
          name: customerInfo?.name || 'Customer',
          email: customerInfo?.email,
          phone: customerInfo?.phone
        },
        merchantAccount: process.env.ZENO_ID || 'DEMO_MERCHANT',
        description: description || `Payment for ${serviceName}`,
        metadata: {
          serviceId: service.serviceId,
          customerId,
          serviceType
        }
      });

      // Link service to payment
      service.paymentId = payment._id;

      // Save both records
      await service.save();
      await payment.save();

      res.status(201).json({
        success: true,
        message: 'Service payment initiated successfully',
        data: {
          serviceId: service.serviceId,
          paymentId: payment._id,
          orderId: payment.orderId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          paymentUrl: `${req.protocol}://${req.get('host')}/api/services/${service.serviceId}/access`
        }
      });

    } catch (error) {
      console.error('❌ Service payment initiation error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get service details
   */
  async getService(req, res) {
    try {
      const { serviceId } = req.params;

      const service = await Service.findOne({ serviceId })
        .populate('paymentId', 'amount currency status createdAt');

      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Service not found'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          serviceId: service.serviceId,
          type: service.type,
          name: service.name,
          description: service.description,
          status: service.status,
          accessToken: service.accessToken,
          expiresAt: service.expiresAt,
          lastAccessedAt: service.lastAccessedAt,
          accessCount: service.accessCount,
          paymentAmount: service.paymentId?.amount,
          paymentCurrency: service.paymentId?.currency,
          paymentStatus: service.paymentId?.status,
          paymentDate: service.paymentId?.createdAt,
          serviceData: service.serviceData
        }
      });

    } catch (error) {
      console.error('❌ Service fetch error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check for expired services and update status
   */
  async checkExpiredServices(req, res) {
    try {
      const expiredServices = await Service.findExpired();

      for (const service of expiredServices) {
        service.status = 'expired';
        await service.save();
      }

      res.status(200).json({
        success: true,
        message: `${expiredServices.length} services marked as expired`,
        expiredCount: expiredServices.length
      });

    } catch (error) {
      console.error('❌ Expired services check error:', error.message);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new ServiceController();
