const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate, authorize, authenticateApiKey } = require('../middleware/auth');

// Register new merchant (for Zenopay gateway)
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      businessName,
      businessType = 'individual'
    } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone already exists'
      });
    }

    // Create new merchant
    const user = new User({
      name,
      email: email.toLowerCase(),
      phone,
      password,
      role: 'merchant',
      businessName,
      businessType
    });

    await user.save();

    // Generate JWT token for the merchant
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Merchant registered successfully',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          businessName: user.businessName,
          businessType: user.businessType
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error.message);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// Login merchant
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check if user exists and include password for comparison
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          businessName: user.businessName,
          businessType: user.businessType,
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// Zenopay API Key Authentication endpoint
// This is for merchants who want to use Zenopay API key instead of JWT
router.post('/api-key-auth', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'API key is required'
      });
    }

    // For this demo, we'll use a simple API key check
    // In production, this would validate against Zenopay's master API key
    if (apiKey !== process.env.ZENOPAY_API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    // Generate a session token for API key authentication
    const sessionToken = jwt.sign(
      {
        type: 'api_key',
        apiKey: apiKey,
        permissions: ['payments:read', 'payments:write', 'control_numbers:manage']
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'API key authentication successful',
      data: {
        token: sessionToken,
        type: 'api_key',
        permissions: ['payments:read', 'payments:write', 'control_numbers:manage']
      }
    });

  } catch (error) {
    console.error('API key authentication error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error during API key authentication'
    });
  }
});

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          businessName: user.businessName,
          businessType: user.businessType,
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified,
          isActive: user.isActive,
          preferences: user.preferences,
          statistics: user.statistics,
          limits: user.limits,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Profile retrieval error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving profile'
    });
  }
});

// Update user profile
router.put('/me', authenticate, async (req, res) => {
  try {
    const {
      name,
      phone,
      businessName,
      businessType,
      address,
      preferences
    } = req.body;

    const user = await User.findById(req.user.id);

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (businessName) user.businessName = businessName;
    if (businessType) user.businessType = businessType;
    if (address) user.address = address;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          businessName: user.businessName,
          businessType: user.businessType,
          address: user.address,
          preferences: user.preferences
        }
      }
    });

  } catch (error) {
    console.error('Profile update error:', error.message);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
});

// Change password
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error changing password'
    });
  }
});

// Get Zenopay API information (for merchants integrating with Zenopay)
router.get('/zenopay-info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Zenopay Payment Gateway',
      version: '1.0.0',
      supportedNetworks: ['mtn', 'airtel', 'vodafone', 'tigo'],
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'Local'],
      supportedPaymentMethods: ['mobile_money', 'bank_transfer', 'card', 'paypal'],
      apiKey: process.env.ZENOPAY_API_KEY, // In production, this would be provided separately
      baseUrl: `${req.protocol}://${req.get('host')}`,
      documentation: `${req.protocol}://${req.get('host')}/docs`
    }
  });
});

// Generate merchant API key (for merchants who want to use API key auth)
router.post('/generate-merchant-key', authenticate, async (req, res) => {
  try {
    const { name, permissions = ['payments:read', 'payments:write'] } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'API key name is required'
      });
    }

    const user = await User.findById(req.user.id);

    // Generate a merchant-specific API key
    const apiKey = `merchant_${user._id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Store the API key (in production, this would be stored securely)
    user.apiKeys.push({
      key: apiKey,
      name,
      permissions,
      isActive: true,
      createdAt: new Date()
    });

    await user.save();

    res.json({
      success: true,
      message: 'Merchant API key generated successfully',
      data: {
        apiKey,
        name,
        permissions,
        usage: `Use this key in X-API-Key header or api_key query parameter`
      }
    });

  } catch (error) {
    console.error('Merchant API key generation error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error generating merchant API key'
    });
  }
});

// Admin routes (for Zenopay administrators)
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, role, isActive } = req.query;

    const query = {};
    if (role) query.role = role;
    if (typeof isActive === 'boolean') query.isActive = isActive;

    const skip = (page - 1) * limit;

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Users retrieval error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving users'
    });
  }
});

// Deactivate/activate user (admin only)
router.put('/users/:userId/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value'
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { user }
    });

  } catch (error) {
    console.error('User status update error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error updating user status'
    });
  }
});

module.exports = router;
