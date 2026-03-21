// TEMPORARILY DISABLED: Phase 2 Migration to PostgreSQL
// const admin = require('firebase-admin');
// const db = admin.database(); // Realtime Database
// const auth = admin.auth();

module.exports = { 
    admin: {}, 
    db: { ref: () => ({ once: () => ({ exists: () => false }), push: () => ({ key: 'mock' }), update: () => {} }) }, 
    auth: {} 
};