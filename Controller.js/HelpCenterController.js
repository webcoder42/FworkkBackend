import HelpCenterModel from "../Model/HelpCenterModel.js";
import UserModel from "../Model/UserModel.js";
import sanitize from "mongo-sanitize";
import { uploadComplaintImage } from "../services/cloudinaryService.js";
import { sendComplaintConfirmationEmail, sendEmail } from "../services/EmailService.js";
import PayOutModel from "../Model/PayOutModel.js";

// Submit new complaint
export const submitComplaint = async (req, res) => {
  try {
    const userId = req.user.id;
    const issueType = sanitize(req.body.issueType);
    const description = sanitize(req.body.description);
    const image = req.body.image || null; // Accept base64 string

    // Validation
    if (!issueType || !description) {
      return res
        .status(400)
        .json({ message: "Issue type & description are required." });
    }

    // ✅ Check if user already submitted a complaint within last 30 days
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

    const existingComplaint = await HelpCenterModel.findOne({
      user: userId,
      createdAt: { $gte: oneMonthAgo },
    });

    if (existingComplaint) {
      return res.status(400).json({
        message:
          "You have already submitted a complaint within the last 30 days. Please wait before submitting another one.",
      });
    }

    // ✅ Process image if provided (Stream or Base64)
    let processedImage = null;
    let imageFileData = null;

    if (req.file) {
      imageFileData = {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      };
    } else if (image && image.startsWith('data:image/')) {
      imageFileData = {
        base64: image,
        name: `complaint-image-${userId}-${Date.now()}`,
        size: image.length,
        type: image.split(';')[0].split(':')[1]
      };
    }

    if (imageFileData) {
      try {
        const cloudinaryResult = await uploadComplaintImage(imageFileData);
        processedImage = cloudinaryResult.url;
      } catch (error) {
        console.error("Error uploading complaint image to Cloudinary:", error);
        return res.status(400).json({
          message: "Failed to upload image. Please try again."
        });
      }
    }

    // ✅ Fetch user
    const user = await UserModel.findById(userId);
    if (!user || !user.email) {
      return res.status(404).json({ message: "User email not found." });
    }

    // ✅ AI Analysis & Logic
    let aiAnalysis = {
      status: "Pending Review",
      notes: "System analysis initiated.",
      analyzedAt: new Date(),
    };
    let autoStatus = "pending";

    // 1. Handle Cashout Delay
    if (issueType === "Cashout Delay") {
      const paymentAccount = await PayOutModel.findOne({ user: userId });
      let hasDelayedWithdrawal = false;
      
      if (paymentAccount && paymentAccount.totalWithdrawals) {
        // Check for pending withdrawals older than 24 hours (1 day)
        const delayed = paymentAccount.totalWithdrawals.filter(
          (w) => w.status === "pending" && (new Date() - new Date(w.requestedAt)) > 24 * 60 * 60 * 1000
        );
        if (delayed.length > 0) {
          hasDelayedWithdrawal = true;
          aiAnalysis.status = "Verified Delay";
          aiAnalysis.notes = `Found ${delayed.length} delayed withdrawal(s) > 24hrs. Escalated to Admin & User notified.`;
          
          // Email Admin
          try {
             // Search for all admins
             const admins = await UserModel.find({ role: "admin" }); 
             for (const admin of admins) {
               await sendEmail({
                 to: admin.email,
                 subject: `🔥 URGENT: Cashout Delay Detected for User ${user?.username}`,
                 text: `User ${user?.username} reported a cashout delay. System verified ${delayed.length} pending withdrawals older than 24 hours. Please resolve immediately.`,
                 html: `<p>User <strong>${user?.username}</strong> (${user?.email}) reported a cashout delay.</p>
                        <p>System verified <strong>${delayed.length}</strong> pending withdrawals older than 24 hours.</p>
                        <p><a href="${process.env.API_FRONTENT_URL}/admin/cashout-management" style="padding: 10px 20px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px;">Go to Cashout Management</a></p>`
               });
             }
          } catch(err) {
            console.error("Failed to send admin alert:", err);
          }

          // Email User (Apology)
          try {
            await sendEmail({
              to: user.email,
              subject: "Update on your Cashout Delay Report",
              text: `Dear ${user.username}, We apologize for the delay in your withdrawal. Our system has verified your request is pending longer than expected. We have notified our administrators to process it immediately. Thank you for your patience.`,
              html: `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                      <h2 style="color: #3b82f6;">We are on it!</h2>
                      <p>Dear <strong>${user.username}</strong>,</p>
                      <p>We sincerely apologize for the delay in your withdrawal processing.</p>
                      <p>Our AI system has verified that your request has been pending for more than 24 hours. We have immediately escalated this to our financial team.</p>
                      <p>They have been notified to prioritize your request. You should receive an update very soon.</p>
                      <p>Thank you for your patience.</p>
                      <p>Best Regards,<br/>Fworkk Support Team</p>
                     </div>`
            });
          } catch (err) {
             console.error("Failed to send user apology email:", err);
          }

        } else {
          aiAnalysis.status = "No Delay Found";
          aiAnalysis.notes = "System checked but found no withdrawals pending > 24 hours.";
        }
      } else {
        aiAnalysis.status = "No Account Found";
        aiAnalysis.notes = "No payment account found for user.";
      }
    } 
    // 2. Handle Auto-Response Types
    else if (["Technical", "Account", "Post Project Issue", "Feature Request", "Other"].includes(issueType)) {
       aiAnalysis.status = "Auto-Response Sent";
       autoStatus = "resolved"; // User said "khud khudi handle karo" so resolving it? Or just 'in progress'? resolved seems fitting for auto-replies unless human intervention needed.
       let replyMessage = "";

       switch(issueType) {
         case "Account":
           replyMessage = "We received your account issue. If this is regarding verification, please check your spam folder or click 'Resend Verification' in settings. If you need further help, reply to this email.";
           break;
         case "Feature Request":
           replyMessage = "Thanks for your suggestion! We've logged this feature request for our product team.";
           break;
         default:
           replyMessage = `We have received your report regarding '${issueType}'. Our system has logged it and we will look into it shortly.`;
       }
       
       aiAnalysis.notes = `Auto-response sent for ${issueType}.`;
       
       // Send the specific auto-response instead of generic one if possible, 
       // but for now we rely on the generic 'sendComplaintConfirmationEmail' below 
       // OR we can send a custom one here and skip the generic one below. 
       // The generic one sends "Complaint submitted". 
       // The user request implies the AI handles it -> sends email with solution.
       
       try {
          await sendEmail({
            to: user.email,
            subject: `Update on your ${issueType} Report`,
            text: replyMessage,
            html: `<p>${replyMessage}</p>`
          });
       } catch (err) {
         console.error("Failed to send auto-response:", err);
       }
    }
    // 3. Fake Client / Client Not Responding
    else if (["Fake Client", "Client Not Responding"].includes(issueType)) {
       aiAnalysis.status = "Advice Sent";
       autoStatus = "resolved";
       const advice = "Please submit a formal report against this user via the Report profile feature so our trust and safety team can investigate specific evidence.";
       aiAnalysis.notes = "Advised user to use Report feature.";
       
        try {
          await sendEmail({
            to: user.email,
            subject: `Regarding your ${issueType} Report`,
            text: advice,
            html: `<p>${advice}</p>`
          });
       } catch (err) {
          console.error("Error sending advice email:", err);
       }
    }


    // ✅ Create complaint
    const newComplaint = await HelpCenterModel.create({
      user: userId,
      issueType,
      description,
      image: processedImage, // Store Cloudinary URL
      aiAnalysis: aiAnalysis,
      status: autoStatus
    });



    // ✅ Send Email
    await sendComplaintConfirmationEmail(user, newComplaint.ticketNumber, newComplaint.issueType);

    return res.status(201).json({
      message: "Complaint submitted successfully. Email sent.",
      ticket: newComplaint,
    });
  } catch (error) {
    console.error("Submit Complaint Error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// Add this to your HelpCenterController.js

// Get user's complaints
export const getUserComplaints = async (req, res) => {
  try {
    const userId = req.user.id;

    const complaints = await HelpCenterModel.find({ user: userId }).sort({
      createdAt: -1,
    }); // Newest first

    return res.status(200).json({ complaints });
  } catch (error) {
    console.error("Get Complaints Error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};
// Get all complaints for admin
export const getAllComplaints = async (req, res) => {
  try {
    // Get all complaints with user details
    const complaints = await HelpCenterModel.find()
      .populate("user", "username email") // populate user info
      .sort({ createdAt: -1 }); // newest first

    // Count pending complaints
    const pendingCount = await HelpCenterModel.countDocuments({
      status: "pending",
    });

    return res.status(200).json({
      total: complaints.length,
      pending: pendingCount,
      complaints,
    });
  } catch (error) {
    console.error("Admin Get All Complaints Error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// Update complaint status by Admin
export const updateComplaintStatus = async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!["pending", "in progress", "resolved", "closed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status provided." });
    }

    // Find and update complaint
    const updatedComplaint = await HelpCenterModel.findByIdAndUpdate(
      complaintId,
      { status },
      { new: true }
    ).populate("user", "username email");

    if (!updatedComplaint) {
      return res.status(404).json({ message: "Complaint not found." });
    }

    return res.status(200).json({
      message: "Complaint status updated successfully.",
      complaint: updatedComplaint,
    });
  } catch (error) {
    console.error("Update Complaint Status Error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};
