const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');

// GET /api/routes/safe-path - Retrieve dynamic polyline bypassing PostGIS hazards
router.get('/safe-path', routeController.calculateSafeRoute);

module.exports = router;
