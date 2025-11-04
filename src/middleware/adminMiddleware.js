/**
 * Admin Middleware
 * Verify user has admin privileges
 * Only usernames 'admin' or 'administrator' can access admin-only routes
 */

const adminMiddleware = (req, res, next) => {
    try {
        // req.user is set by authMiddleware
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized - Authentication required'
            });
        }

        // Check if username is admin
        const adminUsernames = ['admin', 'administrator'];
        const isAdmin = adminUsernames.includes(req.user.username.toLowerCase());

        if (!isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden - Admin privileges required',
                error: 'Only administrators can access this resource'
            });
        }

        // User is admin, proceed
        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during admin verification',
            error: error.message
        });
    }
};

export default adminMiddleware;
