import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientPostProject",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    submissionType: {
      type: String,
      enum: ["github_link", "github_repo", "both", "live_site"],
      required: [true, "Submission type is required"],
    },

    // For direct GitHub link submission
    githubLink: {
      type: String,
      validate: {
        validator: function (v) {
          if (!v) return true; // Allow empty for optional field
          // Fixed regex for GitHub URL validation
          return /^https?:\/\/github\.com\/[^/]+\/[^/]+$/.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid GitHub repository URL!`,
      },
      trim: true,
    },

    // For live site URL
    liveSiteUrl: {
      type: String,
      validate: {
        validator: function (v) {
          if (!v) return true; // Allow empty for optional field
          // Basic URL validation
          return /^https?:\/\/.+/.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid URL!`,
      },
      trim: true,
    },

    // For connected GitHub account repository submission
    githubRepo: {
      name: {
        type: String,
        required: function () {
          return this.submissionType === "github_repo";
        },
        trim: true,
      },
      fullName: {
        type: String,
        required: function () {
          return this.submissionType === "github_repo";
        },
        validate: {
          validator: function (v) {
            return /^[^/]+\/[^/]+$/.test(v); // user/repo format
          },
          message: (props) =>
            `${props.value} must be in format 'username/reponame'`,
        },
        trim: true,
      },
      url: {
        type: String,
        required: function () {
          return this.submissionType === "github_repo";
        },
        validate: {
          validator: function (v) {
            return /^https?:\/\/github\.com\/[^/]+\/[^/]+$/.test(v);
          },
          message: (props) =>
            `${props.value} is not a valid GitHub repository URL!`,
        },
        trim: true,
      },
      branch: {
        // New field for specific branch
        type: String,
        default: "main",
      },
      private: {
        type: Boolean,
        default: false,
      },
      commitHash: String, // New field for specific commit
    },

    description: {
      type: String,
      trim: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },

    review: {
      rating: {
        type: Number,
        min: [1, "Rating must be at least 1"],
        max: [5, "Rating cannot exceed 5"],
      },
      comment: {
        type: String,
        maxlength: [1000, "Comment cannot exceed 1000 characters"],
      },
      experience: {
        type: String,
        enum: ["positive", "neutral", "negative"],
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },

    status: {
      type: String,
      enum: ["submitted", "approved", "rejected", "revision_requested"],
      default: "submitted",
      index: true,
    },
    reminder1Sent: {
      type: Boolean,
      default: false,
    },
    reminder2Sent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Custom validation to ensure at least one link is provided
submissionSchema.pre('save', function(next) {
  if (this.submissionType === "github_link" || this.submissionType === "both" || this.submissionType === "live_site") {
    if (!this.githubLink && !this.liveSiteUrl) {
      return next(new Error('At least one link (GitHub or Live Site) is required'));
    }
  }
  next();
});

// Indexing for performance
submissionSchema.index({ user: 1 });
submissionSchema.index({ submittedAt: -1 });
submissionSchema.index({ "review.rating": 1 });
submissionSchema.index({ "review.createdAt": -1 });

const SubmitProjectModel = mongoose.model("SubmitProject", submissionSchema);
export default SubmitProjectModel;
