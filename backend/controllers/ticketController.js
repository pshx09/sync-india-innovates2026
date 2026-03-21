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
            INSERT INTO tickets (user_id, user_phone, issue_type, severity, image_url, location, description, department, ai_summary, ai_confidence)
            VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, $9, $10, $11)
            RETURNING id, user_id, user_phone, issue_type, severity, image_url, status, created_at, 
                      ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat, description, department, ai_summary, ai_confidence;
        `;
        
        // Convert AI float confidence (0.0–1.0) to integer percentage (0–100) for PostgreSQL INTEGER column
        const rawConf = parseFloat(aiResult.confidence);
        const confidenceInt = (!isNaN(rawConf) && rawConf <= 1) ? Math.round(rawConf * 100) : Math.round(rawConf || 0);

        const values = [
            req.user?.id || null, // Capture authenticated user ID if present
            user_phone || null, 
            issue_type, 
            severity, 
            image_url, 
            lng, 
            lat, 
            smart_description, 
            autoAssignedDept,
            aiResult.ai_summary || "No AI summary",
            confidenceInt
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

/**
 * PATCH /api/tickets/:id/status — RESTful status update
 * Accepts: { status: 'open' | 'pending' | 'in_progress' | 'accepted' | 'resolved' | 'rejected' }
 */
exports.updateTicketStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const VALID_STATUSES = ['open', 'pending', 'in_progress', 'accepted', 'resolved', 'rejected', 'Pending', 'Open', 'In Progress', 'Accepted', 'Resolved', 'Rejected', 'Rejected - Unconventional Report'];

    if (!id || !status) {
        return res.status(400).json({ error: "Missing ticket ID or status" });
    }

    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status: '${status}'. Allowed: ${VALID_STATUSES.join(', ')}` });
    }

    try {
        const updateQuery = `
            UPDATE tickets SET status = $1 WHERE id = $2
            RETURNING id, status, issue_type, severity, department, created_at;
        `;
        const result = await db.query(updateQuery, [status, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }

        console.log(`[PATCH] Ticket ${id} status → ${status}`);
        res.status(200).json({ message: "Status updated", ticket: result.rows[0] });
    } catch (error) {
        console.error("[PATCH] Update Ticket Status Error:", error);
        res.status(500).json({ error: "Failed to update ticket status", details: error.message });
    }
};

/**
 * GET /api/tickets/my-reports — Citizen's own tickets (uses req.user.id from JWT)
 */
exports.getMyReports = async (req, res) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT 
                t.id, t.issue_type, t.severity, t.status, t.description, t.department,
                t.image_url, t.ai_summary, t.ai_confidence, t.created_at,
                ST_Y(t.location::geometry) AS lat,
                ST_X(t.location::geometry) AS lng
            FROM tickets t
            WHERE t.user_id = $1
            ORDER BY t.created_at DESC;
        `;
        const result = await db.query(query, [userId]);

        const API_BASE = `${req.protocol}://${req.get('host')}`;

        const reports = result.rows.map(row => ({
            id: row.id,
            type: row.issue_type,
            severity: row.severity,
            status: row.status,
            description: row.description,
            department: row.department,
            imageUrl: row.image_url ? (row.image_url.startsWith('http') ? row.image_url : `${API_BASE}${row.image_url}`) : null,
            mediaType: 'image',
            ai_summary: row.ai_summary,
            aiConfidence: row.ai_confidence,
            createdAt: row.created_at,
            location: {
                lat: row.lat,
                lng: row.lng,
                address: row.description || 'Location available'
            }
        }));

        res.status(200).json({ reports });
    } catch (error) {
        console.error("[GET] My Reports Error:", error);
        res.status(500).json({ error: "Failed to fetch your reports", details: error.message });
    }
};
