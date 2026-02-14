import nodemailer from "nodemailer";
import dotenv from "dotenv";
import dns from "dns";
import { Resend } from "resend";
import axios from "axios";

dotenv.config();

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// MailerSend Configuration
const MAILERSEND_API_KEY = process.env.MAILERSENDER_API_KEY;
const MAILERSEND_ENDPOINT = "https://api.mailersend.com/v1/email";

// Zoho Configuration
const zohoConfig = {
  host: process.env.EMAIL_HOST || "smtp.zoho.com",
  port: parseInt(process.env.EMAIL_PORT) || 465,
  secure: process.env.EMAIL_SECURE !== undefined ? process.env.EMAIL_SECURE === 'true' : true,
  auth: {
    user: (process.env.ZOHO_USER || "bizy@bioopay.online").trim(),
    pass: (process.env.EMAIL_PASS || "uH2qKmMWHX8L").trim(),
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 15000, // Increased to 15 seconds
  greetingTimeout: 15000, 
  socketTimeout: 15000
};

// Gmail Configuration
const gmailConfig = {
  service: 'gmail',
  auth: {
    user: (process.env.GMAIL_USER || "bizy83724@gmail.com").trim(),
    pass: (process.env.GMAIL_PASS || "ddrd kpnn ptjb zxnt").trim(),
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000
};

const zohoTransporter = nodemailer.createTransport(zohoConfig);
const gmailTransporter = nodemailer.createTransport(gmailConfig);

// Verify connections
// Utility to remove emojis
const removeEmojis = (str) => {
  if (!str) return "";
  return str.replace(/[\u1000-\uFFFF]|[^\x00-\x7F]/g, "").trim();
};

// Premium Email Template
const getEmailTemplate = (content, previewText = "Notification from Fworkk") => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fworkk Notification</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f9fafb; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #f9fafb; padding-bottom: 40px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 20px; text-align: center; }
    .logo-container { margin-bottom: 10px; }
    .logo-text { color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; text-transform: uppercase; }

    .content { padding: 40px 30px; background-color: #ffffff; }
    .footer { padding: 30px; text-align: center; color: #6b7280; font-size: 13px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; }
    h1, h2, h3 { color: #111827; margin-top: 0; }
    p { margin-bottom: 20px; color: #4b5563; }
    .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 20px 0; }
    .highlight { color: #2563eb; font-weight: 600; }
    .preview { display: none; max-height: 0px; overflow: hidden; }
  </style>
</head>
<body>
  <div class="preview">${previewText}</div>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-container">
          <span class="logo-text">Fworkk</span>
        </div>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Fworkk Freelancing Platform. All rights reserved.</p>
        <p>123 Freelance Way, Digital Workspace | <a href="https://fworkk.com" style="color: #2563eb; text-decoration: none;">Visit Website</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

// Verify connections asynchronously to avoid blocking startup
const verifyTransporters = async () => {
  try {
    // Only verify in production or if explicitly requested
    if (process.env.SKIP_EMAIL_VERIFY === 'true') return;

    console.log("📡 Verifying email transporters...");
    
    zohoTransporter.verify((error) => {
      if (error) {
        console.warn("⚠️ Zoho Transporter (bizy@bioopay.online) connection issues:", error.message);
        console.info("💡 Tip: This might be due to Render's network restrictions on port 465. Email will fallback to Gmail or Resend.");
      } else {
        console.log("✅ Zoho Transporter Ready (bizy@bioopay.online)");
      }
    });

    gmailTransporter.verify((error) => {
      if (error) {
        console.warn("⚠️ Gmail Transporter connection issues:", error.message);
        console.info("💡 Tip: Common issue on Render/Vercel. Apps may need 'App Passwords' or use dedicated APIs like Resend.");
      } else {
        console.log("✅ Gmail Transporter Ready (bizy83724@gmail.com)");
      }
    });
  } catch (err) {
    console.error("❌ Email verification error:", err.message);
  }
};

// Start verification after a short delay
setTimeout(verifyTransporters, 5000);

export const sendEmail = async (to, subject, html, text = "", options = {}) => {
  const fromName = process.env.FROM_NAME || "Fworkk Freelancing";
  const replyTo = options.replyTo || process.env.EMAIL_USER || "support@betpro2u.online";
  
  // Clean subject and content of emojis
  const cleanSubject = removeEmojis(subject);
  const cleanHtml = html; // Assume html passed is already clean or will be handled by template
  const plainText = text || html.replace(/<[^>]*>?/gm, '');

  const headers = {
    "X-Auto-Response-Suppress": "All",
    "X-Mailer": "Fworkk-SafeMailer-v2",
    "X-Entity-Ref-ID": Buffer.from(Date.now().toString()).toString('base64'),
    "X-Priority": options.priority === 'high' ? '1 (Highest)' : '3 (Normal)',
    "X-MSMail-Priority": options.priority === 'high' ? 'High' : 'Normal',
    "Importance": options.importance || "normal",
    "Feedback-ID": `fworkk-platform:${to.split('@')[0]}:transactional`,
    ...options.headers
  };

  const mailOptions = {
    to,
    subject: cleanSubject,
    html: removeEmojis(cleanHtml), // Also clean emojis from HTML content as requested
    text: removeEmojis(plainText),
    replyTo: options.replyTo || process.env.ZOHO_USER || replyTo,
    headers: headers
  };

  // 1. TRY ZOHO SMTP (Primary)
  try {
    console.log(`📡 [ZOHO] Attempting send to ${to}...`);
    const info = await zohoTransporter.sendMail({
      ...mailOptions,
      from: `"${fromName}" <${process.env.ZOHO_USER || "bizy@bioopay.online"}>`, 
    });
    console.log(`✅ [ZOHO] Success: ${info.messageId} | Provider: Zoho`);
    return { success: true, provider: 'zoho' };

  } catch (zohoErr) {
    console.error(`❌ [ZOHO] Failed: ${zohoErr.message}`);

    // 2. TRY GMAIL SMTP (Fallback 1)
    try {
      console.log(`📡 [GMAIL] Attempting fallback to ${to}...`);
      const info = await gmailTransporter.sendMail({
        ...mailOptions,
        from: `"${fromName}" <${process.env.GMAIL_USER || "bizy83724@gmail.com"}>`,
      });
      console.log(`✅ [GMAIL] Success: ${info.messageId}`);
      return { success: true, provider: 'gmail' };
    } catch (gmailErr) {
      console.error(`❌ [GMAIL] Failed: ${gmailErr.message}`);

      // 3. TRY RESEND API (Fallback 2)
      if (resend) {
        try {
          console.log(`📡 [RESEND] Attempting final fallback to ${to}...`);
          const resendResult = await resend.emails.send({
            from: `"${fromName}" <${process.env.EMAIL_NOREPLY || "noreply@betpro2u.online"}>`,
            to,
            subject: cleanSubject,
            html: cleanHtml,
            text: plainText,
            reply_to: replyTo,
            headers: headers // Fixed: used headers instead of undefined spamHeaders
          });

          if (resendResult.error) throw new Error(resendResult.error.message);
          console.log(`✅ [RESEND] Success: ${resendResult.data?.id}`);
          return { success: true, provider: 'resend' };
        } catch (resendErr) {
          console.error(`❌ [RESEND] Failed: ${resendErr.message}`);
          throw new Error("All provider attempts failed.");
        }
      }
      throw new Error("No providers worked.");
    }
  }
};


export const sendProfileWarningEmail = async (userEmail, userName, warningCount) => {
  const subject = "Warning: Inappropriate Content in Profile - Fworkk";
  const content = `
    <h2 style="color: #ef4444;">Profile Content Policy Warning</h2>
    <p>Dear <b>${userName}</b>,</p>
    <p>We detected inappropriate content in your recent profile update on <strong class="highlight">Fworkk</strong>.</p>
    
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0;"><b>Warning Count: ${warningCount}/2</b></p>
      <p style="color: #b91c1c; font-weight: 700; margin-top: 10px;">
        ${
          warningCount === 1
            ? "This is your FIRST warning. Please maintain professional language in your profile."
            : "This is your FINAL warning. Next violation will result in account suspension!"
        }
      </p>
    </div>

    <h3 style="font-size: 18px; margin-top: 30px;">Professional Profile Guidelines:</h3>
    <ul style="color: #4b5563;">
      <li>Use appropriate language in your name, bio, and portfolio descriptions</li>
      <li>Maintain professional communication standards</li>
      <li>Avoid offensive or inappropriate content</li>
      <li>Present yourself professionally to potential clients</li>
    </ul>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Standard Content Warning");

  try {
    await sendEmail(userEmail, subject, html);
    console.log(`✅ Profile warning email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Profile warning email sending failed:", error);
    throw error;
  }
};

export const sendProfileSuspensionEmail = async (userEmail, userName) => {
  const subject = "Account Suspended - Fworkk";
  const content = `
    <h2 style="color: #ef4444;">Account Suspended</h2>
    <p>Dear <b>${userName}</b>,</p>
    <p>Your <strong class="highlight">Fworkk</strong> account has been <b style="color: #ef4444;">SUSPENDED</b> due to repeated inappropriate content violations in your profile.</p>
    
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0;"><b>Reason:</b> Multiple inappropriate content violations in profile</p>
      <p style="margin-top: 10px;"><b>Status:</b> Account access temporarily restricted</p>
    </div>
    
    <h3 style="font-size: 18px;">What happens now:</h3>
    <ul style="color: #4b5563;">
      <li>Your profile access is temporarily suspended</li>
      <li>You cannot update your profile or apply to projects</li>
      <li>Contact support for account review</li>
    </ul>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">Fworkk Support Team</p>
  `;

  const html = getEmailTemplate(content, "Account Suspension Notice");

  try {
    await sendEmail(userEmail, subject, html);
    console.log(`✅ Profile suspension email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Profile suspension email sending failed:", error);
    throw error;
  }
};

export const sendComplaintConfirmationEmail = async (user, ticketNumber, issueType) => {
  const subject = `Your Complaint has been Received - Ticket ${ticketNumber}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h3 style="color: #333;">Dear ${user.username || "User"},</h3>
        <p>Thank you for contacting our support.</p>
        <p>Your complaint has been received and assigned Ticket Number: <strong>${ticketNumber}</strong></p>
        <p><strong>Issue Type:</strong> ${issueType}</p>
        <p>We will review your complaint and respond to you as soon as possible.</p>
        <br/>
        <p>Best Regards,<br/><strong>Support Team</strong></p>
      </div>
    </div>
  `;

  try {
    await sendEmail(user.email, subject, html);
    console.log(`✅ Complaint confirmation email sent to ${user.email}`);
  } catch (error) {
    console.error("❌ Complaint email sending failed:", error);
    throw error;
  }
};

export const sendProjectSubmissionEmailToOwner = async (project, submitter, submissionType, linksSection, description) => {
  const subject = `New Submission for Project: ${project.title}`;
  const content = `
    <h2 style="color: #10b981;">New Project Submission</h2>
    <p>Hello,</p>
    <p>You have received a new submission for your project <strong class="highlight">${project.title}</strong>.</p>
    <div style="background-color: #f0fdf4; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #10b981;">
      <p style="margin-bottom: 8px;"><b>Submitted by:</b> ${submitter.Fullname || submitter.username} (${submitter.email})</p>
      ${linksSection}
      <p style="margin-top: 10px;"><b>Description:</b> ${description}</p>
    </div>
    <p>Please review the submission at your earliest convenience.</p>
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">Fworkk Project Team</p>
  `;

  const html = getEmailTemplate(content, "Project Submission Received");

  try {
    const targetEmail = project.client?.email || project.clientEmail;
    if (!targetEmail) throw new Error("Client email not found for project");
    await sendEmail(targetEmail, subject, html);
    console.log(`✅ Project submission email sent to owner ${targetEmail}`);
  } catch (error) {
    console.error("❌ Project submission email to owner failed:", error);
    throw error;
  }
};

export const sendProjectSubmissionEmailToFreelancer = async (project, submitter, githubLink, liveSiteUrl, description) => {
  const subject = `Submission Confirmation: ${project.title}`;
  const content = `
    <h2 style="color: #10b981;">Project Submission Received</h2>
    <p>Hello ${submitter.Fullname || submitter.username || "Freelancer"},</p>
    <p>Your submission for project <strong class="highlight">${project.title}</strong> has been successfully received.</p>
    <div style="background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="font-size: 18px; margin-top: 0;">Submission Details:</h3>
      <ul style="color: #4b5563;">
        ${githubLink ? `<li><b>GitHub Link:</b> <a href="${githubLink}" style="color: #2563eb;">${githubLink}</a></li>` : ""}
        ${liveSiteUrl ? `<li><b>Live Site URL:</b> <a href="${liveSiteUrl}" style="color: #2563eb;">${liveSiteUrl}</a></li>` : ""}
        <li><b>Description:</b> ${description}</li>
        <li><b>Submitted At:</b> ${new Date().toLocaleString()}</li>
      </ul>
    </div>
    <p>The project owner has been notified and will review your submission shortly.</p>
    <p>Thank you for your work!<br/><strong>The Fworkk Team</strong></p>
  `;

  const html = getEmailTemplate(content, "Submission Confirmation");

  try {
    await sendEmail(submitter.email, subject, html);
    console.log(`✅ Project submission email sent to freelancer ${submitter.email}`);
  } catch (error) {
    console.error("❌ Project submission email to freelancer failed:", error);
    throw error;
  }
};

export const sendSubmissionRejectionEmail = async (user, project) => {
  const subject = "Project Submission Rejected";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #dc3545;">Project Submission Rejected</h2>
        <p>Hi ${user.Fullname || user.username || "Freelancer"},</p>
        <p>Unfortunately, your submission for <strong>${project.title}</strong> has been <b>rejected</b>.</p>
        <p>Please review the requirements and try again.</p>
        <p>Thanks,<br/><strong>Project Platform Team</strong></p>
      </div>
    </div>
  `;

  try {
    await sendEmail(user.email, subject, html);
    console.log(`✅ Rejection email sent to ${user.email}`);
  } catch (error) {
    console.error("❌ Rejection email failed:", error);
    throw error;
  }
};

export const sendSubmissionApprovalEmail = async (user, project, budget, rating, comment, experience) => {
  const subject = "Project Approved & Payment Received";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #28a745;">🎉 Congratulations! Your Project is Approved</h2>
        <p>Hi ${user.Fullname || user.username || "Freelancer"},</p>
        <p>Your submission for <strong>${project.title}</strong> has been <b>approved</b>.</p>
        <p><strong>Project ID:</strong> ${project._id}</p>
        <p><strong>Budget:</strong> $${budget}</p>
        <p><strong>Your Rating:</strong> ${rating}/5</p>
        <p><strong>Review:</strong> ${comment || "No additional comments"}</p>
        <p><strong>Experience:</strong> ${experience}</p>
        <p>Your earnings have been added to your account.</p>
        <p>Keep up the great work!<br/><strong>Fworkk Team</strong></p>
      </div>
    </div>
  `;

  try {
    await sendEmail(user.email, subject, html);
    console.log(`✅ Approval email sent to ${user.email}`);
  } catch (error) {
    console.error("❌ Approval email failed:", error);
    throw error;
  }
};

export const sendContentWarningEmail = async (userEmail, userName, warningCount, reason = "application/project post") => {
  const subject = "Warning: Inappropriate Content Detected - Fworkk";
  const content = `
    <h2 style="color: #ef4444;">Content Policy Warning</h2>
    <p>Dear <b>${userName}</b>,</p>
    <p>We detected inappropriate content in your recent <strong class="highlight">${reason}</strong>.</p>
    
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0;"><b>Warning Count: ${warningCount}/2</b></p>
      <p style="color: #b91c1c; font-weight: 700; margin-top: 10px;">
        ${
          warningCount === 1
            ? "This is your FIRST warning. Please avoid using inappropriate language."
            : "This is your FINAL warning. Next violation will result in account suspension!"
        }
      </p>
    </div>

    <h3 style="font-size: 18px;">Fworkk Content Policy:</h3>
    <ul style="color: #4b5563;">
      <li>No inappropriate, offensive, or abusive language</li>
      <li>Professional communication only</li>
      <li>Respectful interaction with all users</li>
    </ul>

    <p style="color: #b91c1c; font-weight: 700; margin-top: 25px;">
      Action Required: Please review and follow our community guidelines to avoid account suspension.
    </p>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Content Violation Warning");

  try {
    await sendEmail(userEmail, subject, html);
    console.log(`✅ Content warning email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Content warning email failed:", error);
    throw error;
  }
};

export const sendAccountSuspensionEmail = async (userEmail, userName, reason = "repeated violations of our content policy") => {
  const subject = "Account Suspended - Fworkk";
  const content = `
    <h2 style="color: #ef4444;">Account Suspended</h2>
    <p>Dear <b>${userName}</b>,</p>
    <p>Your Fworkk account has been <b style="color: #ef4444;">SUSPENDED</b> due to <strong class="highlight">${reason}</strong>.</p>
    
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0;"><b>Reason:</b> ${reason}</p>
      <p style="margin-top: 10px;"><b>Status:</b> Account access temporarily restricted</p>
    </div>

    <h3 style="font-size: 18px;">What happens now:</h3>
    <ul style="color: #4b5563;">
      <li>Your account access is temporarily suspended</li>
      <li>You cannot apply to projects or post new projects</li>
      <li>Contact support for account review</li>
    </ul>

    <p style="margin-top: 20px;">To restore your account, please contact our support team and acknowledge that you will follow our community guidelines.</p>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">Fworkk Support Team</p>
  `;

  const html = getEmailTemplate(content, "Suspension Notice");

  try {
    await sendEmail(userEmail, subject, html);
    console.log(`✅ Account suspension email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Account suspension email failed:", error);
    throw error;
  }
};

export const sendProjectApplicationEmail = async (projectOwner, applicant, project, projectLink) => {
  const subject = `New Application for Project: ${project.title}`;
  const content = `
    <h2 style="color: #2563eb; text-align: center;">New Project Application!</h2>
    <p>Hello <strong>${projectOwner.Fullname || projectOwner.username}</strong>,</p>
    <p>You have received a new application for your project:</p>
    
    <div style="background-color: #eff6ff; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #bfdbfe;">
      <h3 style="color: #1e40af; margin-top: 0; font-size: 18px;">Project: ${project.title}</h3>
      <p style="margin-bottom: 8px;"><b>Applicant:</b> ${applicant.Fullname || applicant.username}</p>
      <p style="margin-bottom: 0;"><b>Applied At:</b> ${new Date().toLocaleString()}</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${projectLink}" class="button">View Application Details</a>
    </div>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">Fworkk Freelancing Team</p>
  `;

  const html = getEmailTemplate(content, "New Project Application Notification");

  try {
    await sendEmail(projectOwner.email, subject, html);
    console.log(`✅ Project application email sent to ${projectOwner.email}`);
  } catch (error) {
    console.error("❌ Project application email failed:", error);
    throw error;
  }
};

export const sendPrimeInvitationEmail = async (freelancer, project, role, clientUser) => {
  const subject = `Fworkk Prime Invitation: ${project.title}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #3B82F6;">You're Invited to a Fworkk Prime Project!</h2>
        </div>
        <p>Hello <strong>${freelancer.Fullname}</strong>,</p>
        <p>You have been selected as an expert for the <strong>${role}</strong> position on the project: <strong>${project.title}</strong>.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Client:</strong> ${clientUser ? clientUser.Fullname : 'Fworkk Client'}</p> 
            <p style="margin: 5px 0;"><strong>Role:</strong> ${role}</p>
            <p style="margin: 5px 0;"><strong>Project Budget:</strong> $${project.budget}</p>
        </div>
        
        <p>Please log in to your dashboard to view full details and accept the invitation.</p>
        
        <div style="text-align: center; margin-top: 25px;">
            <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Invitation</a>
        </div>
        
        <p style="margin-top: 30px; font-size: 12px; color: #666;">If you did not request this, please ignore this email.</p>
    </div>
  `;

  try {
    await sendEmail(freelancer.email, subject, html);
    console.log(`✅ Prime invitation email sent to ${freelancer.email}`);
  } catch (error) {
    console.error("❌ Prime invitation email failed:", error);
    throw error;
  }
};

export const sendPrimeWelcomeEmail = async (freelancerUser, project) => {
  const subject = `🎉 Welcome to Fworkk Prime! - ${project.title}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #10B981; margin-bottom: 5px;">Welcome to Fworkk Prime!</h1>
            <p style="font-size: 16px; color: #666;">You joined the <strong>${project.title}</strong> team</p>
        </div>
        
        <p>Hello <strong>${freelancerUser.Fullname}</strong>,</p>
        <p>Congratulations! You have successfully accepted the invitation and are now a member of this Prime project.</p>
        
        <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981;">
            <h3 style="color: #047857; margin: 0 0 10px 0;">✅ Ready to Start</h3>
            <p style="margin: 0;">We are excited to have you on board. Please check the project console for your tasks.</p>
        </div>

        <div style="background-color: #fca5a5; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #dc2626;">
            <h3 style="color: #991b1b; margin-top: 0; border-bottom: 1px solid #fecaca; padding-bottom: 10px;">
                ⚠️ CRITICAL WARNINGS & GUIDELINES
            </h3>
            <ul style="color: #7f1d1d; padding-left: 20px; margin-bottom: 0;">
                <li style="margin-bottom: 8px;"><strong>Commitment:</strong> Once accepted, you <strong>cannot leave</strong> this project without valid administrative approval.</li>
                <li style="margin-bottom: 8px;"><strong>Strict Activity Policy:</strong> Inactivity of more than <strong>2 days</strong> will flag your account in the <strong>Danger Zone</strong>.</li>
                <li style="margin-bottom: 8px;"><strong>Zero Tolerance:</strong> Unprofessional behavior or failure to meet deadlines may result in an <strong>immediate account ban</strong> and forfeiture of earnings.</li>
                <li><strong>High Standards:</strong> Fworkk Prime expects top-tier quality. Fulfill every client requirement strictly.</li>
            </ul>
        </div>
        <p>Best regards,<br>The Fworkk Team</p>
    </div>
  `;

  try {
    await sendEmail(freelancerUser.email, subject, html);
    console.log(`✅ Prime welcome email sent to ${freelancerUser.email}`);
  } catch (error) {
    console.error("❌ Prime welcome email failed:", error);
    throw error;
  }
};

export const sendTaskReminderEmail = async (assigneeEmail, assigneeName, taskName, projectTitle, dueDate, projectId, type) => {
  const subject = `Task Reminder: ${taskName} is due ${type === "oneDayBefore" ? "tomorrow" : "today"}`;
  const html = `
      <div style="font-family:Arial, sans-serif; max-width:600px; margin:0 auto; background:#f9f9f9; padding:20px;">
        <div style="background:#fff; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color:#3B82F6;">${subject}</h2>
          <p>Hello ${assigneeName},</p>
          <p>This is a reminder that the task <strong>${taskName}</strong> for project <strong>${projectTitle}</strong> is ${type === "oneDayBefore" ? "due tomorrow" : "due today"} (${new Date(dueDate).toLocaleDateString()}).</p>
          <p>Please ensure it is completed on time.</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/project/${projectId}" style="display:inline-block; background:#3B82F6; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px;">View Project</a>
        </div>
      </div>`;

  try {
    await sendEmail(assigneeEmail, subject, html);
    console.log(`✅ Task reminder email sent to ${assigneeEmail}`);
  } catch (error) {
    console.error("❌ Task reminder email failed:", error);
    throw error;
  }
};

export const sendProjectCancellationEmailToFreelancer = async (user, project, reason = "Project requirement changed") => {
  const subject = `Project Cancelled: "${project.title}"`;
  const content = `
    <h2 style="color: #ef4444;">Project Cancelled</h2>
    <p>Hi ${user.username || 'there'},</p>
    <p>Unfortunately, the project "<strong>${project.title}</strong>" has been <strong>cancelled</strong> by the client.</p>
    ${reason ? `<p><b>Reason:</b> ${reason}</p>` : ''}
    <p>We apologize for any inconvenience this may cause. Please continue looking for other opportunities on Fworkk Freelancing.</p>
    <p>Best regards,<br/>Team Fworkk Freelancing</p>
  `;

  const html = getEmailTemplate(content, "Cancellation Notice");

  try {
    await sendEmail(user.email, subject, html);
    console.log(`✅ Project cancellation email sent to ${user.email}`);
  } catch (error) {
    console.error("❌ Project cancellation email failed:", error);
    throw error;
  }
};

export const sendHiredEmail = async (user, project, projectLink, feedback = "") => {
  const subject = `You're Hired for "${project.title}"!`;
  const content = `
    <h2 style="color: #22c55e; text-align: center;">Congratulations!</h2>
    <p>Hi ${user.username || user.Fullname || 'there'},</p>
    <p>You have been <span class="highlight">hired</span> for the project "<strong>${project.title}</strong>"!</p>
    <p>You can now start working on the project. Click the button below to view the details:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${projectLink}" class="button">View Project Details</a>
    </div>
    ${feedback ? `<p><b>Feedback from Client:</b> ${feedback}</p>` : ''}
    <p>Best of luck!<br/><strong>Team Fworkk Freelancing</strong></p>
  `;

  const html = getEmailTemplate(content, "Hired Notification");

  try {
    await sendEmail(user.email, subject, html);
    console.log(`✅ Hired email sent to ${user.email}`);
  } catch (error) {
    console.error("❌ Hired email failed:", error);
    throw error;
  }
};

export const sendApplicationDecisionEmail = async (user, project, status, feedback = "") => {
  const isRejected = status === "rejected";
  const subject = isRejected ? `Update on Your Application for "${project.title}"` : `Application Approved for "${project.title}"`;
  const content = `
    <h2 style="color: ${isRejected ? '#ef4444' : '#22c55e'};">Application Update</h2>
    <p>Hi ${user.username || user.Fullname || 'there'},</p>
    <p>Thank you for applying for "<strong>${project.title}</strong>".</p>
    <p>The client has decided to <strong>${status}</strong> your application at this time.</p>
    ${feedback ? `<p><b>Feedback:</b> ${feedback}</p>` : ''}
    <p>${isRejected ? 'We encourage you to apply for other opportunities on Fworkk Freelancing.' : 'Stay tuned for next steps!'}</p>
    <p>Best regards,<br/><strong>Team Fworkk Freelancing</strong></p>
  `;

  const html = getEmailTemplate(content, "Application Decision");

  try {
    await sendEmail(user.email, subject, html);
    console.log(`✅ Application decision email (${status}) sent to ${user.email}`);
  } catch (error) {
    console.error("❌ Application decision email failed:", error);
    throw error;
  }
};

export const sendTaskAssignmentEmail = async (userEmail, userName, taskTitle, teamName, amount, dueDate) => {
  const subject = `📋 New Task Assigned: ${taskTitle}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background-color: #f9f9f9; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: #007bff; text-align: center;">New Task Assigned!</h2>
        <p>Hi ${userName},</p>
        <p>You have been assigned a new task in the team "<strong>${teamName}</strong>".</p>
        <div style="background-color: #f0f7ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #007bff;">
          <p><strong>Task:</strong> ${taskTitle}</p>
          ${amount > 0 ? `<p><strong>Amount:</strong> $${amount}</p>` : ''}
          ${dueDate ? `<p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>` : ''}
        </div>
        <p>Please log in to your dashboard to view the details and start working.</p>
        <p>Best regards,<br/><strong>Team Fworkk Freelancing</strong></p>
      </div>
    </div>
  `;

  try {
    await sendEmail(userEmail, subject, html);
    console.log(`✅ Task assignment email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Task assignment email failed:", error);
  }
};

export const sendTaskStatusUpdateEmail = async (userEmail, userName, taskTitle, teamName, status) => {
  const isCompleted = status === 'completed';
  const subject = `Task ${status.charAt(0).toUpperCase() + status.slice(1)}: ${taskTitle}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background-color: #f9f9f9; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h2 style="color: ${isCompleted ? '#28a745' : '#dc3545'}; text-align: center;">Task Status Update</h2>
        <p>Hi ${userName},</p>
        <p>The task "<strong>${taskTitle}</strong>" in team "<strong>${teamName}</strong>" has been marked as <strong>${status}</strong>.</p>
        <p>Best regards,<br/><strong>Team Fworkk Freelancing</strong></p>
      </div>
    </div>
  `;

  try {
    await sendEmail(userEmail, subject, html);
    console.log(`✅ Task status update email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Task status update email failed:", error);
  }
};

export const sendEarningUpdateEmail = async (userEmail, userName, amount, type, reason) => {
  const isIncrement = type === 'increment';
  const subject = isIncrement ? `Payment Received: $${amount}` : `Payment Deducted: $${amount}`;
  const content = `
    <h2 style="color: ${isIncrement ? '#10b981' : '#ef4444'}; text-align: center;">${isIncrement ? 'Funds Added' : 'Funds Deducted'}</h2>
    <p>Hi ${userName},</p>
    <p>This is to notify you that $<strong>${amount}</strong> has been <span class="highlight">${isIncrement ? 'added to' : 'deducted from'}</span> your account earnings.</p>
    <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${isIncrement ? '#10b981' : '#ef4444'};">
      <p style="margin: 0;"><b>Reason:</b> ${reason}</p>
    </div>
    <p>Best regards,<br/><strong>Team Fworkk Freelancing</strong></p>
  `;

  const html = getEmailTemplate(content, "Earnings Update");

  try {
    await sendEmail(userEmail, subject, html);
    console.log(`✅ Earning update email sent to ${userEmail}`);
  } catch (error) {
    console.error("❌ Earning update email failed:", error);
  }
};

export const sendDeletionEmailToClient = async (client, project) => {
  const subject = `Your Project "${project.title}" Has Been Deleted`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:10px;padding:32px 24px;box-shadow:0 2px 12px #0001;">
      <div style="text-align:center;margin-bottom:24px;">
        <h2 style="color:#ff4d4f;">Project Deleted by Admin</h2>
      </div>
      <p>Dear <b>${client.username || client.Fullname || "User"}</b>,</p>
      <p>Your project <b>"${project.title}"</b> has been <span style="color:#ff4d4f;font-weight:bold;">deleted</span> by the Fworkk admin team.</p>
      <p><b>Reason:</b> Your project was found to be against our policy or contained inappropriate wording.</p>
      <ul style="color:#ff4d4f;font-weight:bold;">
        <li>Your project has been removed from the platform.</li>
        <li>Your payment for this project is lost.</li>
        <li>This is a warning. Repeated violations may result in account suspension.</li>
      </ul>
      <p style="color:#ff4d4f;font-weight:bold;">Please avoid posting such projects or using inappropriate wording in the future.</p>
      <p>For any questions, contact support.</p>
      <br/>
      <p style="color:#28a745;font-weight:bold;">Fworkk Team</p>
    </div>
  `;

  try {
    await sendEmail(client.email, subject, html);
    console.log(`✅ Deletion email sent to client ${client.email}`);
  } catch (error) {
    console.error("❌ Deletion email to client failed:", error);
    throw error;
  }
};


export const sendWorkUpdateReminderEmail = async (user, project) => {
  const subject = `Work Update Reminder: ${project.title}`;
  const content = `
    <h2 style="color: #f59e0b; text-align: center;">Daily Work Update Reminder</h2>
    <p>Dear <b>${user.username || user.Fullname || "Freelancer"}</b>,</p>
    <p>This is a reminder that you have <b>not submitted your daily work update</b> for the project: <b>"${project.title}"</b> today.</p>
    
    <div style="background-color: #fffbef; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; color: #92400e;"><b>Action Required:</b> Please log in and submit your work update immediately to keep the client informed.</p>
    </div>

    <p>Regular updates are crucial for maintaining client satisfaction and project progress.</p>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/work-update/${project._id}" class="button">Submit Update Now</a>
    </div>

    <p style="margin-top: 30px;">Best regards,<br/><strong>Fworkk Team</strong></p>
  `;

  const html = getEmailTemplate(content, "Activity Reminder");

  try {
    await sendEmail(user.email, subject, html);
    console.log(`✅ Work update reminder email sent to ${user.email}`);
  } catch (error) {
    console.error("❌ Work update reminder email failed:", error);
  }
};

export const sendWorkUpdateSubmittedEmail = async (client, project, freelancer, updateDescription) => {
  const subject = `New Work Update: ${project.title}`;
  const content = `
    <h2 style="color: #22c55e;">Daily Work Update</h2>
    <p>Dear <b>${client.username || client.Fullname || "Client"}</b>,</p>
    <p>Freelancer <b>${freelancer.username || freelancer.Fullname}</b> has submitted an update for: <strong class="highlight">${project.title}</strong>.</p>
    
    <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
      <p><b>Update Summary:</b></p>
      <p style="font-style: italic; color: #374151;">"${updateDescription}"</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/project/${project._id}" class="button">View Project Console</a>
    </div>

    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Work Update Received");

  try {
    await sendEmail(client.email, subject, html);
    console.log(`✅ Work update submitted email sent to client ${client.email}`);
  } catch (error) {
    console.error("❌ Work update submitted email failed:", error);
  }
};

export const sendDeletionEmailToApplicant = async (applicant, project) => {
  const subject = `Update Regarding Your Application for "${project.title}"`;
  const content = `
    <h2 style="color: #ef4444;">Application Removed</h2>
    <p>Dear <b>${applicant.username || applicant.Fullname || "User"}</b>,</p>
    <p>Your application for the project <strong class="highlight">${project.title}</strong> has been removed by our moderation team.</p>
    
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 25px 0;">
      <p style="margin: 0;"><b>Reason:</b> The project was found to be in violation of our policy or contained inappropriate wording. As a result, all associated data including applications have been removed.</p>
    </div>

    <p style="font-weight: 700; color: #b91c1c;">Warning: Please ensure all project engagement follows our professional community guidelines to avoid account restrictions.</p>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Application Removal Notice");

  try {
    await sendEmail(applicant.email, subject, html);
    console.log(`✅ Deletion email sent to applicant ${applicant.email}`);
  } catch (error) {
    console.error("❌ Deletion email to applicant failed:", error);
    throw error;
  }
};export const sendProjectHoldEmail = async (user, project) => {
  const subject = `Project "${project.title}" is on Hold - Moderation`;
  const content = `
    <h2 style="color: #f59e0b;">Project Moderation Notice</h2>
    <p>Dear <b>${user.username || user.Fullname || "User"}</b>,</p>
    <p>Our AI moderation system detected <strong class="highlight">external contact details</strong> (phone, email, or social media) in your project: <b>"${project.title}"</b>.</p>
    
    <div style="background-color: #fffbef; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0;">
      <p style="margin: 0;"><b>Issue:</b> External contact details detected.</p>
      <p style="margin-top: 10px;"><b>Status:</b> Project moved to <span style="color: #d97706; font-weight: 700;">HOLD</span></p>
    </div>
    
    <h3 style="font-size: 18px;">How to resolve:</h3>
    <ol style="color: #4b5563;">
      <li>Go to your project dashboard.</li>
      <li>Edit the project <b>"${project.title}"</b>.</li>
      <li>Remove any phone numbers, email addresses, or social links.</li>
      <li>Save the changes, and our team will re-verify the project.</li>
    </ol>
    
    <p style="color: #b91c1c; font-weight: 700;">Note: This project will NOT be visible to freelancers until the contact details are removed.</p>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">Fworkk Moderation Team</p>
  `;

  const html = getEmailTemplate(content, "Project Hold Notice");

  try {
    await sendEmail(user.email, subject, html);
    console.log(`✅ Project hold email sent to ${user.email}`);
  } catch (error) {
    console.error("❌ Project hold email failed:", error);
    throw error;
  }
};





export const sendPaymentSuccessEmailToBuyer = async (purchase, buyer, project) => {
  const subject = `Order Confirmed - ${project.title}`;
  const content = `
    <h2 style="color: #22c55e; text-align: center;">Payment Successful!</h2>
    <p>Dear <strong>${buyer.username || buyer.Fullname || "Valued Customer"}</strong>,</p>
    <p>Thank you for choosing Fworkk. Your payment has been successfully processed and your order is confirmed.</p>
    
    <div style="background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="font-size: 18px; margin-top: 0;">Order Summary:</h3>
      <ul style="color: #4b5563;">
        <li><b>Project:</b> ${project.title}</li>
        <li><b>Order ID:</b> ${purchase._id}</li>
        <li><b>Amount:</b> $${purchase.amount}</li>
        <li><b>Status:</b> <span style="color: #059669; font-weight: 700;">Paid</span></li>
      </ul>
    </div>
    
    <div style="background-color: #eff6ff; padding: 20px; border-radius: 10px; border-left: 4px solid #2563eb;">
      <h4 style="margin-top: 0; color: #1e40af;">Security Verification</h4>
      <p style="font-size: 14px; margin-bottom: 0;">Our team is performing a final security check to protect both parties. Once verified, the freelancer will be notified to start work immediately.</p>
    </div>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Payment Confirmation Notice");
  await sendEmail(buyer.email, subject, html);
};

export const sendReportWarningEmail = async (reportedUser, report, adminName) => {
  const subject = `Account Warning - Report Received`;
  const content = `
    <h2 style="color: #f59e0b; text-align: center;">Account Warning</h2>
    <p>Dear <strong>${reportedUser.username || reportedUser.Fullname || "User"}</strong>,</p>
    <p>A report has been filed against your account and verified by our administration team.</p>
    
    <div style="background-color: #fffbef; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #fcd34d;">
      <h3 style="color: #92400e; margin-top: 0; font-size: 18px;">Report Details:</h3>
      <ul style="color: #4b5563;">
        <li><b>Report ID:</b> ${report.reportNumber}</li>
        <li><b>Category:</b> ${report.category}</li>
        <li><b>Summary:</b> ${report.title}</li>
        <li><b>Action:</b> <span style="color: #b45309; font-weight: 700;">Official Warning</span></li>
      </ul>
    </div>
    
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
      <h4 style="margin-top: 0;">Admin Notes:</h4>
      <p style="font-style: italic; color: #6b7280; font-size: 14px;">"${report.adminNotes || "No additional notes provided."}"</p>
    </div>

    <div style="background-color: #fef2f2; padding: 20px; border-radius: 10px; border-left: 4px solid #ef4444;">
      <h4 style="color: #b91c1c; margin-top: 0;">Final Notice</h4>
      <p style="font-size: 14px; color: #b91c1c; margin-bottom: 0;">This is a final warning. Any further violations of our community guidelines will result in account suspension or termination.</p>
    </div>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">${adminName}<br>Fworkk Administration</p>
  `;

  const html = getEmailTemplate(content, "Official Account Warning");
  await sendEmail(reportedUser.email, subject, html);
};

export const sendTemporarySuspensionEmail = async (reportedUser, report, adminName, suspensionDays = 3) => {
  const subject = `Account Temporarily Suspended`;
  const content = `
    <h2 style="color: #ef4444; text-align: center;">Account Suspended</h2>
    <p>Dear <strong>${reportedUser.username || reportedUser.Fullname || "User"}</strong>,</p>
    <p>Your account has been temporarily suspended due to a verified policy violation.</p>
    
    <div style="background-color: #fef2f2; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #fecaca;">
      <h3 style="color: #b91c1c; margin-top: 0; font-size: 18px;">Suspension Details:</h3>
      <ul style="color: #4b5563;">
        <li><b>Report ID:</b> ${report.reportNumber}</li>
        <li><b>Category:</b> ${report.category}</li>
        <li><b>Action:</b> <span style="color: #ef4444; font-weight: 700;">${suspensionDays} Day Suspension</span></li>
        <li><b>End Date:</b> ${new Date(Date.now() + suspensionDays * 24 * 60 * 60 * 1000).toLocaleDateString()}</li>
      </ul>
    </div>
    
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
      <h4 style="margin-top: 0;">Admin Notes:</h4>
      <p style="font-style: italic; color: #6b7280; font-size: 14px;">"${report.adminNotes || "No additional notes provided."}"</p>
    </div>

    <div style="background-color: #eff6ff; padding: 20px; border-radius: 10px; border-left: 4px solid #2563eb;">
      <h4 style="color: #1e40af; margin-top: 0;">What this means</h4>
      <ul style="font-size: 14px; color: #1e40af; padding-left: 20px;">
        <li>Dashboard access is restricted.</li>
        <li>Bidding and project posts are disabled.</li>
        <li>Account will automatically reactivate after the suspension period.</li>
      </ul>
    </div>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">${adminName}<br>Fworkk Administration</p>
  `;

  const html = getEmailTemplate(content, "Temporary Account Suspension");
  await sendEmail(reportedUser.email, subject, html);
};

export const sendPermanentBanEmail = async (reportedUser, report, adminName) => {
  const subject = `Account Permanently Banned`;
  const content = `
    <h2 style="color: #ef4444; text-align: center;">Account Banned</h2>
    <p>Dear <strong>${reportedUser.username || reportedUser.Fullname || "User"}</strong>,</p>
    <p>Your Fworkk account has been permanently deactivated due to severe policy violations.</p>
    
    <div style="background-color: #fef2f2; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #ef4444;">
      <h3 style="color: #b91c1c; margin-top: 0; font-size: 18px;">Final Action Details:</h3>
      <ul style="color: #4b5563;">
        <li><b>Report ID:</b> ${report.reportNumber}</li>
        <li><b>Status:</b> <span style="color: #ef4444; font-weight: 700;">Permanently Banned</span></li>
      </ul>
    </div>
    
    <p>This decision was made after a careful review of your account activities and is final. You will no longer be able to access any Fworkk services or data.</p>
    
    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">${adminName}<br>Fworkk Administration</p>
  `;

  const html = getEmailTemplate(content, "Permanent Account Deactivation");
  await sendEmail(reportedUser.email, subject, html);
};

export const sendAccountReactivatedEmail = async (user) => {
  const subject = "Account Reactivated - Welcome Back";
  const content = `
    <h2 style="color: #22c55e; text-align: center;">Welcome Back!</h2>
    <p>Dear <strong>${user.username || user.Fullname || "User"}</strong>,</p>
    <p>Your account has been successfully reactivated. You now have full access to all Fworkk services.</p>
    
    <div style="background-color: #f0fdf4; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #dcfce7;">
      <h3 style="color: #166534; margin-top: 0; font-size: 18px;">Account Status:</h3>
      <p><b>Status:</b> <span style="color: #16a34a; font-weight: 700;">Active</span></p>
      <p><b>Reactivated On:</b> ${new Date().toLocaleDateString()}</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://fworkk.com'}/dashboard" class="button">Go to Dashboard</a>
    </div>

    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Account Reactivation Notice");
  await sendEmail(user.email, subject, html);
};

export const sendPaymentNotificationToSeller = async (purchase, seller, project, buyer) => {
  const subject = `New Payment Received - ${project.title}`;
  const content = `
    <h2 style="color: #10b981; text-align: center;">New Order Received!</h2>
    <p>Dear <strong>${seller.username || seller.Fullname || "Seller"}</strong>,</p>
    <p>You have received a new payment for your project <strong class="highlight">${project.title}</strong>.</p>
    
    <div style="background-color: #f0fdf4; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="color: #166534; margin-top: 0; font-size: 18px;">Order Info:</h3>
      <ul style="color: #4b5563;">
        <li><b>Order ID:</b> ${purchase._id}</li>
        <li><b>Amount:</b> $${purchase.amount}</li>
        <li><b>Payment Method:</b> ${purchase.paymentMethod}</li>
      </ul>
    </div>
    
    <div style="background-color: #eff6ff; padding: 20px; border-radius: 10px; border-left: 4px solid #2563eb;">
      <h4 style="color: #1e40af; margin-top: 0;">Next Steps</h4>
      <p style="font-size: 14px; margin-bottom: 0;">Check your dashboard for requirements and start the project. Timely delivery is key to maintaining your rating!</p>
    </div>

    <p style="margin-top: 30px; font-weight: 700; color: #1e40af;">The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "New Order Notification");
  await sendEmail(seller.email, subject, html);
};

export const sendProjectSubmissionEmailToSeller = async (purchase, seller, project, buyer) => {
  const subject = `Project Submitted Successfully - ${project.title}`;
  const content = `
    <h2 style="color: #28a745; text-align: center;">Project Submitted Successfully!</h2>
    <p>Dear <strong>${seller.username || seller.Fullname || "Seller"}</strong>,</p>
    <p>Great news! Your project submission has been successfully received and is now under review.</p>
    
    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #155724; margin-top: 0;">Project Details:</h3>
      <p><b>Project:</b> ${project.title}</p>
      <p><b>Order ID:</b> ${purchase._id}</p>
      <p><b>Buyer:</b> ${buyer.username || buyer.Fullname || "Client"}</p>
      <p><b>Amount:</b> $${purchase.amount}</p>
      <p><b>Status:</b> <span style="color: #f59e0b; font-weight: bold;">Under Review</span></p>
    </div>
    
    <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
      <h4 style="color: #856404; margin-top: 0;">Security Review Process</h4>
      <p style="font-size: 14px;">Your project is now being reviewed by our team to ensure code quality, security compliance, and requirement alignment. This process protects both parties and ensures a high-quality delivery.</p>
    </div>
    
    <p>We will notify you immediately once the review is complete.</p>
    <p>Best regards,<br><strong>The Fworkk Freelancing Team</strong></p>
  `;

  const html = getEmailTemplate(content, "Project Submission Notification");
  await sendEmail(seller.email, subject, html);
};

export const sendProjectSubmissionEmailToBuyer = async (purchase, buyer, project, seller) => {
  const subject = `Your Project is Under Review - ${project.title}`;
  const content = `
    <h2 style="color: #2563eb; text-align: center;">Project Under Review</h2>
    <p>Dear <strong>${buyer.username || buyer.Fullname || "Valued Client"}</strong>,</p>
    <p>The project <strong class="highlight">${project.title}</strong> has been submitted by the developer and is now undergoing our mandatory quality and security review.</p>
    
    <div style="background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="font-size: 18px; margin-top: 0;">Submission Info:</h3>
      <p><b>Order ID:</b> ${purchase._id}</p>
      <p><b>Developer:</b> ${seller.username || seller.Fullname}</p>
      <p><b>Amount:</b> $${purchase.amount}</p>
    </div>
    
    <div style="background-color: #eff6ff; padding: 20px; border-radius: 10px; border-left: 4px solid #2563eb;">
      <h4 style="margin-top: 0; color: #1e40af;">What happens next?</h4>
      <p style="font-size: 14px; margin-bottom: 0;">Once our team verifies the code and functionality, the project will be delivered to you with all necessary documentation and resources.</p>
    </div>

    <p style="margin-top: 30px;">Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Submission Review Notice");
  await sendEmail(buyer.email, subject, html);
};

export const sendProjectUnderReviewEmailToBuyer = async (purchase, buyer, project, seller) => {
  const subject = `Update: Project Review in Progress - ${project.title}`;
  const content = `
    <h2 style="color: #2563eb; text-align: center;">Review in Progress</h2>
    <p>Dear <strong>${buyer.username || buyer.Fullname || "Valued Client"}</strong>,</p>
    <p>We are currently reviewing the project <strong class="highlight">${project.title}</strong> submitted by your developer.</p>
    
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 10px; margin: 25px 0;">
      <p><b>Status:</b> Quality Assurance Sweep</p>
      <p><b>Order ID:</b> ${purchase._id}</p>
    </div>
    
    <p>You will receive a final delivery email as soon as our verification is complete.</p>
    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Under Review Notification");
  await sendEmail(buyer.email, subject, html);
};

export const sendProjectSubmissionNotificationToAdmin = async (adminEmail, purchase, project, seller, buyer) => {
  const subject = `Urgent: New Project Under Review - ${project.title}`;
  const content = `
    <h2 style="color: #ef4444; text-align: center;">New Admin Review Required</h2>
    <p>A new project has been submitted and requires immediate administration review.</p>
    
    <div style="background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #e5e7eb;">
      <h3 style="font-size: 18px; margin-top: 0;">Review Details:</h3>
      <ul style="color: #4b5563;">
        <li><b>Project:</b> ${project.title}</li>
        <li><b>Order ID:</b> ${purchase._id}</li>
        <li><b>Seller:</b> ${seller.username} (${seller.email})</li>
        <li><b>Buyer:</b> ${buyer.username} (${buyer.email})</li>
        <li><b>Amount:</b> $${purchase.amount}</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/admin/dashboard" class="button">Open Admin Dashboard</a>
    </div>

    <p style="font-size: 13px; color: #6b7280; text-align: center;">Fworkk Automated Review System</p>
  `;

  const html = getEmailTemplate(content, "Admin Review Required");
  await sendEmail(adminEmail, subject, html);
};

export const sendProjectCancellationEmailToSeller = async (purchase, seller, project, buyer) => {
  const subject = `Order Help Requested - ${project.title}`;
  const content = `
    <h2 style="color: #ef4444;">Review Feedback</h2>
    <p>Dear <strong>${seller.username || seller.Fullname || "Seller"}</strong>,</p>
    <p>Your project submission for <strong class="highlight">${project.title}</strong> requires updates before it can be delivered to the client.</p>
    
    <div style="background-color: #fef2f2; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="color: #b91c1c; margin-top: 0;">Feedback Detail:</h3>
      <p style="color: #7f1d1d;">The current submission does not fully meet the verified requirements. Please review the documentation and resubmit with the necessary fixes.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.CLIENT_URL || "http://localhost:3000"}/dashboard" class="button">Fix and Resubmit</a>
    </div>

    <p>If you have any questions, please contact our support team via the help center.</p>
    <p>Best regards,<br>The Fworkk Review Team</p>
  `;

  const html = getEmailTemplate(content, "Submission Feedback Notification");
  await sendEmail(seller.email, subject, html);
};

export const sendProjectDeliveryEmailToBuyer = async (purchase, buyer, project, seller) => {
  const subject = `Your Project is Ready - ${project.title}`;
  const csvContent = generateOrderCSV(purchase, project, seller);

  const content = `
    <h2 style="color: #22c55e; text-align: center;">Delivery Successful!</h2>
    <p>Dear <strong>${buyer.username || buyer.Fullname || "Valued Customer"}</strong>,</p>
    <p>Excellent news! Your project <strong class="highlight">${project.title}</strong> has been successfully delivered and is ready for use.</p>
    
    <div style="background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="font-size: 18px; margin-top: 0;">Delivery Details:</h3>
      <ul style="color: #4b5563; line-height: 2;">
        <li><b>Order ID:</b> ${purchase._id}</li>
        <li><b>Developer:</b> ${seller.username}</li>
        <li><b>Status:</b> <span style="color: #059669; font-weight: 700;">Delivered</span></li>
      </ul>
    </div>
    
    <div style="background-color: #eff6ff; padding: 20px; border-radius: 10px; border-left: 4px solid #2563eb; margin-bottom: 25px;">
      <h4 style="margin-top: 0; color: #1e40af;">Resources and Files</h4>
      <p style="font-size: 14px;">We've attached a comprehensive <b>CSV report</b> to this email containing all setup instructions, GitHub repository links, and technical details for your records.</p>
    </div>

    <p>If you need any assistance with the deployment, please contact the developer via the platform dashboard.</p>
    <p style="margin-top: 30px;">Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Project Delivery Confirmation");

  await sendEmailWithAttachment(
    buyer.email,
    subject,
    html,
    csvContent,
    `order-details-${purchase._id}.csv`
  );
};

const generateOrderCSV = (purchase, project, seller) => {
  const rows = [
    ["Order Details"],
    ["Order ID", purchase._id],
    ["Project Title", project.title],
    ["Amount Paid", `$${purchase.amount}`],
    ["Purchase Date", new Date(purchase.createdAt).toLocaleDateString()],
    ["Delivery Date", new Date().toLocaleDateString()],
    ["Status", "Delivered"],
    [""],
    ["Buyer Information"],
    ["Username", purchase.buyer?.username || "N/A"],
    ["Email", purchase.buyer?.email || "N/A"],
    [""],
    ["Seller Information"],
    ["Username", seller.username || seller.Fullname || "N/A"],
    ["Email", seller.email || "N/A"],
    [""],
    ["Project Links"],
    ["GitHub Repository", project.links?.github || "N/A"],
    ["Live Demo", project.links?.demo || "N/A"],
    ["Portfolio", project.links?.portfolio || "N/A"],
    ["Documentation", project.links?.documentation || "N/A"],
    [""],
    ["Delivery Requirements"],
    ["GitHub Link", purchase.deliveryRequirements?.githubLink || "N/A"],
    ["Live URL", purchase.deliveryRequirements?.liveUrl || "N/A"],
    ["Domain Name", purchase.deliveryRequirements?.domainName || "N/A"],
    ["Hosting Provider", purchase.deliveryRequirements?.hostingProvider || "N/A"],
    ["Setup Instructions", purchase.deliveryRequirements?.setupInstructions || "N/A"],
    ["Features Implemented", purchase.deliveryRequirements?.featuresImplemented || "N/A"],
    ["Technologies Used", purchase.deliveryRequirements?.technologiesUsed || "N/A"],
    ["Deployment Instructions", purchase.deliveryRequirements?.deploymentInstructions || "N/A"],
    ["Additional Notes", purchase.deliveryRequirements?.additionalNotes || "N/A"],
    [""],
    ["Project Description"],
    ["Description", project.description || "N/A"],
    ["Category", project.category || "N/A"],
    ["Price", `$${project.price}` || "N/A"],
    [""],
    ["Buyer Requirements"],
    ["Requirements", purchase.buyerDescription || "N/A"],
  ];

  return rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
};

const sendEmailWithAttachment = async (to, subject, html, csvContent, filename) => {
  try {
    if (!to) throw new Error(`Missing recipient email for delivery: ${filename}`);

    const cleanSubject = removeEmojis(subject);
    const cleanHtml = removeEmojis(html);

    console.log(`📡 Sending delivery email with attachment via Resend API to ${to}...`);
    const info = await resend.emails.send({
      from: `Fworkk Delivery <${process.env.EMAIL_NOREPLY || 'noreply@betpro2u.online'}>`,
      to: to,
      subject: cleanSubject,
      html: cleanHtml,
      attachments: [{ filename: filename, content: csvContent }],
    });

    if (info.error) throw new Error(info.error.message);
    console.log(`✅ Delivery email with CSV sent to ${to}`);
    return info;
  } catch (err) {
    console.error("❌ Delivery email sending failed:", err.message);
    if (MAILERSEND_API_KEY) {
      try {
        await axios.post(MAILERSEND_ENDPOINT, {
          from: { email: process.env.EMAIL_NOREPLY || "noreply@betpro2u.online", name: "Fworkk" },
          to: [{ email: to }],
          subject: removeEmojis(subject),
          html: removeEmojis(html),
          attachments: [{
            content: Buffer.from(csvContent).toString("base64"),
            filename: filename,
            disposition: "attachment",
          }],
        }, {
          headers: { Authorization: `Bearer ${MAILERSEND_API_KEY}`, "Content-Type": "application/json" },
        });
        return { success: true };
      } catch (mErr) {
        throw new Error("All attachment providers failed.");
      }
    }
    throw err;
  }
};

export const sendProjectDeliveryEarningsEmailToSeller = async (purchase, seller, project, netEarnings, taxAmount) => {
  const subject = `Payment Credited: $${netEarnings.toFixed(2)} - ${project.title}`;
  const content = `
    <h2 style="color: #10b981; text-align: center;">Earnings Credited!</h2>
    <p>Dear <strong>${seller.username || seller.Fullname || "Valued Seller"}</strong>,</p>
    <p>Congratulations! Your project <strong class="highlight">${project.title}</strong> has been delivered and your earnings have been credited.</p>
    
    <div style="background-color: #f0fdf4; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <h3 style="color: #166534; margin-top: 0;">Earnings Summary:</h3>
      <ul style="color: #4b5563; line-height: 2;">
        <li><b>Total Amount:</b> $${purchase.amount.toFixed(2)}</li>
        <li><b>Platform Fee:</b> $${taxAmount.toFixed(2)}</li>
        <li><b>Net Earnings:</b> <span style="color: #059669; font-weight: 800; font-size: 20px;">$${netEarnings.toFixed(2)}</span></li>
      </ul>
    </div>
    
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 10px; border-left: 4px solid #10b981;">
      <h4 style="margin-top: 0;">Account Update</h4>
      <p style="font-size: 14px; margin-bottom: 0;">Your wallet balance has been updated. You can now view this transaction in your dashboard and request a withdrawal when ready.</p>
    </div>

    <p style="margin-top: 30px;">Thank you for your hard work!<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Earnings Confirmation Notification");
  await sendEmail(seller.email, subject, html);
};

export const sendWelcomeEmail = async (user) => {
  const subject = "Welcome to Fworkk - Your Journey Begins";
  const content = `
    <h2 style="color: #2563eb; text-align: center;">Welcome to Fworkk!</h2>
    <p>Dear <strong>${user.Fullname || user.username}</strong>,</p>
    <p>We are thrilled to have you join our global community of professionals. Fworkk is designed to help you build your business, connect with top talent, and achieve your goals with secure, streamlined workflows.</p>
    
    <div style="background-color: #f8fafc; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #e5e7eb;">
      <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Getting Started:</h3>
      <ul style="color: #4b5563; line-height: 1.8;">
        <li><b>Complete Profile:</b> Add your skills and portfolio to stand out.</li>
        <li><b>Explore Projects:</b> Browse the marketplace or post your own.</li>
        <li><b>Secure Payments:</b> Benefit from our secure escrow and automated systems.</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard" class="button">Go to Dashboard</a>
    </div>

    <p>If you have any questions, our support team is available 24/7 to assist you.</p>
    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Welcome Notification");
  await sendEmail(user.email, subject, html);
};

export const sendVIPEmail = async (email, fullName, vipStatus, projectCount) => {
  const subject = `VIP Achievement Unlocked: ${vipStatus} Status`;

  const getVIPColor = (status) => {
    switch (status) {
      case "VIP": return "#ff6b35";
      case "Master": return "#9c27b0";
      case "Legend": return "#ffd700";
      default: return "#28a745";
    }
  };

  const getVIPDescription = (status) => {
    switch (status) {
      case "VIP": return "You've posted 10+ projects and earned VIP status!";
      case "Master": return "You've posted 20+ projects and achieved Master status!";
      case "Legend": return "You've posted 50+ projects and become a Legend!";
      default: return "You've achieved a special status!";
    }
  };

  const vipColor = getVIPColor(vipStatus);
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <h2 style="color: ${vipColor}; font-size: 28px; margin: 0;">Achievement Unlocked!</h2>
      <h3 style="color: ${vipColor}; margin: 5px 0;">${vipStatus} Status Awarded</h3>
    </div>

    <p>Dear <strong>${fullName}</strong>,</p>
    <p>Congratulations! You have reached <strong style="color: ${vipColor};">${vipStatus}</strong> status on Fworkk by posting <strong>${projectCount}</strong> projects. This achievement highlights your dedication and excellence in our community.</p>
    
    <div style="background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 25px 0; border: 2px solid ${vipColor}; text-align: center;">
      <h3 style="color: ${vipColor}; margin-top: 0;">Status: ${vipStatus}</h3>
      <p style="margin-bottom: 0;">${getVIPDescription(vipStatus)}</p>
    </div>
    
    <div style="background-color: #f0fdf4; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
      <h4 style="color: #166534; margin-top: 0;">Your New Benefits:</h4>
      <ul style="color: #166534; font-size: 14px;">
        <li>Premium ${vipStatus} badge on your profile.</li>
        <li>Priority support from our excellence team.</li>
        <li>Exclusive access to high-tier project categories.</li>
        <li>Special recognition in the global community.</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard" class="button" style="background-color: ${vipColor};">View Your Profile</a>
    </div>

    <p>Keep up the amazing work! Your commitment helps make Fworkk the best place for freelancers worldwide.</p>
    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "VIP Achievement Notice");
  await sendEmail(email, subject, html);
};

export const sendFreelancerAchievementEmail = async (email, name, achievement, completedProjects) => {
  const subject = `Achievement Unlocked: ${achievement} Status`;
  const content = `
    <h2 style="color: #2563eb; text-align: center;">New Milestone Reached!</h2>
    <p>Hello <strong>${name}</strong>,</p>
    <p>Congratulations! You have completed <strong>${completedProjects}</strong> projects and earned the <strong class="highlight">${achievement}</strong> status.</p>
    
    <div style="background-color: #eff6ff; padding: 25px; border-radius: 12px; margin: 25px 0; text-align: center;">
      <h3 style="color: #1e40af; margin-top: 0;">Achievement: ${achievement}</h3>
      <p style="color: #1e40af; margin-bottom: 0;">Your hard work and consistent delivery have been recognized.</p>
    </div>

    <p>Your profile now reflects this new status, helping you attract more high-quality clients.</p>
    <p>Keep up the great work!<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Freelancer Achievement notice");
  await sendEmail(email, subject, html);
};

export const sendAccountVerificationEmail = async (toEmail, code) => {
  const subject = "Your Fworkk Account Verification Code";
  const content = `
    <h2 style="color: #2563eb; text-align: center;">Account Verification</h2>
    <p>Dear User,</p>
    <p>Use the following code to verify your <strong class="highlight">Fworkk</strong> account:</p>
    <div style="background-color: #eff6ff; padding: 25px; border-radius: 12px; text-align: center; margin: 30px 0; border: 1px dashed #2563eb;">
      <h2 style="color: #1e40af; font-size: 36px; letter-spacing: 8px; margin: 0; font-family: monospace;">${code}</h2>
    </div>
    <p>This code will expire in <strong class="highlight">10 minutes</strong>. If you did not request this, please ignore this email.</p>
    <p>Best regards,<br>The Fworkk Team</p>
  `;
  const html = getEmailTemplate(content, "Verification Code");
  return await sendEmail(toEmail, subject, html);
};

export const sendLoginVerificationEmail = async (toEmail, code) => {
  const subject = "Your Fworkk Login Verification Code";
  const content = `
    <h2 style="color: #2563eb; text-align: center;">Login Verification</h2>
    <p>Dear User,</p>
    <p>Use the following code to complete your login to <strong class="highlight">Fworkk</strong>:</p>
    <div style="background-color: #eff6ff; padding: 25px; border-radius: 12px; text-align: center; margin: 30px 0; border: 1px dashed #2563eb;">
      <h2 style="color: #1e40af; font-size: 36px; letter-spacing: 8px; margin: 0; font-family: monospace;">${code}</h2>
    </div>
    <p>This code will expire in <strong class="highlight">10 minutes</strong>.</p>
    <p>Best regards,<br>The Fworkk Team</p>
  `;
  const html = getEmailTemplate(content, "Login Code");
  return await sendEmail(toEmail, subject, html);
};

export const sendRegistrationVerificationEmail = async (toEmail, code) => {
  const subject = "Your Fworkk Registration Verification Code";
  const content = `
    <h2 style="color: #2563eb; text-align: center;">Welcome to Fworkk</h2>
    <p>Dear Future Member,</p>
    <p>Thank you for choosing <strong class="highlight">Fworkk</strong>! Use the following code to verify your email and complete your registration:</p>
    <div style="background-color: #eff6ff; padding: 25px; border-radius: 12px; text-align: center; margin: 30px 0; border: 1px dashed #2563eb;">
      <h2 style="color: #1e40af; font-size: 36px; letter-spacing: 8px; margin: 0; font-family: monospace;">${code}</h2>
    </div>
    <p>This code will expire in <strong class="highlight">15 minutes</strong>.</p>
    <p>Best regards,<br>The Fworkk Team</p>
  `;
  const html = getEmailTemplate(content, "Registration Code");
  return await sendEmail(toEmail, subject, html);
};

export const sendTeamReadyEmail = async (owner, project) => {
  const subject = `Your Team is Ready! Launch Your Project - ${project.title}`;
  const content = `
    <h2 style="color: #1e40af; text-align: center;">Team Fully Assembled!</h2>
    <p>Dear <strong>${owner.username || owner.Fullname || "Client"}</strong>,</p>
    <p>Great news! All <strong class="highlight">${project.teamSize}</strong> members of your team have accepted their invitations. Your workspace is fully staffed and ready to launch.</p>
    
    <div style="background-color: #eff6ff; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #bfdbfe;">
      <h3 style="color: #1e3a8a; margin-top: 0; font-size: 18px;">Next Steps:</h3>
      <ul style="color: #1e3a8a; line-height: 1.8;">
        <li><b>Launch Project:</b> Activate the project from your Prime console.</li>
        <li><b>Start Collaboration:</b> Use the team chat to coordinate tasks.</li>
        <li><b>Track Progress:</b> Assign milestones and monitor deliveries.</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/prime-console/${project._id}" class="button">Launch Project Console</a>
    </div>

    <p>Best regards,<br>The Fworkk Prime Team</p>
  `;

  const html = getEmailTemplate(content, "Team Ready Notification");
  await sendEmail(owner.email, subject, html);
};

export const sendProjectLaunchedEmail = async (freelancer, project, client) => {
  const subject = `Project Launched! Start Collaborating on ${project.title}`;
  const content = `
    <h2 style="color: #059669; text-align: center;">Project Officially Launched!</h2>
    <p>Hello <strong>${freelancer.Fullname || "Expert"}</strong>,</p>
    <p>The project <strong class="highlight">${project.title}</strong> has been officially launched by the client, <strong>${client.Fullname}</strong>.</p>
    
    <div style="background-color: #ecfdf5; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #a7f3d0;">
      <h3 style="color: #065f46; margin-top: 0; font-size: 18px;">Action Required:</h3>
      <p style="font-size: 14px;">The workspace is now live. Please log in immediately to review initial instructions and coordinate with your team.</p>
      <ul style="color: #065f46; margin-top: 15px;">
        <li>Review assigned tasks in the console.</li>
        <li>Join the collaborative team chat.</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/prime-console/${project._id}" class="button" style="background-color: #10b981;">Go to Project Console</a>
    </div>

    <p style="text-align: center; color: #64748b;">Let's build something amazing together!</p>
    <p>Best regards,<br>The Fworkk Prime Team</p>
  `;

  const html = getEmailTemplate(content, "Project Launch Notification");
  await sendEmail(freelancer.email, subject, html);
};

export const sendProjectLaunchedClientEmail = async (client, project) => {
  const subject = `Project Launched Successfully - ${project.title}`;
  const content = `
    <h2 style="color: #1e3a8a; text-align: center;">Workspace Live!</h2>
    <p>Dear <strong>${client.Fullname || "Client"}</strong>,</p>
    <p>Congratulations! Your project <strong class="highlight">${project.title}</strong> is now officially live. Your team has been notified and is ready to start.</p>
    
    <div style="background-color: #eff6ff; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #bfdbfe;">
      <h4 style="color: #1e40af; margin-top: 0;">Managing Your Project:</h4>
      <ul style="color: #1e40af;">
        <li><b>Assign Tasks:</b> Break down goals into manageable milestones.</li>
        <li><b>Communicate:</b> Use the built-in chat for real-time updates.</li>
        <li><b>Approve Work:</b> Review and release payments for completed tasks.</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/prime-console/${project._id}" class="button">Manage Project Console</a>
    </div>

    <p>Best regards,<br>The Fworkk Prime Team</p>
  `;

  const html = getEmailTemplate(content, "Launch Confirmation");
  await sendEmail(client.email, subject, html);
};

export const sendTaskAssignedEmail = async (freelancer, project, task) => {
  const subject = `New Task Assigned: ${task.title}`;
  const content = `
    <h2 style="color: #1e40af; text-align: center;">New Task Assigned</h2>
    <p>Hello <strong>${freelancer.Fullname || "Expert"}</strong>,</p>
    <p>You have been assigned a new task in project <strong class="highlight">${project.title}</strong>.</p>
    
    <div style="background-color: #f9fafb; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #2563eb;">
      <h3 style="margin-top: 0;">${task.title}</h3>
      <p style="color: #4b5563; font-size: 14px;">${task.description.substring(0, 150)}...</p>
      <div style="margin-top: 15px; font-weight: 700;">
        <span style="margin-right: 20px;">Budget: $${task.amount}</span>
        <span>Due Date: ${new Date(task.dueDate).toLocaleDateString()}</span>
      </div>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/prime-console/${project._id}" class="button">View Task in Console</a>
    </div>

    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Task Assignment Notice");
  await sendEmail(freelancer.email, subject, html);
};

export const sendTaskCancelledFreelancerEmail = async (freelancer, project, task, cancellationData) => {
  const subject = `Task Cancelled: ${task.title}`;
  const content = `
    <h2 style="color: #ef4444; text-align: center;">Task Cancelled</h2>
    <p>Hello <strong>${freelancer.Fullname || "Expert"}</strong>,</p>
    <p>The client has cancelled the task <strong>"${task.title}"</strong> in project <strong class="highlight">${project.title}</strong>.</p>
    
    <div style="background-color: #fef2f2; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #fee2e2;">
      <p style="margin: 0; color: #991b1b;"><b>Cancellation Category:</b> ${cancellationData.cancellationCategory}</p>
      <p style="margin: 10px 0 0 0; color: #991b1b;"><b>Reason:</b> ${cancellationData.cancellationReason}</p>
    </div>

    <p>Please check your console for details on any partial payments or next steps.</p>
    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Task Cancellation Notice");
  await sendEmail(freelancer.email, subject, html);
};

export const sendTaskCancelledClientEmail = async (client, project, task) => {
  const subject = `Confirmation: Task Cancelled - ${task.title}`;
  const content = `
    <h2 style="color: #1e40af; text-align: center;">Task Cancelled</h2>
    <p>Hello <strong>${client.Fullname || "Client"}</strong>,</p>
    <p>This is to confirm that the task <strong>"${task.title}"</strong> has been successfully cancelled per your request.</p>
    
    <div style="background-color: #eff6ff; padding: 20px; border-radius: 10px; margin: 25px 0; text-align: center;">
      <p style="margin: 0; font-weight: 700;">The amount <span style="color: #2563eb;">$${task.amount}</span> has been refunded to your project budget.</p>
    </div>

    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Task Cancellation Confirmation");
  await sendEmail(client.email, subject, html);
};

export const sendTaskApprovedFreelancerEmail = async (freelancer, project, task, approvalData) => {
  const subject = `Payment Released: Task Approved! - ${task.title}`;
  const content = `
    <h2 style="color: #10b981; text-align: center;">Task Approved!</h2>
    <p>Hello <strong>${freelancer.Fullname || "Expert"}</strong>,</p>
    <p>Excellent work! Your task <strong>"${task.title}"</strong> has been approved and the payment has been released.</p>
    
    <div style="background-color: #f0fdf4; padding: 25px; border-radius: 12px; margin: 25px 0;">
      <p style="margin: 0;"><b>Earnings Released:</b> <span style="color: #059669; font-weight: 800;">$${task.amount}</span></p>
      <p style="margin: 10px 0 0 0;"><b>Client Feedback:</b> ${approvalData.rating}/5 Stars</p>
      <p style="font-style: italic; color: #4b5563; margin-top: 5px;">"${approvalData.review}"</p>
    </div>

    <p>Your wallet has been updated. Keep up the high standards!</p>
    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Payment Release Confirmation");
  await sendEmail(freelancer.email, subject, html);
};

export const sendTaskSubmittedClientEmail = async (client, project, freelancer, task) => {
  const subject = `Task Submitted for Review: ${task.title}`;
  const content = `
    <h2 style="color: #2563eb; text-align: center;">New Submission</h2>
    <p>Hello <strong>${client.Fullname || "Client"}</strong>,</p>
    <p>The task <strong>"${task.title}"</strong> has been submitted by <strong class="highlight">${freelancer.Fullname || freelancer.username}</strong> for your review.</p>
    
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 10px; margin: 25px 0; border: 1px solid #e5e7eb;">
      <p style="margin: 0;">Please review the work in your console. You can either approve the work to release payment or request a revision if updates are needed.</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/prime-console/${project._id}" class="button">Review Submission</a>
    </div>

    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Work Submission Notification");
  await sendEmail(client.email, subject, html);
};

export const sendTaskRevisionFreelancerEmail = async (freelancer, project, task) => {
  const subject = `Revision Requested: ${task.title}`;
  const content = `
    <h2 style="color: #f59e0b; text-align: center;">Revision Requested</h2>
    <p>Hello <strong>${freelancer.Fullname || "Expert"}</strong>,</p>
    <p>The client has requested a revision for the task <strong>"${task.title}"</strong> in project <strong class="highlight">${project.title}</strong>.</p>
    
    <div style="background-color: #fffbeb; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #fef3c7;">
      <p style="margin: 0; color: #92400e;">Please review the feedback in the Prime console and submit the updated work at your earliest convenience.</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/prime-console/${project._id}" class="button" style="background-color: #f59e0b;">View Revision Feedback</a>
    </div>

    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Revision Request Notice");
  await sendEmail(freelancer.email, subject, html);
};

export const sendWithdrawalPaidEmail = async (user, amount, transactionId) => {
  const subject = "Withdrawal Processed Successfully";
  const content = `
    <h2 style="color: #10b981; text-align: center;">Withdrawal Paid!</h2>
    <p>Dear <strong>${user.username || user.Fullname || "User"}</strong>,</p>
    <p>Your withdrawal request has been successfully processed and the funds have been released.</p>
    
    <div style="background-color: #f0fdf4; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #dcfce7;">
      <p><b>Amount Processed:</b> $${amount}</p>
      <p><b>Transaction ID:</b> ${transactionId}</p>
      <p><b>Status:</b> <span style="color: #059669; font-weight: 700;">Paid</span></p>
    </div>

    <p>The funds should reflect in your selected account within regular banking hours.</p>
    <p>Best regards,<br>The Fworkk Finance Team</p>
  `;

  const html = getEmailTemplate(content, "Withdrawal Confirmation");
  await sendEmail(user.email, subject, html);
};

export const sendWithdrawalRejectedEmail = async (user, amount, reason = "Policy compliance or incorrect details.") => {
  const subject = "Update Regarding Your Withdrawal Request";
  const content = `
    <h2 style="color: #ef4444; text-align: center;">Withdrawal Request Rejected</h2>
    <p>Dear <strong>${user.username || user.Fullname || "User"}</strong>,</p>
    <p>Unfortunately, your withdrawal request for <strong>$${amount}</strong> has been rejected.</p>
    
    <div style="background-color: #fef2f2; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #fee2e2;">
      <p style="color: #b91c1c;"><b>Reason:</b> ${reason}</p>
    </div>

    <p>The funds have been returned to your wallet. Please update your payment information or contact support to resolve this issue.</p>
    <p>Best regards,<br>The Fworkk Finance Team</p>
  `;

  const html = getEmailTemplate(content, "Withdrawal Status Update");
  await sendEmail(user.email, subject, html);
};

export const sendDeadlineReminderEmail = async (freelancer, project) => {
  const subject = `Urgent: Deadline Reminder - ${project.title}`;
  const content = `
    <h2 style="color: #ef4444; text-align: center;">Deadline Approaching</h2>
    <p>Hello <strong>${freelancer.Fullname || freelancer.username || 'Expert'}</strong>,</p>
    <p>This is a polite reminder that the deadline for project <strong class="highlight">${project.title}</strong> is <b>tomorrow</b>.</p>
    
    <div style="background-color: #fffbeb; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #f59e0b;">
      <p style="margin: 0; color: #92400e;"><b>Final Submission Date:</b> ${new Date(project.deadline).toLocaleDateString()}</p>
    </div>

    <p>Timely delivery is critical for maintaining your profile rating and ensuring smooth project completion.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" class="button">Submit Work Now</a>
    </div>

    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "Deadline Alert");
  await sendEmail(freelancer.email, subject, html);
};

export const sendNewProjectAlertEmail = async (user, project) => {
  const subject = `New Opportunity: ${project.title}`;
  const content = `
    <h2 style="color: #2563eb; text-align: center;">New Project for You!</h2>
    <p>Hello <strong>${user.Fullname || user.username}</strong>,</p>
    <p>A new project matching your expert profile has just been posted. Don't miss out on this opportunity!</p>
    
    <div style="background-color: #f8fafc; padding: 30px; border-radius: 15px; margin: 25px 0; border: 1px solid #e2e8f0;">
      <h3 style="margin-top: 0; color: #1e293b;">${project.title}</h3>
      <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">${project.description.length > 200 ? project.description.substring(0, 200) + '...' : project.description}</p>
      <div style="margin-top: 20px; font-weight: 700; color: #1e40af;">
        <span>Budget: $${project.budget}</span>
      </div>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/project/${project._id}" class="button">Apply for Project</a>
    </div>

    <p style="font-size: 13px; color: #64748b; text-align: center;">Applying early increases your chances of being shortlisted by 40%.</p>
    <p>Best regards,<br>The Fworkk Team</p>
  `;

  const html = getEmailTemplate(content, "New Project Notification");
  await sendEmail(user.email, subject, html);
};

export const sendReportSystemTestEmail = async (email) => {
  const subject = "System Verification: Email Service";
  const content = `
    <h2 style="color: #22c55e; text-align: center;">Test Successful</h2>
    <p>This is a verification email to confirm that the Fworkk notification system is fully operational.</p>
    <div style="background-color: #f9fafb; padding: 20px; border-radius: 10px; margin: 20px 0; font-family: monospace;">
      Verified on: ${new Date().toLocaleString()}
    </div>
  `;
  const html = getEmailTemplate(content, "System Test");
  await sendEmail(email, subject, html);
};

export const sendPasswordResetEmail = async (email, resetUrl) => {
  const subject = "Reset Your Password - Fworkk";
  const content = `
    <h2 style="color: #2563eb; text-align: center;">Password Reset</h2>
    <p>We received a request to reset your password. Click the button below to secure your account with a new password.</p>
    <div style="text-align: center; margin: 35px 0;">
      <a href="${resetUrl}" class="button">Reset Password</a>
    </div>
    <p>This link will expire in 15 minutes. If you did not request this, please ignore this email.</p>
    <p>Best regards,<br>The Fworkk Security Team</p>
  `;
  const html = getEmailTemplate(content, "Security Notification");
  await sendEmail(email, subject, html);
};

export const sendInappropriateApplicationDeletionEmail = async (applicant, project) => {
  const subject = "Update Regarding Your Application";
  const content = `
    <h2 style="color: #ef4444; text-align: center;">Application Removed</h2>
    <p>Dear <strong>${applicant.username || "User"}</strong>,</p>
    <p>Your application for project <strong class="highlight">${project.title}</strong> has been removed by our administration team.</p>
    <div style="background-color: #fef2f2; padding: 25px; border-radius: 12px; margin: 25px 0; border: 1px solid #fee2e2;">
      <p style="color: #991b1b; margin: 0;"><b>Reason:</b> Your application was found to violate our community guidelines regarding professional conduct and wording.</p>
    </div>
    <p>Please review our terms of service before submitting future applications to avoid account suspension.</p>
  `;
  const html = getEmailTemplate(content, "Compliance Notice");
  await sendEmail(applicant.email, subject, html);
};
