import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
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
    experience: {
      type: String,
      required: true,
      trim: true,
    },
    problems: {
      type: String,
      required: true,
      trim: true,
    },
    bonus: {
      type: String,
      required: false,
      trim: true,
    },
    budget: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Website Development",
        "Frontend Development",
        "Backend Development",
        "Full Stack Development",
        "WordPress Development",
        "Shopify Development",
        "Ecommerce Website Development",
        "Mobile App Development",
        "Android App Development",
        "iOS App Development",
        "React Native Development",
        "Flutter App Development",
        "UI/UX Design",
        "Web App Bug Fixing",
        "API Integration",
        "Custom Software Development",
        "Landing Page Development",
        "Web Maintenance",
        "Other",
      ],
    },
    skillsRequired: {
      type: [String],
      required: true,
    },
    deadline: {
      type: Date,
      required: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    dailyWorkUpdates: [
      {
        date: { type: Date, default: Date.now },
        description: { type: String, required: true },
        images: [String],
        createdAt: { type: Date, default: Date.now },
        isSeen: { type: Boolean, default: false }
      }
    ],
    status: {
      type: String,
      enum: ["open", "in-progress", "completed", "cancelled", "hold"],
      default: "open",
    },
    createdAt: {
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
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

jobSchema.index({ client: 1 });
jobSchema.index({ category: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ createdAt: -1 });
jobSchema.index({ title: "text", description: "text" }); // For search functionality

export default mongoose.model("ClientPostProject", jobSchema);
