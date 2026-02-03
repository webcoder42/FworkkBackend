import UserModel from "../Model/UserModel.js";
import { redisClient } from "../server.js";
import { sendEmail } from "../services/EmailService.js";
import axios from "axios";
import ReceivedEmail from "../Model/ReceivedEmailModel.js";
import EmailSender from "../Model/EmailSenderModel.js";

// Get all users for marketing (id, name, email only)

export const getMarketingUsers = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admins can access marketing users",
      });
    }

    const cacheKey = "marketing-users";
    
    // Check Redis cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    // Fetch minimal fields
    const users = await UserModel.find({}, "Fullname email username UserType role");

    // Save to Redis (short TTL as users might register key)
    await redisClient.set(cacheKey, JSON.stringify(users), { EX: 60 });

    return res.status(200).json({
      success: true, 
      count: users.length, 
      users
    });
  } catch (error) {
    console.error("Get marketing users error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Send marketing email
export const sendMarketingEmail = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { subject, message, recipientEmails, sendToAll } = req.body;

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Subject and message are required",
      });
    }

    let targets = [];

    if (sendToAll) {
      const allUsers = await UserModel.find({}, "email");
      targets = allUsers.map(u => u.email);
    } else {
      if (!recipientEmails || !Array.isArray(recipientEmails) || recipientEmails.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No recipients selected",
        });
      }
      targets = recipientEmails;
    }

    // Helper delay function
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Helper to strip HTML for text version
    const stripHtml = (html) => html.replace(/<[^>]*>?/gm, '');

    // Send emails in background
    console.log(`Starting bulk email send to ${targets.length} recipients. Subject: ${subject}`);
    
    // Process in chunks or just fire and forget loop
    const sendLoop = async () => {
        let successCount = 0;
        let failCount = 0;
        
        // Wrap content in proper email template for better deliverability
        const wrapInEmailTemplate = (content, subjectLine) => {
          return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>${subjectLine}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Fworkk</h1>
              <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 14px;">Professional Freelancing Platform</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 30px; color: #333333; font-size: 16px; line-height: 1.6;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <div style="margin-bottom: 15px;">
                <a href="#" style="color: #6366f1; text-decoration: none; margin: 0 10px; font-size: 13px;">Privacy Policy</a>
                <a href="#" style="color: #6366f1; text-decoration: none; margin: 0 10px; font-size: 13px;">Terms of Service</a>
                <a href="#" style="color: #6366f1; text-decoration: none; margin: 0 10px; font-size: 13px;">Support</a>
              </div>
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px; line-height: 1.5;">
                Fworkk Ltd. • Professional Freelancing Platform<br>
                Connecting Global Talent with Business Opportunities
              </p>
              <p style="margin: 15px 0 0 0; color: #9ca3af; font-size: 11px;">
                You received this email because you are a registered member of Fworkk.<br>
                <a href="mailto:unsubscribe@fworkk.com?subject=Unsubscribe" style="color: #8b5cf6; text-decoration: underline;">Unsubscribe from these emails</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
        };

        const wrappedMessage = wrapInEmailTemplate(message, subject);
        const textVersion = stripHtml(message);

        console.log(`📧 Email Template Applied. Total Length: ${wrappedMessage.length} chars`);

        // Create a log entry for this bulk send
        let logEntry;
        try {
            logEntry = await EmailSender.create({
                EmailContentDetail: {
                    gmailCompanyName: "Fworkk Marketing",
                    ownerName: "Admin",
                    emailAddress: process.env.EMAIL_USER || "marketing@fworkk.com"
                },
                SendingEmail: [],
                AllTemplates: [{
                    templateName: `Bulk Send: ${subject}`,
                    subject: subject,
                    content: [{ type: "paragraph", value: message }]
                }]
            });
        } catch (logErr) {
            console.warn("⚠️ Failed to create EmailSender log entry:", logErr.message);
        }

        // Process in chunks of 5 for better speed without hitting SMTP limits too hard
        const CHUNK_SIZE = 5;
        for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
            const chunk = targets.slice(i, i + CHUNK_SIZE);
            console.log(`📦 Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1} (${chunk.length} emails)...`);
            
            await Promise.all(chunk.map(async (email) => {
                try {
                    // Slight jitter to avoid exact simultaneous hits
                    await sleep(Math.floor(Math.random() * 2000));

                    const targetUser = await UserModel.findOne({ email }, "_id");

                    const sendResult = await sendEmail(email, subject, wrappedMessage, textVersion, {
                        replyTo: process.env.EMAIL_USER || "support@betpro2u.online",
                        headers: {
                            "List-Unsubscribe": `<mailto:unsubscribe@betpro2u.online?subject=unsubscribe-${email}>`
                        }
                    });
                    
                    successCount++;
                    console.log(`✅ [${sendResult.provider}] Sent to ${email} (${successCount}/${targets.length})`);

                    if (logEntry) {
                        await EmailSender.findByIdAndUpdate(logEntry._id, {
                            $push: {
                                SendingEmail: {
                                    recipient: targetUser ? targetUser._id : null,
                                    sentAt: new Date(),
                                    templateName: `Bulk Send: ${subject}`
                                }
                            }
                        });
                    }
                } catch (err) {
                    console.error(`❌ Global Error for ${email}:`, err.message);
                    failCount++;
                }
            }));

            // Pause slightly between chunks
            await sleep(1000);
        }
        console.log(`📊 Bulk complete. Success: ${successCount}, Fail: ${failCount}`);
    };
    
    // Execute asynchronously
    sendLoop();

    return res.status(200).json({
      success: true,
      message: `Email sending initiated for ${targets.length} recipients. It may take a few minutes to complete.`,
    });

  } catch (error) {
    console.error("Send marketing email error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Generate AI email content using Groq API
export const generateEmailContent = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { subject, type = "marketing" } = req.body;

    if (!subject) {
      return res.status(400).json({
        success: false,
        message: "Subject is required for content generation",
      });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "AI service not configured. GROQ_API_KEY missing.",
      });
    }

    const prompt = `You are an expert email copywriter for "Fworkk", a professional freelancing platform.

Generate a professional, engaging ${type} email based on the following subject: "${subject}"

Requirements:
1. Write in HTML format with inline CSS styles
2. Use a clean, modern email design
3. Include:
   - A catchy H1 heading with the main message (use indigo/purple colors like #6366f1)
   - A warm greeting paragraph
   - 2-3 engaging paragraphs explaining the topic/offer
   - A bullet list with key points/benefits if applicable
   - A clear call-to-action
   - A professional sign-off from "The Fworkk Team"
4. Use these style guidelines:
   - H1: color: #6366f1; font-size: 28px; margin: 16px 0;
   - H2: color: #a5b4fc; font-size: 22px; margin: 14px 0;
   - H3: color: #c7d2fe; font-size: 18px; margin: 12px 0;
   - Paragraphs: margin: 10px 0; line-height: 1.6;
   - Use <strong> for emphasis
   - Lists: margin: 10px 0; padding-left: 20px;
5. Keep it professional but friendly
6. Total length: 150-250 words

Return ONLY the HTML content, no additional text or explanation.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "You are an expert email copywriter. You write professional, engaging marketing emails in HTML format with inline CSS. Always respond with just the HTML content."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Groq API Error:", errorData);
      return res.status(500).json({
        success: false,
        message: "Failed to generate content from AI"
      });
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content;

    if (!content) {
      return res.status(500).json({
        success: false,
        message: "No response from AI"
      });
    }

    // Clean up the response - remove markdown code blocks if present
    content = content.trim();
    if (content.startsWith("```html")) {
      content = content.slice(7);
    }
    if (content.startsWith("```")) {
      content = content.slice(3);
    }
    if (content.endsWith("```")) {
      content = content.slice(0, -3);
    }
    content = content.trim();

    return res.status(200).json({
      success: true,
      content: content
    });

  } catch (error) {
    console.error("Generate email content error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate content",
      error: error.message,
    });
  }
};

// Handle Resend Inbound Webhook (Replies)
export const handleResendInbound = async (req, res) => {
  try {
    const { from, to, subject, text, html, createdAt } = req.body;
    
    const newMail = new ReceivedEmail({
      from,
      to: Array.isArray(to) ? to[0] : to,
      subject,
      text,
      html,
      receivedAt: createdAt || new Date(),
    });

    await newMail.save();
    console.log(`📩 New reply received from ${from}`);
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook Error:", error.message);
    return res.status(500).send("Webhook process failed");
  }
};

// Get all email logs (Sent + Received directly from Resend)
export const getEmailLogs = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID?.trim();
    const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET?.trim();
    const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN?.trim();
    const ZOHO_ACCOUNT_ID = process.env.ZOHO_ACCOUNT_ID?.trim();
    const ZOHO_USER = process.env.ZOHO_USER?.trim() || 'bizy@bioopay.online';

    let allSent = [];
    let allReceived = [];
    let zohoError = null;

    // 1. Fetch from Resend API (Sent and Received)
    if (RESEND_API_KEY) {
      try {
        const sentResponse = await axios.get("https://api.resend.com/emails", {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        });
        allSent = [...allSent, ...(sentResponse.data.data || [])];

        const receivedResponse = await axios.get("https://api.resend.com/emails/receiving", {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        }).catch(() => ({ data: { data: [] } }));
        
        allReceived = [...allReceived, ...(receivedResponse.data.data || [])];
      } catch (err) {
        console.warn("Resend fetch error:", err.message);
      }
    }

    // 2. Fetch from Zoho Mail API (OAuth2)
    if (ZOHO_CLIENT_ID && ZOHO_CLIENT_SECRET && ZOHO_REFRESH_TOKEN && ZOHO_ACCOUNT_ID) {
      try {
        // A. Get new Access Token using Refresh Token
        const tokenParams = new URLSearchParams();
        tokenParams.append('refresh_token', ZOHO_REFRESH_TOKEN);
        tokenParams.append('client_id', ZOHO_CLIENT_ID);
        tokenParams.append('client_secret', ZOHO_CLIENT_SECRET);
        tokenParams.append('grant_type', 'refresh_token');

        const tokenRes = await axios.post('https://accounts.zoho.com/oauth/v2/token', tokenParams);
        const accessToken = tokenRes.data.access_token;

        if (accessToken) {
          try {
            let folders = [];
            let inboxId = null;
            let sentId = null;

            // 1. Try to fetch folders (might fail if scope is missing)
            try {
              const foldersRes = await axios.get(`https://mail.zoho.com/api/accounts/${ZOHO_ACCOUNT_ID}/folders`, {
                headers: { Authorization: `Bearer ${accessToken}` }
              });
              folders = foldersRes.data.data || [];
              const inboxFolder = folders.find(f => f.folderName.toLowerCase().includes('inbox'));
              const sentFolder = folders.find(f => f.folderName.toLowerCase().includes('sent'));
              inboxId = inboxFolder?.folderId;
              sentId = sentFolder?.folderId;
            } catch (folderErr) {
              console.warn("⚠️ Zoho Folder Scope Missing. Falling back to default view.");
              // If folder scope fails, we keep IDs as null to use fallback fetch
            }

            // 2. Fetch Mails
            const fetchMails = async (folderId, type) => {
              try {
                const res = await axios.get(`https://mail.zoho.com/api/accounts/${ZOHO_ACCOUNT_ID}/messages/view`, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                  params: folderId ? { folderId } : {}
                });
                
                if (res.data && res.data.data) {
                  return res.data.data.map(m => ({
                    id: m.messageId,
                    sender: m.sender || m.fromAddress || (type === 'sent' ? 'Me' : "Zoho User"),
                    email: m.sender || m.fromAddress,
                    subject: m.subject || "(No Subject)",
                    created_at: m.receivedTime || m.sentTime || new Date(),
                    snippet: m.summary || "Zoho Mail Content",
                    content: m.content || m.summary || "No content available",
                    type: type,
                    provider: 'zoho'
                  }));
                }
              } catch (e) { console.warn(`Fetch ${type} failed:`, e.message); }
              return [];
            };

            // 3. Search Fallback for Sent Mails (If folder scope missing)
            const searchSentMails = async () => {
              try {
                const query = encodeURIComponent(`(from:${ZOHO_USER})`);
                const searchRes = await axios.get(`https://mail.zoho.com/api/accounts/${ZOHO_ACCOUNT_ID}/messages/search?searchCondition=${query}`, {
                  headers: { Authorization: `Bearer ${accessToken}` }
                });
                
                if (searchRes.data && searchRes.data.data) {
                    return searchRes.data.data.map(m => ({
                        id: m.messageId,
                        sender: "Me",
                        email: ZOHO_USER || 'bizy@bioopay.online',
                        subject: m.subject || "(No Subject)",
                        created_at: m.sentTime || m.receivedTime || new Date(),
                        snippet: m.summary || "Sent Mail",
                        content: m.content || m.summary || "No content available",
                        type: 'sent',
                        provider: 'zoho'
                    }));
                }
              } catch (e) { 
                console.error("❌ Zoho Search Failed Detail:", e.response?.data || e.message);
              }
              return [];
            };

            if (inboxId || sentId) {
                const inboxMails = await fetchMails(inboxId, 'inbox');
                const sentMails = await fetchMails(sentId, 'sent');
                allReceived = [...allReceived, ...inboxMails, ...sentMails];
            } else {
                const inboxMails = await fetchMails(null, 'inbox');
                const sentMails = await searchSentMails();
                allReceived = [...allReceived, ...inboxMails, ...sentMails];
            }
            
            console.log(`✅ Final Zoho Sync: ${allReceived.filter(m => m.type === 'inbox').length} Inbox, ${allReceived.filter(m => m.type === 'sent').length} Sent`);

          } catch (fetchErr) {
             console.error("Zoho Main Fetch Error:", fetchErr.response?.data || fetchErr.message);
             zohoError = { 
               message: fetchErr.response?.data?.errorCode === 'INVALID_OAUTHSCOPE' 
                 ? "Zoho Scope Missing: Please add 'ZohoMail.folders.READ' to your OAuth scopes to see Sent mails."
                 : fetchErr.response?.data?.msg || fetchErr.message,
               code: fetchErr.response?.data?.errorCode || "FETCH_ERROR"
             };
          }
        } else {
          zohoError = { message: "Failed to obtain Zoho Access Token. Please check your Refresh Token.", code: "AUTH_FAIL" };
        }
      } catch (tokenErr) {
        console.error("Zoho OAuth2 Token Error:", tokenErr.message);
        zohoError = { message: "OAuth Token Refresh Failed", code: "TOKEN_FAIL", details: tokenErr.message };
      }
    } else {
      zohoError = { message: "Zoho API Configuration missing in .env (Check CLIENT_ID, SECRET, REFRESH_TOKEN, ACCOUNT_ID)", code: "CONFIG_MISSING" };
    }

    // 3. Fetch from local DB (Webhook storage)
    const localReceived = await ReceivedEmail.find().sort({ receivedAt: -1 }).limit(100);

    return res.status(200).json({
      success: true,
      sent: allSent,
      received: allReceived,
      local: localReceived || [],
      zohoStatus: {
        count: allReceived.filter(m => m.provider === 'zoho').length,
        error: zohoError
      }
    });
  } catch (error) {
    console.error("Get email logs error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch email logs",
      error: error.message,
    });
  }
};

// Get detailed sent email content from Resend
export const getSentEmailDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      return res.status(500).json({ success: false, message: "Resend API Key is missing" });
    }

    const response = await axios.get(`https://api.resend.com/emails/${id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });

    return res.status(200).json({
      success: true,
      email: response.data,
    });
  } catch (error) {
    console.error("Get sent email detail error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch sent email details" });
  }
};

// Get detailed received email content from Resend
export const getReceivedEmailDetail = async (req, res) => {
// ... existing code ...
  try {
    const { id } = req.params;
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      return res.status(500).json({ success: false, message: "Resend API Key is missing" });
    }

    // Call Resend Receiving Detail API
    const response = await axios.get(`https://api.resend.com/emails/receiving/${id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });

    return res.status(200).json({
      success: true,
      email: response.data,
    });
  } catch (error) {
    console.error("Get received email detail error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch email details",
    });
  }
};

