import mongoose from 'mongoose';

const projectMarketplaceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true,
    maxLength: [100, 'Title cannot exceed 100 characters']
  },
  
  description: {
    type: String,
    required: [true, 'Project description is required'],
    trim: true,
    maxLength: [5000, 'Description cannot exceed 5000 characters']
  },
  
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['web', 'mobile', 'design', 'software', 'other'],
    default: 'web'
  },
  
  subCategory: {
    type: String,
    trim: true
  },
  
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [1, 'Price must be at least $1']
  },
  
  duration: {
    type: String,
    enum: ['1week', '2weeks', '1month', '2months', '3months', 'custom'],
    default: '1month'
  },
  
  images: [{
    url: String,
    public_id: String,
    filename: String,
    size: Number,
    mimetype: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  videos: [{
    url: String,
    public_id: String,
    filename: String,
    size: Number,
    mimetype: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  links: {
    github: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\/(www\.)?github\.com\//.test(v);
        },
        message: 'Please provide a valid GitHub URL'
      }
    },
    
    demo: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\//.test(v);
        },
        message: 'Please provide a valid URL'
      }
    },
    
    portfolio: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\//.test(v);
        },
        message: 'Please provide a valid URL'
      }
    },
    
    documentation: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          return !v || /^https?:\/\//.test(v);
        },
        message: 'Please provide a valid URL'
      }
    }
  },
  
  features: [{
    type: String,
    trim: true
  }],
  
  requirements: {
    type: String,
    trim: true,
    maxLength: [1000, 'Requirements cannot exceed 1000 characters']
  },
  
  status: {
    type: String,
    enum: ['draft', 'published', 'sold', 'archived'],
    default: 'draft'
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  isFeatured: {
    type: Boolean,
    default: false
  },
  
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  
  viewCount: {
    type: Number,
    default: 0
  },
  
  likeCount: {
    type: Number,
    default: 0
  },
  
  saveCount: {
    type: Number,
    default: 0
  },
  
  userLikes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users'
  }],
  
  userSaves: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users'
  }],
  
  inquiries: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users'
    },
    message: String,
    inquiredAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  slug: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  publishedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

projectMarketplaceSchema.index({ status: 1, isActive: 1 });
projectMarketplaceSchema.index({ category: 1, status: 1 });
projectMarketplaceSchema.index({ seller: 1 });
projectMarketplaceSchema.index({ price: 1 });
projectMarketplaceSchema.index({ createdAt: -1 });
projectMarketplaceSchema.index({ isFeatured: 1, status: 1 });
projectMarketplaceSchema.index({ userLikes: 1 });
projectMarketplaceSchema.index({ userSaves: 1 });
projectMarketplaceSchema.index({ tags: 1 });
projectMarketplaceSchema.index({ title: 'text', description: 'text', tags: 'text' });
projectMarketplaceSchema.index({ viewCount: -1 });
projectMarketplaceSchema.index({ likeCount: -1 });

projectMarketplaceSchema.methods.incrementView = async function() {
  this.viewCount += 1;
  await this.save();
};

projectMarketplaceSchema.methods.toggleLike = async function(userId) {
  const userIndex = this.userLikes.indexOf(userId);
  if (userIndex > -1) {
    this.userLikes.splice(userIndex, 1);
    this.likeCount = Math.max(0, this.likeCount - 1);
  } else {
    this.userLikes.push(userId);
    this.likeCount += 1;
  }
  await this.save();
  return userIndex === -1;
};

projectMarketplaceSchema.methods.toggleSave = async function(userId) {
  const userIndex = this.userSaves.indexOf(userId);
  if (userIndex > -1) {
    this.userSaves.splice(userIndex, 1);
    this.saveCount = Math.max(0, this.saveCount - 1);
  } else {
    this.userSaves.push(userId);
    this.saveCount += 1;
  }
  await this.save();
  return userIndex === -1;
};

projectMarketplaceSchema.statics.getFeatured = async function() {
  return await this.find({
    isFeatured: true,
    status: 'published',
    isActive: true
  })
  .populate('seller', 'username profilePicture rating')
  .sort({ createdAt: -1 })
  .limit(10)
  .lean();
};

projectMarketplaceSchema.statics.getTrending = async function() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  return await this.find({
    status: 'published',
    isActive: true,
    createdAt: { $gte: sevenDaysAgo }
  })
  .populate('seller', 'username profilePicture rating')
  .sort({ viewCount: -1, likeCount: -1 })
  .limit(10)
  .lean();
};

projectMarketplaceSchema.statics.getByCategory = async function(category) {
  return await this.find({
    category: category,
    status: 'published',
    isActive: true
  })
  .populate('seller', 'username profilePicture rating')
  .sort({ createdAt: -1 })
  .lean();
};

const ProjectMarketplace = mongoose.model('ProjectMarketplace', projectMarketplaceSchema);

export default ProjectMarketplace;
