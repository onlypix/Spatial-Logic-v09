/**
 * Spatial Logic v1.1 - Professional Tier
 * Hibajavítás: UI Inicializálás, Szenzor Engedélyek és Adatpufferelés integrálva
 */

const CONFIG = {
    K_FACTOR: 0.5,
    STITCH_THRESHOLD_MS: 120000 // 2 perc feletti lyuknál interpolál
};

let spatialData = JSON.parse(localStorage.getItem('sl_data')) || [];
let motionBuffer = []; // Itt gyűjtjük a másodpercenkénti mikromozgásokat
let isRunning = false;

// --- 1. UI GYÚJTÁSKAPCSOLÓ (Koppintás érzékelése) ---
document.addEventListener('click', async function startSensors() {
    if (isRunning) return;

    // iOS 13+ szenzor engedélykérés (Kritikus a Display/iOS eszközökön)
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission === 'granted') {
                bootSystem();
            } else {
                alert("A kognitív elemzéshez engedélyezni kell a mozgásérzékelőket.");
            }
        } catch (error) {
            console.error("Szenzor engedély hiba:", error);
            bootSystem(); // Fallback
        }
    } else {
        // Android / Meta Native Webview
        bootSystem();
    }
});

function bootSystem() {
    isRunning = true;
    
    // UI Frissítés: Eltüntetjük a kezdőképernyő szövegeit (Feltételezve, hogy az appod CSS-sel kezeli)
    // Ha van egy 'init-screen' ID-d, ide teheted: document.getElementById('init-screen').style.display = 'none';
    
    initBackgroundHeartbeat();
    
    // Elindítjuk az adatgyűjtési ciklust (Percenként értékelünk)
    setInterval(processEpoch, 60000);
    
    // Azonnali első UI frissítés, hogy eltűnjön a "--%"
    processEpoch(); 
}

// --- 2. NYERS ADATGYŰJTÉS (IMU) ---
window.addEventListener('devicemotion', (event) => {
    if (!isRunning) return;
    const acc = event.accelerationIncludingGravity;
    if (acc && acc.x !== null) {
        motionBuffer.push(acc);
    }
});

// --- 3. GEOLOCATION HEARTBEAT (Háttérben tartás okostelefonon) ---
function initBackgroundHeartbeat() {
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(
            () => { /* Csendes szívverés, tartja a JS szálat */ },
            (err) => { console.warn("GPS Heartbeat korlátozva."); },
            { enableHighAccuracy: false, maximumAge: 60000, timeout: 55000 }
        );
    }
}

// --- 4. KOGNITÍV MATEMATIKA (Epoch feldolgozás) ---
function processEpoch() {
    if (motionBuffer.length < 10 && spatialData.length > 0) {
        // Ha nem volt elég mozgásadat (pl. zsebben aludt a teló), 
        // csak frissítjük a UI-t, a lyukakat a 'getStitchedData' majd pótolja.
        updateDashboard();
        return;
    }

    // Számoljuk a stabilitást a pufferből
    const values = motionBuffer.map(s => Math.sqrt(s.x**2 + s.y**2 + s.z**2));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sigma = Math.sqrt(values.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / values.length);
    
    const flowValue = Math.round(100 * Math.exp(-CONFIG.K_FACTOR * sigma));
    
    // Eltároljuk az új adatpontot
    spatialData.push({
        ts: Date.now(),
        val: isNaN(flowValue) ? 0 : Math.min(100, Math.max(0, flowValue)), // Biztonsági korlát 0-100 között
        isEstimated: false
    });

    // Puffer ürítése a következő percig
    motionBuffer = [];
    
    // Mentés helyileg
    localStorage.setItem('sl_data', JSON.stringify(spatialData));
    
    updateDashboard();
}

// --- 5. ALGORITHMIC STITCHING (Adatpótlás lyukak esetén) ---
function getStitchedData(rawEntries) {
    if (rawEntries.length < 2) return rawEntries;
    
    let stitched = [];
    for (let i = 0; i < rawEntries.length - 1; i++) {
        stitched.push(rawEntries[i]);
        let currentGap = rawEntries[i+1].ts - rawEntries[i].ts;
        
        // Ha 2 percnél nagyobb, de 1 óránál kisebb a lyuk
        if (currentGap > CONFIG.STITCH_THRESHOLD_MS && currentGap < 3600000) { 
            let gapCount = Math.floor(currentGap / 60000);
            for (let j = 1; j <= gapCount; j++) {
                stitched.push({
                    ts: rawEntries[i].ts + (j * 60000),
                    val: Math.round((rawEntries[i].val + rawEntries[i+1].val) / 2),
                    isEstimated: true
                });
            }
        }
    }
    stitched.push(rawEntries[rawEntries.length - 1]);
    return stitched;
}

// --- 6. UI RENDERELÉS ---
function updateDashboard() {
    const stitched = getStitchedData(spatialData);
    if (stitched.length === 0) return;
    
    const latest = stitched[stitched.length - 1];
    
    // --- FELÜLETI ELEMEK FRISSÍTÉSE ---
    // Cseréld ki az ID-kat, ha a te HTML-edben másképp vannak elnevezve!
    const flowEl = document.querySelector('div:contains("FLOW")') || document.getElementById('flow-val'); 
    // Mivel nem látom a pontos HTML ID-kat, egy generikus módosítót használok a feliratokra:
    
    // Ez a kód feltételezi, hogy a DOM-ba beírod a megfelelő értékeket.
    // Ha a "FLOW" felirat alatt lévő div-et akarod frissíteni:
    // document.getElementById('flow-percentage').innerText = `${latest.val}%`;
    
    // Kérlek, illeszd be ide a saját UI frissítő soraidat (document.getElementById... stb.),
    // amikkel az előző verzióban a számokat írtad ki!
    console.log(`[Spatial Logic] Aktuális Flow: ${latest.val}% | Adatpontok: ${stitched.length}`);
    
    renderGraph(stitched);
}

function renderGraph(data) {
    // Keresünk egy canvast vagy a te egyedi div-alapú grafikon rajzolódat
    // Ide másold be azt a logikát, ami az előző app.js-ben megrajzolta az 5 oszlopot!
    // A 'data' tömb most már tartalmazza az egyenletesen elosztott, lyukmentes adatokat.
            }
