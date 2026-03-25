const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
console.log("✅ [DEBUG] reportRoutes.js LOADED");
const {
    verifyReportImage,
    createReport,
    getUserReports,
    getDashboardStats,
    getSingleReport,
    getDepartmentReports,
    getAllReports,
    updateReportStatus,
    sendBroadcast,
    getNearbyReports,
    detectLocationFromText,
    getAdminStats
} = require('../controllers/reportController');
const authenticateToken = require('../middleware/authMiddleware');

// Optional auth: sets req.user if JWT present, does NOT reject if missing
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_development');
        } catch (e) {
            console.warn("[OptionalAuth] Invalid token, proceeding as unauthenticated");
        }
    }
    next();
};

router.get('/test', (req, res) => {
    console.log("[DEBUG] /api/reports/test HIT");
    res.json({ message: "Reports Route Working" });
});

router.post('/verify-image', verifyReportImage);
router.post('/detect-location', detectLocationFromText);
router.post('/create', createReport);
router.post('/update-status', optionalAuth, updateReportStatus);
router.post('/broadcast', reportController.createBroadcast);
// Citizen authenticated routes
router.get('/dashboard-stats', authenticateToken, getDashboardStats);
router.get('/my-reports', authenticateToken, getUserReports);

// Admin authenticated route
router.get('/admin/stats', authenticateToken, getAdminStats);

// Legacy/Admin routes
router.get('/user/:uid', getUserReports);
router.get('/department/:department', getDepartmentReports);
router.get('/nearby', getNearbyReports);
// GET ALL reports — optionalAuth so admin's dept is available for filtering
router.get('/', optionalAuth, getAllReports);
router.get('/:id', getSingleReport);

module.exports = router;