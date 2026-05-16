/**
 * Life Coaching v2.0 - Core Engine & Spatial UI Layer
 * Fully localized, augmented with TTE logic & Delta rendering profiles.
 */

const CONFIG = {
    k: 0.5,
    windowSize: 40,
    lowPassAlpha: 0.3,
    epochMs: 60000,         
    maxEpochs: 1440,        // Fixed 24-hour circular telemetry stream
    stitchThreshold: 120000
};

let sensorData = { x: [], y: [], z: [] };
let lastStability = 100;
let isRunning = false;
let lastTapTime = 0;

// Spatial UI Registry
const hudWidget = document.getElementById('hud-widget');
const dashContent = document.getElementById('dashboard-content');
const stabilityEl = document.getElementById('stability-value');
const stateEl = document.getElementById('state-label');
const trendArrow = document.getElementById('trend-arrow');
const pulseEl = document.getElementById('focus-indicator');
const overlay = document.getElementById('overlay-msg');

let cognitiveHistory = JSON.parse(localStorage.getItem('sl_history') || '[]');

// --- SYSTEM INITIALIZATION HANDLER ---
window.addEventListener('click', async function() {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;
    
    if (isRunning && timeSinceLastTap < 400 && timeSinceLastTap > 50) {
        toggleDashboard();
    } else if (!isRunning) {
        overlay.innerText = "Initializing Wearable Toolkit SDK...";
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission === 'granted') initEngine();
                else overlay.innerText = "CRITICAL ERROR: Sensor Permission Denied.";
            } else {
                initEngine();
            }
        } catch (err) { overlay.innerText = "Exception: " + err.message; }
    }
    lastTapTime = now;
});

function initEngine() {
    window.addEventListener('devicemotion', handleMotion, true);
    overlay.style.display = 'none';
    isRunning = true;
    
    // Low-energy geolocation tracking vector acting as background state persistent pulse
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(()=>{}, ()=>{}, {enableHighAccuracy:false});
    }

    setInterval(recordEpoch, CONFIG.epochMs);
}

// --- MOTION SIGNAL INTERCEPTOR ---
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
    
    if (s > 80) {
        stateEl.innerText = "FLOW";
        hudWidget.style.borderColor = "rgba(0, 255, 136, 0.4)";
        pulseEl.classList.remove('pulse-active');
    } else if (s > 40) {
        stateEl.innerText = "STABLE";
        hudWidget.style.borderColor = "rgba(255, 204, 0, 0.4)";
        pulseEl.classList.remove('pulse-active');
    } else {
        stateEl.innerText = "FATIGUE";
        hudWidget.style.borderColor = "rgba(255, 68, 68, 0.4)";
        pulseEl.classList.add('pulse-active');
    }

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

// --- DISPLAY TRANSFORM COORDINATOR ---
function toggleDashboard() {
    if (hudWidget.classList.contains('full-view')) {
        closeDashboard();
    } else {
        hudWidget.classList.replace('mini-view', 'full-view');
        dashContent.style.display = 'block';
        processAndRenderDashboard();
    }
}

function closeDashboard() {
    hudWidget.classList.replace('full-view', 'mini-view');
    dashContent.style.display = 'none';
}

// --- MATHEMATICAL AND GRAPHICAL CORE ENGINE ---
function processAndRenderDashboard() {
    if (cognitiveHistory.length === 0) return;

    const canvas = document.getElementById('cognitiveChart');
    
    // Dynamic coordinate synchronization vector patch for Meta OS Layout consistency
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 1. Telemetry Synthesis Pipeline (22 Hours Past, 2 Hours Forecast horizon)
    let full24h = [];
    const nowMs = Date.now();
    const splitIndex = 1320; // 22 hours mark inside 1440 mins buffer array

    for (let i = 0; i < 1440; i++) {
        let ts = nowMs - (splitIndex - i) * 60000;
        let realPoint = cognitiveHistory.find(p => Math.abs(p.t - ts) < 30000);
        
        // Circadian baseline optimization target matrix formula
        let hour = new Date(ts).getHours();
        let targetS = 65 + 20 * Math.sin((hour - 8) * Math.PI / 12); 

        full24h.push({
            val: i <= splitIndex && realPoint ? realPoint.s : null,
            target: targetS,
            isReal: i <= splitIndex && !!realPoint
        });
    }

    // 2. TTE (Time-To-Exhaustion) Linear Projection Engine
    let minutesToDeficit = 120; // Default max limit
    if (cognitiveHistory.length >= 10) {
        const segment = cognitiveHistory.slice(-10);
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        let n = segment.length;
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += segment[i].s;
            sumXY += i * segment[i].s;
            sumXX += i * i;
        }
        let slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        if (slope < -0.1) {
            let currentS = segment[n-1].s;
            minutesToDeficit = Math.max(5, Math.round((40 - currentS) / slope));
        }
    }

    // 3. UI Analytics Metrics Refresh
    const totalFlowCount = cognitiveHistory.filter(p => p.s >= 80).length;
    document.getElementById('kpi-flow').innerText = Math.round((totalFlowCount / Math.max(1, cognitiveHistory.length)) * 100) + "%";
    
    let totalRecoveries = cognitiveHistory.filter((p, i) => i > 0 && p.s > 75 && cognitiveHistory[i-1].s < 45).length;
    document.getElementById('kpi-recovery').innerText = totalRecoveries;
    document.getElementById('kpi-tte').innerText = minutesToDeficit >= 120 ? "1.5h+" : minutesToDeficit + "m";

    // 4. Dual-Pass Canvas Surface Rasterizer
    ctx.clearRect(0, 0, w, h);
    const getXCoord = (index) => (index / 1440) * w;
    const getYCoord = (val) => h - (val / 100) * h;

    let nowX = getXCoord(splitIndex);

    // Context Array Parsing Strategy
    let lastRealX = 0;
    let lastRealY = h;
    let hasRealData = false;

    full24h.forEach((p, i) => {
        if (p.isReal) {
            lastRealX = getXCoord(i);
            lastRealY = getYCoord(p.val);
            hasRealData = true;
        }
    });

    // Sub-routine: Extrapolate trajectory path into the future window boundary
    if (hasRealData && minutesToDeficit < 120) {
        let currentS = full24h[splitIndex].isReal ? full24h[splitIndex].val : lastStability;
        for(let i = splitIndex + 1; i < 1440; i++) {
            let elapsed = i - splitIndex;
            let drop = (elapsed / minutesToDeficit) * (currentS - 40);
            full24h[i].val = Math.max(10, currentS - drop);
        }
    }

    // PASS 1: Structural Fill & Delta-Area Color Blending Shader
    for (let i = 0; i < 1440 - 1; i++) {
        let x1 = getXCoord(i);
        let x2 = getXCoord(i + 1);
        let t1 = getYCoord(full24h[i].target);
        let t2 = getYCoord(full24h[i + 1].target);
        
        let v1 = full24h[i].val !== null ? getYCoord(full24h[i].val) : null;
        let v2 = full24h[i+1].val !== null ? getYCoord(full24h[i+1].val) : null;

        // Render target model envelope background bounds
        ctx.beginPath();
        ctx.moveTo(x1, h);
        ctx.lineTo(x1, t1);
        ctx.lineTo(x2, t2);
        ctx.lineTo(x2, h);
        ctx.fillStyle = 'rgba(0, 100, 224, 0.04)';
        ctx.fill();

        // Calculate dynamic intersection offset vectors to spray fill the mathematical differential
        if (v1 !== null && v2 !== null) {
            ctx.beginPath();
            ctx.moveTo(x1, t1);
            ctx.lineTo(x2, t2);
            ctx.lineTo(x2, v2);
            ctx.lineTo(x1, v1);
            
            // Check performance metric delta
            if (v1 < t1) {
                ctx.fillStyle = 'rgba(255, 204, 0, 0.08)'; // Gold/Amethyst Surplus Zone
            } else {
                ctx.fillStyle = 'rgba(255, 68, 68, 0.08)';  // Deficit/Overload Cinnabar Zone
            }
            ctx.fill();
        }
    }

    // PASS 2: Vector Path Envelopes Drawing
    // Target Baseline Model Contour
    ctx.beginPath();
    full24h.forEach((p, i) => {
        let x = getXCoord(i);
        let y = getYCoord(p.target);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(0, 100, 224, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Actual Data Telemetry Line
    ctx.beginPath();
    let firstReal = true;
    for(let i = 0; i <= splitIndex; i++) {
        if (full24h[i].isReal) {
            let x = getXCoord(i);
            let y = getYCoord(full24h[i].val);
            if (firstReal) { ctx.moveTo(x, y); firstReal = false; } else ctx.lineTo(x, y);
        }
    }
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#00ff88';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Projected Future Trajectory Vector Line
    if (hasRealData) {
        ctx.beginPath();
        ctx.moveTo(lastRealX, lastRealY);
        for(let i = splitIndex + 1; i < 1440; i++) {
            if(full24h[i].val !== null) {
                ctx.lineTo(getXCoord(i), getYCoord(full24h[i].val));
            }
        }
        ctx.strokeStyle = 'rgba(255, 204, 0, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // PASS 3: NOW Spatial Temporal Axis Overlay
    ctx.beginPath();
    ctx.moveTo(nowX, 0);
    ctx.lineTo(nowX, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Render NOW Context Flag Tag
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('NOW', nowX - 24, 12); // Dynamic horizontal safety buffer text offset adjustment

    // 5. NLP Contextual Life Coaching Alert Parser
    const alertBox = document.getElementById('alert-msg');
    const recentAvg = cognitiveHistory.slice(-30).reduce((a, b) => a + b.s, 0) / Math.max(1, Math.min(30, cognitiveHistory.length));
    
    if (recentAvg < 45 || minutesToDeficit < 30) {
        alertBox.innerText = "» COGNITIVE SURCHARGE: 5-MIN RECOVERY MANDATORY";
        alertBox.style.background = "rgba(255, 68, 68, 0.1)";
        alertBox.style.borderColor = "rgba(255, 68, 68, 0.3)";
        alertBox.style.color = "var(--meta-red)";
    } else if (lastStability > full24h[splitIndex].target + 5) {
        alertBox.innerText = "» COGNITIVE SURPLUS: EXCELLENT MOMENTUM. KEEP FOCUS.";
        alertBox.style.background = "rgba(0, 255, 136, 0.06)";
        alertBox.style.borderColor = "rgba(0, 255, 136, 0.2)";
        alertBox.style.color = "var(--meta-green)";
    } else {
        alertBox.innerText = "» COGNITIVE PACE STABLE: BALANCE MAINTAINED.";
        alertBox.style.background = "rgba(0, 100, 224, 0.08)";
        alertBox.style.borderColor = "rgba(0, 100, 224, 0.2)";
        alertBox.style.color = "#00c8ff";
    }
        }
    
