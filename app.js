/**
 * Spatial Logic v1.1 - Professional Tier
 * Focus: Background Stability & Data Integrity
 */

const CONFIG = {
    K_FACTOR: 0.5,
    EPOCH_THRESHOLD_MINS: 180, // 3 óra a validációhoz
    STITCH_THRESHOLD_MS: 120000 // 2 perc feletti lyuknál interpolál
};

let spatialData = JSON.parse(localStorage.getItem('sl_data')) || [];

// --- 1. GEOLOCATION HEARTBEAT (iOS Background Stability) ---
function initBackgroundHeartbeat() {
    if ("geolocation" in navigator) {
        // Alacsony pontosságú GPS kérés, ami életben tartja a JS szálat zsebben is
        navigator.geolocation.watchPosition(
            () => { console.log("Heartbeat: Active"); },
            (err) => { console.warn("Heartbeat notice: GPS restricted, fallback to standard sensors."); },
            { enableHighAccuracy: false, maximumAge: 60000, timeout: 55000 }
        );
    }
}

// --- 2. CORE ALGORITHM (Stability calculation) ---
function calculateStability(samples) {
    if (samples.length < 5) return 0;
    const values = samples.map(s => Math.sqrt(s.x**2 + s.y**2 + s.z**2));
    const mean = values.reduce((a, b) => a + b) / values.length;
    const sigma = Math.sqrt(values.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / values.length);
    
    // Formula: Stability = 100 * e^(-k * sigma)
    return Math.round(100 * Math.exp(-CONFIG.K_FACTOR * sigma));
}

// --- 3. ALGORITHMIC STITCHING (Data Gap Handling) ---
function getStitchedData(rawEntries) {
    if (rawEntries.length < 2) return rawEntries;
    
    let stitched = [];
    for (let i = 0; i < rawEntries.length - 1; i++) {
        stitched.push(rawEntries[i]);
        
        let currentGap = rawEntries[i+1].ts - rawEntries[i].ts;
        if (currentGap > CONFIG.STITCH_THRESHOLD_MS && currentGap < 3600000) { // 1 órán belüli lyuk pótlása
            let gapCount = Math.floor(currentGap / 60000);
            for (let j = 1; j <= gapCount; j++) {
                stitched.push({
                    ts: rawEntries[i].ts + (j * 60000),
                    val: (rawEntries[i].val + rawEntries[i+1].val) / 2, // Interpolált átlag
                    isEstimated: true
                });
            }
        }
    }
    stitched.push(rawEntries[rawEntries.length - 1]);
    return stitched;
}

// --- 4. UI RENDERING (Display Optimized) ---
function updateDashboard() {
    const stitched = getStitchedData(spatialData);
    const latest = stitched[stitched.length - 1];
    
    // UI Frissítés (Példa a képernyőképed alapján)
    document.getElementById('flow-val').innerText = `${latest ? latest.val : 0}%`;
    
    renderGraph(stitched);
}

function renderGraph(data) {
    const canvas = document.getElementById('loadGraph');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Itt a stitched adatokat használjuk, ahol az isEstimated halványabb színű
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    data.slice(-300).forEach((point, i) => {
        ctx.fillStyle = point.isEstimated ? '#1a3326' : '#00ff88'; // Halványabb zöld a pótolt adathoz
        const height = (point.val / 100) * canvas.height;
        ctx.fillRect(i * 2, canvas.height - height, 1.5, height);
    });
}

// --- INITIALIZATION ---
window.addEventListener('devicemotion', (event) => {
    const acc = event.accelerationIncludingGravity;
    // Adatgyűjtési logika ide...
});

initBackgroundHeartbeat();
setInterval(updateDashboard, 60000); // Percenkénti frissítés
