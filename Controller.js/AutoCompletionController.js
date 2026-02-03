import { checkAndProcessSubmissions } from "../services/AutoCompletionService.js";
import SubmitProjectModel from "../Model/SubmitProjectModel.js";

export const triggerAutoCompletion = async (req, res) => {
  try {
    console.log("🔄 Manual trigger of auto-completion check...");
    await checkAndProcessSubmissions();
    
    res.status(200).json({
      success: true,
      message: "Auto-completion check completed successfully"
    });
  } catch (error) {
    console.error("❌ Error in manual auto-completion trigger:", error);
    res.status(500).json({
      success: false,
      message: "Error triggering auto-completion check",
      error: error.message
    });
  }
};

export const getPendingSubmissions = async (req, res) => {
  try {
    const pendingSubmissions = await SubmitProjectModel.find({
      status: "submitted"
    }).populate("project").populate("user");
    
    const submissionsWithDays = pendingSubmissions.map(submission => {
      const submissionDate = new Date(submission.submittedAt);
      const currentDate = new Date();
      const daysSinceSubmission = Math.floor((currentDate - submissionDate) / (1000 * 60 * 60 * 24));
      
      return {
        ...submission.toObject(),
        daysSinceSubmission,
        needsReminder: daysSinceSubmission >= 3 && daysSinceSubmission < 10,
        needsAutoComplete: daysSinceSubmission >= 10
      };
    });
    
    res.status(200).json({
      success: true,
      data: submissionsWithDays
    });
  } catch (error) {
    console.error("❌ Error fetching pending submissions:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching pending submissions",
      error: error.message
    });
  }
}; 
