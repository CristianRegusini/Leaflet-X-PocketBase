# EarthquakeMap - Demo Leaflet con Login

EarthquakeMap è una webapp che mostra in tempo reale i terremoti rilevati dal servizio USGS su una mappa interattiva, con autenticazione utente tramite PocketBase. L'interfaccia è moderna, responsive e utilizza Leaflet, DaisyUI, Bootstrap Icons e Tailwind CSS.

## Funzionalità principali

- **Login/Registrazione utenti**: autenticazione sicura tramite PocketBase.
- **Visualizzazione mappa interattiva**: mostra i terremoti recenti con cerchi colorati e animati in base alla magnitudo.
- **Cambio layer mappa**: possibilità di passare da vista satellitare a geografica (OSM).
- **Lista terremoti**: elenco degli ultimi eventi con dettagli, ricerca e centratura sulla mappa.
- **Filtro per magnitudo**: mostra solo i terremoti sopra una certa soglia.
- **Legenda dinamica**: spiega i colori/magnitudo.
- **Salvataggio eventi su PocketBase**: ogni terremoto viene salvato/aggiornato in un database locale.

- [Leaflet](https://leafletjs.com/) per la mappa
- [PocketBase](https://pocketbase.io/) per autenticazione e storage
- [DaisyUI](https://daisyui.com/) + [Tailwind CSS](https://tailwindcss.com/) per lo stile
- [Bootstrap Icons](https://icons.getbootstrap.com/) per le icone
- [Vite](https://vitejs.dev/) per lo sviluppo locale

## Requisiti

- Node.js (consigliato v18+)
- [PocketBase](https://pocketbase.io/) avviato in locale o su server accessibile

## Installazione

1. **Clona il repository**

```bash
git clone https://github.com/tuo-utente/earthquake-map-demo.git
cd earthqake-map-demo
```

2. **Installa le dipendenze**

```bash
npm install
```

3. **Configura PocketBase**

- Scarica PocketBase da qui:
```bash
https://pocketbase.io/docs/
```
- Avvia PocketBase:
  ```bash
  ./pocketbase serve
  ```
- Crea la collezione `users` (per l'autenticazione) e la collezione `terremoti` con i seguenti campi (puoi gia importare all'interno del pocketbase il nostro file chiamato pb_schema.json):
  - `usgs_id` (text, unique)
  - `magnitudo` (number)
  - `luogo` (text)
  - `latitudine` (number)
  - `longitudine` (number)
  - `profondita` (number)
  - `DateTime` (date)
  - `raggio_stimato_metri` (number)

4. **Configura l'endpoint PocketBase**

Modifica la variabile nell'`src/main.js` con l'IP/host del tuo server PocketBase:

```js
const pb = new PocketBase('http://localhost:8090'); // oppure il tuo IP
```

5. **Avvia il progetto**

```bash
npm run dev
```

Apri il browser su [http://localhost:5173](http://localhost:5173) (o la porta indicata da Vite).

## Note di sicurezza
- Non usare in produzione senza HTTPS e senza proteggere PocketBase.
- Le password sono gestite da PocketBase, ma assicurati di aggiornarlo regolarmente.

## Personalizzazione
- Puoi modificare i layer mappa, i filtri e lo stile modificando i file in `src/`.
- Per cambiare la fonte dati terremoti, modifica l'URL nel fetch in `main.js`.
