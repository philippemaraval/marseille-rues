const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'game_data.db');
const db = new Database(dbPath);

// Initialize database
function initDb() {
    // Users table
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Scores table
    // mode: 'rues-principales', 'quartier', 'ville', 'monuments', 'rues-celebres'
    // game_type: 'classique', 'marathon', 'chrono', 'lecture'
    db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT, -- denormalized for easier querying
      mode TEXT NOT NULL,
      game_type TEXT NOT NULL,
      score REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

    // Daily challenge stats (the target for each day)
    db.exec(`
    CREATE TABLE IF NOT EXISTS daily_targets (
      date TEXT PRIMARY KEY, -- 'YYYY-MM-DD'
      street_name TEXT NOT NULL,
      quartier TEXT,
      coordinates_json TEXT -- JSON string "[lon, lat]" of the target
    )
  `);

    // Daily attempts per user
    db.exec(`
    CREATE TABLE IF NOT EXISTS daily_user_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL, -- 'YYYY-MM-DD'
      attempts_count INTEGER DEFAULT 0,
      best_distance_meters INTEGER,
      success BOOLEAN DEFAULT 0,
      last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, date)
    )
  `);

    console.log('Database initialized successfully.');
}

// User Helpers
function createUser(username, password) {
    const hash = bcrypt.hashSync(password, 10);
    try {
        const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
        const info = stmt.run(username, hash);
        return info.lastInsertRowid;
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            throw new Error('Username already taken');
        }
        throw err;
    }
}

function getUser(username) {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username);
}

function verifyPassword(user, password) {
    return bcrypt.compareSync(password, user.password_hash);
}

// Score Helpers
function addScore(userId, username, mode, gameType, score) {
    const stmt = db.prepare(`
    INSERT INTO scores (user_id, username, mode, game_type, score)
    VALUES (?, ?, ?, ?, ?)
  `);
    return stmt.run(userId, username, mode, gameType, score);
}

function getLeaderboard(mode, gameType, limit = 10) {
    const stmt = db.prepare(`
    SELECT username, max(score) as high_score, count(*) as games_played
    FROM scores
    WHERE mode = ? AND game_type = ?
    GROUP BY user_id
    ORDER BY high_score DESC
    LIMIT ?
  `);
    return stmt.all(mode, gameType, limit);
}

// Daily Challenge Helpers
function getDailyTarget(date) {
    const stmt = db.prepare('SELECT * FROM daily_targets WHERE date = ?');
    return stmt.get(date);
}

function setDailyTarget(date, streetName, quartier, coordinates) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO daily_targets (date, street_name, quartier, coordinates_json)
    VALUES (?, ?, ?, ?)
  `);
    return stmt.run(date, streetName, quartier, JSON.stringify(coordinates));
}

function getDailyUserStatus(userId, date) {
    const stmt = db.prepare('SELECT * FROM daily_user_attempts WHERE user_id = ? AND date = ?');
    return stmt.get(userId, date);
}

function updateDailyUserAttempt(userId, date, distanceMeters, isSuccess) {
    // First ensure record exists
    db.prepare(`
    INSERT OR IGNORE INTO daily_user_attempts (user_id, date, attempts_count, best_distance_meters, success)
    VALUES (?, ?, 0, NULL, 0)
  `).run(userId, date);

    const current = getDailyUserStatus(userId, date);
    const newCount = current.attempts_count + 1;

    // Update best distance (min distance)
    let newBestDist = current.best_distance_meters;
    if (newBestDist === null || distanceMeters < newBestDist) {
        newBestDist = distanceMeters;
    }

    const newSuccess = current.success || (isSuccess ? 1 : 0);

    const stmt = db.prepare(`
    UPDATE daily_user_attempts 
    SET attempts_count = ?, best_distance_meters = ?, success = ?, last_attempt_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND date = ?
  `);
    stmt.run(newCount, newBestDist, newSuccess, userId, date);

    return { attempts: newCount, bestDistance: newBestDist, success: newSuccess };
}

function getDailyLeaderboard(date) {
    // Rank by: Success (desc), Attempts (asc), Best Distance (asc)
    // Only show successful ones? Or all? User requested: "Rank them from the fewer tries to the most tries and then from the fastest to the slowest if tights."
    // Note: We don't track "fastest" time duration yet, only "fewer tries". 
    // We can use "best_distance" as tie breaker if not successful, but if successful distance is 0 or irrelevant?
    // User spec: "Rank them from the fewer tries to the most tries and then from the fastest to the slowest if tights."
    // Wait, "fastest to slowest" implies time taken. 
    // My schematic doesn't track "time taken to find". I only track "last_attempt_at".
    // I will add a simplified ranking: Success first, then fewer attempts.

    const stmt = db.prepare(`
    SELECT u.username, d.attempts_count, d.success
    FROM daily_user_attempts d
    JOIN users u ON d.user_id = u.id
    WHERE d.date = ? AND d.success = 1
    ORDER BY d.attempts_count ASC, d.last_attempt_at ASC
    LIMIT 20
  `);
    return stmt.all(date);
}

module.exports = {
    initDb,
    createUser,
    getUser,
    verifyPassword,
    addScore,
    getLeaderboard,
    getDailyTarget,
    setDailyTarget,
    getDailyUserStatus,
    updateDailyUserAttempt,
    getDailyLeaderboard
};
