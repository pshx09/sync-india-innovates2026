const db = require('./config/db');

const updateAuthTables = async () => {
    try {
        console.log("Migrating DPI Authentication schema...");

        // 1. Create users table
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255),
                email VARCHAR(255) UNIQUE,
                password_hash VARCHAR(255),
                google_id VARCHAR(255),
                digilocker_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ 'users' table created or already exists.");

        // 2. Add user_id to tickets table
        await db.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);`);
        console.log("✅ 'user_id' foreign key added to tickets.");

    } catch (error) {
        console.error("❌ Failed to migrate Auth Auth schemas:", error);
    } finally {
        db.pool.end();
    }
};

updateAuthTables();
