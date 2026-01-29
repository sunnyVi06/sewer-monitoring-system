// Dashboard state
let healthChart, gasChart, waterChart;
let updateInterval = 30000; // 30 seconds

// DOM elements
const healthScoreEl = document.getElementById('healthScore');
const healthBarEl = document.getElementById('healthBar');
const statusIconEl = document.getElementById('statusIcon');
const statusTextEl = document.getElementById('statusText');
const alertCountEl = document.getElementById('alertCount');
const lastUpdatedEl = document.getElementById('lastUpdated');
const liveStatusEl = document.getElementById('liveStatus');

// Initialize charts
function initCharts() {
    const healthCtx = document.getElementById('healthChart').getContext('2d');
    healthChart = new Chart(healthCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Health Score',
                data: [],
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { min: 0, max: 100 }
            }
        }
    });

    const gasCtx = document.getElementById('gasChart').getContext('2d');
    gasChart = new Chart(gasCtx, {
        type: 'bar',
        data: {
            labels: ['CH₄', 'CO', 'H₂S'],
            datasets: [{
                label: 'Concentration (ppm)',
                data: [0, 0, 0],
                backgroundColor: ['#ff6384', '#36a2eb', '#ffce56']
            }]
        },
        options: { responsive: true }
    });

    const waterCtx = document.getElementById('waterChart').getContext('2d');
    waterChart = new Chart(waterCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Water Level %',
                data: [],
                borderColor: '#198754',
                backgroundColor: 'rgba(25, 135, 84, 0.1)',
                fill: true
            }]
        },
        options: { responsive: true }
    });
}

// Fetch data from backend
async function fetchDashboardData() {
    try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();
        updateDashboard(data);
    } catch (error) {
        console.error('Failed to fetch data:', error);
        liveStatusEl.className = 'badge bg-danger';
        liveStatusEl.textContent = 'Offline';
    }
}

// Update all dashboard elements
function updateDashboard(data) {
    const latest = data.latest;
    if (!latest) return;

    // Health score
    healthScoreEl.textContent = latest.health_score;
    healthBarEl.style.width = `${latest.health_score}%`;
    healthBarEl.className = `progress-bar ${getHealthColor(latest.health_score)}`;

    // Overall status
    let status, icon, color;
    if (latest.health_score >= 70) {
        status = 'Safe'; icon = 'fa-check-circle'; color = 'success';
    } else if (latest.health_score >= 40) {
        status = 'Warning'; icon = 'fa-exclamation-triangle'; color = 'warning';
    } else {
        status = 'Danger'; icon = 'fa-times-circle'; color = 'danger';
    }
    statusTextEl.textContent = status;
    statusIconEl.className = `fas ${icon} fa-4x text-${color}`;

    // Sensor readings
    document.getElementById('ch4Value').textContent = latest.mq4 + ' ppm';
    document.getElementById('coValue').textContent = latest.mq7 + ' ppm';
    document.getElementById('h2sValue').textContent = latest.mq135 + ' ppm';
    document.getElementById('waterValue').textContent = latest.water_level + ' %';
    document.getElementById('waterBar').style.width = latest.water_level + '%';

    // Update sensor status indicators
    updateSensorStatus('ch4Status', latest.mq4, 500, 2000);
    updateSensorStatus('coStatus', latest.mq7, 30, 100);
    updateSensorStatus('h2sStatus', latest.mq135, 5, 20);

    // Alerts count
    alertCountEl.textContent = data.alerts.length;

    // Update charts
    updateCharts(data.history);

    // Update alerts table
    updateAlertsTable(data.alerts);

    // Update nodes
    updateNodes(data.nodes);

    // Update timestamp
    lastUpdatedEl.textContent = `Last updated: ${new Date(data.updatedAt).toLocaleTimeString()}`;
    liveStatusEl.className = 'badge bg-success';
    liveStatusEl.textContent = 'Live';
}

function updateSensorStatus(elementId, value, warnThreshold, dangerThreshold) {
    const el = document.getElementById(elementId);
    if (value > dangerThreshold) {
        el.textContent = 'Danger';
        el.className = 'sensor-status status-danger';
    } else if (value > warnThreshold) {
        el.textContent = 'Warning';
        el.className = 'sensor-status status-warning';
    } else {
        el.textContent = 'Safe';
        el.className = 'sensor-status status-safe';
    }
}

function updateCharts(history) {
    // Health score trend
    const times = history.map(r => new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
    const scores = history.map(r => r.health_score);
    healthChart.data.labels = times.slice(-24);
    healthChart.data.datasets[0].data = scores.slice(-24);
    healthChart.update();

    // Gas concentrations (latest)
    gasChart.data.datasets[0].data = [history[0]?.mq4 || 0, history[0]?.mq7 || 0, history[0]?.mq135 || 0];
    gasChart.update();

    // Water level history
    waterChart.data.labels = times.slice(-12);
    waterChart.data.datasets[0].data = history.slice(-12).map(r => r.water_level);
    waterChart.update();
}

function updateAlertsTable(alerts) {
    const tbody = document.getElementById('alertsTable');
    tbody.innerHTML = '';
    alerts.forEach(alert => {
        const row = `<tr>
            <td>${new Date(alert.created_at).toLocaleString()}</td>
            <td>${alert.node_id}</td>
            <td>${alert.type}</td>
            <td>${alert.message}</td>
            <td><span class="badge bg-${alert.severity === 'danger' ? 'danger' : 'warning'}">${alert.severity}</span></td>
            <td><button class="btn btn-sm btn-outline-primary" onclick="acknowledgeAlert(${alert.id})">Acknowledge</button></td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

function updateNodes(nodes) {
    const container = document.getElementById('nodesContainer');
    container.innerHTML = '';
    nodes.forEach(node => {
        const card = `<div class="col-md-3 mb-3">
            <div class="card node-card ${node.status === 'active' ? '' : 'offline'}">
                <div class="card-body">
                    <h5 class="card-title">${node.node_id}</h5>
                    <p class="card-text">${node.location || 'Unknown location'}</p>
                    <p class="card-text"><small>Last seen: ${node.last_seen ? new Date(node.last_seen).toLocaleTimeString() : 'Never'}</small></p>
                    <span class="badge ${node.status === 'active' ? 'bg-success' : 'bg-danger'}">${node.status}</span>
                </div>
            </div>
        </div>`;
        container.innerHTML += card;
    });
}

function getHealthColor(score) {
    if (score >= 70) return 'bg-success';
    if (score >= 40) return 'bg-warning';
    return 'bg-danger';
}

// Alert acknowledgement
async function acknowledgeAlert(id) {
    await fetch(`/api/alerts/${id}/acknowledge`, { method: 'POST' });
    fetchDashboardData();
}

// CSV export
document.getElementById('exportBtn').addEventListener('click', async () => {
    const response = await fetch('/api/export');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sewer_data.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
});

// Login modal
document.getElementById('loginBtn').addEventListener('click', () => {
    new bootstrap.Modal(document.getElementById('loginModal')).show();
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (response.ok) {
        alert('Login successful!');
        bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
    } else {
        alert('Login failed!');
    }
});

// Initialize and start auto‑refresh
initCharts();
fetchDashboardData();
setInterval(fetchDashboardData, updateInterval);
