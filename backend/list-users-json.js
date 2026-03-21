const db = require('./config/db');

async function listUsers() {
    try {
        const result = await db.query('SELECT id, email, is_verified, name FROM users');
        console.log("JSON_OUTPUT_START");
        console.log(JSON.stringify(result.rows, null, 2));
        console.log("JSON_OUTPUT_END");
    } catch (err) {
        console.error("Error listing users:", err);
    } finally {
        db.pool.end();
    }
}

listUsers();
