import rateLimit from "express-rate-limit";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message:
    "Too many login attempts from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => {
   
    if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
      return true;
    }
    return false;
  },
});

export const createProjectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: "You have reached the limit for creating/updating projects. Please try again after 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});
