// Legge la home page dei professionisti che hanno un sito (schede pubblicate
// e bozze) e ne estrae dati di fatto: titolo, descrizione, telefono, email,
// P.IVA, indirizzo, social, competenze riconosciute. Non scrive nel database:
// il grezzo va in data/raw/sites/<host>.json e lo usano contatti.ts,
// citta-da-sito.ts, piva-import.ts e dubbi-doppioni.ts. Ogni lettura passa da
// politeGet (robots.txt, pausa per sito, User-Agent dichiarato). Uso:
//   tsx scripts/enrich-sites.ts [--city roma] [--limit 200] [--rifai] [--dry] --confirm
// --rifai  rilegge anche i siti già in archivio
// --dry    mostra quanti siti leggerebbe, senza toccare la rete
// Serve INGEST_ENABLED=1 e --confirm, come per ogni ingest di rete.
import "./lib/env";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import { detectSkills } from "../src/lib/skills";
import { politeGet } from "../src/modules/ingest/http";
import { ingestAllowed } from "../src/modules/ingest/types";
import { vocabolario } from "./lib/competenze-voci";
import { argomenti, DIR_SITI, emailDa, indirizzoDa, inParallelo, pivaDa, schedeConSito, telefonoDa, testoDa } from "./lib/siti";

const { opt, flag } = argomenti();
const CITY = opt("--city");
const LIMIT = Number(opt("--limit", "0"));
const DRY = flag("--dry");
const RIFAI = flag("--rifai");

const pick = (html: string, re: RegExp) => html.match(re)?.[1]?.trim() ?? null;

async function main() {
  const schede = await schedeConSito({ city: CITY, limit: LIMIT });
  // Un sito, una lettura: due schede con lo stesso dominio sono un caso per fondi-doppioni.
  const visti = new Set<string>();
  const tutti = schede.filter((s) => (visti.has(s.host) ? false : (visti.add(s.host), true)));
  const jobs = tutti.filter((s) => RIFAI || !fs.existsSync(path.join(DIR_SITI, `${s.host}.json`)));
  console.log(`siti di professionisti: ${tutti.length}${CITY ? ` (${CITY})` : ""} · da leggere: ${jobs.length}`);
  if (DRY) {
    for (const s of jobs.slice(0, 10)) console.log(`  ${s.name} · ${s.website}`);
    console.log(JSON.stringify({ daLeggere: jobs.length, dry: true }));
    return;
  }
  ingestAllowed(flag("--confirm"));
  fs.mkdirSync(DIR_SITI, { recursive: true });

  // Voci del vocabolario per le categorie di ogni scheda (stesso criterio di scripts/competenze.ts).
  const servizi = await db.service.findMany({ select: { slug: true, name: true, queries: true } });
  const { trova } = vocabolario(servizi);
  const categorie = new Map(
    (await db.agencyService.findMany({ where: { agencyId: { in: jobs.map((j) => j.id) } }, select: { agencyId: true, service: { select: { slug: true } } } }))
      .reduce((m, x) => m.set(x.agencyId, [...(m.get(x.agencyId) ?? []), x.service.slug]), new Map<string, string[]>()),
  );

  let ok = 0, ko = 0;
  await inParallelo(jobs, 4, async (r) => {
    const out = path.join(DIR_SITI, `${r.host}.json`);
    try {
      const html = (await politeGet(r.website)).slice(0, 600_000);
      const text = testoDa(html).slice(0, 60_000);
      const telLink = html.match(/href=["']tel:([^"']+)["']/i)?.[1] ?? "";
      const data = {
        name: r.name, website: r.website, host: r.host, slug: r.slug,
        title: pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
        description: pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ?? pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i),
        phone: telefonoDa(text) ?? telefonoDa(telLink),
        email: emailDa(html.match(/mailto:([^"'?\s>]+)/i)?.[1] ?? "") ?? emailDa(text),
        piva: pivaDa(text),
        address: indirizzoDa(text),
        // La città della scheda compare sul sito? Aiuta a riconoscere sedi sbagliate.
        mentionsCity: r.city ? new RegExp(`\\b${r.city.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text) : null,
        social: {
          instagram: html.match(/https?:\/\/(?:www\.)?instagram\.com\/[a-z0-9_.]+/i)?.[0] ?? null,
          linkedin: html.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:company|in)\/[a-z0-9_.-]+/i)?.[0] ?? null,
          facebook: html.match(/https?:\/\/(?:www\.)?facebook\.com\/[a-z0-9_.-]+/i)?.[0] ?? null,
        },
        skills: detectSkills(text),
        voci: trova(text, categorie.get(r.id) ?? []),
        textSample: text.slice(0, 1500),
        text: text.slice(0, 40_000),
        fetchedAt: new Date().toISOString(),
      };
      fs.writeFileSync(out, JSON.stringify(data, null, 1));
      ok++;
    } catch (e) {
      fs.writeFileSync(out, JSON.stringify({ name: r.name, website: r.website, host: r.host, error: String(e).slice(0, 200), fetchedAt: new Date().toISOString() }, null, 1));
      ko++;
    }
    if ((ok + ko) % 50 === 0) console.log(`… ${ok + ko}/${jobs.length} · letti ${ok}`);
  });
  console.log(JSON.stringify({ letti: ok, errori: ko, cartella: DIR_SITI }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
