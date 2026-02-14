import mongoose from "mongoose";
import dns from "dns";

// --- AGGRESSIVE DNS PATCH ---
// Force Google DNS globally for this process immediately
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
console.log("🛠️ DNS System: Google DNS (8.8.8.8) Forced Globally.");

const connectDB = async () => {
  try {
    let mongoUrl = process.env.MONGODB_URL;
    if (!mongoUrl) {
      console.error("❌ CRITICAL: MONGODB_URL is missing in .env file!");
      throw new Error("MONGODB_URL is not defined in environment variables");
    }

    const options = {
      maxPoolSize: 100,
      minPoolSize: 10,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000, 
      serverSelectionTimeoutMS: 30000, // 30 seconds to find the server
      heartbeatFrequencyMS: 10000,
      waitQueueTimeoutMS: 5000,
    };

    console.log(`🛠️ Node Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Attempt normal connection first
    try {
      console.log(`� Attempting connection (SRV)...`);
      const conn = await mongoose.connect(mongoUrl, options);
      console.log(`✅ Connected using SRV: ${conn.connection.host}`);
      return conn;
    } catch (srvError) {
      if (mongoUrl.startsWith('mongodb+srv://') && (srvError.code === 'ECONNREFUSED' || srvError.message.includes('querySrv'))) {
         console.warn("⚠️ SRV Resolution Failed. Attempting Neural Fallback to Standard Format...");
         
         // Extract user and cluster from mongodb+srv://USER:PASS@CLUSTER/DB
         const match = mongoUrl.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)\/([^?]*)/);
         if (match) {
            const [_, user, pass, cluster, db] = match;
            console.log(`� Resolving cluster nodes for ${cluster}...`);
            
            try {
              const addresses = await new Promise((resolve, reject) => {
                dns.resolveSrv(`_mongodb._tcp.${cluster}`, (err, addr) => err ? reject(err) : resolve(addr));
              });

              if (addresses && addresses.length > 0) {
                const nodes = addresses.map(a => `${a.name}:${a.port}`).join(',');
                const fallbackUrl = `mongodb://${user}:${pass}@${nodes}/${db}?authSource=admin&replicaSet=atlas-7jm9qfk-shard-0&tls=true`;
                
                console.log(`🚀 Neural Bridge: Connecting via direct nodes...`);
                const conn = await mongoose.connect(fallbackUrl, options);
                console.log(`✅ Connected using Fallback: ${conn.connection.host}`);
                return conn;
              }
            } catch (fallbackErr) {
               console.error("❌ Neural Fallback failed:", fallbackErr.message);
            }
         }
      }
      throw srvError;
    }

    console.log(`📍 Host: ${conn.connection.host}`);
    console.log(`📊 DB Name: ${conn.connection.name}`);

    // Monitor connection events with deep logs
    mongoose.connection.on('connected', () => {
      console.log('🟢 Mongoose: Connection pool established');
    });

    mongoose.connection.on('error', (err) => {
      console.error('🔴 Mongoose: Connection error occurred:');
      console.error(JSON.stringify(err, null, 2));
      if (err.name === 'MongoNetworkError') {
        console.error('👉 TIP: Check your internet connection or if your IP is whitelisted in MongoDB Atlas.');
      }
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('🟡 Mongoose: Connection lost/disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔵 Mongoose: Connection re-established');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🛑 Mongoose: Connection closed due to app termination');
      process.exit(0);
    });

    return conn;

  } catch (error) {
    console.error(`\n❌ --- MONGODB CONNECTION ERROR DETAILS ---`);
    console.error(`Code: ${error.code || 'N/A'}`);
    console.error(`Name: ${error.name || 'N/A'}`);
    console.error(`Message: ${error.message}`);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error(`\n🔍 ANALYSIS: Connection Refused.`);
      console.error(`Possible reasons:`);
      console.error(`1. DNS issues (SRV record not found). Try changing DNS to 8.8.8.8`);
      console.error(`2. Firewall blocking port 27017.`);
      console.error(`3. IP not whitelisted in MongoDB Atlas.`);
      console.error(`4. Internet connection is unstable.`);
    }

    if (error.stack) {
      console.error(`\nStack Trace:\n${error.stack}`);
    }
    console.error(`-------------------------------------------\n`);

    throw error;
  }
};

export default connectDB;

