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

const isRender = process.env.RENDER === 'true' || process.env.RENDER_SERVICE_ID !== undefined;

if (redisUrl && !(isProduction && isLocalRedis)) {
    // Basic URL check for production environments
    if (isProduction && isLocalRedis) {
        console.warn("⚠️ Warning: Using local Redis URL in production. This will likely fail on Render.");
    }

    redisClient = redis.createClient({
        url: redisUrl,
        socket: {
            reconnectStrategy: (retries) => {
                if (retries > 3) {
                    console.error("❌ Redis reconnection abandoned after 3 attempts");
                    return false; // Stop retrying
                }
                const delay = Math.min(retries * 500, 5000);
                return delay;
            },
            connectTimeout: 10000,
        }
    });

    redisClient.on("error", (err) => {
        // Only log once to avoid flooding
        if (redisClient.isOpen) {
            console.error("⚠️ Redis Client Error:", err.message);
        }
    });

    (async () => {
        try {
            await redisClient.connect();
            console.log("✅ Redis connected successfully");
        } catch (err) {
            console.error("❌ Redis connection failed:", err.message);
            if (isRender && isLocalRedis) {
                console.info("💡 Tip: On Render, you need to create a Redis service and use its Internal Redis URL.");
            }
            console.log("⚠️ Falling back to dummy Redis client");
            redisClient = setupDummyRedis();
        }
    })();
} else {
    if (isProduction && isLocalRedis) {
        console.log("⚠️ Skipping local Redis URL in production environment to prevent connection errors.");
    } else if (!redisUrl) {
        console.log("ℹ️ REDIS_URL not provided. Redis caching is disabled.");
    }
    redisClient = setupDummyRedis();
}

export { redisClient };
