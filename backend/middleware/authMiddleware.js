const jwt = require('jsonwebtoken');

// A simple authentication middleware that verifies JWT tokens
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Format is "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_development');
        req.user = decoded;
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid or expired token.' });
    }
};

module.exports = authenticateToken;
