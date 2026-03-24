const { analyzeMedia, analyzeText } = require('../services/aiService');
const axios = require('axios');
const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

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

        // Strategy 1: With Token (Whapi Standard)
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

            // Strategy 2: Without Token (Pre-signed URLs)
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
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000
        });
        return Buffer.from(response.data, 'binary').toString('base64');
    } catch (err) {
        console.error("Image download failed:", err.message);
        return null;
    }
}

// Helper: Send WhatsApp Message
const sendMessage = async (to, message) => {
    try {
        if (!to) return;
        console.log(`🤖 [BOT REPLY] To ${to}: "${message}"`); // Log the reply for debugging
        await axios.post(`${WHAPI_URL}/messages/text`, {
            to,
            body: message
        }, {
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

/**
 * Asks the AI to generate a reply based on the context.
 * @param {Object} context - { type: 'media_analysis'|'text_reply', data: object, userName: string }
 */
// ==========================================
// NEW: NLP & HUMAN PERSONA ENGINE
// ==========================================

async function getSmartReplyFromAI(context) {
    const userName = context.userName || "Friend";

    // 1. Define the Persona (Dynamic)
    const botName = process.env.BOT_NAME || "Rahul";
    const appName = process.env.APP_NAME || "Nagar Alert";

    const systemInstruction = `
    You are "${botName}" from ${appName} 🚨.
    
    YOUR PERSONALITY:
    - Dedicated community volunteer.
    - Empathetic but efficient.
    - Uses mild Indian English/Hinglish (e.g., "Ji", "Don't worry").
    
    YOUR GOAL:
    1. Acknowledge the photo/issue immediately.
    2. Ask for the LOCATION if it's missing.
    
    RULES:
    - Keep it under 25 words.
    - NO generic "Hello/Welcome". Jump to the issue.
    - Example 1: "Pothole detected! looks dangerous. Where is this exactly?"
    - Example 2: "Garbage pile noted. Please share the location so we can clean it."
    `;

    // 2. Format Data for the AI
    let userContext = "";

    if (context.type === 'media_analysis') {
        const data = context.data;
        const locationFound = data.detectedLocation ? `Location detected: "${data.detectedLocation}"` : "NO Location found.";
        const mediaType = data.mediaType ? data.mediaType.toUpperCase() : 'PHOTO'; // Default to PHOTO

        userContext = `
        MEDIA_TYPE: ${mediaType}
        REPORT: ${data.issue} (${data.description})
        SEVERITY: ${data.priority}
        LOCATION_DATA: ${locationFound}
        
        TASK:
        - Acknowledge the ${mediaType}.
        - If Location is found: Confirm it ("Is this at [Location]?").
        - If Location is MISSING: Ask for it politely but urgently ("Please share the location").
        `;
    }
    else if (context.type === 'ask_name') {
        userContext = `User reported: ${context.data.issue}. We need their Name. Ask casually.`;
    }
    else if (context.type === 'report_success') {
        userContext = `
            Situation: Report verified for ${context.data.issue} at ${context.data.address}.
            Task: Send a formal but friendly confirmation. 
            Format exactly like this (fill in details):
            
            ✅ Location Saved: ${context.data.address}
            
            Report ID: #${Math.floor(Math.random() * 10000)}
            Status: ✅ Verified & Accepted
            
            (We have alerted the authorities)
            `;
    }
    else {
        // General Chat
        userContext = `User said: "${context.data.text}". Reply conversationally.`;
    }

    // 3. Generate Reply
    const aiService = require('../services/aiService');
    return await aiService.generateChatReply(systemInstruction, userContext);
}


// ==========================================
// MAIN WEBHOOK HANDLER
// ==========================================

async function processIncomingMessage(message, provider, metadata = {}) {
    let from, senderNumber;

    try {
        let type, body, mediaId, mimeTypeRaw, mediaUrl = null, locationData = null;

        // 1. Parse Provider Data
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
            else if (type === 'video') { mediaId = message.video.id; mimeTypeRaw = message.video.mime_type; }
            else if (type === 'audio') { mediaId = message.audio.id; mimeTypeRaw = message.audio.mime_type; }
            else if (type === 'location') locationData = message.location;
        }

        console.log(`[MSG] From: ${senderNumber} | Type: ${type}`);

        // 2. Get User Profile
        const waUserRef = db.ref(`users/whatsapp_profiles/${senderNumber}`);
        const waUserSnap = await waUserRef.once('value');
        let waUserProfile = waUserSnap.val() || {};

        // 3. Check Pending Reports
        let pendingReport = null;
        const userReportsSnap = await db.ref('reports').orderByChild('userPhone').equalTo(senderNumber).once('value');

        if (userReportsSnap.exists()) {
            const reports = Object.values(userReportsSnap.val());
            reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const latest = reports[0];

            if (['Draft_Waiting_Name', 'Draft_Waiting_Location', 'Pending Address'].includes(latest.status)
                && (new Date() - new Date(latest.createdAt) < 2 * 60 * 60 * 1000)) {
                pendingReport = latest;
            }
        }

        // ==========================================
        // SCENARIO A: TEXT MESSAGES
        // ==========================================
        if (type === 'text') {
            const text = body.trim();

            // A1. Handle Pending "Wait for Name"
            if (pendingReport && pendingReport.status === 'Draft_Waiting_Name') {
                await db.ref(`reports/${pendingReport.id}`).update({
                    userName: text,
                    status: 'Draft_Waiting_Location'
                });
                await waUserRef.update({ name: text, phone: senderNumber });

                // Re-fetch analysis to give context to AI
                const rSnap = await db.ref(`reports/${pendingReport.id}`).once('value');
                const analysis = rSnap.val().aiAnalysis ? JSON.parse(rSnap.val().aiAnalysis) : { issue: "Issue" };

                // GENERATE AI REPLY (Name provided, asking for Location)
                const aiReply = await getSmartReplyFromAI({
                    type: 'media_analysis', // Re-trigger the media analysis prompt but now we know the name
                    data: analysis,
                    userName: text
                });

                await sendMessage(from, aiReply);
                return;
            }

            // A2. Handle Pending "Wait for Location"
            if (pendingReport && (pendingReport.status === 'Draft_Waiting_Location' || pendingReport.status === 'Pending Address')) {
                const finalStatus = pendingReport.aiConfidence > 80 ? 'Verified' : 'Pending';

                const updates = {
                    'location/address': text,
                    status: finalStatus,
                    userName: waUserProfile.name || pendingReport.userName
                };

                await db.ref(`reports/${pendingReport.id}`).update(updates);
                await db.ref(`reports/by_department/${(pendingReport.department || 'General').replace(/[\/\.#\$\[\]]/g, "_")}/${pendingReport.id}`).update(updates);

                if (!waUserProfile.defaultAddress) await waUserRef.update({ defaultAddress: text });

                // GENERATE AI REPLY (Success)
                const successMsg = await getSmartReplyFromAI({
                    type: 'report_success',
                    data: { issue: pendingReport.type, address: text },
                    userName: waUserProfile.name
                });

                await sendMessage(from, successMsg);

                if (finalStatus === 'Verified') {
                    exports.broadcastTargetedAlert(text, `🚨 *New Alert: ${pendingReport.type}*\n📍 ${text}`);
                }
                return;
            }

            // A3. General Chat (AI GENERATED)
            // Instead of hardcoded "Hi/Hello", we send the user's text to the AI
            await sendMessage(from, "🤖..."); // Optional: Typing indicator

            const chatReply = await getSmartReplyFromAI({
                type: 'chat',
                data: { text: text },
                userName: waUserProfile.name
            });

            await sendMessage(from, chatReply);
            return;
        }

        // ==========================================
        // SCENARIO B: LOCATION MESSAGES
        // ==========================================
        if (type === 'location' && locationData) {
            // Handle Pending "Wait for Location"
            if (pendingReport && (pendingReport.status === 'Draft_Waiting_Location' || pendingReport.status === 'Pending Address')) {
                const lat = locationData.latitude;
                const long = locationData.longitude;
                // Whapi gives 'address', Meta might not, so we fallback
                const address = locationData.address || locationData.name || `${lat}, ${long}`;

                const finalStatus = pendingReport.aiConfidence >= 70 ? 'Verified' : 'Pending';
                console.log(`[Status Calc] Confidence: ${pendingReport.aiConfidence}, Final Status: ${finalStatus}`);

                const updates = {
                    'location/latitude': lat,
                    'location/longitude': long,
                    'location/address': address,
                    status: finalStatus,
                    userName: waUserProfile.name || pendingReport.userName
                };

                await db.ref(`reports/${pendingReport.id}`).update(updates);
                await db.ref(`reports/by_department/${(pendingReport.department || 'General').replace(/[\/\.#\$\[\]]/g, "_")}/${pendingReport.id}`).update(updates);

                if (!waUserProfile.defaultAddress) await waUserRef.update({ defaultAddress: address });

                // GENERATE AI REPLY (Success)
                const successMsg = await getSmartReplyFromAI({
                    type: 'report_success',
                    data: { issue: pendingReport.type, address: address },
                    userName: waUserProfile.name
                });

                await sendMessage(from, successMsg);

                if (finalStatus === 'Verified') {
                    exports.broadcastTargetedAlert(
                        address,
                        `🚨 *New Alert: ${pendingReport.type}*\n📍 ${address}`,
                        from // Pass current user to receive the simulated broadcast
                    );
                }
                return;
            } else {
                await sendMessage(from, "📍 Location received. Please send a photo of the issue first to start a report.");
                return;
            }
        }

        // ==========================================
        // SCENARIO C: MEDIA MESSAGES (NEW REPORT)
        // ==========================================
        if (['image', 'video', 'audio', 'voice'].includes(type)) {

            if (pendingReport) {
                await sendMessage(from, `⚠️ You have a pending report. Please finish that first.`);
                return;
            }

            await sendMessage(from, "🤖 *Analyzing Media...*");

            // 1. Download Media
            let mediaBase64 = null;
            if (provider === 'meta' && mediaId) mediaBase64 = await downloadMetaMedia(mediaId);
            else if (provider === 'whapi') {
                const link = (message.video?.link || message.video?.url) || (message.image?.link || message.image?.url) || (message.audio?.link || message.voice?.link);
                mediaUrl = link;
                mediaBase64 = await downloadMedia(link);
            }

            // 2. AI Analysis (Vision)
            let aiResult = { isReal: false };
            let mimeType = 'image/jpeg'; // Default

            if (mediaBase64) {
                const mimeMap = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/ogg', voice: 'audio/ogg' };
                mimeType = mimeTypeRaw || mimeMap[type] || 'application/octet-stream';
                aiResult = await analyzeMedia(mediaBase64, mimeType);
            } else {
                aiResult = { isReal: true, issue: "Report (Media Pending)", description: "Processing...", category: "General", priority: "Medium", confidence: 100 };
            }

            if (!aiResult.isReal) {
                await sendMessage(from, `❌ AI could not verify this issue. Please send a clear photo.`);
                return;
            }

            const reportId = uuidv4();

            // 3. Upload to Firebase Storage (Avoid saving Base64 in DB)
            let publicMediaUrl = mediaUrl || "Pending";
            if (mediaBase64) {
                try {
                    const { uploadBase64Media } = require('../services/storageService');
                    publicMediaUrl = await uploadBase64Media(mediaBase64, mimeType, reportId);
                    console.log(`[Storage] Uploaded media to: ${publicMediaUrl}`);
                } catch (uploadErr) {
                    console.error("[Storage] Upload failed, falling back to basic URL:", uploadErr);
                }
            }

            // 4. Save to DB
            await db.ref(`reports/${reportId}`).set({
                id: reportId,
                type: aiResult.issue,
                description: aiResult.description,
                category: aiResult.category,
                priority: aiResult.priority,
                imageUrl: publicMediaUrl, // Using Storage URL
                mediaType: type, // Store type (video, audio, etc)
                status: waUserProfile.name ? 'Draft_Waiting_Location' : 'Draft_Waiting_Name',
                aiConfidence: aiResult.confidence,
                aiAnalysis: JSON.stringify(aiResult),
                createdAt: new Date().toISOString(),
                userPhone: senderNumber,
                userName: waUserProfile.name || null
            });

            // 5. GENERATE AI REPLY
            // If we don't know the name, ask for name
            if (!waUserProfile.name) {
                const namePrompt = await getSmartReplyFromAI({
                    type: 'ask_name',
                    data: { issue: aiResult.issue },
                    userName: null
                });
                await sendMessage(from, namePrompt);
            } else {
                // If we know name, generate full analysis response
                const analysisReply = await getSmartReplyFromAI({
                    type: 'media_analysis',
                    data: { ...aiResult, mediaType: type },
                    userName: waUserProfile.name
                });
                await sendMessage(from, analysisReply);
            }
        }

    } catch (e) {
        console.error("Fatal Handler Error:", e);
        if (from) await sendMessage(from, "⚠️ System Error.");
    }
}

// ==========================================
// EXPORTS
// ==========================================

exports.handleWebhook = async (req, res) => {
    try {
        const body = req.body;
        if (body.messages) {
            for (const msg of body.messages) {
                if (msg.from_me) continue;
                await processIncomingMessage(msg, 'whapi');
            }
        } else if (body.object === 'whatsapp_business_account' && body.entry) {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value?.messages) {
                        for (const msg of change.value.messages) {
                            await processIncomingMessage(msg, 'meta', change.value.metadata);
                        }
                    }
                }
            }
        }
        res.send('OK');
    } catch (error) {
        console.error("Webhook Error:", error);
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

exports.sendManualBroadcast = async (req, res) => {
    try {
        const { area, message, type } = req.body;
        await exports.broadcastTargetedAlert(area, `📢 *${type?.toUpperCase() || 'ALERT'}*\n📍 Area: ${area}\n\n${message}`);
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.broadcastTargetedAlert = async (targetLocation, message, simulatedReceiver = null) => {
    console.log(`[Broadcast System] 📡 Searching for users in area: ${targetLocation}`);

    try {
        const usersToNotify = new Set();
        const emailsToNotify = new Set();

        if (simulatedReceiver) {
            if (simulatedReceiver.includes('@')) usersToNotify.add(simulatedReceiver.split('@')[0]);
            else usersToNotify.add(simulatedReceiver);
        }

        // 1. Fetch WhatsApp registered users
        const waProfilesSnap = await db.ref('users/whatsapp_profiles').once('value');
        if (waProfilesSnap.exists()) {
            const profiles = waProfilesSnap.val();
            Object.values(profiles).forEach(user => {
                const userLoc = (user.defaultAddress || "").toLowerCase();
                const target = targetLocation.toLowerCase();
                if (userLoc.includes(target) || target.includes(userLoc)) {
                    usersToNotify.add(user.phone);
                    if (user.email) emailsToNotify.add(user.email);
                }
            });
        }

        // 2. Fetch Registry users (broadcast_list & registry)
        const registrySnap = await db.ref('users/registry').once('value');
        if (registrySnap.exists()) {
            const list = registrySnap.val();
            Object.values(list).forEach(user => {
                const userLoc = (user.address || "").toLowerCase();
                const target = targetLocation.toLowerCase();
                if (userLoc.includes(target) || target.includes(userLoc)) {
                    if (user.mobile) usersToNotify.add(user.mobile.replace(/\D/g, ''));
                    if (user.email) emailsToNotify.add(user.email);
                }
            });
        }

        console.log(`[Broadcast System] Found ${usersToNotify.size} WhatsApp targets and ${emailsToNotify.size} Email targets in/near ${targetLocation}`);

        // 3. Send WhatsApp Messages
        for (const phone of usersToNotify) {
            const target = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
            await sendMessage(target, message);
        }

        // 4. Send Email Alerts
        if (emailsToNotify.size > 0) {
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            const emailHtml = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #d9534f 0%, #c9302c 100%); padding: 30px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 24px;">🚨 OFFICIAL CIVIC ALERT</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Nagar Alert Hub | Emergency Broadcast</p>
                    </div>
                    <div style="padding: 30px; background: #ffffff; color: #333333; line-height: 1.6;">
                        <p style="font-size: 18px; margin-top: 0;"><strong>Active Incident in ${targetLocation}</strong></p>
                        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
                        <div style="background: #fff5f5; border-left: 4px solid #d9534f; padding: 20px; border-radius: 4px; margin-bottom: 25px;">
                            <p style="margin: 0; white-space: pre-wrap;">${message.replace(/📢|🚨|📍|⚠️|✅/g, '')}</p>
                        </div>
                        <p style="font-size: 14px; color: #666;">This alert was sent automatically based on your registered location. Please stay safe and follow official instructions.</p>
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="https://nagaralert.vercel.app" style="background: #333; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Live Dashboard</a>
                        </div>
                    </div>
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eeeeee;">
                        &copy; 2026 Nagar Alert Ranchi Hackathon Team SYNC. All rights reserved.
                    </div>
                </div>
            `;

            for (const email of emailsToNotify) {
                try {
                    await transporter.sendMail({
                        from: '"Nagar Alert Hub" <hacksindiaranchi@gmail.com>',
                        to: email,
                        subject: `🚨 CIVIC ALERT: ${targetLocation}`,
                        html: emailHtml
                    });
                    console.log(`[Broadcast System] 📧 Email sent to: ${email}`);
                } catch (emailErr) {
                    console.error(`[Broadcast System] Email failure for ${email}:`, emailErr.message);
                }
            }
        }

        // 5. Save to Dashboard History (broadcasts node)
        try {
            await db.ref('broadcasts').push({
                area: targetLocation,
                type: 'Automated Multi-Channel Alert',
                message: message,
                sender: 'System Bot',
                reach: usersToNotify.size + emailsToNotify.size,
                status: 'Sent',
                timestamp: new Date().toISOString()
            });
        } catch (dbErr) {
            console.error("[Broadcast System] History Save Failed:", dbErr.message);
        }

        return usersToNotify.size + emailsToNotify.size;
    } catch (e) {
        console.error("[Broadcast System] Fatal Error:", e.message);
        return 0;
    }
};

const { sendWhatsAppMessage, sendWhatsAppAudio } = require('../services/whatsappService');
const { query } = require('../config/db');

// ==========================================
// SMART DISPATCH: issue_type → Department
// Shared constant matching ticketController.js
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

exports.receiveWebhook = async (req, res) => {
    // 1. IMMEDIATE ACKNOWLEDGMENT (Prevent retry loops)
    res.status(200).send('OK');

    try {
        const body = req.body;

        // Extract citizen phone
        const chatId = body?.senderData?.chatId;

        // Ignore message if sender is self (prevent infinite loops)
        if (body?.senderData?.sender === body?.instanceData?.wid || !chatId) {
            return;
        }

        const typeMessage = body?.messageData?.typeMessage;
        let text = '';
        let imageUrl = null;
        let latitude = null;
        let longitude = null;

        if (typeMessage === 'imageMessage') {
            imageUrl = body?.messageData?.fileMessageData?.downloadUrl;
            text = body?.messageData?.fileMessageData?.caption || '';
        } else if (typeMessage === 'textMessage') {
            text = body?.messageData?.textMessageData?.textMessage || '';
        } else if (typeMessage === 'extendedTextMessage') {
            text = body?.messageData?.extendedTextMessageData?.text || '';
        } else if (typeMessage === 'locationMessage') {
            latitude = body?.messageData?.locationMessageData?.latitude;
            longitude = body?.messageData?.locationMessageData?.longitude;
        }

        console.log(`[Green API Webhook] Received payload:`, { chatId, text, typeMessage });

        // 2. Fetch Session from Database
        let sessionRes = await query('SELECT * FROM whatsapp_sessions WHERE phone_number = $1', [chatId]);
        let session = sessionRes.rows[0];

        // Ensure session exists or handle reset words
        const commandText = text.toLowerCase().trim();
        if (!session || commandText === 'reset' || commandText === 'hi' || commandText === 'hello' || commandText === 'start') {
            if (!session) {
                await query("INSERT INTO whatsapp_sessions (phone_number, current_step) VALUES ($1, 'NEW')", [chatId]);
            } else {
                await query("UPDATE whatsapp_sessions SET current_step = 'NEW', temp_data = '{}', updated_at = CURRENT_TIMESTAMP WHERE phone_number = $1", [chatId]);
            }
            session = { phone_number: chatId, current_step: 'NEW', temp_data: {} };

            // If they explicitly typed reset, optionally handle, otherwise flow directly to NEW
            if (commandText === 'reset') {
                return;
            }
        }

        const step = session.current_step;

        // 3. State Machine Routing
        if (step === 'NEW') {
            // Step 1: Play welcome message & request photo
            await sendWhatsAppAudio(chatId, 'welcome_message.mp3');
            await sendWhatsAppMessage(chatId, "Namaste! Nagar Alert Hub mein aapka swagat hai. 🏛️\n\nKripiya samasya ki photo/video/audio aur apni WhatsApp Location ek sath bhejein. 📍📸");
            await query("UPDATE whatsapp_sessions SET current_step = 'AWAITING_ISSUE', updated_at = CURRENT_TIMESTAMP WHERE phone_number = $1", [chatId]);
        }
        // ==========================================
        // AWAITING_ISSUE: AI Analysis with Retry + Gating
        // ==========================================
        else if (step === 'AWAITING_ISSUE') {
            const currentImageUrl = req.body.messageData?.fileMessageData?.downloadUrl || imageUrl;

            if (!currentImageUrl) {
                console.error('[Green API] Image URL not found in payload');
                await sendWhatsAppMessage(chatId, "⚠️ Please send a clear photo of the incident first. We cannot proceed without an image.");
                return;
            }

            await sendWhatsAppMessage(chatId, "🔍 *Analyzing your image with AI Forensics...*");

            // ====== AI SERVICE CALL WITH RETRY + EXPONENTIAL BACKOFF ======
            const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
            const MAX_RETRIES = 3;
            const BASE_DELAY_MS = 1000; // 1s → 2s → 4s

            let aiResult = null;
            let aiReachable = false;

            if (!AI_SERVICE_URL) {
                console.warn("[Green API] ⚠️ AI_SERVICE_URL is not set. Skipping AI verification.");
            } else {
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        console.log(`[Green API] AI Forensics attempt ${attempt}/${MAX_RETRIES} → ${AI_SERVICE_URL}/analyze`);

                        // 🔥 Convert image → base64
                        let base64Image = null;

                        try {
                            base64Image = await downloadImageAsBase64(currentImageUrl);
                        } catch (err) {
                            console.error("Base64 conversion failed:", err.message);
                        }

                        // 🔥 Send correct payload to AI
                        const aiResponse = await require('axios').post(`${AI_SERVICE_URL}/analyze`, {
                            image_base64: base64Image,
                            caption: text || "No description"
                        }, {
                            headers: {
                                'ngrok-skip-browser-warning': 'true',
                                'User-Agent': 'NagarBackend/1.0',
                                'Content-Type': 'application/json'
                            },
                            timeout: 60000
                        });

                        aiResult = aiResponse.data;
                        aiReachable = true;
                        console.log("[Green API] ✅ AI Forensics result:", JSON.stringify(aiResult, null, 2));
                        break; // Success — exit retry loop

                    } catch (aiError) {
                        const status = aiError.response?.status;
                        const isRetryable = !status || status >= 500 || aiError.code === 'ECONNREFUSED' || aiError.code === 'ECONNABORTED' || aiError.code === 'ETIMEDOUT';

                        console.error("[Green API] AI ERROR FULL:", aiError.response?.data || aiError.message);

                        console.error(`[Green API] AI attempt ${attempt} failed (status=${status || 'N/A'}, retryable=${isRetryable})`);
                        if (!isRetryable) {
                            console.error("[Green API] Non-retryable AI error. Skipping further attempts.");
                            break;
                        }

                        if (attempt < MAX_RETRIES) {
                            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                            console.log(`[Green API] Retrying in ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                    }
                }
            }

            // ====== STRICT AI GATING ======

            // Gate 1: AI reachable — check for fake/watermarked media
            if (aiReachable && aiResult && aiResult.is_fake_or_watermarked) {
                console.log("[Green API] ❌ REJECTED — AI detected fake/watermarked media.");
                await sendWhatsAppAudio(chatId, 'report_rejected.mp3');
                await sendWhatsAppMessage(chatId, "❌ This image appears to be from the internet, AI-generated, or edited. Please send an *original, unedited photo* taken by you.");
                await query("UPDATE whatsapp_sessions SET current_step = 'NEW', temp_data = '{}', updated_at = CURRENT_TIMESTAMP WHERE phone_number = $1", [chatId]);
                return;
            }

            // Gate 2: AI reachable — check for valid civic issue
            if (aiReachable && aiResult && !aiResult.is_valid_civic_issue) {
                console.log("[Green API] ❌ REJECTED — AI did not detect a valid civic issue.");
                await sendWhatsAppAudio(chatId, 'report_rejected.mp3');
                await sendWhatsAppMessage(chatId, "❌ We couldn't clearly detect a civic issue in this image. Please click a clearer photo of the problem and try again.");
                await query("UPDATE whatsapp_sessions SET current_step = 'NEW', temp_data = '{}', updated_at = CURRENT_TIMESTAMP WHERE phone_number = $1", [chatId]);
                return;
            }

            // Gate 3: Circuit Breaker — AI unreachable after all retries
            let sessionAiData;
            if (!aiReachable || !aiResult) {
                console.warn("[Green API] 🔶 CIRCUIT BREAKER TRIPPED — AI Service unreachable. Accepting for manual review.");
                sessionAiData = {
                    imageUrl: currentImageUrl,
                    caption: text,
                    aiStatus: 'pending_manual_verification',
                    aiResult: {
                        issue_type: 'pending_review',
                        severity: 'Medium',
                        ai_summary: 'AI Service was unreachable. Pending manual verification.',
                        confidence: 0,
                        is_valid_civic_issue: true // Allow through for manual review
                    }
                };
                await sendWhatsAppMessage(chatId, "⚠️ AI verification is temporarily slow. Your report has been accepted for manual review. Please send your location now. 📍");
            } else {
                // AI succeeded and passed all gates — store full result
                console.log(`[Green API] ✅ AI VERIFIED — Issue: ${aiResult.issue_type}, Severity: ${aiResult.severity}`);
                sessionAiData = {
                    imageUrl: currentImageUrl,
                    caption: text,
                    aiStatus: 'verified',
                    aiResult: {
                        issue_type: aiResult.issue_type || 'General',
                        severity: aiResult.severity || 'Medium',
                        ai_summary: aiResult.ai_summary || 'Civic issue detected by AI.',
                        confidence: aiResult.confidence || 0.8,
                        is_valid_civic_issue: true
                    }
                };
                await sendWhatsAppMessage(chatId, `✅ *AI Analysis Complete!*\n\n📋 Issue: *${aiResult.issue_type || 'Civic Issue'}*\n⚠️ Severity: *${aiResult.severity || 'Medium'}*\n\nPlease share your 📍 *WhatsApp Location* now to file the report.`);
            }

            // Persist full AI data in session for the AWAITING_LOCATION step
            const tempData = JSON.stringify(sessionAiData);
            await query("UPDATE whatsapp_sessions SET current_step = 'AWAITING_LOCATION', temp_data = $1, updated_at = CURRENT_TIMESTAMP WHERE phone_number = $2", [tempData, chatId]);

            await sendWhatsAppAudio(chatId, 'ask_location_hi.mp3');
        }
        // ==========================================
        // AWAITING_LOCATION: DB Insert + Smart Dispatch
        // ==========================================
        else if (step === 'AWAITING_LOCATION') {
            if (latitude && longitude) {
                const phone = chatId.split('@')[0];
                const senderName = body?.senderData?.senderName || 'Citizen';
                const tempData = typeof session.temp_data === 'string' ? JSON.parse(session.temp_data) : (session.temp_data || {});
                const storedImageUrl = tempData.imageUrl || '';
                const aiResult = tempData.aiResult || {};
                const aiStatus = tempData.aiStatus || 'verified';

                // ====== Smart Dispatch: AI issue_type → Department ======
                const issueType = aiResult.issue_type || 'General';
                const autoAssignedDept = ISSUE_TO_DEPARTMENT[issueType.toLowerCase()] || 'Municipal/Waste';
                console.log(`[Green API] Smart Dispatch: issue_type="${issueType}" → department="${autoAssignedDept}"`);

                // AI description (use AI summary, fallback to caption/generic)
                const smartDescription = aiResult.ai_summary || tempData.caption || 'Civic Issue Reported via WhatsApp';

                // Convert AI float confidence (0.0–1.0) to integer percentage (0–100)
                const rawConf = parseFloat(aiResult.confidence);
                const confidenceInt = (!isNaN(rawConf) && rawConf <= 1) ? Math.round(rawConf * 100) : Math.round(rawConf || 0);

                // Determine final ticket status
                const ticketStatus = aiStatus === 'pending_manual_verification' ? 'pending_manual_verification' : 'Pending';

                // ====== Auto-Register / Lookup User ======
                let userId = null; // Default NULL — safe for FK constraint
                try {
                    const existingUser = await query('SELECT id FROM users WHERE phone = $1', [phone]);
                    if (existingUser.rows.length > 0) {
                        userId = existingUser.rows[0].id;
                    } else {
                        const insertRes = await query(
                            "INSERT INTO users (name, phone, role) VALUES ($1, $2, 'citizen') RETURNING id;",
                            [senderName, phone]
                        );
                        userId = insertRes.rows[0].id;
                    }
                } catch (userErr) {
                    console.error("[Green API] User registration failed, proceeding with user_id=NULL:", userErr.message);
                    // userId remains null — ticket will still be created with user_phone
                }

                // ====== Complete DB INSERT (matches ticketController schema) ======
                // CRITICAL: ST_MakePoint takes (longitude, latitude) — NOT (lat, lng)
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
                    userId,                          // $1  user_id (UUID or NULL)
                    phone,                           // $2  user_phone
                    issueType,                       // $3  issue_type
                    aiResult.severity || 'Medium',   // $4  severity
                    storedImageUrl,                   // $5  image_url
                    longitude,                        // $6  ST_MakePoint(lng, lat) — lng FIRST
                    latitude,                         // $7  ST_MakePoint(lng, lat) — lat SECOND
                    smartDescription,                 // $8  description
                    autoAssignedDept,                 // $9  department
                    aiResult.ai_summary || 'No AI summary', // $10 ai_summary
                    confidenceInt,                    // $11 ai_confidence (integer 0-100)
                    ticketStatus                      // $12 status
                ]);

                const ticket = ticketRes.rows[0];
                const ticketId = ticket.id;

                console.log(`[Green API] ✅ Ticket #${ticketId} created | type=${ticket.issue_type} | severity=${ticket.severity} | dept=${ticket.department} | status=${ticketStatus}`);

                // ====== Cleanup Session ======
                await query("DELETE FROM whatsapp_sessions WHERE phone_number = $1", [chatId]);

                // ====== Dynamic Success Feedback ======
                await sendWhatsAppAudio(chatId, 'report_accepted.mp3');
                await sendWhatsAppMessage(chatId,
                    `✅ *Issue Verified!* AI detected: *${ticket.issue_type}* (Severity: *${ticket.severity}*).\n\n` +
                    `Your ticket *#${ticketId}* has been forwarded to the *${ticket.department}* department.\n\n` +
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