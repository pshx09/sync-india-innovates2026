const MapplsService = require('../services/mapplsService');
const db = require('../config/db');

exports.calculateSafeRoute = async (req, res) => {
    try {
        const { startLat, startLng, endLat, endLng } = req.query;
        
        if (!startLat || !startLng || !endLat || !endLng) {
            return res.status(400).json({ error: 'Origin and destination coordinates are required' });
        }

        // Fetch all active hazards that have High severity or critical priority
        // Using PostGIS to grab coords natively
        const query = `
            SELECT 
                ST_X(location::geometry) as lng, 
                ST_Y(location::geometry) as lat
            FROM tickets
            WHERE status != 'Resolved' AND severity IN ('High', 'Critical')
        `;
        
        const result = await db.query(query);
        const hazardsArray = result.rows;

        // Pass coordinates and hazards to the Mappls service
        const routeData = await MapplsService.getSafeRoute(
            parseFloat(startLat), parseFloat(startLng), 
            parseFloat(endLat), parseFloat(endLng), 
            hazardsArray
        );
        
        res.status(200).json({
            success: true,
            route: routeData
        });
        
    } catch (error) {
        console.error("Route Controller Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
