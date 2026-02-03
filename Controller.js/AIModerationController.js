import PostProjectModel from "../Model/PostProjectModel.js";
import UserModel from "../Model/UserModel.js";
import { sendProjectHoldEmail } from "../services/EmailService.js";
import { redisClient } from "../server.js";

// === Contact Details Detection helper ===
const containsContactDetails = (text) => {
  if (!text || typeof text !== "string") return false;
  const phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4,}/g;
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const socialRegex = /(@[a-zA-Z0-9_]{3,})|(instagram\.com\/[a-zA-Z0-9_.]+)|(facebook\.com\/[a-zA-Z0-9_.]+)|(t\.me\/[a-zA-Z0-9_.]+)|(wa\.me\/\d+)/gi;
  return phoneRegex.test(text) || emailRegex.test(text) || socialRegex.test(text);
};

// Helper for internal use (e.g. by scheduler)
export const internalModerationScan = async (io = null) => {
    try {
        const openProjects = await PostProjectModel.find({ status: "open" }).populate("client");
        let caughtCount = 0;
        const caughtProjects = [];

        for (const project of openProjects) {
            const hasContact = containsContactDetails(project.title) || 
                               containsContactDetails(project.description) || 
                               containsContactDetails(project.problems);
            
            if (hasContact) {
                project.status = "hold";
                await project.save();
                caughtCount++;
                caughtProjects.push({
                    id: project._id,
                    title: project.title,
                    client: project.client?.username
                });

                // Notify User via Email
                if (project.client) {
                    try {
                        await sendProjectHoldEmail(project.client, project);
                    } catch (err) {
                        console.error(`Failed to send hold email for project ${project._id}:`, err);
                    }
                }
            }
        }

        const result = {
            success: true,
            scannedCount: openProjects.length,
            caughtCount,
            caughtProjects,
            timestamp: new Date()
        };

        if (caughtCount > 0) {
            await redisClient.del(`get-all-jobs`);
            await redisClient.del(`latest-job`);
            await redisClient.del(`get-all-job`);
        }

        // Real-time update via Socket.IO
        if (io) {
            io.emit("aiModerationUpdate", result);
        }

        return result;
    } catch (error) {
        console.error("Internal AI Moderation Error:", error);
        return { success: false, error: error.message };
    }
};

export const runAIProjectModeration = async (req, res) => {
  try {
    const result = await internalModerationScan(req.io);
    res.status(200).json(result);
  } catch (error) {
    console.error("AI Moderation Route Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during moderation scan",
    });
  }
};
