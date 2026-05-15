/**
 * Spatial Logic v1.0 - Core Engine & Dashboard Layer
 * Update: Added Algorithmic Stitching for Data Continuity
 */

const CONFIG = {
    k: 0.5,
    windowSize: 40,
    lowPassAlpha: 0.3,
    epochMs: 60000,         // 1 perc per epoch
    maxEpochs: 2880,        // 48 óra (2880 perc) perzisztencia
    stitchThreshold: 120000 // 2 perc feletti lyuknál pótolunk
};

let sensorData = { x: [], y: [], z: [] };
let lastStability = 100;
let isRunning = false;
let lastTapTime = 0;

// UI Hivatkozások
const hudWidget = document.getElementById('hud-widget');
const dashContent = document.getElementById('dashboard-content');
const stabilityEl = document.getElementById('stability-value');
const stateEl = document.getElementById('state-label');
const trendArrow = document.getElementById('trend-arrow');
const pulseEl = document.getElementById('focus-indicator');
const overlay = document.getElementById('overlay-msg');

// Perzisztens adattároló betöltése (Circular Buffer)
let cognitiveHistory = JSON.parse(localStorage.getItem('sl_history') || '[]');

/**
 * INIT ÉS DUPLA KOPPINTÁS KEZELÉS
 */
window.addEventListener('click', async function() {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;
    
    if (isRunning && timeSinceLastTap < 400 && timeSinceLastTap > 50) {
        // Double Tap -> Toggle Dashboard
        openDashboard();
    } else if (!isRunning) {
        // Első kattintás -> Rendszer indítása
        overlay.innerText = "Szenzor inicializálása...";
        try {
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                const permission = await DeviceMotionEvent.requestPermission();
                if (permission === 'granted') initEngine();
                else overlay.innerText = "HIBA: Engedély megtagadva.";
            } else {
                initEngine();
            }
        } catch (err) {
            overlay.innerText = "Kivétel: " + err.message;
        }
    }
    lastTapTime = now;
});

function initEngine() {
    window.addEventListener('devicemotion', handleMotion, true);
    overlay.style.display = 'none';
    isRunning = true;
    
    // Adatgyűjtés indítása percenként (Epoch rögzítés)
    setInterval(recordEpoch, CONFIG.epochMs);
}

/**
 * SZENZOR FELDOLGOZÁS (Real-time Layer)
 */
function handleMotion(event) {
    let acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc || (acc.x === null && acc.y === null)) return;

    const x = acc.x || 0; const y = acc.y || 0; const z = acc.z || 0;
    
    sensorData.x.push(filter(x, sensorData.x));
    sensorData.y.push(filter(y, sensorData.y));
    sensorData.z.push(filter(z, sensorData.z));
    
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
    const varX = getVariance(sensorData.x);
    const varY = getVariance(sensorData.y);
    const varZ = getVariance(sensorData.z);
    
    const combinedStd = Math.sqrt(varX + varY + varZ);
    lastStability = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-CONFIG.k * combinedStd))));
    
    updateMiniUI(lastStability);
}

function getVariance(arr) {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b) / arr.length;
    return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
}

function updateMiniUI(s) {
    stabilityEl.innerText = `${s}%`;
    
    if (s > 80) {
        stateEl.innerText = "FLOW";
        hudWidget.style.borderRightColor = "var(--accent-green)";
        pulseEl.classList.remove('pulse-active');
    } else if (s > 40) {
        stateEl.innerText = "STABLE";
        hudWidget.style.borderRightColor = "var(--accent-yellow)";
        pulseEl.classList.remove('pulse-active');
    } else {
        stateEl.innerText = "FATIGUE";
        hudWidget.style.borderRightColor = "var(--accent-red)";
        pulseEl.classList.add('pulse-active');
    }

    if (cognitiveHistory.length > 0) {
        const lastRec = cognitiveHistory[cognitiveHistory.length - 1].s;
        if (s > lastRec + 5) trendArrow.innerText = "↑";
        else if (s < lastRec - 5) trendArrow.innerText = "↓";
        else trendArrow.innerText = "→";
    }
}

/**
 * ADATTÁROLÁS (Persistence Layer)
 */
function recordEpoch() {
    cognitiveHistory.push({
        t: Date.now(),
        s: lastStability
    });
    
    if (cognitiveHistory.length > CONFIG.maxEpochs) {
        cognitiveHistory.shift();
    }
    localStorage.setItem('sl_history', JSON.stringify(cognitiveHistory));
}

/**
 * DASHBOARD & LAZY PROCESSING (With Interpolation)
 */
function openDashboard() {
    if (hudWidget.classList.contains('full-view')) return;

    hudWidget.classList.replace('mini-view', 'full-view');
    dashContent.style.display = 'block';

    processAndRenderDashboard();

    setTimeout(() => {
        hudWidget.classList.replace('full-view', 'mini-view');
        dashContent.style.display = 'none';
    }, 5000);
}

function processAndRenderDashboard() {
    if (cognitiveHistory.length === 0) return;

    // 1. STITCHING: Adatpótlás a lyukak kitöltéséhez
    let stitchedHistory = [];
    for (let i = 0; i < cognitiveHistory.length; i++) {
        stitchedHistory.push(cognitiveHistory[i]);
        if (i < cognitiveHistory.length - 1) {
            let gap = cognitiveHistory[i+1].t - cognitiveHistory[i].t;
            if (gap > CONFIG.stitchThreshold && gap < 3600000) { 
                let missingMins = Math.floor(gap / 60000);
                for (let j = 1; j <= missingMins; j++) {
                    stitchedHistory.push({
                        t: cognitiveHistory[i].t + (j * 60000),
                        s: Math.round((cognitiveHistory[i].s + cognitiveHistory[i+1].s) / 2)
                    });
                }
            }
        }
    }

    // 2. Flow Index (stitched adatokból)
    const flowCount = stitchedHistory.filter(ep => ep.s >= 80).length;
    const flowIdx = Math.round((flowCount / stitchedHistory.length) * 100);
    document.getElementById('kpi-flow').innerText = `${flowIdx}%`;

    // 3. Recovery Rate (stitched adatokból)
    let recoveryMins = 0;
    let recoveryEvents = 0;
    let fatigueStart = null;
    for (let i = 0; i < stitchedHistory.length; i++) {
        if (stitchedHistory[i].s <= 40 && fatigueStart === null) {
            fatigueStart = i;
        } else if (stitchedHistory[i].s >= 80 && fatigueStart !== null) {
            recoveryMins += (i - fatigueStart);
            recoveryEvents++;
            fatigueStart = null;
        }
    }
    const avgRec = recoveryEvents > 0 ? Math.round(recoveryMins / recoveryEvents) : 0;
    document.getElementById('kpi-recovery').innerText = avgRec > 0 ? `${avgRec}m` : "--";

    // 4. Histogram Renderelés (Utolsó 5 óra a pótolt adatok alapján)
    const histContainer = document.getElementById('histogram');
    histContainer.innerHTML = ''; 
    for (let i = 4; i >= 0; i--) {
        const startIdx = Math.max(0, stitchedHistory.length - (i + 1) * 60);
        const endIdx = Math.max(0, stitchedHistory.length - i * 60);
        let avg = 0;
        if (startIdx !== endIdx) {
            const block = stitchedHistory.slice(startIdx, endIdx);
            avg = block.reduce((sum, ep) => sum + ep.s, 0) / block.length;
        }
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = `${Math.max(2, avg)}%`;
        bar.style.backgroundColor = avg >= 80 ? 'var(--accent-green)' : (avg > 40 ? 'var(--accent-yellow)' : 'var(--accent-red)');
        histContainer.appendChild(bar);
    }

    // 5. Burnout Alert (Utolsó 3 óra a pótolt adatok alapján)
    const alertMsg = document.getElementById('alert-msg');
    const last3Hours = stitchedHistory.slice(-18
                        
