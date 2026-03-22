const axios = require('axios');

/**
 * Send a WhatsApp text message using Green API
 * @param {string} chatId - The phone number + @c.us suffix (e.g., 1234567890@c.us)
 * @param {string} text - The message to send
 */
const sendWhatsAppMessage = async (chatId, text) => {
    try {
        const idInstance = process.env.GREEN_API_ID_INSTANCE;
        const apiToken = process.env.GREEN_API_TOKEN;

        if (!idInstance || !apiToken) {
            console.error('[WhatsApp Service] Green API credentials missing in .env');
            return;
        }

        const url = `https://7107.api.greenapi.com/waInstance${idInstance}/sendMessage/${apiToken}`;
        const payload = {
            chatId: chatId,
            message: text
        };

        const response = await axios.post(url, payload);
        console.log(`[WhatsApp Service] Message sent successfully to ${chatId}:`, response.data);
        return response.data;
    } catch (error) {
        console.error('[WhatsApp Service] Error sending message:', error.response?.data || error.message);
        throw error;
    }
};

module.exports = {
    sendWhatsAppMessage
};
