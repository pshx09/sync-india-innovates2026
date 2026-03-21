const db = require('./config/db');

async function migrate() {
    try {
        await db.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_summary TEXT`);
        await db.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_confidence INTEGER`);
        console.log("Migration done");
    } catch(e) {
        console.error(e);
    } finally {
        db.pool.end();
    }
}
migrate();
