# Leaflet-X-PocketBase
Progetto di integrazione tra Leaflet e PocketBase, per il salvataggio di informazioni di una mappa in un database


Questo codice **JavaScript** (`main.js`) è un'applicazione per **visualizzare in tempo reale i dati sui terremoti** (ottenuti dal servizio USGS) su una mappa **Leaflet**, con la capacità di **salvare i dati storici** in un database **PocketBase** e di applicare un **filtro di magnitudo**.

Ecco la spiegazione riga per riga:

## 0. Inizializzazione Globale e PocketBase

* `// main.js`: Commento che indica il nome del file.
* `import './style.css'`: **Importa il file CSS** per lo styling dell'applicazione (es. per la mappa e i controlli).
* `import PocketBase from "pocketbase"`: **Importa la libreria PocketBase** per interagire con il database backend.
* `// =================...`: Commento di sezione.
* `const db = new PocketBase('http://127.0.0.1:8090');`: **Inizializza l'istanza di PocketBase** collegandosi all'indirizzo locale specificato.

---

## 1. Inizializzazione della Mappa (Leaflet)

* `// 1. Inizializzazione della Mappa`: Commento di sezione.
* `const map = L.map('map').setView([45.4297, 10.1861], 3);`: **Crea un oggetto mappa Leaflet** (`L.map`) collegato all'elemento HTML con `id="map"`. Imposta la vista iniziale su coordinate approssimative dell'Italia settentrionale (45.4297, 10.1861) con un livello di zoom di 3. 

[Image of Leaflet map with markers]

* `L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { ... }).addTo(map);`: **Aggiunge un layer di tile (la base della mappa)**, utilizzando i dati di OpenStreetMap.
    * `maxZoom: 19`, `minZoom: 2`: Imposta i livelli di zoom massimo e minimo.
    * `attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'`: Imposta l'attribuzione richiesta per l'uso delle tile di OpenStreetMap.
    * `.addTo(map)`: Aggiunge il layer alla mappa.

---

## 2. Definizione degli Stati Globali

* `// 2. Definizione degli Stati Globali`: Commento di sezione.
* `const earthquakeLayer = L.layerGroup().addTo(map);`: **Crea un gruppo di layer Leaflet** (`L.layerGroup`) per contenere tutti i marker dei terremoti e lo aggiunge alla mappa. Questo aiuta a gestire i marker come un'unica entità (es. per la pulizia).
* `const markerMap = {};`: **Oggetto (mappa) globale** utilizzato per memorizzare i riferimenti ai marker dei terremoti, indicizzati per `id` del terremoto.
* `const knownEarthquakes = new Set();`: **Set globale** per tenere traccia degli ID dei terremoti già visualizzati/processati, evitando duplicati.
* `let isGestioneRunning = false; // Lock`: **Variabile "lock" booleana** usata per impedire l'esecuzione simultanea della funzione `gestioneTerr` (utile per l'interval).
* `// Riferimenti agli elementi di controllo`: Commento.
* `const minMagInput = document.getElementById('minMagnitude');`: Ottiene il **riferimento all'elemento input HTML** per la magnitudo minima.
* `const applyFilterButton = document.getElementById('applyFilter');`: Ottiene il **riferimento al pulsante HTML** per applicare il filtro.
* `let minMagnitude = parseFloat(minMagInput?.value) || 0.0;`: **Variabile globale** che memorizza il valore del filtro di magnitudo minima, parsato dall'input (o `0.0` di default).
* `// Impostazioni`: Commento.
* `const OPACITY_NEW = 1.0;`: **Costante** per l'opacità massima (terremoti appena arrivati).
* `const OPACITY_MIN = 0.05;`: **Costante** per l'opacità minima (sotto la quale il marker viene rimosso).
* `const DATA_REFRESH_RATE = 10000;`: **Costante** (10 secondi) per l'intervallo di tempo tra le richieste di dati USGS.
* `const FADE_REFRESH_RATE = 1000;`: **Costante** (1 secondo) per l'intervallo di tempo per l'aggiornamento dell'opacità (effetto "dissolvenza").
* `const BATCH_SIZE = 5; // Dimensione dei lotti per il salvataggio`: **Costante** per definire quanti record PocketBase salvare contemporaneamente.

---

## Funzioni di Utilità

* `function getColorByMagnitude(mag) { ... }`: **Funzione** che ritorna un **colore diverso** (es. `darkred`, `red`, `orange`, `yellow`, `green`) basato sul valore della magnitudo del terremoto.
* `function buildPopupContent(data) { ... }`: **Funzione** che genera e ritorna la **stringa HTML formattata** da mostrare nel popup di un marker (luogo, ora, profondità, magnitudo, fonte, ecc.).
* `function drawEarthquakeMarker(data, isNew = false) { ... }`: **Funzione principale** per disegnare un marker sulla mappa.
    * `if (knownEarthquakes.has(data.id)) return;`: **Ignora** il disegno se il terremoto è già noto.
    * `if (data.mag < minMagnitude) return;`: **Ignora** se la magnitudo è sotto il filtro corrente.
    * `knownEarthquakes.add(data.id);`: Aggiunge l'ID ai terremoti noti.
    * `const radius = 3000 + Math.pow(3.5, data.mag);`: Calcola il **raggio del cerchio Leaflet** (marker) basato sulla magnitudo (più grande è la magnitudo, più grande è il raggio).
    * `const clampedMag = ...;`: Limita la magnitudo per il calcolo della durata della dissolvenza (tra 2.0 e 6.0).
    * `const durationSeconds = 20 * Math.pow(clampedMag, 2);`: Calcola la **durata totale** della dissolvenza in secondi.
    * `const fillOpacity = ...;`: Imposta l'opacità iniziale (massima per i nuovi, minima + 0.05 per gli storici).
    * `const fadeStep = ...;`: Calcola il **passo di riduzione dell'opacità** per l'effetto di dissolvenza.
    * `const circle = L.circle(...)`: **Crea il marker circolare** Leaflet, impostando colore, riempimento, opacità e raggio.
    * `circle.bindPopup(...)`: Associa il contenuto del popup (generato da `buildPopupContent`) al cerchio.
    * `circle.addTo(earthquakeLayer);`: Aggiunge il cerchio al gruppo di layer.
    * `circle.fadeStep = fadeStep;`: Salva il passo di dissolvenza come proprietà del cerchio.
    * `markerMap[data.id] = circle;`: Salva il riferimento al cerchio nella mappa dei marker.

---

## PocketBase: Salvataggio e Caricamento Storico

* `async function saveEarthquakeToPocketBase(data) { ... }`: **Funzione asincrona** che gestisce il salvataggio di un singolo record terremoto nel database PocketBase (`terremoti`).
    * Prepara l'oggetto `recordData` mappando i dati USGS ai campi del database.
    * `await db.collection('terremoti').create(...)`: Tenta di creare il record.
    * Gestisce l'**errore 400** (Bad Request) che può verificarsi per i record **duplicati** (`usgs_id` univoco) e lo ignora silenziosamente.
* `async function loadHistoricalEarthquakes() { ... }`: **Funzione asincrona** che carica i dati storici dei terremoti da PocketBase all'avvio o dopo un cambio di filtro.
    * `const records = await db.collection('terremoti').getFullList(...)`: Ottiene l'elenco completo dei record, ordinati per tempo (`-tempo`) e **filtrati per magnitudo minima** corrente.
    * I record recuperati vengono mappati al formato dati interno e disegnati sulla mappa chiamando `drawEarthquakeMarker(data, false)` (come storici).

---

## Funzione 1: Gestione Dati Live (con Batching)

* `async function gestioneTerr() { ... }`: **Funzione asincrona** per recuperare e gestire i dati sismici live da USGS.
    * `if (isGestioneRunning) { return; }`: **Lock** - esce se la funzione è già in esecuzione.
    * `isGestioneRunning = true;`: Imposta il lock.
    * `const r = await fetch("...");`: Recupera i dati GeoJSON dei terremoti (tutti, ultimo giorno) da USGS.
    * `const filteredEarthquakes = ...`: Filtra i terremoti in base alla `minMagnitude` corrente.
    * **Ciclo sui terremoti filtrati**:
        * `if (!knownEarthquakes.has(id))`: Se il terremoto non è noto (nuovo).
        * Prepara l'oggetto `earthquakeData`.
        * `savePromises.push(() => saveEarthquakeToPocketBase(earthquakeData));`: Aggiunge una **funzione** che ritorna la promise di salvataggio all'array `savePromises`.
        * `drawEarthquakeMarker(earthquakeData, true);`: Disegna il nuovo terremoto sulla mappa (come nuovo).
    * **Logica di Batching**:
        * Cicla su `savePromises` a intervalli di `BATCH_SIZE`.
        * `const batchPromises = ... .map(func => func());`: Estrae le funzioni del lotto e le esegue per ottenere le Promise.
        * `await Promise.all(batchPromises);`: **Attende** che tutte le chiamate di salvataggio nel lotto corrente siano terminate prima di passare al lotto successivo, prevenendo il sovraccarico di PocketBase.
    * `finally { isGestioneRunning = false; }`: Rilascia il lock al termine o in caso di errore.

---

## Gestione Filtro

* `async function handleFilterChange() { ... }`: **Funzione asincrona** eseguita quando il filtro di magnitudo viene cambiato e applicato.
    * Aggiorna la variabile `minMagnitude`.
    * `earthquakeLayer.clearLayers();`: **Rimuove** tutti i marker dalla mappa.
    * Svuota `markerMap` e `knownEarthquakes`.
    * `await loadHistoricalEarthquakes();`: **Ricarica i dati storici** da PocketBase con il nuovo filtro.
    * `await gestioneTerr();`: **Aggiorna i dati live** da USGS con il nuovo filtro.
* Blocco `if (applyFilterButton && minMagInput)`: Aggiunge gli **event listener** al pulsante e al campo input (tasto `Enter`) per chiamare `handleFilterChange`.

---

## Funzione 2: Aggiornamento Opacità (Dissolvenza)

* `function aggiornaOpacita() { ... }`: **Funzione** che gestisce l'effetto di **dissolvenza** dei marker.
    * Cicla su tutti i marker in `markerMap`.
    * Se il `circle.fadeStep` è 0 (marker storico), salta.
    * Calcola `newOpacity` sottraendo `step` all'opacità corrente.
    * Se `newOpacity > OPACITY_MIN`: Aggiorna l'opacità (`circle.setStyle`).
    * Altrimenti: **Rimuove il marker** dalla mappa e da tutti gli stati globali (`markerMap`, `knownEarthquakes`).

---

## Avvio

* `(async () => { ... })();`: **Funzione anonima asincrona auto-invocata** che rappresenta l'avvio dell'applicazione.
    * `await loadHistoricalEarthquakes();`: Carica i dati storici iniziali.
    * `await gestioneTerr();`: Esegue il primo recupero di dati live.
    * `setInterval(gestioneTerr, DATA_REFRESH_RATE);`: Imposta un **intervallo** per richiamare `gestioneTerr` (recupero dati live) ogni 10 secondi.
    * `setInterval(aggiornaOpacita, FADE_REFRESH_RATE);`: Imposta un **intervallo** per richiamare `aggiornaOpacita` (effetto dissolvenza) ogni 1 secondo.

***

Hai domande su una funzione specifica o vuoi approfondire un concetto (ad esempio PocketBase o Leaflet)?

