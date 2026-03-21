const db = require('./config/db');

async function listUsers() {
    try {
        const result = await db.query('SELECT id, email, is_verified, name FROM users');
        console.log("--- Total Users in Database ---");
        console.table(result.rows);
        console.log("-------------------------------");
    } catch (err) {
        console.error("Error listing users:", err);
    } finally {
        db.pool.end();
    }
}

listUsers();
