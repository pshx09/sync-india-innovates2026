const fs = require('fs');
const path = require('path');
const db = require('./config/db');

const runInit = async () => {
    try {
        console.log("Reading init.sql...");
        const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
        
        console.log("Executing SQL statements to initialize database...");
        await db.query(sql);
        
        console.log("✅ Database initialized successfully: tables and indexes created.");
    } catch (error) {
        console.error("❌ Failed to initialize database:", error);
    } finally {
        // Close the pool so the script exits
        db.pool.end();
    }
};

runInit();
