import PostProjectModel from "../Model/PostProjectModel.js";
import ProjectApplyModel from "../Model/ProjectApplyModel.js";
import SubmitProjectModel from "../Model/SubmitProjectModel.js";
import FworkkPrimeModel from "../Model/FworkkPrimeModel.js";
import { sendDeadlineReminderEmail } from "./EmailService.js";

/**
 * Checks for projects that are due tomorrow and sends a reminder email to freelancers
 * who have not yet submitted their work.
 */
export const checkProjectDeadlinesAndSendReminders = async () => {
    try {
        console.log("🔔 Running Project Deadline Reminder Check...");
        
        // Calculate the range for "tomorrow"
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const dayAfterTomorrow = new Date(tomorrow);
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

        console.log(`Checking deadlines between ${tomorrow.toISOString()} and ${dayAfterTomorrow.toISOString()}`);

        // 1. Standard Projects (PostProjectModel)
        const projects = await PostProjectModel.find({
            status: "in-progress",
            deadline: {
                $gte: tomorrow,
                $lt: dayAfterTomorrow
            }
        });

        console.log(`Found ${projects.length} standard projects due tomorrow.`);

        for (const project of projects) {
            // Find who is hired for this project
            const hiredApplication = await ProjectApplyModel.findOne({
                project: project._id,
                status: "hired"
            }).populate("user");

            if (hiredApplication && hiredApplication.user) {
                const freelancer = hiredApplication.user;

                // Check if they have already submitted work
                const submission = await SubmitProjectModel.findOne({
                    project: project._id,
                    user: freelancer._id
                });

                if (!submission) {
                    console.log(`Sending reminder to ${freelancer.email} for project: ${project.title}`);
                    await sendDeadlineReminderEmail(freelancer, project);
                } else {
                    console.log(`Freelancer ${freelancer.email} has already submitted work for project: ${project.title}`);
                }
            }
        }

        // 2. Fworkk Prime Projects (FworkkPrimeModel)
        const primeProjects = await FworkkPrimeModel.find({
            status: "Worked Started",
            "timeline.endDate": {
                $gte: tomorrow,
                $lt: dayAfterTomorrow
            }
        }).populate("selectedFreelancers.freelancerId");

        console.log(`Found ${primeProjects.length} Fworkk Prime projects due tomorrow.`);

        for (const project of primeProjects) {
            for (const member of project.selectedFreelancers) {
                if (member.status === 'Accepted' && member.freelancerId) {
                    const freelancer = member.freelancerId;
                    
                    // Check if all tasks for this freelancer are submitted or approved
                    // or if the freelancer has any tasks at all. 
                    // Prime projects are more complex, but a general reminder for the whole project deadline is helpful.
                    
                    // User said: "ager os nay koi work submitted ni kai"
                    // In Prime, we look at the tasks status.
                    const hasTasks = member.tasks && member.tasks.length > 0;
                    const allSubmitted = hasTasks && member.tasks.every(task => 
                        ['Submitted', 'Approved'].includes(task.status)
                    );

                    if (!hasTasks || !allSubmitted) {
                        // Re-use the deadline reminder or send a prime-specific one?
                        // Let's adapt the project object for the email helper
                        const projectAdapter = {
                            title: project.title,
                            deadline: project.timeline.endDate
                        };
                        console.log(`Sending reminder to ${freelancer.email} for Prime project: ${project.title}`);
                        await sendDeadlineReminderEmail(freelancer, projectAdapter);
                    }
                }
            }
        }

        console.log("✅ Project Deadline Reminder Check Completed.");
    } catch (error) {
        console.error("❌ Error in checkProjectDeadlinesAndSendReminders:", error);
    }
};
