# Mister Wolf · Importa (estensione Chrome)

Import assistito: navighi Instapro nel tuo Chrome come sempre e, su una pagina
elenco (es. instapro.it/tinteggiatura/imbianchino-professionisti/roma), premi
**Importa in Mister Wolf**. I professionisti che vedi in quella pagina arrivano
nel Mister Wolf del Mac come bozze, con voto e numero di recensioni Instapro.

L'estensione non apre pagine da sola, non va avanti alle pagine successive e
non contiene nulla per aggirare controlli anti-bot: legge solo la pagina che
hai già aperto tu, quando premi il pulsante.

## Installazione

1. Nel file `.env` di preventivi sul Mac aggiungi `IMPORT_KEY="una-parola-segreta"`
   e riavvia il sito (localhost:4450).
2. In Chrome apri `chrome://extensions`, attiva **Modalità sviluppatore**,
   premi **Carica estensione non pacchettizzata** e scegli questa cartella
   (`estensione-chrome`).
3. Nei dettagli dell'estensione apri **Opzioni dell'estensione** e scrivi la
   stessa chiave. L'indirizzo resta `http://localhost:4450`.

Lato server: `src/app/api/import/pagina/route.ts`, con l'estrattore di
`--fonte sito:instapro` (`mapInstaproElenco` in `src/modules/ingest/sito.ts`).
