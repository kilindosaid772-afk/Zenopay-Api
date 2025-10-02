require('dotenv').config();

console.log('🔍 Environment Check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('ZENOPAY_API_KEY:', process.env.ZENOPAY_API_KEY ? 'Set' : 'Not set');
console.log('ZENO_ID:', process.env.ZENO_ID ? 'Set' : 'Not set');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');

console.log('\n🚀 Testing basic imports...');

try {
  const express = require('express');
  console.log('✅ Express loaded');

  const mongoose = require('mongoose');
  console.log('✅ Mongoose loaded');

  const app = express();
  console.log('✅ Express app created');

  // Test basic route without database
  app.get('/test', (req, res) => {
    res.json({ success: true, message: 'Server is running!' });
  });

  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => {
    console.log(`✅ Test server running on port ${PORT}`);
    console.log(`🔗 Test endpoint: http://localhost:${PORT}/test`);

    // Stop server after 5 seconds
    setTimeout(() => {
      server.close(() => {
        console.log('✅ Test completed successfully');
        process.exit(0);
      });
    }, 5000);
  });

} catch (error) {
  console.error('❌ Error during basic test:', error.message);
  process.exit(1);
}
