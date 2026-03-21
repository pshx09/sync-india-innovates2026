const db = require('./config/db');

async function checkUsers() {
    try {
        const res = await db.query('SELECT id, email, password_hash FROM users');
        console.log("Users in DB:");
        console.table(res.rows);
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        db.pool.end();
    }
}
checkUsers();
