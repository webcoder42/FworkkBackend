import Stripe from "stripe";
import PlanSchemaModel from "../Model/PlanSchemaModel.js";
// Force restart
import UserModel from "../Model/UserModel.js";
import PlanPurchaseModel from "../Model/PlanPurchaseModel.js";
import Transaction from "../Model/TransactionModel.js";
import dotenv from "dotenv";
import { redisClient } from "../server.js";
dotenv.config();
import SiteSettings from "../Model/SiteSettingsModel.js";
// import PayTabsService from "../services/PayTabsService.js";
import { sendEarningUpdateEmail } from "../services/EmailService.js";
import NOWPaymentsService from "../services/NOWPaymentsService.js";

const nowPayments = new NOWPaymentsService(
  process.env.NOWPAYMENTS_API_KEY,
  process.env.NOWPAYMENTS_IPN_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Braintree Gateway
import braintree from "braintree";

const braintreeGateway = new braintree.BraintreeGateway({
  environment:
    process.env.BRAINTREE_ENV === "Production"
      ? braintree.Environment.Production
      : braintree.Environment.Sandbox,
  merchantId: process.env.BRAINTREE_MERCHANT_ID,
  publicKey: process.env.BRAINTREE_PUBLIC_KEY,
  privateKey: process.env.BRAINTREE_PRIVATE_KEY,
});

export const generateBraintreeToken = async (req, res) => {
  try {
    const response = await braintreeGateway.clientToken.generate({});
    res.status(200).json({ clientToken: response.clientToken });
  } catch (error) {
    console.error("Error generating Braintree token:", error);
    res.status(500).json({ error: error.message });
  }
};

export const checkActivePlan = async (req, res) => {
  const cacheKey = 'check-active-plan';
  const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
  try {
    const userId = req.user.id;

    // Check if user has any active (approved) plan
    const activePlan = await PlanPurchaseModel.findOne({
      user: userId,
      status: "approved",
    }).populate("plan");

    if (activePlan && activePlan.plan) {
      return res.status(200).json({
        success: true,
        hasActivePlan: true,
        activePlan: {
          planName: activePlan.plan.planName,
          planType: activePlan.plan.planType,
          features: activePlan.plan.features,
          submittedAt: activePlan.submittedAt,
        },
      });
    } else {
      return res.status(200).json({
        success: true,
        hasActivePlan: false,
        message:
          "No active plan found. Please purchase a plan to access premium features.",
      });
    }
  } catch (error) {
    console.error("Error checking active plan:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while checking plan status",
    });
  }
};

export const createPlanPurchase = async (req, res) => {
  try {
    const { planId, paymentMethod, paymentDetails } = req.body;
    const userId = req.user.id;

    if (!planId || !paymentMethod)
      return res
        .status(400)
        .json({ message: "Plan ID and payment method are required." });

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const plan = await PlanSchemaModel.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    // Restrict free plan multiple activation
    if (plan.planType === "free") {
      const existingFreePlan = await PlanPurchaseModel.findOne({
        user: userId,
        plan: planId,
      });
      if (existingFreePlan) {
        return res.status(400).json({
          message: "You have already activated this free plan.",
        });
      }

      // Expire all previous plans before activating new free plan
      await PlanPurchaseModel.updateMany(
        { user: userId, status: { $ne: "expired" } },
        { $set: { status: "expired" } }
      );

      const purchase = new PlanPurchaseModel({
        user: userId,
        plan: planId,
        amount: 0,
        paymentMethod: "free",
        status: "approved",
        startDate: new Date(),
        endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
      });

      await purchase.save();

      return res.status(201).json({
        message: "Free plan activated successfully",
        purchase,
      });
    }

    // Handle Paid Plan with Stripe or PayPal
    if (paymentMethod === "card") {
      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(plan.price * 100),
        currency: "usd",
        metadata: {
          userId: userId.toString(),
          planId: planId.toString(),
        },
        payment_method: paymentDetails.paymentMethodId,
        confirm: true,
        return_url:
          "http://localhost:3000/Fworkk/user/dashboard/client/planmanagement",
      });

      if (paymentIntent.status === "succeeded") {
        // Expire all previous plans before creating new one
        await PlanPurchaseModel.updateMany(
          { user: userId, status: { $ne: "expired" } },
          { $set: { status: "expired" } }
        );

        const purchase = new PlanPurchaseModel({
          user: userId,
          plan: planId,
          amount: plan.price,
          paymentMethod: "card",
          paymentDetails: {
            paymentIntentId: paymentIntent.id,
            receiptUrl: paymentIntent.charges?.data[0]?.receipt_url,
            cardBrand:
              paymentIntent.charges?.data[0]?.payment_method_details?.card
                ?.brand,
            last4:
              paymentIntent.charges?.data[0]?.payment_method_details?.card
                ?.last4,
            country:
              paymentIntent.charges?.data[0]?.billing_details?.address?.country,
            additionalDetails: paymentIntent,
          },
          status: "approved",
          startDate: new Date(),
          endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
        });

        await purchase.save();

        return res.status(201).json({
          message: "Plan purchased successfully",
          purchase,
          receiptUrl: paymentIntent.charges?.data[0]?.receipt_url,
        });
      } else {
        // If payment requires additional action, return the client secret
        return res.status(200).json({
          clientSecret: paymentIntent.client_secret,
        });
      }
    } else if (paymentMethod === "paypal") {
      if (!paymentDetails.orderID) {
        return res.status(400).json({
          message: "PayPal order ID is required.",
        });
      }
      try {
        const { accessToken, baseUrl } = await getPayPalAccessToken();
        
        const captureResponse = await fetch(
          `${baseUrl}/v2/checkout/orders/${paymentDetails.orderID}/capture`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        
        let captureData;
        try {
             captureData = await captureResponse.json();
        } catch(e) {
             console.error("Failed to parse PayPal capture response in createPlanPurchase", e);
             return res.status(500).json({ message: "Invalid response from PayPal" });
        }

        if (
          captureData.status === "COMPLETED" ||
          captureData.purchase_units?.[0]?.payments?.captures?.[0]?.status ===
            "COMPLETED"
        ) {
          // Expire all previous plans before creating new one
          await PlanPurchaseModel.updateMany(
            { user: userId, status: { $ne: "expired" } },
            { $set: { status: "expired" } }
          );
          const capture =
            captureData.purchase_units?.[0]?.payments?.captures?.[0] || null;
          const transactionId =
            (capture && capture.id) || captureData.id || null;
          const purchase = new PlanPurchaseModel({
            user: userId,
            plan: planId,
            amount: plan.price,
            paymentMethod: "paypal",
            paymentDetails: {
              orderID: paymentDetails.orderID,
              transactionId,
              paypalCapture: captureData,
            },
            status: "approved",
            startDate: new Date(),
            endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
          });
          await purchase.save();
          return res.status(201).json({
            message: "Plan purchased successfully via PayPal",
            purchase,
          });
        } else {
           console.error("PayPal Purchase Validation Failed:", JSON.stringify(captureData, null, 2));

           if (captureData.details && captureData.details[0] && captureData.details[0].issue === "ORDER_ALREADY_CAPTURED") {
                 return res.status(400).json({
                    message: "Order already processed. Please refresh.",
                    details: captureData,
                });
           }

          return res.status(400).json({
            message: "PayPal payment not completed.",
            details: captureData,
          });
        }
      } catch (err) {
        console.error("PayPal plan purchase error:", err);
        return res.status(500).json({
          message: "Internal server error during PayPal plan purchase.",
          error: err.message,
        });
      }
    } else if (paymentMethod === "wallet") {
      // Check if user has enough balance
      if ((user.totalEarnings || 0) < plan.price) {
        return res.status(400).json({
          message: "Insufficient wallet balance.",
        });
      }

      // Deduct from wallet
      user.totalEarnings -= plan.price;
      user.totalSpend = (user.totalSpend || 0) + plan.price;

      // Log the deduction
      if (!user.EarningLogs) user.EarningLogs = [];
      user.EarningLogs.push({ 
        amount: -plan.price, 
        date: new Date(),
        reason: `Plan purchase: ${plan.planName}`
      }); 

      // Send email notification for deduction
      await sendEarningUpdateEmail(
        user.email,
        user.username || user.Fullname,
        plan.price,
        'decrement',
        `Deduction for purchasing plan: "${plan.planName}"`
      );

      // Expire previous plans
      await PlanPurchaseModel.updateMany(
        { user: userId, status: { $ne: "expired" } },
        { $set: { status: "expired" } }
      );

      const purchase = new PlanPurchaseModel({
        user: userId,
        plan: planId,
        amount: plan.price,
        paymentMethod: "wallet",
        status: "approved",
        startDate: new Date(),
        endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
      });

      await purchase.save();
      
      // Transaction Log
      await Transaction.create({
        user: userId,
        type: "debit",
        amount: plan.price,
        balanceAfter: user.totalEarnings,
        category: "plan_purchase",
        description: `Purchased plan: ${plan.planName}`,
        planPurchaseId: purchase._id
      });

      await user.save();

      return res.status(201).json({
        message: "Plan purchased successfully via Wallet",
        purchase,
      });

    } else {
      return res
        .status(400)
        .json({ message: "Only Card, PayPal, or Wallet payment is supported." });
    }
  } catch (err) {
    console.error("Plan purchase error:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};

export const getMyPlan = async (req, res) => {
  try {
    const cacheKey = 'my-plan';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    const userId = req.user.id;

    // Get all plan purchases by the user, sorted by latest first
    const myPlans = await PlanPurchaseModel.find({ user: userId })
      .sort({ createdAt: -1 }) // Sort by latest first
      .populate("plan");

    if (!myPlans || myPlans.length === 0) {
      return res.status(404).json({
        message: "No plans found for this user.",
        plans: [],
        currentPlan: null,
      });
    }

    // Process plans to add additional information
    const processedPlans = myPlans.map((plan) => {
      const now = new Date();
      const endDate = new Date(plan.endDate);

      // Set time to start of day for accurate date comparison
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const planEndDate = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate()
      );

      const isExpired = plan.status === "expired" || planEndDate < today;

      return {
        ...plan._doc,
        isExpired,
        isCurrent: plan.status === "approved" && !isExpired,
      };
    });

    // Find the current active plan
    const currentPlan = processedPlans.find((plan) => plan.isCurrent);

    res.status(200).json({
      message: "Plans fetched successfully.",
      plans: processedPlans,
      currentPlan: currentPlan || null,
    });
  } catch (err) {
    console.error("Error fetching user plans:", err);
    res.status(500).json({
      message: "Internal server error while fetching user's plans.",
      error: err.message,
    });
  }
};

export const getLatestPlanForUser = async (req, res) => {
  try {
     const cacheKey = 'my-latest-plans';
     const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    const userId = req.user.id;

    // Get the most recent approved plan purchase by the user
    const latestPlan = await PlanPurchaseModel.findOne({
      user: userId,
      status: "approved", // Only get approved plans
    })
      .sort({ createdAt: -1 }) // Sort by most recent first
      .populate("plan");

    if (!latestPlan) {
      return res.status(404).json({
        success: false,
        message: "No active plan found for this user.",
        hasPlan: false,
      });
    }

    // Check if the plan has expired (endDate is in the past)
    const now = new Date();
    const endDate = new Date(latestPlan.endDate);

    // Set time to start of day for accurate date comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const planEndDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate()
    );

    const isExpired = planEndDate < today;
    const status = isExpired ? "expired" : latestPlan.status;

    // Calculate remaining days more accurately
    const remainingDays = isExpired
      ? 0
      : Math.max(0, Math.ceil((planEndDate - today) / (1000 * 60 * 60 * 24)));

    // Format the response with additional useful information
    const responseData = {
      ...latestPlan._doc,
      isExpired,
      status,
      remainingDays,
    };

    res.status(200).json({
      success: true,
      message: "Latest plan retrieved successfully",
      hasPlan: true,
      plan: responseData,
      isActive: status === "approved" && !isExpired,
    });
  } catch (err) {
    console.error("Error fetching latest plan:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching latest plan",
      error: err.message,
    });
  }
};

// ------------------ Add Funds Controller ------------------
export const addFunds = async (req, res) => {
  try {
    const { amount, paymentMethod, paymentDetails } = req.body;
    const userId = req.user.id;

    // Check minimum amount
    if (!amount || amount < 10) {
      return res.status(400).json({ message: "Minimum amount is $10." });
    }

    // Validate user
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Fetch dynamic addFundTax from SiteSettings
    let addFundTax = 10; // fallback default
    const settings = await SiteSettings.findOne();
    if (settings && typeof settings.addFundTax === "number") {
      addFundTax = settings.addFundTax;
    }

    // Handle card payments (Stripe)
    if (paymentMethod === "card") {
      if (!paymentDetails.paymentMethodId) {
        return res.status(400).json({
          message: "Payment method ID is required for card payments.",
        });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // in cents
        currency: "usd",
        metadata: {
          userId: userId.toString(),
          purpose: "add_funds",
        },
        payment_method: paymentDetails.paymentMethodId,
        confirm: true,
        return_url:
          "http://localhost:3000/Fworkk/user/dashboard/client/fundsummary",
      });

      if (paymentIntent.status === "succeeded") {
        const amountToAdd = amount - (amount * addFundTax) / 100;
        user.totalEarnings = (user.totalEarnings || 0) + amountToAdd;

        // Logs
        user.EarningLogs = user.EarningLogs || [];
        user.EarningLogs.push({ 
          amount: amountToAdd, 
          date: new Date(),
          reason: `Added funds via Card`
        });

        // Send email notification for addition
        await sendEarningUpdateEmail(
          user.email,
          user.username || user.Fullname,
          amountToAdd,
          'increment',
          `Funds added to your account via Card (Net: $${amountToAdd})`
        );

        user.addFundLogs = user.addFundLogs || [];
        user.addFundLogs.push({
          amount,
          credited: amountToAdd,
          date: new Date(),
          note: "",
          paymentMethod: "card",
          transactionId: paymentIntent.id,
        });

        // Add to PlanPurchaseModel as a fund transaction
        const fundPurchase = new PlanPurchaseModel({
          user: userId,
          plan: null,
          amount: amountToAdd,
          originalAmount: amount,
          taxPercent: addFundTax,
          taxAmount: (amount * addFundTax) / 100,
          paymentMethod: "card",
          paymentDetails: {
            paymentIntentId: paymentIntent.id,
            receiptUrl: paymentIntent.charges?.data[0]?.receipt_url,
            cardBrand:
              paymentIntent.charges?.data[0]?.payment_method_details?.card
                ?.brand,
            last4:
              paymentIntent.charges?.data[0]?.payment_method_details?.card
                ?.last4,
            country:
              paymentIntent.charges?.data[0]?.billing_details?.address?.country,
            additionalDetails: paymentIntent,
          },
          status: "approved",
          startDate: new Date(),
          endDate: null,
        });
        await fundPurchase.save();

        // Transaction Log
        await Transaction.create({
          user: userId,
          type: "credit",
          amount: amountToAdd,
          balanceAfter: user.totalEarnings,
          category: "add_fund",
          description: "Funds added via Card",
          grossAmount: amount,
          taxAmount: (amount * addFundTax) / 100,
          taxPercent: addFundTax,
          paymentId: paymentIntent.id
        });

        await user.save();

        return res.status(200).json({
          message: "Funds added successfully.",
          amountAdded: amountToAdd,
          taxPercent: addFundTax,
          taxAmount: (amount * addFundTax) / 100,
          originalAmount: amount,
          receiptUrl: paymentIntent.charges?.data[0]?.receipt_url,
        });
      } else {
        return res.status(200).json({
          clientSecret: paymentIntent.client_secret,
        });
      }
    }

    // Handle PayPal payments
    else if (paymentMethod === "paypal") {
      if (!paymentDetails.orderID) {
        return res.status(400).json({
          message: "PayPal order ID is required.",
        });
      }

      try {
        const { accessToken, baseUrl } = await getPayPalAccessToken();

        const captureResponse = await fetch(
          `${baseUrl}/v2/checkout/orders/${paymentDetails.orderID}/capture`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        let captureData;
        try {
             captureData = await captureResponse.json();
        } catch(e) {
             console.error("Failed to parse PayPal capture response in addFunds", e);
             return res.status(500).json({ message: "Invalid response from PayPal" });
        }

        if (
          captureData.status === "COMPLETED" ||
          captureData.purchase_units?.[0]?.payments?.captures?.[0]?.status ===
            "COMPLETED"
        ) {
          const amountToAdd = amount - (amount * addFundTax) / 100;
          user.totalEarnings = (user.totalEarnings || 0) + amountToAdd;

          // Logs
          user.EarningLogs = user.EarningLogs || [];
          user.EarningLogs.push({ 
            amount: amountToAdd, 
            date: new Date() ,
            reason: `Added funds via PayPal`
          });

          // Send email notification for addition
          await sendEarningUpdateEmail(
            user.email,
            user.username || user.Fullname,
            amountToAdd,
            'increment',
            `Funds added to your account via PayPal (Net: $${amountToAdd})`
          );

          user.addFundLogs = user.addFundLogs || [];
          user.addFundLogs.push({
            amount,
            credited: amountToAdd,
            date: new Date(),
            note: "",
            paymentMethod: "paypal",
            transactionId:
              captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id ||
              captureData.id,
          });

          // Add to PlanPurchaseModel as a fund transaction
          const fundPurchase = new PlanPurchaseModel({
            user: userId,
            plan: null,
            amount: amountToAdd,
            originalAmount: amount,
            taxPercent: addFundTax,
            taxAmount: (amount * addFundTax) / 100,
            paymentMethod: "paypal",
            paymentDetails: {
              paymentIntentId:
                captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id ||
                captureData.id,
              receiptUrl:
                captureData.purchase_units?.[0]?.payments?.captures?.[0]?.links?.find(
                  (link) => link.rel === "self"
                )?.href || null,
              additionalDetails: captureData,
            },
            status: "approved",
            startDate: new Date(),
            endDate: null,
          });
          await fundPurchase.save();

          // Transaction Log
          await Transaction.create({
            user: userId,
            type: "credit",
            amount: amountToAdd,
            balanceAfter: user.totalEarnings,
            category: "add_fund",
            description: "Funds added via PayPal",
            grossAmount: amount,
            taxAmount: (amount * addFundTax) / 100,
            taxPercent: addFundTax,
            paymentId: captureData.id
          });

          await user.save();

          return res.status(200).json({
            message: "Funds added successfully via PayPal.",
            amountAdded: amountToAdd,
            taxPercent: addFundTax,
            taxAmount: (amount * addFundTax) / 100,
            originalAmount: amount,
            receiptUrl:
              captureData.purchase_units?.[0]?.payments?.captures?.[0]?.links?.find(
                (link) => link.rel === "self"
              )?.href || null,
          });
        } else {
           console.error("PayPal Add Funds Verification Failed:", JSON.stringify(captureData, null, 2));
           
           if (captureData.details && captureData.details[0] && captureData.details[0].issue === "ORDER_ALREADY_CAPTURED") {
                 return res.status(400).json({
                    message: "Order already processed. Please refresh.",
                    details: captureData,
                });
           }

          return res.status(400).json({
            message: "PayPal payment not completed.",
            details: captureData,
          });
        }
      } catch (paypalError) {
        console.error("PayPal error:", paypalError);
        return res.status(500).json({
          message: "PayPal payment verification failed.",
          error: paypalError.message,
        });
      }
    }
    // Handle Moyasar payments
    else if (paymentMethod === "moyasar") {
      if (!paymentDetails.paymentId) {
        return res.status(400).json({
          message: "Moyasar payment ID is required.",
        });
      }

      try {
        const { MOYASAR_SECRET_KEY } = process.env;
        
        // Log key prefix for debugging (SAFE LOGGING)
        if (MOYASAR_SECRET_KEY) {
          console.log(`[DEBUG] Moyasar Key starts with: ${MOYASAR_SECRET_KEY.trim().substring(0, 8)}...`);
        } else {
          console.error("[DEBUG] MOYASAR_SECRET_KEY is UNDEFINED in process.env");
        }

        if (!MOYASAR_SECRET_KEY || MOYASAR_SECRET_KEY.trim().length < 5) {
          return res.status(500).json({
            message: "Moyasar integration error: Secret Key missing in server environment.",
          });
        }

        const secretKey = MOYASAR_SECRET_KEY.trim();
        // Official Moyasar Basic Auth: Base64(secret_key:)
        const auth = Buffer.from(`${secretKey}:`).toString("base64");

        const response = await fetch(
          `https://api.moyasar.com/v1/payments/${paymentDetails.paymentId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Basic ${auth}`,
            },
          }
        );

        const paymentData = await response.json();

        if (!response.ok) {
          console.error("Moyasar API 401 Debug - Status:", response.status);
          console.error("Moyasar API 401 Debug - Response:", paymentData);
          return res.status(response.status).json({
            message: `Moyasar API error: ${paymentData.message || "Invalid credentials"}`,
            details: paymentData
          });
        }

        if (paymentData.status === "paid" || paymentData.status === "captured") {
          const amountToAdd = amount - (amount * addFundTax) / 100;
          user.totalEarnings = (user.totalEarnings || 0) + amountToAdd;

          // Logs
          user.EarningLogs = user.EarningLogs || [];
          user.EarningLogs.push({ 
            amount: amountToAdd, 
            date: new Date(),
            reason: `Added funds via Moyasar`
          });

          // Send email notification for addition
          await sendEarningUpdateEmail(
            user.email,
            user.username || user.Fullname,
            amountToAdd,
            'increment',
            `Funds added to your account via Moyasar (Net: $${amountToAdd})`
          );

          user.addFundLogs = user.addFundLogs || [];
          user.addFundLogs.push({
            amount,
            credited: amountToAdd,
            date: new Date(),
            note: "Moyasar Payment",
            paymentMethod: "moyasar",
            transactionId: paymentData.id,
          });

          // Add to PlanPurchaseModel as a fund transaction
          const fundPurchase = new PlanPurchaseModel({
            user: userId,
            plan: null,
            amount: amountToAdd,
            originalAmount: amount,
            taxPercent: addFundTax,
            taxAmount: (amount * addFundTax) / 100,
            paymentMethod: "moyasar",
            paymentDetails: {
              paymentIntentId: paymentData.id,
              receiptUrl: paymentData.source?.transaction_url || null,
              additionalDetails: paymentData,
            },
            status: "approved",
            startDate: new Date(),
            endDate: null,
          });
          await fundPurchase.save();

          // Transaction Log
          await Transaction.create({
            user: userId,
            type: "credit",
            amount: amountToAdd,
            balanceAfter: user.totalEarnings,
            category: "add_fund",
            description: "Funds added via Moyasar",
            grossAmount: amount,
            taxAmount: (amount * addFundTax) / 100,
            taxPercent: addFundTax,
            paymentId: paymentData.id
          });

          await user.save();

          return res.status(200).json({
            message: "Funds added successfully via Moyasar.",
            amountAdded: amountToAdd,
            taxPercent: addFundTax,
            taxAmount: (amount * addFundTax) / 100,
            originalAmount: amount,
            receiptUrl: paymentData.source?.transaction_url || null,
          });
        } else {
          return res.status(400).json({
            message: `Moyasar payment status: ${paymentData.status}`,
            details: paymentData,
          });
        }
      } catch (moyasarError) {
        console.error("Moyasar error:", moyasarError);
        return res.status(500).json({
          message: "Moyasar payment verification failed.",
          error: moyasarError.message,
        });
      }
    }
    // Handle Braintree payments
    else if (paymentMethod === "braintree") {
      const { paymentMethodNonce } = paymentDetails;
      if (!paymentMethodNonce) {
        return res.status(400).json({ message: "Nonce is required." });
      }

      try {
        const result = await braintreeGateway.transaction.sale({
          amount: amount,
          paymentMethodNonce: paymentMethodNonce,
          options: {
            submitForSettlement: true,
          },
        });

        if (result.success) {
          const amountToAdd = amount - (amount * addFundTax) / 100;
          user.totalEarnings = (user.totalEarnings || 0) + amountToAdd;

            // Logs
            user.EarningLogs = user.EarningLogs || [];
            user.EarningLogs.push({ 
              amount: amountToAdd, 
              date: new Date(),
              reason: `Added funds via Braintree`
            });

            // Send email notification for addition
            await sendEarningUpdateEmail(
              user.email,
              user.username || user.Fullname,
              amountToAdd,
              'increment',
              `Funds added to your account via Braintree (Net: $${amountToAdd})`
            );

          user.addFundLogs = user.addFundLogs || [];
          user.addFundLogs.push({
            amount,
            credited: amountToAdd,
            date: new Date(),
            note: "Braintree Payment",
            paymentMethod: "braintree",
            transactionId: result.transaction.id,
          });

          // Add to PlanPurchaseModel
          const fundPurchase = new PlanPurchaseModel({
            user: userId,
            plan: null,
            amount: amountToAdd,
            originalAmount: amount,
            taxPercent: addFundTax,
            taxAmount: (amount * addFundTax) / 100,
            paymentMethod: "braintree",
            paymentDetails: {
              paymentIntentId: result.transaction.id,
              receiptUrl: null, // Braintree doesn't provide a public receipt URL easily
              additionalDetails: result.transaction,
            },
            status: "approved",
            startDate: new Date(),
            endDate: null,
          });
          await fundPurchase.save();

          // Transaction Log
          await Transaction.create({
            user: userId,
            type: "credit",
            amount: amountToAdd,
            balanceAfter: user.totalEarnings,
            category: "add_fund",
            description: "Funds added via Braintree",
            grossAmount: amount,
            taxAmount: (amount * addFundTax) / 100,
            taxPercent: addFundTax,
            paymentId: result.transaction.id
          });

          await user.save();

          return res.status(200).json({
            message: "Funds added successfully via Braintree.",
            amountAdded: amountToAdd,
            taxPercent: addFundTax,
            taxAmount: (amount * addFundTax) / 100,
            originalAmount: amount,
            receiptUrl: null,
          });
        } else {
          return res.status(500).json({
            message: "Braintree payment failed.",
            error: result.message,
          });
        }
      } catch (braintreeError) {
         console.error("Braintree error:", braintreeError);
         return res.status(500).json({
            message: "Braintree payment processing error.",
            error: braintreeError.message,
         });
      }
    }

    // Invalid method
    else {
      return res.status(400).json({
        message: "Invalid payment method. Supported methods: card, paypal, moyasar",
      });
    }
  } catch (err) {
    console.error("Add funds error:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};


// Helper for PayPal Access Token
export const getPayPalAccessToken = async () => {
  const { PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_MODE } = process.env;
  const baseUrl =
    PAYPAL_MODE === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
      
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`
  ).toString("base64");

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  if (data.access_token) {
      return { accessToken: data.access_token, baseUrl };
  } else {
      throw new Error("Failed to generate PayPal Access Token");
  }
};

// ------------------ Create PayPal Order ------------------
export const createPayPalOrder = async (req, res) => {
   try {
     const { planId, amount } = req.body;
     const { PAYPAL_CLIENT_ID, PAYPAL_SECRET } = process.env;

     if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
       return res
         .status(500)
         .json({ error: "PayPal configuration error - check environment vars" });
     }

     let price = 0;
     if (planId) {
       // If planId is provided, use plan price
       const plan = await PlanSchemaModel.findById(planId);
       if (!plan || !plan.price || plan.price <= 0) {
         return res.status(400).json({ error: "Invalid plan or price <= 0" });
       }
       price = plan.price;
     } else if (amount && !isNaN(amount) && Number(amount) > 0) {
       // If no planId, use amount from body
       price = Number(amount);
     } else {
       return res.status(400).json({ error: "Amount is required if no planId" });
     }

     const { accessToken, baseUrl } = await getPayPalAccessToken();

     const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         Authorization: `Bearer ${accessToken}`,
         Prefer: "return=representation",
       },
       body: JSON.stringify({
         intent: "CAPTURE",
         purchase_units: [
           {
             amount: {
               currency_code: "USD",
               value: parseFloat(price).toFixed(2),
             },
           },
         ],
         application_context: {
           brand_name: "Fworkk", // Updated brand name
           landing_page: "BILLING",
           user_action: "PAY_NOW",
           return_url: "http://localhost:3000/success", // Placeholder, processed via SDK logic usually
           cancel_url: "http://localhost:3000/cancel",
         },
       }),
     });

     if (!response.ok) {
       const errorData = await response.text();
       console.error("PayPal Create Order Error:", errorData);
       return res.status(response.status).json({
         error: "Failed to create PayPal order",
         details: errorData,
       });
     }

     const data = await response.json();
     res.json(data);
   } catch (error) {
     console.error("PayPal order creation error:", error);
     res.status(500).json({
       error: "Failed to create PayPal order",
       message: error.message,
     });
   }
};

// Helper function to verify PayPal payment (placeholder - implement actual PayPal API)
const verifyPayPalPayment = async (paymentId, payerId, amount) => {
  try {
    // Implement actual PayPal API integration here
    // This would typically involve:
    // 1. Verifying the payment with PayPal's API
    // 2. Capturing the payment
    // 3. Returning true if successful

    // For now, we'll simulate a successful payment
    console.log(
      `Verifying PayPal payment: ${paymentId}, Payer: ${payerId}, Amount: ${amount}`
    );
    return true;
  } catch (error) {
    console.error("PayPal payment verification error:", error);
    return false;
  }
};

export const teamPlanPurchase = async (req, res) => {
  try {
    const { planId, paymentMethod, paymentDetails } = req.body;
    const userId = req.user.id;

    if (!planId || !paymentMethod)
      return res
        .status(400)
        .json({ message: "Plan ID and payment method are required." });

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const plan = await PlanSchemaModel.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    // Restrict free plan multiple activation
    if (plan.planType === "free") {
      const existingFreePlan = await PlanPurchaseModel.findOne({
        user: userId,
        plan: planId,
      });
      if (existingFreePlan) {
        return res.status(400).json({
          message: "You have already activated this free plan.",
        });
      }

      // Expire all previous plans before activating new free plan
      await PlanPurchaseModel.updateMany(
        { user: userId, status: { $ne: "expired" } },
        { $set: { status: "expired" } }
      );

      const purchase = new PlanPurchaseModel({
        user: userId,
        plan: planId,
        amount: 0,
        paymentMethod: "free",
        status: "approved",
        startDate: new Date(),
        endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
      });

      await purchase.save();

      return res.status(201).json({
        message: "Free plan activated successfully",
        purchase,
      });
    }

    // Handle Paid Plan with Stripe or PayPal
    if (paymentMethod === "card") {
      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(plan.price * 100),
        currency: "usd",
        metadata: {
          userId: userId.toString(),
          planId: planId.toString(),
        },
        payment_method: paymentDetails.paymentMethodId,
        confirm: true,
        return_url:
          "http://localhost:3000/Fworkk/user/dashboard/client/planmanagement",
      });

      if (paymentIntent.status === "succeeded") {
        // Expire all previous plans before creating new one
        await PlanPurchaseModel.updateMany(
          { user: userId, status: { $ne: "expired" } },
          { $set: { status: "expired" } }
        );

        const purchase = new PlanPurchaseModel({
          user: userId,
          plan: planId,
          amount: plan.price,
          paymentMethod: "card",
          paymentDetails: {
            paymentIntentId: paymentIntent.id,
            receiptUrl: paymentIntent.charges?.data[0]?.receipt_url,
            cardBrand:
              paymentIntent.charges?.data[0]?.payment_method_details?.card
                ?.brand,
            last4:
              paymentIntent.charges?.data[0]?.payment_method_details?.card
                ?.last4,
            country:
              paymentIntent.charges?.data[0]?.billing_details?.address?.country,
            additionalDetails: paymentIntent,
          },
          status: "approved",
          startDate: new Date(),
          endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
        });

        await purchase.save();

        return res.status(201).json({
          message: "Plan purchased successfully",
          purchase,
          receiptUrl: paymentIntent.charges?.data[0]?.receipt_url,
        });
      } else {
        // If payment requires additional action, return the client secret
        return res.status(200).json({
          clientSecret: paymentIntent.client_secret,
        });
      }
    } else if (paymentMethod === "paypal") {
      if (!paymentDetails.orderID) {
        return res.status(400).json({
          message: "PayPal order ID is required.",
        });
      }
      try {
        const { accessToken, baseUrl } = await getPayPalAccessToken();
        
        const captureResponse = await fetch(
          `${baseUrl}/v2/checkout/orders/${paymentDetails.orderID}/capture`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        
        let captureData;
        try {
             captureData = await captureResponse.json();
        } catch(e) {
             console.error("Failed to parse PayPal capture response", e);
             return res.status(500).json({ message: "Invalid response from PayPal" });
        }

        if (
          captureData.status === "COMPLETED" ||
          captureData.purchase_units?.[0]?.payments?.captures?.[0]?.status ===
            "COMPLETED"
        ) {
          // Expire all previous plans before creating new one
          await PlanPurchaseModel.updateMany(
            { user: userId, status: { $ne: "expired" } },
            { $set: { status: "expired" } }
          );
          const capture =
            captureData.purchase_units?.[0]?.payments?.captures?.[0] || null;
          const transactionId =
            (capture && capture.id) || captureData.id || null;
          const purchase = new PlanPurchaseModel({
            user: userId,
            plan: planId,
            amount: plan.price,
            paymentMethod: "paypal",
            paymentDetails: {
              orderID: paymentDetails.orderID,
              transactionId,
              paypalCapture: captureData,
            },
            status: "approved",
            startDate: new Date(),
            endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
          });
          await purchase.save();
          return res.status(201).json({
            message: "Plan purchased successfully via PayPal",
            purchase,
          });
        } else {
          console.error("PayPal Validation Failed:", JSON.stringify(captureData, null, 2));
           // Check if it was already captured
           if (captureData.details && captureData.details[0] && captureData.details[0].issue === "ORDER_ALREADY_CAPTURED") {
                // If it was already captured, we might want to manually approve it or ask user to contact support
                // For now, fail but logging it clearly
                 return res.status(400).json({
                    message: "Order already processed. Please refresh.",
                    details: captureData,
                });
           }
          return res.status(400).json({
            message: "PayPal payment not completed/verified.",
            details: captureData,
          });
        }
      } catch (err) {
        console.error("PayPal plan purchase error:", err);
        return res.status(500).json({
          message: "Internal server error during PayPal plan purchase.",
          error: err.message,
        });
      }
    } else if (paymentMethod === "wallet") {
      // Check if user has enough balance
      if ((user.totalEarnings || 0) < plan.price) {
        return res.status(400).json({
          message: "Insufficient wallet balance.",
        });
      }

      // Deduct from wallet
      user.totalEarnings -= plan.price;
      user.totalSpend = (user.totalSpend || 0) + plan.price;

      // Expire previous Team plans
      // Note: Logic here might need to be specific to Team Plans if needed, 
      // but generic expiry seems to be the pattern.
      await PlanPurchaseModel.updateMany(
        { user: userId, status: { $ne: "expired" } },
        { $set: { status: "expired" } }
      );

      const purchase = new PlanPurchaseModel({
        user: userId,
        plan: planId,
        amount: plan.price,
        paymentMethod: "wallet",
        status: "approved",
        startDate: new Date(),
        endDate: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000),
      });

      await purchase.save();
      await user.save();

      return res.status(201).json({
        message: "Plan purchased successfully via Wallet",
        purchase,
      });

    } else {
      return res
        .status(400)
        .json({ message: "Only Card, PayPal, or Wallet payment is supported." });
    }
  } catch (err) {
    console.error("Plan purchase error:", err);
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};
// Add this to your PlanPurchaseController.js
export const getMyTeamPlans = async (req, res) => {
  try {
    const cacheKey = 'my-team-plan';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    const userId = req.user.id;

    // Get all team plan purchases by the user, sorted by latest first
    const purchasedPlans = await PlanPurchaseModel.find({ user: userId })
      .populate({
        path: "plan",
        model: "Plan",
        match: { planPurpose: "team" }, // Only include team plans
      })
      .sort({ createdAt: -1 });

    // Filter out any null plans (from the match condition)
    const filteredPlans = purchasedPlans.filter(
      (purchase) => purchase.plan !== null
    );

    // Process plans to add additional information
    const processedPlans = filteredPlans.map((purchase) => {
      const now = new Date();
      const endDate = new Date(purchase.endDate);

      // Set time to start of day for accurate date comparison
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const planEndDate = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate()
      );

      const isExpired = purchase.status === "expired" || planEndDate < today;

      // Calculate remaining days more accurately
      const remainingDays = isExpired
        ? 0
        : Math.max(0, Math.ceil((planEndDate - today) / (1000 * 60 * 60 * 24)));

      return {
        ...purchase._doc,
        isExpired,
        isActive: purchase.status === "approved" && !isExpired,
        remainingDays,
      };
    });

    res.status(200).json({
      success: true,
      message: "Purchased team plans retrieved successfully",
      plans: processedPlans,
      count: processedPlans.length,
    });
  } catch (err) {
    console.error("Error fetching purchased team plans:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching purchased team plans",
      error: err.message,
    });
  }
};

// Get total plan purchase amount (for admin dashboard)
export const getTotalPlanPurchaseAmount = async (req, res) => {
  try {
    const cacheKey = 'total-purchase-amount';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    // Only admin can access
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admins can access total purchase amount",
      });
    }
    // Sum all plan purchases' amount
    const result = await PlanPurchaseModel.aggregate([
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);
    const totalAmount = result.length > 0 ? result[0].totalAmount : 0;
    return res.status(200).json({ success: true, totalAmount });
  } catch (error) {
    console.error("Error getting total plan purchase amount:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get monthly plan purchase amounts for all years (for admin dashboard)
export const getMonthlyPlanPurchaseAmounts = async (req, res) => {
  try {
    const cacheKey = 'monthly-purchase-amount';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admins can access monthly purchase data",
      });
    }
    // Aggregate all purchases grouped by year and month
    const result = await PlanPurchaseModel.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);
    // Find earliest and latest year
    const years = result.map((r) => r._id.year);
    const uniqueYears = [...new Set(years)].sort();
    // Build a map: { [year]: [12 months array] }
    const data = {};
    uniqueYears.forEach((year) => {
      data[year] = Array(12).fill(0);
    });
    result.forEach((r) => {
      data[r._id.year][r._id.month - 1] = r.totalAmount;
    });
    return res.status(200).json({ success: true, data, years: uniqueYears });
  } catch (error) {
    console.error("Error getting monthly plan purchase amounts:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get all-time monthly plan purchase amounts using submittedAt
export const getAllTimeMonthlyPurchases = async (req, res) => {
  try {
    const cacheKey = 'alltime-monthly-purchases';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admins can access monthly purchase data",
      });
    }
    // Aggregate all purchases grouped by year and month using submittedAt
    const result = await PlanPurchaseModel.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$submittedAt" },
            month: { $month: "$submittedAt" },
          },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);
    // Find earliest and latest year
    const years = result.map((r) => r._id.year);
    const uniqueYears = [...new Set(years)].sort();
    // Build a map: { [year]: [12 months array] }
    const data = {};
    uniqueYears.forEach((year) => {
      data[year] = Array(12).fill(0);
    });
    result.forEach((r) => {
      data[r._id.year][r._id.month - 1] = r.totalAmount;
    });
    return res.status(200).json({ success: true, data, years: uniqueYears });
  } catch (error) {
    console.error(
      "Error getting all-time monthly plan purchase amounts:",
      error
    );
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get all plan purchases (admin only)
export const getAllPlanPurchases = async (req, res) => {
  try {
    const cacheKey = 'all-purchases';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admins can access all purchases",
      });
    }
    const purchases = await PlanPurchaseModel.find()
      .populate({ path: "user", select: "email Fullname name" })
      .populate({ path: "plan", model: "Plan", select: "name price" })
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: purchases });
  } catch (error) {
    console.error("Error getting all plan purchases:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get fund history for current user
export const getFundHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const history = await PlanPurchaseModel.find({
      user: userId,
      plan: null, // Only funds have plan = null
    })
      .sort({ submittedAt: -1 })
      .lean();

    const now = new Date();
    const enriched = history.map((item) => {
      const createdAt = new Date(item.submittedAt || item.createdAt || Date.now());
      const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
      
      return {
        ...item,
        canRefund:
          item.status === "approved" &&
          hoursDiff <= 24 &&
          (item.usedAmount || 0) === 0 &&
          (item.paymentMethod === "paypal" || item.paymentMethod === "card" || item.paymentMethod === "braintree"),
      };
    });

    return res.status(200).json(enriched);
  } catch (error) {
    console.error("Error getting fund history:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Process refund
export const refundFund = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const purchase = await PlanPurchaseModel.findOne({ _id: id, user: userId });
    if (!purchase) return res.status(404).json({ message: "Transaction not found." });

    if (purchase.status !== "approved") {
      return res.status(400).json({ message: "Only approved transactions can be refunded." });
    }

    const now = new Date();
    const createdAt = new Date(purchase.submittedAt || purchase.createdAt);
    const hoursDiff = (now - createdAt) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
      return res.status(400).json({ message: "Refund period (24h) has expired." });
    }

    if ((purchase.usedAmount || 0) > 0) {
      return res.status(400).json({ message: "Funds have already been used." });
    }

    // Update User Balance
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    if ((user.totalEarnings || 0) < purchase.amount) {
      return res.status(400).json({ message: "Funds have already been spent or insufficient balance." });
    }

    // Process Gateway Refund
    const refundTaxPercent = 2;
    const refundAmount = purchase.amount * (1 - refundTaxPercent / 100);

    if (purchase.paymentMethod === "paypal") {
      const { accessToken, baseUrl } = await getPayPalAccessToken();
      let captureId = purchase.paymentDetails?.paymentIntentId;

      // Robust check: if ID doesn't look like a capture or if we have additionalDetails, try to find it
      const captures = purchase.paymentDetails?.additionalDetails?.purchase_units?.[0]?.payments?.captures;
      if (captures && captures.length > 0) {
        captureId = captures[0].id;
      }

      if (!captureId) {
        return res.status(400).json({ message: "Missing PayPal Capture ID." });
      }

      console.log(`[REFUND] Attempting PayPal refund for ID: ${captureId}, Amount: ${refundAmount.toFixed(2)}`);

      let refundResponse = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          amount: {
            value: refundAmount.toFixed(2),
            currency_code: "USD",
          },
          note_to_payer: `Refund for fund addition. Deducted ${refundTaxPercent}% processing fee.`,
        }),
      });

      let refundData = await refundResponse.json();

      // If NOT_FOUND, maybe the ID was an Order ID. Try to fetch the order and find the capture.
      if (refundResponse.status === 404 && (refundData.name === "RESOURCE_NOT_FOUND" || refundData.message?.includes("not exist"))) {
        console.log(`[REFUND] Capture ID not found. Checking if ${captureId} is an Order ID...`);
        try {
          const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders/${captureId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          const orderData = await orderResponse.json();
          const foundCaptureId = orderData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
          
          if (foundCaptureId) {
            console.log(`[REFUND] Found Capture ID ${foundCaptureId} from Order ${captureId}. Retrying refund...`);
            captureId = foundCaptureId;
            
            const retryResponse = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                amount: {
                  value: refundAmount.toFixed(2),
                  currency_code: "USD",
                },
                note_to_payer: `Refund for fund addition. Deducted ${refundTaxPercent}% processing fee.`,
              }),
            });
            
            refundResponse = retryResponse;
            refundData = await retryResponse.json();
          }
        } catch (fetchErr) {
          console.error("[REFUND] Failed to fallback to Order fetch:", fetchErr);
        }
      }

      if (refundResponse.status !== 201) {
        console.error("[REFUND] PayPal Refund Error Final:", JSON.stringify(refundData, null, 2));
        return res.status(400).json({
          message: refundData.message || "PayPal refund failed.",
          details: refundData,
        });
      }
    } else if (purchase.paymentMethod === "card") {
      const refund = await stripe.refunds.create({
        payment_intent: purchase.paymentDetails.paymentIntentId,
        amount: Math.round(refundAmount * 100),
      });

      if (refund.status !== "succeeded" && refund.status !== "pending") {
        return res.status(400).json({ message: "Stripe refund failed." });
      }
    } else if (purchase.paymentMethod === "braintree") {
      const result = await braintreeGateway.transaction.refund(purchase.paymentDetails.paymentIntentId, refundAmount.toFixed(2));
      if (!result.success) {
        return res.status(400).json({ message: "Braintree refund failed: " + result.message });
      }
    } else {
      return res.status(400).json({ message: "Refund not supported for this payment method." });
    }

    // Update User Balance
    const amountToDeduct = purchase.amount; // Net amount that was added
    user.totalEarnings = (user.totalEarnings || 0) - amountToDeduct;

    user.EarningLogs.push({
      amount: -amountToDeduct,
      date: new Date(),
      reason: `Refund processed for transaction ${id}`,
    });

    await user.save();

    // Update Purchase Status
    purchase.status = "refunded";
    purchase.refundedAt = new Date();
    await purchase.save();

    return res.status(200).json({ success: true, message: "Refund processed successfully." });
  } catch (error) {
    console.error("Refund error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export const createNowPaymentsInvoice = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount < 10) {
      return res.status(400).json({ message: "Minimum amount is $10." });
    }

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Fetch dynamic addFundTax from SiteSettings
    let addFundTax = 10;
    const settings = await SiteSettings.findOne();
    if (settings && typeof settings.addFundTax === "number") {
      addFundTax = settings.addFundTax;
    }

    const orderId = `FUND-${userId}-${Date.now()}`;
    const description = `Add Funds for user ${user.username || user.Fullname}`;

    const invoice = await nowPayments.createInvoice(orderId, amount, "usd", description);

    if (invoice && invoice.invoice_url) {
      // Create a pending purchase record
      const amountToAdd = amount - (amount * addFundTax) / 100;
      const fundPurchase = new PlanPurchaseModel({
        user: userId,
        plan: null,
        amount: amountToAdd,
        originalAmount: amount,
        taxPercent: addFundTax,
        taxAmount: (amount * addFundTax) / 100,
        paymentMethod: "nowpayments",
        paymentDetails: {
          paymentIntentId: invoice.id,
          additionalDetails: invoice,
        },
        status: "pending",
        startDate: new Date(),
        endDate: null,
      });
      await fundPurchase.save();

      return res.status(200).json({
        success: true,
        invoice_url: invoice.invoice_url,
        payment_id: invoice.id,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to create NOWPayments invoice",
        details: invoice,
      });
    }
  } catch (error) {
    console.error("NOWPayments initialize error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export const nowPaymentsWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-nowpayments-sig"];
    const payload = req.body;

    console.log("NOWPayments Webhook received:", JSON.stringify(payload));

    const isValid = nowPayments.verifyIPN(payload, signature);
    if (!isValid) {
      console.error("Invalid NOWPayments Webhook signature");
      return res.status(400).send("Invalid signature");
    }

    const { payment_status, order_id } = payload;

    if (payment_status === "finished") {
      // Find the pending purchase
      const purchase = await PlanPurchaseModel.findOne({
        $or: [
            { "paymentDetails.paymentIntentId": payload.payment_id },
            { "paymentDetails.additionalDetails.order_id": order_id }
        ],
        status: "pending",
      }).populate("user");

      if (purchase && purchase.status === "pending") {
        const user = purchase.user;
        const amountToAdd = purchase.amount;

        user.totalEarnings = (user.totalEarnings || 0) + amountToAdd;

        // Logs
        user.EarningLogs = user.EarningLogs || [];
        user.EarningLogs.push({
          amount: amountToAdd,
          date: new Date(),
          reason: `Added funds via NOWPayments (Crypto)`,
        });

        // Send email
        await sendEarningUpdateEmail(
          user.email,
          user.username || user.Fullname,
          amountToAdd,
          "increment",
          `Crypto funds added to your account via NOWPayments (Net: $${amountToAdd})`
        );

        user.addFundLogs = user.addFundLogs || [];
        user.addFundLogs.push({
          amount: purchase.originalAmount,
          credited: amountToAdd,
          date: new Date(),
          note: "Crypto Payment",
          paymentMethod: "nowpayments",
          transactionId: payload.payment_id,
        });

        purchase.status = "approved";
        purchase.paymentDetails.additionalDetails = {
            ...purchase.paymentDetails.additionalDetails,
            ipn_payload: payload
        };

        await purchase.save();
        await user.save();

        console.log(`Successfully processed NOWPayments for order ${order_id}`);
      }
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("NOWPayments Webhook error:", error);
    return res.status(500).send("Internal Error");
  }
};
