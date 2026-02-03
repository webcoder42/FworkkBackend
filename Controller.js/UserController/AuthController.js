import crypto from "crypto";
import axios from "axios";
import logger from "../../utils/logger.js";
import { v4 as uuidv4 } from "uuid";
import { OAuth2Client } from "google-auth-library";
import UserModel from "../../Model/UserModel.js";
import sanitize from "mongo-sanitize";
import { 
  sendWelcomeEmail, 
  sendRegistrationVerificationEmail, 
  sendLoginVerificationEmail, 
  sendPasswordResetEmail 
} from "../../services/EmailService.js";
import linkedInService from "../../services/linkedinService.js";
import { 
  setAuthCookies, 
  setRedisData, 
  getRedisData, 
  deleteRedisData, 
  hashPassword, 
  comparePassword,
  generateReferralCode,
  generateReferralLink,
  generateUserUniqueId,
  REDIS_REG_PREFIX,
  REDIS_LOGIN_PREFIX,
} from "./UserHelper.js";

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

const API_FRONTENT_URL = process.env.API_FRONTENT_URL || "https://fworkk.vercel.app";

/* 
=============================================
REGISTRATION CONTROLLERS
=============================================
*/

export const sendRegistrationVerification = async (req, res) => {
  try {
    const {
      Fullname,
      username,
      email: rawEmail,
      password,
      country,
      phone,
      bio,
      role,
      UserType,
      referralCode,
    } = req.body;
    const email = sanitize(rawEmail);

    if (!Fullname || !username || !email || !password || !country || !phone || !role || !UserType) {
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }

    if (!["freelancer", "client"].includes(UserType)) {
      return res.status(400).json({ success: false, message: "Invalid UserType" });
    }

    const existingUser = await UserModel.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists with this email or username" });
    }

    if (req.body.deviceId) {
      const existingDevice = await UserModel.findOne({ deviceId: req.body.deviceId });
      if (existingDevice) {
        return res.status(400).json({ success: false, message: "A user is already registered from this device" });
      }
    }

    const verificationCode = crypto.randomInt(100000, 999999).toString();
    const hashedPassword = await hashPassword(password);

    await setRedisData(`${REDIS_REG_PREFIX}${email}`, {
      Fullname, username, email, password: hashedPassword, country, phone, bio: bio || "",
      role, UserType, referralCode, verificationCode, isVerified: false, deviceId: req.body.deviceId,
    }, 900);

    try {
      await sendRegistrationVerificationEmail(email, verificationCode);
    } catch (emailError) {
      logger.info(`🔑 REGISTRATION CODE FOR ${email}: ${verificationCode}`);
    }

    return res.status(200).json({ success: true, message: "Registration verification code sent to your email" });
  } catch (error) {
    logger.error("Registration verification error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const verifyRegistrationEmail = async (req, res) => {
  try {
    const email = sanitize(req.body.email);
    const code = req.body.code;
    if (!email || !code) return res.status(400).json({ success: false, message: "Email and code are required" });

    const userData = await getRedisData(`${REDIS_REG_PREFIX}${email}`);
    if (!userData || userData.verificationCode !== code) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification code" });
    }

    userData.isVerified = true;
    await setRedisData(`${REDIS_REG_PREFIX}${email}`, userData, 900);

    return res.status(200).json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const completeRegistration = async (req, res) => {
  try {
    const email = sanitize(req.body.email);
    const userData = await getRedisData(`${REDIS_REG_PREFIX}${email}`);

    if (!userData || !userData.isVerified) {
      return res.status(400).json({ success: false, message: "Please verify your email first" });
    }

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      await deleteRedisData(`${REDIS_REG_PREFIX}${email}`);
      return res.status(400).json({ success: false, message: "User already registered" });
    }

    let referredByUser = null;
    if (userData.referralCode) {
      referredByUser = await UserModel.findOne({ referralCode: userData.referralCode });
    }

    const referralCode = generateReferralCode();
    const newUser = new UserModel({
      Fullname: userData.Fullname,
      username: userData.username,
      email: userData.email,
      password: userData.password,
      country: userData.country,
      phone: userData.phone,
      bio: userData.bio,
      role: userData.role,
      UserType: userData.UserType,
      isVerified: false,
      referralCode,
      referralLink: generateReferralLink(referralCode),
      referredBy: referredByUser?._id || null,
      accountStatus: "active",
      deviceId: userData.deviceId,
      uniqueId: generateUserUniqueId(),
    });

    await newUser.save();
    if (referredByUser) {
      referredByUser.totalReferred += 1;
      await referredByUser.save();
    }

    await deleteRedisData(`${REDIS_REG_PREFIX}${email}`);
    try { await sendWelcomeEmail(newUser); } catch (e) {}

    const { accessToken } = setAuthCookies(res, newUser);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      token: accessToken,
      user: {
        _id: newUser._id, Fullname: newUser.Fullname, username: newUser.username,
        email: newUser.email, role: newUser.role, UserType: newUser.UserType,
        isVerified: newUser.isVerified, uniqueId: newUser.uniqueId,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/* 
=============================================
LOGIN CONTROLLERS
=============================================
*/

export const initiateLogin = async (req, res) => {
  try {
    const email = sanitize(req.body.email);
    const { password } = req.body;

    const user = await UserModel.findOne({ email });
    if (!user || user.accountStatus !== "active") {
      return res.status(403).json({ success: false, message: "User not found or account inactive" });
    }

    if (!user.password || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const verificationCode = crypto.randomInt(100000, 999999).toString();
    await setRedisData(`${REDIS_LOGIN_PREFIX}${user.email}`, {
      userId: user._id, verificationCode, isVerified: false,
    }, 600);

    try {
      await sendLoginVerificationEmail(user.email, verificationCode);
    } catch (e) {
      console.log(`🔑 LOGIN CODE FOR ${user.email}: ${verificationCode}`);
    }

    return res.status(200).json({ success: true, message: "Login verification code sent to your email", email: user.email });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const verifyLoginCode = async (req, res) => {
  try {
    const email = sanitize(req.body.email);
    const code = req.body.code;
    const loginData = await getRedisData(`${REDIS_LOGIN_PREFIX}${email}`);

    if (!loginData || loginData.verificationCode !== code) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification code" });
    }

    const user = await UserModel.findById(loginData.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.lastLogin = new Date();
    user.availability = "online";
    await user.save();

    const { accessToken } = setAuthCookies(res, user);
    await deleteRedisData(`${REDIS_LOGIN_PREFIX}${email}`);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: accessToken,
      user: {
        _id: user._id, Fullname: user.Fullname, email: user.email,
        username: user.username, role: user.role, UserType: user.UserType,
        isVerified: user.isVerified, uniqueId: user.uniqueId,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const resendLoginVerificationCode = async (req, res) => {
  try {
    const email = sanitize(req.body.email);
    const loginData = await getRedisData(`${REDIS_LOGIN_PREFIX}${email}`);
    if (!loginData) return res.status(400).json({ success: false, message: "No login attempt found" });

    const newCode = crypto.randomInt(100000, 999999).toString();
    await setRedisData(`${REDIS_LOGIN_PREFIX}${email}`, { ...loginData, verificationCode: newCode }, 600);
    await sendLoginVerificationEmail(email, newCode);

    return res.status(200).json({ success: true, message: "New code sent" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/* 
=============================================
SOCIAL AUTH CONTROLLERS
=============================================
*/

export const googleRegister = async (req, res) => {
    const { token, role = "user", UserType = "freelancer", referralCode, deviceId } = req.body;
    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        if (!payload) return res.status(400).json({ success: false, message: "Invalid Google token" });

        const { sub: googleId, email, name, picture } = payload;
        const existingUser = await UserModel.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: "User exists. Please login." });

        if (deviceId && await UserModel.findOne({ deviceId })) {
            return res.status(400).json({ success: false, message: "Device already registered" });
        }

        let referredBy = null;
        if (referralCode) {
            const referrer = await UserModel.findOne({ referralCode });
            if (referrer) {
                referredBy = referrer._id;
                await UserModel.findByIdAndUpdate(referrer._id, { $inc: { totalReferred: 1 } });
            }
        }

        const newReferralCode = generateReferralCode();
        const newUser = new UserModel({
            Fullname: name || email.split("@")[0], email,
            username: email.split("@")[0] + Math.floor(Math.random() * 1000),
            googleId, profileImage: picture || "", referralCode: newReferralCode,
            referralLink: generateReferralLink(newReferralCode), referredBy,
            role, UserType, isVerified: false, deviceId, uniqueId: generateUserUniqueId(),
        });

        await newUser.save();
        try { await sendWelcomeEmail(newUser); } catch (e) {}
        const { accessToken } = setAuthCookies(res, newUser);

        return res.status(201).json({
            success: true, message: "Google registration successful",
            token: accessToken,
            user: { _id: newUser._id, Fullname: newUser.Fullname, email: newUser.email, username: newUser.username, role: newUser.role, UserType: newUser.UserType, isVerified: newUser.isVerified, uniqueId: newUser.uniqueId }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Google registration failed" });
    }
};

export const googleLogin = async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        if (!payload) return res.status(400).json({ success: false, message: "Invalid Google token" });

        const user = await UserModel.findOne({ email: payload.email });
        if (!user || !user.googleId) return res.status(400).json({ success: false, message: "Account not linked with Google" });
        if (user.accountStatus !== "active") return res.status(403).json({ success: false, message: "Account inactive" });

        user.lastLogin = new Date();
        user.availability = "online";
        await user.save();
        const { accessToken } = setAuthCookies(res, user);

        return res.status(200).json({
            success: true, message: "Google login successful",
            token: accessToken,
            user: { _id: user._id, Fullname: user.Fullname, email: user.email, username: user.username, role: user.role, UserType: user.UserType, isVerified: user.isVerified, uniqueId: user.uniqueId }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Google login failed" });
    }
};

// ... (GitHub and LinkedIn methods following the same pattern)
export const githubRegister = async (req, res) => {
    const { code, role = "user", UserType = "freelancer", referralCode, deviceId } = req.body;
    try {
        const tokenResp = await axios.post("https://github.com/login/oauth/access_token", {
            client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code
        }, { headers: { Accept: "application/json" } });

        const access_token = tokenResp.data.access_token;
        if (!access_token) return res.status(400).json({ success: false, message: "No GitHub token" });

        const profileResp = await axios.get("https://api.github.com/user", { headers: { Authorization: `Bearer ${access_token}` } });
        const githubProfile = profileResp.data;

        let email = githubProfile.email;
        if (!email) {
            const emailResp = await axios.get("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${access_token}` } });
            email = emailResp.data.find(e => e.primary)?.email || emailResp.data[0]?.email;
        }

        if (!email) return res.status(400).json({ success: false, message: "GitHub email not found" });
        if (await UserModel.findOne({ email })) return res.status(400).json({ success: false, message: "User exists" });

        const newUser = new UserModel({
            Fullname: githubProfile.name || githubProfile.login, email,
            username: githubProfile.login + Math.floor(Math.random() * 1000),
            githubId: githubProfile.id.toString(), profileImage: githubProfile.avatar_url,
            referralCode: generateReferralCode(), role, UserType, deviceId, uniqueId: generateUserUniqueId(),
            githubAccessToken: access_token
        });

        await newUser.save();
        const { accessToken } = setAuthCookies(res, newUser);
        return res.status(201).json({ success: true, token: accessToken, user: newUser });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const githubLogin = async (req, res) => {
    const { code } = req.body;
    try {
        const tokenResp = await axios.post("https://github.com/login/oauth/access_token", {
            client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code
        }, { headers: { Accept: "application/json" } });
        const access_token = tokenResp.data.access_token;

        const profileResp = await axios.get("https://api.github.com/user", { headers: { Authorization: `Bearer ${access_token}` } });
        const githubId = profileResp.data.id.toString();

        const user = await UserModel.findOne({ githubId });
        if (!user) return res.status(404).json({ success: false, message: "Register first" });

        user.githubAccessToken = access_token;
        await user.save();
        const { accessToken } = setAuthCookies(res, user);
        return res.status(200).json({ success: true, token: accessToken, user: user });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const getGitHubRepositories = async (req, res) => {
    try {
        const user = await UserModel.findById(req.user.id);
        if (!user?.githubAccessToken) return res.status(400).json({ success: false, message: "GitHub not connected" });
        const resp = await axios.get("https://api.github.com/user/repos", {
            headers: { Authorization: `Bearer ${user.githubAccessToken}` }
        });
        return res.status(200).json({ success: true, repositories: resp.data });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const refreshAccessToken = async (req, res) => {
    return res.status(404).json({ success: false, message: "Disabled" });
};

export const connectGitHub = async (req, res) => {
    try {
        const { code } = req.body;
        const resp = await axios.post("https://github.com/login/oauth/access_token", {
            client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code
        }, { headers: { Accept: "application/json" } });
        const access_token = resp.data.access_token;
        if (!access_token) return res.status(400).json({ success: false });

        const profileResp = await axios.get("https://api.github.com/user", { headers: { Authorization: `Bearer ${access_token}` } });
        await UserModel.findByIdAndUpdate(req.user.id, { githubAccessToken: access_token, githubId: profileResp.data.id.toString() });
        return res.status(200).json({ success: true, message: "GitHub connected" });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const linkedInRegister = async (req, res) => {
    try {
        const { code, role = "user", UserType = "freelancer", deviceId } = req.body;
        const accessToken = await linkedInService.getLinkedInAccessToken(code);
        const profile = await linkedInService.getLinkedInProfile(accessToken);
        if (!profile.email) return res.status(400).json({ success: false });

        const existing = await UserModel.findOne({ email: profile.email });
        if (existing) return res.status(400).json({ success: false, message: "Exists" });

        const newUser = new UserModel({
            Fullname: `${profile.firstName} ${profile.lastName}`, email: profile.email,
            username: profile.firstName.toLowerCase() + Math.floor(Math.random() * 10000),
            linkedinId: profile.linkedinId, role, UserType, isVerified: true, deviceId,
            uniqueId: generateUserUniqueId(), referralCode: generateReferralCode()
        });
        await newUser.save();
        const { accessToken: jwtToken } = setAuthCookies(res, newUser);
        return res.status(201).json({ success: true, token: jwtToken, user: newUser });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const linkedInLogin = async (req, res) => {
    try {
        const { code } = req.body;
        const accessToken = await linkedInService.getLinkedInAccessToken(code);
        const profile = await linkedInService.getLinkedInProfile(accessToken);
        const user = await UserModel.findOne({ linkedinId: profile.linkedinId });
        if (!user) return res.status(404).json({ success: false });

        user.lastLogin = new Date();
        user.availability = "online";
        await user.save();
        const { accessToken: jwtToken } = setAuthCookies(res, user);
        return res.status(200).json({ success: true, token: jwtToken, user: user });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const logoutController = async (req, res) => {
    const isProduction = process.env.NODE_ENV === "production";
    // res.clearCookie("accessToken", { httpOnly: true, secure: isProduction, sameSite: isProduction ? "None" : "Lax", path: "/" });
    return res.status(200).json({ success: true, message: "Logout successful" });
};

export const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await UserModel.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const token = uuidv4();
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        const resetUrl = `${API_FRONTENT_URL}/reset-password?token=${token}&email=${email}`;
        await sendPasswordResetEmail(email, resetUrl);
        return res.status(200).json({ success: true, message: "Reset link sent" });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const verifyResetToken = async (req, res) => {
    const { email, token } = req.query;
    const user = await UserModel.findOne({ email, resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired token" });
    return res.status(200).json({ success: true });
};

export const resetPassword = async (req, res) => {
    const { email, token, newPassword } = req.body;
    const user = await UserModel.findOne({ email, resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false });

    user.password = await hashPassword(newPassword);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    return res.status(200).json({ success: true });
};
