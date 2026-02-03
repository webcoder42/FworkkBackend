import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { redisClient } from "../../server.js";
import filter from "leo-profanity";
import UserModel from "../../Model/UserModel.js";
import { sendProfileSuspensionEmail, sendProfileWarningEmail } from "../../services/EmailService.js";
import dotenv from "dotenv";

dotenv.config();

const API_FRONTENT_URL = process.env.API_FRONTENT_URL || "https://fworkk.netlify.app";

// Redis Key Prefixes
export const REDIS_REG_PREFIX = "reg_verify:";
export const REDIS_LOGIN_PREFIX = "login_verify:";
export const REDIS_ACC_PREFIX = "acc_verify:";

// In-memory fallback for when Redis is not available
const memoryStorage = new Map();

// === Helper Functions ===

export const setAuthCookies = (res, user) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role, UserType: user.UserType },
    process.env.JWT_SECRET,
    { expiresIn: "5d" }
  );

  return { accessToken };
};

export const setRedisData = async (key, data, expirySeconds) => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.setEx(key, expirySeconds, JSON.stringify(data));
    } else {
      memoryStorage.set(key, JSON.stringify(data));
      setTimeout(() => memoryStorage.delete(key), expirySeconds * 1000);
    }
  } catch (error) {
    console.error("Redis/Memory set error:", error);
  }
};

export const getRedisData = async (key) => {
  try {
    if (redisClient && redisClient.isOpen) {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      const data = memoryStorage.get(key);
      return data ? JSON.parse(data) : null;
    }
  } catch (error) {
    console.error("Redis/Memory get error:", error);
    return null;
  }
};

export const deleteRedisData = async (key) => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.del(key);
    } else {
      memoryStorage.delete(key);
    }
  } catch (error) {
    console.error("Redis/Memory delete error:", error);
  }
};

export const generateUserUniqueId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const generateReferralCode = () => {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
};

export const generateReferralLink = (referralCode) => {
  return `${API_FRONTENT_URL}/register?referralCode=${referralCode}`;
};

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

export const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// === Content Violation Handling ===

const customBadWords = [
  "sex", "fuck", "shit", "bitch", "asshole", "damn", "bastard", "whore", "slut",
  "chutiya", "bhenchod", "madarchod", "randi", "harami", "kamina", "kutta", "saala",
  "behenchod", "gaandu", "randii", "bhen chod", "ma chod", "bhosdike", "lodu", "chodu",
  "kutiya", "f*ck", "sh*t", "b*tch", "a**hole", "ch*tiya", "r*ndi",
];

filter.add(customBadWords);

export const containsInappropriateContent = (text) => {
  if (!text || typeof text !== "string") return false;
  return filter.check(text.toLowerCase());
};

export const handleProfileContentViolation = async (userId, content, violationType) => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) return { suspended: false, warningCount: 0 };

    if (!user.warnings || !user.warnings.inappropriateContent) {
      user.warnings = {
        inappropriateContent: {
          count: 0,
          warningHistory: [],
        },
      };
    }

    user.warnings.inappropriateContent.count += 1;
    user.warnings.inappropriateContent.lastWarningDate = new Date();

    user.warnings.inappropriateContent.warningHistory.push({
      date: new Date(),
      reason: violationType,
      content: content.substring(0, 100),
    });

    const warningCount = user.warnings.inappropriateContent.count;

    if (warningCount >= 2) {
      user.accountStatus = "suspended";
      await user.save();
      await sendProfileSuspensionEmail(user.email, user.Fullname || user.username);
      return { suspended: true, warningCount };
    } else {
      await user.save();
      await sendProfileWarningEmail(user.email, user.Fullname || user.username, warningCount);
      return { suspended: false, warningCount };
    }
  } catch (error) {
    console.error("Error handling profile content violation:", error);
    return { suspended: false, warningCount: 0 };
  }
};
