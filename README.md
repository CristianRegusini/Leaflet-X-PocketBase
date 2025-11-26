# Leaflet-X-PocketBase
Progetto di integrazione tra Leaflet e PocketBase, per il salvataggio di informazioni di una mappa in un database


PocketBase è un backend open-source, leggero e potente, scritto in Go, che racchiude tutte le funzionalità essenziali in un singolo eseguibile. È ideale per prototipi rapidi, progetti collaterali (side projects), e applicazioni di piccole-medie dimensioni che richiedono un'architettura verticalmente scalabile e a bassa manutenzione.

Funzionalità Chiave
Database Embedded in Tempo Reale (SQLite): Utilizza un database SQLite integrato (in modalità WAL) con la possibilità di sottoscrizioni in tempo reale, rendendolo perfetto per chat o dashboard dinamiche.

API REST-ish e Admin UI: Fornisce un'API pronta all'uso e una dashboard amministrativa web per gestire facilmente database, utenti e file.

Autenticazione Integrata: Gestisce nativamente l'autenticazione tramite email/password e provider OAuth2 (Google, GitHub, ecc.).

Gestione File: Supporta l'archiviazione locale o su storage compatibile con S3.

Estendibile: Può essere esteso tramite codice Go o JavaScript per logica personalizzata (hooks, rotte, ecc.).
