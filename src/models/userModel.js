import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    accessCode: {
        type: String,
        default: null // Code do admin cấp để sử dụng tính năng
    },
    isCodeVerified: {
        type: Boolean,
        default: false // User đã nhập code đúng chưa
    },
    codeVerifiedAt: {
        type: Date,
        default: null
    },
    // Tracking failed access code attempts
    codeAttempts: {
        failed: {
            type: Number,
            default: 0
        },
        lastAttempt: {
            type: Date,
            default: null
        },
        history: [{
            code: String,
            timestamp: {
                type: Date,
                default: Date.now
            },
            success: {
                type: Boolean,
                default: false
            },
            ip: String // Optional: track IP for security
        }]
    },
    // Ban system for failed attempts
    isBanned: {
        type: Boolean,
        default: false
    },
    bannedAt: {
        type: Date,
        default: null
    },
    banReason: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Generate secure access code (16 characters)
function generateAccessCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars: I, O, 0, 1
    let code = '';
    for (let i = 0; i < 16; i++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        code += chars[randomIndex];
    }
    return code;
}

// Auto-generate access code when user is created
userSchema.pre('save', async function(next) {
    // Generate access code for new users
    if (this.isNew && !this.accessCode) {
        this.accessCode = generateAccessCode();
        console.log(`🔐 Generated access code for user ${this.username}: ${this.accessCode}`);
    }
    
    // Hash password if modified
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user can attempt code verification
userSchema.methods.canAttemptCode = function() {
    // Banned users cannot attempt
    if (this.isBanned) {
        return {
            allowed: false,
            reason: 'BANNED',
            message: `Tài khoản đã bị khóa vĩnh viễn vào ${this.bannedAt?.toLocaleString('vi-VN')}. Lý do: ${this.banReason}`
        };
    }
    
    // Check if exceeded 3 failed attempts
    if (this.codeAttempts.failed >= 3) {
        return {
            allowed: false,
            reason: 'MAX_ATTEMPTS',
            message: 'Đã vượt quá 3 lần nhập sai. Tài khoản sẽ bị khóa vĩnh viễn.'
        };
    }
    
    return {
        allowed: true,
        remainingAttempts: 3 - this.codeAttempts.failed
    };
};

// Record failed code attempt
userSchema.methods.recordFailedAttempt = async function(code, ip = null) {
    this.codeAttempts.failed += 1;
    this.codeAttempts.lastAttempt = new Date();
    this.codeAttempts.history.push({
        code,
        timestamp: new Date(),
        success: false,
        ip
    });
    
    // Auto-ban after 3 failed attempts
    if (this.codeAttempts.failed >= 3) {
        this.isBanned = true;
        this.bannedAt = new Date();
        this.banReason = 'Nhập sai mã truy cập 3 lần liên tiếp';
    }
    
    await this.save();
    
    return {
        failed: this.codeAttempts.failed,
        isBanned: this.isBanned,
        remainingAttempts: Math.max(0, 3 - this.codeAttempts.failed)
    };
};

// Record successful code attempt
userSchema.methods.recordSuccessfulAttempt = async function(code, ip = null) {
    this.codeAttempts.lastAttempt = new Date();
    this.codeAttempts.history.push({
        code,
        timestamp: new Date(),
        success: true,
        ip
    });
    
    this.isCodeVerified = true;
    this.codeVerifiedAt = new Date();
    this.accessCode = code;
    
    await this.save();
    
    return {
        success: true,
        message: 'Xác thực mã truy cập thành công'
    };
};

const User = mongoose.model('User', userSchema);

export default User;
