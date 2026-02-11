import mongoose from "mongoose";


const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URL) {
      throw new Error("MONGODB_URL is not defined in environment variables");
    }

    const options = {
      maxPoolSize: 100, // Increased for production load
      minPoolSize: 10,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
      waitQueueTimeoutMS: 5000, // Reject requests if pool is full for 5s
    };

    const conn = await mongoose.connect(process.env.MONGODB_URL, options);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Monitor connection events
    mongoose.connection.on('connected', () => {
      console.log('📦 Mongoose connection pool established');
    });

    mongoose.connection.on('error', (err) => {
      console.error(`❌ Mongoose connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ Mongoose connection disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🛑 Mongoose connection closed due to app termination');
      process.exit(0);
    });

    return conn;

  } catch (error) {
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    // Re-throw to handle in server.js
    throw error;
  }
};

export default connectDB;

