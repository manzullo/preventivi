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
| ProntoPro, Instapro, PagineGialle, Houzz, StarOfService | — | — | i termini vietano l'estrazione e le banche dati sono protette | — | **Non si usano.** Al massimo come elenco dei nomi da cercare poi su fonti lecite |

## 2. Proposta

1. **Partenza:** Google Maps via Apify come su guidaagenzie, perché è l'unica
   fonte che copre davvero gli artigiani, più OpenStreetMap dove ha dati.
   Ogni scheda nasce in bozza (`published = false`) con `source` e `sourceUrl`.
2. **Filtro:** la scoperta tiene solo i posti la cui categoria Google rientra
   in `Service.googleMatch` (chi cerca "idraulico" trova anche ferramenta e
   negozi di sanitari). Le regex sono in `scripts/seed-services.ts`.
3. **Pubblicazione:** solo schede con telefono o sito e almeno una recensione;
   le altre restano in bozza finché non si iscrivono o non vengono verificate.
4. **Aggiornamento:** `apify-places` a cadenza per rating e recensioni.
5. **Crescita:** rivendicazione e iscrizione diretta, con email al titolare
   quando c'è un indirizzo.

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

## 4. Costo stimato del giro completo (scoperta)

53 categorie × 115 capoluoghi = 6.095 query. A 50 risultati per query sono
~305.000 risultati prima della deduplica:

| Opzione | Stima |
|---|---|
| Solo scoperta, senza recensioni (0,0005 $) | ~150 $ |
| Con 10 recensioni a scheda (0,0036 $) | ~1.100 $ |

Conviene partire da 10 città e 20 categorie (~10 $ senza recensioni),
misurare quante schede passano il filtro, e decidere il resto dopo.

## 5. Comandi

```bash
# prova a secco: quante query e quanto costerebbe, nessuna chiamata
tsx scripts/apify-discover.ts --city roma --service idraulici --dry

# scoperta vera su una categoria in una città
INGEST_ENABLED=1 tsx scripts/apify-discover.ts --city roma --service idraulici --num 50 --reviews 0 --budget 1 --confirm

# arricchimento (place_id, recensioni, contatti) delle schede già in DB
INGEST_ENABLED=1 tsx scripts/apify-places.ts --city roma --reviews 5 --budget 2 --confirm

npm run score && npm run pages:rebuild
```
