const MapplsService = require('../services/mapplsService');
const db = require('../config/db');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

/**
 * Phase 8: AI Forensics + Smart Dispatch + Fake Gatekeeping
 */
exports.createTicket = async (req, res) => {
    try {
        const { user_phone, lat, lng, description, department } = req.body;

        if (!lat || !lng || !req.file) {
            return res.status(400).json({ error: "Missing required fields: lat, lng, or media file." });
        }

        // ====== 1. Build multipart form for Python AI Service ======
        const form = new FormData();
        // Disk storage: read file from saved path
        form.append('file', fs.createReadStream(req.file.path), {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        // Phase 8: Pass user context to AI for Smart Dispatch
        if (description) {
            form.append('description', description);
        }
        form.append('location_data', `Lat: ${lat}, Lng: ${lng}`);

        console.log("[Node] Forwarding media + context to AI Forensics Service v2...");
        
        let aiResult;
        try {
            const aiResponse = await axios.post('http://localhost:8000/analyze', form, {
                headers: { ...form.getHeaders() },
                timeout: 120000 // 2 min timeout for AI processing
            });
            aiResult = aiResponse.data;
            console.log("[Node] AI Forensics result:", JSON.stringify(aiResult, null, 2));
        } catch (aiError) {
            console.error("[Node] AI Service Error:", aiError.message);
            return res.status(503).json({ error: "AI Forensics Service is unreachable or failed." });
        }

        // ====== 2. STRICT GATEKEEPING: Fake/Watermark Rejection ======
        if (aiResult.is_fake_or_watermarked) {
            console.log("[Node] REJECTED — AI detected fake/watermarked media.");
            return res.status(400).json({
                error: "Submission rejected by AI Forensics.",
                reason: "The uploaded media was flagged as fake, watermarked, AI-generated, or a photo of a screen. Only authentic, original photos are accepted.",
                ai_data: aiResult
            });
        }

        if (!aiResult.is_valid_civic_issue) {
            console.log("[Node] REJECTED — AI did not detect a valid civic issue.");
            return res.status(400).json({
                error: "AI rejected this submission.",
                reason: "No valid civic hazard or infrastructure issue was detected in the media.",
                ai_data: aiResult
            });
        }

        const issue_type = aiResult.issue_type;
        const severity = aiResult.severity;
        // Save the relative URL path for the uploaded file
        const image_url = `/uploads/${req.file.filename}`;

        // ====== 3. SMART DISPATCH: AI issue_type → Department Auto-Routing ======
        // STRICT: These strings MUST match the Admin registration dropdown in Register.jsx
        // Available depts: Police, Traffic, Fire & Safety, Municipal/Waste, Public Works
        const ISSUE_TO_DEPARTMENT = {
            // Fire & Safety
            'fire': 'Fire & Safety',
            'gas_leak': 'Fire & Safety',
            'explosion': 'Fire & Safety',
            'building_collapse': 'Fire & Safety',
            // Municipal/Waste
            'garbage': 'Municipal/Waste',
            'overflowing_bin': 'Municipal/Waste',
            'illegal_dumping': 'Municipal/Waste',
            'stray_animal': 'Municipal/Waste',
            'dead_animal': 'Municipal/Waste',
            'broken_streetlight': 'Municipal/Waste',
            'open_manhole': 'Municipal/Waste',
            'peeling_road_paint': 'Municipal/Waste',
            'sewage': 'Municipal/Waste',
            'drainage': 'Municipal/Waste',
            // Public Works (roads, water, electricity, infrastructure)
            'pothole': 'Public Works',
            'road_damage': 'Public Works',
            'broken_road': 'Public Works',
            'road_blockage': 'Public Works',
            'fallen_tree': 'Public Works',
            'water_leak': 'Public Works',
            'flood': 'Public Works',
            'waterlogging': 'Public Works',
            'electrical_hazard': 'Public Works',
            'power_outage': 'Public Works',
            'fallen_wire': 'Public Works',
            'transformer': 'Public Works',
            'broken_infrastructure': 'Public Works',
            // Traffic
            'traffic_violation': 'Traffic',
            'signal_fault': 'Traffic',
            'accident': 'Traffic',
            // Police
            'crime': 'Police',
            'theft': 'Police',
            'vandalism': 'Police',
            'suspicious_activity': 'Police',
            // Medical → Municipal/Waste (closest available dept)
            'medical_emergency': 'Municipal/Waste',
            'injury': 'Municipal/Waste',
            // Fallback
            'none': 'Municipal/Waste',
        };

        // Auto-assign department from AI issue_type (override user-submitted department)
        const autoAssignedDept = ISSUE_TO_DEPARTMENT[issue_type?.toLowerCase()] || department || 'Municipal/Waste';
        console.log(`[Node] Smart Dispatch: issue_type="${issue_type}" → department="${autoAssignedDept}"`);

        // ====== 4. Use AI-generated summary, NOT raw user description ======
        const smart_description = aiResult.ai_summary || description || "No description available.";

        // ====== 5. Insert verified ticket into PostGIS ======
        const insertQuery = `
            INSERT INTO tickets (user_id, user_phone, issue_type, severity, image_url, location, description, department)
            VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, $9)
            RETURNING id, user_id, user_phone, issue_type, severity, image_url, status, created_at, 
                      ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat, description, department;
        `;
        
        const values = [
            req.user?.id || null, // Capture authenticated user ID if present
            user_phone || null, 
            issue_type, 
            severity, 
            image_url, 
            lng, 
            lat, 
            smart_description, 
            autoAssignedDept
        ];
        
        const result = await db.query(insertQuery, values);
        const newTicket = result.rows[0];

        console.log(`[Node] Ticket #${newTicket.id} created | type=${issue_type} | severity=${severity} | fake=false`);

        res.status(201).json({
            message: "Ticket created successfully — Verified by AI Forensics v2",
            ticket: newTicket,
            ai_data: aiResult
        });

    } catch (error) {
        console.error("Create Ticket Error:", error);
        res.status(500).json({ error: "Failed to process ticket request", details: error.message });
    }
};

/**
 * Fetch nearby hazards using PostGIS ST_DWithin
 */
exports.getNearbyHazards = async (req, res) => {
    const { lat, lng, radiusInMeters = 5000 } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({ error: "Latitude and Longitude are required." });
    }

    try {
        const query = `
            SELECT 
                id, user_phone, issue_type, severity, image_url, status, created_at, description,
                ST_AsGeoJSON(location)::json AS geojson
            FROM tickets
            WHERE ST_DWithin(
                location::geography, 
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
                $3
            )
            ORDER BY created_at DESC;
        `;
        
        const values = [lng, lat, radiusInMeters];
        const result = await db.query(query, values);

        res.status(200).json({
            count: result.rowCount,
            hazards: result.rows
        });

    } catch (error) {
        console.error("Geo Filter Error:", error);
        res.status(500).json({ error: "Failed to fetch nearby hazards", details: error.message });
    }
};
