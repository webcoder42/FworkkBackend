import mongoose from "mongoose";

const blockSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    file: {
      type: { type: String, enum: ["pdf", "doc", "json"], required: true },
    },
    content: [
      {
        question: String,
        answer: String,
      },
    ],
    images: [
      {
        url: String,
        name: String,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Block", blockSchema);
