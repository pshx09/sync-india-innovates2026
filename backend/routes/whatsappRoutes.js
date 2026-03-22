const express = require('express');
const router = express.Router();
const { handleWebhook, verifyWebhook, receiveWebhook } = require('../controllers/whatsappController');

// Webhook endpoint for Green API
router.post('/webhook', receiveWebhook);

// Legacy Webhook endpoint for WhatsApp (Whapi or Meta Cloud API)
router.post('/legacy-webhook', handleWebhook);

// Verification endpoint for Meta Cloud API
router.get('/webhook', verifyWebhook);

module.exports = router;