import mongoose from "mongoose";
const { Schema } = mongoose;

// Generate unique report number (like RPT-202405311001)
function generateReportNumber() {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-T:\.Z]/g, "")
    .slice(0, 12);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `RPT-${timestamp}${random}`;
}

const reportSchema = new Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },
  reportNumber: {
    type: String,
    unique: true,
    default: generateReportNumber,
  },
  category: {
    type: String,
    enum: [
      "inappropriate_content",
      "fake_profile",
      "payment_issues",
      "project_not_submitted",
      "poor_communication",
      "spam_harassment",
      "fake_reviews",
      "copyright_violation",
      "other"
    ],
    required: true,
  },
  subCategory: {
    type: String,
    enum: [
      // inappropriate_content subcategories
      "explicit_content",
      "violent_content",
      "hate_speech",
      "misleading_information",
      
      // fake_profile subcategories
      "fake_identity",
      "stolen_photos",
      "fake_credentials",
      
      // payment_issues subcategories
      "payment_holding",
      "refund_issues",
      "fake_payment_proof",
      
      // project_not_submitted subcategories
      "delayed_submission",
      "incomplete_work",
      "no_submission",
      
      // poor_communication subcategories
      "unresponsive",
      "rude_behavior",
      "unprofessional",
      
      // spam_harassment subcategories
      "spam_messages",
      "harassment",
      "bullying",
      
      // fake_reviews subcategories
      "fake_positive_reviews",
      "fake_negative_reviews",
      "review_manipulation",
      
      // copyright_violation subcategories
      "stolen_content",
      "plagiarism",
      "unauthorized_use",
      
      // other subcategories
      "other_issue"
    ],
    required: true,
  },
  title: {
    type: String,
    required: true,
    maxlength: 200,
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  evidence: [{
    type: String, // URLs to uploaded images/screenshots
  }],
  status: {
    type: String,
    enum: ["pending", "under_review", "resolved", "dismissed", "action_taken"],
    default: "pending",
  },
  adminNotes: {
    type: String,
    maxlength: 1000,
  },
  actionTaken: {
    type: String,
    enum: ["warning", "temporary_suspension", "permanent_ban", "no_action", "other"],
  },
  actionDetails: {
    type: String,
    maxlength: 1000,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
  },
  reviewedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  aiAnalysis: {
    score: { type: Number }, // 0 to 100 confidence score
    summary: { type: String }, // Brief summary of analysis
    details: { type: mongoose.Schema.Types.Mixed }, // Detailed analysis data
    analyzedAt: { type: Date },
  },
});

// Indexes for better query performance
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ reportedUser: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ category: 1, status: 1 });

// Automatically update updatedAt on save
reportSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for getting report age
reportSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Ensure virtuals are serialized
reportSchema.set('toJSON', { virtuals: true });
reportSchema.set('toObject', { virtuals: true });

export default mongoose.model("reports", reportSchema);
