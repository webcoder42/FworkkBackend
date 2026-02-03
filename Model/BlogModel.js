// models/Blog.js
import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    author: {
      type: String,
      default: "BiZZy Team Dev",
    },

    image: {
      type: String,
    },

    tags: [
      {
        type: String,
      },
    ],

    layoutType: {
      type: String,
      enum: ["standard", "feature", "gallery"],
      default: "standard",
    },

    content: [
      {
        type: {
          type: String,
          enum: ["paragraph", "heading", "image", "quote", "heading1", "heading2", "heading3"],
          required: true,
        },
        value: {
          type: String,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

export default mongoose.model("Blog", blogSchema);
