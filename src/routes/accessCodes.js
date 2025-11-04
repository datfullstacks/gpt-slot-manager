/**
 * Access Code Routes
 * Routes for access code verification
 */

import express from 'express';
import { verifyCode, getVerificationStatus } from '../controllers/accessCodeController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/access-codes/verify
 * @desc    Verify access code (max 3 attempts, then permanent ban)
 * @access  Private (authenticated users only)
 */
router.post('/verify', authMiddleware, verifyCode);

/**
 * @route   GET /api/access-codes/status
 * @desc    Get verification status and attempt history
 * @access  Private (authenticated users only)
 */
router.get('/status', authMiddleware, getVerificationStatus);

export default router;
