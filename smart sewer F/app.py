import csv
import io
import sqlite3
from datetime import datetime, timedelta
from flask import (
    Flask, request, jsonify, render_template, session,
    send_file, Response
)
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS

# -------------------
# CONFIG
# -------------------
APP_SECRET = "change_this_secret_to_a_random_string"
ADMIN_USERNAME = "admin"
# default admin password = "admin123" (change immediately in production)
ADMIN_PASSWORD_HASH = generate_password_hash("admin123")

# thresholds used for auto-alert generation (tune as needed)
THRESHOLDS = {
    "mq4_warn": 500,
    "mq4_danger": 2000,
    "mq7_warn": 30,
    "mq7_danger": 100,
    "mq135_warn": 5,
    "mq135_danger": 20,
    "water_level_warn": 70,   # as percentage (if you send percent)
    "water_level_danger": 90
}

# -------------------
# FLASK APP (serve static at root so your file paths don't change)
# -------------------
app = Flask(
    __name__,
    static_folder="static",
    static_url_path=""
)
app.secret_key = APP_SECRET
CORS(app, supports_credentials=True)

# -------------------
# DATABASE HELPERS
# -------------------
DBFILE = "sewer.db"


def get_conn():
    conn = sqlite3.connect(DBFILE, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    # data table: store raw sensor data
    cur.execute("""
    CREATE TABLE IF NOT EXISTS data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT,
        mq4 REAL DEFAULT 0,
        mq7 REAL DEFAULT 0,
        mq135 REAL DEFAULT 0,
        water_level REAL DEFAULT 0,
        health_score INTEGER DEFAULT 100,
        created_at TEXT
    )
    """)

    # alerts table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT,
        type TEXT,
        message TEXT,
        severity TEXT,
        acknowledged INTEGER DEFAULT 0,
        created_at TEXT
    )
    """)

    conn.commit()
    conn.close()


init_db()

# -------------------
# UTILS
# -------------------
def row_to_dict(r):
    return {k: r[k] for k in r.keys()}


def now_iso():
    return datetime.utcnow().isoformat()


def generate_alerts_from_payload(payload):
    """
    Given sensor payload dict, returns a list of alert dicts to insert (may be empty)
    """
    alerts = []
    node = payload.get("node_id", "NODE_UNKNOWN")
    mq4 = float(payload.get("mq4", 0) or 0)
    mq7 = float(payload.get("mq7", 0) or 0)
    mq135 = float(payload.get("mq135", 0) or 0)
    water = float(payload.get("water_level", 0) or 0)
    score = int(payload.get("health_score", 100) or 100)

    # CH4 (mq4)
    if mq4 >= THRESHOLDS["mq4_danger"]:
        alerts.append({"node_id": node, "type": "CH4", "message": f"CH4 dangerous: {mq4}", "severity": "danger"})
    elif mq4 >= THRESHOLDS["mq4_warn"]:
        alerts.append({"node_id": node, "type": "CH4", "message": f"CH4 high: {mq4}", "severity": "warning"})

    # CO (mq7)
    if mq7 >= THRESHOLDS["mq7_danger"]:
        alerts.append({"node_id": node, "type": "CO", "message": f"CO dangerous: {mq7}", "severity": "danger"})
    elif mq7 >= THRESHOLDS["mq7_warn"]:
        alerts.append({"node_id": node, "type": "CO", "message": f"CO high: {mq7}", "severity": "warning"})

    # H2S / air quality (mq135)
    if mq135 >= THRESHOLDS["mq135_danger"]:
        alerts.append({"node_id": node, "type": "H2S", "message": f"H2S dangerous: {mq135}", "severity": "danger"})
    elif mq135 >= THRESHOLDS["mq135_warn"]:
        alerts.append({"node_id": node, "type": "H2S", "message": f"H2S high: {mq135}", "severity": "warning"})

    # water level (assumes water_level is percent; if you send distance, tune accordingly)
    try:
        wl = float(water)
        if wl >= THRESHOLDS["water_level_danger"]:
            alerts.append({"node_id": node, "type": "Water", "message": f"Water level critical: {wl}%", "severity": "danger"})
        elif wl >= THRESHOLDS["water_level_warn"]:
            alerts.append({"node_id": node, "type": "Water", "message": f"Water level high: {wl}%", "severity": "warning"})
    except Exception:
        pass

    # Health score based alerts
    if score < 50:
        alerts.append({"node_id": node, "type": "Safety", "message": f"Safety score low: {score}", "severity": "danger"})
    elif score < 70:
        alerts.append({"node_id": node, "type": "Safety", "message": f"Safety score warning: {score}", "severity": "warning"})

    return alerts


def insert_alerts(alerts_list):
    if not alerts_list:
        return
    conn = get_conn()
    cur = conn.cursor()
    for a in alerts_list:
        cur.execute("""
            INSERT INTO alerts (node_id, type, message, severity, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (a["node_id"], a["type"], a["message"], a["severity"], now_iso()))
    conn.commit()
    conn.close()


def get_nodes():
    """
    Return list of nodes with node_id, location (null), last_seen, status
    status: 'active' if last_seen within 5 minutes else 'offline'
    """
    conn = get_conn()
    cur = conn.cursor()
    rows = cur.execute("""
        SELECT node_id, MAX(created_at) as last_seen
        FROM data
        GROUP BY node_id
    """).fetchall()
    nodes = []
    now = datetime.utcnow()
    for r in rows:
        last_seen = r["last_seen"]
        try:
            last_dt = datetime.fromisoformat(last_seen)
        except Exception:
            last_dt = None
        status = "offline"
        if last_dt:
            if now - last_dt <= timedelta(minutes=5):
                status = "active"
        nodes.append({
            "node_id": r["node_id"],
            "location": None,
            "last_seen": last_seen,
            "status": status
        })
    conn.close()
    return nodes


# -------------------
# ROUTES
# -------------------

# serve dashboard page
@app.route("/")
def index():
    # render templates/index.html (your dashboard)
    return render_template("index.html")


# ESP8266 (or any node) posts sensor data here
@app.route("/data", methods=["POST"])
def receive_data():
    """
    Expects JSON. Accepts keys:
      node_id, mq4, mq7, mq135, water_level, health_score
    Older ESP code may send mq7, mq135, water_level, safety_score -> handled too.
    """
    payload = request.get_json(force=True)
    if not payload:
        return jsonify({"error": "no json"}), 400

    node_id = payload.get("node_id", payload.get("NODE_ID", "NODE_1"))
    # Accept different key names (safety_score -> health_score)
    health_score = payload.get("health_score", payload.get("safety_score", payload.get("safety_score".lower(), 100)))
    try:
        health_score = int(health_score)
    except Exception:
        health_score = 100

    mq4 = payload.get("mq4", 0)
    mq7 = payload.get("mq7", payload.get("co", 0))
    mq135 = payload.get("mq135", payload.get("h2s", 0))
    water_level = payload.get("water_level", payload.get("water", 0))

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO data (node_id, mq4, mq7, mq135, water_level, health_score, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (node_id, mq4, mq7, mq135, water_level, health_score, now_iso()))
    conn.commit()
    conn.close()

    # generate alerts
    alerts = generate_alerts_from_payload({
        "node_id": node_id,
        "mq4": mq4,
        "mq7": mq7,
        "mq135": mq135,
        "water_level": water_level,
        "health_score": health_score
    })
    insert_alerts(alerts)

    print("RECEIVED:", payload)
    return jsonify({"status": "ok"})


# Dashboard API used by your frontend script.js
@app.route("/api/dashboard", methods=["GET"])
def api_dashboard():
    conn = get_conn()
    cur = conn.cursor()

    # latest single row (most recent)
    latest_row = cur.execute("SELECT * FROM data ORDER BY created_at DESC LIMIT 1").fetchone()
    latest = row_to_dict(latest_row) if latest_row else None

    # history (last N rows, newest first)
    hist_rows = cur.execute("SELECT * FROM data ORDER BY created_at DESC LIMIT 200").fetchall()
    history = []
    for r in hist_rows:
        history.append({
            "id": r["id"],
            "node_id": r["node_id"],
            "created_at": r["created_at"],
            "health_score": r["health_score"],
            "mq4": r["mq4"],
            "mq7": r["mq7"],
            "mq135": r["mq135"],
            "water_level": r["water_level"]
        })

    # recent alerts (unacknowledged first)
    alert_rows = cur.execute("SELECT * FROM alerts ORDER BY acknowledged ASC, created_at DESC LIMIT 50").fetchall()
    alerts = []
    for a in alert_rows:
        alerts.append({
            "id": a["id"],
            "node_id": a["node_id"],
            "type": a["type"],
            "message": a["message"],
            "severity": a["severity"],
            "acknowledged": bool(a["acknowledged"]),
            "created_at": a["created_at"]
        })

    # nodes
    nodes = get_nodes()

    conn.close()

    return jsonify({
        "latest": latest,
        "history": history,   # newest-first
        "alerts": alerts,
        "nodes": nodes,
        "updatedAt": datetime.utcnow().isoformat()
    })


# acknowledge alert (requires login)
@app.route("/api/alerts/<int:alert_id>/acknowledge", methods=["POST"])
def api_acknowledge(alert_id):
    if not session.get("logged_in"):
        return jsonify({"error": "unauthorized"}), 401
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE alerts SET acknowledged = 1 WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


# CSV export (requires login)
@app.route("/api/export", methods=["GET"])
def api_export():
    if not session.get("logged_in"):
        return jsonify({"error": "unauthorized"}), 401

    conn = get_conn()
    cur = conn.cursor()
    rows = cur.execute("SELECT * FROM data ORDER BY created_at DESC").fetchall()
    conn.close()

    # build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "node_id", "created_at", "mq4", "mq7", "mq135", "water_level", "health_score"])
    for r in rows:
        writer.writerow([r["id"], r["node_id"], r["created_at"], r["mq4"], r["mq7"], r["mq135"], r["water_level"], r["health_score"]])

    mem = io.BytesIO()
    mem.write(output.getvalue().encode("utf-8"))
    mem.seek(0)
    filename = f"sewer_data_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return send_file(mem, as_attachment=True, download_name=filename, mimetype="text/csv")


# simple login endpoint (POST /api/login)
@app.route("/api/login", methods=["POST"])
def api_login():
    body = request.get_json(force=True)
    if not body:
        return jsonify({"error": "missing"}), 400
    username = body.get("username", "")
    password = body.get("password", "")

    if username == ADMIN_USERNAME and check_password_hash(ADMIN_PASSWORD_HASH, password):
        session["logged_in"] = True
        session["user"] = ADMIN_USERNAME
        return jsonify({"status": "ok"})
    else:
        return jsonify({"error": "invalid credentials"}), 401


# optional: logout
@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"status": "ok"})


# Get alerts list (paged) - optional helper endpoint
@app.route("/api/alerts", methods=["GET"])
def api_alerts():
    conn = get_conn()
    cur = conn.cursor()
    rows = cur.execute("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 200").fetchall()
    alerts = []
    for a in rows:
        alerts.append({
            "id": a["id"],
            "node_id": a["node_id"],
            "type": a["type"],
            "message": a["message"],
            "severity": a["severity"],
            "acknowledged": bool(a["acknowledged"]),
            "created_at": a["created_at"]
        })
    conn.close()
    return jsonify(alerts)


# -------------------
# RUN
# -------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
