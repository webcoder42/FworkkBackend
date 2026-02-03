import { redisClient } from "../server.js";

export const cacheMiddleware = (keyGenerator, ttl = 3600) => {
  return async (req, res, next) => {
    try {
      const key =
        typeof keyGenerator === "function"
          ? keyGenerator(req)
          : keyGenerator;

      const cachedData = await redisClient.get(key);

      if (cachedData) {
        res.setHeader("X-Cache", "HIT");
        console.log(`⚡ Redis HIT: ${key}`);
        return res.status(200).json(JSON.parse(cachedData));
      }

      res.setHeader("X-Cache", "MISS");
      console.log(`🐢 Redis MISS: ${key}`);

      res.locals.cacheKey = key;
      res.locals.cacheTTL = ttl;

      next();
    } catch (err) {
      console.error("❌ Redis cache error:", err);
      next();
    }
  };
};
