import express from "express";
import {
  getUserPayPalAccounts,
  linkPayPalAccount,
  getSinglePayPalAccount,
  unlinkPayPalAccount,
  createWithdrawal,
  getUserWithdrawals,
  getPayoutSummary,
  getConnectedAccounts,
  requestWithdrawal,
  adminListWithdrawals,
  adminWithdrawalsStats,
  adminUpdateWithdrawalStatus,
  adminDeleteWithdrawal,
  linkCryptoWallet,
  unlinkCryptoAccount,
} from "../Controller.js/PayOutController.js";
import { requireSignIn, isAdmin } from "../middleware/UserMiddleware.js";

const router = express.Router();

// ✅ Route: Link PayPal account
// POST /api/payment/paypal/link
router.post("/paypal/link", linkPayPalAccount);

// New RESTful route: POST /api/v1/payout/account/link
router.post("/account/link", linkPayPalAccount);

// Get user's linked PayPal account (returns single account or null)
router.get("/account/:userId", getUserPayPalAccounts);

// Link Crypto wallet
router.post("/crypto/link", requireSignIn, linkCryptoWallet);

// Unlink PayPal
router.post("/unlink", unlinkPayPalAccount);

// Unlink Crypto
router.post("/crypto/unlink", requireSignIn, unlinkCryptoAccount);

// Create withdrawal request
router.post("/withdraw", createWithdrawal);

// Get user withdrawals
router.get("/withdrawals/:userId", getUserWithdrawals);

// Get single account by id or user
router.get("/account/single/:id", getSinglePayPalAccount);

// ✅ Route: Get user's linked PayPal accounts
// GET /api/payment/paypal/:userId
router.get("/paypal/:userId", getUserPayPalAccounts);

// Protected endpoints used by frontend withdrawal UI
router.get("/summary", requireSignIn, getPayoutSummary);
router.get("/connected-accounts", requireSignIn, getConnectedAccounts);
router.post("/request-withdrawal", requireSignIn, requestWithdrawal);

// Admin routes
router.get("/admin/withdrawals", requireSignIn, isAdmin, adminListWithdrawals);
router.get(
  "/admin/withdrawals/stats",
  requireSignIn,
  isAdmin,
  adminWithdrawalsStats
);
router.put(
  "/admin/withdrawals/:payoutId/:withdrawalId",
  requireSignIn,
  isAdmin,
  adminUpdateWithdrawalStatus
);
router.delete(
  "/admin/withdrawals/:payoutId/:withdrawalId",
  requireSignIn,
  isAdmin,
  adminDeleteWithdrawal
);

export default router;
