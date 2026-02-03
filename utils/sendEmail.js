// import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import axios from 'axios';
// import dns from 'dns';

// // Force IPv4 for Zoho compatibility
// if (dns.setDefaultResultOrder) {
//   dns.setDefaultResultOrder("ipv4first");
// }

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// MailerSend Configuration
const MAILERSEND_API_KEY = process.env.MAILERSENDER_API_KEY;
const MAILERSEND_ENDPOINT = "https://api.mailersend.com/v1/email";

const sendEmail = async (options) => {
  // Log env vars status (for debugging)
  const envVars = {
    EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.zoho.com',
    EMAIL_PORT: process.env.EMAIL_PORT,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS ? '****' : undefined,
    EMAIL_SECURE: process.env.EMAIL_SECURE
  };

  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("❌ Email Error: Missing environment variables.");
    console.error("Required: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS");
    throw new Error("Email configuration missing. Check server/.env file.");
  }

  try {
    if (!resend) {
      console.warn("ℹ️ Resend API Key is missing, skipping to fallback...");
      throw new Error("Resend API Key is missing");
    }
    /*
    // OLD NODEMAILER LOGIC (Commented out as requested)
    const host = (process.env.EMAIL_HOST || "smtp.zoho.com").trim();
    const port = parseInt(process.env.EMAIL_PORT) || 465;
    const secure = process.env.EMAIL_SECURE === 'true' || port === 465;

    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: secure,
      auth: {
        user: process.env.EMAIL_USER.trim(),
        pass: process.env.EMAIL_PASS.trim(),
      },
      tls: {
        rejectUnauthorized: false,
        serverName: host,
        minVersion: 'TLSv1.2'
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    const info = await transporter.sendMail(message);
    console.log('✅ Email sent: %s', info.messageId);
    return info;
    */

    // NEW RESEND LOGIC
    console.log(`🔄 Sending email via Resend API to ${options.email}...`);
    const resendResult = await resend.emails.send({
      from: `${process.env.FROM_NAME || 'Fworkk'} <${process.env.EMAIL_USER || 'onboarding@resend.dev'}>`,
      to: options.email,
      subject: options.subject,
      html: options.message,
    });

    if (resendResult.error) {
      throw new Error(resendResult.error.message);
    }

    console.log(`✅ Email sent successfully to ${options.email} via Resend`);
    return resendResult;

  } catch (error) {
    console.error(`❌ Email utility failed with Resend: ${error.message}`);
    
    // FALLBACK TO MAILERSEND
    if (MAILERSEND_API_KEY) {
      console.log(`🔄 Attempting [Utility] fallback via MailerSend for ${options.email}...`);
      try {
        const response = await axios.post(
          MAILERSEND_ENDPOINT,
          {
            from: {
              email: process.env.EMAIL_NOREPLY || "noreply@betpro2u.online",
              name: process.env.FROM_NAME || "Fworkk",
            },
            to: [
              {
                email: options.email,
              },
            ],
            subject: options.subject,
            html: options.message,
          },
          {
            headers: {
              Authorization: `Bearer ${MAILERSEND_API_KEY}`,
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
            },
          }
        );

        console.log(`✅ Email sent successfully to ${options.email} via MailerSend Fallback`);
        return response.data;
      } catch (mailerSendErr) {
        console.error(`❌ MailerSend Fallback failed:`, mailerSendErr.response?.data || mailerSendErr.message);
        
        // FINAL FALLBACK TO SENDGRID
        if (process.env.SENDGRID_API_KEY) {
          console.log(`🔄 Attempting [Utility] final fallback via SendGrid for ${options.email}...`);
          try {
            const sgResponse = await axios.post(
              "https://api.sendgrid.com/v3/mail/send",
              {
                personalizations: [{ to: [{ email: options.email }], subject: options.subject }],
                from: { 
                  email: process.env.EMAIL_NOREPLY || "noreply@betpro2u.online", 
                  name: process.env.FROM_NAME || "Fworkk" 
                },
                content: [{ type: "text/html", value: options.message }],
              },
              {
                headers: {
                  Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
                  "Content-Type": "application/json",
                },
              }
            );
            console.log(`✅ Email sent successfully to ${options.email} via SendGrid Final Fallback`);
            return sgResponse.data;
          } catch (sendGridErr) {
            console.error(`❌ SendGrid Final Fallback failed:`, sendGridErr.response?.data || sendGridErr.message);
            throw new Error(`Email failed all providers: Resend (${error.message}), MailerSend (${mailerSendErr.message}), SendGrid (${sendGridErr.message})`);
          }
        }
        
        throw new Error(`Email failed: Resend (${error.message}) & MailerSend (${mailerSendErr.message})`);
      }
    }

    throw error;
  }
};

export default sendEmail;
