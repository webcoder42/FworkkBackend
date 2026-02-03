import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: false,
  },

  // For platform chatbot
  message: { type: String, required: true },
  response: { type: String },
  userEmail: { type: String },
  username: { type: String },

  // WhatsApp specific fields
  waMessageId: { type: String, index: true }, // Meta ka message ID
  waFrom: { type: String }, // user ka WhatsApp number (E.164 format)
  waTo: { type: String }, // business ka WhatsApp number
  direction: { type: String, enum: ["inbound", "outbound"] },
  status: {
    type: String,
    enum: ["sent", "delivered", "read", "failed", "received"],
    default: "received",
  },
  type: {
    type: String,
    enum: [
      "text",
      "image",
      "audio",
      "video",
      "document",
      "template",
      "interactive",
    ],
    default: "text",
  },
  mediaUrl: { type: String },
  mediaMimeType: { type: String },
  caption: { type: String },

  // Classification flags (already existing)
  isFinancial: { type: Boolean, default: false },
  isKnowledgeBased: { type: Boolean, default: false },
  isActionable: { type: Boolean, default: false },
  isProposal: { type: Boolean, default: false },

  // Actions (for platform UI chatbot buttons)
  actions: [
    {
      type: { type: String, enum: ["link", "button", "email"] },
      label: { type: String },
      url: { type: String },
      description: { type: String },
    },
  ],

  createdAt: { type: Date, default: Date.now },
});

// Add search indexes
chatSchema.index({ userId: 1 });
chatSchema.index({ createdAt: -1 });
chatSchema.index({ message: "text", response: "text" });

export default mongoose.model("Chat", chatSchema);
