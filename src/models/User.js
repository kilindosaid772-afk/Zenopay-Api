const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['user', 'merchant', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  profileImage: {
    type: String,
    default: ''
  },
  businessName: {
    type: String,
    trim: true,
    maxlength: [100, 'Business name cannot be more than 100 characters']
  },
  businessType: {
    type: String,
    enum: ['individual', 'business', 'nonprofit'],
    default: 'individual'
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  preferences: {
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'Local']
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'ar']
    },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: false }
    }
  },
  apiKeys: [{
    key: {
      type: String,
      unique: true
    },
    name: String,
    permissions: [String],
    isActive: {
      type: Boolean,
      default: true
    },
    lastUsed: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  limits: {
    dailyTransactionLimit: {
      type: Number,
      default: 10000 // Default daily limit
    },
    monthlyTransactionLimit: {
      type: Number,
      default: 100000 // Default monthly limit
    }
  },
  statistics: {
    totalTransactions: {
      type: Number,
      default: 0
    },
    totalVolume: {
      type: Number,
      default: 0
    },
    successfulTransactions: {
      type: Number,
      default: 0
    },
    failedTransactions: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate API key
userSchema.methods.generateApiKey = function(name, permissions = []) {
  const crypto = require('crypto');
  const key = crypto.randomBytes(32).toString('hex');

  this.apiKeys.push({
    key,
    name,
    permissions,
    isActive: true
  });

  return key;
};

// Virtual for account balance (calculated from transactions)
userSchema.virtual('balance').get(function() {
  // This would be calculated based on transaction history
  return 0; // Placeholder
});

// Update statistics after transaction
userSchema.methods.updateStats = function(amount, status) {
  this.statistics.totalTransactions += 1;
  this.statistics.totalVolume += amount;

  if (status === 'completed') {
    this.statistics.successfulTransactions += 1;
  } else if (status === 'failed') {
    this.statistics.failedTransactions += 1;
  }
};

module.exports = mongoose.model('User', userSchema);
