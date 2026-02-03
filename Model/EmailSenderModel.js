import mongoose from "mongoose";

// 1. Content Block Schema (The structured content user asked for)
const contentBlockSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["paragraph", "heading", "image", "quote", "heading1", "heading2", "heading3"],
    required: true,
  },
  value: {
    type: String,
    required: true,
  },
}, { _id: false });

// 2. Template Schema (For storing created templates)
const templateSchema = new mongoose.Schema({
  templateName: { type: String, required: true },
  subject: { type: String },
  content: [contentBlockSchema],
  createdAt: { type: Date, default: Date.now }
});

// 3. Sent Email Schema (For tracking who received emails)
const sentEmailLogSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users", // Reference to your User model
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
  // Optional: snapshot of what was sent
  templateName: { type: String } 
});

const EmailSenderSchema = new mongoose.Schema({
  // Section 1: Store Email / Company Details
  EmailContentDetail: {
    gmailCompanyName: { type: String },
    ownerName: { type: String },
    emailAddress: { type: String },
    // Add other company details here as needed
  },

  // Section 2: Sending Email (Logs of who received emails)
  // "jis jis ko email send ki ha os kay bad ak or banani ah"
  SendingEmail: [sentEmailLogSchema],

  // Section 3: All Templates (Library of all created templates)
  // "sary templat stor eh jo jo new tamplet create karo"
  AllTemplates: [templateSchema],

}, { timestamps: true });

export default mongoose.model("EmailSender", EmailSenderSchema);
