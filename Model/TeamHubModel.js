import mongoose from "mongoose";
const { Schema, model } = mongoose;

const teamHubSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    members: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "users",
        },
        role: {
          type: String,
          enum: ["admin", "member"],
          default: "member",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["active", "inactive"],
          default: "active",
        },
      },
    ],
    joinRequests: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "users",
        },
        message: {
          type: String,
          trim: true,
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        requestedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    chat: [
      {
        sender: {
          type: Schema.Types.ObjectId,
          ref: "users",
          required: true,
        },
        message: {
          type: String,
          required: true,
          trim: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        isAdmin: {
          type: Boolean,
          default: false,
        },
      },
    ],
    tasks: [
      {
        title: {
          type: String,
          required: true,
          trim: true,
        },
        description: {
          type: String,
          required: true,
          trim: true,
        },
        assignedTo: {
          type: Schema.Types.ObjectId,
          ref: "users",
        },
        assignedToEmail: {
          type: String,
          trim: true,
        },
        amount: {
          type: Number,
          default: 0,
        },
        status: {
          type: String,
          enum: ["pending", "in-progress", "completed", "cancelled"],
          default: "pending",
        },
        priority: {
          type: String,
          enum: ["low", "medium", "high", "urgent"],
          default: "medium",
        },
        dueDate: {
          type: Date,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        completedAt: {
          type: Date,
        },
        file: String,
        fileProof: String,
        proofDescription: String,
        proofSubmittedAt: Date,
        proofStatus: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        proofFeedback: String,
        payerId: {
          type: Schema.Types.ObjectId,
          ref: "users",
        },
      },
    ],
    settings: {
      allowMemberInvites: {
        type: Boolean,
        default: true,
      },
      allowTaskCreation: {
        type: Boolean,
        default: true,
      },
      allowMessages: {
        type: Boolean,
        default: true,
      },
      maxMembers: {
        type: Number,
        default: 10,
      },
      taskApprovalRequired: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "PlanPurchase",
    },
  },
  {
    timestamps: true,
  }
);

teamHubSchema.index({ createdBy: 1 });
teamHubSchema.index({ "members.user": 1 });
teamHubSchema.index({ "joinRequests.user": 1 });

const TeamHub = model("TeamHub", teamHubSchema);
export default TeamHub;
