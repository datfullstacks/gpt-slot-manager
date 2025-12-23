import express from 'express';
import Account from '../models/accountModel.js';
import User from '../models/userModel.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Middleware kiểm tra admin
 */
const isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }
        next();
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/stats/admin/all-accounts
 * Admin xem TẤT CẢ tài khoản trong hệ thống (của tất cả users)
 */
router.get('/admin/all-accounts', verifyToken, isAdmin, async (req, res) => {
    try {
        const allAccounts = await Account.find({})
            .populate('userId', 'username email role')
            .select('name email accountId sessionStatus lastError lastErrorTime errorCount allowedMembers maxMembers createdAt updatedAt');

        const stats = {
            total: allAccounts.length,
            byStatus: {
                active: allAccounts.filter(a => a.sessionStatus === 'active').length,
                expired: allAccounts.filter(a => a.sessionStatus === 'expired').length,
                error: allAccounts.filter(a => a.sessionStatus === 'error').length
            },
            accounts: allAccounts.map(acc => ({
                id: acc._id,
                owner: {
                    userId: acc.userId._id,
                    username: acc.userId.username,
                    email: acc.userId.email,
                    role: acc.userId.role
                },
                name: acc.name,
                email: acc.email,
                accountId: acc.accountId,
                sessionStatus: acc.sessionStatus,
                lastError: acc.lastError,
                lastErrorTime: acc.lastErrorTime,
                errorCount: acc.errorCount,
                allowedMembers: acc.allowedMembers,
                maxMembers: acc.maxMembers,
                createdAt: acc.createdAt,
                updatedAt: acc.updatedAt
            }))
        };

        res.json(stats);
    } catch (error) {
        console.error('Error getting all accounts:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * GET /api/stats/admin/users
 * Admin xem tất cả users trong hệ thống
 */
router.get('/admin/users', verifyToken, isAdmin, async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        
        // Đếm số accounts của mỗi user
        const usersWithStats = await Promise.all(
            users.map(async (user) => {
                const accountCount = await Account.countDocuments({ userId: user._id });
                const expiredCount = await Account.countDocuments({ 
                    userId: user._id, 
                    sessionStatus: 'expired' 
                });
                
                return {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    isCodeVerified: user.isCodeVerified,
                    codeVerifiedAt: user.codeVerifiedAt,
                    createdAt: user.createdAt,
                    stats: {
                        totalAccounts: accountCount,
                        expiredAccounts: expiredCount
                    }
                };
            })
        );

        res.json({
            total: users.length,
            users: usersWithStats
        });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * GET /api/stats/expired-sessions
 * Lấy danh sách tài khoản bị hết phiên (401)
 */
router.get('/expired-sessions', verifyToken, async (req, res) => {
    try {
        const expiredAccounts = await Account.find({
            sessionStatus: 'expired',
            userId: req.userId
        }).select('name email accountId lastError lastErrorTime errorCount createdAt updatedAt');

        const stats = {
            total: expiredAccounts.length,
            accounts: expiredAccounts.map(acc => ({
                id: acc._id,
                name: acc.name,
                email: acc.email,
                accountId: acc.accountId,
                lastError: acc.lastError,
                lastErrorTime: acc.lastErrorTime,
                errorCount: acc.errorCount,
                createdAt: acc.createdAt,
                updatedAt: acc.updatedAt
            }))
        };

        res.json(stats);
    } catch (error) {
        console.error('Error getting expired sessions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * GET /api/stats/all-errors
 * Lấy tất cả tài khoản có lỗi (401, 422, etc.)
 */
router.get('/all-errors', verifyToken, async (req, res) => {
    try {
        const errorAccounts = await Account.find({
            userId: req.userId,
            sessionStatus: { $in: ['expired', 'error'] }
        }).select('name email accountId sessionStatus lastError lastErrorTime errorCount');

        const grouped = {
            expired_401: [],
            invalid_422: [],
            other_errors: []
        };

        errorAccounts.forEach(acc => {
            const item = {
                id: acc._id,
                name: acc.name,
                email: acc.email,
                accountId: acc.accountId,
                lastError: acc.lastError,
                lastErrorTime: acc.lastErrorTime,
                errorCount: acc.errorCount
            };

            if (acc.sessionStatus === 'expired' || acc.lastError?.includes('401')) {
                grouped.expired_401.push(item);
            } else if (acc.lastError?.includes('422')) {
                grouped.invalid_422.push(item);
            } else {
                grouped.other_errors.push(item);
            }
        });

        res.json({
            summary: {
                total: errorAccounts.length,
                expired_401: grouped.expired_401.length,
                invalid_422: grouped.invalid_422.length,
                other_errors: grouped.other_errors.length
            },
            details: grouped
        });
    } catch (error) {
        console.error('Error getting all errors:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * POST /api/stats/reset-error/:accountId
 * Reset error status cho một tài khoản (sau khi đã đăng nhập lại)
 */
router.post('/reset-error/:accountId', verifyToken, async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const account = await Account.findOne({
            _id: accountId,
            userId: req.userId
        });

        if (!account) {
            return res.status(404).json({ message: 'Account not found' });
        }

        await Account.findByIdAndUpdate(accountId, {
            sessionStatus: 'active',
            lastError: null,
            errorCount: 0
        });

        res.json({ 
            message: 'Error status reset successfully',
            accountId: accountId
        });
    } catch (error) {
        console.error('Error resetting error status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

/**
 * POST /api/stats/reset-all-errors
 * Reset tất cả error status (sau khi đã update token hàng loạt)
 */
router.post('/reset-all-errors', verifyToken, async (req, res) => {
    try {
        const result = await Account.updateMany(
            { 
                userId: req.userId,
                sessionStatus: { $in: ['expired', 'error'] }
            },
            {
                $set: {
                    sessionStatus: 'active',
                    lastError: null,
                    errorCount: 0
                }
            }
        );

        res.json({ 
            message: 'All error statuses reset successfully',
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Error resetting all errors:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
