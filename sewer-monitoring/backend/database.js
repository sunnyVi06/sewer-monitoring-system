const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sewer.db');
const db = new sqlite3.Database(dbPath);

// Create tables
db.serialize(() => {
  // Sensor readings table
  db.run(`CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT,
    mq135 REAL,
    mq7 REAL,
    mq4 REAL,
    water_level REAL,
    temperature REAL,
    humidity REAL,
    health_score INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Alerts table
  db.run(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT,
    type TEXT,
    message TEXT,
    severity TEXT,
    acknowledged BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Nodes table
  db.run(`CREATE TABLE IF NOT EXISTS nodes (
    node_id TEXT PRIMARY KEY,
    location TEXT,
    installed_date TEXT,
    status TEXT DEFAULT 'active',
    last_seen DATETIME
  )`);

  // Users table (for simple authentication)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'staff'
  )`);
});

module.exports = db;
