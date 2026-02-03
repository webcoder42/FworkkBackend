import axios from "axios";
import SiteSettings from "../Model/SiteSettingsModel.js";
import ChatBotModel from "../Model/ChatBotModel.js";
import PaymentAccount from "../Model/PayOutModel.js";
import ReportModel from "../Model/ReportModel.js";
import FworkkPrimeRequest from "../Model/FworkkPrimeModel.js";
import UserModel from "../Model/UserModel.js";
import PostProjectModel from "../Model/PostProjectModel.js";
import ProjectMarketplace from "../Model/ProjectMarketplaceModel.js";
import SubmitProjectModel from "../Model/SubmitProjectModel.js";
import {
  searchKnowledgeBase,
  getFworkkInfo,
  FworkkKnowledgeBase,
} from "../Helper/FworkkKnowledgeBase.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import OpenAI from "openai";
import { fileURLToPath } from "url";
import { Groq } from "groq-sdk";
import multer from "multer";
import { exec } from "child_process";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
export const upload = multer({ storage });

// Helper to handle real-time platform data queries
const getPlatformDataQuery = async (message, userId, username) => {
    const msg = message.toLowerCase();
    
    // Construct dynamic dashboard URL base
    // Use the userId from the request, or if missing, try to find a fallback (though middleware should ensure it)
    const dashboardBase = userId ? `/B/${userId}/dashboard` : "";
    
    const isNavigational = msg.includes('where') || msg.includes('url') || msg.includes('link') || msg.includes('page') || msg.includes('go to') || msg.includes('open') || msg.includes('show');

    // 0. Comprehensive Navigation Map
    // This handles "Where is X", "Open X", "Link for X" for all main features
    if (isNavigational) {
        const navMap = [
            { id: 'dashboard', keywords: ['dashboard', 'home'], path: '/freelancer', label: 'Dashboard' },
            { id: 'profile', keywords: ['profile', 'account', 'bio'], path: '/client/profile', label: 'User Profile' },
            { id: 'messages', keywords: ['message', 'inbox', 'chat', 'dm'], path: '/client/message', label: 'Messages' },
            { id: 'proposals', keywords: ['proposal', 'bids', 'applications'], path: '/client/proposal', label: 'My Proposals' },
            { id: 'workspace', keywords: ['workspace', 'team', 'hub', 'collaborate'], path: '/client/teamhub', label: 'Team Workspace' },
            { id: 'billing', keywords: ['billing', 'fund', 'deposit', 'money', 'plan', 'payment'], path: '/client/billing', label: 'Billing & Plans' },
            { id: 'settings', keywords: ['setting', 'config', 'preference'], path: '/client/setting', label: 'Settings' },
            { id: 'hire', keywords: ['hire', 'hire project'], path: '/client/hireproject', label: 'Hire Projects' },
            { id: 'quiz', keywords: ['quiz', 'test', 'skill', 'exam'], path: '/client/quiz', label: 'Skill Quiz' },
            { id: 'find_jobs', keywords: ['find job', 'search job', 'browse job', 'find project', 'work'], path: '/client/findproject', label: 'Find Jobs' },
            { id: 'marketplace', keywords: ['buy project', 'market', 'store'], path: '/client/buyproject', label: 'Project Marketplace' },
            { id: 'sell', keywords: ['sell project'], path: '/client/projectsell', label: 'Sell Project' },
            { id: 'prime', keywords: ['prime', 'fworkk prime'], path: '/client/fwork-prime', label: 'Fworkk Prime' },
            { id: 'withdrawal', keywords: ['withdrawal', 'cashout', 'payout'], path: '/client/withdrawal-request', label: 'Withdrawal Request' }
        ];

        for (const item of navMap) {
            // Check if ANY keyword matches
            if (item.keywords.some(k => msg.includes(k))) {
                // Special case: "minimum withdrawal" should fall through to the specific logic below
                if (item.id === 'withdrawal' && msg.includes('minimum')) continue;

                return `You can access your ${item.label} here:\n[Go to ${item.label}](${dashboardBase}${item.path})`;
            }
        }
    }

    // 1. Minimum Withdrawal & Cashout Navigation (Fallback/Specifics)
    if (msg.includes('withdrawal') || msg.includes('cashout') || msg.includes('withdraw')) {
        // Since generic navigation is handled above, this catches specific "minimum" queries
        if (msg.includes('minimum')) {
            const settings = await SiteSettings.findOne();
            const amount = settings?.minimumCashoutAmount || 500;
            return `The current minimum withdrawal amount is $${amount}. You can request a cashout here:\n[Withdrawal Page](${dashboardBase}/client/withdrawal-request)`;
        }
    }

    // 2. Tax Details
    if (msg.includes('tax')) {
        const settings = await SiteSettings.findOne();
        if (!settings) return "I couldn't retrieve the tax settings at the moment. Please try again later.";
        
        let reply = "";
        if (msg.includes('post project')) reply = `For posting a project, the tax rate is ${settings.postProjectTax}%.`;
        else if (msg.includes('add fund')) reply = `When adding funds, a tax of ${settings.addFundTax}% applies.`;
        else if (msg.includes('task') || msg.includes('completion')) reply = `Task completion tax is ${settings.taskCompletionTax}%.`;
        else if (msg.includes('cashout') || msg.includes('withdrawal')) reply = `The withdrawal tax fee is ${settings.cashoutTax}%.`;
        else reply = `Here are the current tax details:\n\n• Cashout Tax: ${settings.cashoutTax}%\n• Post Project Tax: ${settings.postProjectTax}%\n• Add Fund Tax: ${settings.addFundTax}%\n• Task Completion Tax: ${settings.taskCompletionTax}%`;
        
        return reply + `\n\nYou can view more in your [Settings](${dashboardBase}/client/setting).`;
    }

    // 3. Contact/Social
    if (msg.includes('social') || msg.includes('contact') || (msg.includes('link') && (msg.includes('facebook') || msg.includes('twitter'))) || msg.includes('footer') || msg.includes('support email')) {
        const settings = await SiteSettings.findOne();
        if (!settings) return "Contact details are currently unavailable.";

        // If specific link asked
        if (msg.includes('facebook') && settings.facebookLink) return `You can follow us on Facebook here: ${settings.facebookLink}`;
        if (msg.includes('twitter') && settings.twitterLink) return `Follow our updates on Twitter: ${settings.twitterLink}`;
        if (msg.includes('instagram') && settings.instagramLink) return `Check out our Instagram: ${settings.instagramLink}`;
        if (msg.includes('email') && settings.contactEmail) return `You can reach our support team at: ${settings.contactEmail}`;

        // General
        return `Here are our contact details and social links:\n\n📧 Email: ${settings.contactEmail}\n\nSocial Media:\n• Facebook: ${settings.facebookLink || 'N/A'}\n• Twitter: ${settings.twitterLink || 'N/A'}\n• Instagram: ${settings.instagramLink || 'N/A'}\n\n${settings.footerText}\n\nYou can also visit our [Contact Us Page](/contact-us).`;
    }

    // 4. User Earnings & Stats
    if (msg.includes('earning') || msg.includes('balance') || msg.includes('profit') || msg.includes('security question')) {
        if (!userId) return "Please login to view your earnings and account stats.";
        
        const user = await UserModel.findById(userId);
        if (!user) return "User account not found.";

        if (msg.includes('earning') || msg.includes('balance') || msg.includes('profit')) {
           return `Your current total earnings are $${user.totalEarnings.toFixed(2)}. You can view detailed stats on your dashboard:\n[Go to Dashboard](${dashboardBase}/freelancer)`;
        }
        
        if (msg.includes('security question')) {
            const hasSecurity = user.securityQuestion && user.securityAnswer;
            const status = hasSecurity 
                ? "Your security question is set up. For security reasons, I cannot reveal the answer here."
                : "You haven't set up a security question yet.";
            
            return `${status} You can manage your security settings here:\n[Security Settings](${dashboardBase}/client/setting)`;
        }
    }

    // 5. Cashout Management (User Specific)
    // Now handled partially in section 1, but this captures specific status checks
    if ((msg.includes('withdrawal') || msg.includes('cashout')) && (msg.includes('my') || msg.includes('total') || msg.includes('status') || msg.includes('pending') || msg.includes('amount') || msg.includes('latest'))) {
        if (!userId) return "Please login to view your specific withdrawal information.";
        
        const account = await PaymentAccount.findOne({ user: userId });
        
        if (!account) return `It looks like you haven't set up a payment account or made any withdrawals yet. You can do so here:\n[Withdrawal Page](${dashboardBase}/client/withdrawal-request)`;

        const withdrawals = account.totalWithdrawals || [];
        const pending = withdrawals.filter(w => w.status === 'pending').length;
        const totalAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);
        
        let response = `Here is your Cashout Summary:\n\n• Total Earning Withdrawn: $${totalAmount.toFixed(2)}\n• Pending Requests: ${pending}\n• Total Requests: ${withdrawals.length}\n`;
        
        const pendingRequests = withdrawals.filter(w => w.status === 'pending');
         if (pendingRequests.length > 0) {
             response += `\nYou have ${pendingRequests.length} pending request(s). The latest one was requested on ${new Date(pendingRequests[0].requestedAt).toLocaleDateString()}.`;
         } else {
             response += `\nYou check your recent withdrawal history here:\n[Withdrawal Page](${dashboardBase}/client/withdrawal-request)`;
         }

        return response;
    }

    // 6. Project/Job Search
    // "where can i find jobs"
    if ((msg.includes('job') || msg.includes('project')) && (msg.includes('find') || msg.includes('search') || msg.includes('work'))) {
        if (isNavigational) {
             return `You can browse and apply for jobs on the Find Project page:\n[Browse Jobs](${dashboardBase}/client/findproject)`;
        }
    }

    if ((msg.includes('job') || msg.includes('project')) && (msg.includes('latest') || msg.includes('match') || msg.includes('skill'))) {
         let query = { status: 'open' };
         let searchMsg = "";

         if (userId && (msg.includes('skill') || msg.includes('match'))) {
             const user = await UserModel.findById(userId);
             if (user && user.skills && user.skills.length > 0) {
                 const skillNames = user.skills.map(s => s.name);
                 query.skillsRequired = { $in: skillNames };
                 searchMsg = "matching your skills";
             } else {
                 searchMsg = "latest";
             }
         } else {
              searchMsg = "latest";
         }
         
         const jobs = await PostProjectModel.find(query).sort({ createdAt: -1 }).limit(3);
         
         if (jobs.length > 0) {
             let response = `Here are some ${searchMsg} jobs available:\n`;
             jobs.forEach((job, index) => {
                 response += `\n${index + 1}. **${job.title}**\n   Budget: $${job.budget}\n   Category: ${job.category}\n`;
             });
             response += `\nYou can view more details and apply here: [Find Jobs](${dashboardBase}/client/findproject)`;
             return response;
         } else {
             return `I couldn't find any ${searchMsg} jobs right now. You can browse all available jobs here:\n[Find Jobs](${dashboardBase}/client/findproject)`;
         }
    }

    // 7. Project Marketplace Search
    if (msg.includes('marketplace') || msg.includes('buy project') || msg.includes('sell project') || (msg.includes('project') && msg.includes('sale'))) {
        if (isNavigational && msg.includes('sell')) {
            return `You can sell your projects here: [Sell Project](${dashboardBase}/client/projectsell)`;
        }
        if (isNavigational && (msg.includes('buy') || msg.includes('marketplace'))) {
            return `You can browse the Project Marketplace here: [Project Marketplace](${dashboardBase}/client/buyproject)`;
        }

        const projects = await ProjectMarketplace.find({ status: 'published', isActive: true })
            .sort({ createdAt: -1 })
            .limit(3);
            
        if (projects.length > 0) {
            let response = `Check out these projects currently for sale in the Marketplace:\n`;
            projects.forEach((p, index) => {
                response += `\n${index + 1}. **${p.title}**\n   Price: $${p.price}\n   Category: ${p.category}\n`;
            });
            response += `\nSee more in the [Marketplace](${dashboardBase}/client/buyproject)`;
            return response;
        } else {
            return `There are currently no projects listed for sale. You can visit the marketplace here: [Project Marketplace](${dashboardBase}/client/buyproject)`;
        }
    }

    // 8. Fworkk Prime Requests
    if (msg.includes('prime') || (msg.includes('fworkk') && msg.includes('request'))) {
         if (isNavigational) {
             return `You can access Fworkk Prime here: [Fworkk Prime](${dashboardBase}/client/fwork-prime)`;
         }

         if (!userId) return "Please login to view your Fworkk Prime requests.";
         
         const clientRequests = await FworkkPrimeRequest.find({ clientId: userId }).sort({ createdAt: -1 }).limit(3);
         
         if (clientRequests.length > 0) {
             let response = `Here are your recent Fworkk Prime requests:\n`;
             clientRequests.forEach(req => {
                 response += `\n• **${req.title}**\n  Status: ${req.status}\n  Team Size: ${req.teamSize}\n  Budget: $${req.budget}\n`;
             });
             response += `\nYou can view the full console here: [Fworkk Prime](${dashboardBase}/client/fwork-prime)`;
             return response;
         } else {
             return `You don't have any active Fworkk Prime requests. Fworkk Prime allows you to hire a managed team for your projects. Learn more here: [Fworkk Prime](${dashboardBase}/client/fwork-prime)`;
         }
    }

    // 9. Report Management
    if (msg.includes('report') || msg.includes('complain')) {
        if (isNavigational || msg.includes('where')) {
             return "To file a report, you should visit the specific User's Profile or the Project Page you have an issue with. You can also contact support directly here: [Contact Us](/contact-us)";
        }
        
        if (!userId) return "Please login to manage or view reports.";
        
        const myReports = await ReportModel.find({ reporter: userId }).sort({ createdAt: -1 }).limit(1);
        const againstMe = await ReportModel.find({ reportedUser: userId }).sort({ createdAt: -1 }).limit(1);
        
        let response = "";
        
        if (myReports.length > 0) {
            response += `You submitted a report recently regarding "${myReports[0].title}". Current status: ${myReports[0].status}.\n`;
        } 
        
        if (againstMe.length > 0) {
             response += `Note: There is a report filed related to your account interactions.\n`;
        }
        
        if (!response) response = "You have no active reports filed by you or against you. If you need to file a complaint, please use the 'Report' button on the user's profile.";
        
        return response + `\n\nFor general inquiries, visit: [Contact Us](/contact-us)`;
    }
    
    return null;
}

// Enhanced fee calculation helper
const calculateFees = (message) => {
  // Detect deposit amounts
  const depositMatch = message.match(/(deposit|deposited|added)\s*(\$?)(\d+)/i);
  if (depositMatch) {
    const amount = parseInt(depositMatch[3]);
    const fee = amount * 0.1;
    const received = amount - fee;
    return {
      reply: `💸 Deposit Calculation:\n\nYou deposited: $${amount}\n10% fee: $${fee.toFixed(
        2
      )}\nAmount added to balance: $${received.toFixed(
        2
      )}\n\nℹ️ Standard deposit fee is 10%`,
      isFinancial: true,
    };
  }

  // Detect cashout amounts
  const cashoutMatch = message.match(
    /(cashout|cash\s*out|withdraw)\s*(\$?)(\d+)/i
  );
  if (cashoutMatch) {
    const amount = parseInt(cashoutMatch[3]);
    const fee = amount * 0.15;
    const received = amount - fee;
    return {
      reply: `💰 Cashout Calculation:\n\nYou requested: $${amount}\n15% fee: $${fee.toFixed(
        2
      )}\nAmount you'll receive: $${received.toFixed(
        2
      )}\n\nℹ️ Standard cashout fee is 15%`,
      isFinancial: true,
    };
  }

  // General fee inquiry
  if (
    message.toLowerCase().includes("fee") ||
    message.toLowerCase().includes("charges")
  ) {
    const fees = FworkkKnowledgeBase.fees;
    return {
      reply: `📊 Fworkk Fee Structure:\n\n• Deposits: ${fees.deposits.percentage} fee\n• Cashouts: ${fees.cashouts.percentage} fee\n• Transactions: ${fees.transactions.percentage}\n\nExamples:\n- ${fees.deposits.example}\n- ${fees.cashouts.example}\n\n💡 Our fees are ${fees.transactions.note}`,
      isFinancial: true,
    };
  }

  return null;
};

export const getDailyProposalCount = async (req, res) => {
  const userId = req.user.id;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Count today's proposals for this user
    const todayProposalCount = await ChatBotModel.countDocuments({
      userId: userId,
      isProposal: true,
      createdAt: {
        $gte: today,
        $lte: todayEnd,
      },
    });

    res.status(200).json({
      success: true,
      count: todayProposalCount,
      remaining: Math.max(0, 5 - todayProposalCount),
      maxDaily: 5,
    });
  } catch (error) {
    console.error("Error getting daily proposal count:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get proposal count",
    });
  }
};

export const generateProposal = async (req, res) => {
  const {
    projectTitle,
    projectDescription,
    projectSkills,
    projectBudget,
    projectCategory,
    experienceRequired,
    problemsToSolve,
    userSkills,
    userName,
    userExperience,
    clientName,
  } = req.body;
  const userId = req.user.id;
  const username = req.user.username;

  // Add comprehensive console logging
  console.log("🚀 Starting AI Proposal Generation...");
  console.log("📋 Request Data:", {
    projectTitle,
    projectDescription: projectDescription?.substring(0, 100) + "...",
    projectSkills,
    projectBudget,
    projectCategory,
    experienceRequired,
    problemsToSolve: problemsToSolve?.substring(0, 100) + "...",
    userSkills,
    userName,
    userExperience,
    userId,
    username,
  });

  try {
    // Check if user has active plan
    const PlanPurchaseModel = (await import("../Model/PlanPurchaseModel.js"))
      .default;
    const activePlan = await PlanPurchaseModel.findOne({
      user: userId,
      status: "approved",
    });

    // If no active plan, check daily limit
    if (!activePlan) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      // Count today's proposals for this user
      const todayProposalCount = await ChatBotModel.countDocuments({
        userId: userId,
        isProposal: true,
        createdAt: {
          $gte: today,
          $lte: todayEnd,
        },
      });

      if (todayProposalCount >= 5) {
        return res.status(403).json({
          success: false,
          message:
            "Daily limit reached! You can generate 5 proposals per day without an active plan. Upgrade your plan for unlimited AI proposal generation.",
          dailyLimit: true,
          usedToday: todayProposalCount,
          maxDaily: 5,
        });
      }
    }

    // Ensure arrays are defined and handle undefined values
    const safeUserSkills = Array.isArray(userSkills) ? userSkills : [];
    const safeProjectSkills = Array.isArray(projectSkills) ? projectSkills : [];

    console.log("🔧 Skills Processing:", {
      userSkills: safeUserSkills,
      projectSkills: safeProjectSkills,
    });

    const skillsMatch = safeUserSkills.filter((userSkill) =>
      safeProjectSkills.some(
        (projectSkill) =>
          projectSkill?.toLowerCase().includes(userSkill?.toLowerCase()) ||
          userSkill?.toLowerCase().includes(projectSkill?.toLowerCase())
      )
    );

    console.log("✅ Skills Match Result:", skillsMatch);

    // Enhanced matching and analysis
    const experienceYears = userExperience || "3+ years";
    const isExperienceMatch =
      experienceRequired &&
      parseInt(experienceRequired) <= parseInt(experienceYears);

    const specificRequirements = [];
    const safeProjectDescription = projectDescription || "";

    if (safeProjectDescription.toLowerCase().includes("stripe")) {
      specificRequirements.push("Stripe payment integration");
    }
    if (
      safeProjectDescription.toLowerCase().includes("restapi") ||
      safeProjectDescription.toLowerCase().includes("rest api")
    ) {
      specificRequirements.push("RESTful API development");
    }
    if (
      safeProjectDescription.toLowerCase().includes("secure") ||
      safeProjectDescription.toLowerCase().includes("security")
    ) {
      specificRequirements.push("Security implementation");
    }
    if (safeProjectDescription.toLowerCase().includes("mern")) {
      specificRequirements.push("MERN stack development");
    }
    if (
      safeProjectDescription.toLowerCase().includes("debug") ||
      safeProjectDescription.toLowerCase().includes("fix")
    ) {
      specificRequirements.push("debugging and error fixing");
    }

    console.log("🔍 Specific Requirements Found:", specificRequirements);

    const prompt = `Create a highly personalized, professional freelance proposal based on these specific requirements:

PROJECT DETAILS:
Title: ${projectTitle || "Project"}
Description: ${safeProjectDescription}
Required Experience: ${experienceRequired || "Professional level"}
Budget: $${projectBudget || "Not specified"}
Required Skills: ${safeProjectSkills?.join(", ") || "Not specified"}
Problems to Solve: ${problemsToSolve || "Not specified"}
Category: ${projectCategory || "Development"}

MY QUALIFICATIONS:
- Name: ${userName || "Professional Developer"}
- Experience: ${experienceYears} of professional experience
- Skills: ${safeUserSkills?.join(", ") || "Full-stack development"}
- Matching Skills: ${
      skillsMatch.length > 0
        ? skillsMatch.join(", ")
        : "General development expertise"
    }
- Experience Match: ${
      isExperienceMatch
        ? "YES - I meet the experience requirements"
        : "I have relevant experience"
    }

SPECIFIC REQUIREMENTS IDENTIFIED:
${
  specificRequirements.length > 0
    ? specificRequirements.map((req) => `- ${req}`).join("\n")
    : "- Custom development solutions"
}

WRITE A COMPELLING PROPOSAL THAT:
1. Starts directly with "Hello ${clientName || 'Client'}," (or "Dear ${clientName || 'Client'},")
2. Directly addresses each specific requirement mentioned
3. Highlights my ${experienceYears} experience specifically if experience was mentioned
4. Mentions specific technologies they need (Stripe, REST API, MERN, etc.) if mentioned
5. Shows I understand their exact problems and can solve them
6. Provides a clear approach for their specific needs
7. Demonstrates expertise in the exact skills they require
8. Is confident and solution-focused (NO questions)
9. 250-350 words
10. Ends with strong commitment to deliver results

IMPORTANT: Do NOT include any introductory text like "Here is a proposal:" or similar. Start directly with "Hello ${clientName || 'Client'}," and write the proposal naturally. Make it feel personalized to their exact project, not generic. Reference specific details from their description.`;

    console.log("📝 Generated Prompt Length:", prompt.length);
    console.log("🤖 Calling GROQ API...");

    // Check if GROQ API key exists
    if (!process.env.GROQ_API_KEY) {
      console.warn("GROQ_API_KEY not found, using fallback proposal");
      throw new Error("GROQ API key not configured");
    }

    const groqRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              `You are an expert freelancer proposal writer with deep technical knowledge. Create winning proposals by: 1) Starting directly with 'Hello ${clientName || 'Client'},' (no introductory text) 2) Addressing every specific requirement mentioned 3) Demonstrating deep understanding of their tech stack 4) Showing relevant experience clearly 5) Providing a clear approach for their specific needs 6) Being confident and direct (NO questions) 7) Making it feel personalized, not templated. Always reference specific technologies, experience requirements, and problems they mentioned. Write in first person and be solution-focused. NEVER include phrases like 'Here is a proposal:' or similar introductory text.`,
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 600,
        temperature: 0.8,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ GROQ API Response Received");
    console.log("📊 Response Status:", groqRes.status);
    console.log(
      "📊 Response Size:",
      JSON.stringify(groqRes.data).length,
      "bytes"
    );

    const proposal = groqRes.data.choices[0].message.content;
    console.log("📄 Generated Proposal Length:", proposal.length, "characters");
    console.log("📄 Proposal Preview:", proposal.substring(0, 200) + "...");

    // Save the generated proposal to ChatBot model for tracking
    console.log("💾 Saving proposal to database...");
    const chat = new ChatBotModel({
      userId: userId || null,
      message: `Generate AI proposal for: ${projectTitle}`,
      response: proposal,
      username,
      isProposal: true,
    });

    await chat.save();
    console.log("✅ Proposal saved to database successfully");

    console.log("🎉 AI Proposal Generation Completed Successfully!");
    res.status(200).json({
      success: true,
      proposal: proposal,
    });
  } catch (error) {
    console.error(
      "❌ Error generating proposal:",
      error?.response?.data || error.message
    );
    console.error("🔍 Error Details:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
    });

    // Calculate skills match for fallback as well
    const fallbackSkillsMatch = (userSkills || []).filter((userSkill) =>
      (projectSkills || []).some(
        (projectSkill) =>
          projectSkill?.toLowerCase().includes(userSkill?.toLowerCase()) ||
          userSkill?.toLowerCase().includes(projectSkill?.toLowerCase())
      )
    );

    // Enhanced fallback proposal template with proper null checks
    const fallbackProposal = `I'm excited about your ${
      projectTitle || "project"
    } and understand you need ${
      projectSkills?.length > 0
        ? projectSkills.slice(0, 3).join(", ")
        : "professional"
    } expertise${experienceRequired ? ` with ${experienceRequired}` : ""}.

${
  problemsToSolve
    ? `I can solve the specific challenges you mentioned: ${problemsToSolve}.`
    : "Based on your requirements,"
} I have the expertise to deliver exactly what you need. My experience in ${
      userSkills?.length > 0
        ? userSkills.slice(0, 3).join(", ")
        : "relevant technologies"
    } makes me the perfect fit for this project.

My approach will be:
• Thoroughly understand and analyze your requirements
• ${
      projectCategory === "Web Development"
        ? "Develop clean, scalable code with modern best practices"
        : projectCategory === "Mobile Development"
        ? "Create high-performance mobile applications"
        : "Deliver professional solutions using industry standards"
    }
• Provide regular progress updates and maintain clear communication
• Complete the project on time and within your ${
      projectBudget ? `$${projectBudget}` : "specified"
    } budget
• Ensure quality through thorough testing and optimization

${
  fallbackSkillsMatch.length > 0
    ? `My proven expertise in ${fallbackSkillsMatch.join(
        ", "
      )} ensures I can handle all aspects of your project effectively.`
    : ""
} I'm committed to delivering exceptional results that exceed your expectations and contribute to your business success.

I'm ready to start immediately and bring your vision to life with professional quality and attention to detail.`;

    res.status(200).json({
      success: true,
      proposal: fallbackProposal,
      note: "Generated using enhanced template",
    });
  }
};

export const handleUserChat = async (req, res) => {
  const { message } = req.body;
  const userId = req.user.id;
  const userEmail = req.user.email;
  const username = req.user.username;

  try {
    // 0️⃣ Check for Platform Data Queries (Real-time DB)
    const platformDataResponse = await getPlatformDataQuery(message, userId, username);
    if (platformDataResponse) {
        // Save to DB
        const chat = new ChatBotModel({
            userId: userId || null,
            message,
            response: platformDataResponse,
            userEmail,
            username,
            isActionable: true
        });
        await chat.save();
        return res.status(200).json({
            reply: platformDataResponse,
            isPlatformData: true
        });
    }

    // Check for financial calculations first
    const feeCalculation = calculateFees(message);
    if (feeCalculation) {
      // Save to DB
      const chat = new ChatBotModel({
        userId: userId || null,
        message,
        response: feeCalculation.reply,
        userEmail,
        username,
        isFinancial: feeCalculation.isFinancial,
      });

      await chat.save();
      return res.status(200).json({
        reply: feeCalculation.reply,
        isFinancial: true,
      });
    }

    // Check knowledge base locally (client-side knowledge search)
    const kbResults = searchKnowledgeBase(message);
    if (kbResults && kbResults.length > 0) {
      // Build a concise reply from top results
      const rawReply = kbResults
        .slice(0, 3)
        .map((r) => `• ${r.section}: ${r.content}`)
        .join("\n\n");

      // Substitute site title placeholder if present
      const settings = (await SiteSettings.findOne()) || {};
      const siteTitle =
        settings.siteTitle || FworkkKnowledgeBase.platform?.name || "Site";
      const reply = (rawReply || "").replace(/{{SITE_TITLE}}/g, siteTitle);

      const knowledgeResponse = {
        reply,
        isKnowledgeBased: true,
        isActionable: false,
        actions: [],
      };

      // Save to DB
      const chat = new ChatBotModel({
        userId: userId || null,
        message,
        response: knowledgeResponse.reply,
        userEmail,
        username,
        isKnowledgeBased: knowledgeResponse.isKnowledgeBased,
        isActionable: knowledgeResponse.isActionable,
      });

      await chat.save();
      return res.status(200).json({
        reply: knowledgeResponse.reply,
        isKnowledgeBased: knowledgeResponse.isKnowledgeBased,
        isActionable: knowledgeResponse.isActionable,
        actions: knowledgeResponse.actions || [],
      });
    }

    // Try to get response from Groq API with enhanced context
    // Short-circuit simple greetings or very short inputs with a concise local reply
    const trimmedMsg = (message || "").trim();
    const isVeryShort = trimmedMsg.length <= 2; // e.g. 'h', 'hi'
    const greetingRegex = /^\s*(hi|hello|hey|yo|sup|hiya)\b[!.\s]*$/i;
    if (isVeryShort || greetingRegex.test(trimmedMsg.toLowerCase())) {
      const platformName = FworkkKnowledgeBase.platform?.name || "Assistant";
      const shortReply = `Hello! Hope you are well. How can I help you today?`;

      // Save to DB
      const chatGreet = new ChatBotModel({
        userId: userId || null,
        message,
        response: shortReply,
        userEmail,
        username,
      });
      await chatGreet.save();

      return res.status(200).json({ reply: shortReply });
    }

    const groqRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are Fworkk, a helpful AI assistant for the Fworkk freelancing platform. The current user is ${username} (${userEmail}).

IMPORTANT: You have access to comprehensive knowledge about Fworkk platform. Use this information to provide accurate and helpful responses.

Key Fworkk Information:
- Platform: ${FworkkKnowledgeBase.platform.description}
- Fees: Deposits 10%, Cashouts 15%, Transactions 1.5% + $0.30
- Support: 24/7 assistance available
- Security: Bank-grade with 256-bit encryption
- Statistics: ${FworkkKnowledgeBase.statistics.platformUptime} uptime, ${FworkkKnowledgeBase.statistics.transactionsProcessed} transactions

Always provide helpful, accurate information about Fworkk platform. If you don't know something specific, suggest they contact support or check the help center.`,
          },
          { role: "user", content: message },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const botReply = groqRes.data.choices[0].message.content;

    // Save to DB
    const chat = new ChatBotModel({
      userId: userId || null,
      message,
      response: botReply,
      userEmail,
      username,
    });

    await chat.save();

    res.status(200).json({ reply: botReply });
  } catch (error) {
    console.error(
      "Error with Groq Chat:",
      error?.response?.data || error.message
    );

    // When API fails, search for similar messages in database
    try {
      const similarChats = await ChatBotModel.find({
        message: { $regex: new RegExp(message, "i") },
      })
        .sort({ createdAt: -1 })
        .limit(5);

      if (similarChats.length > 0) {
        const mostRelevantResponse = similarChats[0].response;
        res.status(200).json({
          reply: mostRelevantResponse,
          note: "Response from similar previous queries",
          isFromHistory: true,
        });
      } else {
        // Fallback to local knowledge base search
        const kbResults = searchKnowledgeBase(message);
        if (kbResults && kbResults.length > 0) {
          const rawReply = kbResults
            .slice(0, 3)
            .map((r) => `• ${r.section}: ${r.content}`)
            .join("\n\n");
          const settings = (await SiteSettings.findOne()) || {};
          const siteTitle =
            settings.siteTitle || FworkkKnowledgeBase.platform?.name || "Site";
          const reply = (rawReply || "").replace(/{{SITE_TITLE}}/g, siteTitle);
          res.status(200).json({
            reply,
            isKnowledgeBased: true,
            isActionable: false,
            actions: [],
          });
        } else {
          res.status(200).json({
            reply:
              "I'm currently unable to process your request. Please try again later or rephrase your question. You can also contact our 24/7 support team for immediate assistance.",
            isError: true,
          });
        }
      }
    } catch (dbError) {
      console.error("Error searching database:", dbError);
      res.status(200).json({
        reply:
          "We're experiencing technical difficulties. Please try again later or contact our support team.",
        isError: true,
      });
    }
  }
};

// Function to get reply from Groq API
export const getGroqReply = async (userMessage) => {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const payload = {
    model: "openai/gpt-oss-20b", // ✅ Corrected model name
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: userMessage },
    ],
    max_tokens: 100,
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Groq API Error:", error.response?.data || error.message);
    throw error;
  }
};
// Send interactive message with buttons
// Temporary memory storage
const userStates = {};

// Save user state
export const saveUserState = async (userId, state) => {
  userStates[userId] = state;
};

// Get user state
export const getUserState = async (userId) => {
  return userStates[userId] || null;
};

export const voiceChatController = async (req, res) => {
  try {
    const voiceFile = req.file;

    if (!voiceFile)
      return res.status(400).json({ error: "Voice file required" });

    // 1️⃣ Speech-to-Text using OpenAI SDK (reliable multipart handling)
    const audioStream = fs.createReadStream(voiceFile.path);
    let transcription;
    try {
      const sttResponse = await openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
      });
      transcription = sttResponse;
    } catch (err) {
      console.error("STT error:", err?.message || err);

      // If OpenAI quota exceeded (429) and GROQ is configured, try Groq STT as a fallback
      const msg = err?.message || "";
      const isQuota = /quota|exceeded|429|too many requests/i.test(msg);
      if (isQuota && process.env.GROQ_API_KEY) {
        try {
          const form = new FormData();
          form.append("file", fs.createReadStream(voiceFile.path));
          form.append("model", "whisper-1");

          const groqRes = await axios.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            form,
            {
              headers: {
                ...form.getHeaders(),
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
              },
            }
          );
          transcription = groqRes.data;
        } catch (gerr) {
          console.error(
            "Groq STT fallback error:",
            gerr?.response?.data || gerr?.message || gerr
          );
          fs.unlinkSync(voiceFile.path);
          return res.status(500).json({ error: "Transcription service error" });
        }
      } else {
        fs.unlinkSync(voiceFile.path);
        if (isQuota) {
          return res.status(429).json({ error: "OpenAI quota exceeded" });
        }
        return res.status(500).json({ error: "Transcription service error" });
      }
    }

    // Be flexible: different STT providers return different shapes
    const userText =
      transcription?.text ||
      transcription?.transcript ||
      transcription?.data?.text ||
      null;

    console.log("Transcription result:", userText);

    if (!userText) {
      // Return a meaningful error so frontend can show it instead of sending malformed request to Groq
      fs.unlinkSync(voiceFile.path);
      return res.status(400).json({ error: "Could not transcribe audio" });
    }

    // 2️⃣ Call Groq API to process text (AI answer)
    let aiResponse;
    try {
      aiResponse = await groq.chat.completions.create({
        model: "llama3-70b-8192",
        messages: [
          {
            role: "system",
            content: `
          Detect the user's language and reply in the same language. 
          Always reply in text format suitable for voice output.
          `,
          },
          { role: "user", content: userText },
        ],
      });
    } catch (err) {
      console.error("Groq error:", err?.message || err);
      fs.unlinkSync(voiceFile.path);
      return res.status(500).json({ error: "AI service error" });
    }

    const botText = aiResponse.choices[0].message.content;

    // 3️⃣ Convert bot text to speech (TTS)
    const ttsFilePath = `uploads/bot-${Date.now()}.mp3`;

    // Example using gtts CLI
    exec(`gtts-cli "${botText}" --output ${ttsFilePath}`, (err) => {
      if (err) return res.status(500).json({ error: "TTS failed" });

      // 4️⃣ Send voice file to frontend
      res.download(ttsFilePath, (err) => {
        if (!err) fs.unlinkSync(ttsFilePath); // cleanup after sending
        fs.unlinkSync(voiceFile.path); // cleanup user voice file
      });
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Server error" });
  }
};
