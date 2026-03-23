const express = require('express');
require('dotenv').config(); // Load env vars immediately
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const authRoutes = require('./routes/authRoutes');
const { db } = require('./config/firebase');
const path = require('path');

// Note: WhatsApp Controller logic is now handled in 'routes/whatsappRoutes.js'
// and AI Logic is handled in 'services/aiService.js'

const app = express();
const PORT = process.env.PORT || 5001;
const WHAPI_TOKEN = process.env.WHAPI_TOKEN;

// Firebase and Google Cloud initialization logic has been cleaned up for PostgreSQL/Local AI

// Middleware
// Hackathon-Safe CORS (Allows Vercel and Localhost to connect)
app.use(cors({
    origin: '*', // Stars means "Allow Everyone" (Vercel, Localhost, etc.)
    credentials: false // When using '*', credentials must be false
}));
app.use(express.json({ limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// The Magic Fix for Render (Absolute Paths)
app.use('/public', express.static(path.join(__dirname, 'public')));

// 1. Universal Logger
app.use((req, res, next) => {
    console.log(`\n🔔 Incoming Request!`);
    console.log(`   Path: ${req.path}`);
    console.log(`   Method: ${req.method}`);
    next();
});

// Serve uploaded ticket media files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
// Phase 2 PostgreSQL active middleware
app.use('/api/auth', authRoutes);
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));
// app.use('/api/alerts', require('./routes/alertRoutes'));
app.use('/api/routes', require('./routes/routeRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// 2. Health Check
app.get('/', (req, res) => {
    res.status(200).send('Nagar Alert is Active! 🚀');
});

// --- NEW: IMAGE PROXY (Fixes Broken Images) ---
app.get('/api/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('No URL provided');

    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            headers: {
                'Authorization': `Bearer ${WHAPI_TOKEN}` // Send token just in case
            }
        });

        if (response.headers['content-type']) {
            res.set('Content-Type', response.headers['content-type']);
        }

        response.data.pipe(res);
    } catch (error) {
        console.error("❌ Proxy Error:", error.message);
        res.redirect('https://placehold.co/600x400?text=Image+Unavailable');
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(`[SERVER ERROR] ${req.method} ${req.url}:`, err);
    res.status(500).json({
        error: "Internal Server Error",
        message: err.message
    });
});

// Start Server
const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server running on port ${PORT} with Local AI routing enabled.`);
});

// Keep-Alive & Error Handling to prevent silent exits
setInterval(() => { }, 1 << 30); // Keep event loop active

process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED REJECTION:', reason);
});
