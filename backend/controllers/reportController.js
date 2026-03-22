const pgDb = require('../config/db');
// Firebase import kept only for legacy createReport — will be removed in future
let db;
try { db = require('../config/firebase').db; } catch (e) { console.warn('[reportController] Firebase not available, using PostgreSQL only'); }
const { point } = require('@turf/helpers');
const turfDistance = require('@turf/distance');
const distance = turfDistance.default || turfDistance;
const axios = require('axios');
const FormData = require('form-data');

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

    try {
        console.log("[AI] Analyzing media for type:", type);

        // Detect mime type
        const mimeType = imageBase64.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";
        const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        const formData = new FormData();
        formData.append("file", buffer, { filename: "upload.media", contentType: mimeType });
        formData.append("description", "none");
        formData.append("location_data", "none");

        const aiUrl = process.env.AI_SERVICE_URL;
        if (!aiUrl) {
            console.warn("[WARNING] AI_SERVICE_URL is not defined in environment.");
            return res.status(200).json({
                analysis: {
                    verified: true, department: null, detected_issue: type || "General Issue",
                    explanation: "ACCEPTED: Verification pending (AI configuration missing)", severity: "Medium", ai_confidence: 50
                }
            });
        }

        console.log(`[AI] Dispatching visual analysis to ${aiUrl}/analyze`);
        
        let analysis;
        try {
            const aiResponse = await axios.post(`${aiUrl}/analyze`, formData, {
                headers: formData.getHeaders(),
                timeout: 30000
            });
            const result = aiResponse.data;
            
            // Map FastAPI format to expected format
            analysis = {
                verified: result.is_valid_civic_issue,
                department: null, // Let createReport auto-route
                detected_issue: result.issue_type,
                explanation: result.ai_summary || "Processed by local AI",
                severity: result.severity || "Medium",
                ai_confidence: result.confidence ? result.confidence * 100 : 85
            };
        } catch (postErr) {
            console.error("[AI ERROR] Local AI Server Failed:", postErr.message);
            // Graceful fallback to prevent crashes
            analysis = {
                verified: true,
                department: null,
                detected_issue: type || "General Issue",
                explanation: "ACCEPTED: Verification pending (AI server down)",
                severity: "Medium",
                ai_confidence: 50
            };
        }

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

        const ollamaUrl = process.env.OLLAMA_SERVICE_URL;
        
        if (!ollamaUrl) {
            console.warn("[WARNING] OLLAMA_SERVICE_URL is not defined in environment.");
            return res.status(200).json({ found: false, location_string: text, confidence: "Low" });
        }

        let jsonStr;
        try {
            const result = await axios.post(`${ollamaUrl}/api/generate`, {
                model: "llama3.2:1b",
                prompt: prompt,
                format: "json",
                stream: false
            }, { timeout: 15000 });
            
            jsonStr = result.data.response;
        } catch (postErr) {
            console.error("[Ollama HTTP Error] Location Detection Failed:", postErr.message);
            // Graceful fallback
            return res.status(200).json({ found: false, location_string: text, confidence: "Low" });
        }

        // Clean JSON
        if (jsonStr.includes("```")) {
            jsonStr = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || jsonStr;
        }

        res.status(200).json(JSON.parse(jsonStr.trim()));
    } catch (error) {
        console.error("Location Detection Final Error:", error);
        // Graceful fallback
        res.status(200).json({ found: false, location_string: text, confidence: "Low" });
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
                SELECT t.id, t.user_phone, t.issue_type, t.severity, t.image_url, t.status, t.created_at,
                       t.description, t.department, t.ai_summary, t.ai_confidence,
                       ST_Y(t.location::geometry) as lat, ST_X(t.location::geometry) as lng,
                       u.name as user_name
                FROM tickets t
                LEFT JOIN users u ON t.user_id = u.id
                WHERE t.department = $1
                ORDER BY t.created_at DESC;
            `;
            values = [adminDept];
        } else {
            // Superadmin: all tickets
            query = `
                SELECT t.id, t.user_phone, t.issue_type, t.severity, t.image_url, t.status, t.created_at,
                       t.description, t.department, t.ai_summary, t.ai_confidence,
                       ST_Y(t.location::geometry) as lat, ST_X(t.location::geometry) as lng,
                       u.name as user_name
                FROM tickets t
                LEFT JOIN users u ON t.user_id = u.id
                ORDER BY t.created_at DESC;
            `;
            values = [];
        }

        const result = await pgDb.query(query, values);
        // Transform rows to match frontend expected shape
        const reports = result.rows.map(row => {
            const mediaPath = row.image_url || null;
            const fullMediaUrl = mediaPath ? `${req.protocol}://${req.get('host')}${mediaPath}` : null;
            const ext = mediaPath ? mediaPath.split('.').pop().toLowerCase() : '';
            const mediaType = ['mp4', 'webm', 'mov', 'avi'].includes(ext) ? 'video'
                : ['mp3', 'wav', 'ogg', 'm4a'].includes(ext) ? 'audio' : 'image';
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
                userName: row.user_name || 'Anonymous Citizen',
                ai_summary: row.ai_summary || '',
                aiConfidence: row.ai_confidence || 85,
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
            SELECT t.id, t.user_phone, t.issue_type, t.severity, t.image_url, t.status, t.created_at,
                   t.description, t.department, t.ai_summary, t.ai_confidence,
                   ST_Y(t.location::geometry) as lat, ST_X(t.location::geometry) as lng,
                   u.name as user_name
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.user_id = $1
            ORDER BY t.created_at DESC;
        `;
        const result = await pgDb.query(query, [userId]);

        const reports = result.rows.map(row => {
            const mediaPath = row.image_url || null;
            const fullMediaUrl = mediaPath ? `${req.protocol}://${req.get('host')}${mediaPath}` : null;
            const ext = mediaPath ? mediaPath.split('.').pop().toLowerCase() : '';
            const mediaType = ['mp4', 'webm', 'mov', 'avi'].includes(ext) ? 'video'
                : ['mp3', 'wav', 'ogg', 'm4a'].includes(ext) ? 'audio' : 'image';

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
                userName: row.user_name || 'Anonymous Citizen',
                ai_summary: row.ai_summary || '',
                aiConfidence: row.ai_confidence || 85,
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
            SELECT t.id, t.user_phone, t.issue_type, t.severity, t.image_url, t.status, t.created_at,
                   t.description, t.department, t.ai_summary, t.ai_confidence,
                   ST_Y(t.location::geometry) as lat, ST_X(t.location::geometry) as lng,
                   u.name as user_name
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id = $1;
        `;
        const result = await pgDb.query(query, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Report not found" });

        const row = result.rows[0];
        const mediaPath = row.image_url || null;
        const fullMediaUrl = mediaPath ? `${req.protocol}://${req.get('host')}${mediaPath}` : null;
        const ext = mediaPath ? mediaPath.split('.').pop().toLowerCase() : '';
        const mediaType = ['mp4', 'webm', 'mov', 'avi'].includes(ext) ? 'video'
            : ['mp3', 'wav', 'ogg', 'm4a'].includes(ext) ? 'audio' : 'image';
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
            userName: row.user_name || 'Anonymous Citizen',
            ai_summary: row.ai_summary || '',
            aiConfidence: row.ai_confidence || 85,
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
            SELECT t.id, t.user_phone, t.issue_type, t.severity, t.image_url, t.status, t.created_at,
                   t.description, t.department, t.ai_summary, t.ai_confidence,
                   ST_Y(t.location::geometry) as lat, ST_X(t.location::geometry) as lng,
                   u.name as user_name
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.department = $1
            ORDER BY t.created_at DESC;
        `;
        const result = await pgDb.query(query, [department]);
        const reports = result.rows.map(row => {
            const mediaPath = row.image_url || null;
            const fullMediaUrl = mediaPath ? `${req.protocol}://${req.get('host')}${mediaPath}` : null;
            const ext = mediaPath ? mediaPath.split('.').pop().toLowerCase() : '';
            const mediaType = ['mp4', 'webm', 'mov', 'avi'].includes(ext) ? 'video'
                : ['mp3', 'wav', 'ogg', 'm4a'].includes(ext) ? 'audio' : 'image';
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
                userName: row.user_name || 'Anonymous Citizen',
                ai_summary: row.ai_summary || '',
                aiConfidence: row.ai_confidence || 85,
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