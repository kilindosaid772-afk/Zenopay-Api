const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Transaction identification
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  reference: {
    type: String,
    index: true
  },

  // Transaction type and category
  type: {
    type: String,
    required: true,
    enum: ['payment', 'refund', 'transfer', 'fee', 'settlement', 'adjustment'],
    index: true
  },
  category: {
    type: String,
    enum: ['incoming', 'outgoing', 'internal'],
    default: 'incoming',
    index: true
  },

  // Amount and currency
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  currency: {
    type: String,
    required: true,
    enum: ['USD', 'EUR', 'GBP', 'Local'],
    default: 'USD'
  },
  exchangeRate: {
    type: Number,
    default: 1 // For currency conversion tracking
  },

  // Parties involved
  from: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    account: String,
    bank: String,
    type: {
      type: String,
      enum: ['user', 'merchant', 'system', 'external']
    }
  },
  to: {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    account: String,
    bank: String,
    type: {
      type: String,
      enum: ['user', 'merchant', 'system', 'external']
    }
  },

  // Payment method details
  paymentMethod: {
    type: {
      type: String,
      enum: ['mobile_money', 'bank_transfer', 'card', 'paypal', 'crypto', 'cash']
    },
    provider: {
      type: String,
      enum: ['mtn', 'airtel', 'vodafone', 'tigo', 'bank', 'stripe', 'paypal']
    },
    accountNumber: String,
    accountName: String
  },

  // Status and processing
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'pending',
    index: true
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    message: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // External references
  externalTransactionId: {
    type: String,
    index: true
  },
  paymentReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  controlNumber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ControlNumber'
  },

  // Fees and charges
  fees: {
    gatewayFee: {
      type: Number,
      default: 0
    },
    processingFee: {
      type: Number,
      default: 0
    },
    networkFee: {
      type: Number,
      default: 0
    }
  },

  // Settlement information
  settlement: {
    status: {
      type: String,
      enum: ['pending', 'settled', 'failed'],
      default: 'pending'
    },
    settledAt: Date,
    settlementReference: String,
    settlementBatch: String
  },

  // Processing details
  processedAt: Date,
  completedAt: Date,
  failedAt: Date,

  // Error tracking
  errorCode: String,
  errorMessage: String,
  retryCount: {
    type: Number,
    default: 0,
    max: 3
  },

  // Description and notes
  description: {
    type: String,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  notes: String,

  // Risk and verification
  riskScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  verificationRequired: {
    type: Boolean,
    default: false
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },

  // Metadata and additional info
  metadata: mongoose.Schema.Types.Mixed,
  tags: [String],

  // Reconciliation
  reconciled: {
    type: Boolean,
    default: false
  },
  reconciledAt: Date,
  reconciliationNotes: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ reference: 1 });
transactionSchema.index({ type: 1, category: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ 'from.user': 1, createdAt: -1 });
transactionSchema.index({ 'to.user': 1, createdAt: -1 });
transactionSchema.index({ paymentReference: 1 });
transactionSchema.index({ externalTransactionId: 1 });

// Virtual for net amount (amount - fees)
transactionSchema.virtual('netAmount').get(function() {
  return this.amount - (this.fees.gatewayFee || 0) - (this.fees.processingFee || 0) - (this.fees.networkFee || 0);
});

// Pre-save middleware to generate transaction ID if not provided
transactionSchema.pre('save', function(next) {
  if (!this.transactionId) {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6);
    this.transactionId = `TXN${timestamp}${random}`.toUpperCase();
  }
  next();
});

// Update status method
transactionSchema.methods.updateStatus = function(newStatus, message = '', updatedBy = null) {
  const oldStatus = this.status;

  if (oldStatus !== newStatus) {
    this.status = newStatus;

    // Update status history
    this.statusHistory.push({
      status: newStatus,
      message,
      updatedBy,
      timestamp: new Date()
    });

    // Set timestamp based on status
    if (newStatus === 'completed') {
      this.completedAt = new Date();
    } else if (newStatus === 'failed') {
      this.failedAt = new Date();
    } else if (newStatus === 'processing') {
      this.processedAt = new Date();
    }
  }
};

// Check if transaction can be retried
transactionSchema.methods.canRetry = function() {
  return this.status === 'failed' && this.retryCount < 3;
};

// Increment retry count
transactionSchema.methods.incrementRetryCount = function() {
  this.retryCount += 1;
};

// Calculate total fees
transactionSchema.methods.getTotalFees = function() {
  return (this.fees.gatewayFee || 0) + (this.fees.processingFee || 0) + (this.fees.networkFee || 0);
};

// Reverse transaction (for refunds, chargebacks, etc.)
transactionSchema.methods.reverse = function(reason, amount = null) {
  const reverseAmount = amount || this.amount;

  return {
    transactionId: `REV${this.transactionId.substring(3)}`,
    type: 'refund',
    category: 'outgoing',
    amount: reverseAmount,
    currency: this.currency,
    reference: this.reference,
    description: `Reversal of ${this.transactionId}: ${reason}`,
    originalTransaction: this._id,
    from: this.to,
    to: this.from,
    status: 'pending'
  };
};

// Static method to find transactions by date range
transactionSchema.statics.findByDateRange = function(startDate, endDate, userId = null) {
  const query = {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };

  if (userId) {
    query.$or = [
      { 'from.user': userId },
      { 'to.user': userId }
    ];
  }

  return this.find(query).sort({ createdAt: -1 });
};

// Static method to calculate totals by type
transactionSchema.statics.getTotalsByType = async function(startDate, endDate, userId = null) {
  const matchStage = {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };

  if (userId) {
    matchStage.$or = [
      { 'from.user': userId },
      { 'to.user': userId }
    ];
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { type: '$type', currency: '$currency' },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    }
  ]);
};

module.exports = mongoose.model('Transaction', transactionSchema);
