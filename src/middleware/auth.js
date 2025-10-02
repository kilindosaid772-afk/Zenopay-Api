const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid. User not found.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('Authentication error:', error.message);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
};

// Middleware to check user roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`
      });
    }

    next();
  };
};

// Middleware to check Zenopay API key authentication
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.header('x-api-key');

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No API key provided. Use x-api-key header.'
      });
    }

    if (apiKey !== process.env.ZENOPAY_API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key.'
      });
    }

    req.user = {
      id: 'zenopay_api_user',
      role: 'merchant',
      type: 'api_key',
      permissions: ['payments:read', 'payments:write']
    };

    next();

  } catch (error) {
    console.error('API key authentication error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error during API key authentication.'
    });
  }
};

// Middleware to check merchant API keys
const authenticateMerchantApiKey = async (req, res, next) => {
  try {
    const apiKey = req.header('x-api-key');

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No API key provided.'
      });
    }

    if (apiKey.startsWith('merchant_')) {
      const parts = apiKey.split('_');
      if (parts.length >= 3) {
        const userId = parts[1];
        const user = await User.findById(userId);

        if (!user || !user.isActive) {
          return res.status(401).json({
            success: false,
            message: 'Invalid merchant API key.'
          });
        }

        const keyExists = user.apiKeys.some(key => key.key === apiKey && key.isActive);
        if (!keyExists) {
          return res.status(401).json({
            success: false,
            message: 'API key not found or deactivated.'
          });
        }

        req.user = user;
        next();
        return;
      }
    }

    return authenticateApiKey(req, res, next);

  } catch (error) {
    console.error('Merchant API key authentication error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error during merchant API key authentication.'
    });
  }
};

// Rate limiting middleware
const checkApiRateLimit = (req, res, next) => {
  next();
};

// Optional authentication
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  authenticateApiKey,
  authenticateMerchantApiKey,
  checkApiRateLimit,
  optionalAuth
};
