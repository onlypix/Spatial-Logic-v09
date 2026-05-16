const CONFIG = {
    k: 0.5,
    windowSize: 40,
    lowPassAlpha: 0.3,
    epochMs: 60000,         
    maxEpochs: 1440,
    radius: 55 // SVG circle radius
};

let sensorData = { x: [], y: [], z: [] };
let lastStability = 100;
let isRunning = false;
let lastTapTime = 0;

const hudWidget = document.getElementById('hud-widget');
const dashContent = document.getElementById('dashboard-content');
const miniAnchor = document.getElementById('mini-anchor');
const overlay = document.getElementById('overlay-msg');

let cognitiveHistory = JSON.parse(localStorage.getItem('sl_history') || '[]');

// --- CORE SYSTEM INITIALIZER ---
window.addEventListener('click', async function() {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;
    
    if (isRunning && timeSinceLastTap < 400 && timeSinceLastTap > 50) {
        toggleDashboard();
    } else if (!isRunning) {
        overlay.innerText = "Initializing Spatial HUD Interface...";
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission === 'granted') initEngine();
                else overlay.innerText = "ERROR: Sensor Permission Denied.";
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
    setInterval(recordEpoch, CONFIG.epochMs);
}

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
    
    document.getElementById('mini-value').innerText = `${lastStability}%`;
    if(hudWidget.classList.contains('full-view')) {
        updateCircularBattery(lastStability);
    }
}

// --- UPDATE SVG CIRCULAR GAUGE ---
function updateCircularBattery(score) {
    document.getElementById('bat-num').innerText = `${score}%`;
    const circle = document.getElementById('moving-arc');
    const circumference = 2 * Math.PI * CONFIG.radius;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    const offset = circumference - (score / 100) * circumference;
    circle.style.strokeDashoffset = offset;

    const statusTag = document.getElementById('bat-status');
    if (score > 80) {
        statusTag.innerText = "Túlteljesítés";
        statusTag.style.color = "var(--meta-green)";
    } else if (score > 40) {
        statusTag.innerText = "Optimális";
        statusTag.style.color = "var(--meta-yellow)";
    } else {
        statusTag.innerText = "Kimerülés veszély";
        statusTag.style.color = "var(--meta-red)";
    }
}

function recordEpoch() {
    cognitiveHistory.push({ t: Date.now(), s: lastStability });
    if (cognitiveHistory.length > CONFIG.maxEpochs) cognitiveHistory.shift();
    localStorage.setItem('sl_history', JSON.stringify(cognitiveHistory));
    if (hudWidget.classList.contains('full-view')) processAndRenderDashboard();
}

function toggleDashboard() {
    if (hudWidget.classList.contains('full-view')) {
        hudWidget.classList.replace('full-view', 'mini-view');
        dashContent.style.display = 'none';
        miniAnchor.style.display = 'block';
    } else {
        hudWidget.classList.replace('mini-view', 'full-view');
        dashContent.style.display = 'block';
        miniAnchor.style.display = 'none';
        updateCircularBattery(lastStability);
        processAndRenderDashboard();
    }
}

// --- MATHEMATICAL WAVEFORM GRAPHICS MOTOR ---
function processAndRenderDashboard() {
    const canvas = document.getElementById('cognitiveChart');
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const nowMs = Date.now();
    const splitIndex = 1100; // Left bias split matrix configuration
    let full24h = [];

    for (let i = 0; i < 1440; i++) {
        let ts = nowMs - (splitIndex - i) * 60000;
        let realPoint = cognitiveHistory.find(p => Math.abs(p.t - ts) < 30000);
        let hour = new Date(ts).getHours();
        let targetS = 60 + 22 * Math.sin((hour - 7) * Math.PI / 12); 

        full24h.push({
            val: i <= splitIndex && realPoint ? realPoint.s : null,
            target: targetS,
            isReal: i <= splitIndex && !!realPoint
        });
    }

    let minutesToDeficit = 90; // TTE projection default anchor
    if (cognitiveHistory.length >= 10) {
        const segment = cognitiveHistory.slice(-10);
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        let n = segment.length;
        for (let i = 0; i < n; i++) {
            sumX += i; sumY += segment[i].s; sumXY += i * segment[i].s; sumXX += i * i;
        }
        let slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        if (slope < -0.05) minutesToDeficit = Math.max(5, Math.round((40 - segment[n-1].s) / slope));
    }

    // Refresh Pill Text Nodes
    const totalFlowCount = cognitiveHistory.filter(p => p.s >= 80).length;
    document.getElementById('pill-flow').innerText = Math.round((totalFlowCount / Math.max(1, cognitiveHistory.length)) * 100) + "%";
    document.getElementById('pill-recovery').innerText = cognitiveHistory.filter((p, i) => i > 0 && p.s > 75 && cognitiveHistory[i-1].s < 45).length + "m";
    document.getElementById('pill-tte').innerText = minutesToDeficit >= 90 ? "+1.5h" : minutesToDeficit + "m";

    ctx.clearRect(0, 0, w, h);
    const getX = (index) => (index / 1440) * w;
    const getY = (val) => h - (val / 100) * h;
    let nowX = getX(splitIndex);

    // Baseline area gradient generation (Ghost Blue Background Envelope)
    let areaGlow = ctx.createLinearGradient(0, 0, 0, h);
    areaGlow.addColorStop(0, 'rgba(0, 100, 224, 0.25)');
    areaGlow.addColorStop(1, 'rgba(0, 50, 150, 0.0)');

    // Path setup for target model
    ctx.beginPath();
    ctx.moveTo(getX(0), h);
    full24h.forEach((p, i) => ctx.lineTo(getX(i), getY(p.target)));
    ctx.lineTo(getX(1439), h);
    ctx.fillStyle = areaGlow;
    ctx.fill();

    // Intersection Differential Filler (Gold Delta Surplus Mapping)
    ctx.beginPath();
    let tracking = false;
    full24h.forEach((p, i) => {
        if (i <= splitIndex && p.isReal) {
            let cx = getX(i);
            let cy = getY(p.val);
            let ty = getY(p.target);
            if (cy < ty) { // Surplus state condition
                if (!tracking) { ctx.beginPath(); ctx.moveTo(cx, ty); tracking = true; }
                ctx.lineTo(cx, cy);
            } else {
                if (tracking) { ctx.lineTo(cx, ty); ctx.fillStyle = 'rgba(255, 204, 0, 0.15)'; ctx.fill(); tracking = false; }
            }
        }
    });

    // Real-Time Smooth Vector Stroke (Actual Light Green Track)
    ctx.beginPath();
    let first = true;
    full24h.forEach((p, i) => {
        if (i <= splitIndex && p.isReal) {
            if (first) { ctx.moveTo(getX(i), getY(p.val)); first = false; }
            else ctx.lineTo(getX(i), getY(p.val));
        }
    });
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00ff88';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Predictive Linear Horizon Dash Stroke (Dotted Yellow Forecast)
    let lastRealX = nowX, lastRealY = getY(lastStability);
    ctx.beginPath();
    ctx.moveTo(lastRealX, lastRealY);
    for (let i = splitIndex + 1; i < 1440; i++) {
        let elapsed = i - splitIndex;
        let pVal = Math.max(20, lastStability - (elapsed / minutesToDeficit) * (lastStability - 40));
        ctx.lineTo(getX(i), getY(pVal));
    }
    ctx.strokeStyle = 'rgba(255, 204, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Spatial Vertical Temporal Axis Pin (NOW Line)
    ctx.beginPath();
    ctx.moveTo(nowX, 0); ctx.lineTo(nowX, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('NOW', nowX - 28, 14);

    // Adaptive Alert Engine Update
    const alertBox = document.getElementById('alert-msg');
    if (lastStability > full24h[splitIndex].target) {
        alertBox.innerText = "» Surpassing model. Good momentum.";
        alertBox.style.color = "var(--meta-green)";
        alertBox.style.background = "rgba(0, 255, 136, 0.05)";
    } else {
        alertBox.innerText = "» Approaching baseline threshold. Monitor overhead.";
        alertBox.style.color = "var(--meta-yellow)";
        alertBox.style.background = "rgba(255, 204, 0, 0.05)";
    }
}
