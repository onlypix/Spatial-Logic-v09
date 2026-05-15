/**
 * Spatial Logic v0.9 - Pro Sensor Engine (Accel + Debug)
 */

const CONFIG = {
    k: 0.5,             // Kalibráció gyorsulás adatokhoz
    windowSize: 40,     // Gyorsabb reakcióidő
    sampleRate: 50,
    lowPassAlpha: 0.3
};

let sensorData = { x: [], y: [], z: [] };
let lastStability = 100;
let isRunning = false;

const stabilityEl = document.getElementById('stability-value');
const stateEl = document.getElementById('state-label');
const widgetEl = document.querySelector('.widget');
const pulseEl = document.getElementById('focus-indicator');
const overlay = document.getElementById('overlay-msg');

window.addEventListener('click', async function() {
    if (isRunning) return;
    
    overlay.innerText = "Szenzor kérés indítása...";

    try {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission === 'granted') {
                initSensors();
            } else {
                overlay.innerText = "HIBA: Engedély elutasítva.";
            }
        } else {
            initSensors();
        }
    } catch (err) {
        overlay.innerText = "Kivétel: " + err.message;
    }
});

function initSensors() {
    window.addEventListener('devicemotion', handleMotion, true);
    overlay.style.backgroundColor = "rgba(0, 0, 150, 0.8)"; // Kék háttér = Aktív
    overlay.innerText = "Szenzor figyelése... (Mozgasd a gépet)";
    isRunning = true;
}

function handleMotion(event) {
    let acc = event.accelerationIncludingGravity || event.acceleration;
    
    // DEBUG: Kiírjuk a képernyőre, hogy jön-e adat
    if (!acc || (acc.x === null && acc.y === null)) {
        overlay.innerText = "Nincs gyorsulás adat a böngészőtől.";
        return;
    }

    const x = acc.x || 0;
    const y = acc.y || 0;
    const z = acc.z || 0;

    // Ha jön adat, eltüntetjük az overlay-t
    if (overlay.style.display !== 'none') {
        overlay.style.display = 'none';
    }

    processData(x, y, z);
}

function processData(x, y, z) {
    const fX = filter(x, sensorData.x);
    const fY = filter(y, sensorData.y);
    const fZ = filter(z, sensorData.z);
    
    sensorData.x.push(fX);
    sensorData.y.push(fY);
    sensorData.z.push(fZ);
    
    if (sensorData.x.length > CONFIG.windowSize) {
        sensorData.x.shift();
        sensorData.y.shift();
        sensorData.z.shift();
        calculateStability();
    }
}

function filter(val, arr) {
    if (arr.length === 0) return val;
    return CONFIG.lowPassAlpha * val + (1 - CONFIG.lowPassAlpha) * arr[arr.length - 1];
}

function calculateStability() {
    const varX = getVariance(sensorData.x);
    const varY = getVariance(sensorData.y);
    const varZ = getVariance(sensorData.z);
    
    // A gyorsulás szórásának összessége adja a mozgás intenzitását
    const combinedVariance = varX + varY + varZ;
    const combinedStd = Math.sqrt(combinedVariance);
    
    // Algoritmus: Ha nincs mozgás (csak gravitáció), a szórás közel 0.
    const stability = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-CONFIG.k * combinedStd))));
    
    updateUI(stability);
}

function getVariance(arr) {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b) / arr.length;
    return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
}

function updateUI(s) {
    lastStability = s;
    stabilityEl.innerText = `${s}%`;
    
    if (s > 80) {
        stateEl.innerText = "FLOW";
        widgetEl.style.borderRightColor = "var(--accent-green)";
        pulseEl.classList.remove('pulse-active');
    } else if (s > 40) {
        stateEl.innerText = "STABLE";
        widgetEl.style.borderRightColor = "var(--accent-yellow)";
        pulseEl.classList.remove('pulse-active');
    } else {
        stateEl.innerText = "FATIGUE";
        widgetEl.style.borderRightColor = "var(--accent-red)";
        pulseEl.classList.add('pulse-active');
    }
        }
