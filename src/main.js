import PocketBase from 'pocketbase';

// Sostituisci con l'IP corretto del tuo server PocketBase
const pb = new PocketBase('http://192.168.0.169:8090'); 
pb.autoCancellation(false);

let map = null;
let terremotiLayer = null;
let earthquakeMarkers = [];

// Riferimenti DOM
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const showRegister = document.getElementById("showRegister");
const showLogin = document.getElementById("showLogin");
const loginContainer = document.getElementById("loginContainer");
const appContainer = document.getElementById("app");
const logoutBtn = document.getElementById("logoutBtn");
const layerMenu = document.getElementById("layerMenu");
const legendCollapse = document.getElementById("legendCollapse");
const earthquakeList = document.getElementById("earthquakeList");
const earthquakeListDropdown = document.getElementById("earthquakeListDropdown");
const magFilter = document.getElementById('magFilter');
const magValueDisplay = document.getElementById('magValue');

// Funzione per mostrare l'app dopo il login
function showApp() {
    loginContainer.style.display = "none";
    appContainer.style.display = "block";
    initMapAndFetch();
}

// Controllo sessione esistente
if(pb.authStore.isValid) showApp();

// --- GESTIONE AUTENTICAZIONE ---
logoutBtn?.addEventListener("click", () => { 
    pb.authStore.clear(); 
    location.reload(); 
});

showRegister?.addEventListener("click", e => { 
    e.preventDefault(); 
    loginForm.style.display = "none"; 
    registerForm.style.display = "block"; 
});

showLogin?.addEventListener("click", e => { 
    e.preventDefault(); 
    loginForm.style.display = "block"; 
    registerForm.style.display = "none"; 
});

loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
        await pb.collection("users").authWithPassword(
            document.getElementById("email").value, 
            document.getElementById("password").value
        );
        showApp();
    } catch(err) { alert("Credenziali errate."); }
});

registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;
    const passwordConfirm = document.getElementById("regPasswordConfirm").value;
    
    if (password !== passwordConfirm) return alert("Le password non corrispondono.");
    
    try {
        await pb.collection("users").create({ email, password, passwordConfirm });
        alert("Registrazione completata! Ora puoi accedere.");
        location.reload();
    } catch(err) { alert(err.message); }
});

// --- LOGICA MAPPA E TERREMOTI ---

function getColor(mag) {
    if (mag >= 6) return "#ff0000"; // Rosso
    if (mag >= 5) return "#ff4500"; // Arancio scuro
    if (mag >= 4) return "#ff8c00"; // Arancio
    if (mag >= 3) return "#ffa500"; // Arancio chiaro
    return "#ffff00";               // Giallo
}

function getRadiusByMagAndColor(mag) {
    let base = 5000;
    if (mag >= 6) return (base * mag) * 2.5;
    if (mag >= 5) return (base * mag) * 1.8;
    return base * mag;
}

function populateEarthquakeList(terremoti) {
    if (!earthquakeList) return;
    let listHTML = `<li class="p-2 text-xs opacity-60 bg-base-200 font-bold uppercase tracking-widest">Ultime scosse (${terremoti.length})</li>`;
    
    terremoti.forEach(t => {
        const [lng, lat] = t.geometry.coordinates;
        listHTML += `
            <li class="cursor-pointer hover:bg-base-200 transition-colors" data-lat="${lat}" data-lng="${lng}">
                <div class="flex items-center gap-2 p-2">
                    <span class="badge badge-sm font-bold border-none" style="background:${getColor(t.properties.mag)}; color:white">
                        ${t.properties.mag.toFixed(1)}
                    </span>
                    <span class="truncate text-xs font-medium">${t.properties.place}</span>
                </div>
            </li>`;
    });
    
    earthquakeList.innerHTML = listHTML;
    earthquakeList.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            if(li.dataset.lat) {
                map.setView([li.dataset.lat, li.dataset.lng], 8);
                earthquakeListDropdown?.removeAttribute('open');
            }
        });
    });
}

async function saveTerremotoUpsert(data) {
    try {
        const res = await pb.collection('terremoti').getList(1, 1, { filter: `usgs_id = "${data.usgs_id}"` });
        if (res.totalItems === 0) await pb.collection('terremoti').create(data);
        else await pb.collection('terremoti').update(res.items[0].id, data);
    } catch (e) { console.error("PocketBase Sync Error", e); }
}

async function initMapAndFetch() {
    if (map) return;
    
    // Inizializza mappa
    map = L.map('map', { zoomControl: false }).setView([20, 0], 2);
    L.control.zoom({ position: 'topleft' }).addTo(map);

    const satelliteTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    const labelsTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}');
    const satelliteGroup = L.layerGroup([satelliteTile, labelsTile]);
    const geographicTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}');

    let currentBaseLayer = satelliteGroup.addTo(map);

    // Cambio Layer
    layerMenu?.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a && a.dataset.layer) {
            map.removeLayer(currentBaseLayer);
            currentBaseLayer = (a.dataset.layer === 'satellite') ? satelliteGroup : geographicTile;
            currentBaseLayer.addTo(map);
            layerMenu.closest('details')?.removeAttribute('open');
        }
    });

    try {
        const res = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson");
        const body = await res.json();
        terremotiLayer = L.layerGroup().addTo(map);

        for (const t of body.features) {
            const [lng, lat, depth] = t.geometry.coordinates;
            const mag = t.properties.mag;
            const color = getColor(mag);
            const date = new Date(t.properties.time).toLocaleString('it-IT');

            // --- POPUP ARRICCHITO ---
            const popupContent = `
                <div class="space-y-2 min-w-[150px]">
                    <h3 class="font-bold text-sm border-b pb-1" style="color:${color}">${t.properties.place}</h3>
                    <div class="text-[11px] space-y-1">
                        <p><span class="opacity-60">Magnitudo:</span> <b style="color:${color}">${mag.toFixed(1)}</b></p>
                        <p><span class="opacity-60">Data/Ora:</span> <b>${date}</b></p>
                        <p><span class="opacity-60">Profondità:</span> <b>${depth} km</b></p>
                    </div>
                    <a href="${t.properties.url}" target="_blank" class="btn btn-xs btn-primary btn-block text-white mt-1 shadow-sm">
                        Dettagli USGS <i class="bi bi-box-arrow-up-right ml-1"></i>
                    </a>
                </div>
            `;

            const circle = L.circle([lat, lng], {
                color: color, 
                fillColor: color, 
                fillOpacity: 0.6,
                radius: getRadiusByMagAndColor(mag)
            }).addTo(terremotiLayer).bindPopup(popupContent);

            earthquakeMarkers.push({ layer: circle, mag: mag });

            // Sync con PocketBase
            await saveTerremotoUpsert({
                usgs_id: t.id, 
                magnitudo: mag, 
                luogo: t.properties.place,
                latitudine: lat, 
                longitudine: lng, 
                profondita: depth,
                DateTime: new Date(t.properties.time).toISOString()
            });
        }
        populateEarthquakeList(body.features);
    } catch(err) { console.error("Fetch Error:", err); }

    // Filtro Magnitudo
    magFilter?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (magValueDisplay) magValueDisplay.innerText = val;
        terremotiLayer.clearLayers();
        earthquakeMarkers.forEach(m => { 
            if(m.mag >= val) terremotiLayer.addLayer(m.layer); 
        });
    });

    document.getElementById('magFilterReset')?.addEventListener('click', () => {
        magFilter.value = 0;
        magValueDisplay.innerText = "0";
        terremotiLayer.clearLayers();
        earthquakeMarkers.forEach(m => terremotiLayer.addLayer(m.layer));
    });

    // --- LEGENDA COLORATA ---
    if (legendCollapse) {
        legendCollapse.innerHTML = `
            <b class="block mb-2 border-b pb-1 text-[10px] uppercase opacity-60 tracking-wider">Legenda Magnitudo</b>
            <div class="space-y-1">
                ${[2, 3, 4, 5, 6].map(m => {
                    const color = getColor(m);
                    return `
                        <div class="flex items-center gap-2">
                            <i style="background:${color}; width:10px; height:10px; border-radius:50%; display:inline-block; border: 1px solid rgba(0,0,0,0.1);"></i> 
                            <span class="font-bold text-[11px]" style="color:${color}">M ${m}+</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
}