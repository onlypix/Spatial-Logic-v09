/**
 * Spatial Logic v0.9 - Core Engine
 * IMU Processzor és Kognitív Dashboard
 */

const CONFIG = {
    k: 1.5,            // Kalibrációs konstans
    windowSize: 60,     // 60 minta (~3-5 mp 20Hz-en)
    sampleRate: 50,     // ms
    lowPassAlpha: 0.2   // Zajszűrés
};

let sensorData = { gyroX: [], gyroY: [] };
let lastStability = 100;
let isRunning = false;

// UI Elemek
const stabilityEl = document.getElementById('stability-value');
const stateEl = document.getElementById('state-label');
const widgetEl = document.querySelector('.widget');
const pulseEl = document.getElementById('focus-indicator');
const overlay = document.getElementById('overlay-msg');

/**
 * Inicializálás - User Interaction szükséges a szenzorokhoz
 */
window.addEventListener('click', async () => {
    if (isRunning) return;
    
    try {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') throw new Error('Permission denied');
        }
        
        window.addEventListener('devicemotion', handleMotion);
        isRunning = true;
        overlay.style.display = 'none';
        console.log("Spatial Logic Engine Started");
        
        // Mentési ciklus (5 percenként)
        setInterval(saveState, 300000);
        
    } catch (e) {
        overlay.innerText = "Error: " + e.message;
    }
});

/**
 * IMU Adatkezelés és Zajszűrés
 */
function handleMotion(event) {
    const { x, y } = event.rotationRate;
    
    // Egyszerű Low-pass filter a jitter csökkentésére
    const filteredX = filter(x || 0, sensorData.gyroX);
    const filteredY = filter(y || 0, sensorData.gyroY);
    
    sensorData.gyroX.push(filteredX);
    sensorData.gyroY.push(filteredY);
    
    if (sensorData.gyroX.length > CONFIG.windowSize) {
        sensorData.gyroX.shift();
        sensorData.gyroY.shift();
        calculateStability();
    }
}

function filter(val, arr) {
    if (arr.length === 0) return val;
    return CONFIG.lowPassAlpha * val + (1 - CONFIG.lowPassAlpha) * arr[arr.length - 1];
}

/**
 * Kognitív Stabilitási Algoritmus (S)
 */
function calculateStability() {
    const varX = getVariance(sensorData.gyroX);
    const varY = getVariance(sensorData.gyroY);
    const combinedStd = Math.sqrt(varX + varY);
    
    // S = 100 * e^(-k * sigma)
    const stability = Math.round(100 * Math.exp(-CONFIG.k * combinedStd));
    updateUI(stability);
}

function getVariance(arr) {
    const mean = arr.reduce((a, b) => a + b) / arr.length;
    return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
}

/**
 * HUD Frissítés
 */
function updateUI(s) {
    lastStability = s;
    stabilityEl.innerText = `${s}%`;
    
    // Színkódolás és Állapot
    if (s > 80) {
        stateEl.innerText = "FLOW";
        widgetEl.style.borderRightColor = "var(--accent-green)";
        pulseEl.classList.remove('pulse-active');
    } else if (s > 50) {
        stateEl.innerText = "STABLE";
        widgetEl.style.borderRightColor = "var(--accent-yellow)";
        pulseEl.classList.remove('pulse-active');
    } else {
        stateEl.innerText = "FATIGUE";
        widgetEl.style.borderRightColor = "var(--accent-red)";
        pulseEl.classList.add('pulse-active'); // Légzéssegítő aktiválása
    }
}

/**
 * LocalStorage Adatmentés (Evening Review előkészítés)
 */
function saveState() {
    const log = JSON.parse(localStorage.getItem('spatial_logic_log') || '[]');
    log.push({
        t: new Date().toISOString(),
        s: lastStability
    });
    // Csak az utolsó 100 mérést tartjuk meg v0.9-ben
    if (log.length > 100) log.shift();
    localStorage.setItem('spatial_logic_log', JSON.stringify(log));
}
