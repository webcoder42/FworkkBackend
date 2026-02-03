// authRoutes.js
import express from "express";
import {
  changeUserRole,
  checkUsernameAvailability,
  completeRegistration,
  deleteUserById,
  getAllUsers,
  getUserById,
  getUserCompleteDetails,
  getPublicUserProfile,
  getUserProfile,
  getUserProjects,
  googleLogin,
  googleRegister,
  initiateLogin,
  resendLoginVerificationCode,
  sendRegistrationVerification,
  updatePassword,
  updateUserById,
  updateUserProfile,
  verifyLoginCode,
  verifyRegistrationEmail,
  getProfileCompletion,
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
  getTotalAddFundAmount,
  getMonthlyAddFundAmounts,
  getUserEarningLogs,
  sendAccountVerification,
  verifyAccountCode,
  getUserSecurity,
  verifyUserSecurity,
  githubRegister,
  githubLogin,
  connectGitHub,
  getGitHubRepositories,
  linkedInRegister,
  linkedInLogin,
  getTopFreelancers,
  logoutController,
  refreshAccessToken,
  searchUsers

} from "../Controller.js/UserController.js";
import { loginLimiter } from "./../middleware/rateLimiter.js";
import { isAdmin, requireSignIn } from "./../middleware/UserMiddleware.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";
import { getMarketingUsers, sendMarketingEmail, generateEmailContent, getEmailLogs, handleResendInbound, getReceivedEmailDetail, getSentEmailDetail } from "../Controller.js/MarketingControllerTemp.js";
import { registerValidation, loginValidation } from "../validations/userValidation.js";
import { validate } from "../middleware/validateMiddleware.js";

const router = express.Router();

/* 
=============================================
REGISTRATION ROUTES
=============================================
*/

router.post("/register-send-verification", registerValidation, validate, sendRegistrationVerification);
router.post("/register-verify-email", verifyRegistrationEmail);
router.post("/register-complete", completeRegistration);

/* 
=============================================
LOGIN ROUTES
=============================================
*/
router.post("/login-initiate", loginValidation, validate, initiateLogin);
router.post("/login-verify-code", loginLimiter, verifyLoginCode);
router.post("/login-resend-code", resendLoginVerificationCode);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logoutController);

// Account verification for authenticated users
router.post(
  "/send-account-verification",
  requireSignIn,
  sendAccountVerification
);
router.post("/verify-account-code", requireSignIn, verifyAccountCode);

/* 
=============================================
GITHUB AUTH ROUTE
=============================================
*/
router.post("/github/register", githubRegister);
router.post("/github/login", githubLogin);
router.post("/github/connect", requireSignIn, connectGitHub);
router.get("/github/repositories", requireSignIn, getGitHubRepositories);
/* 
=============================================
GOOGLE AUTH ROUTE
=============================================
*/
router.post("/google/register", googleRegister);
router.post("/google/login", googleLogin);
// LinkedIn OAuth: frontend sends the authorization code to this endpoint.
// The controller will exchange the code for an access token and will create
// or find a user and return a JWT. Frontend should POST { code } to this route.
/* 
=============================================
LINKEDIN AUTH ROUTE
=============================================
*/
router.post("/linkedin/register", linkedInRegister);
router.post("/linkedin/login", linkedInLogin);

/* 
=============================================
UTILITY ROUTES
=========================================s====
*/
router.get("/check-username",cacheMiddleware('checkusername ' ,10), checkUsernameAvailability);
router.get("/search", requireSignIn, searchUsers);

/* 
=============================================
PROTECTED ROUTES
=============================================
*/
// Protected user route
router.get("/auth-user", requireSignIn, (req, res) => {
  res.status(200).send({ ok: true });
});

// Protected admin route
router.get("/auth-admin", requireSignIn, isAdmin, (req, res) => {
  res.status(200).send({ ok: true });
});
/* 
=============================================
User Profile Route
=============================================
*/

router.get("/profile", requireSignIn, cacheMiddleware(req => `profile:${req.user.id}`, 10), getUserProfile);
router.get("/security", requireSignIn, getUserSecurity);
router.post("/security/verify", requireSignIn, verifyUserSecurity);
import chatUpload from "../middleware/chatUpload.js";
router.get("/profile-completion",cacheMiddleware('profile-completetion', 20), requireSignIn, getProfileCompletion);
router.put("/profile", requireSignIn, chatUpload.fields([
  { name: "profileImage", maxCount: 1 },
  { name: "portfolioImages", maxCount: 10 }
]), updateUserProfile);
router.put("/password", requireSignIn, updatePassword);
router.put("/role", requireSignIn, changeUserRole);

// GET all users (admin only)
router.get(
  "/get-all",
  cacheMiddleware("all-users", 60),
  requireSignIn,
  isAdmin,
  getAllUsers
);

// GET single user
router.get("/get-single/:id", requireSignIn, isAdmin, getUserById);

// UPDATE user
router.put("/update/:id", requireSignIn, isAdmin, updateUserById);

// DELETE user
router.delete("/delete/:id", requireSignIn, isAdmin, deleteUserById);

router.get("/user/details/:id", requireSignIn, isAdmin,cacheMiddleware('user-detail' , 60),  getUserCompleteDetails);

// Get public user profile (for clients to view applicant profiles)
router.get("/public-profile/:id", requireSignIn,cacheMiddleware('public-profile' , 60), getPublicUserProfile);

// Get user projects and details
router.get("/user-projects/:userId", requireSignIn, isAdmin,cacheMiddleware('user-project' , 60), getUserProjects);

/* 
=============================================
FORGOT PASSWORD ROUTES
=============================================
*/
router.post("/forgot-password/request", requestPasswordReset);
router.get("/forgot-password/verify", verifyResetToken);
router.post("/forgot-password/reset", resetPassword);

router.get("/total-add-fund", requireSignIn, isAdmin, cacheMiddleware('total-add-fund' , 60), getTotalAddFundAmount);
router.get(
  "/monthly-add-fund",
  requireSignIn,
  isAdmin,
  cacheMiddleware('monthly-add-fund' , 60),
  getMonthlyAddFundAmounts
);

// Get user earning logs
router.get("/earning-logs", requireSignIn,cacheMiddleware('earning-log' , 60),  getUserEarningLogs);

// Get Top Freelancers
router.get("/top-freelancers", getTopFreelancers);

/* 
=============================================
Email Marketing Routes
=============================================
*/
router.get("/marketing-users", requireSignIn, isAdmin, getMarketingUsers);
router.post("/send-marketing-email", requireSignIn, isAdmin, sendMarketingEmail);
router.post("/generate-email-content", requireSignIn, isAdmin, generateEmailContent);
router.get("/marketing-logs", requireSignIn, isAdmin, getEmailLogs);
router.get("/marketing-logs/:id", requireSignIn, isAdmin, getReceivedEmailDetail);
router.get("/marketing-sent-logs/:id", requireSignIn, isAdmin, getSentEmailDetail);
router.post("/emails/webhook", handleResendInbound);

export default router;

