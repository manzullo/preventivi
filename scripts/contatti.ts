// Recupera i contatti mancanti (telefono, email, partita IVA) dalle pagine
// pubbliche dei professionisti con un sito, pubblicati e in bozza: prima
// dall'archivio di enrich-sites (data/raw/sites/), poi con una visita alla
// home e alla pagina contatti. Si riempiono solo i campi vuoti. Uso:
//   tsx scripts/contatti.ts [--city roma] [--limit 500] [--solo-file] [--dry] [--confirm]
// --solo-file  usa solo l'archivio, niente rete
// --dry        conta cosa scriverebbe e si ferma prima della rete
// La visita ai siti vuole INGEST_ENABLED=1 e --confirm, come ogni ingest di rete.
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { politeGet } from "../src/modules/ingest/http";
import { ingestAllowed } from "../src/modules/ingest/types";
import { argomenti, DIR_CONTATTI, emailDa, inParallelo, pivaDa, schedeConSito, sitiLetti, telefonoDa, testoDa } from "./lib/siti";

const { opt, flag } = argomenti();
const CITY = opt("--city");
const LIMIT = Number(opt("--limit", "0"));
const DRY = flag("--dry");
const SOLO_FILE = flag("--solo-file");

type Trovato = { phone?: string; email?: string; piva?: string };

async function scrivi(a: { id: string; phone: string | null; email: string | null; vatNumber: string | null }, t: Trovato) {
  const data = {
    ...(t.phone && !a.phone ? { phone: t.phone } : {}),
    ...(t.email && !a.email ? { email: t.email } : {}),
    ...(t.piva && !a.vatNumber ? { vatNumber: t.piva } : {}),
  };
  if (!DRY && Object.keys(data).length) await db.agency.update({ where: { id: a.id }, data });
  return data;
}

async function main() {
  const rows = await schedeConSito({ city: CITY, limit: LIMIT, extra: { OR: [{ phone: null }, { email: null }] } });
  console.log(`professionisti con sito e senza telefono o email: ${rows.length}${CITY ? ` (${CITY})` : ""}`);

  // 1. Dall'archivio dei siti già letti, senza toccare la rete.
  const archivio = sitiLetti();
  let daFile = 0;
  const restano: typeof rows = [];
  for (const a of rows) {
    const j = archivio.get(a.host);
    const testo = [j?.textSample, j?.address].filter(Boolean).join(" ");
    const t: Trovato = { phone: j?.phone ?? (testo ? telefonoDa(testo) : null) ?? undefined, email: j?.email ?? undefined, piva: j?.piva ?? undefined };
    const scritti = await scrivi(a, t);
    if (Object.keys(scritti).length) daFile++;
    if (!(a.phone ?? t.phone) || !(a.email ?? t.email)) restano.push(a);
  }
  console.log(`${DRY ? "[dry] " : ""}schede completate dall'archivio: ${daFile} · ancora incomplete: ${restano.length}`);

  if (SOLO_FILE || DRY) {
    if (DRY) for (const a of restano.slice(0, 10)) console.log(`  da visitare: ${a.name} · ${a.website}`);
    console.log(JSON.stringify({ daFile, daVisitare: restano.length, dry: DRY }));
    return;
  }

  // 2. Visita mirata: home e pagina contatti.
  ingestAllowed(flag("--confirm"));
  fs.mkdirSync(DIR_CONTATTI, { recursive: true });
  let daRete = 0, email = 0, piva = 0, senza = 0;
  await inParallelo(restano, 4, async (a) => {
    const base = a.website.replace(/\/$/, "");
    const pagine = [base, `${base}/contatti/`, `${base}/contatti`, `${base}/contact/`, `${base}/chi-siamo/`];
    const t: Trovato = {};
    for (const url of pagine) {
      let html: string;
      try { html = (await politeGet(url)).slice(0, 400_000); } catch { continue; }
      if (!/<(html|body)\b/i.test(html)) continue;
      const testo = testoDa(html);
      t.phone ??= telefonoDa(testo) ?? telefonoDa(html.match(/href=["']tel:([^"']+)["']/i)?.[1] ?? "") ?? undefined;
      t.email ??= emailDa(html.match(/mailto:([^"'?\s>]+)/i)?.[1] ?? "") ?? emailDa(testo) ?? undefined;
      t.piva ??= pivaDa(testo) ?? undefined;
      if (t.phone && t.email) break;
    }
    if (!t.phone && !t.email && !t.piva) { senza++; return; }
    fs.writeFileSync(`${DIR_CONTATTI}/${a.host}.json`, JSON.stringify({ nome: a.name, slug: a.slug, ...t, letto: new Date().toISOString() }));
    const scritti = await scrivi(a, t);
    if ("phone" in scritti) daRete++;
    if ("email" in scritti) email++;
    if ("vatNumber" in scritti) piva++;
  });
  console.log(JSON.stringify({ daFile, telefoniDalSito: daRete, emailNuove: email, partiteIva: piva, senzaContatti: senza }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
