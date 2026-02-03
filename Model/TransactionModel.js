import mongoose from "mongoose";

/**
 * TransactionModel - Production-level financial ledger
 * 
 * This model tracks ALL money movements in the platform.
 * Every credit/debit to a user's totalEarnings should create a transaction record.
 * 
 * Benefits:
 * - Complete audit trail for financial compliance
 * - Admin can generate revenue reports
 * - Detect discrepancies: sum(transactions) should equal user.totalEarnings
 * - Tax reporting ready
 */

const transactionSchema = new mongoose.Schema(
  {
    // ========== PARTIES INVOLVED ==========
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    // Other party in transaction (e.g., client paying freelancer)
    counterparty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },

    // ========== MONEY FLOW ==========
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    // Amount is ALWAYS positive. Type determines direction.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // User's balance AFTER this transaction (for audit verification)
    balanceAfter: {
      type: Number,
      required: true,
    },

    // ========== CATEGORIZATION ==========
    category: {
      type: String,
      enum: [
        "add_fund",           // User adds money to wallet
        "project_creation",   // Client creates project (budget locked)
        "project_payment",    // Freelancer receives payment for completed project
        "project_refund",     // Client gets refund (cancelled project)
        "task_creation",      // TeamHub task budget locked
        "task_payment",       // Freelancer gets paid for task
        "task_refund",        // Task cancelled, amount refunded
        "withdrawal",         // User withdraws to bank/PayPal
        "platform_fee",       // Platform takes commission
        "referral_bonus",     // Referral reward
        "bonus",              // Any other bonus
        "adjustment",         // Manual admin adjustment
        "project_purchase",   // Buying a project from marketplace
        "project_sale",       // Selling a project on marketplace
        "plan_purchase",      // Buying a membership plan
      ],
      required: true,
    },

    // ========== REFERENCES (for linking to source) ==========
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientPostProject",
      default: null,
    },
    taskId: {
      type: String, // TeamHub uses embedded task IDs
      default: null,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeamHub",
      default: null,
    },
    payoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentAccount",
      default: null,
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectPurchase",
      default: null,
    },
    planPurchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlanPurchase",
      default: null,
    },

    // ========== DETAILS ==========
    description: {
      type: String,
      required: true,
      maxlength: 500,
    },
    // Tax/Fee details for this transaction
    taxAmount: {
      type: Number,
      default: 0,
    },
    taxPercent: {
      type: Number,
      default: 0,
    },
    // Original amount before tax (useful for receipts)
    grossAmount: {
      type: Number,
      default: null,
    },
    // Payment Gateway ID (Stripe, PayPal, etc)
    paymentId: {
      type: String,
      default: null,
    },

    // ========== STATUS ==========
    status: {
      type: String,
      enum: ["completed", "pending", "failed", "reversed"],
      default: "completed",
    },

    // ========== METADATA (for security/fraud detection) ==========
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    // Reference to original earning log entry (for backwards compatibility)
    earningLogIndex: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

// ========== INDEXES FOR FAST QUERIES ==========
// User's transaction history (most common query)
transactionSchema.index({ user: 1, createdAt: -1 });
// Admin: filter by category
transactionSchema.index({ category: 1, createdAt: -1 });
// Admin: find transactions for a project
transactionSchema.index({ projectId: 1 });
// Admin: daily/monthly reports
transactionSchema.index({ createdAt: -1 });
// Admin: pending transactions
transactionSchema.index({ status: 1 });

// ========== STATIC METHODS FOR COMMON QUERIES ==========

/**
 * Get user's transaction summary
 */
transactionSchema.statics.getUserSummary = async function (userId) {
  const result = await this.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = { totalCredits: 0, totalDebits: 0, creditCount: 0, debitCount: 0 };
  result.forEach((r) => {
    if (r._id === "credit") {
      summary.totalCredits = r.total;
      summary.creditCount = r.count;
    } else {
      summary.totalDebits = r.total;
      summary.debitCount = r.count;
    }
  });
  summary.netBalance = summary.totalCredits - summary.totalDebits;
  return summary;
};

/**
 * Get platform revenue (all platform fees collected)
 */
transactionSchema.statics.getPlatformRevenue = async function (startDate, endDate) {
  const match = { category: "platform_fee" };
  if (startDate && endDate) {
    match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$amount" },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  return result[0] || { totalRevenue: 0, transactionCount: 0 };
};

/**
 * Verify user balance matches transaction history
 * Returns true if balance is correct, false if discrepancy found
 */
transactionSchema.statics.verifyUserBalance = async function (userId, currentBalance) {
  const summary = await this.getUserSummary(userId);
  const calculatedBalance = summary.netBalance;
  
  // Allow small floating point differences
  const difference = Math.abs(calculatedBalance - currentBalance);
  return {
    isValid: difference < 0.01,
    calculatedBalance,
    currentBalance,
    difference,
  };
};

const Transaction = mongoose.model("transactions", transactionSchema);

export default Transaction;
