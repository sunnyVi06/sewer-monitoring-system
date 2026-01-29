const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');

// POST /api/login - User login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Find user in database
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) return res.status(401).json({ error: 'Invalid credentials' });

    // Return success (in a real app, generate JWT token)
    res.json({ success: true, token: 'dummy_token', role: user.role });
  });
});

// POST /api/register - User registration (for admin use)
router.post('/register', async (req, res) => {
  const { username, password, role } = req.body;

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Insert user
  db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    [username, hashedPassword, role || 'staff'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

module.exports = router;
