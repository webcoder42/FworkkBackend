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

router.get("/check-active-plan",cacheMiddleware('check-active-plan' , 60), requireSignIn, checkActivePlan);

router.post("/team-purchase", requireSignIn, teamPlanPurchase);
router.post("/create-paypal-order", createPayPalOrder);
router.get("/braintree/token", generateBraintreeToken);

router.get("/my-plan",cacheMiddleware('my-plan' , 60), requireSignIn, getMyPlan);

router.get("/my-latest-plan",cacheMiddleware('my-latest-plans' , 60), requireSignIn, getLatestPlanForUser);

router.post("/add-funds", requireSignIn, addFunds);
router.get("/fund-history", requireSignIn, getFundHistory);
router.post("/refund-fund/:id", requireSignIn, refundFund);
router.post("/nowpayments-create", requireSignIn, createNowPaymentsInvoice);
router.post("/nowpayments-webhook", nowPaymentsWebhook);

router.get("/my-team-plans",cacheMiddleware('my-team-plan' ,60 ), requireSignIn, getMyTeamPlans);
router.get("/total-purchase-amount",cacheMiddleware('total-purchase-amount' , 60), requireSignIn, getTotalPlanPurchaseAmount);
router.get(
  "/monthly-purchase-amounts",
  cacheMiddleware('monthly-purchase-amount' , 60),
  requireSignIn,
  getMonthlyPlanPurchaseAmounts
);
router.get(
  "/alltime-monthly-purchases",
  cacheMiddleware('alltime-monthly-purchases'),
  requireSignIn,
  getAllTimeMonthlyPurchases
);
router.get("/all-purchase",cacheMiddleware('all-purchases', 60), requireSignIn, getAllPlanPurchases);

export default router;
