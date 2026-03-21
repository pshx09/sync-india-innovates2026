const db = require('./config/db');

const updateAuthTables = async () => {
    try {
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
            ADD COLUMN IF NOT EXISTS address TEXT,
            ADD COLUMN IF NOT EXISTS city VARCHAR(100),
            ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'citizen',
            ADD COLUMN IF NOT EXISTS department VARCHAR(100);
        `);
        console.log("✅ Extended 'users' table columns for Registration flows.");
    } catch (error) {
        console.error("❌ Failed to migrate Auth extension schemas:", error);
    } finally {
        db.pool.end();
    }
};

updateAuthTables();
