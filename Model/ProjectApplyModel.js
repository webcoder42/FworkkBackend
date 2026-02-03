import mongoose from "mongoose";

const projectApplicationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ClientPostProject",
    required: true,
  },
  IsPlanActive: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlanPurchase",
    default: null,
  },
  description: {
    type: String,
    required: true,
  },
  cvFile: {
    type: String, // File path or filename (e.g., "uploads/cvs/12345_cv.pdf")
    default: null,
  },
  skills: {
    type: [String],
    default: [],
  },
  status: {
    type: String,
    enum: ["pending", "rejected", "hired", "cancelled"],
    default: "pending",
  },
  appliedAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  cancellationReason: {
    type: String,
    trim: true,
  },
  cancellationDetails: {
    type: String,
    trim: true,
  },
});

projectApplicationSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

projectApplicationSchema.index({ user: 1 });
projectApplicationSchema.index({ project: 1 });
projectApplicationSchema.index({ status: 1 });
projectApplicationSchema.index({ appliedAt: -1 });

export default mongoose.model("apply", projectApplicationSchema);
