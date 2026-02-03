import mongoose from "mongoose";

const receivedEmailSchema = new mongoose.Schema({
  from: String,
  to: String,
  subject: String,
  text: String,
  html: String,
  receivedAt: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false },
  resendId: String, // ID from Resend inbound
}, { timestamps: true });

const ReceivedEmail = mongoose.model("ReceivedEmail", receivedEmailSchema);
export default ReceivedEmail;
