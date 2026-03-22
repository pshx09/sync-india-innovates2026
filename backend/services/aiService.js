const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

/**
 * Generates a conversational reply based on the persona and context.
 */
exports.generateChatReply = async (systemInstruction, userContext) => {
    try {
        const prompt = `${systemInstruction}\n\nCONTEXT:\n${userContext}`;
        
        const ollamaUrl = process.env.OLLAMA_SERVICE_URL;
        if (!ollamaUrl) {
            console.warn("[WARNING] OLLAMA_SERVICE_URL is missing.");
            return "I received your message. Please share the location.";
        }

        const result = await axios.post(`${ollamaUrl}/api/generate`, {
            model: "llama3.2:1b",
            prompt: prompt,
            stream: false
        }, { timeout: 15000 });

        return result.data.response.trim();
    } catch (error) {
        console.error("Chat Generation Error (Ollama):", error.message);
        return "I received your message. Please share the location.";
    }
};

/**
 * Generic Multimodal Analyzer (Image, Video, Audio) - ENHANCED
 * @param {string} base64Data - Base64 string of the media
 * @param {string} mimeType - Mime type (image/jpeg, video/mp4, audio/ogg, etc.)
 */
exports.analyzeMedia = async (base64Data, mimeType) => {
    try {
        console.log(`[Local AI] Analyzing media (${mimeType}) with enhanced detection...`);
        const buffer = Buffer.from(base64Data, "base64");
        
        const formData = new FormData();
        formData.append("file", buffer, { filename: "upload.media", contentType: mimeType });
        
        const aiUrl = process.env.AI_SERVICE_URL;
        if (!aiUrl) {
            console.warn("[WARNING] AI_SERVICE_URL missing.");
            return { isReal: true, issue: "Pending", description: "AI service down", priority: "Medium", category: "General", confidence: 50 };
        }

        let parsed;
        try {
            const aiResponse = await axios.post(`${aiUrl}/analyze`, formData, {
                headers: formData.getHeaders(),
                timeout: 60000
            });
            const result = aiResponse.data;
            
            parsed = {
                isReal: result.is_valid_civic_issue,
                fakeReason: result.error || (result.is_valid_civic_issue ? null : "Verification failed"),
                issue: result.issue_type || "General Issue",
                explanation: result.ai_summary || "Processed by local AI",
                description: result.ai_summary || "",
                severity: result.severity || "Medium",
                priority: result.severity || "Medium",
                category: result.issue_type || "General",
                confidence: result.confidence ? result.confidence * 100 : 80,
                eventType: result.issue_type || 'General Civic Issue',
                department: result.department || 'Municipal',
                aiSource: 'local-fastapi'
            };
        } catch (postErr) {
            console.error("[AI Server Error] Local AI server down:", postErr.message);
            parsed = {
                isReal: true,
                fakeReason: null,
                issue: "General Issue",
                explanation: "Accepted automatically (AI down)",
                description: "Pending analysis",
                severity: "Medium",
                priority: "Medium",
                category: "General",
                confidence: 50,
                eventType: 'General Civic Issue',
                department: 'Municipal',
                aiSource: 'fallback'
            };
        }
        return parsed;

    } catch (error) {
        console.error("Local Media Analysis Failed:", error.message);
        return { isReal: false, fakeReason: "AI Service Error" };
    }
};

/**
 * Text Analyzer for WhatsApp Messages
 * @param {string} text - The user's text message
 */
exports.analyzeText = async (text) => {
    try {
        console.log(`[Local AI] Analyzing text via Ollama: "${text.substring(0, 50)}..."`);

        const prompt = `
        You are a city administration AI. Analyze this text complaint.
        Text: "${text}"

        1. Is this a valid civic complaint (e.g. "garbage on street", "no water")?
        2. Or is it just a greeting/spam (e.g. "Hi", "Hello", "How are you")?

        Output JSON ONLY:
        {
            "isReal": boolean, 
            "fakeReason": "Reason if rejected/spam, else null", 
            "issue": "Short title",
            "description": "Cleaned up description",
            "priority": "High/Medium/Low",
            "confidence": number,
            "category": "Road/Garbage/Water/Electricity/Noise/Traffic/Other"
        }`;

        const ollamaUrl = process.env.OLLAMA_SERVICE_URL;
        if (!ollamaUrl) {
            console.warn("[WARNING] OLLAMA_SERVICE_URL is missing.");
            return { isReal: true, issue: "General", description: text, category: "General", priority: "Medium", confidence: 50 };
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
            console.error("[Ollama HTTP Error] Text Analysis Failed:", postErr.message);
            return { isReal: true, issue: "General", description: text, category: "General", priority: "Medium", confidence: 50 };
        }

        if (jsonStr.includes("```")) {
            jsonStr = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] || jsonStr;
        }

        const jsonResult = JSON.parse(jsonStr.trim());
        const mapped = mapEventAndDepartment({
            category: jsonResult.category || 'General',
            description: jsonResult.description || ''
        });

        return {
            isReal: jsonResult.isReal,
            fakeReason: jsonResult.fakeReason || null,
            issue: jsonResult.issue || jsonResult.category || "General Issue",
            explanation: jsonResult.description || jsonResult.issue,
            description: jsonResult.description,
            severity: jsonResult.priority || "Medium",
            priority: jsonResult.priority || "Medium",
            category: jsonResult.category || "General",
            confidence: jsonResult.confidence || 80,
            eventType: mapped.eventType,
            department: mapped.department,
            aiSource: 'ollama'
        };

    } catch (error) {
        console.error("Ollama Text Analysis Failed:", error.message);
        return { isReal: true, issue: "General", description: text, category: "General", priority: "Medium", confidence: 50 };
    }
};

// Wrapper for backward compatibility
exports.analyzeImageForReport = async (base64Image) => {
    return exports.analyzeMedia(base64Image, 'image/jpeg');
};



// ================= EVENT CLASSIFICATION LAYER =================

function mapEventAndDepartment({ category, description }) {
    const text = `${category} ${description}`.toLowerCase();

    if (/robbery|theft|crime|attack|fight|weapon|gun/.test(text)) {
        return { eventType: 'Safety Alert', department: 'Police' };
    }

    if (/traffic|jam|accident|signal|rush/.test(text)) {
        return { eventType: 'Traffic Rush', department: 'Traffic' };
    }

    if (/road|pothole|closure|construction/.test(text)) {
        return { eventType: 'Road Closure', department: 'Municipal' };
    }

    if (/power|electricity|transformer|outage/.test(text)) {
        return { eventType: 'Power Outage', department: 'Electricity' };
    }

    if (/water|pipeline|sewage|leak/.test(text)) {
        return { eventType: 'Water Issue', department: 'Municipal' };
    }

    return { eventType: 'General Civic Issue', department: 'General' };
}