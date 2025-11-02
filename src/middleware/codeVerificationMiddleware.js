import User from '../models/userModel.js';

// Middleware kiểm tra user đã verify code chưa
export const codeVerificationMiddleware = async (req, res, next) => {
    try {
        const userId = req.userId; // From authMiddleware
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        if (!user.isCodeVerified) {
            return res.status(403).json({ 
                message: 'Bạn cần nhập mã code từ admin để sử dụng tính năng này!',
                requireCode: true
            });
        }
        
        next();
    } catch (error) {
        res.status(500).json({ message: 'Error checking code verification', error: error.message });
    }
};
