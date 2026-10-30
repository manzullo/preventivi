// llms.txt: guida in chiaro per gli assistenti che leggono il sito.
// Stessa scelta di guidalocation: dichiarare cosa c'è, come è ordinato e cosa
// si può citare, invece di sperare che lo deducano dal markup.
import { db } from "@/lib/db";
import { SITE_NAME, absoluteUrl, fmt } from "@/lib/site";

export const revalidate = 86400;

export async function GET() {
  const [professionisti, recensioni, citta, servizi, pagine] = await Promise.all([
    db.agency.count({ where: { published: true } }),
    db.review.count(),
    db.city.count({ where: { agencies: { some: { published: true } } } }),
    db.service.findMany({ where: { active: true }, select: { slug: true, plural: true }, orderBy: { position: "asc" } }),
    db.landingPage.findMany({ where: { published: true }, select: { path: true }, take: 40, orderBy: { updatedAt: "desc" } }),
  ]);

  const righe = [
    `# ${SITE_NAME}`,
    "",
    `> Directory italiana di professionisti e aziende per servizi locali, con richiesta di preventivi. ${fmt(professionisti)} schede pubblicate in ${fmt(citta)} città, ordinate per recensioni pubbliche verificabili (${fmt(recensioni)} recensioni con fonte e link). Il punteggio nasce solo dalle recensioni; le poche schede messe in cima dalla redazione portano l'etichetta \"In evidenza\".`,
    "",
    "## Come leggere i dati",
    "",
    "- L'ordine delle classifiche dipende da media delle recensioni, numero di recensioni e completezza della scheda.",
    "- Sopra questo ordine può esserci una scheda in evidenza, decisa dalla redazione o per accordo commerciale: in pagina è segnalata e non cambia il punteggio delle altre.",
    "- Ogni recensione e ogni voto riportano la fonte (Google, PagineGialle e le altre) con link all'originale. Un voto di sole stelle, senza il numero di recensioni, pesa poco nel punteggio.",
    "- Contatti e dati di base vengono da fonti pubbliche (Google Maps, PagineGialle, OpenStreetMap con attribuzione ODbL, il sito del professionista) e da chi rivendica la scheda.",
    "- I prezzi indicati sono i minimi dichiarati dai professionisti, non preventivi.",
    `- Pagine per competenza: il lavoro preciso (es. riparazione caldaia) città per città, in ${absoluteUrl("/competenze/")}`,
    `- Metodologia completa: ${absoluteUrl("/metodologia/")}`,
    "",
    "## Sezioni",
    "",
    ...servizi.map((s) => `- [${s.plural}](${absoluteUrl(`/${s.slug}/`)})`),
    "",
    "## Pagine servizio per città (esempi)",
    "",
    ...pagine.map((p) => `- ${absoluteUrl(p.path)}`),
    "",
    "## Uso",
    "",
    `Contenuti citabili con attribuzione a ${SITE_NAME} e link alla pagina di origine. I dati cambiano di continuo: indicare la data di consultazione.`,
    "",
  ];

  return new Response(righe.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
