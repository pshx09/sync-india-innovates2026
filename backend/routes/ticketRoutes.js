const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Optional auth: sets req.user if JWT present, does NOT reject if missing
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_development');
            req.user = decoded;
        } catch (e) {
            console.warn("[OptionalAuth] Invalid token, proceeding as unauthenticated");
        }
    }
    next();
};

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Disk storage: save files with unique names, keep original extension
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `ticket-${uniqueSuffix}${ext}`);
    }
});
const upload = multer({ storage });

// POST /api/tickets - Create a new civic hazard ticket, uploading media for AI Verification
router.post('/', optionalAuth, upload.single('file'), ticketController.createTicket);

// GET /api/tickets/nearby - Fetch hazards within a customizable radius using PostGIS ST_DWithin
router.get('/nearby', ticketController.getNearbyHazards);

module.exports = router;
