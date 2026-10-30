// Competenze delle schede, dedotte dal testo: per ogni professionista si
// prendono le voci del vocabolario delle sue categorie (data/competenze.json,
// vedi scripts/vocabolario-competenze.ts) e si tiene una voce se tutte le sue
// parole compaiono nella stessa frase di nome, descrizione o servizi della
// fonte, più la home del suo sito se scripts/enrich-sites.ts l'ha letta. "Riparazione caldaia" entra con "riparazioni di caldaie e
// scaldabagni", non con "riparazioni" in una frase e "caldaia" in un'altra.
// Il risultato va in Agency.skills e alimenta /competenze/{voce}/{città}/.
//
//   tsx scripts/competenze.ts            calcola e salva
//   tsx scripts/competenze.ts --dry      mostra quante schede per voce
import fs from "node:fs";
for (const line of (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
import { db } from "../src/lib/db";
import { sitiLetti } from "./lib/siti";

const DRY = process.argv.includes("--dry");
const VOCABOLARIO: Record<string, string[]> = JSON.parse(fs.readFileSync("data/competenze.json", "utf8"));

const STOP = new Set(["di", "a", "e", "ed", "per", "del", "della", "dello", "dei", "delle", "degli", "in", "con", "da", "dal", "il", "lo", "la", "le", "gli", "un", "una", "su", "al", "alla", "roma"]);
const piano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const parole = (s: string) => piano(s).split(/[^a-z0-9]+/).filter(Boolean);
/** Radice corta: "riparazione" → "ripara", "caldaia" → "calda", "wc" → "wc". */
const radice = (w: string) => (w.length > 7 ? w.slice(0, 6) : w.length > 4 ? w.slice(0, w.length - 2) : w);

type Voce = { nome: string; radici: string[] };
const voci = new Map<string, Voce[]>(
  Object.entries(VOCABOLARIO).map(([servizio, nomi]) => [
    servizio,
    nomi.map((nome) => ({ nome, radici: [...new Set(parole(nome).filter((w) => !STOP.has(w)).map(radice))] })).filter((v) => v.radici.length > 0),
  ]),
);

/** Vero se in una frase c'è una parola che comincia con ogni radice della voce. */
const presente = (frasi: string[][], v: Voce) => frasi.some((f) => v.radici.every((r) => f.some((w) => w.startsWith(r))));

/**
 * Una voce che ripete la categoria ("Elettricisti", "Impianto elettrico" per
 * gli elettricisti) non è una competenza: la pagina della categoria c'è già.
 */
function togliDoppioniCategoria(servizi: { slug: string; name: string; queries: unknown }[]) {
  // Il nome di una qualsiasi categoria ("Idraulico" fra le voci degli
  // elettricisti) ha già la sua pagina: si confronta con tutte.
  const categorie = servizi.flatMap((s) => [s.name, ...((s.queries as string[]) ?? [])]).map((t) => parole(t).filter((w) => !STOP.has(w)).map(radice));
  const uguale = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);
  const ripete = (v: Voce) => categorie.some((c) => c.length && v.radici.length <= c.length && v.radici.every((r) => c.some((p) => uguale(r, p))));
  for (const [slug, lista] of voci) voci.set(slug, lista.filter((v) => !ripete(v)));
}

async function main() {
  togliDoppioniCategoria(await db.service.findMany({ select: { slug: true, name: true, queries: true } }));
  const schede = await db.agency.findMany({
    where: { optedOutAt: null },
    select: { id: true, name: true, domain: true, description: true, sourceDescription: true, skills: true, services: { select: { service: { select: { slug: true } } } } },
  });
  const siti = sitiLetti();
  const conta = new Map<string, number>();
  let conCompetenze = 0;
  let cambiate = 0;
  for (const a of schede) {
    const sito = a.domain ? siti.get(a.domain) : undefined;
    const testo = [a.name, a.description, a.sourceDescription, sito?.title, sito?.description, sito?.text].filter(Boolean).join("\n");
    const frasi = testo.split(/[.!?;:\n•·|]+/).map(parole).filter((f) => f.length);
    const trovate = new Set<string>();
    for (const { service } of a.services) for (const v of voci.get(service.slug) ?? []) if (presente(frasi, v)) trovate.add(v.nome);
    const skills = [...trovate].sort((x, y) => x.localeCompare(y));
    if (skills.length) conCompetenze++;
    for (const s of skills) conta.set(s, (conta.get(s) ?? 0) + 1);
    if (JSON.stringify(skills) === JSON.stringify(a.skills ?? [])) continue;
    cambiate++;
    if (!DRY) await db.agency.update({ where: { id: a.id }, data: { skills } });
  }
  const top = [...conta.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`${DRY ? "[dry] " : ""}schede ${schede.length} · con competenze ${conCompetenze} · cambiate ${cambiate} · voci usate ${top.length}`);
  for (const [nome, n] of top.slice(0, 40)) console.log(`  ${String(n).padStart(4)}  ${nome}`);
}

main()
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  })
  .finally(() => db.$disconnect());
