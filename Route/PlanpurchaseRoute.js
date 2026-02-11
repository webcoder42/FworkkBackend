import express from "express";
import {
  addFunds,
  createPlanPurchase,
  getLatestPlanForUser,
  getMyPlan,
  getMyTeamPlans,
  teamPlanPurchase,
  getTotalPlanPurchaseAmount,
  getMonthlyPlanPurchaseAmounts,
  getAllTimeMonthlyPurchases,
  getAllPlanPurchases,
  checkActivePlan,
  createPayPalOrder,
  generateBraintreeToken,
  getFundHistory,
  refundFund,
  createNowPaymentsInvoice,
  nowPaymentsWebhook,
} from "../Controller.js/PlanPurchaseController.js";
import { requireSignIn } from "../middleware/UserMiddleware.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";

const router = express.Router();

router.post("/purchase", requireSignIn, createPlanPurchase);

router.get("/check-active-plan",cacheMiddleware(60, 'check-active-plan'), requireSignIn, checkActivePlan);

router.post("/team-purchase", requireSignIn, teamPlanPurchase);
router.post("/create-paypal-order", requireSignIn, createPayPalOrder);
router.get("/braintree/token", generateBraintreeToken);

router.get("/my-plan",cacheMiddleware(60, 'my-plan'), requireSignIn, getMyPlan);

router.get("/my-latest-plan",cacheMiddleware(60, 'my-latest-plans'), requireSignIn, getLatestPlanForUser);

router.post("/add-funds", requireSignIn, addFunds);
router.get("/fund-history", requireSignIn, getFundHistory);

// Debug route for PayPal configuration
router.get("/paypal-test", requireSignIn, async (req, res) => {
    try {
        const { getPayPalAccessToken } = await import("../Controller.js/PlanPurchaseController.js");
        const result = await getPayPalAccessToken();
        res.json({ 
            success: true, 
            message: "PayPal connection successful", 
            baseUrl: result.baseUrl 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: "PayPal connection failed", 
            error: error.message 
        });
    }
});

router.post("/refund-fund/:id", requireSignIn, refundFund);
router.post("/nowpayments-create", requireSignIn, createNowPaymentsInvoice);
router.post("/nowpayments-webhook", nowPaymentsWebhook);

router.get("/my-team-plans",cacheMiddleware(60, 'my-team-plan'), requireSignIn, getMyTeamPlans);
router.get("/total-purchase-amount",cacheMiddleware(60, 'total-purchase-amount'), requireSignIn, getTotalPlanPurchaseAmount);
router.get(
  "/monthly-purchase-amounts",
  cacheMiddleware(60, 'monthly-purchase-amount'),
  requireSignIn,
  getMonthlyPlanPurchaseAmounts
);
router.get(
  "/alltime-monthly-purchases",
  cacheMiddleware(60, 'alltime-monthly-purchases'),
  requireSignIn,
  getAllTimeMonthlyPurchases
);
router.get("/all-purchase",cacheMiddleware(60, 'all-purchases'), requireSignIn, getAllPlanPurchases);

export default router;
