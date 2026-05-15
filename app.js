/**
 * Spatial Logic v1.0 - Core Engine & Dashboard Layer
 */

const CONFIG = {
    k: 0.5,
    windowSize: 40,
    lowPassAlpha: 0.3,
    epochMs: 60000,         // 1 perc per epoch
    maxEpochs: 2880         // 48 óra (2880 perc) perzisztencia
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

    // Egyszerű trend nyíl az utolsó mentett értékhez képest
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
 * DASHBOARD & LAZY PROCESSING
 */
function openDashboard() {
    if (hudWidget.classList.contains('full-view')) return; // Már nyitva van

    // Váltás
    hudWidget.classList.replace('mini-view', 'full-view');
    dashContent.style.display = 'block';

    // Adatok Lazy számolása és renderelése
    processAndRenderDashboard();

    // Auto-bezárás 5 másodperc után
    setTimeout(() => {
        hudWidget.classList.replace('full-view', 'mini-view');
        dashContent.style.display = 'none';
    }, 5000);
}

function processAndRenderDashboard() {
    if (cognitiveHistory.length === 0) return;

    // 1. Flow Index
    const flowCount = cognitiveHistory.filter(ep => ep.s >= 80).length;
    const flowIdx = Math.round((flowCount / cognitiveHistory.length) * 100);
    document.getElementById('kpi-flow').innerText = `${flowIdx}%`;

    // 2. Recovery Rate (Becslés Fatigue állapotokból Flow-ba térés átlagos idejéből)
    let recoveryMins = 0;
    let recoveryEvents = 0;
    let fatigueStart = null;
    
    for (let i = 0; i < cognitiveHistory.length; i++) {
        if (cognitiveHistory[i].s <= 40 && fatigueStart === null) {
            fatigueStart = i;
        } else if (cognitiveHistory[i].s >= 80 && fatigueStart !== null) {
            recoveryMins += (i - fatigueStart);
            recoveryEvents++;
            fatigueStart = null;
        }
    }
    const avgRec = recoveryEvents > 0 ? Math.round(recoveryMins / recoveryEvents) : 0;
    document.getElementById('kpi-recovery').innerText = avgRec > 0 ? `${avgRec}m` : "--";

    // 3. Histogram (Utolsó 5 óra = max 300 adatpont, 5 oszlopban = 60 perc/oszlop)
    const histContainer = document.getElementById('histogram');
    histContainer.innerHTML = ''; // Clear old
    
    for (let i = 4; i >= 0; i--) {
        const startIdx = Math.max(0, cognitiveHistory.length - (i + 1) * 60);
        const endIdx = Math.max(0, cognitiveHistory.length - i * 60);
        
        let avg = 0;
        if (startIdx !== endIdx) {
            const block = cognitiveHistory.slice(startIdx, endIdx);
            avg = block.reduce((sum, ep) => sum + ep.s, 0) / block.length;
        }

        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = `${Math.max(2, avg)}%`; // Min 2% hogy látszódjon a vonal
        bar.style.backgroundColor = avg >= 80 ? 'var(--accent-green)' : (avg > 40 ? 'var(--accent-yellow)' : 'var(--accent-red)');
        histContainer.appendChild(bar);
    }

    // 4. Burnout Alert (Utolsó 3 óra tendenciája)
    const alertMsg = document.getElementById('alert-msg');
    const last3Hours = cognitiveHistory.slice(-180);
    
    if (last3Hours.length >= 60) {
        const recentAvg = last3Hours.reduce((sum, ep) => sum + ep.s, 0) / last3Hours.length;
        if (recentAvg < 40) {
            alertMsg.innerText = "Riasztás: Kognitív túlterhelés (Burnout kockázat)";
            alertMsg.style.color = "var(--accent-red)";
        } else {
            alertMsg.innerText = "Stabilitás megfelelő.";
            alertMsg.style.color = "var(--accent-green)";
        }
    } else {
        alertMsg.innerText = "Nincs elég adat az elemzéshez.";
    }
        }
    
