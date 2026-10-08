// Catalogo delle competenze (più fini dei servizi). Ogni voce ha le parole
// che la fanno riconoscere nei testi (sito del professionista) e nelle etichette
// delle fonti. Le etichette sono in italiano, come le chip in scheda.

export type SkillDef = { name: string; group: string; match: RegExp };

const r = (s: string) => new RegExp(s, "i");

export const SKILLS: SkillDef[] = [
  // Il lavoro preciso dentro una categoria: chi cerca "sblocco scarico" o
  // "caldaia a condensazione" cerca un idraulico che lo fa. Catalogo iniziale,
  // si allarga con le parole che la gente usa davvero (Search Console, form).
  // Casa
  { name: "Pronto intervento 24h", group: "casa", match: r("pronto intervento|24 ?h|24 ore su 24|h24|reperibilit[aà]") },
  { name: "Sblocco scarichi", group: "casa", match: r("sblocc|spurgh|disotturaz|scarichi otturati") },
  { name: "Ricerca perdite", group: "casa", match: r("ricerca perdit|perdite d'acqua|termografi") },
  { name: "Bagni", group: "casa", match: r("rifacimento bagn|ristrutturazione bagn|trasformazione vasca|box doccia") },
  { name: "Caldaie", group: "casa", match: r("caldai|condensazione") },
  { name: "Climatizzatori", group: "casa", match: r("climatizz|condizionator|aria condizionata") },
  { name: "Pompe di calore", group: "casa", match: r("pompa di calore|pompe di calore") },
  { name: "Fotovoltaico", group: "casa", match: r("fotovoltaic|pannelli solari") },
  { name: "Domotica", group: "casa", match: r("domotic|smart home|casa intelligente") },
  { name: "Certificazioni impianti", group: "casa", match: r("dichiarazione di conformit|certificazion[ei] impiant|\\bdico\\b") },
  { name: "Cappotto termico", group: "casa", match: r("cappotto termic|isolamento termic") },
  { name: "Cartongesso", group: "casa", match: r("cartongess") },
  { name: "Parquet", group: "casa", match: r("parquet") },
  { name: "Resina", group: "casa", match: r("pavimenti in resina|resina") },
  { name: "Apertura porte", group: "casa", match: r("apertura port|porte blindat|cambio serratur") },
  { name: "Potature", group: "casa", match: r("potatur|abbattimento alberi|tree climbing") },
  { name: "Sgomberi", group: "casa", match: r("sgomber") },
  { name: "Pratiche edilizie", group: "casa", match: r("cila|scia\\b|pratiche edilizie|sanatori|condono") },
  { name: "Bonus edilizi", group: "casa", match: r("bonus|ecobonus|detrazion|sconto in fattura") },
  // Eventi
  { name: "Matrimoni", group: "eventi", match: r("matrimon|sposi|wedding|nozze") },
  { name: "Battesimi e comunioni", group: "eventi", match: r("battesim|comunion|cresim") },
  { name: "Feste di compleanno", group: "eventi", match: r("compleann|feste per bambini|18 anni|diciottesim") },
  { name: "Eventi aziendali", group: "eventi", match: r("eventi aziendali|corporate|convention|team building") },
  { name: "Drone", group: "eventi", match: r("drone|riprese aeree") },
  // Benessere
  { name: "A domicilio", group: "benessere", match: r("a domicilio|presso il cliente|a casa tua") },
  { name: "Online", group: "benessere", match: r("online|videochiamata|da remoto|a distanza") },
  { name: "Sposa", group: "benessere", match: r("sposa|bridal") },
  // Aziende
  { name: "Partita IVA forfettaria", group: "aziende", match: r("forfettari|regime forfett") },
  { name: "Dichiarazione dei redditi", group: "aziende", match: r("730|dichiarazione dei redditi|modello redditi|unico") },
  { name: "Traduzioni giurate", group: "aziende", match: r("giurat|asseverat") },
  { name: "E-commerce", group: "aziende", match: r("e-?commerce|negozio online|shopify|woocommerce") },
];

/** Competenze riconosciute in un testo (sito, descrizione, etichette). */
export function detectSkills(text: string): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  for (const s of SKILLS) if (s.match.test(t)) out.push(s.name);
  return out;
}

/** Etichette delle fonti → competenze (le etichette non coperte passano da detectSkills). */
export const SOURCE_SKILLS: Record<string, string[]> = {
  // Categorie Google Maps che dicono già la competenza.
  "Servizio di sturatura": ["Sblocco scarichi"],
  "Installatore di impianti fotovoltaici": ["Fotovoltaico"],
  "Fotografo di matrimoni": ["Matrimoni"],
  "Wedding planner": ["Matrimoni"],
};

export function skillsFromLabels(labels: string[]): string[] {
  const out = new Set<string>();
  for (const l of labels) for (const s of SOURCE_SKILLS[l] ?? detectSkills(l)) out.add(s);
  return [...out];
}
