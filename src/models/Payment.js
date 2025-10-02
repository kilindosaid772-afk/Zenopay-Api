const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Zenopay API uses order_id as primary identifier
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Legacy reference field (keeping for backward compatibility)
  reference: {
    type: String,
    index: true
  },

  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0']
  },

  currency: {
    type: String,
    required: true,
    enum: ['TZS', 'USD'],
    default: 'TZS'
  },

  description: {
    type: String,
    maxlength: [255, 'Description cannot be more than 255 characters']
  },

  // Payment method details (Zenopay format)
  paymentMethod: {
    type: {
      type: String,
      required: true,
      enum: ['mobile_money_tanzania']
    },
    provider: {
      type: String,
      enum: ['mobile_money_tanzania']
    }
  },

  // Payer information (Zenopay format)
  payer: {
    name: {
      type: String,
      required: [true, 'Payer name is required']
    },
    email: {
      type: String,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number']
    }
  },

  // Merchant information
  merchant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Merchant is required']
  },

  // Zenopay API response data
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'PENDING'
  },

  externalReference: {
    type: String,
    index: true
  },

  metadata: mongoose.Schema.Types.Mixed,

  // Status tracking (internal use)
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },

  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    message: String,
    source: {
      type: String,
      enum: ['zenopay_api', 'webhook', 'manual']
    }
  }],

  // Webhook information
  webhookUrl: String,
  webhookAttempts: {
    type: Number,
    default: 0
  },
  lastWebhookAttempt: Date,

  // Timestamps
  completedAt: Date,
  failedAt: Date

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ merchant: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ 'payer.phone': 1 });
paymentSchema.index({ 'payer.email': 1 });

// Pre-save middleware to generate reference if not provided
paymentSchema.pre('save', function(next) {
  if (!this.reference && this.orderId) {
    // Create a reference from orderId for backward compatibility
    this.reference = this.orderId;
  }
  next();
});

// Update status method
paymentSchema.methods.updateStatus = function(newStatus, message = '', source = 'manual') {
  const oldStatus = this.status;

  if (oldStatus !== newStatus) {
    this.status = newStatus;

    // Update status history
    this.statusHistory.push({
      status: newStatus,
      message,
      source,
      timestamp: new Date()
    });

    // Update Zenopay payment status
    const zenopayStatusMap = {
      'pending': 'PENDING',
      'completed': 'COMPLETED',
      'failed': 'FAILED',
      'cancelled': 'CANCELLED'
    };

    this.paymentStatus = zenopayStatusMap[newStatus] || 'PENDING';

    // Set timestamp based on status
    if (newStatus === 'completed') {
      this.completedAt = new Date();
    } else if (newStatus === 'failed') {
      this.failedAt = new Date();
    }
  }
};

// Check if payment is completed
paymentSchema.methods.isCompleted = function() {
  return this.status === 'completed' || this.paymentStatus === 'COMPLETED';
};

// Static method to find by order ID or reference
paymentSchema.statics.findByOrderIdOrReference = function(identifier) {
  return this.findOne({
    $or: [
      { orderId: identifier },
      { reference: identifier }
    ]
  });
};

module.exports = mongoose.model('Payment', paymentSchema);
