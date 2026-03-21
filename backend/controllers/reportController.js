const { VertexAI } = require('@google-cloud/vertexai');
const pgDb = require('../config/db');
// Firebase import kept only for legacy createReport — will be removed in future
let db;
try { db = require('../config/firebase').db; } catch(e) { console.warn('[reportController] Firebase not available, using PostgreSQL only'); }
const { point } = require('@turf/helpers');
const turfDistance = require('@turf/distance');
const distance = turfDistance.default || turfDistance;

// Initialize Vertex AI
const vertex_ai = new VertexAI({
    project: process.env.GCP_PROJECT_ID,
    location: 'us-central1'
});


// --- FASTEST AVAILABLE MODEL ---
// Using Gemini 2.0 Flash (Version 001) for maximum speed
const modelName = 'gemini-2.0-flash-001';
console.log(`🚀 Speed Mode: Vertex AI Controller using '${modelName}'`);

const generativeModel = vertex_ai.getGenerativeModel({
    model: modelName,
    generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.0,
    },
});

const sanitizeKey = (key) => {
    if (!key) return "General";
    return key.replace(/[\/\.#\$\[\]]/g, "_");
};

// ====== SMART DISPATCH: issue_type / report type → Department Auto-Routing ======
// STRICT: These strings MUST match the Admin registration dropdown in Register.jsx
// Available depts: Police, Traffic, Fire & Safety, Municipal/Waste, Public Works
const ISSUE_TO_DEPARTMENT = {
    // Fire & Safety
    'fire': 'Fire & Safety', 'fire & safety': 'Fire & Safety',
    'gas_leak': 'Fire & Safety', 'explosion': 'Fire & Safety', 'building_collapse': 'Fire & Safety',
    // Municipal/Waste
    'garbage': 'Municipal/Waste', 'overflowing_bin': 'Municipal/Waste', 'illegal_dumping': 'Municipal/Waste',
    'stray_animal': 'Municipal/Waste', 'dead_animal': 'Municipal/Waste', 'broken_streetlight': 'Municipal/Waste',
    'open_manhole': 'Municipal/Waste', 'peeling_road_paint': 'Municipal/Waste', 'municipal/waste': 'Municipal/Waste',
    'sewage': 'Municipal/Waste', 'drainage': 'Municipal/Waste',
    // Public Works (roads, water, electricity, infrastructure)
    'pothole': 'Public Works', 'road_damage': 'Public Works', 'broken_road': 'Public Works',
    'road_blockage': 'Public Works', 'fallen_tree': 'Public Works', 'public works': 'Public Works',
    'water_leak': 'Public Works', 'flood': 'Public Works', 'waterlogging': 'Public Works',
    'electrical_hazard': 'Public Works', 'power_outage': 'Public Works',
    'fallen_wire': 'Public Works', 'transformer': 'Public Works', 'broken_infrastructure': 'Public Works',
    // Traffic
    'traffic_violation': 'Traffic', 'signal_fault': 'Traffic', 'accident': 'Traffic', 'traffic': 'Traffic',
    // Police
    'crime': 'Police', 'theft': 'Police', 'vandalism': 'Police', 'suspicious_activity': 'Police', 'police': 'Police',
    // Medical → Municipal/Waste (closest available dept)
    'medical_emergency': 'Municipal/Waste', 'injury': 'Municipal/Waste',
    // Fallback
    'none': 'Municipal/Waste',
};

// Valid departments — the ONLY strings allowed in the system
const VALID_DEPARTMENTS = ['Police', 'Traffic', 'Fire & Safety', 'Municipal/Waste', 'Public Works'];

const resolveReportDepartment = (reportType, existingDept) => {
    // If existingDept is already a valid department string, keep it
    if (existingDept && VALID_DEPARTMENTS.includes(existingDept)) return existingDept;
    const key = (reportType || '').toLowerCase().replace(/\s+/g, '_');
    return ISSUE_TO_DEPARTMENT[key] || ISSUE_TO_DEPARTMENT[(reportType || '').toLowerCase()] || 'Municipal/Waste';
};

exports.verifyReportImage = async (req, res) => {
    const { imageBase64, type } = req.body;

    if (!imageBase64) {
        return res.status(400).json({ error: "No image/media provided" });
    }

    if (!process.env.GEMINI_API_KEY) {
        // Warning only, as we use Vertex AI service account primarily
        console.warn("[AI WARNING] GEMINI_API_KEY missing - relying on Vertex AI credentials");
    }

    try {
        console.log("[AI] Analyzing media for type:", type);

        const prompt = `
  You are a filtering algorithm designed to REJECT Stock Photos and Staged Images.
  Do not act as a "helper". Your job is to BLOCK fake reports.

  Analyze the visual style of this media (image/video).

  CRITICAL FAIL CONDITIONS (If any are true, verified = false):
  1. **Cinematic Lighting:** Is there dramatic blue/orange lighting, backlighting, or perfect studio lighting? (Real civic photos are flat/dull).
  2. **Staged Action:** Does it look like a movie scene? (e.g. A burglar in a mask "sneaking", a model posing)?
  3. **High Production Value:** Is the image/video sharp, perfectly framed, with artistic bokeh (blur)? (Real citizen photos are often blurry, messy, and poorly framed).
  4. **Digital Marks:** Watermarks, text overlays, UI bars (screenshots).

  If it looks like a Stock Photo or Movie Scene, you MUST REJECT it. 
  "Stock photo of a burglar" is NOT a valid report. It is a FAKE.

  Only accept the media if it looks like a **boring, amateur, low-quality** recording by a citizen.

  If valid (Real):
  Identify the department: Police, Traffic, Fire & Safety, Municipal/Waste, Public Works.

  RETURN JSON ONLY:
  {
    "verified": boolean,
    "department": "Name" or null,
    "detected_issue": "Short Title",
    "explanation": "REJECTED: [Reason] OR ACCEPTED: [Description]",
    "severity": "Low" | "Medium" | "High" | "Critical",
    "ai_confidence": number
  }
`;

        // Detect mime type
        const mimeType = imageBase64.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";
        // FIX: Correctly strip metadata for ANY mime type (video, audio, etc)
        const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, "");

        const request = {
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: mimeType, data: base64Data } }
                ]
            }]
        };

        const result = await generativeModel.generateContent(request);
        const response = await result.response;
        const text = response.candidates[0].content.parts[0].text;
        console.log("[AI RAW RESPONSE]:", text);

        // More robust JSON extraction
        let jsonStr = text;
        if (text.includes("```")) {
            jsonStr = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || text;
        }
        jsonStr = jsonStr.trim();

        const analysis = JSON.parse(jsonStr);
        res.status(200).json({ analysis });

    } catch (error) {
        console.error("[AI ERROR] Full details:", error);
        res.status(500).json({ error: "AI Verification Failed", details: error.message });
    }
};

exports.detectLocationFromText = async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    try {
        console.log("[AI] Analyzing text for location:", text);
        const prompt = `
            You are a Geographic Entity Extractor for a Smart City App.
            Analyze the following user report description and extract location details.

            USER TEXT: "${text}"

            Identify:
            1. Specific Landmarks or Address (e.g., "Near Albert Ekka Chowk", "Main Road opposite Big Bazaar")
            2. Ward Name or Number if mentioned (e.g., "Ward 5", "Kokar Area")

            RETURN JSON ONLY in this format:
            {
                "found": boolean,
                "location_string": "Optimized search string for Google Maps",
                "ward": "Inferred Ward/Area name" or null,
                "confidence": "High" | "Medium" | "Low"
            }
            
            If no location is mentioned, set "found": false.
        `;

        const result = await generativeModel.generateContent(prompt);
        const response = await result.response;
        const rawText = response.candidates[0].content.parts[0].text;

        // Clean JSON
        let jsonStr = rawText;
        if (rawText.includes("```")) {
            jsonStr = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || rawText;
        }

        res.status(200).json(JSON.parse(jsonStr.trim()));
    } catch (error) {
        console.error("Location Detection Error:", error);
        res.status(500).json({ error: "AI Analysis Failed" });
    }
};


exports.createReport = async (req, res) => {
    const reportData = req.body;
    const { userId } = reportData;

    try {
        // 1. Generate a new report ID
        const reportsRef = db.ref('reports');
        const newReportRef = reportsRef.push();
        const reportId = newReportRef.key;

        // SMART DISPATCH: Auto-assign department from report type
        const autoDept = resolveReportDepartment(reportData.type || reportData.category, reportData.department);
        console.log(`[SmartDispatch] Report type="${reportData.type}" → dept="${autoDept}"`);

        const finalizedReport = {
            ...reportData,
            id: reportId,
            department: autoDept,
            status: 'Pending',
            createdAt: new Date().toISOString(),
        };

        // 2. Save report
        await newReportRef.set(finalizedReport);

        // EXTRA: Emergency Escalation
        const isCritical = ['Fire & Safety', 'Medical/Ambulance', 'Police'].includes(reportData.department) || reportData.priority === 'Critical';

        if (isCritical) {
            console.log(`[ESCALATION] Critical Incident Detected: ${reportData.department}`);
            try {
                const nodemailer = require('nodemailer');
                if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                    const transporter = nodemailer.createTransport({
                        service: 'gmail',
                        auth: {
                            user: process.env.EMAIL_USER,
                            pass: process.env.EMAIL_PASS
                        }
                    });

                    const mailOptions = {
                        from: '"Nagar Alert System" <alert@nagarhub.com>',
                        to: 'emergency@city.gov.in', // Mock Authority
                        subject: `🚨 CRITICAL ALERT: ${reportData.department.toUpperCase()} - ${reportData.type}`,
                        html: `
                            <div style="font-family: Arial, sans-serif; color: #333;">
                                <h1 style="color: #d9534f;">🚨 CRITICAL INCIDENT REPORTED</h1>
                                <p><strong>Type:</strong> ${reportData.type}</p>
                                <p><strong>Department:</strong> ${reportData.department}</p>
                                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                                <div style="background: #f9f9f9; padding: 15px; border-left: 5px solid #d9534f; margin: 20px 0;">
                                    <strong>📍 Location:</strong><br>
                                    ${reportData.location?.address || 'Address not available'}<br>
                                    <a href="https://www.google.com/maps?q=${reportData.location?.lat},${reportData.location?.lng}">View on Map</a>
                                </div>
                                <p><i>This is an automated escalation from Nagar Alert Hub.</i></p>
                            </div>
                        `
                    };

                    transporter.sendMail(mailOptions).then(() => {
                        console.log(`[ESCALATION] Emergency Email sent for Report ${reportId}`);
                    }).catch(err => {
                        console.error("[ESCALATION] Email failed:", err.message);
                    });
                }
            } catch (e) {
                console.error("[ESCALATION] Module error:", e);
            }
        }

        // EXTRA: Save to department-specific node
        if (reportData.department) {
            const sanitizedDept = sanitizeKey(reportData.department);
            const deptRef = db.ref(`reports/by_department/${sanitizedDept}/${reportId}`);
            await deptRef.set(finalizedReport);
        }

        // 3. Update User's report count and points
        if (userId) {
            try {
                const citizenRef = db.ref(`users/citizens/${userId}`);
                const snapshot = await citizenRef.once('value');
                if (snapshot.exists()) {
                    const currentData = snapshot.val();
                    await citizenRef.update({
                        reportsCount: (currentData.reportsCount || 0) + 1,
                        points: (currentData.points || 0) + 10
                    });
                } else {
                    await citizenRef.set({
                        reportsCount: 1,
                        points: 10,
                        level: 1,
                        joinedAt: new Date().toISOString()
                    });
                }
            } catch (err) { console.error("Update User Stats Error", err); }
        }

        res.status(201).json({ message: "Report created successfully", id: reportId, data: finalizedReport });

    } catch (error) {
        console.error("Create Report Error:", error);
        res.status(500).json({ error: "Failed to create report", details: error.message });
    }
};

exports.getAllReports = async (req, res) => {
    try {
        const adminDept = req.user?.department;
        console.log(`[BACKEND-PG] Fetching reports | Admin dept: ${adminDept || 'ALL (superadmin)'}`);

        let query, values;
        if (adminDept && adminDept !== 'General' && adminDept !== 'All') {
            // Department-scoped admin: only their tickets
            query = `
                SELECT id, user_phone, issue_type, severity, image_url, status, created_at,
                       description, department,
                       ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
                FROM tickets
                WHERE department = $1
                ORDER BY created_at DESC;
            `;
            values = [adminDept];
        } else {
            // Superadmin: all tickets
            query = `
                SELECT id, user_phone, issue_type, severity, image_url, status, created_at,
                       description, department,
                       ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
                FROM tickets
                ORDER BY created_at DESC;
            `;
            values = [];
        }

        const result = await pgDb.query(query, values);
        // Transform rows to match frontend expected shape
        const reports = result.rows.map(row => {
            const mediaPath = row.image_url || null;
            const fullMediaUrl = mediaPath ? `${req.protocol}://${req.get('host')}${mediaPath}` : null;
            const ext = mediaPath ? mediaPath.split('.').pop().toLowerCase() : '';
            const mediaType = ['mp4','webm','mov','avi'].includes(ext) ? 'video'
                            : ['mp3','wav','ogg','m4a'].includes(ext) ? 'audio' : 'image';
            return {
                id: row.id,
                type: row.issue_type,
                issue_type: row.issue_type,
                category: row.issue_type,
                severity: row.severity,
                status: row.status || 'Pending',
                description: row.description,
                department: row.department,
                user_phone: row.user_phone,
                image_url: mediaPath,
                imageUrl: fullMediaUrl,
                mediaType,
                createdAt: row.created_at,
                created_at: row.created_at,
                location: {
                    lat: row.lat,
                    lng: row.lng,
                    address: (row.lat && row.lng) ? `${Number(row.lat).toFixed(4)}°N, ${Number(row.lng).toFixed(4)}°E` : 'Location Not Set'
                }
            };
        });

        console.log(`[BACKEND-PG] Returning ${reports.length} reports for dept: ${adminDept || 'ALL'}`);
        res.status(200).json({ reports });
    } catch (error) {
        console.error("Get All Reports Error:", error);
        res.status(500).json({ error: "Failed to fetch all reports" });
    }
};

exports.getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 1. Aggregate Stats
        const statsQuery = `
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'Pending' OR status = 'Open') as pending,
                COUNT(*) FILTER (WHERE status = 'Resolved' OR status = 'Accepted') as resolved,
                COUNT(*) FILTER (WHERE status = 'Rejected' OR status = 'Rejected - Unconventional Report') as rejected,
                COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress
            FROM tickets
            WHERE user_id = $1;
        `;
        const statsResult = await pgDb.query(statsQuery, [userId]);
        const dbStats = statsResult.rows[0];

        // 2. Recent Activity (Latest 5)
        const recentQuery = `
            SELECT id, issue_type, status, image_url, created_at,
                   ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
            FROM tickets
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 5;
        `;
        const recentResult = await pgDb.query(recentQuery, [userId]);
        const recentReports = recentResult.rows.map(row => ({
            id: row.id,
            type: row.issue_type,
            status: row.status,
            timestamp: row.created_at,
            location: {
                lat: row.lat,
                lng: row.lng,
                address: (row.lat && row.lng) ? `${Number(row.lat).toFixed(4)}°N, ${Number(row.lng).toFixed(4)}°E` : 'Location Not Set'
            }
        }));

        // 3. Weekly Data (Last 7 days aggregation)
        const weeklyQuery = `
            SELECT 
                TO_CHAR(created_at, 'Dy') as name,
                COUNT(*) as reports,
                COUNT(*) FILTER (WHERE status = 'Resolved' OR status = 'Accepted') as resolved
            FROM tickets
            WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
            GROUP BY name, TO_CHAR(created_at, 'D')
            ORDER BY TO_CHAR(created_at, 'D');
        `;
        const weeklyResult = await pgDb.query(weeklyQuery, [userId]);

        // 4. Category Data (All time by issue_type)
        const categoryQuery = `
            SELECT issue_type as name, COUNT(*) as value
            FROM tickets
            WHERE user_id = $1
            GROUP BY issue_type;
        `;
        const categoryResult = await pgDb.query(categoryQuery, [userId]);

        // 5. Karma Calculation (Logic: Resolved=+10, Pending=+2)
        const karma = (parseInt(dbStats.resolved || 0) * 10) + (parseInt(dbStats.pending || 0) * 2);

        res.status(200).json({
            stats: {
                total: parseInt(dbStats.total || 0),
                pending: parseInt(dbStats.pending || 0),
                resolved: parseInt(dbStats.resolved || 0),
                rejected: parseInt(dbStats.rejected || 0),
                inProgress: parseInt(dbStats.in_progress || 0)
            },
            recentReports,
            weeklyData: weeklyResult.rows,
            categoryData: categoryResult.rows.map(r => ({
                name: r.name.charAt(0).toUpperCase() + r.name.slice(1),
                value: parseInt(r.value)
            })),
            karma,
            rank: karma > 500 ? "Gold Protector" : karma > 100 ? "Silver Guardian" : "Community Watcher"
        });
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
};

exports.getUserReports = async (req, res) => {
    try {
        // Strictly use req.user.id from authMiddleware
        const userId = req.user?.id || req.params.uid;
        console.log(`[BACKEND-PG] Fetching reports for User ID: ${userId}`);

        const query = `
            SELECT id, user_phone, issue_type, severity, image_url, status, created_at,
                   description, department,
                   ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
            FROM tickets
            WHERE user_id = $1
            ORDER BY created_at DESC;
        `;
        const result = await pgDb.query(query, [userId]);
        
        const reports = result.rows.map(row => {
            const mediaPath = row.image_url || null;
            const fullMediaUrl = mediaPath ? `${req.protocol}://${req.get('host')}${mediaPath}` : null;
            const ext = mediaPath ? mediaPath.split('.').pop().toLowerCase() : '';
            const mediaType = ['mp4','webm','mov','avi'].includes(ext) ? 'video'
                            : ['mp3','wav','ogg','m4a'].includes(ext) ? 'audio' : 'image';
            
            return {
                id: row.id,
                type: row.issue_type,
                issue_type: row.issue_type,
                category: row.issue_type,
                severity: row.severity,
                status: row.status || 'Pending',
                description: row.description,
                department: row.department,
                user_phone: row.user_phone,
                image_url: mediaPath,
                imageUrl: fullMediaUrl,
                mediaType,
                createdAt: row.created_at,
                created_at: row.created_at,
                location: {
                    lat: row.lat,
                    lng: row.lng,
                    address: (row.lat && row.lng) ? `${Number(row.lat).toFixed(4)}°N, ${Number(row.lng).toFixed(4)}°E` : 'Location Not Set'
                }
            };
        });

        res.status(200).json({ reports });
    } catch (error) {
        console.error("User Reports Error:", error);
        res.status(500).json({ error: "Failed to fetch user reports", details: error.message });
    }
};

exports.getSingleReport = async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT id, user_phone, issue_type, severity, image_url, status, created_at,
                   description, department,
                   ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
            FROM tickets
            WHERE id = $1;
        `;
        const result = await pgDb.query(query, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Report not found" });

        const row = result.rows[0];
        const mediaPath = row.image_url || null;
        const fullMediaUrl = mediaPath ? `${req.protocol}://${req.get('host')}${mediaPath}` : null;
        const ext = mediaPath ? mediaPath.split('.').pop().toLowerCase() : '';
        const mediaType = ['mp4','webm','mov','avi'].includes(ext) ? 'video'
                        : ['mp3','wav','ogg','m4a'].includes(ext) ? 'audio' : 'image';
        const report = {
            id: row.id,
            type: row.issue_type,
            issue_type: row.issue_type,
            category: row.issue_type,
            severity: row.severity,
            status: row.status || 'Pending',
            description: row.description,
            department: row.department,
            user_phone: row.user_phone,
            image_url: mediaPath,
            imageUrl: fullMediaUrl,
            mediaType,
            createdAt: row.created_at,
            created_at: row.created_at,
            location: {
                lat: row.lat,
                lng: row.lng,
                address: (row.lat && row.lng) ? `${Number(row.lat).toFixed(4)}°N, ${Number(row.lng).toFixed(4)}°E` : 'Location Not Set'
            }
        };
        res.status(200).json({ report });
    } catch (error) {
        console.error("Get Single Report Error:", error);
        res.status(500).json({ error: "Failed to fetch report", details: error.message });
    }
};

exports.getDepartmentReports = async (req, res) => {
    const { department } = req.params;
    try {
        const query = `
            SELECT id, user_phone, issue_type, severity, image_url, status, created_at,
                   description, department,
                   ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
            FROM tickets
            WHERE department = $1
            ORDER BY created_at DESC;
        `;
        const result = await pgDb.query(query, [department]);
        const reports = result.rows.map(row => {
            const mediaPath = row.image_url || null;
            const fullMediaUrl = mediaPath ? `${req.protocol}://${req.get('host')}${mediaPath}` : null;
            const ext = mediaPath ? mediaPath.split('.').pop().toLowerCase() : '';
            const mediaType = ['mp4','webm','mov','avi'].includes(ext) ? 'video'
                            : ['mp3','wav','ogg','m4a'].includes(ext) ? 'audio' : 'image';
            return {
                id: row.id,
                type: row.issue_type,
                issue_type: row.issue_type,
                category: row.issue_type,
                severity: row.severity,
                status: row.status || 'Pending',
                description: row.description,
                department: row.department,
                user_phone: row.user_phone,
                image_url: mediaPath,
                imageUrl: fullMediaUrl,
                mediaType,
                createdAt: row.created_at,
                created_at: row.created_at,
                location: {
                    lat: row.lat,
                    lng: row.lng,
                    address: (row.lat && row.lng) ? `${Number(row.lat).toFixed(4)}°N, ${Number(row.lng).toFixed(4)}°E` : 'Location Not Set'
                }
            };
        });
        res.status(200).json({ reports });
    } catch (error) {
        console.error("Get Department Reports Error:", error);
        res.status(500).json({ error: "Failed to fetch department reports", details: error.message });
    }
};

exports.updateReportStatus = async (req, res) => {
    const { reportId, status } = req.body;
    if (!reportId || !status) return res.status(400).json({ error: "Missing reportId or status" });

    try {
        const updateQuery = `
            UPDATE tickets SET status = $1 WHERE id = $2
            RETURNING id, status, issue_type, department;
        `;
        const result = await pgDb.query(updateQuery, [status, reportId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Report not found" });
        }

        console.log(`[BACKEND-PG] Ticket ${reportId} status updated to: ${status}`);
        res.status(200).json({ message: "Status updated successfully", ticket: result.rows[0] });
    } catch (error) {
        console.error("Update Status Error:", error);
        res.status(500).json({ error: "Failed to update status", details: error.message });
    }
};

exports.sendBroadcast = async (req, res) => {
    const { area, type, message, department, sender, reach } = req.body;
    try {
        const { broadcastTargetedAlert } = require('./whatsappController');
        const waMessage = `📢 *${(type || 'ALERT').toUpperCase()}*\n📍 Area: ${area}\n\n${message}`;
        await broadcastTargetedAlert(area, waMessage);
        const broadcastRef = db.ref('broadcasts');
        await broadcastRef.push({
            area, type, message, department: department || 'General',
            sender: sender || 'Admin', timestamp: new Date().toISOString(),
            reach: reach || 0, status: 'Sent'
        });
        res.status(200).json({ message: "Broadcast sent successfully" });
    } catch (error) {
        console.error("Broadcast Error:", error);
        res.status(500).json({ error: "Failed to send broadcast", details: error.message });
    }
};

exports.getNearbyReports = async (req, res) => {
    const { lat, lng, radius = 5 } = req.query; // Radius in km

    if (!lat || !lng) {
        return res.status(400).json({ error: "Latitude and Longitude required" });
    }

    try {
        const centerLat = parseFloat(lat);
        const centerLng = parseFloat(lng);

        if (isNaN(centerLat) || isNaN(centerLng)) {
            return res.status(400).json({ error: "Invalid Coordinates Provided" });
        }

        console.log(`[GEO] Searching nearby reports: ${centerLat}, ${centerLng} within ${radius}km`);

        const reportsRef = db.ref('reports');
        const snapshot = await reportsRef.once('value');

        if (!snapshot.exists()) {
            return res.status(200).json({ reports: [] });
        }

        const allReports = snapshot.val();
        const nearby = [];

        // Turf uses [lng, lat] order
        const center = point([centerLng, centerLat]);

        Object.keys(allReports).forEach(key => {
            const r = allReports[key];
            if (r.location && r.location.lat && r.location.lng) {
                const reportLat = parseFloat(r.location.lat);
                const reportLng = parseFloat(r.location.lng);

                // Ensure report coordinates are valid
                if (!isNaN(reportLat) && !isNaN(reportLng) && reportLat !== 0) {
                    try {
                        const target = point([reportLng, reportLat]);
                        const distanceKm = distance(center, target, { units: 'kilometers' });

                        if (distanceKm <= parseFloat(radius)) {
                            nearby.push({ id: key, ...r, distance: distanceKm.toFixed(2) });
                        }
                    } catch (geoErr) {
                        console.warn(`[GEO_SKIP] Failed to calculate dist for report ${key}:`, geoErr.message);
                    }
                }
            }
        });

        // Sort by distance (nearest first)
        nearby.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

        console.log(`[GEO] Found ${nearby.length} reports nearby.`);
        res.status(200).json({ count: nearby.length, reports: nearby });

    } catch (error) {
        console.error("Geo Filter Error Stack:", error.stack);
        res.status(500).json({ error: "Geo Calculation Failed", details: error.message });
    }
};