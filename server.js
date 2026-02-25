const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'super-secret-key-change-this-in-prod'; // simplistic for prototype

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.'))); // serve static frontend files

// Initialize DB
db.initDb();

// Middleware to verify JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// ----------------------
// Auth Routes
// ----------------------

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    try {
        const userId = db.createUser(username, password);
        const token = jwt.sign({ id: userId, username }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ token, username });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.getUser(username);

    if (!user || !db.verifyPassword(user, password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '7d' });
    res.json({ token, username: user.username });
});

// ----------------------
// Score / Leaderboard Routes
// ----------------------

app.get('/api/leaderboard', (req, res) => {
    const mode = req.query.mode || req.query.zone_mode;
    const gameType = req.query.gameType || req.query.game_mode;
    if (!mode || !gameType) return res.status(400).json({ error: 'Missing mode or gameType' });

    const rows = db.getLeaderboard(mode, gameType);
    res.json(rows);
});

app.get('/api/leaderboards', (req, res) => {
    const data = db.getAllLeaderboards();
    res.json(data);
});

app.post('/api/scores', authenticateToken, (req, res) => {
    const { mode, gameType, score, itemsCorrect, itemsTotal, timeSec } = req.body;
    if (!mode || !gameType || score === undefined) {
        return res.status(400).json({ error: 'Invalid data' });
    }

    db.addScore(req.user.id, req.user.username, mode, gameType, score, itemsCorrect, itemsTotal, timeSec);
    res.json({ success: true });
});

// ----------------------
// Daily Challenge Routes
// ----------------------

// Helper to seed daily challenge if missing (simplified for prototype)
function ensureDailyTarget() {
    const date = new Date().toISOString().split('T')[0];
    let target = db.getDailyTarget(date);
    if (!target) {
        // Pick a random street from a hardcoded list or load from file? 
        // Since this is a prototype, I'll hardcode one or pick randomly if I had access to the data here.
        // Ideally we'd read 'marseille_rues_enrichi.geojson' but that's heavy.
        // Let's seed a dummy one for today, or valid one if we can.
        // For now, I'll seed "La Canebière" as a fallback or user can rely on external script to seed.
        // IMPROVEMENT: Read a small subset of streets on boot?
        // Let's just seed a fixed valid one for testing: 'la canebière'.

        // In production, a cron job should pick a random street every day from the full dataset.
        // Here we will just set a hardcoded one for demonstration purposes if none exists.
        db.setDailyTarget(date, 'la canebière', '1er', [5.380, 43.295]);
    }
    return date;
}

app.get('/api/daily', authenticateToken, (req, res) => {
    const date = ensureDailyTarget();
    const target = db.getDailyTarget(date);
    const status = db.getDailyUserStatus(req.user.id, date);

    // We DO NOT return coordinates to the client to avoid cheating!
    // Unless we want the client to calculate distance. 
    // Plan said: "Client-side calculation is easier for map interactions, server validates attempt count."
    // So we MUST return coordinates or feature geometry so the map can check distance.
    // BUT: if we send coordinates, user can inspect network.
    // "Cheating" is acceptable for this level of game.

    res.json({
        date,
        streetName: target.street_name,
        quartier: target.quartier,
        targetGeoJson: target.coordinates_json, // [lon, lat]
        userStatus: status || { attempts_count: 0, success: false, best_distance_meters: null }
    });
});

app.post('/api/daily/guess', authenticateToken, (req, res) => {
    const { date, distanceMeters, isSuccess } = req.body;
    // TODO: Verify date matches today? 
    // For now trust client.

    const result = db.updateDailyUserAttempt(req.user.id, date, distanceMeters, isSuccess);
    res.json(result);
});

app.get('/api/daily/leaderboard', (req, res) => {
    const date = new Date().toISOString().split('T')[0]; // simple ISO date
    const rows = db.getDailyLeaderboard(date);
    res.json(rows);
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
