const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Payment = require('../src/models/Payment');

describe('Zenopay Payment Gateway API', () => {
  let authToken;
  let testUser;
  let testPayment;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zenopay_test');

    // Create test user
    testUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      phone: '+1234567890',
      password: 'testpassword123',
      role: 'merchant'
    });

    await testUser.save();

    // Generate auth token
    const jwt = require('jsonwebtoken');
    authToken = jwt.sign(
      { id: testUser._id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({});
    await Payment.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Authentication', () => {
    test('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'New User',
          email: 'newuser@example.com',
          phone: '+1987654321',
          password: 'password123',
          businessName: 'Test Business'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe('newuser@example.com');
    });

    test('should login user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe('test@example.com');
    });

    test('should get user profile', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
    });
  });

  describe('Mobile Money Payments', () => {
    test('should initiate mobile money payment', async () => {
      const response = await request(app)
        .post('/api/payments/mobile-money/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          network: 'mtn',
          phoneNumber: '+1234567890',
          amount: 100,
          currency: 'USD',
          description: 'Test mobile money payment'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reference).toBeDefined();
      expect(response.body.data.network).toBe('mtn');
    });

    test('should check mobile money payment status', async () => {
      // First create a payment
      testPayment = new Payment({
        reference: 'TEST_MM_001',
        amount: 100,
        currency: 'USD',
        paymentMethod: {
          type: 'mobile_money',
          provider: 'mtn'
        },
        merchant: testUser._id,
        status: 'pending'
      });
      await testPayment.save();

      const response = await request(app)
        .get(`/api/payments/mobile-money/status/${testPayment.reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Bank Transfers', () => {
    test('should initiate bank transfer', async () => {
      const response = await request(app)
        .post('/api/payments/bank/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 500,
          currency: 'USD',
          toAccount: '1234567890',
          toBank: 'Test Bank',
          toAccountName: 'Test Recipient',
          description: 'Test bank transfer'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reference).toBeDefined();
    });

    test('should validate bank account', async () => {
      const response = await request(app)
        .post('/api/payments/bank/validate-account')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          accountNumber: '1234567890',
          bankCode: 'TEST001',
          accountType: 'savings'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Control Numbers', () => {
    test('should generate control number', async () => {
      const response = await request(app)
        .post('/api/payments/control-number/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 200,
          currency: 'USD',
          paymentMethod: {
            type: 'mobile_money',
            provider: 'mtn'
          },
          description: 'Test control number'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.controlNumber).toBeDefined();
    });

    test('should validate control number', async () => {
      // Create a test control number first
      const ControlNumber = require('../src/models/ControlNumber');
      const testControlNumber = new ControlNumber({
        controlNumber: 'ZENO123456789',
        amount: 100,
        currency: 'USD',
        paymentMethod: {
          type: 'mobile_money',
          provider: 'mtn'
        },
        merchant: testUser._id,
        generatedBy: testUser._id,
        status: 'active',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
      await testControlNumber.save();

      const response = await request(app)
        .get(`/api/payments/control-number/validate/${testControlNumber.controlNumber}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(true);
    });
  });

  describe('Payment Management', () => {
    test('should create payment', async () => {
      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 150,
          currency: 'USD',
          description: 'Test payment creation',
          paymentMethod: {
            type: 'mobile_money',
            provider: 'mtn'
          },
          payerInfo: {
            name: 'Test Payer',
            email: 'payer@example.com',
            phone: '+1234567890'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reference).toBeDefined();
    });

    test('should get payments list', async () => {
      const response = await request(app)
        .get('/api/payments/list')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.payments)).toBe(true);
    });

    test('should get payment by reference', async () => {
      const response = await request(app)
        .get(`/api/payments/${testPayment.reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reference).toBe(testPayment.reference);
    });
  });

  describe('Analytics', () => {
    test('should get payment summary', async () => {
      const response = await request(app)
        .get('/api/payments/analytics/summary')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get revenue analytics', async () => {
      const response = await request(app)
        .get('/api/payments/analytics/revenue')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle unauthorized access', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should handle invalid payment method', async () => {
      const response = await request(app)
        .post('/api/payments/mobile-money/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          network: 'invalid_network',
          phoneNumber: '+1234567890',
          amount: 100
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Test payment without amount'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OK');
      expect(response.body.service).toBe('Zenopay Payment Gateway');
    });
  });
});

module.exports = {};
