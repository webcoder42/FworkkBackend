import cron from "node-cron";
import { checkAndProcessSubmissions } from "./AutoCompletionService.js";
import UserModel from "../Model/UserModel.js";
import { sendAccountReactivatedEmail } from "./EmailService.js";
import { autoRejectPrimeInvitations } from "../Controller.js/FworkkPrimeController.js";
import { checkProjectDeadlinesAndSendReminders } from "./DeadlineReminderService.js";
import { checkDailyWorkUpdatesAndSendReminders } from "./WorkUpdateReminderService.js";
import PlanPurchaseModel from "../Model/PlanPurchaseModel.js";


const initializeCronJobs = () => {
  // Initializing cron jobs...

  cron.schedule(
    "0 * * * *",
    async () => {
      // Running hourly auto-completion check for day-based intervals...
      try {
        await checkAndProcessSubmissions();
        // Daily auto-completion check completed
      } catch (error) {
        // (console removed)
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Karachi",
    }
  );

  // Check for suspended users to reactivate (runs every hour)
  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        const now = new Date();

        // Find users whose suspension period has ended
        const usersToReactivate = await UserModel.find({
          accountStatus: "suspended",
          suspensionEndDate: { $lte: now },
        });

        for (const user of usersToReactivate) {
          // Reactivate user
          await UserModel.findByIdAndUpdate(user._id, {
            accountStatus: "active",
            suspensionEndDate: null,
          });

          // Send reactivation email
          await sendAccountReactivatedEmail(user);

          // (console removed)
        }

        if (usersToReactivate.length > 0) {
          // (console removed)
        }
      } catch (error) {
        // (console removed)
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Karachi",
    }
  );
  
  // Auto-reject Fworkk Prime invitations older than 24h (runs every hour)
  cron.schedule(
    "0 * * * *",
    async () => {
      try {
        await autoRejectPrimeInvitations();
      } catch (error) {
        // (console removed)
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Karachi",
    }
  );

  // Send deadline reminders daily at 10:00 AM
  cron.schedule(
    "0 10 * * *",
    async () => {
      try {
        await checkProjectDeadlinesAndSendReminders();
      } catch (error) {
        // (console removed)
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Karachi",
    }
  );

  // Send daily work update reminders at 8:00 PM
  cron.schedule(
    "0 20 * * *",
    async () => {
      try {
        await checkDailyWorkUpdatesAndSendReminders();
      } catch (error) {
        // (console removed)
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Karachi",
    }
  );

  // Auto-expire pending NOWPayments older than 1 hour (runs every 15 minutes)
  cron.schedule(
    "*/15 * * * *",
    async () => {
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const result = await PlanPurchaseModel.updateMany(
          {
            paymentMethod: "nowpayments",
            status: "pending",
            submittedAt: { $lt: oneHourAgo }
          },
          {
            $set: { status: "expired" }
          }
        );

        if (result.modifiedCount > 0) {
          console.log(`✅ Auto-expired ${result.modifiedCount} pending NOWPayments transactions.`);
        }
      } catch (error) {
        console.error("Error in auto-expiring NOWPayments:", error);
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Karachi",
    }
  );

  // Cron jobs initialized successfully

};

export { initializeCronJobs };
