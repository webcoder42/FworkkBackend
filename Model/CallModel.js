import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    // Who initiated the call
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    // Who received the call
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    // Type of call: "audio" or "video"
    callType: {
      type: String,
      enum: ["audio", "video"],
      required: true,
    },

    // Call status: "missed", "rejected", "accepted", "ended"
    status: {
      type: String,
      enum: ["missed", "rejected", "accepted", "ended"],
      default: "missed",
    },

    // When the call started (in DB, usually when answered)
    startTime: {
      type: Date,
      default: null,
    },

    // When the call ended
    endTime: {
      type: Date,
      default: null,
    },

    // Duration of active call in seconds
    durationSeconds: {
      type: Number,
      default: 0,
    },

    // How long the call rang before being answered (in seconds)
    ringingTime: {
      type: Number,
      default: 0,
    },

    // Reason for call ending
    endReason: {
      type: String,
      enum: [
        "user-ended",
        "network-lost",
        "receiver-busy",
        "no-answer",
        "rejected",
        "missed",
        null,
      ],
      default: null,
    },

    // Optional: recording URL for future features
    recordingUrl: {
      type: String,
      default: null,
    },

    // Timestamp when call was created (ringing started)
    createdAt: {
      type: Date,
      default: Date.now,
    },

    // Timestamp for last update
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for faster queries
callLogSchema.index({ caller: 1, createdAt: -1 });
callLogSchema.index({ receiver: 1, createdAt: -1 });
callLogSchema.index({ status: 1 });

export default mongoose.model("CallLog", callLogSchema);
