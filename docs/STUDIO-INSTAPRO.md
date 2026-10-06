# Instapro: cosa fanno, come guadagnano, cosa prendiamo

Studio del 6 ottobre 2026 su instapro.it, fatto da pagine pubbliche (home,
pagina categoria imbianchino, FAQ e blog di Instapro, recensioni Trustpilot).
Le pagine di assistenza per i professionisti non si leggono senza browser, quindi
i prezzi esatti per contatto non sono pubblici: dove un numero manca è scritto.

## Chi sono

Instapro è il marchio italiano di Instapro Group, lo stesso gruppo di Werkspot
(Olanda), Travaux.com (Francia), MyHammer (Germania) e MyBuilder (Regno Unito),
nato dentro Angi/IAC. Settore: lavori in casa (imbianchini, idraulici, edili,
serramenti...). In home dichiarano 12.036 professionisti, 35.275 recensioni,
19+ categorie.

## Core business

Un marketplace di richieste: il cliente descrive il lavoro gratis, Instapro lo
gira ai professionisti della zona, i professionisti rispondono con una proposta,
il cliente confronta i profili e sceglie. Promessa al cliente: "almeno tre
preventivi entro 24 ore". Ogni professionista ha partita IVA ed è iscritto alla
Camera di Commercio ("Controllo qualità").

## Come guadagnano (la "royalty")

- **Niente abbonamento**: "non esiste alcun costo fisso (abbonamento)".
- **Si paga a contatto, non a lavoro concluso, e non a lead ricevuto**:
  rispondere a una richiesta è gratis, il professionista paga solo se il
  cliente gli risponde e gli manda telefono ed email ("paghi solo se il
  potenziale cliente ti invia il suo numero di telefono ed indirizzo email").
- **Prezzo variabile per contatto**: dipende da tipo di lavoro, dimensione,
  metri quadri. Il listino non è pubblico.
- **Nessuna commissione sul lavoro**: il contratto e il pagamento restano fra
  cliente e professionista.
- Lamentela tipica dei professionisti (Trustpilot): più ditte pagano lo stesso
  contatto e solo una prende il lavoro ("ho pagato quasi 100 euro per aria
  fritta"). È il punto debole del modello.

## Come vendono: CTA e moduli

- Un solo verbo d'azione ripetuto ovunque: **"Invia la tua richiesta"**
  (anche "Invia la tua richiesta adesso" in fondo alle recensioni).
- Due pubblici dalla prima schermata: cliente ("Invia la tua richiesta") e
  professionista ("Iscriviti gratis", anche in testata).
- Tre passi: "Invia gratuitamente la tua richiesta", "Ricevi risposte dai
  professionisti", "Compara i profili e scegli il professionista giusto".
- Il modulo parte dal lavoro, non dalla categoria: **"Che lavori vuoi far
  realizzare?"**, con voci da toccare.
- Pagina categoria: H1 "Trova ditta di imbianchino vicino a me", blocco
  "Quanto costa un imbianchino vicino a me?" con fasce di prezzo
  (20–35 €/ora, 200–1.200 € a lavoro), FAQ, link alle città.
- Blocco per professionisti in home: "Fai crescere la tua attività con
  Instapro", iscrizione gratuita, richieste nella tua zona.

## Cosa è già in questa PR

1. Bottone principale ovunque: "Invia la tua richiesta" (era "Confronta gratis
   i preventivi"); "gratis" resta nel microcopy sotto.
2. Hero della home con due ingressi: "Ricevi preventivi" (di default, porta al
   modulo con servizio e città già scritti) e "Cerca professionisti" (la
   ricerca di prima).
3. Nuovo passo nel modulo dopo il servizio: **"Che lavoro devi far fare?"**,
   con i 9 lavori più cercati del servizio (da `data/competenze.json`) più
   "Altro lavoro". Dalle pagine "Riparazione caldaia a Roma" e dalle
   competenze il lavoro arriva già scelto e il passo si salta. Il lavoro
   finisce nel lead, leggibile.
4. Tre passi "Come funziona" con lo schema di Instapro, uguali in home e
   accanto al modulo.
5. "Sei un professionista? Iscriviti gratis" in testata e un blocco
   "Fai crescere la tua attività con Mister Wolf" in fondo alla home.
6. Corretto un link rotto: la pagina per i professionisti era linkata come
   `/per-agenzie/` (404); ora è `/per-professionisti/` con redirect dal vecchio.

Dopo il deploy serve `npm run form:sync` sul server per aggiungere il passo
"che lavoro" al modulo già salvato nel database.

## Proposta di modello per Mister Wolf

- **Fase di lancio: gratis per i professionisti** (come scritto oggi nella
  pagina per i professionisti). Serve a riempire l'offerta e a misurare quante
  richieste arrivano per categoria e città.
- **Poi: pagamento a contatto "solo se il cliente risponde"**, come Instapro,
  ma con due correzioni che rispondono alla loro lamentela principale:
  massimo 3 professionisti per richiesta (è già il limite del codice,
  `MAX_QUOTES`) e prezzo per fascia di budget dichiarata dal cliente (il
  modulo la chiede già). Crediti prepagati, nessun abbonamento.
- **Mai pagare per salire in classifica**: resta la regola della metodologia.
  La sola cosa in vendita, oltre ai contatti, è la posizione "in evidenza" con
  l'etichetta, che esiste già.
- I prezzi li decide Ale; prima di attivare pagamenti online va scelto un
  sistema senza costi fissi.

## Seconda tornata (PR successiva)

- Pagina "La tua richiesta" per il cliente (`/richiesta/{id}/?k=firma`): a
  quanti professionisti è arrivata, chi ha accettato, profilo, voto e
  telefono per confrontarli. Il link è in `/grazie/` e nell'email di conferma.
- Email al cliente quando un professionista accetta, con profilo e telefono.
- Il lavoro scelto nel modulo apre la descrizione del lead: il professionista
  lo legge per primo nell'email e nella sua pagina.
- Etichetta "Con partita IVA" su schede e profili che la indicano.

## Ancora da fare

- Recensione chiesta al cliente a lavoro finito (serve un modulo recensioni
  con moderazione).
- Blocco "Quanto costa" più visibile delle FAQ, appena ci sono abbastanza
  prezzi dichiarati o budget dalle richieste.
