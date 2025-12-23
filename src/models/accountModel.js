import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: false,
        trim: true,
        default: 'Unnamed Account'
    },
    email: {
        type: String,
        required: true,
        trim: true
    },
    accountId: {
        type: String,
        required: false, // Optional - will be extracted from token if needed
        trim: true
    },
    accessToken: {
        type: String,
        required: true
    },
    additionalHeaders: {
        type: Object,
        default: {}
    },
    // Credentials for auto-refresh (encrypted in production)
    loginEmail: {
        type: String,
        required: false,
        trim: true,
        default: null
    },
    loginPassword: {
        type: String,
        required: false,
        default: null
    },
    twoFactorSecret: {
        type: String,
        required: false,
        default: null // TOTP secret key for 2FA
    },
    allowedMembers: {
        type: [String], // Array of allowed email addresses (excluding admin email)
        default: [],
        trim: true
    },
    maxMembers: {
        type: Number,
        default: 7, // Default ChatGPT Business limit
    },
    // Session tracking
    sessionStatus: {
        type: String,
        enum: ['active', 'expired', 'error'],
        default: 'active'
    },
    lastError: {
        type: String,
        default: null
    },
    lastErrorTime: {
        type: Date,
        default: null
    },
    errorCount: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    // Token expiry tracking
    tokenExpiresAt: {
        type: Date,
        default: null // Thời gian token hết hạn (ước tính hoặc từ API)
    },
    lastRefreshedAt: {
        type: Date,
        default: null // Lần cuối refresh token thành công
    },
    needsRefresh: {
        type: Boolean,
        default: false // Flag để đánh dấu cần refresh
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-update updatedAt on save
accountSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Compound index: userId + email should be unique
accountSchema.index({ userId: 1, email: 1 }, { unique: true });

const Account = mongoose.model('Account', accountSchema);

export default Account;