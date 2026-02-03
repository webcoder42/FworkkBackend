import mongoose from "mongoose";

const PlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    duration: {
      type: Number, // duration in days
      required: true,
    },
    maxprojectPerDay: {
      type: Number,
      required: true,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    planType: {
      type: String,
      enum: ["free", "paid"],
      default: "paid",
    },
    planPurpose: {
      type: String,
      enum: ["billing", "team"],
      required: true,
    },
    features: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const PlanSchemaModel = mongoose.model("Plan", PlanSchema);

export default PlanSchemaModel;
