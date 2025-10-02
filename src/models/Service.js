// Service Schema for tracking services/products delivered after payment
const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
  serviceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    index: true
  },
  customerId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'digital_product',
      'subscription',
      'service_access',
      'course_access',
      'software_license',
      'event_ticket',
      'consultation',
      'download',
      'membership'
    ]
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'cancelled', 'suspended'],
    default: 'pending',
    index: true
  },
  // Service-specific data
  serviceData: {
    // Digital products
    downloadUrl: { type: String },
    fileSize: { type: Number },
    fileFormat: { type: String },

    // Subscriptions
    planType: { type: String },
    billingCycle: { type: String }, // monthly, yearly, etc.

    // Access-based services
    accessLevel: { type: String }, // basic, premium, admin
    permissions: [{ type: String }],

    // Time-based services
    duration: { type: Number }, // in days
    maxUses: { type: Number },

    // Custom fields for flexibility
    customFields: { type: mongoose.Schema.Types.Mixed }
  },
  // Access control
  accessToken: {
    type: String,
    unique: true,
    sparse: true
  },
  accessGrantedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    index: true
  },
  lastAccessedAt: {
    type: Date
  },
  accessCount: {
    type: Number,
    default: 0
  },
  // Delivery tracking
  deliveredAt: {
    type: Date
  },
  deliveryAttempts: {
    type: Number,
    default: 0
  },
  lastDeliveryAttempt: {
    type: Date
  },
  deliveryStatus: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'failed'],
    default: 'not_started'
  },
  deliveryError: {
    type: String
  },
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
ServiceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for better query performance
ServiceSchema.index({ paymentId: 1, status: 1 });
ServiceSchema.index({ customerId: 1, status: 1 });
ServiceSchema.index({ expiresAt: 1 });
ServiceSchema.index({ serviceId: 1 });

// Method to activate service
ServiceSchema.methods.activate = function() {
  this.status = 'active';
  this.accessGrantedAt = new Date();
  this.deliveredAt = new Date();
  this.deliveryStatus = 'completed';

  // Set expiration based on service type
  if (this.serviceData.duration) {
    this.expiresAt = new Date(Date.now() + this.serviceData.duration * 24 * 60 * 60 * 1000);
  }
};

// Method to check if service is accessible
ServiceSchema.methods.isAccessible = function() {
  if (this.status !== 'active') return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  return true;
};

// Method to record access
ServiceSchema.methods.recordAccess = function() {
  this.lastAccessedAt = new Date();
  this.accessCount += 1;
};

// Static method to find active services for customer
ServiceSchema.statics.findActiveForCustomer = function(customerId) {
  return this.find({
    customerId,
    status: 'active',
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

// Static method to find expired services
ServiceSchema.statics.findExpired = function() {
  return this.find({
    status: 'active',
    expiresAt: { $lt: new Date() }
  });
};

module.exports = mongoose.model('Service', ServiceSchema);
