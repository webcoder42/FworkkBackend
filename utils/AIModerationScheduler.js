import { internalModerationScan } from "../Controller.js/AIModerationController.js";

/**
 * AI Moderation Scheduler
 * Submits a moderation scan every 30 seconds to catch projects with contact details.
 * @param {Object} io - Socket.io instance
 */
const startAIModerationScheduler = (io) => {
    console.log("🤖 AI Moderation Scheduler Initialized (Every 30s)");
    
    // Initial scan on startup
    setTimeout(async () => {
        await internalModerationScan(io);
    }, 5000);

    // Periodic scan
    setInterval(async () => {
        try {
            // console.log("🔍 AI Autopilot: Starting periodic moderation scan...");
            await internalModerationScan(io);
        } catch (error) {
            console.error("AI Moderation Scheduler Error:", error);
        }
    }, 300000); // 5 minutes
};

export default startAIModerationScheduler;
