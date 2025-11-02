import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const ADMIN_ACCESS_CODE = process.env.ADMIN_ACCESS_CODE || 'GPT2024SLOT';

class AuthController {
    async register(req, res) {
        try {
            const { username, email, password } = req.body;

            // Check if user exists
            const existingUser = await User.findOne({ $or: [{ email }, { username }] });
            if (existingUser) {
                return res.status(400).json({ 
                    message: 'User with this email or username already exists' 
                });
            }

            // Create new user (password will be hashed by pre-save hook)
            const user = new User({ username, email, password });
            await user.save();

            // Generate JWT token
            const token = jwt.sign(
                { userId: user._id, username: user.username },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.status(201).json({
                message: 'User registered successfully',
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email
                }
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ message: 'Error registering user', error: error.message });
        }
    }

    async login(req, res) {
        try {
            const { username, password } = req.body;

            // Find user by username OR email
            const user = await User.findOne({ 
                $or: [{ username }, { email: username }] 
            });
            if (!user) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            // Check password
            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }

            // Generate JWT token
            const token = jwt.sign(
                { userId: user._id, username: user.username },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.status(200).json({
                message: 'Login successful',
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    isCodeVerified: user.isCodeVerified
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: 'Error logging in', error: error.message });
        }
    }

    async getProfile(req, res) {
        try {
            const user = await User.findById(req.userId).select('-password');
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            res.status(200).json({ user });
        } catch (error) {
            res.status(500).json({ message: 'Error fetching profile', error: error.message });
        }
    }

    async verifyAccessCode(req, res) {
        try {
            const { code } = req.body;
            const userId = req.userId; // From auth middleware

            // Check if code is correct
            if (code !== ADMIN_ACCESS_CODE) {
                return res.status(403).json({ 
                    message: 'Mã code không đúng! Vui lòng liên hệ admin để lấy mã.' 
                });
            }

            // Update user
            const user = await User.findByIdAndUpdate(
                userId,
                { 
                    accessCode: code,
                    isCodeVerified: true,
                    codeVerifiedAt: new Date()
                },
                { new: true }
            ).select('-password');

            res.status(200).json({
                message: 'Xác thực mã thành công! Bạn có thể sử dụng tính năng quản lý.',
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    isCodeVerified: user.isCodeVerified
                }
            });
        } catch (error) {
            console.error('Verify code error:', error);
            res.status(500).json({ message: 'Error verifying code', error: error.message });
        }
    }
}

export default AuthController;
