import mongoose from 'mongoose';

const accessCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  maxUses: {
    type: Number,
    default: 1,
  },
  usedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String,
    email: String,
    usedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: null
  },
  // Track failed attempts on this code
  failedAttempts: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String,
    email: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  createdBy: {
    type: String,
    default: 'system'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Virtual: số lần đã sử dụng
accessCodeSchema.virtual('usedCount').get(function() {
  return this.usedBy.length;
});

// Virtual: còn bao nhiêu lần sử dụng
accessCodeSchema.virtual('remainingUses').get(function() {
  return this.maxUses - this.usedBy.length;
});

// Method: kiểm tra code còn hợp lệ không
accessCodeSchema.methods.isValid = function() {
  if (!this.isActive) {
    return { valid: false, reason: 'Code đã bị vô hiệu hóa' };
  }

  if (this.expiresAt && new Date() > this.expiresAt) {
    return { valid: false, reason: 'Code đã hết hạn' };
  }

  if (this.usedBy.length >= this.maxUses) {
    return { valid: false, reason: 'Code đã được sử dụng hết số lần cho phép' };
  }

  return { valid: true };
};

// Method: kiểm tra user đã dùng code này chưa
accessCodeSchema.methods.isUsedByUser = function(userId) {
  return this.usedBy.some(usage => usage.userId.toString() === userId.toString());
};

// Method: đánh dấu code đã được sử dụng
accessCodeSchema.methods.markAsUsed = async function(userId, username, email) {
  this.usedBy.push({
    userId,
    username,
    email,
    usedAt: new Date()
  });
  await this.save();
};

// Method: record failed attempt
accessCodeSchema.methods.recordFailedAttempt = async function(userId, username, email) {
  this.failedAttempts.push({
    userId,
    username,
    email,
    timestamp: new Date()
  });
  await this.save();
};

const AccessCode = mongoose.model('AccessCode', accessCodeSchema);

export default AccessCode;
