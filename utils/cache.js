import { redisClient } from "../server.js";

/**
 * Cache utility for Redis
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in seconds
 * @param {function} fetchFn - Function to fetch data if cache miss
 */
export const withCache = async (key, ttl, fetchFn) => {
  try {
    // Attempt to get from Redis
    const cachedData = await redisClient.get(key);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Cache miss, fetch data
    const data = await fetchFn();

    // Store in Redis (if not null/undefined)
    if (data !== null && data !== undefined) {
      await redisClient.setEx(key, ttl, JSON.stringify(data));
    }

    return data;
  } catch (error) {
    console.error(`❌ Cache error for key ${key}:`, error.message);
    // Fallback to fetching data directly
    return fetchFn();
  }
};

export const clearCache = async (key) => {
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error(`❌ Error clearing cache for key ${key}:`, error.message);
  }
};
