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
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      mode TEXT NOT NULL,
      game_type TEXT NOT NULL,
      score REAL NOT NULL,
      items_correct INTEGER DEFAULT 0,
      items_total INTEGER DEFAULT 0,
      time_sec REAL DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Migration: add new columns if missing
  const migrateCols = [
    ['items_correct', 'INTEGER DEFAULT 0'],
    ['items_total', 'INTEGER DEFAULT 0'],
    ['time_sec', 'REAL DEFAULT 0']
  ];
  for (const [col, def] of migrateCols) {
    try { db.exec(`ALTER TABLE scores ADD COLUMN ${col} ${def}`); } catch (e) { }
  }

  // Daily challenge stats (the target for each day)
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_targets (
      date TEXT PRIMARY KEY, -- 'YYYY-MM-DD'
      street_name TEXT NOT NULL,
      quartier TEXT,
      coordinates_json TEXT, -- JSON string "[lon, lat]" centroid
      geometry_json TEXT     -- Full GeoJSON geometry for target highlighting
    )
  `);

  // Migration: add geometry_json if missing
  try {
    db.exec(`ALTER TABLE daily_targets ADD COLUMN geometry_json TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

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
function addScore(userId, username, mode, gameType, score, itemsCorrect, itemsTotal, timeSec) {
  const stmt = db.prepare(`
    INSERT INTO scores (user_id, username, mode, game_type, score, items_correct, items_total, time_sec)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(userId, username, mode, gameType, score, itemsCorrect || 0, itemsTotal || 0, timeSec || 0);
}

function getLeaderboard(mode, gameType, limit = 10) {
  // Return best score per user for this mode+gameType combination
  const stmt = db.prepare(`
    SELECT username,
           MAX(score) as high_score,
           items_correct,
           items_total,
           time_sec,
           COUNT(*) as games_played
    FROM scores
    WHERE mode = ? AND game_type = ?
    GROUP BY user_id
    ORDER BY high_score DESC
    LIMIT ?
  `);
  return stmt.all(mode, gameType, limit);
}

function getAllLeaderboards(limit = 5) {
  // Get all distinct mode+game_type combos that have scores
  const combos = db.prepare(`
    SELECT DISTINCT mode, game_type FROM scores ORDER BY mode, game_type
  `).all();

  const result = {};
  for (const { mode, game_type } of combos) {
    const key = `${mode}|${game_type}`;
    result[key] = getLeaderboard(mode, game_type, limit);
  }
  return result;
}

// Daily Challenge Helpers
function getDailyTarget(date) {
  const stmt = db.prepare('SELECT * FROM daily_targets WHERE date = ?');
  return stmt.get(date);
}

function setDailyTarget(date, streetName, quartier, coordinates, geometry) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO daily_targets (date, street_name, quartier, coordinates_json, geometry_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(date, streetName, quartier, JSON.stringify(coordinates), geometry ? JSON.stringify(geometry) : null);
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

  return { attempts_count: newCount, best_distance_meters: newBestDist, success: newSuccess };
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
  getAllLeaderboards,
  getDailyTarget,
  setDailyTarget,
  getDailyUserStatus,
  updateDailyUserAttempt,
  getDailyLeaderboard
};
