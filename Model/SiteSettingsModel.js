import mongoose from "mongoose";

const siteSettingsSchema = new mongoose.Schema({
  siteTitle: {
    type: String,
    default: "Fworkk Platform",
  },
  siteDescription: {
    type: String,
    default: "Welcome to Fworkk!",
  },
  siteLogo: {
    type: String, // store image URL or path
    default: "",
  },
  contactEmail: {
    type: String,
    default: "support@fworkk.com", // Admin can update support email
  },
  facebookLink: {
    type: String,
    default: "",
  },
  twitterLink: {
    type: String,
    default: "",
  },
  instagramLink: {
    type: String,
    default: "",
  },
  linkedinLink: {
    type: String,
    default: "",
  },
  youtubeLink: {
    type: String,
    default: "",
  },
  githubLink: {
    type: String,
    default: "",
  },
  telegramLink: {
    type: String,
    default: "",
  },
  whatsappLink: {
    type: String,
    default: "",
  },
  footerText: {
    type: String,
    default: "© 2024 BiZy. All rights reserved.",
  },
  cashoutTax: {
    type: Number,
    default: 0, // Tax percentage for cashout
  },
  postProjectTax: {
    type: Number,
    default: 0, // Tax percentage for posting a project
  },
  addFundTax: {
    type: Number,
    default: 0, // Tax percentage for adding funds
  },
  taskCompletionTax: {
    type: Number,
    default: 2, // Tax percentage for task completion (2% default)
  },
  minimumCashoutAmount: {
    type: Number,
    default: 500, // Minimum amount for cashout
  },
  aiAutoBlog: {
    type: Boolean,
    default: false,
  },
  // You can add more fields here for future dynamic settings
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);
export default SiteSettings;
