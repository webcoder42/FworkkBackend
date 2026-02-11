import ProjectPurchase from "../Model/ProjectPurchaseModel.js";
import ProjectMarketplace from "../Model/ProjectMarketplaceModel.js";
import User from "../Model/UserModel.js";
import Stripe from "stripe";
import fetch from "node-fetch";
import { getPayPalAccessToken } from "./PlanPurchaseController.js";
import {
  sendPaymentSuccessEmailToBuyer,
  sendPaymentNotificationToSeller,
  sendProjectSubmissionEmailToSeller,
  sendProjectSubmissionEmailToBuyer,
  sendProjectSubmissionNotificationToAdmin,
  sendProjectCancellationEmailToSeller,
  sendProjectDeliveryEmailToBuyer,
  sendProjectDeliveryEarningsEmailToSeller,
  sendEarningUpdateEmail,
} from "../services/EmailService.js";
import { redisClient } from "../server.js";

// Create a new project purchase with payment
export const createProjectPurchase = async (req, res) => {
  try {
    const { projectId, amount, buyerDescription, deliveryRequirements } =
      req.body;

    const buyerId = req.user._id || req.user.id;

    // Validate required fields
    if (!projectId || !amount || !buyerDescription) {
      return res.status(400).json({
        success: false,
        message: "Project ID, amount, and description are required",
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    // Find the project
    const project = await ProjectMarketplace.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if project is available for purchase
    if (project.status !== "published" || !project.isActive) {
      return res.status(400).json({
        success: false,
        message: "Project is not available for purchase",
      });
    }

    // Check if buyer is not the seller
    if (project.seller.toString() === buyerId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot purchase your own project",
      });
    }

    // Get buyer details
    const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    // Create project purchase record first
    const projectPurchase = new ProjectPurchase({
      buyer: buyerId,
      project: projectId,
      seller: project.seller,
      amount: amount,
      buyerDescription: buyerDescription,
      deliveryRequirements: deliveryRequirements || {},
      paymentMethod: "paytabs",
      status: "pending",
    });

    const savedPurchase = await projectPurchase.save();

    // Generate reference number for payment
    const referenceNumber = `PROJ_${savedPurchase._id
      .toString()
      .slice(-8)}_${Date.now()}`;

    // Create PayTabs payment page
    const paymentData = {
      amount: amount.toString(),
      currency: "PKR",
      referenceNumber: referenceNumber,
      customerEmail: buyer.email,
      customerName: buyer.Fullname || buyer.username,
      customerPhone: buyer.phone?.number || "",
      customerAddress: "",
      customerCity: "",
      customerCountry: "PK",
      customerZip: "",
      returnUrl: `${
        process.env.CLIENT_URL || "http://localhost:3000"
      }/payment/success?purchaseId=${savedPurchase._id}`,
      callbackUrl: `${
        process.env.SERVER_URL || "http://localhost:8080"
      }/api/v1/project-purchase/payment-callback`,
    };

    // ...existing code...

    // Update purchase with payment details
    savedPurchase.paymentDetails = {
      paymentIntentId: referenceNumber,
      receiptUrl: paymentPage.redirect_url,
      additionalDetails: {
        paytabsTransactionId: paymentPage.transaction_id,
        paymentPageUrl: paymentPage.redirect_url,
      },
    };

    await savedPurchase.save();

    // Add initial system message
    await savedPurchase.addMessage(
      null,
      `Purchase initiated for project: ${project.title}`,
      true
    );

    // Populate the saved purchase
    await savedPurchase.populate([
      { path: "project", select: "title price category images" },
      { path: "seller", select: "username profilePicture rating" },
      { path: "buyer", select: "username profilePicture" },
    ]);

    res.status(201).json({
      success: true,
      message: "Project purchase created successfully",
      purchase: savedPurchase,
      paymentPage: {
        redirectUrl: paymentPage.redirect_url,
        transactionId: paymentPage.transaction_id,
        referenceNumber: referenceNumber,
      },
    });
  } catch (error) {
    console.error("Error creating project purchase:", error);

    res.status(500).json({
      success: false,
      message: "Error creating project purchase",
      error: error.message,
    });
  }
};

// Create a direct project purchase (deduct from user balance)
export const createDirectProjectPurchase = async (req, res) => {
  try {
    const { projectId, amount, buyerDescription, deliveryRequirements } =
      req.body;

    const buyerId = req.user._id || req.user.id;

    // Validate required fields
    if (!projectId || !amount || !buyerDescription) {
      return res.status(400).json({
        success: false,
        message: "Project ID, amount, and description are required",
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    // Find the project
    const project = await ProjectMarketplace.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if project is available for purchase
    if (project.status !== "published" || !project.isActive) {
      return res.status(400).json({
        success: false,
        message: "Project is not available for purchase",
      });
    }

    // Check if buyer is not the seller
    if (project.seller.toString() === buyerId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot purchase your own project",
      });
    }

    // Get buyer details and check balance
    const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    // Check if user has sufficient balance
    if (buyer.balance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance. Please add funds to your account.",
      });
    }

    // Start a transaction to ensure data consistency
    const session = await ProjectPurchase.startSession();
    session.startTransaction();

    try {
      // Deduct amount from buyer's balance
      buyer.balance -= amount;

      // Add earning log for buyer (though it's balance, tracking it in EarningLogs as requested for additions/decrements)
      if (!buyer.EarningLogs) buyer.EarningLogs = [];
      buyer.EarningLogs.push({
        amount: -amount,
        date: new Date(),
        reason: `Purchased project: ${project.title}`
      });

      await buyer.save({ session });

      // Send email notification
      await sendEarningUpdateEmail(
        buyer.email,
        buyer.username || buyer.Fullname,
        amount,
        'decrement',
        `Deduction for purchasing project: "${project.title}"`
      );

      // Create project purchase record
      const projectPurchase = new ProjectPurchase({
        buyer: buyerId,
        project: projectId,
        seller: project.seller,
        amount: amount,
        buyerDescription: buyerDescription,
        deliveryRequirements: deliveryRequirements || {},
        paymentMethod: "balance",
        status: "paid",
        deliveryStatus: "not_started",
        paymentDetails: {
          paymentIntentId: `DIRECT_${Date.now()}_${buyerId
            .toString()
            .slice(-8)}`,
          cardBrand: "Account Balance",
          last4: "BAL",
          country: "PK",
          additionalDetails: {
            paymentMethodType: "balance_deduction",
            deductedFromBalance: true,
          },
        },
      });

      const savedPurchase = await projectPurchase.save({ session });

      // Add initial system message
      await savedPurchase.addMessage(
        null,
        `Purchase completed for project: ${project.title}`,
        true
      );

      // Commit the transaction
      await session.commitTransaction();

      // Populate the saved purchase
      await savedPurchase.populate([
        { path: "project", select: "title price category images" },
        { path: "seller", select: "username profilePicture rating email" },
        { path: "buyer", select: "username profilePicture email" },
      ]);

      // Send email notifications
      try {
        await sendPaymentSuccessEmailToBuyer(
          savedPurchase,
          buyer,
          savedPurchase.project
        );
        await sendPaymentNotificationToSeller(
          savedPurchase,
          savedPurchase.seller,
          savedPurchase.project,
          buyer
        );
      } catch (emailError) {
        console.error("Error sending email notifications:", emailError);
      }

      res.status(201).json({
        success: true,
        message: "Project purchase completed successfully",
        purchase: savedPurchase,
        newBalance: buyer.balance,
      });
    } catch (error) {
      // Rollback the transaction on error
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Error creating direct project purchase:", error);

    res.status(500).json({
      success: false,
      message: "Error creating project purchase",
      error: error.message,
    });
  }
};

// Create a wallet-based project purchase (deduct from user earnings)
export const createWalletProjectPurchase = async (req, res) => {
  try {
    const { projectId, amount, buyerDescription, deliveryRequirements } =
      req.body;

    const buyerId = req.user._id || req.user.id;

    // Validate required fields
    if (!projectId || !amount || !buyerDescription) {
      return res.status(400).json({
        success: false,
        message: "Project ID, amount, and description are required",
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    // Find the project
    const project = await ProjectMarketplace.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if project is available for purchase
    if (project.status !== "published" || !project.isActive) {
      return res.status(400).json({
        success: false,
        message: "Project is not available for purchase",
      });
    }

    // Check if buyer is not the seller
    if (project.seller.toString() === buyerId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot purchase your own project",
      });
    }

    // Get buyer details and check earnings
    const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    // Check if user has sufficient earnings
    if (buyer.totalEarnings < amount) {
      return res.status(400).json({
        success: false,
        message:
          "Insufficient earnings. You don't have enough earnings to make this purchase.",
      });
    }

    // Start a transaction to ensure data consistency
    const session = await ProjectPurchase.startSession();
    session.startTransaction();

    try {
      // Deduct amount from buyer's earnings
      buyer.totalEarnings -= amount;

      // Add earning log
      if (!buyer.EarningLogs) buyer.EarningLogs = [];
      buyer.EarningLogs.push({
        amount: -amount,
        date: new Date(),
        reason: `Purchased project (Wallet): ${project.title}`
      });

      await buyer.save({ session });

      // Send email notification
      await sendEarningUpdateEmail(
        buyer.email,
        buyer.username || buyer.Fullname,
        amount,
        'decrement',
        `Wallet deduction for purchasing project: "${project.title}"`
      );

      // Create project purchase record
      const projectPurchase = new ProjectPurchase({
        buyer: buyerId,
        project: projectId,
        seller: project.seller,
        amount: amount,
        buyerDescription: buyerDescription,
        deliveryRequirements: deliveryRequirements || {},
        paymentMethod: "wallet",
        status: "paid",
        deliveryStatus: "not_started",
        paymentDetails: {
          paymentIntentId: `WALLET_${Date.now()}_${buyerId
            .toString()
            .slice(-8)}`,
          cardBrand: "Wallet Earnings",
          last4: "WAL",
          country: "PK",
          additionalDetails: {
            paymentMethodType: "wallet_deduction",
            deductedFromEarnings: true,
            previousEarnings: buyer.totalEarnings + amount,
            newEarnings: buyer.totalEarnings,
          },
        },
      });

      const savedPurchase = await projectPurchase.save({ session });

      // Add initial system message
      await savedPurchase.addMessage(
        null,
        `Purchase completed for project: ${project.title} using wallet earnings`,
        true
      );

      // Commit the transaction
      await session.commitTransaction();

      // Populate the saved purchase
      await savedPurchase.populate([
        { path: "project", select: "title price category images" },
        { path: "seller", select: "username profilePicture rating email" },
        { path: "buyer", select: "username profilePicture email" },
      ]);

      // Send email notifications
      try {
        await sendPaymentSuccessEmailToBuyer(
          savedPurchase,
          buyer,
          savedPurchase.project
        );
        await sendPaymentNotificationToSeller(
          savedPurchase,
          savedPurchase.seller,
          savedPurchase.project,
          buyer
        );
      } catch (emailError) {
        console.error("Error sending email notifications:", emailError);
      }

      res.status(201).json({
        success: true,
        message:
          "Project purchase completed successfully using wallet earnings",
        purchase: savedPurchase,
        newEarnings: buyer.totalEarnings,
      });
    } catch (error) {
      // Rollback the transaction on error
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Error creating wallet project purchase:", error);

    res.status(500).json({
      success: false,
      message: "Error creating project purchase",
      error: error.message,
    });
  }
};

// Create a card-based project purchase (using Stripe)
export const createCardProjectPurchase = async (req, res) => {
  try {
    const {
      projectId,
      amount,
      buyerDescription,
      deliveryRequirements,
      paymentDetails,
    } = req.body;

    const buyerId = req.user._id || req.user.id;

    // Validate required fields
    if (!projectId || !amount || !buyerDescription) {
      return res.status(400).json({
        success: false,
        message: "Project ID, amount, and description are required",
      });
    }

    // Validate payment details for card payment
    if (!paymentDetails || !paymentDetails.paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "Payment method ID is required for card payments",
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    // Find the project
    const project = await ProjectMarketplace.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if project is available for purchase
    if (project.status !== "published" || !project.isActive) {
      return res.status(400).json({
        success: false,
        message: "Project is not available for purchase",
      });
    }

    // Check if buyer is not the seller
    if (project.seller.toString() === buyerId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot purchase your own project",
      });
    }

    // Get buyer details
    const buyer = await User.findById(buyerId);
    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    // Process payment with Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      metadata: {
        userId: buyerId.toString(),
        projectId: projectId,
        purpose: "project_purchase",
      },
      payment_method: paymentDetails.paymentMethodId,
      confirm: true,
      return_url: `${
        process.env.CLIENT_URL || "http://localhost:3000"
      }/B/a9fd38c3-4731-4e97-ae6e-83a4c8f8bd2e/dashboard/client/buyproject`,
    });

    if (paymentIntent.status === "succeeded") {
      // Create project purchase record
      const projectPurchase = new ProjectPurchase({
        buyer: buyerId,
        project: projectId,
        seller: project.seller,
        amount: amount,
        buyerDescription: buyerDescription,
        deliveryRequirements: deliveryRequirements || {},
        paymentMethod: "card",
        status: "paid",
        deliveryStatus: "not_started",
        paymentDetails: {
          paymentIntentId: paymentIntent.id,
          cardBrand: paymentIntent.payment_method?.card?.brand || "Unknown",
          last4: paymentIntent.payment_method?.card?.last4 || "****",
          country: "US",
          additionalDetails: {
            paymentMethodType: "card_payment",
            stripePaymentIntentId: paymentIntent.id,
            receiptUrl: paymentIntent.charges?.data[0]?.receipt_url,
          },
        },
      });

      const savedPurchase = await projectPurchase.save();

      // Add initial system message
      await savedPurchase.addMessage(
        null,
        `Purchase completed for project: ${project.title} using card payment`,
        true
      );

      // Populate the saved purchase
      await savedPurchase.populate([
        { path: "project", select: "title price category images" },
        { path: "seller", select: "username profilePicture rating email" },
        { path: "buyer", select: "username profilePicture email" },
      ]);

      // Send email notifications
      try {
        await sendPaymentSuccessEmailToBuyer(
          savedPurchase,
          buyer,
          savedPurchase.project
        );
        await sendPaymentNotificationToSeller(
          savedPurchase,
          savedPurchase.seller,
          savedPurchase.project,
          buyer
        );
      } catch (emailError) {
        console.error("Error sending email notifications:", emailError);
      }

      res.status(201).json({
        success: true,
        message: "Project purchase completed successfully using card payment",
        purchase: savedPurchase,
        paymentDetails: {
          paymentIntentId: paymentIntent.id,
          amount: amount,
          currency: "usd",
          receiptUrl: paymentIntent.charges?.data[0]?.receipt_url,
        },
      });
    } else {
      // Return client secret if action required
      res.status(200).json({
        success: false,
        message: "Payment requires additional action",
        clientSecret: paymentIntent.client_secret,
      });
    }
  } catch (error) {
    console.error("Error creating card project purchase:", error);

    res.status(500).json({
      success: false,
      message: "Error creating project purchase",
      error: error.message,
    });
  }
};

// Create a paypal-based project purchase
export const createPayPalProjectPurchase = async (req, res) => {
  try {
    const {
      projectId,
      amount,
      buyerDescription,
      deliveryRequirements,
      paymentDetails,
    } = req.body;

    const buyerId = req.user._id || req.user.id;

    // Validate required fields
    if (!projectId || !amount || !buyerDescription) {
      return res.status(400).json({
        success: false,
        message: "Project ID, amount, and description are required",
      });
    }

    // Validate payment details for paypal payment
    if (!paymentDetails || !paymentDetails.orderID) {
      return res.status(400).json({
        success: false,
        message: "PayPal order ID is required",
      });
    }

    // Validate amount
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    // Find the project
    const project = await ProjectMarketplace.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Check if project is available for purchase
    if (project.status !== "published" || !project.isActive) {
      return res.status(400).json({
        success: false,
        message: "Project is not available for purchase",
      });
    }

    // Check if buyer is not the seller
    if (project.seller.toString() === buyerId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot purchase your own project",
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
           console.error("Failed to parse PayPal capture response in project purchase", e);
           return res.status(500).json({ message: "Invalid response from PayPal" });
      }

      if (
        captureData.status === "COMPLETED" ||
        captureData.purchase_units?.[0]?.payments?.captures?.[0]?.status ===
          "COMPLETED"
      ) {
        const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0] || null;
        const transactionId = (capture && capture.id) || captureData.id || null;

        // Create project purchase record
        const projectPurchase = new ProjectPurchase({
          buyer: buyerId,
          project: projectId,
          seller: project.seller,
          amount: amount,
          buyerDescription: buyerDescription,
          deliveryRequirements: deliveryRequirements || {},
          paymentMethod: "paypal",
          status: "paid",
          deliveryStatus: "not_started",
          paymentDetails: {
            paymentIntentId: transactionId,
            orderID: paymentDetails.orderID,
            additionalDetails: {
              paymentMethodType: "paypal_payment",
              paypalOrderData: captureData,
              transactionId: transactionId
            },
          },
        });

        const savedPurchase = await projectPurchase.save();

        // Add initial system message
        await savedPurchase.addMessage(
          null,
          `Purchase completed for project: ${project.title} using PayPal payment`,
          true
        );

        // Populate the saved purchase
        await savedPurchase.populate([
          { path: "project", select: "title price category images" },
          { path: "seller", select: "username profilePicture rating email" },
          { path: "buyer", select: "username profilePicture email" },
        ]);

        // Get buyer details for email
        const buyer = await User.findById(buyerId);

        // Send email notifications (non-blocking)
        sendPaymentSuccessEmailToBuyer(
          savedPurchase,
          buyer,
          savedPurchase.project
        ).catch(err => console.error("Buyer email error:", err));
        sendPaymentNotificationToSeller(
          savedPurchase,
          savedPurchase.seller,
          savedPurchase.project,
          buyer
        ).catch(err => console.error("Seller email error:", err));

        res.status(201).json({
          success: true,
          message: "Project purchase completed successfully using PayPal payment",
          purchase: savedPurchase,
          paymentDetails: {
            transactionId: transactionId,
            amount: amount,
            currency: "usd",
          },
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "PayPal payment not completed",
          details: captureData
        });
      }
    } catch (paypalError) {
      console.error("PayPal verification error:", paypalError);
      return res.status(500).json({
        success: false,
        message: "PayPal payment verification failed",
        error: paypalError.message
      });
    }
  } catch (error) {
    console.error("Error creating PayPal project purchase:", error);
    res.status(500).json({
      success: false,
      message: "Error processing PayPal project purchase",
      error: error.message,
    });
  }
};

// Confirm payment and update purchase status
export const confirmPayment = async (req, res) => {
  try {
    const { referenceNumber } = req.body;

    if (!referenceNumber) {
      return res.status(400).json({
        success: false,
        message: "Reference number is required",
      });
    }

    // Find the purchase
    const purchase = await ProjectPurchase.findOne({
      "paymentDetails.paymentIntentId": referenceNumber,
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    if (
      paymentVerification.success &&
      paymentVerification.payment_status === "A"
    ) {
      // Update purchase status
      purchase.status = "paid";
      purchase.paymentDetails.receiptUrl = paymentVerification.receipt_url;

      // Add system message about payment confirmation
      await purchase.addMessage(null, "Payment confirmed successfully!", true);

      await purchase.save();

      // Populate the updated purchase
      await purchase.populate([
        { path: "project", select: "title price category images" },
        { path: "seller", select: "username profilePicture rating email" },
        { path: "buyer", select: "username profilePicture email" },
      ]);

      // Send email notifications
      try {
        await sendPaymentSuccessEmailToBuyer(
          purchase,
          purchase.buyer,
          purchase.project
        );
        await sendPaymentNotificationToSeller(
          purchase,
          purchase.seller,
          purchase.project,
          purchase.buyer
        );
      } catch (emailError) {
        console.error("Error sending email notifications:", emailError);
      }

      res.status(200).json({
        success: true,
        message: "Payment confirmed successfully",
        purchase: purchase,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Payment not completed or failed",
        paymentStatus: paymentVerification.payment_status,
      });
    }
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({
      success: false,
      message: "Error confirming payment",
      error: error.message,
    });
  }
};

// PayTabs payment callback
export const paymentCallback = async (req, res) => {
  try {
    const callbackData = req.body;

    console.log("PayTabs callback received:", callbackData);

    // ...existing code...
    // ...existing code...

    if (!processedData.success) {
      console.error("PayTabs callback processing failed:", processedData);
      return res.status(400).json({
        success: false,
        message: "Callback processing failed",
      });
    }

    // Find the purchase using the reference number
    const purchase = await ProjectPurchase.findOne({
      "paymentDetails.paymentIntentId": processedData.reference_no,
    });

    if (!purchase) {
      console.error(
        "Purchase not found for reference:",
        processedData.reference_no
      );
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    // Update purchase based on payment status
    if (processedData.payment_status === "A") {
      // Payment authorized/successful
      purchase.status = "paid";
      purchase.paymentDetails.receiptUrl = `https://secure.paytabs.com/receipt/${processedData.transaction_id}`;
      purchase.paymentDetails.additionalDetails = {
        ...purchase.paymentDetails.additionalDetails,
        paytabsTransactionId: processedData.transaction_id,
        paymentStatus: processedData.payment_status,
        verifiedAmount: processedData.amount,
        verifiedCurrency: processedData.currency,
      };

      await purchase.addMessage(null, "Payment completed successfully!", true);
      await purchase.save();

      // Populate purchase with user and project details for email
      await purchase.populate([
        { path: "project", select: "title price category images" },
        { path: "seller", select: "username profilePicture rating email" },
        { path: "buyer", select: "username profilePicture email" },
      ]);

      // Send email notifications
      try {
        await sendPaymentSuccessEmailToBuyer(
          purchase,
          purchase.buyer,
          purchase.project
        );
        await sendPaymentNotificationToSeller(
          purchase,
          purchase.seller,
          purchase.project,
          purchase.buyer
        );
      } catch (emailError) {
        console.error("Error sending email notifications:", emailError);
      }

      console.log("Payment confirmed for purchase:", purchase._id);
    } else if (processedData.payment_status === "E") {
      // Payment failed
      purchase.status = "cancelled";
      await purchase.addMessage(null, "Payment failed or was cancelled", true);
      await purchase.save();

      console.log("Payment failed for purchase:", purchase._id);
    }

    // Respond to PayTabs
    res.status(200).json({
      success: true,
      message: "Callback processed successfully",
    });
  } catch (error) {
    console.error("Error processing payment callback:", error);
    res.status(500).json({
      success: false,
      message: "Error processing callback",
    });
  }
};

// Get buyer's purchases
export const getBuyerPurchases = async (req, res) => {
  try {
    const buyerId = req.user._id || req.user.id;
    const { status, page = 1, limit = 10, type = "buyer" } = req.query;
    const cacheKey = `buyer-purchase:${buyerId}:${type}:${status || 'all'}:${page}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    const skip = (page - 1) * limit;

    let purchases, total;

    if (type === "seller") {
      // Get orders where user is the seller
      purchases = await ProjectPurchase.getSellerSales(buyerId, status)
        .skip(skip)
        .limit(parseInt(limit));
      total = await ProjectPurchase.countDocuments({ seller: buyerId });
    } else {
      // Get orders where user is the buyer (default)
      purchases = await ProjectPurchase.getBuyerPurchases(buyerId, status)
        .skip(skip)
        .limit(parseInt(limit));
      total = await ProjectPurchase.countDocuments({ buyer: buyerId });
    }

    res.status(200).json({
      success: true,
      purchases: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error getting purchases:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching purchases",
      error: error.message,
    });
  }
};

// Get seller's sales
export const getSellerSales = async (req, res) => {
  try {
    const sellerId = req.user._id || req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const cacheKey = `seller-sales:${sellerId}:${status || 'all'}:${page}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    const skip = (page - 1) * limit;

    const sales = await ProjectPurchase.getSellerSales(sellerId, status)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProjectPurchase.countDocuments({ seller: sellerId });

    res.status(200).json({
      success: true,
      sales: sales,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error getting seller sales:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching sales",
      error: error.message,
    });
  }
};

// Get specific purchase details
export const getPurchaseDetails = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const userId = req.user._id || req.user.id;

    const cacheKey = `purchase-detail:${purchaseId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    const purchase = await ProjectPurchase.findById(purchaseId)
      .populate("project", "title price category images description links")
      .populate("seller", "username profilePicture rating email")
      .populate("buyer", "username profilePicture email")
      .populate("messages.sender", "username profilePicture");

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    // Check if user is authorized to view this purchase
    if (
      purchase.buyer._id.toString() !== userId.toString() &&
      purchase.seller._id.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this purchase",
      });
    }

    res.status(200).json({
      success: true,
      purchase: purchase,
    });
  } catch (error) {
    console.error("Error getting purchase details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching purchase details",
      error: error.message,
    });
  }
};

// Add message to purchase
export const addPurchaseMessage = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const { content } = req.body;
    const senderId = req.user._id || req.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    const purchase = await ProjectPurchase.findById(purchaseId);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    // Check if user is authorized to send message
    if (
      purchase.buyer.toString() !== senderId.toString() &&
      purchase.seller.toString() !== senderId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to send message",
      });
    }

    await purchase.addMessage(senderId, content.trim());

    // Populate the updated purchase
    await purchase.populate([
      { path: "project", select: "title price category images" },
      { path: "seller", select: "username profilePicture rating" },
      { path: "buyer", select: "username profilePicture" },
      { path: "messages.sender", select: "username profilePicture" },
    ]);

    res.status(200).json({
      success: true,
      message: "Message added successfully",
      purchase: purchase,
    });
  } catch (error) {
    console.error("Error adding purchase message:", error);
    res.status(500).json({
      success: false,
      message: "Error adding message",
      error: error.message,
    });
  }
};

// Update delivery status (seller only)
export const updateDeliveryStatus = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const { deliveryStatus, notes } = req.body;
    const sellerId = req.user._id || req.user.id;

    const purchase = await ProjectPurchase.findById(purchaseId);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    // Check if user is the seller
    if (purchase.seller.toString() !== sellerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the seller can update delivery status",
      });
    }

    await purchase.updateDeliveryStatus(deliveryStatus);

    // Add system message about status update
    const statusMessages = {
      in_progress: "Project development has started",
      review: "Project is ready for review",
      delivered: "Project has been delivered",
      accepted: "Project has been accepted by buyer",
      rejected: "Project has been rejected by buyer",
    };

    if (statusMessages[deliveryStatus]) {
      await purchase.addMessage(null, statusMessages[deliveryStatus], true);
    }

    if (notes) {
      await purchase.addMessage(sellerId, notes);
    }

    // Populate the updated purchase
    await purchase.populate([
      { path: "project", select: "title price category images" },
      { path: "seller", select: "username profilePicture rating" },
      { path: "buyer", select: "username profilePicture" },
      { path: "messages.sender", select: "username profilePicture" },
    ]);

    res.status(200).json({
      success: true,
      message: "Delivery status updated successfully",
      purchase: purchase,
    });
  } catch (error) {
    console.error("Error updating delivery status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating delivery status",
      error: error.message,
    });
  }
};

// Add rating and review (buyer only)
export const addRating = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const { rating, review } = req.body;
    const buyerId = req.user._id || req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const purchase = await ProjectPurchase.findById(purchaseId);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    // Check if user is the buyer
    if (purchase.buyer.toString() !== buyerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can add rating",
      });
    }

    // Check if purchase is completed
    if (purchase.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Can only rate completed purchases",
      });
    }

    // Check if already rated
    if (purchase.rating) {
      return res.status(400).json({
        success: false,
        message: "Purchase already rated",
      });
    }

    await purchase.addRating(rating, review);

    // Add system message about rating
    await purchase.addMessage(
      null,
      `Purchase rated with ${rating} stars`,
      true
    );

    // Populate the updated purchase
    await purchase.populate([
      { path: "project", select: "title price category images" },
      { path: "seller", select: "username profilePicture rating" },
      { path: "buyer", select: "username profilePicture" },
    ]);

    res.status(200).json({
      success: true,
      message: "Rating added successfully",
      purchase: purchase,
    });
  } catch (error) {
    console.error("Error adding rating:", error);
    res.status(500).json({
      success: false,
      message: "Error adding rating",
      error: error.message,
    });
  }
};

// Rate delivered order (buyer only)
export const rateDeliveredOrder = async (req, res) => {
  try {
    const { orderId, rating, comment } = req.body;
    const buyerId = req.user._id || req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const purchase = await ProjectPurchase.findById(orderId);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user is the buyer
    if (purchase.buyer.toString() !== buyerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can rate this order",
      });
    }

    // Check if order is delivered
    if (purchase.deliveryStatus !== "delivered") {
      return res.status(400).json({
        success: false,
        message: "Can only rate delivered orders",
      });
    }

    // Check if already rated
    if (purchase.isRated) {
      return res.status(400).json({
        success: false,
        message: "Order already rated",
      });
    }

    // Update the purchase with rating
    purchase.rating = rating;
    purchase.comment = comment;
    purchase.isRated = true;
    purchase.ratedAt = new Date();

    await purchase.save();

    // Add system message about rating
    await purchase.addMessage(null, `Order rated with ${rating} stars`, true);

    // Populate the updated purchase
    await purchase.populate([
      { path: "project", select: "title price category images" },
      { path: "seller", select: "username profilePicture rating" },
      { path: "buyer", select: "username profilePicture" },
    ]);

    res.status(200).json({
      success: true,
      message: "Rating submitted successfully",
      purchase: purchase,
    });
  } catch (error) {
    console.error("Error rating order:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting rating",
      error: error.message,
    });
  }
};

// Cancel purchase (buyer only, before payment)
export const cancelPurchase = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const buyerId = req.user._id || req.user.id;

    const purchase = await ProjectPurchase.findById(purchaseId);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    // Check if user is the buyer
    if (purchase.buyer.toString() !== buyerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the buyer can cancel purchase",
      });
    }

    // Check if purchase can be cancelled
    if (purchase.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Purchase cannot be cancelled at this stage",
      });
    }

    purchase.status = "cancelled";
    await purchase.addMessage(null, "Purchase cancelled by buyer", true);
    await purchase.save();

    res.status(200).json({
      success: true,
      message: "Purchase cancelled successfully",
      purchase: purchase,
    });
  } catch (error) {
    console.error("Error cancelling purchase:", error);
    res.status(500).json({
      success: false,
      message: "Error cancelling purchase",
      error: error.message,
    });
  }
};

// Check if user has any orders (for debugging)
export const checkUserOrders = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const cacheKey = `check-user-order:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    console.log("Checking orders for user:", userId);

    // Check as buyer
    const buyerOrders = await ProjectPurchase.countDocuments({ buyer: userId });
    console.log("Orders as buyer:", buyerOrders);

    // Check as seller
    const sellerOrders = await ProjectPurchase.countDocuments({
      seller: userId,
    });
    console.log("Orders as seller:", sellerOrders);

    // Get all orders for this user (as buyer or seller)
    const allOrders = await ProjectPurchase.find({
      $or: [{ buyer: userId }, { seller: userId }],
    })
      .populate("project", "title")
      .populate("buyer", "username")
      .populate("seller", "username");

    console.log("All orders for user:", allOrders.length);

    res.status(200).json({
      success: true,
      data: {
        buyerOrders,
        sellerOrders,
        totalOrders: allOrders.length,
        orders: allOrders,
      },
    });
  } catch (error) {
    console.error("Error checking user orders:", error);
    res.status(500).json({
      success: false,
      message: "Error checking user orders",
      error: error.message,
    });
  }
};

// Create a test order for debugging
export const createTestOrder = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    console.log("Creating test order for user:", userId);

    // First, let's find a project to purchase (or create a dummy one)
    let testProject;
    try {
      testProject = await ProjectMarketplace.findOne({ status: "published" });
    } catch (error) {
      console.log("No published projects found, creating dummy project");
      // Create a dummy project for testing
      testProject = new ProjectMarketplace({
        title: "Test Project for Orders",
        description: "This is a test project to verify orders functionality",
        price: 100,
        category: "Web Development",
        seller: userId,
        status: "published",
        isActive: true,
      });
      await testProject.save();
    }

    if (!testProject) {
      return res.status(400).json({
        success: false,
        message: "No projects available for testing",
      });
    }

    // Create a test purchase
    const testPurchase = new ProjectPurchase({
      buyer: userId,
      project: testProject._id,
      seller: testProject.seller,
      amount: testProject.price,
      buyerDescription:
        "This is a test order to verify the orders functionality",
      paymentMethod: "test",
      status: "paid",
      deliveryStatus: "in_progress",
      paymentDetails: {
        paymentIntentId: `TEST_${Date.now()}`,
        cardBrand: "Test",
        last4: "TEST",
        country: "PK",
      },
    });

    await testPurchase.save();

    console.log("Test order created:", testPurchase._id);

    res.status(201).json({
      success: true,
      message: "Test order created successfully",
      order: testPurchase,
    });
  } catch (error) {
    console.error("Error creating test order:", error);
    res.status(500).json({
      success: false,
      message: "Error creating test order",
      error: error.message,
    });
  }
};

// Check user's own projects (for debugging)
export const checkUserProjects = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const cacheKey = `check-user-project:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    console.log("Checking projects for user:", userId);

    // Check user's own projects in ProjectMarketplace
    const userProjects = await ProjectMarketplace.find({ seller: userId });
    console.log("User projects:", userProjects.length);

    // Check if any of user's projects have been purchased
    const projectIds = userProjects.map((p) => p._id);
    const purchasedProjects = await ProjectPurchase.find({
      project: { $in: projectIds },
    })
      .populate("project", "title")
      .populate("buyer", "username");

    console.log("Purchased projects:", purchasedProjects.length);

    res.status(200).json({
      success: true,
      data: {
        userProjects: userProjects.length,
        purchasedProjects: purchasedProjects.length,
        projects: userProjects.map((p) => ({
          id: p._id,
          title: p.title,
          status: p.status,
        })),
        purchases: purchasedProjects.map((p) => ({
          id: p._id,
          projectTitle: p.project?.title,
          buyer: p.buyer?.username,
          status: p.status,
        })),
      },
    });
  } catch (error) {
    console.error("Error checking user projects:", error);
    res.status(500).json({
      success: false,
      message: "Error checking user projects",
      error: error.message,
    });
  }
};

// Get all orders for user (both as buyer and seller)
export const getAllUserOrders = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const cacheKey = `all-user-order:${userId}:${status || 'all'}:${page}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    const skip = (page - 1) * limit;

    // Get orders where user is either buyer or seller
    const query = {
      $or: [{ buyer: userId }, { seller: userId }],
    };

    if (status) {
      query.status = status;
    }

    const allOrders = await ProjectPurchase.find(query)
      .populate("project", "title price category images")
      .populate("seller", "username profilePicture rating")
      .populate("buyer", "username profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProjectPurchase.countDocuments(query);

    res.status(200).json({
      success: true,
      orders: allOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error getting all user orders:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
    });
  }
};

// Submit project for review
export const submitProject = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const { deliveryRequirements } = req.body;
    const sellerId = req.user._id || req.user.id;

    // Extract fields from deliveryRequirements
    const {
      githubLink,
      liveUrl,
      domainName,
      hostingProvider,
      documentationLink,
      setupInstructions,
      featuresImplemented,
      technologiesUsed,
      deploymentInstructions,
      additionalNotes,
    } = deliveryRequirements || {};

    // Validate required fields
    if (!githubLink && !liveUrl) {
      return res.status(400).json({
        success: false,
        message: "At least one link (GitHub or Live URL) is required",
      });
    }

    if (!setupInstructions || !featuresImplemented || !technologiesUsed) {
      return res.status(400).json({
        success: false,
        message:
          "Setup instructions, features implemented, and technologies used are required",
      });
    }

    // Validate GitHub URL if provided
    if (githubLink) {
      const githubUrlRegex = /^https?:\/\/github\.com\/[^/]+\/[^/]+$/;
      if (!githubUrlRegex.test(githubLink)) {
        return res.status(400).json({
          success: false,
          message: "Invalid GitHub repository URL",
        });
      }
    }

    // Validate Live URL if provided
    if (liveUrl) {
      const urlRegex = /^https?:\/\/.+/;
      if (!urlRegex.test(liveUrl)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Live URL format",
        });
      }
    }

    // Validate Documentation Link if provided
    if (documentationLink) {
      const urlRegex = /^https?:\/\/.+/;
      if (!urlRegex.test(documentationLink)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Documentation Link format",
        });
      }
    }

    const purchase = await ProjectPurchase.findById(purchaseId);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    // Check if user is the seller
    if (purchase.seller.toString() !== sellerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the seller can submit the project",
      });
    }

    // Check if project can be submitted
    if (
      purchase.deliveryStatus === "delivered" ||
      purchase.deliveryStatus === "accepted"
    ) {
      return res.status(400).json({
        success: false,
        message: "Project has already been submitted",
      });
    }

    // Allow resubmission if project was cancelled
    const isResubmission = purchase.deliveryStatus === "cancelled";

    // Create delivery requirements object with extracted fields
    const updatedDeliveryRequirements = {
      githubLink,
      liveUrl,
      domainName,
      hostingProvider,
      documentationLink,
      setupInstructions,
      featuresImplemented,
      technologiesUsed,
      deploymentInstructions,
      additionalNotes,
    };

    // Update delivery requirements and status
    purchase.deliveryRequirements = updatedDeliveryRequirements;
    purchase.deliveryStatus = "review";
    purchase.actualDeliveryDate = new Date();

    await purchase.save();

    // Add system message about submission
    const submissionMessage = isResubmission
      ? "Project resubmitted for review after cancellation. Team will review your updated submission and provide feedback."
      : "Project submitted for review. Team will review your submission and provide feedback.";

    await purchase.addMessage(null, submissionMessage, true);

    // Populate the updated purchase with email fields
    await purchase.populate([
      { path: "project", select: "title price category images" },
      { path: "seller", select: "username profilePicture rating email" },
      { path: "buyer", select: "username profilePicture email" },
    ]);

    // Send email notifications
    try {
      // 1. Email to Seller
      await sendProjectSubmissionEmailToSeller(
        purchase,
        purchase.seller,
        purchase.project,
        purchase.buyer
      );

      // 2. Email to Buyer
      await sendProjectSubmissionEmailToBuyer(
        purchase,
        purchase.buyer,
        purchase.project,
        purchase.seller
      );

      // 3. Email to all Admins
      const adminUsers = await User.find({ role: "admin" });

      for (const admin of adminUsers) {
        await sendProjectSubmissionNotificationToAdmin(
          admin.email,
          purchase,
          purchase.project,
          purchase.seller,
          purchase.buyer
        );
      }

      console.log("All email notifications sent successfully");
    } catch (emailError) {
      console.error("Error sending email notifications:", emailError);
      // Don't fail the submission if emails fail
    }

    console.log("Project submitted successfully:", purchase._id);

    res.status(200).json({
      success: true,
      message: isResubmission
        ? "Project resubmitted successfully for review. All parties have been notified."
        : "Project submitted successfully for review. All parties have been notified.",
      purchase: purchase,
    });
  } catch (error) {
    console.error("Error submitting project:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting project",
      error: error.message,
    });
  }
};

// Get all orders for admin
export const getAllOrdersForAdmin = async (req, res) => {
  try {
    const cacheKey = 'admin-show-order';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    // getAllOrdersForAdmin called with query
    console.log("User making request:", req.user);

    const { page = 1, limit = 50 } = req.query;

    const query = {};

    console.log("Final query for orders:", query);

    const skip = (page - 1) * limit;

    const orders = await ProjectPurchase.find(query)
      .populate(
        "project",
        "title price category images links features requirements"
      )
      .populate("buyer", "username email profilePicture")
      .populate("seller", "username email profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProjectPurchase.countDocuments(query);

    console.log(`Found ${orders.length} orders out of ${total} total`);

    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error getting orders for admin:", error);
    res.status(500).json({
      success: false,
      message: "Error getting orders for admin",
      error: error.message,
    });
  }
};

// Get all reviews for admin
export const getAllReviewsForAdmin = async (req, res) => {
  try {
    const cacheKey = 'admin-review';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    // getAllReviewsForAdmin called with query
    console.log("User making request:", req.user);

    const { page = 1, limit = 50 } = req.query;

    const query = {
      rating: { $exists: true, $ne: null },
      review: { $exists: true, $ne: null },
    };

    console.log("Final query for reviews:", query);

    const skip = (page - 1) * limit;

    const reviews = await ProjectPurchase.find(query)
      .populate(
        "project",
        "title price category images links features requirements"
      )
      .populate("buyer", "username email profilePicture")
      .populate("seller", "username email profilePicture")
      .sort({ reviewDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProjectPurchase.countDocuments(query);

    console.log(`Found ${reviews.length} reviews out of ${total} total`);

    res.json({
      success: true,
      reviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error getting reviews for admin:", error);
    res.status(500).json({
      success: false,
      message: "Error getting reviews for admin",
      error: error.message,
    });
  }
};

// Update order status by admin
export const updateOrderStatusByAdmin = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const { status, deliveryStatus } = req.body;

    const purchase = await ProjectPurchase.findById(purchaseId);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    if (status) {
      purchase.status = status;
    }

    if (deliveryStatus) {
      purchase.deliveryStatus = deliveryStatus;

      if (deliveryStatus === "delivered") {
        purchase.actualDeliveryDate = new Date();
      } else if (deliveryStatus === "accepted") {
        purchase.completedDate = new Date();
        purchase.status = "completed";
      } else if (deliveryStatus === "cancelled") {
        // Clear delivery requirements when cancelled
        purchase.deliveryRequirements = {};
        purchase.actualDeliveryDate = null;
      }
    }

    await purchase.save();

    // Add system message about status update
    const statusMessage = deliveryStatus
      ? `Delivery status updated to: ${deliveryStatus.replace("_", " ")}`
      : `Order status updated to: ${status}`;

    await purchase.addMessage(null, statusMessage, true);

    // Send email notifications based on status
    if (deliveryStatus === "cancelled") {
      try {
        // Populate purchase with user and project details for email
        await purchase.populate([
          { path: "project", select: "title price category images" },
          { path: "seller", select: "username profilePicture rating email" },
          { path: "buyer", select: "username profilePicture email" },
        ]);

        // Send cancellation email to seller
        await sendProjectCancellationEmailToSeller(
          purchase,
          purchase.seller,
          purchase.project,
          purchase.buyer
        );

        console.log("Project cancellation email sent to seller");
      } catch (emailError) {
        console.error("Error sending cancellation email:", emailError);
      }
    } else if (deliveryStatus === "delivered") {
      try {
        // Populate purchase with user and project details for email
        await purchase.populate([
          { path: "project", select: "title price category images links" },
          {
            path: "seller",
            select:
              "username profilePicture rating email Fullname totalEarnings",
          },
          { path: "buyer", select: "username profilePicture email Fullname" },
        ]);

        // Calculate earnings with 10% tax deduction
        const projectAmount = purchase.amount;
        const taxAmount = projectAmount * 0.1; // 10% tax
        const netEarnings = projectAmount - taxAmount;

        // Update seller's earnings
        const seller = purchase.seller;
        seller.totalEarnings = (seller.totalEarnings || 0) + netEarnings;

        // Add to earning logs
        if (!seller.EarningLogs) {
          seller.EarningLogs = [];
        }
        seller.EarningLogs.push({
          amount: netEarnings,
          date: new Date(),
          note: `Project delivery: ${
            purchase.project.title
          } (Tax: $${taxAmount.toFixed(2)})`,
        });

        await seller.save();

        // Send delivery email to buyer with CSV attachment
        console.log("📧 Preparing to send delivery email to buyer:", {
          buyerEmail: purchase.buyer?.email,
          purchaseId: purchase._id,
        });

        try {
          await sendProjectDeliveryEmailToBuyer(
            purchase,
            purchase.buyer,
            purchase.project,
            purchase.seller
          );
          console.log(
            "✅ Delivery email successfully sent to buyer:",
            purchase.buyer?.email
          );
        } catch (buyerEmailError) {
          console.error("❌ Failed to send delivery email to buyer:", {
            email: purchase.buyer?.email,
            error: buyerEmailError && buyerEmailError.message,
            stack: buyerEmailError && buyerEmailError.stack,
          });
        }

        try {
          await sendProjectDeliveryEarningsEmailToSeller(
            purchase,
            purchase.seller,
            purchase.project,
            netEarnings,
            taxAmount
          );
          console.log(
            "✅ Earnings notification email successfully sent to seller:",
            purchase.seller?.email
          );
        } catch (sellerEmailError) {
          console.error("❌ Failed to send earnings email to seller:", {
            email: purchase.seller?.email,
            error: sellerEmailError && sellerEmailError.message,
            stack: sellerEmailError && sellerEmailError.stack,
          });
        }
      } catch (emailError) {
        console.error("Error sending delivery email:", emailError);
      }
    }

    res.json({
      success: true,
      message: "Order status updated successfully",
      purchase,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating order status",
      error: error.message,
    });
  }
};

// Approve review by admin
export const approveReviewByAdmin = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const purchase = await ProjectPurchase.findById(reviewId);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    if (!purchase.rating || !purchase.review) {
      return res.status(400).json({
        success: false,
        message: "This purchase does not have a review",
      });
    }

    // Add a flag to mark review as approved
    purchase.reviewApproved = true;
    purchase.reviewApprovedAt = new Date();

    await purchase.save();

    res.json({
      success: true,
      message: "Review approved successfully",
    });
  } catch (error) {
    console.error("Error approving review:", error);
    res.status(500).json({
      success: false,
      message: "Error approving review",
      error: error.message,
    });
  }
};

// Reject review by admin
export const rejectReviewByAdmin = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const purchase = await ProjectPurchase.findById(reviewId);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    if (!purchase.rating || !purchase.review) {
      return res.status(400).json({
        success: false,
        message: "This purchase does not have a review",
      });
    }

    // Remove the review
    purchase.rating = null;
    purchase.review = null;
    purchase.reviewDate = null;
    purchase.reviewApproved = false;
    purchase.reviewApprovedAt = null;

    await purchase.save();

    res.json({
      success: true,
      message: "Review rejected and removed successfully",
    });
  } catch (error) {
    console.error("Error rejecting review:", error);
    res.status(500).json({
      success: false,
      message: "Error rejecting review",
      error: error.message,
    });
  }
};
