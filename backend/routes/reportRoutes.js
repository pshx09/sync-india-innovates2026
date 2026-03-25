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
    createBroadcast,
    getBroadcasts,
    getNearbyReports,
    detectLocationFromText,
    getAdminStats
} = require('../controllers/reportController');

const authenticateToken = require('../middleware/authMiddleware');

// Optional auth middleware
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_development');
        } catch (e) {
            console.warn("[OptionalAuth] Invalid token");
        }
    }
    next();
};

// 1️⃣ STATIC ROUTES (SABSE UPAR)
router.get('/test', (req, res) => res.json({ message: "Reports Route Working" }));

router.post('/verify-image', verifyReportImage);
router.post('/detect-location', detectLocationFromText);
router.post('/create', createReport);
router.post('/update-status', optionalAuth, updateReportStatus);
router.post('/broadcast', createBroadcast);

// 2️⃣ CITIZEN & ADMIN STATS (/:id SE PEHLE)
router.get('/dashboard-stats', authenticateToken, getDashboardStats); // ✅ Fixed Order
router.get('/my-reports', authenticateToken, getUserReports);        // ✅ Fixed Order
router.get('/admin/stats', authenticateToken, getAdminStats);         // ✅ Fixed Order
router.get('/broadcasts', getBroadcasts);                             // ✅ Fixed Order

// 3️⃣ LEGACY / OTHER FILTERS
router.get('/user/:uid', getUserReports);
router.get('/department/:department', getDepartmentReports);
router.get('/nearby', getNearbyReports);
router.get('/', optionalAuth, getAllReports);

// 4️⃣ DYNAMIC ROUTE (EKDAM AAKHRI MEIN)
// 🚨 Yeh sabse neeche hona chahiye warna saari requests yahi ruk jayengi
router.get('/:id', getSingleReport);

module.exports = router;