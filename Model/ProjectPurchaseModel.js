import mongoose from "mongoose";

const paymentDetailsSchema = new mongoose.Schema({
  paymentIntentId: { type: String },
  receiptUrl: { type: String },
  cardBrand: { type: String }, // Visa, MasterCard, etc.
  last4: { type: String }, // Last 4 digits of card
  country: { type: String }, // Billing country
  additionalDetails: { type: mongoose.Schema.Types.Mixed }, // Optional extra info
});

const deliveryRequirementsSchema = new mongoose.Schema({
  // GitHub Repository Link
  githubLink: {
    type: String,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^https?:\/\/github\.com\/[^/]+\/[^/]+$/.test(v);
      },
      message: "Invalid GitHub repository URL",
    },
  },

  // Live URL
  liveUrl: {
    type: String,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^https?:\/\/.+/.test(v);
      },
      message: "Invalid URL format",
    },
  },

  // Domain Information
  domainName: { type: String },

  // Hosting Information
  hostingProvider: { type: String },

  // Documentation Link
  documentationLink: {
    type: String,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^https?:\/\/.+/.test(v);
      },
      message: "Invalid documentation URL format",
    },
  },

  // Setup Instructions
  setupInstructions: {
    type: String,
    maxLength: [10000, "Setup instructions cannot exceed 10000 characters"],
  },

  // Features Implemented
  featuresImplemented: {
    type: String,
    maxLength: [8000, "Features description cannot exceed 8000 characters"],
  },

  // Technologies Used
  technologiesUsed: {
    type: String,
    maxLength: [5000, "Technologies description cannot exceed 5000 characters"],
  },

  // Deployment Instructions
  deploymentInstructions: {
    type: String,
    maxLength: [
      10000,
      "Deployment instructions cannot exceed 10000 characters",
    ],
  },

  // Additional Notes
  additionalNotes: {
    type: String,
    maxLength: [5000, "Additional notes cannot exceed 5000 characters"],
  },

  // Legacy fields for backward compatibility
  domainTransfer: { type: Boolean, default: false },
  hostingTransfer: { type: Boolean, default: false },
  additionalFiles: { type: Boolean, default: false },
  customRequirements: { type: String },
  deliveryNotes: { type: String },
});

const projectPurchaseSchema = new mongoose.Schema(
  {
    // Buyer Information
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    // Project Information
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectMarketplace",
      required: true,
    },

    // Seller Information
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    // Purchase Details
    amount: {
      type: Number,
      required: true,
    },

    // Buyer's Description/Requirements
    buyerDescription: {
      type: String,
      required: true,
      maxLength: [2000, "Description cannot exceed 2000 characters"],
    },

    // Delivery Requirements
    deliveryRequirements: deliveryRequirementsSchema,

    // Payment Information
    paymentMethod: {
      type: String,
      enum: ["card", "stripe", "wallet", "paytabs", "paypal"],
      default: "stripe",
    },

    paymentDetails: paymentDetailsSchema,

    // Purchase Status
    status: {
      type: String,
      enum: [
        "pending",
        "paid",
        "in_progress",
        "delivered",
        "completed",
        "cancelled",
        "refunded",
      ],
      default: "pending",
    },

    // Project Delivery Status
    deliveryStatus: {
      type: String,
      enum: [
        "not_started",
        "in_progress",
        "review",
        "delivered",
        "accepted",
        "rejected",
        "cancelled",
      ],
      default: "not_started",
    },

    // Timeline
    purchaseDate: {
      type: Date,
      default: Date.now,
    },

    expectedDeliveryDate: {
      type: Date,
    },

    actualDeliveryDate: {
      type: Date,
    },

    completedDate: {
      type: Date,
    },

    // Communication
    messages: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
        },
        content: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        isSystemMessage: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Rating and Review
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },

    review: {
      type: String,
      maxLength: [1000, "Review cannot exceed 1000 characters"],
    },

    comment: {
      type: String,
      maxLength: [1000, "Comment cannot exceed 1000 characters"],
    },

    isRated: {
      type: Boolean,
      default: false,
    },

    ratedAt: {
      type: Date,
    },

    reviewDate: {
      type: Date,
    },

    // Review approval status
    reviewApproved: {
      type: Boolean,
      default: false,
    },

    reviewApprovedAt: {
      type: Date,
    },

    // Dispute/Refund
    disputeReason: {
      type: String,
    },

    disputeDate: {
      type: Date,
    },

    refundAmount: {
      type: Number,
    },

    refundReason: {
      type: String,
    },

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
projectPurchaseSchema.index({ buyer: 1, status: 1 });
projectPurchaseSchema.index({ seller: 1, status: 1 });
projectPurchaseSchema.index({ project: 1 });
projectPurchaseSchema.index({ status: 1 });
projectPurchaseSchema.index({ createdAt: -1 });

// Virtual for purchase duration
projectPurchaseSchema.virtual("purchaseDuration").get(function () {
  if (this.completedDate && this.purchaseDate) {
    return Math.ceil(
      (this.completedDate - this.purchaseDate) / (1000 * 60 * 60 * 24)
    );
  }
  return null;
});

// Pre-save middleware to update updatedAt
projectPurchaseSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Static methods
projectPurchaseSchema.statics.getBuyerPurchases = function (
  buyerId,
  status = null
) {
  const query = { buyer: buyerId };
  if (status) query.status = status;

  return this.find(query)
    .populate("project", "title price category images")
    .populate("seller", "username profilePicture rating")
    .sort({ createdAt: -1 });
};

projectPurchaseSchema.statics.getSellerSales = function (
  sellerId,
  status = null
) {
  const query = { seller: sellerId };
  if (status) query.status = status;

  return this.find(query)
    .populate("project", "title price category images")
    .populate("buyer", "username profilePicture")
    .sort({ createdAt: -1 });
};

// Instance methods
projectPurchaseSchema.methods.addMessage = function (
  senderId,
  content,
  isSystemMessage = false
) {
  this.messages.push({
    sender: senderId,
    content,
    isSystemMessage,
    timestamp: new Date(),
  });
  return this.save();
};

projectPurchaseSchema.methods.updateDeliveryStatus = function (newStatus) {
  this.deliveryStatus = newStatus;

  if (newStatus === "delivered") {
    this.actualDeliveryDate = new Date();
  } else if (newStatus === "accepted") {
    this.completedDate = new Date();
    this.status = "completed";
  }

  return this.save();
};

projectPurchaseSchema.methods.addRating = function (rating, review) {
  this.rating = rating;
  this.review = review;
  this.reviewDate = new Date();
  return this.save();
};

const ProjectPurchase = mongoose.model(
  "ProjectPurchase",
  projectPurchaseSchema
);

export default ProjectPurchase;
