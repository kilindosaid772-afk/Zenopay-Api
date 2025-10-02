const mongoose = require('mongoose');

const controlNumberSchema = new mongoose.Schema({
  controlNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  prefix: {
    type: String,
    default: 'ZENO',
    maxlength: [10, 'Prefix cannot be more than 10 characters']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0']
  },
  currency: {
    type: String,
    required: true,
    enum: ['USD', 'EUR', 'GBP', 'Local'],
    default: 'USD'
  },
  description: {
    type: String,
    maxlength: [255, 'Description cannot be more than 255 characters']
  },

  // Payment method this control number is for
  paymentMethod: {
    type: {
      type: String,
      required: true,
      enum: ['mobile_money', 'bank_transfer', 'card', 'cash']
    },
    provider: {
      type: String,
      enum: ['mtn', 'airtel', 'vodafone', 'tigo', 'bank', 'any']
    }
  },

  // Merchant information
  merchant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Merchant is required']
  },

  // Customer information (optional)
  customer: {
    name: String,
    email: String,
    phone: String
  },

  // Status and tracking
  status: {
    type: String,
    enum: ['active', 'used', 'expired', 'cancelled'],
    default: 'active',
    index: true
  },

  // Payment reference when used
  paymentReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },

  // Usage tracking
  usedAt: Date,
  usedBy: {
    name: String,
    phone: String,
    network: String
  },

  // Expiration and validity
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  validUntil: {
    type: Date,
    required: true
  },

  // Generation and tracking
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  batchId: String, // For bulk generation

  // Settings
  isReusable: {
    type: Boolean,
    default: false
  },
  maxUses: {
    type: Number,
    default: 1,
    min: 1
  },
  currentUses: {
    type: Number,
    default: 0
  },

  // Notifications
  notifyOnUse: {
    type: Boolean,
    default: true
  },
  notifyOnExpiry: {
    type: Boolean,
    default: true
  },

  // Metadata
  metadata: mongoose.Schema.Types.Mixed,
  tags: [String]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
controlNumberSchema.index({ controlNumber: 1 });
controlNumberSchema.index({ merchant: 1, status: 1, createdAt: -1 });
controlNumberSchema.index({ expiresAt: 1 });
controlNumberSchema.index({ paymentMethod: 1 });
controlNumberSchema.index({ batchId: 1 });

// Virtual for checking if expired
controlNumberSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Virtual for checking if valid for use
controlNumberSchema.virtual('isValid').get(function() {
  return this.status === 'active' &&
         new Date() <= this.validUntil &&
         this.currentUses < this.maxUses;
});

// Pre-save middleware to generate control number if not provided
controlNumberSchema.pre('save', function(next) {
  if (!this.controlNumber) {
    this.controlNumber = this.generateControlNumber();
  }
  next();
});

// Generate unique control number
controlNumberSchema.methods.generateControlNumber = function() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${this.prefix}${timestamp}${random}`;
};

// Mark as used
controlNumberSchema.methods.markAsUsed = function(paymentReference, usedByInfo = {}) {
  if (this.status !== 'active') {
    throw new Error('Control number is not active');
  }

  this.status = 'used';
  this.usedAt = new Date();
  this.paymentReference = paymentReference;
  this.currentUses += 1;

  if (usedByInfo.name) this.usedBy.name = usedByInfo.name;
  if (usedByInfo.phone) this.usedBy.phone = usedByInfo.phone;
  if (usedByInfo.network) this.usedBy.network = usedByInfo.network;

  // Check if should be deactivated after use
  if (!this.isReusable || this.currentUses >= this.maxUses) {
    this.status = 'used';
  }
};

// Check if can be used
controlNumberSchema.methods.canBeUsed = function() {
  return this.isValid && !this.isExpired;
};

// Extend validity
controlNumberSchema.methods.extendValidity = function(days = 7) {
  const currentValidUntil = this.validUntil || this.expiresAt;
  const extensionDate = new Date(currentValidUntil.getTime() + (days * 24 * 60 * 60 * 1000));
  this.validUntil = extensionDate;
};

// Bulk operations for batch generation
controlNumberSchema.statics.generateBatch = async function(options) {
  const {
    count,
    amount,
    currency,
    paymentMethod,
    merchant,
    generatedBy,
    prefix,
    expiresInDays = 7,
    validForDays = 7,
    isReusable = false,
    maxUses = 1
  } = options;

  const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const controlNumbers = [];

  const expiresAt = new Date(Date.now() + (expiresInDays * 24 * 60 * 60 * 1000));
  const validUntil = new Date(Date.now() + (validForDays * 24 * 60 * 60 * 1000));

  for (let i = 0; i < count; i++) {
    const controlNumber = new this({
      amount,
      currency,
      paymentMethod,
      merchant,
      generatedBy,
      prefix,
      expiresAt,
      validUntil,
      batchId,
      isReusable,
      maxUses
    });

    controlNumbers.push(controlNumber);
  }

  const saved = await this.insertMany(controlNumbers);
  return { batchId, count: saved.length, controlNumbers: saved };
};

module.exports = mongoose.model('ControlNumber', controlNumberSchema);
