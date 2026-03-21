const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Setup PostGIS Extension
const setupDatabase = async () => {
    try {
        const client = await pool.connect();
        await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
        console.log('✅ PostgreSQL Connected & PostGIS Extension Verified');
        client.release();
    } catch (error) {
        console.error('❌ Database Initialization Error:', error);
    }
};

setupDatabase();

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
