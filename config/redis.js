import redis from "redis";
import dotenv from "dotenv";

dotenv.config();

let redisClient;

const isProduction = process.env.NODE_ENV === 'production';
const redisUrl = process.env.REDIS_URL;

// If REDIS_URL is local and we are in production, it's likely a configuration error
const isLocalRedis = redisUrl && (redisUrl.includes('127.0.0.1') || redisUrl.includes('localhost'));

const setupDummyRedis = () => {
    console.log("ℹ️ Redis functionality is disabled (using dummy client).");
    return {
        get: async () => null,
        set: async () => null,
        setEx: async () => null,
        del: async () => null,
        connect: async () => { },
        on: () => { },
        quit: async () => { },
        isOpen: false,
    };
};

if (redisUrl && !(isProduction && isLocalRedis)) {
    redisClient = redis.createClient({
        url: redisUrl,
        socket: {
            reconnectStrategy: (retries) => {
                if (retries > 3) {
                    console.error("❌ Redis reconnection abandoned after 3 attempts");
                    return false; // Stop retrying
                }
                return Math.min(retries * 100, 3000);
            },
            connectTimeout: 5000,
        }
    });

    redisClient.on("error", (err) => {
        console.error("⚠️ Redis Client Error:", err.message);
    });

    (async () => {
        try {
            await redisClient.connect();
            console.log("✅ Redis connected");
        } catch (err) {
            console.error("❌ Redis connection failed:", err.message);
            console.log("⚠️ Falling back to dummy Redis client");
            redisClient = setupDummyRedis();
        }
    })();
} else {
    if (isProduction && isLocalRedis) {
        console.log("⚠️ Skipping local Redis URL in production environment.");
    } else if (!redisUrl) {
        console.log("⚠️ REDIS_URL not provided.");
    }
    redisClient = setupDummyRedis();
}

export { redisClient };
