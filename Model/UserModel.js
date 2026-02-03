import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    Fullname: {
      type: String,
      required: true,
    },

    username: {
      type: String,

      unique: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: false, // Not needed for Google auth
    },

    securityQuestion: {
      type: String,
      default: "",
    },
    securityAnswer: {
      type: String,
      default: "",
    },
    deviceId: {
      type: String,
      unique: true,
      sparse: true,
    },
    googleId: {
      type: String,
      default: null,
    },
    facebookId: {
      type: String,
      default: null,
    },
    linkedinId: {
      type: String,
      default: null,
    },
    githubId: {
      type: String,
      default: null,
    },
    githubAccessToken: {
      type: String,
      default: null,
    },
    lastMessage: {
      type: Date,
      default: null,
    },
    profileImage: {
      type: String,
      default: "",
    },
    UserType: {
      type: String,
      enum: ["freelancer", "client"],
      default: "freelancer",
    },
    role: {
      type: String,
      enum: ["user", "admin","manager"],
      default: "user",
    },

    bio: {
      type: String,
      default: "",
    },

    skills: [
      {
        name: {
          type: String,
          required: true,
        },
        uuid: {
          type: String,
        },
      },
    ],

    location: {
      country: {
        type: String,
      },
      city: {
        type: String,
        default: "",
      },
    },

    socialLinks: {
      github: String,
      linkedin: String,
      twitter: String,
      website: String,
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    portfolio: [
      {
        title: String,
        description: String,
        link: String,
        image: String,
      },
    ],
    totalEarnings: {
      type: Number,
      default: 0,
    },
    EarningLogs: [
      {
        amount: {
          type: Number,
          required: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // New field to store add fund logs as an array of objects
    addFundLogs: [
      {
        amount: Number, // Original amount added
        credited: Number, // Actual credited after fee
        date: { type: Date, default: Date.now },
        note: String, // Optional note
      },
    ],
    totalSpend: {
      type: Number,
      default: 0,
    },

    completedProjects: {
      type: Number,
      default: 0,
    },

    rating: {
      type: Number,
      default: 0,
    },

    availability: {
      type: String,
      enum: ["online", "offline", "busy", "onVacation"],
      default: "offline",
    },

    phone: {
      number: {
        type: String,
        // Optionally add simple validation for phone number format
        // validate: { validator: v => /^\d{7,15}$/.test(v), message: 'Phone number length is not valid!' },
      },
      countryCode: {
        type: String,
        default: "",
      },
    },

    accountStatus: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
    },
    suspensionEndDate: {
      type: Date,
      default: null,
    },

    ClientAchievementStatus: [
      {
        level: {
          type: String,
          enum: ["VIP", "Master", "Legend"],
          required: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    FreelancerAchievementStatus: [
      {
        type: String,
        enum: ["Pro", "Elite", "Challenger"],
        default: "null",
        date: { type: Date, default: Date.now },
      },
    ],

    warnings: {
      inappropriateContent: {
        count: {
          type: Number,
          default: 0,
        },
        lastWarningDate: {
          type: Date,
        },
        warningHistory: [
          {
            date: {
              type: Date,
              default: Date.now,
            },
            reason: {
              type: String,
            },
            content: {
              type: String,
            },
          },
        ],
      },
    },

    lastLogin: {
      type: Date,
      default: Date.now,
    },

    lastSeen: {
      type: Date,
      default: Date.now,
    },

    referralCode: {
      type: String,
      unique: true,
    },

    referralLink: {
      type: String,
      unique: true,
    },

    uniqueId: {
      type: String,
      unique: true,
      sparse: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },

    totalReferred: {
      type: Number,
      default: 0,
    },

    loginHistory: [
      {
        ip: String,
        device: String,
        date: { type: Date, default: Date.now },
      },
    ],

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Indexing for performance
userSchema.index({ role: 1 });
userSchema.index({ UserType: 1 });
userSchema.index({ accountStatus: 1 });
userSchema.index({ "phone.number": 1 });
userSchema.index({ availability: 1 });
userSchema.index({ lastLogin: -1 });
userSchema.index({ createdAt: -1 });

const User = mongoose.model("users", userSchema);
export default User;
