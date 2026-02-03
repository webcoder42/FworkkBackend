import mongoose from "mongoose";

const fileSchema = new mongoose.Schema({
  fileName: { type: String, required: true }, // e.g. "src/App.js"
  content: { type: String, required: true }, // actual code
});

const AITemplateSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },

  description: {
    type: String,
    required: true,
  }, // user ne likha kya banana hai
  WebBuilder: {
    type: String,
    required: true,
    enum: ["Frontend", "Backend"],
  },
  Frontend_language: {
    type: String,
    required: true,
    enum: [
      // Frontend options
      "HTML/CSS/JS",
      "React",
      "Next.js",
      // Backend options
      "Node.js/Express",
      "Python/Flask",
      "Python/Django",
      "Ruby on Rails",
      "PHP/Laravel",
    ],
  },

  structure: [fileSchema],

  generatedZipUrl: {
    type: String,
  },

  previewUrl: {
    type: String,
  }, // optional: live preview (like Vercel)

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("AITemplate", AITemplateSchema);
