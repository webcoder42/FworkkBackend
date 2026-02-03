import filter from "leo-profanity";
import UserModel from "../../Model/UserModel.js";
import { sendContentWarningEmail, sendAccountSuspensionEmail } from "../../services/EmailService.js";
import { redisClient } from "../../server.js";

// === Bad Words Filter Setup ===
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

// === Contact Details Detection ===
export const containsContactDetails = (text) => {
  if (!text || typeof text !== "string") return false;
  const phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4,}/g;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const socialRegex = /(@[a-zA-Z0-9_]{3,})|(instagram\.com\/[a-zA-Z0-9_.]+)|(facebook\.com\/[a-zA-Z0-9_.]+)|(t\.me\/[a-zA-Z0-9_.]+)|(wa\.me\/\d+)/gi;
  return phoneRegex.test(text) || emailRegex.test(text) || socialRegex.test(text);
};

export const handleInappropriateContentViolation = async (userId, content, violationType) => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) return { suspended: false, warningCount: 0 };

    if (!user.warnings || !user.warnings.inappropriateContent) {
      user.warnings = {
        inappropriateContent: { count: 0, warningHistory: [] },
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
      await sendAccountSuspensionEmail(user, "Multiple inappropriate content violations");
      return { suspended: true, warningCount };
    } else {
      await user.save();
      await sendContentWarningEmail(user, warningCount, violationType);
      return { suspended: false, warningCount };
    }
  } catch (error) {
    console.error("Error handling inappropriate content violation:", error);
    return { suspended: false, warningCount: 0 };
  }
};

export const clearProjectCache = async (userId) => {
    try {
        await redisClient.del(`get-all-jobs`);
        await redisClient.del(`latest-job`);
        await redisClient.del(`get-single-job`);
        await redisClient.del(`search-job`);
        await redisClient.del(`get-all-job`);
        if (userId) {
            await redisClient.del(`my-post-job:${userId}`);
            await redisClient.del(`client-project:${userId}`);
        }
        console.log(`🧹 Cache cleared`);
    } catch (err) {
        console.error("Cache clear error:", err);
    }
};
