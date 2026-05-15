/**
 * Spatial Logic v0.9 - Sensor Fix (Full Replace)
 */

const CONFIG = {
    k: 5.0,             // Magas érzékenység a mobil teszthez
    windowSize: 60,     // Adatablak mérete
    sampleRate: 50,     // ms
    lowPassAlpha: 0.2   // Szűrés mértéke
};

let sensorData = { gyroX: [], gyroY: [] };
let lastStability = 100;
let isRunning = false;

// UI Elemek hivatkozásai
const stabilityEl = document.getElementById('stability-value');
const stateEl = document.getElementById('state-label');
const widgetEl = document.querySelector('.widget');
const pulseEl = document.getElementById('focus-indicator');
const overlay = document.getElementById('overlay-msg');

/**
 * FŐ INDÍTÓ GOMB LOGIKA
 */
window.addEventListener('click', function() {
    if (isRunning) return;
    
    overlay.innerText = "Szenzorok inicializálása...";

    // 1. iOS / Safari specifikus engedélykérés
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(permission => {
                if (permission === 'granted') {
                    setupListeners();
                } else {
                    overlay.innerText = "HIBA: Szenzor elutasítva!";
                }
            })
            .catch(err => {
                overlay.innerText = "HIBA: " + err.message;
            });
    } else {
        // 2. Android vagy asztali böngésző
        setupListeners();
    }
});

/**
 * Eseménykezelők feliratkoztatása
 */
function setupListeners() {
    // Mobil böngészőkben a devicemotion az elsődleges forrás
    window.addEventListener('devicemotion', handleMotion, true);
    
    // Biztonsági tartalék (egyes böngészők ezt jobban szeretik)
    window.addEventListener('deviceorientation', (e) => {
        if(!isRunning) {
            isRunning = true;
            overlay.style.display = 'none';
        }
    }, true);

    overlay.innerText = "AKTÍV - Mozgasd a telefont!";
    
    // Ha 3 mp után sem jön adat, hibaüzenet
    setTimeout(() => {
        if(sensorData.gyroX.length === 0) {
            overlay.innerText = "Nincs adat. Ellenőrizd a böngésző beállításait!";
        } else {
            overlay.style.display = 'none';
        }
    }, 3000);
}

/**
 * Nyers adatok feldolgozása
 */
function handleMotion(event) {
    const rot = event.rotationRate;
    if (!rot) return;

    // Különböző böngészők más-más tengelyneveket használnak (alpha/beta/gamma)
    const x = rot.alpha || rot.x || 0;
    const y = rot.beta || rot.y || 0;
    
    if (x === 0 && y === 0) return; // Ne dolgozzunk üres adattal

    isRunning = true;
    
    const filteredX = filter(x, sensorData.gyroX);
    const filteredY = filter(y, sensorData.gyroY);
    
    sensorData.gyroX.push(filteredX);
    sensorData.gyroY.push(filteredY);
    
    // Adatablak kezelése
    if (sensorData.gyroX.length > CONFIG.windowSize) {
        sensorData.gyroX.shift();
        sensorData.gyroY.shift();
        calculateStability();
    }
}

/**
 * Aluláteresztő szűrő a jitter ellen
 */
function filter(val, arr) {
    if (arr.length === 0) return val;
    return CONFIG.lowPassAlpha * val + (1 - CONFIG.lowPassAlpha) * arr[arr.length - 1];
}

/**
 * Stabilitási algoritmus
 */
function calculateStability() {
    const varX = getVariance(sensorData.gyroX);
    const varY = getVariance(sensorData.gyroY);
    const combinedStd = Math.sqrt(varX + varY);
    
    // S = 100 * e^(-k * sigma)
    const stability = Math.round(100 * Math.exp(-CONFIG.k * combinedStd));
    updateUI(stability);
}

/**
 * Variancia számítás
 */
function getVariance(arr) {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b) / arr.length;
    return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
}

/**
 * HUD vizuális frissítése
 */
function updateUI(s) {
    lastStability = s;
    stabilityEl.innerText = `${s}%`;
    
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
        pulseEl.classList.add('pulse-active');
    }
}

/**
 * Adatmentés LocalStorage-ba (5 percenként)
 */
function saveState() {
    try {
        const log = JSON.parse(localStorage.getItem('spatial_logic_log') || '[]');
        log.push({
            t: new Date().toISOString(),
            s: lastStability
        });
        if (log.length > 100) log.shift();
        localStorage.setItem('spatial_logic_log', JSON.stringify(log));
    } catch(e) { console.error("Save error", e); }
}

setInterval(saveState, 300000);
