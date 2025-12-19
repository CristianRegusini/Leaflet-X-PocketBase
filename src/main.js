import PocketBase from 'pocketbase';
 
// --- CONFIGURAZIONE POCKETBASE ---
// La tua macchina
const pb = new PocketBase('http://192.168.0.170:8090'); // cambia con il tuo indirizzo IP locale
pb.autoCancellation(false);
 
// Variabile globale per l'istanza della mappa
let map = null;
// Layer e marker per i terremoti (usati dal filtro)
let terremotiLayer = null;
let earthquakeMarkers = [];
let currentMinMag = 0;
 
// Mantieni la sessione
pb.authStore.loadFromCookie(document.cookie);
pb.authStore.onChange(() => {
    document.cookie = pb.authStore.exportToCookie();
});
 
// --- ELEMENTI DOM ---
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const showRegister = document.getElementById("showRegister");
const showLogin = document.getElementById("showLogin");
const loginContainer = document.getElementById("loginContainer");
const appContainer = document.getElementById("app");
const logoutBtn = document.getElementById("logoutBtn");
const layerMenu = document.getElementById("layerMenu"); // Il menu <ul> DaisyUI
const legendCollapse = document.getElementById("legendCollapse"); // Elemento Collapse per la legenda
const earthquakeList = document.getElementById("earthquakeList"); // NUOVO: Elemento ul per la lista
const earthquakeListDropdown = document.getElementById("earthquakeListDropdown"); // NUOVO: Elemento details del dropdown
 
// --- MOSTRA APP SE LOGGATO ---
function showApp() {
    loginContainer.style.display = "none";
    appContainer.style.display = "block";
 
    try {
        initMapAndFetch();
    } catch(err) {
        // Controllo specifico per l'errore Leaflet
        const errorMsg = (typeof L === 'undefined') ? "Leaflet (la libreria mappe) non è stata caricata correttamente." : "Impossibile caricare la mappa.";
        console.error("Errore nell'inizializzazione della mappa:", err);
        alert(errorMsg + " Controlla la console.");
    }
}
 
// Verifica all'avvio
if(pb.authStore.isValid){
    showApp();
}
 
// --- SWITCH LOGIN / REGISTRAZIONE ---
showRegister.addEventListener("click", e => {
    e.preventDefault();
    loginForm.style.display = "none";
    registerForm.style.display = "block";
});
 
showLogin.addEventListener("click", e => {
    e.preventDefault();
    loginForm.style.display = "block";
    registerForm.style.display = "none";
});
 
// --- FORM REGISTRAZIONE ---
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;
    const passwordConfirm = document.getElementById("regPasswordConfirm").value;
 
    // Validazioni client-side: lunghezza minima e conferma
    if (password.length < 8) {
        alert("La password deve contenere almeno 8 caratteri.");
        return;
    }
    if (password !== passwordConfirm) {
        alert("Le password non corrispondono.");
        return;
    }
 
    try{
        await pb.collection("users").create({
            email,
            password,
            passwordConfirm
        });
        alert("Registrazione completata! Ora effettua il login.");
        registerForm.style.display = "none";
        loginForm.style.display = "block";
    } catch(err){
        alert("Errore di registrazione: "+err.message);
    }
});
 
// --- FORM LOGIN (Con Debug Migliorato) ---
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    // Validazione client-side: richiesta lunghezza minima per evitare invii inutili
    if (password.length < 8) {
        alert("La password deve contenere almeno 8 caratteri.");
        return;
    }
 
    try{
        await pb.collection("users").authWithPassword(email,password);
        showApp();
    } catch(err){
        console.error("Errore di autenticazione:", err);
 
        // Debug: Visualizza il messaggio specifico di PocketBase
        if (err.data && err.data.message) {
             alert("Errore di accesso: " + err.data.message);
        } else {
             alert("Credenziali errate o errore di connessione!");
        }
    }
});
 
// --- LOGOUT ---
logoutBtn.addEventListener("click", () => {
    pb.authStore.clear();
    location.reload();
});
 
// ----------------------------------------------------------------------
// --- FUNZIONI MAPPA / LOGICA TERREMOTI ---
// ----------------------------------------------------------------------
 
function calcolaRaggioTerremoto(mag, depth) {
    if (typeof mag !== 'number' || typeof depth !== 'number' || mag <= 0 || depth < 0) {
        return null;
    }
    const epicentralRadiusKm = Math.pow(10, (0.4 * mag) - 1.2);
    const radiusKm = epicentralRadiusKm + depth;
    return radiusKm * 1000;
}
 
function getColor(mag) {
    return mag >= 6 ? "#ff0000" :
           mag >= 5 ? "#ff4500" :
           mag >= 4 ? "#ff8c00" :
           mag >= 3 ? "#ffa500" :
                       "#ffff00";
}
 
function getRadiusByMagAndColor(mag) {
    let base = 5000;
    let size = base * mag;
 
    if (mag >= 6) return size * 2.5;
    if (mag >= 5) return size * 1.8;
    if (mag >= 4) return size * 1.3;
    if (mag >= 3) return size;
    return size * 0.7;
}
 
// NUOVA FUNZIONE: Popola la lista dei terremoti nel Dropdown
function populateEarthquakeList(terremoti) {
    if (!earthquakeList || !map) return;
 
    // Ordina i terremoti per magnitudo (dal più piccolo al più grande)
    const sortedTerremoti = terremoti.sort((a, b) => a.properties.mag - b.properties.mag);
 
    let listHTML = '';
 
    // Titolo della lista
    listHTML += `<li class="p-4 pb-2 text-xs opacity-60 tracking-wide bg-base-200 rounded-t-box">Ultime scosse (${sortedTerremoti.length})</li>`;
 
    sortedTerremoti.forEach(terremoto => {
        const mag = terremoto.properties.mag.toFixed(1);
        const place = terremoto.properties.place;
        const color = getColor(terremoto.properties.mag);
        const [lng, lat] = terremoto.geometry.coordinates;
 
        // Formato dell'orario
        const timeString = new Date(terremoto.properties.time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
 
        // Elemento di lista (usando list-row di DaisyUI)
        listHTML += `
            <li class="list-row hover:bg-base-200 cursor-pointer p-2"
                data-lat="${lat}" data-lng="${lng}" data-mag="${mag}">
               
                <div class="flex items-center space-x-3 w-full">
                    <div class="flex items-center space-x-1 flex-shrink-0" style="color:${color};">
                        <i style="background:${color}; width:12px; height:12px; border-radius:50%; display:inline-block;"></i>
                        <span class="font-bold text-lg">${mag}</span>
                    </div>
                   
                    <div class="flex-grow min-w-0">
                        <div class="font-medium truncate">${place}</div>
                        <div class="text-xs uppercase font-semibold opacity-60">${timeString}</div>
                    </div>
                   
                    <button class="btn btn-square btn-ghost btn-sm flex-shrink-0" title="Centra Mappa">
                        <i class="bi bi-geo-alt-fill text-lg"></i>
                    </button>
                </div>
            </li>
        `;
    });
   
    earthquakeList.innerHTML = listHTML;
 
    // Aggiungi l'evento click ai terremoti: sia sul pulsante che sulla riga intera
    earthquakeList.querySelectorAll('li').forEach(li => {
        const lat = parseFloat(li.dataset.lat);
        const lng = parseFloat(li.dataset.lng);
 
        // Funzione per centrare la mappa sul terremoto
        const centerOnEarthquake = () => {
            // Centra la mappa e imposta uno zoom appropriato
            map.setView([lat, lng], 7);
 
            // Chiude il dropdown dopo la selezione
            if (earthquakeListDropdown) {
                earthquakeListDropdown.removeAttribute('open');
            }
        };
 
        // Click sulla riga intera della lista
        li.addEventListener('click', (e) => {
            // Evita di attivare se si clicca sul pulsante (l'evento bubble è gestito dal pulsante)
            if (!e.target.closest('button')) {
                centerOnEarthquake();
            }
        });
 
        // Click sul pulsante "Centra Mappa"
        const centerButton = li.querySelector('button[title="Centra Mappa"]');
        if (centerButton) {
            centerButton.addEventListener('click', (e) => {
                e.stopPropagation();
                centerOnEarthquake();
            });
        }
    });
}
 
// Mostra/nasconde i terremoti sulla mappa in base a magnitudo minima
function filterEarthquakes(minMag) {
    if (!terremotiLayer || !Array.isArray(earthquakeMarkers)) return;
    terremotiLayer.clearLayers();
    earthquakeMarkers.forEach(item => {
        if (typeof item.mag !== 'number') return;
        if (item.mag >= minMag) {
            terremotiLayer.addLayer(item.layer);
        }
    });
}
 
 
async function saveTerremotoUpsert(data) {
    try {
        // Cerca un record esistente con lo stesso usgs_id
        const res = await pb.collection('terremoti').getList(1, 1, {
            filter: `usgs_id = "${data.usgs_id}"`
        });
 
        if (!res || res.totalItems === 0) {
            await pb.collection('terremoti').create(data);
        } else {
            const existingId = res.items[0].id;
            await pb.collection('terremoti').update(existingId, data);
        }
    } catch (error) {
        console.error(`Errore upsert PocketBase per ${data.usgs_id}:`, error?.message || error);
    }
}
 
async function initMapAndFetch(){
    if (typeof L === 'undefined') {
        throw new Error("Leaflet non è definito.");
    }
   
    // Inizializza la mappa e la assegna alla variabile globale
    map = L.map('map').setView([45.4297, 10.1861], 2);
 
    // Variabili per i layers
    let currentBaseLayer = null;
    let satelliteGroup = null;
    let geographicTile = null;
 
    // --- TILE SATELLITARE (immagini)
    const satelliteTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &copy; OSM',
        maxZoom: 19
    });
 
    // --- TILE ETICHETTE (città, nomi, strade)
   const labelsTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Labels &copy; Esri',
        maxZoom: 19,
        pane: 'overlayPane'
    });
 
    // Gruppo Satellite + Etichette
    satelliteGroup = L.layerGroup([satelliteTile, labelsTile]);
   
    // --- TILE GEOGRAFICO (MODIFICATO: Street Map Style) ---
    geographicTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
        maxZoom: 19
    });
 
    // --- FUNZIONE PER CAMBIARE IL LAYER BASE ---
    function switchBaseLayer(layerType) {
        if (currentBaseLayer) {
            map.removeLayer(currentBaseLayer);
        }

        layerMenu.querySelectorAll('a').forEach(a => {
            a.classList.remove('font-bold');
        });
 
        if (layerType === 'satellite') {
            currentBaseLayer = satelliteGroup;
            layerMenu.querySelector('[data-layer="satellite"]').classList.add('font-bold');
        } else if (layerType === 'geographic') {
            currentBaseLayer = geographicTile;
            layerMenu.querySelector('[data-layer="geographic"]').classList.add('font-bold');
        }
       
        if (currentBaseLayer) {
            currentBaseLayer.addTo(map);
        }
    }
 
    // Inizializza con il layer Satellite (o geografico se preferisci)
    switchBaseLayer('satellite');
 
 
    // --- GESTIONE DEL DROPDOWN DEI LAYERS ---
    if (layerMenu) {
        layerMenu.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.target.closest('a');
           
            if (target && target.dataset.layer) {
                switchBaseLayer(target.dataset.layer);
               
                // Chiude il dropdown dopo la selezione (DaisyUI/details element)
                const detailsElement = layerMenu.closest('details');
                if (detailsElement) {
                    detailsElement.removeAttribute('open');
                }
            }
        });
    }
 
 
    // --- FETCH TERREMOTI ---
    try {
        const resFetch = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson");
        const body = await resFetch.json();
        const terremoti = body.features;
        console.log(`Trovati ${terremoti.length} terremoti nell'ultima ora.`);
 
        // Layer che conterrà i cerchi dei terremoti (visibile/filtrabile)
        terremotiLayer = L.layerGroup().addTo(map);
        earthquakeMarkers = [];
 
        // POPOLA LA LISTA DEI TERREMOTI
        populateEarthquakeList(terremoti);
 
        // Usiamo un ciclo for...of per poter awaitare l'upsert verso PocketBase
        for (const terremoto of terremoti) {
            const [lng, lat, depth] = terremoto.geometry.coordinates;
            const mag = terremoto.properties.mag;
            const place = terremoto.properties.place;
            const time = new Date(terremoto.properties.time).toLocaleString();
 
            const raggioStimatoMetri = calcolaRaggioTerremoto(mag, depth);
 
            // --- SALVATAGGIO POCKETBASE (upsert per evitare duplicati) ---
            const data = {
                usgs_id: terremoto.id,
                magnitudo: mag,
                luogo: place,
                latitudine: lat,
                longitudine: lng,
                profondita: depth,
                DateTime: new Date(terremoto.properties.time).toISOString(),
                raggio_stimato_metri: raggioStimatoMetri
            };
 
            await saveTerremotoUpsert(data);
 
            // --- CERCHI PULSANTI CON RAGGIO VARIABILE ---
            if (raggioStimatoMetri !== null) {
                const circle = L.circle([lat, lng], {
                    color: getColor(mag),
                    fillColor: getColor(mag),
                    fillOpacity: 0.7,
                    radius: getRadiusByMagAndColor(mag),
                    weight: 1
                });
 
                // Salva il cerchio nell'array di marker per poterlo filtrare
                earthquakeMarkers.push({ layer: circle, mag: mag, id: terremoto.id });
 
                // Aggiungi al layer solo se supera il filtro corrente
                if (mag >= currentMinMag) {
                    terremotiLayer.addLayer(circle);
                }
 
                circle.bindPopup(`
                    <div style="font-family:Arial;font-size:14px;">
                        <b>${place}</b><br>
                        <span style="color:${getColor(mag)};">●</span> Magnitudo: ${mag.toFixed(1)}<br>
                        Profondità: ${depth.toFixed(1)} km<br>
                        Ora: ${time}<br>
                        Raggio stimato: ${(raggioStimatoMetri/1000).toFixed(1)} km
                    </div>
                `);
 
                // Effetto pulsante (pulsing effect)
                let growing = true;
                const baseRadius = getRadiusByMagAndColor(mag);
                let radius = baseRadius;
                const maxRadius = baseRadius * 1.5;
 
                if (mag > 0) {
                    setInterval(() => {
                        if (growing) radius += 500;
                        else radius -= 500;
                        if (radius > maxRadius) growing = false;
                        if (radius < baseRadius) growing = true;
                        circle.setRadius(radius);
                    }, 200);
                }
            }
        }
 
        // Collego il controllo filtro magnitudo (se presente nel DOM)
        const magFilterEl = document.getElementById('magFilter');
        if (magFilterEl) {
            magFilterEl.addEventListener('change', (e) => {
                currentMinMag = parseFloat(e.target.value) || 0;
                filterEarthquakes(currentMinMag);
            });
            // Pulsante reset nel dropdown del filtro
            const magFilterReset = document.getElementById('magFilterReset');
            if (magFilterReset) {
                magFilterReset.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    magFilterEl.value = '0';
                    currentMinMag = 0;
                    filterEarthquakes(0);
                    // Chiude il details dropdown se aperto
                    const details = magFilterEl.closest('details');
                    if (details) details.removeAttribute('open');
                });
            }
        }
 
        // --- POPOLA LA LEGENDA NEL COLLAPSE DI DAISYUI ---
        if (legendCollapse) {
            const grades = [0.1, 3, 4, 5, 6];
            // Aggiungo 'text-right' per allineare il testo a destra, coerentemente con la posizione del collapse.
            let legendContent = '<div class="text-xs space-y-1 text-right">';
            legendContent += '<b>Magnitudo</b><br>';
            grades.forEach((g,i) => {
                const color = getColor(g);
                const nextGrade = grades[i+1];
                const range = nextGrade ? g.toFixed(1) + ' &ndash; ' + nextGrade.toFixed(1) : g.toFixed(1) + '+';
               
                // Uso justify-end per spostare l'icona e il testo a destra
                legendContent +=
                    `<div class="flex items-center space-x-2 justify-end">
                        <span class="text-sm">${range}</span>
                        <i style="background:${color}; border-radius:50%; width:10px; height:10px; display:inline-block; flex-shrink: 0;"></i>
                    </div>`;
            });
            legendContent += '</div>';
 
            legendCollapse.innerHTML = legendContent;
        }
    } catch (error) {
        console.error("Errore nel recupero dei dati sismici:", error);
    }
}