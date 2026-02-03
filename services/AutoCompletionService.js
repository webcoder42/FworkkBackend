import SubmitProjectModel from "../Model/SubmitProjectModel.js";
import PostProjectModel from "../Model/PostProjectModel.js";
import UserModel from "../Model/UserModel.js";
import { sendEmail } from "./EmailService.js";
import dotenv from "dotenv";

dotenv.config();



const checkAndProcessSubmissions = async () => {
  try {
    const currentDate = new Date();

    const pendingSubmissions = await SubmitProjectModel.find({
      status: "submitted",
    })
      .populate("project")
      .populate("user");

    for (const submission of pendingSubmissions) {
      const submissionDate = new Date(submission.submittedAt);
      const daysSinceSubmission = Math.floor(
        (currentDate - submissionDate) / (1000 * 60 * 60 * 24)
      );

      const project = submission.project;
      const freelancer = submission.user;

      if (!project || !freelancer) continue;

      const projectOwner = await UserModel.findById(project.client);
      if (!projectOwner) continue;

      // 5 Days -> 1st Reminder
      if (daysSinceSubmission >= 5 && daysSinceSubmission < 10 && !submission.reminder1Sent) {
        await sendReminderEmail(projectOwner, freelancer, project, submission, 1);
        submission.reminder1Sent = true;
        await submission.save();
      } 
      // 10 Days -> 2nd Reminder
      else if (daysSinceSubmission >= 10 && daysSinceSubmission < 13 && !submission.reminder2Sent) {
        await sendReminderEmail(projectOwner, freelancer, project, submission, 2);
        submission.reminder2Sent = true;
        await submission.save();
      } 
      // 13 Days -> Auto Complete
      else if (daysSinceSubmission >= 13) {
        await autoCompleteProject(
          submission,
          project,
          freelancer,
          projectOwner
        );
      }
    }
  } catch (error) {
    // (console removed)
  }
};

const sendReminderEmail = async (
  projectOwner,
  freelancer,
  project,
  submission,
  reminderNumber
) => {
  const reminderHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">🔔 Project Review Reminder #${reminderNumber}</h2>
      <p>Hello ${projectOwner.Fullname},</p>
      <p>This is a ${reminderNumber === 1 ? 'friendly' : 'final'} reminder that you have a pending project submission that requires your attention.</p>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Project Details:</h3>
        <p><strong>Project Title:</strong> ${project.title}</p>
        <p><strong>Freelancer:</strong> ${freelancer.Fullname}</p>
        <p><strong>Submitted On:</strong> ${new Date(
          submission.submittedAt
        ).toLocaleString()}</p>
        <p><strong>Days Since Submission:</strong> ${Math.floor(
          (new Date() - new Date(submission.submittedAt)) /
            (1000 * 60 * 60 * 24)
        )} days</p>
      </div>
      
      <p>Please review the submitted work and provide feedback. If no response is received within 13 days of submission, the project will be automatically completed.</p>
      
      <p>You can review the submission by logging into your Fworkk account.</p>
      
      <p>Best regards,<br/><strong>Fworkk Freelancing Team</strong></p>
    </div>
  `;

  await sendEmail(
    projectOwner.email,
    `Reminder #${reminderNumber}: Review Pending for Project "${project.title}"`,
    reminderHtml
  );
};

const autoCompleteProject = async (
  submission,
  project,
  freelancer,
  projectOwner
) => {
  try {
    const session = await SubmitProjectModel.startSession();
    session.startTransaction();

    try {
      submission.status = "approved";
      submission.review = {
        rating: 5,
        comment:
          "Project automatically completed due to no response from client within 13 days.",
        experience: "positive",
        createdAt: new Date(),
      };
      await submission.save({ session });

      project.status = "completed";
      await project.save({ session });

      const submittingUser = await UserModel.findById(freelancer._id).session(
        session
      );
      if (submittingUser) {
        const newRating =
          (submittingUser.rating * submittingUser.completedProjects + 5) /
          (submittingUser.completedProjects + 1);
        submittingUser.rating = parseFloat(newRating.toFixed(2));
        submittingUser.completedProjects += 1;

        if (project.budget) {
          submittingUser.totalEarnings += project.budget;

          // Add earning log for auto-completed project
          submittingUser.EarningLogs = submittingUser.EarningLogs || [];
          submittingUser.EarningLogs.push({
            amount: project.budget,
            date: new Date(),
          });
        }

        await submittingUser.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      const autoCompletionHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #28a745;">✅ Project Automatically Completed</h2>
          <p>Hello ${freelancer.Fullname},</p>
          <p>Your project <strong>"${
            project.title
          }"</strong> has been automatically completed due to no response from the client within 13 days.</p>
          
          <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #155724;">Project Details:</h3>
            <p><strong>Project Title:</strong> ${project.title}</p>
            <p><strong>Budget:</strong> $${project.budget}</p>
            <p><strong>Status:</strong> Automatically Approved</p>
            <p><strong>Rating:</strong> 5/5 (Auto-assigned)</p>
            <p><strong>Completion Date:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <p>Your earnings have been added to your account. This automatic completion ensures fair treatment for freelancers when clients are unresponsive.</p>
          
          <p>Keep up the great work!<br/><strong>Fworkk Freelancing Team</strong></p>
        </div>
      `;

      await sendEmail(
        freelancer.email,
        `Project Automatically Completed: ${project.title}`,
        autoCompletionHtml
      );

      const clientNotificationHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc3545;">⚠️ Project Auto-Completed</h2>
          <p>Hello ${projectOwner.Fullname},</p>
          <p>Your project <strong>"${
            project.title
          }"</strong> has been automatically completed due to no response from you within 13 days.</p>
          
          <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #721c24;">Project Details:</h3>
            <p><strong>Project Title:</strong> ${project.title}</p>
            <p><strong>Freelancer:</strong> ${freelancer.Fullname}</p>
            <p><strong>Budget:</strong> $${project.budget}</p>
            <p><strong>Status:</strong> Automatically Completed</p>
            <p><strong>Completion Date:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <p>To avoid automatic completions in the future, please respond to project submissions within 13 days.</p>
          
          <p>Best regards,<br/><strong>Fworkk Freelancing Team</strong></p>
        </div>
      `;

      await sendEmail(
        projectOwner.email,
        `Project Auto-Completed: ${project.title}`,
        clientNotificationHtml
      );

      // (console removed)
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    // (console removed)
  }
};

export { checkAndProcessSubmissions, sendReminderEmail, autoCompleteProject };
