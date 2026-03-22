const { query } = require('../config/db');

async function createTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            phone_number VARCHAR(50) PRIMARY KEY,
            current_step VARCHAR(50) NOT NULL DEFAULT 'NEW',
            temp_data JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await query(sql);
        console.log("✅ Whatsapp Sessions table created successfully.");
    } catch (err) {
        console.error("❌ Error creating table:", err);
    }
    process.exit(0);
}

createTable();
