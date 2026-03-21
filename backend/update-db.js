const db = require('./config/db');

const updateDb = async () => {
    try {
        console.log("Adding description and department columns to tickets table...");
        await db.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS description TEXT`);
        await db.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS department VARCHAR(100)`);
        console.log("✅ Database schema updated successfully.");
    } catch (error) {
        console.error("❌ Failed to update database schema:", error);
    } finally {
        db.pool.end();
    }
};

updateDb();
