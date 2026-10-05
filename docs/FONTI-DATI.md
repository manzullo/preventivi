# Fonti dati: da dove prendere professionisti e aziende

Stato al 2026-10-05. Nessuna fonte è ancora stata usata: gli script di
scoperta partono solo con `INGEST_ENABLED=1` e `--confirm`.

Questa è un'analisi operativa, non un parere legale: prima del giro completo
conviene farla leggere a un avvocato, soprattutto la parte GDPR.

## 1. Le fonti, una per una

| Fonte | Cosa dà | Come | Condizioni e rischi | Costo indicativo | Uso consigliato |
|---|---|---|---|---|---|
| **Google Maps via Apify** (quella già usata da guidaagenzie: `scraperlink` o `compass/crawler-google-places`) | nome, categoria Google, indirizzo, telefono, sito, coordinate, rating, recensioni, place_id | `scripts/apify-discover.ts` (query categoria + città), poi `scripts/apify-places.ts` | Copertura migliore in assoluto per artigiani e studi. Però i termini di Google vietano l'estrazione da Maps fuori dalle API ufficiali: il rischio è contrattuale (verso Google) e di diritto sui generis delle banche dati, non penale. Si mitiga mostrando "fonte: Google" con link, salvando il place_id e non ripubblicando i testi delle recensioni in blocco | ~0,0005 $ a risultato senza recensioni, ~0,0036 $ con recensioni (valori misurati su guidaagenzie) | Scoperta iniziale, se accetti il rischio come per guidaagenzie |
| **Google Places API (New)**, ufficiale | gli stessi campi, recensioni max 5 | Text Search per "categoria città", poi Place Details | Lecito per contratto, ma i dati (salvo place_id) non si conservano oltre 30 giorni e l'attribuzione Google è obbligatoria. Va bene per verificare e aggiornare, meno per costruire un archivio | a richiesta, con credito mensile gratuito; prezzi da verificare sulla pagina di Google prima del giro | Verifica e aggiornamento periodico di rating e orari |
| **OpenStreetMap** (Overpass API) | nome, indirizzo, coordinate, telefono e sito quando presenti; tag `craft=plumber`, `craft=electrician`, `craft=painter`, `office=lawyer`, `office=accountant`, `shop=hairdresser`, `amenity=driving_school`… | query Overpass per area e tag | Licenza ODbL: uso libero con attribuzione "© OpenStreetMap contributors"; se si ridistribuisce la banca dati derivata va condivisa con la stessa licenza (mostrare le schede sul sito va bene) | 0 € | Semina pulita e senza rischi, ma copertura bassa sugli artigiani (molti idraulici non sono mappati) |
| **Registro Imprese (InfoCamere)**, elenchi per codice ATECO e provincia | ragione sociale, P.IVA, sede, ATECO, stato attivo, a volte PEC | elenchi a pagamento dai distributori ufficiali | Dati pubblici per legge e riutilizzabili; le ditte individuali sono persone fisiche, quindi vale il GDPR (vedi sotto). Niente telefono né recensioni | a elenco, da preventivare | Completezza per mestiere (es. 43.22.01 impianti idraulici, 43.21.01 impianti elettrici, 43.34.00 tinteggiatura, 69.20.11 commercialisti) e verifica che l'attività esista |
| **Albi professionali** (avvocati, commercialisti, architetti, geometri, psicologi, notai) | nome, numero di iscrizione, sede | consultazione dei siti degli ordini | Pubblici per legge per la verifica dell'iscrizione; l'uso massivo per costruire un elenco commerciale è discutibile. Meglio usarli per verificare chi è già in elenco | 0 € | Badge "iscritto all'albo" sulla scheda |
| **Iscrizione diretta e rivendicazione** | tutto, con consenso | `/candidatura/`, `/rivendica/` (già pronti) | nessun rischio | 0 € | Il canale da spingere appena c'è traffico |
| ProntoPro, PagineGialle | ProntoPro: nome, categoria, comune, presentazione (niente recapiti). PagineGialle: anche indirizzo, telefono, email, sito | `--fonte sito:prontopro`, `--fonte sito:paginegialle` (sezione 2) | i termini vietano l'estrazione e le banche dati sono protette: rischio contrattuale e sui generis, come per Maps | 0 € | **Solo per la cernita** (decisione del 2026-10-05): elenco di chi esiste, da incrociare con Maps e coi siti prima di pubblicare |
| Instapro, Houzz, StarOfService | — | — | come sopra | — | Non si usano |

## 2. Gli scraper (decisione del 2026-10-05: niente Apify, scraper nostri)

Un solo comando, `npm run scrape`, con tre fonti. Tutte salvano il grezzo in
`data/raw/{fonte}/{città}-{categoria}.json`, scartano i fuori tema con
`Service.googleMatch`, importano come bozze e ricalcolano punteggi e pagine.
Le richieste passano da `src/modules/ingest/http.ts`: User-Agent dichiarato,
robots.txt rispettato, una richiesta alla volta per sito con pausa, nuovi
tentativi solo su 429 e 5xx.

| Fonte | Codice | Come funziona | Limiti |
|---|---|---|---|
| `maps` | `src/modules/ingest/gmaps.ts` | Chrome vero (Playwright): cerca "categoria città" su Google Maps, scorre l'elenco, apre ogni scheda e legge nome, categoria, indirizzo, telefono, sito, voto, numero recensioni, coordinate | Va lanciato dal Mac (IP residenziale): da un server Google risponde col captcha. Il markup di Maps cambia: i selettori sono tutti in `SEL`. Pausa media 2,5 s a scheda. Rischio sui termini di Google, come per Apify |
| `osm` | `src/modules/ingest/osm.ts` | Overpass: tutte le attività con i tag della categoria dentro il comune. 47 categorie su 53 hanno una corrispondenza in `OSM_TAGS` | Copertura bassa per gli artigiani; attribuzione "© OpenStreetMap contributors" mostrata in scheda |
| `sito:{nome}` | `src/modules/ingest/sito.ts` | Directory che pubblicano i dati in JSON-LD (schema.org LocalBusiness): pagine elenco per categoria e città, link alle schede, pagine successive. Un sito nuovo è un file `data/siti/{nome}.json` (modello in `data/siti/esempio.json`) | Si ferma da solo dove robots.txt vieta. I termini d'uso di molte directory vietano l'estrazione: vanno letti sito per sito prima del giro completo |

Prove fatte (2026-10-05, in locale, perché il container di sviluppo non
raggiunge siti esterni): `sito` su un sito finto con 2 pagine elenco e 3 schede
(3 importate, rilancio = 3 aggiornate, robots.txt rispettato); `maps` su una
copia finta del markup di Maps (3 risultati, 1 scartato come "Ferramenta", 2
importati con voto e numero di recensioni). Il primo giro vero su Maps serve a
confermare i selettori.

### Ordine consigliato

1. `osm` su Roma, tutte le categorie: gratis e pulito, dà un primo nucleo.
2. `maps` su Roma, 5 categorie, `--max 40`, dal Mac: misura tempi e scarto.
3. Cernita con `sito:paginegialle` e `sito:prontopro` (configurazioni in
   `data/siti/`, per ora 5 categorie su Roma). ProntoPro si legge dai dati di
   Next.js della scheda (`estrattore: "prontopro"`), PagineGialle dal JSON-LD.
4. Controllo a mano di un campione, poi pubblicazione.

## 3. GDPR: cosa serve prima di pubblicare

Le società sono fuori dal GDPR, ma idraulici, elettricisti, psicologi e quasi
tutti i professionisti sono ditte individuali: nome e telefono sono dati
personali anche se pubblicati da loro.

- **Base giuridica:** legittimo interesse (art. 6.1.f), con una valutazione
  scritta del bilanciamento: dati già resi pubblici dal titolare per farsi
  trovare dai clienti, uso coerente con quello scopo, nessun dato sensibile.
- **Informativa (art. 14):** pagina pubblica dedicata, e un'email al titolare
  quando l'indirizzo è noto, entro un mese dalla pubblicazione.
- **Opposizione (art. 21):** link "Rimuovi la scheda" su ogni scheda, esito
  rapido. Il modello c'è già: con `Agency.optedOutAt` valorizzato l'import non
  ripubblica più la scheda da nessuna fonte. Mancano il link in scheda e il
  bottone in admin che svuota i contatti e imposta la data.
- **Recensioni:** si mostrano con fonte e link; non si copiano in blocco i testi
  delle recensioni Google sulle pagine elenco.

## 4. Tempi stimati del giro completo

Con gli scraper nostri non c'è costo a risultato, c'è il tempo. Su Maps, a
~3 s a scheda e 40 schede per ricerca, una categoria in una città richiede
~2-3 minuti: 53 categorie × 115 capoluoghi sono ~250 ore di browser, quindi
si va per priorità (città grandi e categorie con più ricerche) e a lotti
notturni. OSM e le directory sono molto più veloci.

## 5. Comandi

```bash
# OpenStreetMap, tutte le categorie, Roma
INGEST_ENABLED=1 npm run scrape -- --fonte osm --city roma --service all --confirm

# Google Maps dal Mac, 5 categorie, prima a secco
INGEST_ENABLED=1 npm run scrape -- --fonte maps --city roma --service idraulici,elettricisti,imbianchini,fotografi,commercialisti --max 40 --dry --confirm
# HEADFUL=1 mostra il browser; CHROME_PATH sceglie un Chrome diverso da quello installato

# una directory configurata in data/siti/nomesito.json
INGEST_ENABLED=1 npm run scrape -- --fonte sito:nomesito --city milano --service idraulici --confirm

# cernita: PagineGialle e ProntoPro
INGEST_ENABLED=1 npm run scrape -- --fonte sito:paginegialle --city roma --service idraulici,elettricisti,imbianchini,fotografi,commercialisti --confirm
INGEST_ENABLED=1 npm run scrape -- --fonte sito:prontopro --city roma --service idraulici,elettricisti,imbianchini,fotografi,commercialisti --confirm

# rilegge il grezzo già scaricato, senza rete
INGEST_ENABLED=1 npm run scrape -- --fonte maps --city roma --service idraulici --reuse --confirm
```

Gli script Apify ereditati da guidaagenzie (`apify-discover.ts`,
`apify-places.ts`) restano come alternativa a pagamento.
