import PostProjectModel from "../Model/PostProjectModel.js";
import ProjectApplyModel from "../Model/ProjectApplyModel.js";
import { sendWorkUpdateReminderEmail } from "./EmailService.js";
import UserModel from "../Model/UserModel.js";
import MessageModel from "../Model/MessageModel.js";

export const checkDailyWorkUpdatesAndSendReminders = async () => {
  console.log("Checking for daily work updates...");
  try {
    // 1. Find all projects that are "in-progress"
    const activeProjects = await PostProjectModel.find({
      status: "in-progress",
    }).populate("client");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const project of activeProjects) {
      // 2. Check if an update was submitted TODAY
      const hasUpdateToday = project.dailyWorkUpdates.some((update) => {
        const updateDate = new Date(update.date);
        updateDate.setHours(0, 0, 0, 0);
        return updateDate.getTime() === today.getTime();
      });

      if (!hasUpdateToday) {
        // 3. Find the hired freelancer for this project
        // We look in ProjectApplyModel for status 'hired'
        const hiredApplication = await ProjectApplyModel.findOne({
          project: project._id,
          status: "hired",
        }).populate("user");

        if (hiredApplication && hiredApplication.user) {
          const freelancer = hiredApplication.user;
            
            // 4. Send Reminder Email
            await sendWorkUpdateReminderEmail(freelancer, project);
            
            // 5. Send Notification (Message from Client)
            // We simulate a message from the client to the freelancer
            try {
                const message = new MessageModel({
                    sender: project.client._id,
                    receiver: freelancer._id,
                    content: `⚠️ System Reminder: Please submit your daily work update for "${project.title}".`,
                    system: true,
                    isRead: false
                });
                await message.save();
                console.log(`Notification sent to ${freelancer.username}`);
            } catch (msgError) {
                console.error("Failed to notifiy freelancer:", msgError);
            }
        }
      }
    }
  } catch (error) {
    console.error("Error in checkDailyWorkUpdatesAndSendReminders:", error);
  }
};
