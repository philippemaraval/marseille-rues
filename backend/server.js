const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'super-secret-key-change-this-in-prod';

// CORS configuration
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://camino-marseille.netlify.app',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, same-origin)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        // In development, allow all origins
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        // In production, reject unknown origins (but don't throw — just deny)
        return callback(null, false);
    },
    credentials: true
}));
app.use(express.json());

// Serve static data files (GeoJSON) - needed for both dev and production
app.use('/data', express.static(path.join(__dirname, 'data')));

// Serve frontend files only in development (in prod, Netlify serves them)
if (process.env.NODE_ENV !== 'production') {
    app.use(express.static(path.join(__dirname, '..')));
}

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
    const { mode, gameType } = req.query;
    if (!mode || !gameType) return res.status(400).json({ error: 'Missing mode or gameType' });

    const rows = db.getLeaderboard(mode, gameType);
    res.json(rows);
});

app.post('/api/scores', authenticateToken, (req, res) => {
    const { mode, gameType, score } = req.body;
    // Basic validation
    if (!mode || !gameType || score === undefined) {
        return res.status(400).json({ error: 'Invalid data' });
    }

    db.addScore(req.user.id, req.user.username, mode, gameType, score);
    res.json({ success: true });
});

// ----------------------
// Daily Challenge Routes
// ----------------------

// Load street data once at startup for daily target selection
const fs = require('fs');
let allStreets = [];
try {
    const geoData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'data', 'marseille_rues_enrichi.geojson'), 'utf8')
    );
    allStreets = geoData.features.filter(f => f.properties && f.properties.name);
    console.log(`Loaded ${allStreets.length} streets for daily challenges.`);
} catch (err) {
    console.error('Could not load streets for daily:', err.message);
}

// Compute centroid of a GeoJSON geometry
function computeCentroid(geometry) {
    let coords = [];
    if (geometry.type === 'LineString') {
        coords = geometry.coordinates;
    } else if (geometry.type === 'MultiLineString') {
        coords = geometry.coordinates.flat();
    } else if (geometry.type === 'Point') {
        return geometry.coordinates; // [lon, lat]
    } else {
        return [5.3698, 43.2965]; // Marseille center fallback
    }
    if (coords.length === 0) return [5.3698, 43.2965];
    const sum = coords.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]);
    return [sum[0] / coords.length, sum[1] / coords.length];
}

// Simple date-based hash for reproducible random selection
function dateHash(dateStr) {
    let h = 0;
    for (let i = 0; i < dateStr.length; i++) {
        h = ((h << 5) - h + dateStr.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function ensureDailyTarget() {
    const date = new Date().toISOString().split('T')[0];
    let target = db.getDailyTarget(date);
    if (!target && allStreets.length > 0) {
        // Pick a street using date-based hash (same every time for a given day)
        const idx = dateHash(date) % allStreets.length;
        const feature = allStreets[idx];
        const name = feature.properties.name;
        const quartier = feature.properties.quartier || null;
        const centroid = computeCentroid(feature.geometry);
        db.setDailyTarget(date, name, quartier, centroid, feature.geometry);
    } else if (!target) {
        // Fallback if no streets loaded
        db.setDailyTarget(date, 'La Canebière', '1er', [5.380, 43.295], null);
    }
    return date;
}

app.get('/api/daily', authenticateToken, (req, res) => {
    const date = ensureDailyTarget();
    const target = db.getDailyTarget(date);
    const status = db.getDailyUserStatus(req.user.id, date);
    const userStatus = status || { attempts_count: 0, success: false, best_distance_meters: null };

    const response = {
        date,
        streetName: target.street_name,
        quartier: target.quartier,
        targetGeoJson: target.coordinates_json, // centroid [lon, lat]
        userStatus
    };

    // Reveal target geometry only when game is over (success or 5 attempts exhausted)
    if (userStatus.success || userStatus.attempts_count >= 5) {
        response.targetGeometry = target.geometry_json || null;
    }

    res.json(response);
});

app.post('/api/daily/guess', authenticateToken, (req, res) => {
    const { date, distanceMeters, isSuccess } = req.body;

    const result = db.updateDailyUserAttempt(req.user.id, date, distanceMeters, isSuccess);

    // If game is now over, also return the target geometry
    if (result.success || result.attempts_count >= 5) {
        const target = db.getDailyTarget(date);
        result.targetGeometry = target ? target.geometry_json : null;
    }

    res.json(result);
});

app.get('/api/daily/leaderboard', (req, res) => {
    const date = new Date().toISOString().split('T')[0];
    const rows = db.getDailyLeaderboard(date);
    res.json(rows);
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
