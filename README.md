# Zenopay Payment Gateway API

A Node.js implementation of the Zenopay Payment Gateway API for Tanzania mobile money payments.

## Overview

This API provides a simple interface to integrate with Zenopay's payment system, specifically designed for Tanzania mobile money payments. It handles the communication with Zenopay's actual API endpoints and provides local database storage for payment tracking.

## Features

###  Tanzania Mobile Money Integration
- **Direct Zenopay API Integration**: Uses actual Zenopay endpoints
- **Mobile Money Payments**: Support for Tanzania mobile money networks
- **Real-time Status Updates**: Webhook support for payment notifications
- **Payment Tracking**: Local database storage for transaction history

###  Technical Architecture
- **RESTful API**: Clean endpoints matching Zenopay's API structure
- **MongoDB Integration**: Local storage for payment records
- **Authentication**: API key-based authentication using `x-api-key` header
- **Error Handling**: Comprehensive error management and logging
- **Webhook Support**: Receive real-time payment updates

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- MongoDB
- API keys for payment providers (MTN, Airtel, Vodafone, Tigo, Bank, Stripe, PayPal)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd zenopay-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env .env.local
   ```

   Edit `.env` with your configuration:
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/zenopay

   # Mobile Money API Keys
   MTN_API_KEY=your-mtn-api-key
   AIRTEL_API_KEY=your-airtel-api-key
   VODAFONE_API_KEY=your-vodafone-api-key
   TIGO_API_KEY=your-tigo-api-key

   # Bank API Configuration
   BANK_API_KEY=your-bank-api-key

   # International Payment (Stripe/PayPal)
   STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
   PAYPAL_CLIENT_ID=your-paypal-client-id
   ```

4. **Start the server**
   ```bash
   npm start
   ```

   For development:
   ```bash
   npm run dev
   ```

## API Documentation

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "password": "securepassword",
  "businessName": "My Business",
  "role": "merchant"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}
```

### Mobile Money Payments

#### Initiate Payment
```http
POST /api/payments/mobile-money/initiate
Authorization: Bearer <token>
Content-Type: application/json

{
  "network": "mtn",
  "phoneNumber": "+1234567890",
  "amount": 100.00,
  "currency": "USD",
  "description": "Payment for services"
}
```

#### Check Payment Status
```http
GET /api/payments/mobile-money/status/<reference>
Authorization: Bearer <token>
```

### Bank Transfers

#### Initiate Transfer
```http
POST /api/payments/bank/initiate
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 500.00,
  "currency": "USD",
  "toAccount": "1234567890",
  "toBank": "Sample Bank",
  "toAccountName": "Recipient Name",
  "description": "Bank transfer payment"
}
```

#### Validate Account
```http
POST /api/payments/bank/validate-account
Authorization: Bearer <token>
Content-Type: application/json

{
  "accountNumber": "1234567890",
  "bankCode": "BANK001",
  "accountType": "savings"
}
```

### Control Numbers

#### Generate Control Number
```http
POST /api/payments/control-number/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 200.00,
  "currency": "USD",
  "paymentMethod": {
    "type": "mobile_money",
    "provider": "mtn"
  },
  "description": "Payment reference",
  "expiresInDays": 7,
  "validForDays": 7
}
```

#### Validate Control Number
```http
GET /api/payments/control-number/validate/<controlNumber>
Authorization: Bearer <token>
```

### Payment Management

#### Create Payment
```http
POST /api/payments/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 150.00,
  "currency": "USD",
  "description": "Direct payment",
  "paymentMethod": {
    "type": "mobile_money",
    "provider": "mtn"
  },
  "payerInfo": {
    "name": "Payer Name",
    "email": "payer@example.com",
    "phone": "+1234567890"
  }
}
```

#### Get Payments List
```http
GET /api/payments/list?page=1&limit=20&status=completed
Authorization: Bearer <token>
```

### Analytics

#### Payment Summary
```http
GET /api/payments/analytics/summary?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

#### Revenue Analytics
```http
GET /api/payments/analytics/revenue?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

## Payment Flow Examples

### Mobile Money Payment Flow

1. **Initiate Payment**
   ```javascript
   const response = await fetch('/api/payments/mobile-money/initiate', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${token}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       network: 'mtn',
       phoneNumber: '+1234567890',
       amount: 100,
       description: 'Payment for goods'
     })
   });

   const { reference } = await response.json();
   ```

2. **Handle Callback**
   ```javascript
   // Set up webhook endpoint to receive payment notifications
   app.post('/webhooks/mobile-money/:network', async (req, res) => {
     const { reference, status } = req.body;

     if (status === 'completed') {
       // Payment successful - update order status
       console.log(`Payment ${reference} completed`);
     }

     res.json({ received: true });
   });
   ```

### Control Number Payment Flow

1. **Generate Control Number**
   ```javascript
   const response = await fetch('/api/payments/control-number/generate', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${token}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       amount: 500,
       paymentMethod: {
         type: 'mobile_money',
         provider: 'mtn'
       },
       description: 'Invoice payment'
     })
   });

   const { controlNumber } = await response.json();
   ```

2. **Customer Pays Using Control Number**
   ```javascript
   // Customer dials *170# (MTN) and enters control number
   // Or uses mobile money app to pay to the control number
   ```

3. **Validate and Process Payment**
   ```javascript
   const validateResponse = await fetch(`/api/payments/control-number/validate/${controlNumber}`);
   const validation = await validateResponse.json();

   if (validation.data.isValid) {
     // Process the payment
     console.log(`Payment of ${validation.data.amount} validated`);
   }
   ```

## Error Handling

The API uses consistent error response format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": ["Specific error details"] // Optional
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **API Key Support**: Alternative authentication method for integrations
- **Rate Limiting**: Prevents abuse with configurable limits
- **Input Validation**: Comprehensive validation of all inputs
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet Security**: Sets various HTTP headers for security

## Testing

Run the test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Deployment

### Environment Setup
1. Set `NODE_ENV=production`
2. Configure production database
3. Set up proper API keys for production
4. Configure reverse proxy (nginx recommended)

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## API Reference

For complete API documentation, visit `/api/docs` when the server is running or check the [Postman Collection](docs/postman-collection.json).

## Support

For support and questions:
- Email: support@zenopay.com
- Documentation: [docs.zenopay.com](https://docs.zenopay.com)
- API Status: [status.zenopay.com](https://status.zenopay.com)

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Changelog

### v1.0.0
- Initial release with mobile money, bank transfers, and international payments
- Control number management system
- Comprehensive API with authentication and analytics
- Full test coverage
