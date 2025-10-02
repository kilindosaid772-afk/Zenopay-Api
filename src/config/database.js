const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    if (process.env.MONGODB_URI && process.env.MONGODB_URI !== 'mongodb://localhost:27017/zenopay') {
      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });

      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } else {
      console.log(`⚠️ MongoDB not configured, running without database`);
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('⚠️ Continuing without database connection...');
  }
};

module.exports = connectDB;
