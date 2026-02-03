import PayOutModel from "../Model/PayOutModel.js";
import User from "../Model/UserModel.js";
import SiteSettings from "../Model/SiteSettingsModel.js";
import Transaction from "../Model/TransactionModel.js";
import { isAdmin } from "../middleware/UserMiddleware.js";

// ✅ Controller: Link PayPal Account
export const linkPayPalAccount = async (req, res) => {
  try {
    const { userId, receiverName, paypalEmail } = req.body;

    if (!userId || !receiverName || !paypalEmail) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required fields (userId, receiverName, paypalEmail)",
      });
    }

    // Find or create payment account document for the user
    let paymentAccount = await PayOutModel.findOne({ user: userId });

    const linkedAccount = {
      accountMethod: "paypal",
      paypalEmail,
      receiverName,
    };

    if (!paymentAccount) {
      paymentAccount = new PayOutModel({
        user: userId,
        linkedAccounts: [linkedAccount],
      });
    } else {
      // push new linked account
      paymentAccount.linkedAccounts.push(linkedAccount);
    }

    await paymentAccount.save();

    // return the newly linked account (last element)
    const newlyLinked =
      paymentAccount.linkedAccounts[paymentAccount.linkedAccounts.length - 1];

    return res.status(201).json({
      success: true,
      message: "PayPal account linked successfully!",
      data: newlyLinked,
    });
  } catch (error) {
    console.error("Error linking PayPal account:", error);
    res.status(500).json({
      success: false,
      message: "Server error while linking PayPal account",
    });
  }
};

// ✅ Controller: Link Crypto Wallet
export const linkCryptoWallet = async (req, res) => {
  try {
    const { userId, cryptoWallet, cryptoNetwork } = req.body;

    if (!userId || !cryptoWallet || !cryptoNetwork) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields (userId, cryptoWallet, cryptoNetwork)",
      });
    }

    let paymentAccount = await PayOutModel.findOne({ user: userId });

    const linkedAccount = {
      accountMethod: "crypto",
      cryptoWallet,
      cryptoNetwork,
    };

    if (!paymentAccount) {
      paymentAccount = new PayOutModel({
        user: userId,
        linkedAccounts: [linkedAccount],
      });
    } else {
      paymentAccount.linkedAccounts.push(linkedAccount);
    }

    await paymentAccount.save();

    const newlyLinked = paymentAccount.linkedAccounts[paymentAccount.linkedAccounts.length - 1];

    return res.status(201).json({
      success: true,
      message: "Crypto wallet linked successfully!",
      data: newlyLinked,
    });
  } catch (error) {
    console.error("Error linking Crypto wallet:", error);
    res.status(500).json({
      success: false,
      message: "Server error while linking Crypto wallet",
    });
  }
};

// ✅ Controller: Get all PayPal accounts of a user
export const getUserPayPalAccounts = async (req, res) => {
  try {
    const { userId } = req.params;

    const paymentAccount = await PayOutModel.findOne({ user: userId });

    if (!paymentAccount || !paymentAccount.linkedAccounts) {
      return res.status(200).json({ success: true, data: null });
    }

    // return first active PayPal linked account (shape compatible with frontend)
    const paypalAcc = paymentAccount.linkedAccounts.find(
      (a) => a.accountMethod === "paypal"
    );

    return res.status(200).json({ success: true, data: paypalAcc || null });
  } catch (error) {
    console.error("Error fetching PayPal accounts:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching accounts",
    });
  }
};

// Get single PayPal account by id or user
export const getSinglePayPalAccount = async (req, res) => {
  try {
    const { id } = req.params; // could be paymentAccount id or linked account id

    // Try to find a payment account by id
    let paymentAccount = await PayOutModel.findById(id);

    if (paymentAccount) {
      const paypalAcc = paymentAccount.linkedAccounts.find(
        (a) => a.accountMethod === "paypal"
      );
      return res.status(200).json({ success: true, data: paypalAcc || null });
    }

    // otherwise try to find by user id
    paymentAccount = await PayOutModel.findOne({ user: id });
    if (paymentAccount) {
      const paypalAcc = paymentAccount.linkedAccounts.find(
        (a) => a.accountMethod === "paypal"
      );
      return res.status(200).json({ success: true, data: paypalAcc || null });
    }

    return res.status(200).json({ success: true, data: null });
  } catch (error) {
    console.error("Error fetching single PayPal account:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Unlink (deactivate) a PayPal account
export const unlinkPayPalAccount = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing userId" });
    }

    // remove all PayPal linked accounts for this user
    const account = await PayOutModel.findOneAndUpdate(
      { user: userId },
      { $pull: { linkedAccounts: { accountMethod: "paypal" } } },
      { new: true }
    );

    if (!account) {
      return res
        .status(404)
        .json({ success: false, message: "No payment account found" });
    }

    return res.status(200).json({
      success: true,
      message: "PayPal account(s) unlinked",
      data: account,
    });
  } catch (error) {
    console.error("Error unlinking PayPal account:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Unlink (deactivate) a Crypto account
export const unlinkCryptoAccount = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing userId" });
    }

    // remove all Crypto linked accounts for this user
    const account = await PayOutModel.findOneAndUpdate(
      { user: userId },
      { $pull: { linkedAccounts: { accountMethod: "crypto" } } },
      { new: true }
    );

    if (!account) {
      return res
        .status(404)
        .json({ success: false, message: "No payment account found" });
    }

    return res.status(200).json({
      success: true,
      message: "Crypto wallet(s) unlinked",
      data: account,
    });
  } catch (error) {
    console.error("Error unlinking Crypto account:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ➕ Create withdrawal request
export const createWithdrawal = async (req, res) => {
  try {
    const { userId, amount, linkedAccountId } = req.body;

    if (!userId || !amount || !linkedAccountId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    // check balance
    if ((user.totalEarnings || 0) < numericAmount) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient balance" });
    }

    // find payment account and linked account
    const paymentAccount = await PayOutModel.findOne({ user: userId });
    if (!paymentAccount)
      return res
        .status(404)
        .json({ success: false, message: "No linked payment account found" });

    const linkedAcc =
      paymentAccount.linkedAccounts.id(linkedAccountId) ||
      paymentAccount.linkedAccounts.find(
        (a) => a.accountUniqueId === linkedAccountId
      );
    if (!linkedAcc)
      return res
        .status(404)
        .json({ success: false, message: "Linked account not found" });

    // Fetch site settings for tax
    const settings = await SiteSettings.findOne();
    const cashoutTax = settings ? (settings.cashoutTax || 0) : 0;

    const taxAmount = (numericAmount * cashoutTax) / 100;
    const netAmount = numericAmount - taxAmount;

    // Deduct immediately from user's balance to avoid double-spend
    user.totalEarnings = (user.totalEarnings || 0) - numericAmount;

    // Add earning log
    if (!user.EarningLogs) user.EarningLogs = [];
    user.EarningLogs.push({
      amount: -numericAmount,
      date: new Date(),
      reason: `Withdrawal request: ${numericAmount}`
    });

    await user.save();

    // Send email notification
    await sendEarningUpdateEmail(
      user.email,
      user.username || user.Fullname,
      numericAmount,
      'decrement',
      `Deduction for withdrawal request: $${numericAmount}`
    );

    // ✅ Transaction Log: Withdrawal request
    try {
      await Transaction.create({
        user: user._id,
        type: "debit",
        amount: numericAmount,
        balanceAfter: user.totalEarnings,
        category: "withdrawal",
        description: `Withdrawal request: $${numericAmount} (Tax: $${taxAmount}, Net: $${netAmount})`,
        taxAmount,
        grossAmount: numericAmount,
      });
    } catch (txErr) {
      console.error("Transaction log error:", txErr);
    }

    const withdrawal = {
      amount: numericAmount,
      taxAmount,
      netAmount,
      linkedAccountId: linkedAcc._id,
      status: "pending",
    };

    paymentAccount.totalWithdrawals.push(withdrawal);
    await paymentAccount.save();

    return res.status(201).json({
      success: true,
      message: "Withdrawal requested",
      data: withdrawal,
    });
  } catch (error) {
    console.error("Error creating withdrawal:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Helper: Log withdrawal transaction
const logWithdrawalTransaction = async (user, amount, taxAmount, netAmount, payoutId, withdrawalId, type, category, description) => {
  try {
    await Transaction.create({
      user: user._id,
      type,
      amount,
      balanceAfter: user.totalEarnings,
      category,
      payoutId,
      description,
      taxAmount: taxAmount || 0,
      grossAmount: amount,
    });
  } catch (txErr) {
    console.error("Transaction log error:", txErr);
  }
};

export const getUserWithdrawals = async (req, res) => {
  try {
    const { userId } = req.params;
    const paymentAccount = await PayOutModel.findOne({ user: userId });
    if (!paymentAccount)
      return res.status(200).json({ success: true, data: [] });

    return res
      .status(200)
      .json({ success: true, data: paymentAccount.totalWithdrawals || [] });
  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /payout/summary - returns availableForWithdrawal and cashoutTax
export const getPayoutSummary = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : req.query.userId;

    if (!userId)
      return res
        .status(400)
        .json({ success: false, message: "Missing userId" });

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const paymentAccount = await PayOutModel.findOne({ user: userId });
    
    let pendingPayout = 0;
    let totalPayout = 0;

    if (paymentAccount && paymentAccount.totalWithdrawals) {
      paymentAccount.totalWithdrawals.forEach(w => {
        if (w.status === "pending" || w.status === "processing") {
          pendingPayout += Number(w.amount || 0);
        }
        if (w.status === "paid" || w.status === "completed") {
          totalPayout += Number(w.amount || 0);
        }
      });
    }

    // availableForWithdrawal is the current balance
    const availableForWithdrawal = user.totalEarnings || 0;

    // Fetch site settings for tax and minimum amount
    const settings = await SiteSettings.findOne();
    const cashoutTax = settings ? (settings.cashoutTax || 0) : 0;
    const minimumCashoutAmount = settings ? (settings.minimumCashoutAmount || 100) : 100;

    return res
      .status(200)
      .json({ 
        success: true, 
        data: { 
          availableForWithdrawal, 
          cashoutTax,
          pendingPayout,
          totalPayout,
          minimumCashoutAmount,
          totalEarnings: availableForWithdrawal // for compatibility if needed
        } 
      });
  } catch (error) {
    console.error("Error getting payout summary:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /payout/connected-accounts - returns user's linked accounts
export const getConnectedAccounts = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : req.query.userId;
    if (!userId)
      return res
        .status(400)
        .json({ success: false, message: "Missing userId" });

    const paymentAccount = await PayOutModel.findOne({ user: userId });
    const payoutAccounts = paymentAccount
      ? paymentAccount.linkedAccounts || []
      : [];

    return res.status(200).json({ success: true, payoutAccounts });
  } catch (error) {
    console.error("Error fetching connected accounts:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Note: Tax-related endpoints removed to keep server stable when TaxModel is absent.

// POST /payout/request-withdrawal - wrapper that uses authenticated user
export const requestWithdrawal = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { amount, accountIndex } = req.body;
    if (!amount || accountIndex === undefined)
      return res
        .status(400)
        .json({ success: false, message: "Missing amount or accountIndex" });

    // find user's connected accounts
    const paymentAccount = await PayOutModel.findOne({ user: userId });
    if (!paymentAccount)
      return res
        .status(400)
        .json({ success: false, message: "No connected accounts" });

    const index = parseInt(accountIndex, 10);
    const linked = paymentAccount.linkedAccounts[index];
    if (!linked)
      return res
        .status(404)
        .json({ success: false, message: "Selected account not found" });

    // forward to existing createWithdrawal logic
    req.body.linkedAccountId = linked._id;
    req.body.userId = userId;
    req.body.amount = amount;

    return createWithdrawal(req, res);
  } catch (error) {
    console.error("Error in requestWithdrawal:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ---------------- Admin endpoints ----------------
// GET /payout/admin/withdrawals - list all withdrawals across users
export const adminListWithdrawals = async (req, res) => {
  try {
    // Find all payment accounts and populate user basic info
    const paymentAccounts = await PayOutModel.find({}).populate(
      "user",
      "Fullname username email profileImage"
    );

    // Flatten withdrawals with associated payout (paymentAccount) and linked account details
    const all = [];
    for (const p of paymentAccounts) {
      const payoutId = p._id;
      const linkedAccounts = p.linkedAccounts || [];
      const user = p.user || null;

      const withdrawals = (p.totalWithdrawals || []).map((w) => {
        // find linked account details
        const acc = linkedAccounts.find(
          (la) =>
            String(la._id) === String(w.linkedAccountId) ||
            la.accountUniqueId === w.linkedAccountId
        );
        return {
          // keep payout doc id so admin can call update/delete routes
          payoutId,
          _id: w._id,
          user,
          amount: w.amount,
          taxAmount: w.taxAmount ?? null,
          netAmount: w.netAmount ?? null,
          status: w.status,
          requestedAt: w.requestedAt,
          processedAt: w.completedAt || w.processedAt || null,
          linkedAccountId: w.linkedAccountId,
          accountDetails: acc || null,
        };
      });

      all.push(...withdrawals);
    }

    return res.status(200).json({ success: true, withdrawals: all });
  } catch (error) {
    console.error("Error fetching admin withdrawals:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /payout/admin/withdrawals/stats - simple aggregated stats
export const adminWithdrawalsStats = async (req, res) => {
  try {
    const paymentAccounts = await PayOutModel.find({});
    let stats = {
      total: 0,
      pending: 0,
      processing: 0,
      paid: 0,
      rejected: 0,
      totalAmount: 0,
      totalTax: 0,
      totalNet: 0,
    };

    for (const p of paymentAccounts) {
      for (const w of p.totalWithdrawals || []) {
        stats.total += 1;
        stats.totalAmount += Number(w.amount || 0);
        const tax = Number(w.taxAmount || 0);
        const net = Number(w.netAmount || 0);
        stats.totalTax += tax;
        stats.totalNet += net;
        if (w.status === "pending") stats.pending += 1;
        else if (w.status === "processing") stats.processing += 1;
        else if (w.status === "paid" || w.status === "completed")
          stats.paid += 1;
        else if (w.status === "rejected") stats.rejected += 1;
      }
    }

    return res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error("Error computing withdrawal stats:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

import {
  sendWithdrawalPaidEmail,
  sendWithdrawalRejectedEmail,
  sendEarningUpdateEmail,
} from "../services/EmailService.js";

// PUT /payout/admin/withdrawals/:payoutId/:withdrawalId - update status
export const adminUpdateWithdrawalStatus = async (req, res) => {
  try {
    const { payoutId, withdrawalId } = req.params;
    const { status } = req.body;
    if (!payoutId || !withdrawalId)
      return res.status(400).json({ success: false, message: "Missing ids" });

    const paymentAccount = await PayOutModel.findById(payoutId);
    if (!paymentAccount)
      return res
        .status(404)
        .json({ success: false, message: "Payout record not found" });

    const w = paymentAccount.totalWithdrawals.id(withdrawalId);
    if (!w)
      return res
        .status(404)
        .json({ success: false, message: "Withdrawal not found" });

    const previousStatus = w.status;
    w.status = status;
    
    if (status === "paid" || status === "completed") {
      w.completedAt = new Date();
    }

    await paymentAccount.save();

    // --- Post-update logic: Emails & Balance Updates ---
    const user = await User.findById(paymentAccount.user);
    if (user) {
      // 1. Handle Rejection: Refund balance & Send Email
      if (status === "rejected" && previousStatus !== "rejected") {
        console.log(`💰 Refunding $${w.amount} to user ${user.username} (Withdrawal Rejected)`);
        user.totalEarnings = (user.totalEarnings || 0) + Number(w.amount);
        
        // Add earning log for refund
        if (!user.EarningLogs) user.EarningLogs = [];
        user.EarningLogs.push({
          amount: Number(w.amount),
          date: new Date(),
          reason: `Refund: Withdrawal #${withdrawalId} rejected`
        });

        await user.save();
        
        // Send earning update email
        await sendEarningUpdateEmail(
          user.email,
          user.username || user.Fullname,
          w.amount,
          'increment',
          `Refund for rejected withdrawal request: $${w.amount}`
        );

        // Send withdrawal rejection email
        await sendWithdrawalRejectedEmail(user, w.amount);

        // ✅ Transaction Log: Refund for rejected withdrawal
        try {
          await Transaction.create({
            user: user._id,
            type: "credit",
            amount: Number(w.amount),
            balanceAfter: user.totalEarnings,
            category: "project_refund",
            payoutId: paymentAccount._id,
            description: `Refund for rejected withdrawal #${withdrawalId}`,
          });
        } catch (txErr) {
          console.error("Transaction log error:", txErr);
        }
      }
      
      // 2. Handle Un-Rejection (Admin correction): Deduct balance again
      else if (previousStatus === "rejected" && status !== "rejected") {
        console.log(`Correction: Deducting $${w.amount} from user ${user.username} (Withdrawal Un-rejected)`);
        user.totalEarnings = (user.totalEarnings || 0) - Number(w.amount);
        await user.save();
      }

      // 3. Handle Paid: Send Email
      if (
        (status === "paid" || status === "completed") && 
        previousStatus !== "paid" && 
        previousStatus !== "completed"
      ) {
        await sendWithdrawalPaidEmail(user, w.amount, String(w._id));
      }
    }

    return res.status(200).json({ success: true, message: "Status updated successfully" });
  } catch (error) {
    console.error("Error updating withdrawal status:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// DELETE /payout/admin/withdrawals/:payoutId/:withdrawalId - delete
export const adminDeleteWithdrawal = async (req, res) => {
  try {
    const { payoutId, withdrawalId } = req.params;
    const paymentAccount = await PayOutModel.findById(payoutId);
    if (!paymentAccount)
      return res
        .status(404)
        .json({ success: false, message: "Payout record not found" });

    const w = paymentAccount.totalWithdrawals.id(withdrawalId);
    if (!w)
      return res
        .status(404)
        .json({ success: false, message: "Withdrawal not found" });

    w.remove();
    await paymentAccount.save();

    return res.status(200).json({ success: true, message: "Deleted" });
  } catch (error) {
    console.error("Error deleting withdrawal:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
