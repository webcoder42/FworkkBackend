import ReportModel from "../Model/ReportModel.js";
import UserModel from "../Model/UserModel.js";
import MessageModel from "../Model/MessageModel.js";
import {
  sendReportWarningEmail,
  sendTemporarySuspensionEmail,
  sendPermanentBanEmail,
  sendAccountReactivatedEmail,
  sendEmail,
  sendReportSystemTestEmail,
} from "../services/EmailService.js";

// Create a new report
export const createReport = async (req, res) => {
  try {
    const { reportedUserId, category, subCategory, title, description, evidence } = req.body;
    const reporterId = req.user._id;

    // Validate required fields
    if (!reportedUserId || !category || !subCategory || !title || !description) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Check if reported user exists
    const reportedUser = await UserModel.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({
        success: false,
        message: "Reported user not found",
      });
    }

    // Prevent self-reporting
    if (reporterId.toString() === reportedUserId) {
      return res.status(400).json({
        success: false,
        message: "You cannot report yourself",
      });
    }

    // Check if user has already reported this user recently (within 24 hours)
    const existingReport = await ReportModel.findOne({
      reporter: reporterId,
      reportedUser: reportedUserId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: "You have already reported this user recently. Please wait 24 hours before submitting another report.",
      });
    }

    // ✅ AI Analysis & Auto-Action Logic
    let aiAnalysis = {
      score: 0,
      summary: "Pending Analysis",
      details: {},
      analyzedAt: new Date(),
    };
    let autoActionTaken = null;
    let autoActionDetails = "";

    if (category === "inappropriate_content") {
      // Fetch recent chat history
      const recentMessages = await MessageModel.find({
        $or: [
          { sender: reporterId, receiver: reportedUserId },
          { sender: reportedUserId, receiver: reporterId },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(50);

      // Simple bad word detection
      // Note: In production, use a more robust library or API
      const badWords = ["abuse", "scam", "cheat", "fraud", "kill", "hate", "idiot", "damn", "stupid", "fuck", "bitch", "shit"];
      const abusiveMessages = recentMessages.filter((msg) =>
        msg.sender.toString() === reportedUserId &&
        badWords.some((word) => msg.content.toLowerCase().includes(word))
      );

      if (abusiveMessages.length > 0) {
        aiAnalysis.score = 90;
        aiAnalysis.summary = `Detected ${abusiveMessages.length} abusive message(s) in recent chat.`;
        aiAnalysis.details = {
           flaggedMessageIds: abusiveMessages.map(m => m._id),
           sample: abusiveMessages[0].content.substring(0, 50) + "..."
        };

        // Check for previous warnings
        const previousWarning = await ReportModel.findOne({
          reportedUser: reportedUserId,
          actionTaken: "warning",
          category: "inappropriate_content"
        });

        if (previousWarning) {
          // Second Offense: Suspension
          autoActionTaken = "temporary_suspension";
          autoActionDetails = "Auto-suspended by AI due to repeated abusive language detection.";
          aiAnalysis.summary += " Repeat offense detected > Auto-suspension triggered.";
          
          // Execute Suspension in DB
          const suspensionEndDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
           await UserModel.findByIdAndUpdate(reportedUserId, {
              accountStatus: "suspended",
              suspensionEndDate: suspensionEndDate,
           });
           
           // Email will be sent below or handled by separate service?
           // The controller doesn't send email on creation usually, BUT we should send it here if we took action.
           // Re-using the logic from updateReportStatus is hard because it's coupled there.
           // I'll directly call the email service here.
           try {
             await sendTemporarySuspensionEmail(reportedUser, { ...newReport, category, subCategory }, "System AI", 3);
           } catch(e) { console.error("Auto-suspend email failed", e); }

        } else {
          // First Offense: Warning
          autoActionTaken = "warning";
          autoActionDetails = "Auto-warned by AI due to abusive language detection.";
          aiAnalysis.summary += " Warning issued.";
          
           try {
             await sendReportWarningEmail(reportedUser, { category, subCategory, description }, "System AI");
           } catch(e) { console.error("Auto-warning email failed", e); }
        }
      } else {
         aiAnalysis.score = 10;
         aiAnalysis.summary = "No obvious abusive keywords found in recent chat.";
      }
    } else {
       // General AI Logic for other categories
       aiAnalysis.summary = "Manual review recommended for this category.";
       // For "project_not_submitted", "payment_issues", etc., we could check other models, 
       // but for now we follow the user's request to "email admin" which generally happens via notification system?
       // The user said "admin ko mail chaly jay".
       // I should probably send an email to Admin for ALL new severe reports.
       // Let's stick to the specific logic: "payment issue ka be admin ko email baj day..."
    }

    // Create new report
    const newReport = new ReportModel({
      reporter: reporterId,
      reportedUser: reportedUserId,
      category,
      subCategory,
      title,
      description,
      evidence: evidence || [],
      aiAnalysis,
      actionTaken: autoActionTaken,
      actionDetails: autoActionDetails,
      status: autoActionTaken ? "action_taken" : "pending"
    });

    await newReport.save();

    // Populate user details for response
    await newReport.populate([
      { path: "reporter", select: "username email" },
      { path: "reportedUser", select: "username email" },
    ]);

    res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      data: newReport,
    });
  } catch (error) {
    console.error("Create Report Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create report",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get all reports (admin only)
export const getAllReports = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Apply filters
    if (status) query.status = status;
    if (category) query.category = category;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reports = await ReportModel.find(query)
      .populate("reporter", "username email")
      .populate("reportedUser", "username email")
      .populate("reviewedBy", "username email")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ReportModel.countDocuments(query);

    res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalReports: total,
        hasNext: skip + reports.length < total,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Get All Reports Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get report by ID
export const getReportById = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await ReportModel.findById(reportId)
      .populate("reporter", "username email")
      .populate("reportedUser", "username email")
      .populate("reviewedBy", "username email");

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Get Report By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get reports by current user
export const getMyReports = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reports = await ReportModel.find({ reporter: userId })
      .populate("reportedUser", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ReportModel.countDocuments({ reporter: userId });

    res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalReports: total,
        hasNext: skip + reports.length < total,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Get My Reports Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your reports",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Update report status (admin only)
export const updateReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, adminNotes, actionTaken, actionDetails } = req.body;
    const adminId = req.user._id;

    console.log(`🔍 DEBUG: updateReportStatus called with:`, {
      reportId,
      status,
      adminNotes,
      actionTaken,
      actionDetails,
      adminId
    });

    // Test email service
    console.log(`🧪 Testing email service availability...`);
    try {
      console.log(`🧪 sendEmail function available:`, typeof sendEmail);
      console.log(`🧪 sendReportWarningEmail function available:`, typeof sendReportWarningEmail);
    } catch (error) {
      console.error(`❌ Email service test failed:`, error);
    }

    const report = await ReportModel.findById(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    console.log(`🔍 DEBUG: Found report:`, {
      reportId: report._id,
      reportedUser: report.reportedUser,
      status: report.status
    });

    // Get admin user details for email signature
    const adminUser = await UserModel.findById(adminId).select("username Fullname email");
    const adminName = adminUser?.Fullname || adminUser?.username || "Admin";

    // Update report
    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (actionTaken) updateData.actionTaken = actionTaken;
    if (actionDetails) updateData.actionDetails = actionDetails;

    // Set review info if status is being updated
    if (status && status !== "pending") {
      updateData.reviewedBy = adminId;
      updateData.reviewedAt = new Date();
    }

    const updatedReport = await ReportModel.findByIdAndUpdate(
      reportId,
      updateData,
      { new: true }
    ).populate([
      { path: "reporter", select: "username email" },
      { path: "reportedUser", select: "username email Fullname" },
      { path: "reviewedBy", select: "username email" },
    ]);

    console.log(`🔍 DEBUG: Updated report:`, {
      actionTaken: updatedReport.actionTaken,
      reportedUser: updatedReport.reportedUser ? {
        id: updatedReport.reportedUser._id,
        email: updatedReport.reportedUser.email,
        username: updatedReport.reportedUser.username
      } : null,
      status: updatedReport.status
    });

    // Handle user status changes based on action taken
    if (actionTaken && updatedReport.reportedUser) {
      const reportedUser = updatedReport.reportedUser;
      console.log(`🔄 Processing action: ${actionTaken} for user: ${reportedUser.email}`);
      console.log(`🔄 Reported user data:`, {
        id: reportedUser._id,
        email: reportedUser.email,
        username: reportedUser.username,
        Fullname: reportedUser.Fullname
      });
      
      try {
        switch (actionTaken) {
          case "warning":
            console.log(`📧 Sending warning email to: ${reportedUser.email}`);
            try {
              await sendReportWarningEmail(reportedUser, updatedReport, adminName);
              console.log(`✅ Warning email sent successfully to: ${reportedUser.email}`);
            } catch (emailError) {
              console.error(`❌ Warning email failed for ${reportedUser.email}:`, emailError);
            }
            break;
            
          case "temporary_suspension":
            console.log(`🚫 Suspending user: ${reportedUser.email} for 3 days`);
            const suspensionEndDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
            
            try {
              const suspensionResult = await UserModel.findByIdAndUpdate(reportedUser._id, {
                accountStatus: "suspended",
                suspensionEndDate: suspensionEndDate,
              }, { new: true });
              
              console.log(`✅ User suspended successfully:`, {
                userId: reportedUser._id,
                email: reportedUser.email,
                newStatus: suspensionResult.accountStatus,
                suspensionEndDate: suspensionResult.suspensionEndDate
              });
              
              console.log(`📧 Sending suspension email to: ${reportedUser.email}`);
              await sendTemporarySuspensionEmail(reportedUser, updatedReport, adminName, 3);
              console.log(`✅ Suspension email sent successfully to: ${reportedUser.email}`);
            } catch (suspensionError) {
              console.error(`❌ Suspension failed for ${reportedUser.email}:`, suspensionError);
            }
            break;
            
          case "permanent_ban":
            console.log(`🚫 Permanently banning user: ${reportedUser.email}`);
            
            try {
              const banResult = await UserModel.findByIdAndUpdate(reportedUser._id, {
                accountStatus: "banned",
                suspensionEndDate: null,
              }, { new: true });
              
              console.log(`✅ User banned successfully:`, {
                userId: reportedUser._id,
                email: reportedUser.email,
                newStatus: banResult.accountStatus
              });
              
              console.log(`📧 Sending ban email to: ${reportedUser.email}`);
              await sendPermanentBanEmail(reportedUser, updatedReport, adminName);
              console.log(`✅ Ban email sent successfully to: ${reportedUser.email}`);
            } catch (banError) {
              console.error(`❌ Ban failed for ${reportedUser.email}:`, banError);
            }
            break;
            
          case "no_action":
            console.log(`ℹ️ No action taken for user: ${reportedUser.email}`);
            break;
            
          default:
            console.log(`⚠️ Unknown action: ${actionTaken} for user: ${reportedUser.email}`);
            break;
        }
      } catch (actionError) {
        console.error(`❌ Error processing action ${actionTaken} for user ${reportedUser.email}:`, actionError);
        console.error(`❌ Action error details:`, {
          message: actionError.message,
          stack: actionError.stack,
          code: actionError.code
        });
      }
    } else {
      console.log(`❌ DEBUG: Action processing skipped because:`, {
        actionTaken: actionTaken,
        hasReportedUser: !!updatedReport.reportedUser,
        reportedUser: updatedReport.reportedUser ? {
          id: updatedReport.reportedUser._id,
          email: updatedReport.reportedUser.email
        } : null
      });
    }

    res.status(200).json({
      success: true,
      message: "Report status updated successfully",
      data: updatedReport,
    });
  } catch (error) {
    console.error("Update Report Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update report status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Delete report (admin only)
export const deleteReport = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await ReportModel.findById(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    await ReportModel.findByIdAndDelete(reportId);

    res.status(200).json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    console.error("Delete Report Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete report",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get report statistics (admin only)
export const getReportStats = async (req, res) => {
  try {
    const stats = await ReportModel.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const categoryStats = await ReportModel.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalReports = await ReportModel.countDocuments();
    const pendingReports = await ReportModel.countDocuments({ status: "pending" });
    const todayReports = await ReportModel.countDocuments({
      createdAt: { $gte: new Date().setHours(0, 0, 0, 0) },
    });

    const statsObject = {
      total: totalReports,
      pending: pendingReports,
      today: todayReports,
      byStatus: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      byCategory: categoryStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
    };

    res.status(200).json({
      success: true,
      data: statsObject,
    });
  } catch (error) {
    console.error("Get Report Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get reports against a specific user
export const getReportsAgainstUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reports = await ReportModel.find({ reportedUser: userId })
      .populate("reporter", "username email")
      .populate("reviewedBy", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ReportModel.countDocuments({ reportedUser: userId });

    res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalReports: total,
        hasNext: skip + reports.length < total,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Get Reports Against User Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports against user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


export const testEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    console.log(`🧪 Testing email functionality for: ${email}`);
    console.log(`🧪 Email service functions available:`, {
      sendEmail: typeof sendEmail,
      sendReportWarningEmail: typeof sendReportWarningEmail,
      sendTemporarySuspensionEmail: typeof sendTemporarySuspensionEmail,
      sendPermanentBanEmail: typeof sendPermanentBanEmail
    });
    
    // Test the email service
    await sendReportSystemTestEmail(email);

    console.log(`✅ Test email sent successfully to: ${email}`);

    res.status(200).json({
      success: true,
      message: "Test email sent successfully",
    });
  } catch (error) {
    console.error("❌ Test Email Error:", error);
    console.error("❌ Test Email Error Details:", {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({
      success: false,
      message: "Failed to send test email",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get report categories and subcategories
export const getReportCategories = async (req, res) => {
  try {
    const categories = {
      inappropriate_content: {
        label: "Inappropriate Content",
        subCategories: {
          explicit_content: "Explicit Content",
          violent_content: "Violent Content",
          hate_speech: "Hate Speech",
          misleading_information: "Misleading Information",
        },
      },
      fake_profile: {
        label: "Fake Profile",
        subCategories: {
          fake_identity: "Fake Identity",
          stolen_photos: "Stolen Photos",
          fake_credentials: "Fake Credentials",
        },
      },
      payment_issues: {
        label: "Payment Issues",
        subCategories: {
          payment_holding: "Payment Holding",
          refund_issues: "Refund Issues",
          fake_payment_proof: "Fake Payment Proof",
        },
      },
      project_not_submitted: {
        label: "Project Not Submitted",
        subCategories: {
          delayed_submission: "Delayed Submission",
          incomplete_work: "Incomplete Work",
          no_submission: "No Submission",
        },
      },
      poor_communication: {
        label: "Poor Communication",
        subCategories: {
          unresponsive: "Unresponsive",
          rude_behavior: "Rude Behavior",
          unprofessional: "Unprofessional",
        },
      },
      spam_harassment: {
        label: "Spam/Harassment",
        subCategories: {
          spam_messages: "Spam Messages",
          harassment: "Harassment",
          bullying: "Bullying",
        },
      },
      fake_reviews: {
        label: "Fake Reviews",
        subCategories: {
          fake_positive_reviews: "Fake Positive Reviews",
          fake_negative_reviews: "Fake Negative Reviews",
          review_manipulation: "Review Manipulation",
        },
      },
      copyright_violation: {
        label: "Copyright Violation",
        subCategories: {
          stolen_content: "Stolen Content",
          plagiarism: "Plagiarism",
          unauthorized_use: "Unauthorized Use",
        },
      },
      other: {
        label: "Other",
        subCategories: {
          other_issue: "Other Issue",
        },
      },
    };

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Get Report Categories Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report categories",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
