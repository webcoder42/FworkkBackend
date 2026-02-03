import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    certificateId: {
      type: String,
      unique: true,
      required: true,
    },
    title: {
      type: String, // e.g., "Top Rated Talent", "Founding Member"
      required: true,
    },
    description: {
      type: String,
    },
    tier: {
      type: String,
      enum: ["Bronze", "Silver", "Gold"],
      default: "Bronze"
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    snapshot: {
      fullname: String,
      username: String,
      userType: String,
      createdAt: Date,
      totalEarnings: Number,
      completedProjects: Number,
      rating: Number,
      skills: [String],
      topSkill: String,
      profileImage: String,
    },
    verificationUrl: {
      type: String,
    },
  },
  { timestamps: true }
);

const Certificate = mongoose.model("Certificate", certificateSchema);
export default Certificate;
