const db = require('./config/db');

const updateAuthTables = async () => {
    try {
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS verification_otp VARCHAR(6),
            ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP;
        `);
        console.log("✅ Extended 'users' table with Verification columns.");
    } catch (error) {
        console.error("❌ Failed to migrate Verification schemas:", error);
    } finally {
        db.pool.end();
    }
};

updateAuthTables();
