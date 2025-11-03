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
    allowedMembers: {
        type: [String], // Array of allowed email addresses (excluding admin email)
        default: [],
        trim: true
    },
    maxMembers: {
        type: Number,
        default: 7, // Default ChatGPT Business limit
        min: 1,
        max: 100
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