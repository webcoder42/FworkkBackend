// models/ProjectRequest.js
import mongoose from "mongoose";

const ProjectRequestSchema = new mongoose.Schema({
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    budget: {
        type: Number,
        required: true,
        min: 1000
    },
    category: {
        type: String,
        required: true,
        enum: [
            'Website Development',
            'Frontend Development',
            'Backend Development',
            'Full Stack Development',
            'WordPress Development',
            'Shopify Development',
            'Ecommerce Website Development',
            'Mobile App Development',
            'Android App Development',
            'iOS App Development',
            'React Native Development',
            'Flutter App Development',
            'UI/UX Design',
            'Web App Bug Fixing',
            'API Integration',
            'Custom Software Development',
            'Landing Page Development',
            'Web Maintenance',
            'AI integration Management',
            'Other'
        ],
    },
    skillsRequired: [{
        type: String
    }],
    teamSize: {
        type: Number,
        required: true,
        min: 1,
        max: 50
    },
    teamRoles: [{
        role: {
            type: String,
            required: true,
            enum: [
                'Frontend Developer',
                'Backend Developer',
                'Full Stack Developer',
                'UI/UX Designer',
                'WordPress Developer',
                'Mobile App Developer',
                'Shopify Developer',
                'QA Tester',
                'Project Manager',
                'DevOps Engineer',
                'Database Administrator',
                'AI/ML Engineer',
                'Other'
            ]
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        skills: [String],
        experienceLevel: {
            type: String,
            enum: ['Beginner', 'Intermediate', 'Expert'],
            default: 'Intermediate'
        }
    }],
    teamSelectionType: {
        type: String,
        enum: ['manual', 'auto', 'mixed'],
        default: 'mixed'
    },
    selectedFreelancers: [{
        freelancerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users'
        },
        role: String,
        payoutRecords: [{
            amount: {
                type: Number,
                default: 0
            },
            type: {
                type: String,
                default: "fixed"
            },
            status: {
                type: String,
                enum: ['locked', 'released', 'cancelled'],
                default: "locked" // escrow
            },
            paymentMethod: {
                type: String,
                default: 'Wallet'
            },
            paymentDetails: {
                type: String
            },
           
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],
        selectedAt: Date,
        selectedBy: {
            type: String,
            enum: ['client', 'admin', 'auto'],
            default: 'client'
        },
        status: {
            type: String,
            enum: ['Checking', 'Accepted', 'Not Accepted'],
            default: 'Checking'
        },
        tasks: [{
            title: {
                type: String,
                trim: true
            },
            assignedTo: {
                type: String,
                trim: true
            },
            description: {
                type: String,
                required: true,
                trim: true
            },
            amount: {
                type: Number,
                default: 0
            },
            dueDate: {
                type: Date
            },
            OptionalLink: {
                type: String,
               
            },
            status: {
                type: String,
                enum: ['Pending', 'In Progress', 'Submitted', 'Approved', 'Revision', 'Cancelled'],
                default: 'Pending'
            },
            createdAt: {
                type: Date,
                default: Date.now
            },
            cancellationReason: String,
            cancellationCategory: String,
            rating: Number,
            review: String,
        }]
    }],
    timeline: {
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },
        estimatedDuration: {
            type: Number,
            required: true
        }
    },
    status: {
        type: String,
        enum: ['Not_Started', 'Started', 'team_selection', 'Worked Started', 'On Hold', 'completed', 'cancelled'],
        default: 'Not_Started'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    projectType: {
        type: String,
        enum: ['one-time', 'ongoing', 'hourly'],
        default: 'one-time'
    },
    messages: [{
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true
        },
        senderType: {
            type: String,
            enum: ['client', 'freelancer', 'admin', 'system'],
            required: true
        },
        messageType: {
            type: String,
            enum: ['text', 'image', 'file'],
            default: 'text'
        },
        content: {
            type: String,
            required: true
        },
        fileUrl: String,
        fileName: String,
        fileSize: Number,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],

    additionalNotes: String,
    assignedAt: Date,
    completedAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    activeCallId: {
        type: String,
        default: null,
    },
    callStartedAt: {
        type: Date,
        default: null,
    },
    callStartedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
        default: null,
    },
    callJoinRequests: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "users",
        },
        requestedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["pending", "approved", "denied"],
          default: "pending",
        },
      },
    ],
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

ProjectRequestSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

export default mongoose.model("FworkkPrimeRequest", ProjectRequestSchema);
