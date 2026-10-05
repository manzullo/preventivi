// Assegna le categorie (servizi) alle schede che non ne hanno nessuna,
// partendo dalle competenze già riconosciute (Agency.skills): le voci del
// catalogo di src/lib/skills.ts con la mappa qui sotto, le voci del
// vocabolario data/competenze.json con la categoria in cui stanno. Le
// categorie sono quelle di scripts/seed-services.ts. Uso:
//   tsx scripts/servizi-da-skill.ts [--dry]
import "./lib/env";
import { db } from "../src/lib/db";
import { SKILLS } from "../src/lib/skills";
import { recalcAllScores } from "../src/modules/ranking/score";
import { vocabolario } from "./lib/competenze-voci";
import { argomenti } from "./lib/siti";

const { flag } = argomenti();
const DRY = flag("--dry");

// Competenze di src/lib/skills.ts → categorie. Restano fuori quelle che
// valgono per troppi mestieri ("Pronto intervento 24h", "Matrimoni", "Sposa",
// "Bonus edilizi", "A domicilio", "Online"): da sole non dicono che lavoro fa.
const SKILL_TO_SERVICE: Record<string, string[]> = {
  "Sblocco scarichi": ["idraulici"],
  "Ricerca perdite": ["idraulici"],
  "Bagni": ["imprese-edili"],
  "Caldaie": ["termoidraulici"],
  "Climatizzatori": ["termoidraulici"],
  "Pompe di calore": ["termoidraulici"],
  "Fotovoltaico": ["installatori-fotovoltaico"],
  "Domotica": ["elettricisti"],
  "Cappotto termico": ["imprese-edili"],
  "Cartongesso": ["muratori"],
  "Parquet": ["piastrellisti"],
  "Resina": ["piastrellisti"],
  "Apertura porte": ["fabbri"],
  "Potature": ["giardinieri"],
  "Sgomberi": ["traslocatori"],
  "Pratiche edilizie": ["geometri"],
  "Feste di compleanno": ["animatori"],
  "Drone": ["videomaker"],
  "Partita IVA forfettaria": ["commercialisti"],
  "Dichiarazione dei redditi": ["commercialisti"],
  "Traduzioni giurate": ["traduttori"],
  "E-commerce": ["web-designer"],
};

async function main() {
  const tutti = await db.service.findMany({ select: { id: true, slug: true, name: true, queries: true } });
  const servizi = new Map(tutti.map((s) => [s.slug, s.id]));
  const mancanti = [...new Set(Object.values(SKILL_TO_SERVICE).flat())].filter((s) => !servizi.has(s));
  if (mancanti.length) console.log(`attenzione: categorie della mappa assenti nel database (lancia npm run seed:services): ${mancanti.join(", ")}`);
  const sconosciute = Object.keys(SKILL_TO_SERVICE).filter((k) => !SKILLS.some((s) => s.name === k));
  if (sconosciute.length) console.log(`attenzione: competenze della mappa non più nel catalogo: ${sconosciute.join(", ")}`);
  const { categorieDi } = vocabolario(tutti);

  const rows = await db.agency.findMany({ where: { services: { none: {} }, optedOutAt: null }, select: { id: true, name: true, skills: true } });
  let assegnati = 0, senzaMappa = 0, legami = 0;
  for (const a of rows) {
    const skills = Array.isArray(a.skills) ? (a.skills as string[]) : [];
    // Una voce del vocabolario che sta in più categorie non decide: si tengono solo quelle univoche.
    const slugs = [...new Set(skills.flatMap((s) => SKILL_TO_SERVICE[s] ?? ((categorieDi.get(s) ?? []).length === 1 ? categorieDi.get(s)! : [])))].filter((s) => servizi.has(s));
    if (!slugs.length) { senzaMappa++; continue; }
    if (DRY && assegnati < 10) console.log(`  ${a.name} → ${slugs.join(", ")}`);
    if (!DRY) {
      for (const [i, slug] of slugs.entries()) {
        await db.agencyService.upsert({ where: { agencyId_serviceId: { agencyId: a.id, serviceId: servizi.get(slug)! } }, create: { agencyId: a.id, serviceId: servizi.get(slug)!, weight: Math.max(1, 10 - i) }, update: {} });
      }
    }
    legami += slugs.length;
    assegnati++;
  }
  if (!DRY && assegnati) await recalcAllScores();
  console.log(JSON.stringify({ senzaCategorie: rows.length, conCategorieNuove: assegnati, categorieAssegnate: legami, senzaCompetenzeUtili: senzaMappa, dry: DRY }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
