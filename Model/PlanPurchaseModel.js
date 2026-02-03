import mongoose from "mongoose";

const paymentDetailsSchema = new mongoose.Schema({
  paymentIntentId: { type: String },
  receiptUrl: { type: String },
  cardBrand: { type: String },  
  last4: { type: String }, 
  country: { type: String }, 
  additionalDetails: { type: mongoose.Schema.Types.Mixed }, 
});

const planPurchaseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Plan",
  },
  amount: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ["card", "free", "paypal", "moyasar", "wallet", "braintree", "nowpayments"], 
    default: "card",
  },
  paymentDetails: paymentDetailsSchema,
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "expired", "refunded"],
    default: "pending",
  },
  originalAmount: { type: Number },
  taxPercent: { type: Number },
  taxAmount: { type: Number },
  usedAmount: { type: Number, default: 0 },
  refundedAt: { type: Date },
  startDate: {
    type: Date,
    default: null,
  },
  endDate: {
    type: Date,
    default: null,
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexing for performance
planPurchaseSchema.index({ user: 1 });
planPurchaseSchema.index({ status: 1 });
planPurchaseSchema.index({ submittedAt: -1 });

export default mongoose.model("PlanPurchase", planPurchaseSchema);
