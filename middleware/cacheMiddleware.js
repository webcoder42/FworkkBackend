import { redisClient } from "../config/redis.js";
import logger from "../utils/logger.js";

/**
 * Redis Cache Middleware
 * @param {number} duration - Cache duration in seconds
 * @param {string|function} keyPrefix - Prefix for the cache key or a function (req) => key
 */
export const cacheMiddleware = (duration, keyPrefix) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    let key;
    if (typeof keyPrefix === 'function') {
      key = keyPrefix(req);
    } else {
      key = `${keyPrefix}:${req.user?.id || 'public'}:${req.originalUrl || req.url}`;
    }

    try {
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        // logger.info(`⚡ Redis HIT: ${key}`);
        return res.status(200).json(JSON.parse(cachedData));
      }
      
      // logger.info(`🐢 Redis MISS: ${key}`);

      // Patch res.json to catch the response and save it to redis
      const originalJson = res.json;
      res.json = (body) => {
        res.json = originalJson;
        
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisClient.setEx(key, duration, JSON.stringify(body)).catch(err => {
            logger.error(`Redis set error: ${err.message}`);
          });
        }
        
        return res.json(body);
      };

      next();
    } catch (err) {
      logger.error(`Redis middleare error: ${err.message}`);
      next();
    }
  };
};
