/**
 * Access Code Controller
 * Handles secure access code verification with 3-attempt limit and permanent ban
 */

import AccessCode from '../models/accessCodeModel.js';
import User from '../models/userModel.js';

/**
 * Verify access code
 * - Checks if code exists and is valid
 * - Tracks failed attempts (max 3)
 * - Permanently bans user after 3 failures
 * - Records all attempts in database
 */
export const verifyCode = async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user._id;
        const userIp = req.ip || req.connection.remoteAddress;

        // Validate input
        if (!code || code.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập mã truy cập'
            });
        }

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user can attempt code
        const attemptCheck = user.canAttemptCode();
        if (!attemptCheck.allowed) {
            return res.status(403).json({
                success: false,
                message: attemptCheck.message,
                reason: attemptCheck.reason,
                isBanned: user.isBanned,
                bannedAt: user.bannedAt,
                banReason: user.banReason
            });
        }

        // NEW LOGIC: Compare with user's own accessCode (auto-generated during registration)
        const userAccessCode = user.accessCode;
        
        if (!userAccessCode) {
            return res.status(400).json({
                success: false,
                message: 'Tài khoản chưa có mã truy cập. Vui lòng liên hệ admin.',
                error: 'NO_ACCESS_CODE'
            });
        }

        // Check if entered code matches user's access code
        if (code.trim().toUpperCase() !== userAccessCode.toUpperCase()) {
            // Record failed attempt
            const attemptResult = await user.recordFailedAttempt(code.trim(), userIp);

            return res.status(401).json({
                success: false,
                message: 'Mã truy cập không đúng',
                failedAttempts: attemptResult.failed,
                remainingAttempts: attemptResult.remainingAttempts,
                isBanned: attemptResult.isBanned,
                warning: attemptResult.remainingAttempts === 1 
                    ? '⚠️ CẢNH BÁO: Còn 1 lần thử cuối. Nhập sai sẽ bị khóa tài khoản vĩnh viễn!' 
                    : attemptResult.remainingAttempts === 0 
                        ? '🚫 Tài khoản đã bị khóa vĩnh viễn do nhập sai 3 lần'
                        : null
            });
        }

        // Valid code - record success
        await user.recordSuccessfulAttempt(code.trim(), userIp);

        return res.status(200).json({
            success: true,
            message: '✅ Xác thực mã truy cập thành công!',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                isCodeVerified: true,
                codeVerifiedAt: user.codeVerifiedAt
            }
        });

    } catch (error) {
        console.error('Verify code error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during code verification',
            error: error.message
        });
    }
};

/**
 * Get user's verification status and attempt history
 */
export const getVerificationStatus = async (req, res) => {
    try {
        const userId = req.user._id;

        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const attemptCheck = user.canAttemptCode();

        return res.status(200).json({
            success: true,
            data: {
                isCodeVerified: user.isCodeVerified,
                codeVerifiedAt: user.codeVerifiedAt,
                isBanned: user.isBanned,
                bannedAt: user.bannedAt,
                banReason: user.banReason,
                failedAttempts: user.codeAttempts.failed,
                remainingAttempts: attemptCheck.allowed ? attemptCheck.remainingAttempts : 0,
                canAttempt: attemptCheck.allowed,
                lastAttempt: user.codeAttempts.lastAttempt,
                totalAttempts: user.codeAttempts.history.length
            }
        });

    } catch (error) {
        console.error('Get verification status error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
