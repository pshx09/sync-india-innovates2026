const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authenticateToken = require('../middleware/authMiddleware');

/**
 * GET /api/users/leaderboard
 * Public: Returns top contributors ranked by ticket count × 10 points
 */
router.get('/leaderboard', async (req, res) => {
    try {
        const leaderboardQuery = `
            SELECT 
                u.id,
                u.name,
                u.first_name,
                u.last_name,
                u.last_name,
                COUNT(t.id)::int AS ticket_count,
                (COUNT(t.id) * 10)::int AS points
            FROM users u
            LEFT JOIN tickets t ON t.user_id = u.id
            WHERE u.role = 'citizen'
            GROUP BY u.id, u.name, u.first_name, u.last_name
            ORDER BY points DESC
            LIMIT 50;
        `;
        const result = await db.query(leaderboardQuery);

        const leaderboard = result.rows.map((row, index) => ({
            id: row.id,
            name: row.name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Anonymous Citizen',
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(row.first_name || 'U')}+${encodeURIComponent(row.last_name || '')}&background=3b82f6&color=fff`,
            points: row.points,
            ticketCount: row.ticket_count,
            level: Math.floor(row.points / 100) + 1,
            rank: index + 1
        }));

        res.status(200).json({ leaderboard });
    } catch (error) {
        console.error('[Users] Leaderboard Error:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
    }
});

/**
 * GET /api/users/me/stats
 * Authenticated: Returns current user's profile + aggregate ticket stats + global rank
 */
router.get('/me/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Fetch user profile
        const profileResult = await db.query(
            `SELECT id, email, name, first_name as "firstName", last_name as "lastName", 
                    phone, address, city, role, points 
             FROM users WHERE id = $1`,
            [userId]
        );

        if (profileResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = profileResult.rows[0];

        // 2. Aggregate ticket stats for this user
        const statsResult = await db.query(
            `SELECT 
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE LOWER(status) IN ('pending', 'open', 'pending address'))::int AS pending,
                COUNT(*) FILTER (WHERE LOWER(status) IN ('in_progress', 'in progress', 'accepted'))::int AS in_progress,
                COUNT(*) FILTER (WHERE LOWER(status) IN ('resolved'))::int AS resolved
             FROM tickets WHERE user_id = $1`,
            [userId]
        );
        const stats = statsResult.rows[0];
        const totalPoints = stats.total * 10;

        // 3. Calculate global rank
        const rankResult = await db.query(
            `SELECT COUNT(DISTINCT u.id)::int + 1 AS rank
             FROM users u
             LEFT JOIN tickets t ON t.user_id = u.id
             WHERE u.role = 'citizen'
             GROUP BY u.id
             HAVING COUNT(t.id) > $1`,
            [stats.total]
        );
        const globalRank = rankResult.rows.length > 0 ? rankResult.rows.length + 1 : 1;

        res.status(200).json({
            user,
            stats: {
                total: stats.total,
                pending: stats.pending,
                inProgress: stats.in_progress,
                resolved: stats.resolved
            },
            points: totalPoints,
            rank: globalRank
        });
    } catch (error) {
        console.error('[Users] My Stats Error:', error);
        res.status(500).json({ error: 'Failed to fetch user stats', details: error.message });
    }
});

module.exports = router;
