// Le categorie della directory, raggruppate per area come su ProntoPro. Ogni
// voce porta le query che la scoperta usa su Google Maps (combinate con il
// nome della città) e la regex delle categorie Google che le appartengono.
// Idempotente: si rilancia dopo ogni modifica.
//
// Lo slug è il plurale di chi fa il lavoro ("idraulici"), così l'incrocio con
// la città si legge da solo: /idraulici/roma/. Deve restare unico anche
// rispetto agli slug delle città e delle regioni.

import { db } from "../src/lib/db";

type ServiceSeed = {
  slug: string;
  name: string; // il servizio come lo chiede il cliente
  plural: string; // chi lo fa, al plurale: H1 e title
  singular: string; // chi lo fa, al singolare, minuscolo
  gender?: "m" | "f";
  group: string;
  intro: string;
  queries: string[];
  googleMatch: string; // regex, senza barre, case-insensitive
};

export const SERVICES: ServiceSeed[] = [
  // ---------- Casa e ristrutturazioni ----------
  { slug: "idraulici", name: "Idraulico", plural: "Idraulici", singular: "idraulico", group: "Casa", intro: "Riparazioni, perdite, scarichi, sanitari e impianti idrici, anche in pronto intervento.", queries: ["idraulico", "pronto intervento idraulico"], googleMatch: "idraulic|plumber|impianti idrici" },
  { slug: "elettricisti", name: "Elettricista", plural: "Elettricisti", singular: "elettricista", group: "Casa", intro: "Impianti elettrici civili, guasti, certificazioni, domotica e quadri.", queries: ["elettricista", "impianti elettrici"], googleMatch: "elettric|electrician" },
  { slug: "imbianchini", name: "Imbianchino", plural: "Imbianchini", singular: "imbianchino", group: "Casa", intro: "Tinteggiatura di interni ed esterni, stucchi, carta da parati e trattamenti antimuffa.", queries: ["imbianchino", "pittore edile"], googleMatch: "imbianchin|pittor|tinteggiat|painter" },
  { slug: "imprese-edili", name: "Ristrutturazione casa", plural: "Imprese edili", singular: "impresa edile", gender: "f", group: "Casa", intro: "Ristrutturazioni complete e parziali, opere murarie, bagni e cucine chiavi in mano.", queries: ["impresa edile", "ristrutturazioni appartamenti"], googleMatch: "edil|costruzion|ristruttura|general contractor|construction" },
  { slug: "muratori", name: "Muratore", plural: "Muratori", singular: "muratore", group: "Casa", intro: "Piccoli lavori di muratura, tramezzi, intonaci, massetti e riparazioni.", queries: ["muratore"], googleMatch: "murator|mason|edil" },
  { slug: "piastrellisti", name: "Posa pavimenti", plural: "Piastrellisti", singular: "piastrellista", group: "Casa", intro: "Posa di pavimenti e rivestimenti in ceramica, gres, parquet e resina.", queries: ["piastrellista", "posa pavimenti"], googleMatch: "piastrell|pavimen|tile|parquet" },
  { slug: "falegnami", name: "Falegname", plural: "Falegnami", singular: "falegname", group: "Casa", intro: "Mobili su misura, porte, infissi in legno e riparazioni.", queries: ["falegname", "falegnameria"], googleMatch: "falegnam|carpent|mobili su misura|woodwork" },
  { slug: "fabbri", name: "Fabbro", plural: "Fabbri", singular: "fabbro", group: "Casa", intro: "Apertura porte, serrature, cancelli, inferriate e lavori in ferro.", queries: ["fabbro", "pronto intervento fabbro"], googleMatch: "fabbr|serratur|locksmith|carpenteria metallica" },
  { slug: "serramentisti", name: "Infissi e serramenti", plural: "Serramentisti", singular: "serramentista", group: "Casa", intro: "Finestre, porte, persiane e zanzariere: fornitura, posa e sostituzione.", queries: ["serramenti", "infissi"], googleMatch: "serrament|infiss|finestr|window" },
  { slug: "termoidraulici", name: "Caldaie e climatizzatori", plural: "Termoidraulici", singular: "termoidraulico", group: "Casa", intro: "Installazione e manutenzione di caldaie, climatizzatori e pompe di calore.", queries: ["installazione condizionatori", "assistenza caldaie"], googleMatch: "termoidraul|caldai|climatizz|condizionat|hvac|riscaldamento|pompe di calore" },
  { slug: "installatori-fotovoltaico", name: "Impianto fotovoltaico", plural: "Installatori fotovoltaico", singular: "installatore fotovoltaico", group: "Casa", intro: "Progetto e posa di impianti fotovoltaici, accumuli e pratiche per gli incentivi.", queries: ["installatore fotovoltaico", "impianti fotovoltaici"], googleMatch: "fotovolta|solar|energie rinnovabili" },
  { slug: "giardinieri", name: "Giardiniere", plural: "Giardinieri", singular: "giardiniere", group: "Casa", intro: "Manutenzione del verde, potature, prati, irrigazione e progettazione di giardini.", queries: ["giardiniere", "manutenzione giardini"], googleMatch: "giardin|vivai|gardener|landscap|verde" },
  { slug: "imprese-di-pulizie", name: "Pulizie", plural: "Imprese di pulizie", singular: "impresa di pulizie", gender: "f", group: "Casa", intro: "Pulizie di casa, uffici, condomini e fine cantiere.", queries: ["impresa di pulizie", "pulizie casa"], googleMatch: "pulizi|cleaning|sanificazion" },
  { slug: "disinfestatori", name: "Disinfestazione", plural: "Disinfestatori", singular: "disinfestatore", group: "Casa", intro: "Disinfestazione da insetti, derattizzazione e allontanamento volatili.", queries: ["disinfestazione", "derattizzazione"], googleMatch: "disinfest|derattizz|pest control" },
  { slug: "traslocatori", name: "Trasloco", plural: "Ditte di traslochi", singular: "ditta di traslochi", gender: "f", group: "Casa", intro: "Traslochi di casa e ufficio, montaggio mobili, deposito e sgomberi.", queries: ["ditta traslochi", "traslochi"], googleMatch: "trasloc|moving|sgomber|deposito mobili" },
  { slug: "architetti", name: "Architetto", plural: "Architetti", singular: "architetto", group: "Casa", intro: "Progetto, pratiche edilizie, direzione lavori e interior design.", queries: ["architetto", "studio di architettura"], googleMatch: "architett|architect" },
  { slug: "geometri", name: "Geometra", plural: "Geometri", singular: "geometra", group: "Casa", intro: "Pratiche catastali e comunali, APE, rilievi e computi.", queries: ["geometra", "studio tecnico geometra"], googleMatch: "geometr|studio tecnico|surveyor" },
  { slug: "interior-designer", name: "Interior design", plural: "Interior designer", singular: "interior designer", group: "Casa", intro: "Progetto d'interni, arredo, luci e home staging.", queries: ["interior designer", "arredatore d'interni"], googleMatch: "interior|arredator|design d'interni" },
  { slug: "tecnici-elettrodomestici", name: "Riparazione elettrodomestici", plural: "Tecnici elettrodomestici", singular: "tecnico elettrodomestici", group: "Casa", intro: "Riparazione di lavatrici, frigoriferi, forni e lavastoviglie a domicilio.", queries: ["riparazione elettrodomestici"], googleMatch: "elettrodomestic|appliance repair" },

  // ---------- Eventi ----------
  { slug: "fotografi", name: "Fotografo", plural: "Fotografi", singular: "fotografo", group: "Eventi", intro: "Matrimoni, eventi, ritratti, prodotti e servizi aziendali.", queries: ["fotografo", "fotografo matrimonio"], googleMatch: "fotograf|photograph" },
  { slug: "videomaker", name: "Video", plural: "Videomaker", singular: "videomaker", group: "Eventi", intro: "Video di matrimoni, eventi, spot e contenuti per i social.", queries: ["videomaker", "riprese video matrimonio"], googleMatch: "video|riprese|film" },
  { slug: "catering", name: "Catering", plural: "Servizi catering", singular: "servizio catering", group: "Eventi", intro: "Catering per matrimoni, feste private ed eventi aziendali.", queries: ["catering", "catering eventi"], googleMatch: "catering|banqueting" },
  { slug: "dj", name: "DJ", plural: "DJ", singular: "DJ", group: "Eventi", intro: "DJ set e impianti audio per matrimoni, feste e locali.", queries: ["dj per matrimoni", "dj per feste"], googleMatch: "\\bdj\\b|disc jockey|intrattenimento musicale" },
  { slug: "musicisti", name: "Musica dal vivo", plural: "Musicisti e band", singular: "musicista", group: "Eventi", intro: "Band, cantanti e musicisti per cerimonie, feste ed eventi.", queries: ["band per matrimoni", "musica dal vivo eventi"], googleMatch: "music|band|cantant|orchestra" },
  { slug: "animatori", name: "Animazione feste", plural: "Animatori", singular: "animatore", group: "Eventi", intro: "Animazione per feste di bambini, compleanni ed eventi.", queries: ["animatori feste bambini", "animazione compleanni"], googleMatch: "animazion|animator|clown|feste per bambini" },
  { slug: "wedding-planner", name: "Organizzazione matrimonio", plural: "Wedding planner", singular: "wedding planner", group: "Eventi", intro: "Organizzazione completa o parziale del matrimonio, fornitori e coordinamento.", queries: ["wedding planner"], googleMatch: "wedding|matrimon|organizzazione eventi" },
  { slug: "fioristi", name: "Allestimenti floreali", plural: "Fioristi", singular: "fiorista", group: "Eventi", intro: "Allestimenti floreali per matrimoni, cerimonie ed eventi.", queries: ["fiorista matrimonio", "allestimenti floreali"], googleMatch: "fior|florist|allestiment" },
  { slug: "noleggio-auto-cerimonie", name: "Auto per cerimonie", plural: "Noleggio auto per cerimonie", singular: "noleggio auto per cerimonie", group: "Eventi", intro: "Auto d'epoca e di lusso con autista per matrimoni ed eventi.", queries: ["noleggio auto matrimonio"], googleMatch: "noleggio|limousine|auto d'epoca|chauffeur" },

  // ---------- Benessere e salute ----------
  { slug: "personal-trainer", name: "Personal trainer", plural: "Personal trainer", singular: "personal trainer", group: "Benessere", intro: "Allenamento personalizzato a domicilio, all'aperto o in palestra.", queries: ["personal trainer"], googleMatch: "personal trainer|fitness|palestra|allenator" },
  { slug: "nutrizionisti", name: "Nutrizionista", plural: "Nutrizionisti", singular: "nutrizionista", group: "Benessere", intro: "Piani alimentari, educazione alimentare e percorsi di dimagrimento.", queries: ["nutrizionista", "dietista"], googleMatch: "nutrizion|dietist|dietolog" },
  { slug: "psicologi", name: "Psicologo", plural: "Psicologi", singular: "psicologo", group: "Benessere", intro: "Sostegno psicologico e psicoterapia, in studio e online.", queries: ["psicologo", "psicoterapeuta"], googleMatch: "psicolog|psicoterap|psychologist" },
  { slug: "fisioterapisti", name: "Fisioterapista", plural: "Fisioterapisti", singular: "fisioterapista", group: "Benessere", intro: "Riabilitazione, terapie manuali e strumentali, anche a domicilio.", queries: ["fisioterapista", "fisioterapia a domicilio"], googleMatch: "fisioterap|physiotherap|riabilitazion" },
  { slug: "estetiste", name: "Estetista", plural: "Estetiste", singular: "estetista", gender: "f", group: "Benessere", intro: "Trattamenti viso e corpo, epilazione, manicure, anche a domicilio.", queries: ["estetista", "centro estetico"], googleMatch: "estetic|estetist|beauty|nail" },
  { slug: "parrucchieri", name: "Parrucchiere", plural: "Parrucchieri", singular: "parrucchiere", group: "Benessere", intro: "Taglio, colore e acconciature, anche per sposa e a domicilio.", queries: ["parrucchiere", "parrucchiere sposa"], googleMatch: "parrucch|hair|acconciat|barbier" },
  { slug: "truccatori", name: "Trucco", plural: "Truccatori", singular: "truccatore", group: "Benessere", intro: "Trucco sposa, eventi, servizi fotografici e corsi di make-up.", queries: ["truccatrice sposa", "make up artist"], googleMatch: "trucc|make.?up" },
  { slug: "massaggiatori", name: "Massaggi", plural: "Massaggiatori", singular: "massaggiatore", group: "Benessere", intro: "Massaggi rilassanti, sportivi e decontratturanti, anche a domicilio.", queries: ["massaggiatore", "massaggi a domicilio"], googleMatch: "massagg|massage|shiatsu" },

  // ---------- Lezioni ----------
  { slug: "insegnanti-inglese", name: "Lezioni di inglese", plural: "Insegnanti di inglese", singular: "insegnante di inglese", group: "Lezioni", intro: "Lezioni private e corsi di inglese per tutti i livelli, anche online.", queries: ["lezioni di inglese", "insegnante di inglese"], googleMatch: "ingles|english|lingu|language school" },
  { slug: "ripetizioni", name: "Ripetizioni", plural: "Insegnanti per ripetizioni", singular: "insegnante per ripetizioni", group: "Lezioni", intro: "Ripetizioni e doposcuola di matematica, fisica, latino e altre materie.", queries: ["ripetizioni", "doposcuola"], googleMatch: "ripetizion|doposcuola|tutor|centro studi" },
  { slug: "insegnanti-musica", name: "Lezioni di musica", plural: "Insegnanti di musica", singular: "insegnante di musica", group: "Lezioni", intro: "Lezioni di pianoforte, chitarra, canto e altri strumenti.", queries: ["lezioni di pianoforte", "lezioni di chitarra"], googleMatch: "music|pianofort|chitarr|canto" },
  { slug: "istruttori-guida", name: "Scuola guida", plural: "Autoscuole", singular: "autoscuola", gender: "f", group: "Lezioni", intro: "Patenti, guide extra e corsi di recupero punti.", queries: ["autoscuola"], googleMatch: "autoscuol|scuola guida|driving school" },

  // ---------- Aziende e professioni ----------
  { slug: "commercialisti", name: "Commercialista", plural: "Commercialisti", singular: "commercialista", group: "Aziende", intro: "Contabilità, dichiarazioni, partita IVA, bilanci e consulenza fiscale.", queries: ["commercialista", "studio commercialista"], googleMatch: "commercialist|contabil|fiscal|accountant|tributar" },
  { slug: "avvocati", name: "Avvocato", plural: "Avvocati", singular: "avvocato", group: "Aziende", intro: "Consulenza e assistenza legale in ambito civile, penale, lavoro e famiglia.", queries: ["avvocato", "studio legale"], googleMatch: "avvocat|legal|lawyer" },
  { slug: "consulenti-lavoro", name: "Consulente del lavoro", plural: "Consulenti del lavoro", singular: "consulente del lavoro", group: "Aziende", intro: "Buste paga, contratti, assunzioni e adempimenti per datori di lavoro.", queries: ["consulente del lavoro"], googleMatch: "consulent.*lavoro|paghe|payroll" },
  { slug: "notai", name: "Notaio", plural: "Notai", singular: "notaio", group: "Aziende", intro: "Compravendite, mutui, successioni, costituzione di società.", queries: ["notaio"], googleMatch: "notai|notary" },
  { slug: "web-designer", name: "Sito web", plural: "Web designer", singular: "web designer", group: "Aziende", intro: "Siti vetrina, e-commerce e restyling, con o senza gestione dei contenuti.", queries: ["web designer", "realizzazione siti web"], googleMatch: "web|siti internet|internet|digital" },
  { slug: "grafici", name: "Grafica", plural: "Grafici", singular: "grafico", group: "Aziende", intro: "Loghi, immagine coordinata, stampati e grafica per i social.", queries: ["grafico", "studio grafico"], googleMatch: "grafic|graphic|design" },
  { slug: "traduttori", name: "Traduzioni", plural: "Traduttori", singular: "traduttore", group: "Aziende", intro: "Traduzioni tecniche, legali e giurate, interpretariato.", queries: ["traduttore", "traduzioni giurate"], googleMatch: "tradu|translat|interpret" },
  { slug: "informatici", name: "Assistenza informatica", plural: "Tecnici informatici", singular: "tecnico informatico", group: "Aziende", intro: "Riparazione computer, reti, backup e assistenza a privati e uffici.", queries: ["assistenza computer", "tecnico informatico"], googleMatch: "informatic|computer|pc|it service|reti" },

  // ---------- Auto e trasporti ----------
  { slug: "meccanici", name: "Meccanico", plural: "Meccanici", singular: "meccanico", group: "Auto", intro: "Tagliandi, riparazioni, revisioni e diagnosi.", queries: ["meccanico", "officina auto"], googleMatch: "meccanic|officin|auto repair|autoriparaz" },
  { slug: "carrozzerie", name: "Carrozzeria", plural: "Carrozzerie", singular: "carrozzeria", gender: "f", group: "Auto", intro: "Riparazione carrozzeria, verniciatura, grandine e sinistri.", queries: ["carrozzeria"], googleMatch: "carrozz|body shop" },

  // ---------- Animali ----------
  { slug: "dog-sitter", name: "Dog sitter", plural: "Dog sitter", singular: "dog sitter", group: "Animali", intro: "Passeggiate, pensione e cura del cane a domicilio.", queries: ["dog sitter", "pensione cani"], googleMatch: "dog|cani|pet sitter|pensione per animali" },
  { slug: "toelettature", name: "Toelettatura", plural: "Toelettature", singular: "toelettatura", gender: "f", group: "Animali", intro: "Bagno, tosatura e cura del pelo per cani e gatti.", queries: ["toelettatura cani"], googleMatch: "toelett|grooming" },
  { slug: "addestratori-cani", name: "Addestramento cani", plural: "Addestratori cinofili", singular: "addestratore cinofilo", group: "Animali", intro: "Educazione di base, problemi di comportamento e corsi per cuccioli.", queries: ["addestratore cani", "educatore cinofilo"], googleMatch: "addestr|cinofil|dog train" },
];

async function main() {
  let i = 0;
  for (const s of SERVICES) {
    const data = { ...s, gender: s.gender ?? "m", position: i };
    await db.service.upsert({ where: { slug: s.slug }, create: data, update: data });
    i++;
  }
  console.log(`servizi: ${await db.service.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
