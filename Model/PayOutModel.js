import mongoose from "mongoose";

const linkedAccountSchema = new mongoose.Schema({
  accountMethod: {
    type: String,
    enum: ["paypal", "crypto"], 
    required: true,
  },
  paypalEmail: {
    type: String,
    required: false,
  },
  receiverName: {
    type: String,
    required: false,
  },
  cryptoWallet: {
    type: String,
    required: false,
  },
  cryptoNetwork: {
    type: String,
    required: false,
  },
  accountUniqueId: {
    type: String,
    required: true,
    unique: true,
  },
  linkedAt: {
    type: Date,
    default: Date.now,
  },
});

const withdrawalSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  taxAmount: {
    type: Number,
    default: 0,
  },
  netAmount: {
    type: Number,
    default: 0,
  },
  linkedAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true, // kis account pe withdrawal gaya
  },
  status: {
    type: String,
    // include admin-friendly statuses used in the admin UI
    enum: ["pending", "processing", "paid", "rejected", "completed", "failed"],
    default: "pending",
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
  },
});

const paymentAccountSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },

  // sab linked accounts array mein jama honge
  linkedAccounts: [linkedAccountSchema],

  // total withdrawal record
  totalWithdrawals: [withdrawalSchema],

  isActive: {
    type: Boolean,
    default: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

paymentAccountSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// auto-generate accountUniqueId for each linked account
linkedAccountSchema.pre("validate", function (next) {
  if (!this.accountUniqueId) {
    this.accountUniqueId = `ACC-${Math.random()
      .toString(36)
      .substr(2, 9)
      .toUpperCase()}`;
  }
  next();
});

export default mongoose.model("PaymentAccount", paymentAccountSchema);
