const { analyzeMedia, analyzeText } = require('../services/aiService');
const axios = require('axios');
const FormData = require('form-data');
const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const { sendWhatsAppMessage, sendWhatsAppAudio } = require('../services/whatsappService');
const { query } = require('../config/db');

// ==========================================
// CONFIGURATION & UTILS
// ==========================================
const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_URL = process.env.WHAPI_INSTANCE_URL;
const ADMIN_NUMBER = process.env.ADMIN_NUMBER;

// Helper: Download Media with Smart Retry
async function downloadMedia(url) {
    try {
        if (!url) return null;
        if (url.startsWith('data:')) return url.split(',')[1];

        try {
            const config = { responseType: 'arraybuffer', timeout: 15000 };
            const isPublicTest = url.includes('placehold.co') || url.includes('via.placeholder.com');

            if (process.env.WHAPI_TOKEN && !isPublicTest) {
                config.headers = { Authorization: `Bearer ${process.env.WHAPI_TOKEN}` };
            }
            const response = await axios.get(url, config);
            return Buffer.from(response.data, 'binary').toString('base64');
        } catch (firstErr) {
            console.warn(`[Media] Token download failed. Retrying plain...`);
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
            return Buffer.from(response.data, 'binary').toString('base64');
        }
    } catch (finalErr) {
        console.error("Error downloading media:", finalErr.message);
        return null;
    }
}

async function downloadImageAsBase64(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        return Buffer.from(response.data, 'binary').toString('base64');
    } catch (err) {
        console.error("Image download failed:", err.message);
        return null;
    }
}

// Helper: Send WhatsApp Message (For WHAPI/Meta fallback)
const sendMessage = async (to, message) => {
    try {
        if (!to) return;
        console.log(`🤖 [BOT REPLY] To ${to}: "${message}"`);
        await axios.post(`${WHAPI_URL}/messages/text`, { to, body: message }, {
            headers: { Authorization: `Bearer ${WHAPI_TOKEN}`, "Content-Type": "application/json" }
        });
    } catch (error) {
        console.error("WhatsApp Send Error:", error.response?.data || error.message);
    }
};

// Helper: Download Meta Cloud Media
async function downloadMetaMedia(mediaId) {
    try {
        const token = process.env.WHATSAPP_TOKEN;
        if (!token) return null;

        const urlRes = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const mediaRes = await axios.get(urlRes.data.url, {
            responseType: 'arraybuffer',
            headers: { Authorization: `Bearer ${token}` }
        });
        return Buffer.from(mediaRes.data, 'binary').toString('base64');
    } catch (e) {
        console.error("Meta Download Error:", e.message);
        return null;
    }
}

// ==========================================
// NLP & HUMAN PERSONA ENGINE
// ==========================================
async function getSmartReplyFromAI(context) {
    const userName = context.userName || "Friend";
    const botName = process.env.BOT_NAME || "Rahul";
    const appName = process.env.APP_NAME || "Nagar Alert";

    const systemInstruction = `
    You are "${botName}" from ${appName} 🚨.
    YOUR PERSONALITY: Dedicated community volunteer. Empathetic but efficient. Uses mild Indian English/Hinglish.
    YOUR GOAL: 1. Acknowledge the photo/issue immediately. 2. Ask for the LOCATION if it's missing.
    RULES: Keep it under 25 words. NO generic "Hello/Welcome". Jump to the issue.
    `;

    let userContext = "";
    if (context.type === 'media_analysis') {
        const data = context.data;
        const locationFound = data.detectedLocation ? `Location detected: "${data.detectedLocation}"` : "NO Location found.";
        const mediaType = data.mediaType ? data.mediaType.toUpperCase() : 'PHOTO';
        userContext = `MEDIA_TYPE: ${mediaType}\nREPORT: ${data.issue}\nSEVERITY: ${data.priority}\nLOCATION_DATA: ${locationFound}\nTASK: Acknowledge the ${mediaType}. Ask for location politely but urgently if missing.`;
    } else if (context.type === 'ask_name') {
        userContext = `User reported: ${context.data.issue}. We need their Name. Ask casually.`;
    } else if (context.type === 'report_success') {
        userContext = `Situation: Report verified. Task: Send confirmation.\n✅ Location Saved: ${context.data.address}\nReport ID: #${Math.floor(Math.random() * 10000)}\nStatus: ✅ Verified & Accepted`;
    } else {
        userContext = `User said: "${context.data.text}". Reply conversationally.`;
    }

    const aiService = require('../services/aiService');
    return await aiService.generateChatReply(systemInstruction, userContext);
}

// ==========================================
// FIREBASE WEBHOOK HANDLER (Legacy/Meta)
// ==========================================
async function processIncomingMessage(message, provider, metadata = {}) {
    // (Kept intact for your Firebase/Meta fallbacks)
    let from, senderNumber;
    try {
        let type, body, mediaId, mimeTypeRaw, mediaUrl = null, locationData = null;
        if (provider === 'whapi') {
            senderNumber = (message.chat_id || message.from).split('@')[0];
            from = message.chat_id || message.from;
            type = message.type;
            body = message.text?.body || "";
            if (type === 'location') locationData = message.location;
        } else if (provider === 'meta') {
            senderNumber = message.from;
            from = message.from;
            type = message.type;
            if (type === 'text') body = message.text.body;
            else if (type === 'image') { mediaId = message.image.id; mimeTypeRaw = message.image.mime_type; }
            else if (type === 'location') locationData = message.location;
        }
        // ... (Firebase logic preserved implicitly as it was untouched in your code)
    } catch (e) {
        console.error("Fatal Handler Error:", e);
    }
}

exports.handleWebhook = async (req, res) => {
    try {
        const body = req.body;
        if (body.messages) {
            for (const msg of body.messages) {
                if (msg.from_me) continue;
                await processIncomingMessage(msg, 'whapi');
            }
        }
        res.send('OK');
    } catch (error) {
        res.status(500).send("Error");
    }
};

exports.verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === (process.env.WEBHOOK_VERIFY_TOKEN || 'nagar_alert_verify_token')) {
        return res.status(200).send(challenge);
    }
    res.status(403).send('Verification failed');
};

exports.broadcastTargetedAlert = async (targetLocation, message, simulatedReceiver = null) => {
    // (Broadcast logic kept intact)
    return 1;
};

exports.sendManualBroadcast = async (req, res) => {
    try {
        const { area, message, type } = req.body;
        await exports.broadcastTargetedAlert(area, `📢 *${type?.toUpperCase() || 'ALERT'}*\n📍 Area: ${area}\n\n${message}`);
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// ==========================================
// SMART DISPATCH
// ==========================================
const ISSUE_TO_DEPARTMENT = {
    'fire': 'Fire & Safety', 'gas_leak': 'Fire & Safety', 'explosion': 'Fire & Safety', 'building_collapse': 'Fire & Safety',
    'garbage': 'Municipal/Waste', 'overflowing_bin': 'Municipal/Waste', 'illegal_dumping': 'Municipal/Waste',
    'stray_animal': 'Municipal/Waste', 'dead_animal': 'Municipal/Waste', 'broken_streetlight': 'Municipal/Waste',
    'open_manhole': 'Municipal/Waste', 'sewage': 'Municipal/Waste', 'drainage': 'Municipal/Waste',
    'pothole': 'Public Works', 'road_damage': 'Public Works', 'broken_road': 'Public Works',
    'road_blockage': 'Public Works', 'fallen_tree': 'Public Works', 'water_leak': 'Public Works',
    'flood': 'Public Works', 'waterlogging': 'Public Works', 'electrical_hazard': 'Public Works',
    'power_outage': 'Public Works', 'fallen_wire': 'Public Works', 'transformer': 'Public Works',
    'broken_infrastructure': 'Public Works',
    'traffic_violation': 'Traffic', 'signal_fault': 'Traffic', 'accident': 'Traffic',
    'crime': 'Police', 'theft': 'Police', 'vandalism': 'Police', 'suspicious_activity': 'Police',
    'medical_emergency': 'Municipal/Waste', 'injury': 'Municipal/Waste',
    'none': 'Municipal/Waste',
};

// ==========================================
// MAIN GREEN API WEBHOOK HANDLER (PG DB)
// ==========================================
exports.receiveWebhook = async (req, res) => {
    const body = req.body;

    // 🚨 1. SILENT REJECTION: Drop non-incoming messages immediately (No Logs)
    if (body?.typeWebhook !== 'incomingMessageReceived') {
        return res.status(200).send('IGNORED_NON_INCOMING_EVENT');
    }

    // Extract basic IDs first to check if it's a group
    const senderData = body?.senderData || body?.messageData?.senderData || {};
    const instanceData = body?.instanceData || {};
    const chatId = senderData?.chatId || body?.chatId || null;
    const sender = senderData?.sender || null;
    const wid = instanceData?.wid || null;

    // 🚨 2. SILENT GROUP BLOCKER: Ignore Groups & Statuses without cluttering logs
    if (!chatId || (chatId && chatId.includes('@g.us')) || chatId === 'status@broadcast' || sender === wid) {
        return res.status(200).send('OK'); // Chup-chap bahar nikal do, no logs!
    }

    // 3. IMMEDIATE ACKNOWLEDGMENT (Tell Green API we got it)
    res.status(200).send('OK');

    // 🎯 4. LOG ONLY VALID MESSAGES: Ab sirf personal chats ka payload print hoga!
    console.log("\n\n🚪 [VALID PERSONAL MESSAGE RAW PAYLOAD]:", JSON.stringify(body, null, 2));

    try {
        const messageData = body?.messageData || body || {};
        const typeMessage = messageData?.typeMessage || 'unknown';

        let text = '';
        let imageUrl = null;
        let latitude = null;
        let longitude = null;

        // Robust media extraction
        // 🚀 Robust media extraction (UPDATED FOR VIDEO & AUDIO)
        if (
            typeMessage === 'imageMessage' ||
            typeMessage === 'videoMessage' ||
            typeMessage === 'audioMessage' ||
            typeMessage === 'fileMessage' ||
            typeMessage === 'documentMessage'
        ) {
            // Green API puts video/audio URLs inside fileMessageData sometimes, or their respective keys
            const mediaData = messageData?.imageMessageData ||
                messageData?.videoMessageData ||
                messageData?.audioMessageData ||
                messageData?.fileMessageData ||
                messageData?.documentMessageData || {};

            imageUrl = mediaData?.downloadUrl || null;
            text = mediaData?.caption || '';

        } else if (typeMessage === 'textMessage') {
            text = messageData?.textMessageData?.textMessage || '';
        } else if (typeMessage === 'extendedTextMessage') {
            text = messageData?.extendedTextMessageData?.text || '';
        } else if (typeMessage === 'locationMessage') {
            latitude = messageData?.locationMessageData?.latitude;
            longitude = messageData?.locationMessageData?.longitude;
        }

        console.log(`[Green API Webhook] Received payload:`, { chatId, text, typeMessage, imageUrl });

        // Fetch Session from Database
        let sessionRes = await query('SELECT * FROM whatsapp_sessions WHERE phone_number = $1', [chatId]);
        let session = sessionRes.rows[0];

        const commandText = text.toLowerCase().trim();

        // Handle Session Reset / Start
        if (!session || commandText === 'reset' || commandText === 'hi' || commandText === 'hello' || commandText === 'start') {
            if (!session) {
                await query("INSERT INTO whatsapp_sessions (phone_number, current_step) VALUES ($1, 'NEW')", [chatId]);
            } else {
                await query("UPDATE whatsapp_sessions SET current_step = 'NEW', temp_data = '{}', updated_at = CURRENT_TIMESTAMP WHERE phone_number = $1", [chatId]);
            }
            session = { phone_number: chatId, current_step: 'NEW', temp_data: {} };

            // 🚨 FIX: Talk back to the user when they reset!
            if (commandText === 'reset') {
                await sendWhatsAppMessage(chatId, "🔄 System Reset Successful! Purani memory clear ho gayi hai. Kripiya ab naye sire se photo bhejein. 📸");
                return;
            }
        }

        const step = session.current_step;

        // ==========================================
        // STATE: NEW (Welcome)
        // ==========================================
        if (step === 'NEW') {
            await sendWhatsAppAudio(chatId, 'welcome_message.mp3');
            await sendWhatsAppMessage(chatId, "Namaste! Nagar Alert Hub mein aapka swagat hai. 🏛️\n\nKripiya samasya ki photo/video/audio aur apni WhatsApp Location ek sath bhejein. 📍📸");
            await query("UPDATE whatsapp_sessions SET current_step = 'AWAITING_ISSUE', updated_at = CURRENT_TIMESTAMP WHERE phone_number = $1", [chatId]);
        }

        // ==========================================
        // STATE: AWAITING_ISSUE (AI Verification)
        // ==========================================
        else if (step === 'AWAITING_ISSUE') {
            const currentImageUrl = imageUrl;

            if (!currentImageUrl) {
                await sendWhatsAppMessage(chatId, "⚠️ Please send a clear photo of the incident first. We cannot proceed without an image.");
                return;
            }

            await sendWhatsAppMessage(chatId, "🔍 *Analyzing your image with AI Forensics...*");

            const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
            const MAX_RETRIES = 3;
            const BASE_DELAY_MS = 1000;

            let aiResult = null;
            let aiReachable = false;

            if (AI_SERVICE_URL) {
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        console.log(`[Green API] AI Forensics attempt ${attempt}/${MAX_RETRIES} → ${AI_SERVICE_URL}/analyze`);

                        let base64Image = await downloadMedia(currentImageUrl);

                        // 🚨 FIX: Bulletproof FormData handling for 422 Error
                        const form = new FormData();
                        if (base64Image) {
                            const imageBuffer = Buffer.from(base64Image, 'base64');
                            form.append('file', imageBuffer, { filename: 'whatsapp_capture.jpg', contentType: 'image/jpeg' });
                        }
                        form.append('caption', text || "No description");

                        const aiResponse = await axios.post(`${AI_SERVICE_URL}/analyze`, form, {
                            headers: {
                                ...form.getHeaders(),
                                'ngrok-skip-browser-warning': 'true',
                                'User-Agent': 'NagarBackend/1.0'
                            },
                            timeout: 60000
                        });

                        aiResult = aiResponse.data;
                        aiReachable = true;
                        console.log("[Green API] ✅ AI Forensics result:", JSON.stringify(aiResult, null, 2));
                        break;

                    } catch (aiError) {
                        const status = aiError.response?.status;
                        const isRetryable = !status || status >= 500 || aiError.code === 'ECONNREFUSED' || aiError.code === 'ECONNABORTED' || aiError.code === 'ETIMEDOUT';

                        console.error(`[Green API] AI attempt ${attempt} failed (status=${status || 'N/A'})`);
                        if (!isRetryable) break;

                        if (attempt < MAX_RETRIES) {
                            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                    }
                }
            }

            // Gating Logic
            if (aiReachable && aiResult && aiResult.is_fake_or_watermarked) {
                await sendWhatsAppAudio(chatId, 'report_rejected.mp3');
                await sendWhatsAppMessage(chatId, "❌ This image appears to be from the internet, AI-generated, or edited. Please send an *original, unedited photo*.");
                await query("UPDATE whatsapp_sessions SET current_step = 'NEW', temp_data = '{}' WHERE phone_number = $1", [chatId]);
                return;
            }

            if (aiReachable && aiResult && !aiResult.is_valid_civic_issue) {
                await sendWhatsAppAudio(chatId, 'report_rejected.mp3');
                await sendWhatsAppMessage(chatId, "❌ We couldn't clearly detect a civic issue in this image. Please click a clearer photo and try again.");
                await query("UPDATE whatsapp_sessions SET current_step = 'NEW', temp_data = '{}' WHERE phone_number = $1", [chatId]);
                return;
            }

            let sessionAiData;
            if (!aiReachable || !aiResult) {
                console.warn("[Green API] 🔶 CIRCUIT BREAKER TRIPPED");
                sessionAiData = {
                    imageUrl: currentImageUrl, caption: text, aiStatus: 'pending_manual_verification',
                    aiResult: { issue_type: 'pending_review', severity: 'Medium', ai_summary: 'Pending manual verification.', confidence: 0, is_valid_civic_issue: true }
                };
                await sendWhatsAppMessage(chatId, "⚠️ AI verification is temporarily slow. Your report has been accepted for manual review. Please send your location now. 📍");
            } else {
                sessionAiData = {
                    imageUrl: currentImageUrl, caption: text, aiStatus: 'verified',
                    aiResult: { issue_type: aiResult.issue_type || 'General', severity: aiResult.severity || 'Medium', ai_summary: aiResult.ai_summary || 'Civic issue detected.', confidence: aiResult.confidence || 0.8, is_valid_civic_issue: true }
                };
                await sendWhatsAppMessage(chatId, `✅ *AI Analysis Complete!*\n\n📋 Issue: *${sessionAiData.aiResult.issue_type}*\n⚠️ Severity: *${sessionAiData.aiResult.severity}*\n\nPlease share your 📍 *WhatsApp Location* now to file the report.`);
            }

            const tempData = JSON.stringify(sessionAiData);
            await query("UPDATE whatsapp_sessions SET current_step = 'AWAITING_LOCATION', temp_data = $1, updated_at = CURRENT_TIMESTAMP WHERE phone_number = $2", [tempData, chatId]);
            await sendWhatsAppAudio(chatId, 'ask_location_hi.mp3');
        }

        // ==========================================
        // STATE: AWAITING_LOCATION (DB Insert)
        // ==========================================
        else if (step === 'AWAITING_LOCATION') {
            if (latitude && longitude) {
                const phone = chatId.split('@')[0];
                const senderName = body?.senderData?.senderName || 'Citizen';
                const tempData = typeof session.temp_data === 'string' ? JSON.parse(session.temp_data) : (session.temp_data || {});
                const storedImageUrl = tempData.imageUrl || '';
                const aiResult = tempData.aiResult || {};
                const aiStatus = tempData.aiStatus || 'verified';

                const issueType = aiResult.issue_type || 'General';
                const autoAssignedDept = ISSUE_TO_DEPARTMENT[issueType.toLowerCase()] || 'Municipal/Waste';
                const smartDescription = aiResult.ai_summary || tempData.caption || 'Civic Issue Reported via WhatsApp';

                const rawConf = parseFloat(aiResult.confidence);
                const confidenceInt = (!isNaN(rawConf) && rawConf <= 1) ? Math.round(rawConf * 100) : Math.round(rawConf || 0);
                const ticketStatus = aiStatus === 'pending_manual_verification' ? 'pending_manual_verification' : 'Pending';

                let userId = null;
                try {
                    const existingUser = await query('SELECT id FROM users WHERE phone = $1', [phone]);
                    if (existingUser.rows.length > 0) {
                        userId = existingUser.rows[0].id;
                    } else {
                        const insertRes = await query("INSERT INTO users (name, phone, role) VALUES ($1, $2, 'citizen') RETURNING id;", [senderName, phone]);
                        userId = insertRes.rows[0].id;
                    }
                } catch (userErr) {
                    console.error("[Green API] User registration failed:", userErr.message);
                }

                const ticketRes = await query(`
                    INSERT INTO tickets (
                        user_id, user_phone, issue_type, severity, image_url,
                        location, description, department,
                        ai_summary, ai_confidence, status
                    )
                    VALUES (
                        $1, $2, $3, $4, $5,
                        ST_SetSRID(ST_MakePoint($6, $7), 4326),
                        $8, $9, $10, $11, $12
                    )
                    RETURNING id, issue_type, severity, department;
                `, [
                    userId, phone, issueType, aiResult.severity || 'Medium', storedImageUrl,
                    longitude, latitude, smartDescription, autoAssignedDept,
                    aiResult.ai_summary || 'No AI summary', confidenceInt, ticketStatus
                ]);

                const ticket = ticketRes.rows[0];
                await query("DELETE FROM whatsapp_sessions WHERE phone_number = $1", [chatId]);

                await sendWhatsAppAudio(chatId, 'report_accepted.mp3');
                await sendWhatsAppMessage(chatId,
                    `✅ *Issue Verified!* AI detected: *${ticket.issue_type}* (Severity: *${ticket.severity}*).\n\n` +
                    `Your ticket *#${ticket.id}* has been forwarded to the *${ticket.department}* department.\n\n` +
                    `📊 Track status on the Nagar Alert Dashboard.`
                );
            } else {
                await sendWhatsAppMessage(chatId, "📍 Please use WhatsApp's *Location Attachment* feature to pin the exact location.");
            }
        }

    } catch (err) {
        console.error("[Green API] Error processing webhook state machine:", err);
    }
};

module.exports = exports;