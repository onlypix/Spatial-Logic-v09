/**
 * Spatial Logic v1.2 - Predictive Area Chart Edition
 * Engineer-level consistency update
 */

const CONFIG = {
    k: 0.5,
    windowSize: 40,
    lowPassAlpha: 0.3,
    epochMs: 60000,         
    maxEpochs: 1440,        // 24 hours persistence
    stitchThreshold: 120000
};

let sensorData = { x: [], y: [], z: [] };
let lastStability = 100;
let isRunning = false;
let lastTapTime = 0;

// UI DOM References
const hudWidget = document.getElementById('hud-widget');
const dashContent = document.getElementById('dashboard-content');
const stabilityEl = document.getElementById('stability-value');
const stateEl = document.getElementById('state-label');
const trendArrow = document.getElementById('trend-arrow');
const pulseEl = document.getElementById('focus-indicator');
const overlay = document.getElementById('overlay-msg');

let cognitiveHistory = JSON.parse(localStorage.getItem('sl_history') || '[]');

// --- SYSTEM INITIALIZATION ---
window.addEventListener('click', async function() {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;
    
    if (isRunning && timeSinceLastTap < 400 && timeSinceLastTap > 50) {
        openDashboard();
    } else if (!isRunning) {
        overlay.innerText = "Szenzor inicializálása...";
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission === 'granted') initEngine();
                else overlay.innerText = "HIBA: Engedély megtagadva.";
            } else {
                initEngine();
            }
        } catch (err) { overlay.innerText = "Kivétel: " + err.message; }
    }
    lastTapTime = now;
});

function initEngine() {
    window.addEventListener('devicemotion', handleMotion, true);
    overlay.style.display = 'none';
    isRunning = true;
    
    // Heartbeat for background persistence
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(()=>{}, ()=>{}, {enableHighAccuracy:false});
    }

    setInterval(recordEpoch, CONFIG.epochMs);
}

// --- CORE SENSOR LOGIC ---
function handleMotion(event) {
    let acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc || (acc.x === null && acc.y === null)) return;

    sensorData.x.push(filter(acc.x || 0, sensorData.x));
    sensorData.y.push(filter(acc.y || 0, sensorData.y));
    sensorData.z.push(filter(acc.z || 0, sensorData.z));
    
    if (sensorData.x.length > CONFIG.windowSize) {
        sensorData.x.shift(); sensorData.y.shift(); sensorData.z.shift();
        calculateRealTimeStability();
    }
}

function filter(val, arr) {
    if (arr.length === 0) return val;
    return CONFIG.lowPassAlpha * val + (1 - CONFIG.lowPassAlpha) * arr[arr.length - 1];
}

function calculateRealTimeStability() {
    const getVar = (arr) => {
        const mean = arr.reduce((a, b) => a + b) / arr.length;
        return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    };
    const combinedStd = Math.sqrt(getVar(sensorData.x) + getVar(sensorData.y) + getVar(sensorData.z));
    lastStability = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-CONFIG.k * combinedStd))));
    updateMiniUI(lastStability);
}

function updateMiniUI(s) {
    stabilityEl.innerText = `${s}%`;
    stateEl.innerText = s > 80 ? "FLOW" : (s > 40 ? "STABLE" : "FATIGUE");
    hudWidget.style.borderRightColor = s > 80 ? "#00ff88" : (s > 40 ? "#ffcc00" : "#ff4444");
    s <= 40 ? pulseEl.classList.add('pulse-active') : pulseEl.classList.remove('pulse-active');

    if (cognitiveHistory.length > 0) {
        const lastRec = cognitiveHistory[cognitiveHistory.length - 1].s;
        if (s > lastRec + 5) trendArrow.innerText = "↑";
        else if (s < lastRec - 5) trendArrow.innerText = "↓";
        else trendArrow.innerText = "→";
    }
}

function recordEpoch() {
    cognitiveHistory.push({ t: Date.now(), s: lastStability });
    if (cognitiveHistory.length > CONFIG.maxEpochs) cognitiveHistory.shift();
    localStorage.setItem('sl_history', JSON.stringify(cognitiveHistory));
}

// --- PREDICTIVE RENDERING ENGINE ---
function openDashboard() {
    hudWidget.classList.replace('mini-view', 'full-view');
    dashContent.style.display = 'block';
    processAndRenderDashboard();
    setTimeout(() => {
        hudWidget.classList.replace('full-view', 'mini-view');
        dashContent.style.display = 'none';
    }, 8000);
}

function processAndRenderDashboard() {
    if (cognitiveHistory.length === 0) return;

    const canvas = document.getElementById('cognitiveChart');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 1. Data Synthesis: Real vs Target
    let full24h = [];
    const now = Date.now();
    for (let i = 0; i < 1440; i++) {
        let ts = now - (1440 - i) * 60000;
        let realPoint = cognitiveHistory.find(p => Math.abs(p.t - ts) < 30000);
        
        // Target Curve: Circadian-like focus model
        let hour = new Date(ts).getHours();
        let targetS = 65 + 20 * Math.sin((hour - 8) * Math.PI / 12); 

        full24h.push({ val: realPoint ? realPoint.s : null, target: targetS, isReal: !!realPoint });
    }

    // 2. KPI Logic
    const flowPoints = cognitiveHistory.filter(p => p.s >= 80).length;
    document.getElementById('kpi-flow').innerText = Math.round((flowPoints / Math.max(1, cognitiveHistory.length)) * 100) + "%";
    
    // Recovery heuristic
    let recMins = cognitiveHistory.filter((p, i) => i > 0 && p.s > 70 && cognitiveHistory[i-1].s < 50).length;
    document.getElementById('kpi-recovery').innerText = recMins > 0 ? recMins + "m" : "--";

    // 3. Canvas Rendering
    ctx.clearRect(0, 0, w, h);

    // Render Target Area (The "Ghost" Simulation)
    ctx.beginPath();
    ctx.moveTo(0, h);
    full24h.forEach((p, i) => { ctx.lineTo((i / 1440) * w, h - (p.target / 100) * h); });
    ctx.lineTo(w, h);
    ctx.fillStyle = 'rgba(0, 200, 255, 0.1)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Render Real Data (Neon Path)
    ctx.beginPath();
    let firstReal = true;
    full24h.forEach((p, i) => {
        if (p.isReal) {
            let x = (i / 1440) * w;
            let y = h - (p.val / 100) * h;
            if (firstReal) { ctx.moveTo(x, y); firstReal = false; }
            else ctx.lineTo(x, y);
        }
    });
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00ff88';
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Alert Logic
    const alertMsg = document.getElementById('alert-msg');
    const recentAvg = cognitiveHistory.slice(-60).reduce((a, b) => a + b.s, 0) / Math.max(1, Math.min(60, cognitiveHistory.length));
    if (recentAvg < 45) {
        alertMsg.innerText = "COGNITIVE OVERLOAD DETECTED";
        alertMsg.style.color = "#ff4444";
    } else {
        alertMsg.innerText = "SYSTEMS OPTIMAL";
        alertMsg.style.color = "#00ff88";
    }
                          }

                      
