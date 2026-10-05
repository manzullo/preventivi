# Preventivi — Piano di progetto

> "Preventivi" è il nome provvisorio (è il nome del repo). Il nome vero si
> sceglie a parte: si cambia `SITE_NAME` in `src/lib/site.ts`, il logo in
> `src/components/SiteHeader.tsx` e le variabili `NEXT_PUBLIC_SITE_URL`,
> `SITE_HOST`, `SITE_HOST_RE`.

Directory italiana di professionisti e aziende per servizi locali (casa,
eventi, benessere, lezioni, professioni, auto, animali), con richiesta di
preventivo come motore economico. Modello: ProntoPro per l'esperienza del
cliente (scegli categoria e città, descrivi il lavoro, ricevi fino a 3
preventivi), Guida Agenzie per il motore (pagine categoria × città, ranking da
recensioni pubbliche, form engine, smistamento lead, admin).

Aggiornato: 2026-10-05.

---

## 0. Decisioni prese

| Data | Decisione | Nota |
|---|---|---|
| 2026-10-05 | Stack: lo stesso di guidaagenzie.it (Next.js 16.3 App Router, TypeScript, Tailwind v4, Prisma 6.19.3, Postgres 16, Docker su VPS con Traefik/Coolify) | il codice parte da una copia di `manzullo/guidaagenzie` |
| 2026-10-05 | I nomi interni restano quelli di guidaagenzie (`Agency`, `Service`, `AgencyService`, `LandingPage`) | così una correzione fatta su un sito si porta sull'altro con un diff; fuori (URL, testi) si dice "professionista" e "categoria" |
| 2026-10-05 | Migrazioni ripartite da zero: una sola `init` | il database è nuovo, la storia delle 29 migrazioni di guidaagenzie non serve |
| 2026-10-05 | Scheda pubblica in `/professionista/{slug}/` | era `/agenzia/{slug}/` |
| 2026-10-05 | 53 categorie in 7 aree (`scripts/seed-services.ts`) | lo slug è il plurale di chi fa il lavoro: `/idraulici/roma/` |
| 2026-10-05 | Chi chiede la rimozione resta come promemoria (`Agency.optedOutAt`) e nessun import lo ripubblica | obbligo pratico del GDPR per una directory costruita da fonti pubbliche |

Da decidere: nome e dominio; fonti dati e budget (vedi `FONTI-DATI.md`);
modello di ricavo (lead venduti a richiesta come ProntoPro, o abbonamento).

---

## 1. Cosa arriva già fatto da guidaagenzie

| Pezzo | Dove | Cosa cambia qui |
|---|---|---|
| Resolver URL a 1 e 2 segmenti, redirect 301/410, slug riservati | `src/modules/directory/resolve.ts`, `src/app/(public)/[uno]/[due]` | niente |
| Pagine materializzate con soglia (3 schede) e sitemap a blocchi | `src/modules/directory/pages.ts`, `npm run pages:rebuild` | niente |
| Listing con filtri, paginazione, città vicine, FAQ generate dai dati | `ListingView`, `listingFaq.ts` | testi riscritti, articoli giusti per genere (`articoli()` in `site.ts`) |
| Ranking bayesiano sulle recensioni, priorità dichiarate | `src/modules/ranking/score.ts` | niente |
| Form engine multi-step, embed, tracking, conversioni Ads | `src/modules/leadforms/` | form di default rifatto: categoria, città, budget, urgenza, descrizione, contatti |
| Smistamento lead fino a 3 schede, notifiche email/WhatsApp | `src/modules/leads/`, `src/modules/notify/` | testi |
| Admin completo (schede, lead, form, ads, analytics, AI, priorità) | `src/app/admin/` | niente di strutturale |
| Rivendicazione scheda, area titolari, candidatura | `rivendica`, `area`, `candidatura` | niente |
| Scoperta e arricchimento da Google Maps (Apify) | `scripts/apify-discover.ts`, `scripts/apify-places.ts` | filtro per categoria Google preso da `Service.googleMatch` |

## 2. Struttura URL

| Pattern | Esempio | Quante |
|---|---|---|
| `/{categoria}/` | `/idraulici/` | 53 |
| `/{citta}/` | `/roma/` | 115 capoluoghi; comuni minori se sopra soglia |
| `/{categoria}/{citta}/` | `/idraulici/roma/` | 53 × 115 = ~6.100 combinazioni, pubblicate solo con ≥ 3 schede |
| `/{regione}/` | `/lazio/` | 20 |
| `/professionista/{slug}/` | `/professionista/mario-rossi-idraulico-roma/` | una per scheda |
| `/migliori-{categoria}/` | `/migliori-idraulici/` | 53 |
| `/alternative-a-{concorrente}/` | `/alternative-a-prontopro/` | 6 |
| `/competenze/{lavoro}/` e `/competenze/{lavoro}/{citta}/` | `/competenze/pronto-intervento-24h/roma/` | dal catalogo in `src/lib/skills.ts` |
| `/preventivo/?servizio=…&citta=…` | form precompilato dalla pagina di partenza | |

Il moltiplicatore vero sono le città: con 53 categorie, 115 capoluoghi danno
~6.100 pagine potenziali, e i comuni sopra i 15.000 abitanti (~700) le portano
oltre 35.000. Si pubblica solo dove ci sono almeno 3 schede vere: una pagina
vuota fa più danno di una pagina che non c'è.

## 3. Fasi

### Fase 0 — Fondamenta (questa PR)

- [x] Copia del motore di guidaagenzie, script e documenti specifici delle agenzie tolti
- [x] Schema: `Service.singular`, `gender`, `group`, `googleMatch`; `Agency.optedOutAt`; migrazione `init` unica
- [x] Seed: 53 categorie, 6 concorrenti, città e regioni (dati geo di guidaagenzie), form di default
- [x] URL `/professionista/`, testi pubblici principali, form, email al cliente
- [x] Verifica locale: migrazioni, seed, fixture (50 schede finte), build di produzione, route principali a 200, 404 sotto soglia

### Fase 1 — Dati (serve il via sulle fonti e un budget)

1. Prova su una città (Roma) e 5 categorie con `apify-discover --service`, per misurare costo e quota di scarto.
2. Controllo a mano di un campione: categoria giusta, sede in città, non un negozio.
3. Giro completo per capoluoghi in ordine di popolazione, una categoria alla volta.
4. Arricchimento con `apify-places` (recensioni, telefono, coordinate).
5. Pagine: `npm run pages:rebuild`.

### Fase 2 — Faccia

- [ ] Nome, logo, palette (oggi è quella di guidaagenzie)
- [ ] Revisione completa dei testi: la sostituzione automatica "agenzia → professionista" ha coperto il grosso, ma l'admin e alcune pagine secondarie (metodologia, chi siamo, per i professionisti) vanno riletti a mano
- [ ] Domande del form per categoria (un idraulico chiede "che tipo di intervento", un fotografo "che evento"): il form engine lo supporta già, serve un form per area

### Fase 3 — Online

- [ ] Dominio, DNS verso la VPS, `.env` sul server, `scripts/deploy.sh`
- [ ] Search Console e sitemap

### Fase 4 — Soldi

- [ ] Prezzo per lead per categoria (un trasloco vale più di una ripetizione)
- [ ] Abbonamento scheda per chi la rivendica: contatti diretti, statistiche, mai posizione
