// Dashboard JavaScript
const API_URL = 'http://localhost:3000/api';
let refreshInterval;
let charts = {};

// Check if user is logged in
function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (token) {
        document.getElementById('loginModal').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        initializeDashboard();
    }
}

// Login function
function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('userRole', data.role);
            checkAuth();
        } else {
            alert('Invalid credentials!');
        }
    });
}

// Logout function
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userRole');
    clearInterval(refreshInterval);
    location.reload();
}

// Initialize dashboard
function initializeDashboard() {
    // Load initial data
    loadDashboardData();
    
    // Setup auto-refresh every 30 seconds
    refreshInterval = setInterval(loadDashboardData, 30000);
    
    // Initialize charts
    initializeCharts();
    
    // Start refresh timer
    startRefreshTimer();
}

// Load dashboard data
function loadDashboardData() {
    fetch(`${API_URL}/dashboard`)
        .then(response => response.json())
        .then(data => {
            updateDashboard(data);
            updateCharts(data.history);
            updateLastUpdated();
        })
        .catch(error => {
            console.error('Error loading dashboard:', error);
            document.getElementById('statusText').textContent = 'Connection Error';
            document.getElementById('statusDot').className = 'status-dot danger';
        });
}

// Update dashboard with new data
function updateDashboard(data) {
    const latest = data.latest;
    
    // Update health score
    const healthScore = latest.health_score || 0;
    document.getElementById('healthScore').textContent = healthScore;
    document.getElementById('healthBar').innerHTML = 
        `<div class="fill" style="width: ${healthScore}%"></div>`;
    
    // Update overall status
    updateOverallStatus(healthScore);
    
    // Update sensor values
    updateSensorValues(latest);
    
    // Update alerts
    updateAlerts(data.alerts);
    
    // Update nodes
    updateNodes(data.nodes);
    
    // Update stats
    document.getElementById('dataCount').textContent = data.history.length;
    document.getElementById('lastTransmission').textContent = 
        new Date(latest.timestamp).toLocaleTimeString();
}

// Update overall status based on health score
function updateOverallStatus(score) {
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const overallStatus = document.getElementById('overallStatusValue');
    
    if (score >= 70) {
        statusText.textContent = 'All Systems Normal';
        statusDot.className = 'status-dot safe';
        overallStatus.innerHTML = '<i class="fas fa-check-circle"></i> Safe';
        overallStatus.style.color = 'var(--success-color)';
    } else if (score >= 50) {
        statusText.textContent = 'Requires Attention';
        statusDot.className = 'status-dot warning';
        overallStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Warning';
        overallStatus.style.color = 'var(--warning-color)';
    } else {
        statusText.textContent = 'Immediate Action Required';
        statusDot.className = 'status-dot danger';
        overallStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Danger';
        overallStatus.style.color = 'var(--danger-color)';
    }
}

// Update sensor values
function updateSensorValues(data) {
    // MQ135
    const mq135 = data.mq135 || 0;
    document.getElementById('value-mq135').textContent = mq135.toFixed(1);
    updateSensorStatus('mq135', mq135, 100, 300);
    
    // MQ7
    const mq7 = data.mq7 || 0;
    document.getElementById('value-mq7').textContent = mq7.toFixed(1);
    updateSensorStatus('mq7', mq7, 10, 30);
    
    // MQ4
    const mq4 = data.mq4 || 0;
    document.getElementById('value-mq4').textContent = mq4.toFixed(1);
    updateSensorStatus('mq4', mq4, 200, 1000);
    
    // Water level
    const waterLevel = data.water_level || 0;
    document.getElementById('waterValue').textContent = waterLevel.toFixed(0) + '%';
    document.getElementById('waterGauge').style.height = (100 - waterLevel) + '%';
    
    // Update water card color
    const waterCard = document.querySelector('.water-level-card');
    if (waterLevel > 80) {
        waterCard.style.borderLeft = '5px solid var(--danger-color)';
    } else if (waterLevel > 40) {
        waterCard.style.borderLeft = '5px solid var(--warning-color)';
    } else {
        waterCard.style.borderLeft = '5px solid var(--success-color)';
    }
    
    // Temperature & Humidity
    document.getElementById('tempValue').textContent = (data.temperature || 25).toFixed(1) + ' °C';
    document.getElementById('humidityValue').textContent = (data.humidity || 60).toFixed(0) + ' %';
}

// Update sensor status
function updateSensorStatus(sensor, value, warningThreshold, dangerThreshold) {
    const element = document.getElementById(`status-${sensor}`);
    const card = document.getElementById(`sensor-${sensor}`);
    
    if (value >= dangerThreshold) {
        element.textContent = 'DANGER';
        element.className = 'status-label danger';
        card.style.borderLeft = '5px solid var(--danger-color)';
    } else if (value >= warningThreshold) {
        element.textContent = 'WARNING';
        element.className = 'status-label warning';
        card.style.borderLeft = '5px solid var(--warning-color)';
    } else {
        element.textContent = 'SAFE';
        element.className = 'status-label safe';
        card.style.borderLeft = '5px solid var(--success-color)';
    }
}

// Update alerts table
function updateAlerts(alerts) {
    const alertsCount = alerts.length;
    document.getElementById('alertsCount').textContent = alertsCount;
    
    let severityText = 'All clear';
    if (alertsCount > 0) {
        const dangerCount = alerts.filter(a => a.severity === 'danger').length;
        const warningCount = alerts.filter(a => a.severity === 'warning').length;
        
        severityText = `${dangerCount} critical, ${warningCount} warnings`;
        
        // Update alerts card color
        const alertsCard = document.querySelector('.alerts-card');
        if (dangerCount > 0) {
            alertsCard.style.borderLeft = '5px solid var(--danger-color)';
        } else if (warningCount > 0) {
            alertsCard.style.borderLeft = '5px solid var(--warning-color)';
        }
    }
    
    document.getElementById('alertsSeverity').textContent = severityText;
    
    // Update alerts table
    const tableBody = document.getElementById('alertsTable');
    tableBody.innerHTML = '';
    
    if (alertsCount === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #666;">
                    <i class="far fa-check-circle"></i> No active alerts
                </td>
            </tr>
        `;
        return;
    }
    
    alerts.forEach(alert => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${new Date(alert.timestamp).toLocaleTimeString()}</td>
            <td><strong>${alert.node_id}</strong></td>
            <td>${alert.alert_type}</td>
            <td>${alert.message}</td>
            <td><span class="alert-severity ${alert.severity}">${alert.severity.toUpperCase()}</span></td>
            <td>
                <button class="btn-acknowledge" onclick="acknowledgeAlert(${alert.id})">
                    Acknowledge
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Update nodes list
function updateNodes(nodes) {
    const nodesGrid = document.getElementById('nodesGrid');
    nodesGrid.innerHTML = '';
    
    let activeNodes = 0;
    nodes.forEach(node => {
        const lastSeen = new Date(node.last_seen);
        const minutesAgo = Math.floor((new Date() - lastSeen) / (1000 * 60));
        const isActive = minutesAgo < 10; // Active if seen in last 10 minutes
        
        if (isActive) activeNodes++;
        
        const nodeCard = document.createElement('div');
        nodeCard.className = 'node-card';
        nodeCard.innerHTML = `
            <div class="node-header">
                <div class="node-id">${node.id}</div>
                <span class="node-status ${isActive ? 'active' : 'offline'}">
                    ${isActive ? 'Active' : 'Offline'}
                </span>
            </div>
            <div class="node-details">
                <div><span>Location:</span> <span>${node.location || 'Not set'}</span></div>
                <div><span>Last Seen:</span> <span>${lastSeen.toLocaleTimeString()}</span></div>
                <div><span>Installed:</span> <span>${node.install_date || 'Unknown'}</span></div>
            </div>
            <div class="node-actions">
                <button class="btn-secondary" onclick="viewNodeDetails('${node.id}')">
                    <i class="fas fa-chart-line"></i> View Details
                </button>
            </div>
        `;
        nodesGrid.appendChild(nodeCard);
    });
    
    // Update uptime
    const uptime = nodes.length > 0 ? Math.round((activeNodes / nodes.length) * 100) : 0;
    document.getElementById('uptimeValue').textContent = uptime + '%';
    document.getElementById('activeNodes').textContent = activeNodes;
    
    // Update uptime card color
    const uptimeCard = document.querySelector('.uptime-card');
    if (uptime >= 90) {
        uptimeCard.style.borderLeft = '5px solid var(--success-color)';
    } else if (uptime >= 70) {
        uptimeCard.style.borderLeft = '5px solid var(--warning-color)';
    } else {
        uptimeCard.style.borderLeft = '5px solid var(--danger-color)';
    }
}

// Acknowledge alert
function acknowledgeAlert(alertId) {
    fetch(`${API_URL}/alerts/acknowledge/${alertId}`, {
        method: 'POST'
    })
    .then(() => {
        loadDashboardData();
    });
}

// Export data as CSV
function exportData() {
    window.open(`${API_URL}/export/csv`, '_blank');
}

// Show add node modal
function showAddNodeModal() {
    document.getElementById('addNodeModal').style.display = 'flex';
}

// Close add node modal
function closeAddNodeModal() {
    document.getElementById('addNodeModal').style.display = 'none';
}

// Add new node
function addNewNode() {
    const nodeId = document.getElementById('nodeId').value;
    const location = document.getElementById('nodeLocation').value;
    const installDate = document.getElementById('installDate').value;
    
    if (!nodeId) {
        alert('Please enter a Node ID');
        return;
    }
    
    fetch(`${API_URL}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: nodeId,
            location: location,
            install_date: installDate
        })
    })
    .then(response => response.json())
    .then(() => {
        closeAddNodeModal();
        loadDashboardData();
        alert('Node added successfully!');
    });
}

// View node details
function viewNodeDetails(nodeId) {
    alert(`Details for ${nodeId} would open in a detailed view.\n\nThis feature would show:\n- Historical data charts\n- Alert history\n- Maintenance records\n- Location on map`);
}

// Update last updated time
function updateLastUpdated() {
    const now = new Date();
    document.getElementById('lastUpdated').textContent = 
        now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
}

// Start refresh timer
function startRefreshTimer() {
    let seconds = 30;
    const timerElement = document.getElementById('refreshTimer');
    
    setInterval(() => {
        seconds--;
        if (seconds < 0) seconds = 30;
        timerElement.textContent = `${seconds}s`;
    }, 1000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', checkAuth);