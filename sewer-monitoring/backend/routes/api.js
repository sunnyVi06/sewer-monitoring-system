const express = require('express');
const router = express.Router();
const db = require('../database');
const { calculateHealthScore } = require('../utils/healthScore');

// POST /api/data - Receive sensor data from ESP8266
router.post('/data', (req, res) => {
  const { node_id, mq135, mq7, mq4, water_level, temperature, humidity } = req.body;

  // Calculate health score
  const healthScore = calculateHealthScore({ mq135, mq7, mq4, water_level });

  // Store in database
  const stmt = db.prepare(`
    INSERT INTO readings (node_id, mq135, mq7, mq4, water_level, temperature, humidity, health_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(node_id, mq135, mq7, mq4, water_level, temperature, humidity, healthScore, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }

    // Update node last_seen
    db.run('UPDATE nodes SET last_seen = datetime("now") WHERE node_id = ?', node_id);

    // Generate alerts if thresholds exceeded
    generateAlerts(node_id, { mq135, mq7, mq4, water_level, healthScore });

    res.json({ success: true, healthScore });
  });
  stmt.finalize();
});

// GET /api/dashboard - Get dashboard data
router.get('/dashboard', (req, res) => {
  const queries = {
    latest: 'SELECT * FROM readings ORDER BY created_at DESC LIMIT 1',
    readings24h: 'SELECT * FROM readings WHERE created_at > datetime("now", "-24 hours") ORDER BY created_at',
    alerts: 'SELECT * FROM alerts WHERE acknowledged = 0 ORDER BY created_at DESC LIMIT 10',
    nodes: 'SELECT * FROM nodes'
  };

  db.all(queries.latest, (err, latest) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(queries.readings24h, (err, readings24h) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(queries.alerts, (err, alerts) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all(queries.nodes, (err, nodes) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({
            latest: latest[0],
            history: readings24h,
            alerts,
            nodes,
            updatedAt: new Date().toISOString()
          });
        });
      });
    });
  });
});

// POST /api/alerts/:id/acknowledge - Acknowledge alert
router.post('/alerts/:id/acknowledge', (req, res) => {
  db.run('UPDATE alerts SET acknowledged = 1 WHERE id = ?', req.params.id, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// GET /api/export - Export data as CSV
router.get('/export', (req, res) => {
  db.all('SELECT * FROM readings ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const csv = rows.map(r =>
      `${r.id},${r.node_id},${r.mq135},${r.mq7},${r.mq4},${r.water_level},${r.temperature},${r.humidity},${r.health_score},${r.created_at}`
    ).join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('sewer_data.csv');
    res.send(csv);
  });
});

module.exports = router;
