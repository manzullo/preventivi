// I nomi presi dalle fonti spesso portano slogan e richiami ("Mario Rossi -
// Idraulico Roma pronto intervento 24h", "TOP #1 elettricista"): finiscono in
// H1, title e nelle ricerche su Google. Qui si tiene il solo nome del
// professionista o dello studio. Prova a vuoto se manca --confirm. Uso:
//   tsx scripts/clean-names.ts [--fonti google_maps,osm,...] [--limit 50] [--dry] --confirm
import "./lib/env";
import { db } from "../src/lib/db";
import { argomenti } from "./lib/siti";

const { opt, flag } = argomenti();
const DRY = flag("--dry") || !flag("--confirm");
const LIMIT = Number(opt("--limit", "0"));
const FONTI = opt("--fonti", "google_maps,osm,paginegialle,prontopro").split(",").map((s) => s.trim()).filter(Boolean);

const PROMO_FISSE = "top|migliore|migliori|n\\.?\\s?1|#1|numero uno|leader|economico|economici|prezzi bassi|preventivo gratuito|preventivi gratuiti|pronto intervento|24 ?h|24 ore|h24|a domicilio|professionale|qualificato|certificato|esperto|specializzato|servizi|riparazioni|installazione|assistenza|zona";
const SEP = /\s+[–—|·:]\s+|\s+-\s+/;

/**
 * Nome pulito: via la coda promozionale dopo il separatore. `promo` riconosce
 * gli slogan e i nomi di mestiere ("idraulico", "elettricista"), costruito dalle
 * categorie della directory.
 */
export function cleanName(raw: string, promo: RegExp): string {
  let name = raw.replace(/\s+/g, " ").trim();
  const parts = name.split(SEP);
  if (parts.length > 1) {
    const head = parts[0].trim();
    const tail = parts.slice(1).join(" ").trim();
    // Si taglia solo se la testa regge da sola e la coda è uno slogan (lunga o promozionale).
    if (head.length >= 5 && (tail.split(/\s+/).length >= 3 || promo.test(tail)) && !/^(s\.?r\.?l|s\.?p\.?a|snc|sas|srls)\.?( s\.?b\.?)?$/i.test(tail)) name = head;
  }
  // Richiami residui in testa o in coda.
  name = name.replace(/^(top\s*#?\d+\s*|the\s+best\s+|il\s+migliore\s+)/i, "").replace(/[\s,·|-]+$/, "").trim();
  // Il punto finale si toglie solo se non fa parte di una sigla (S.p.A., F.lli).
  if (/[a-z]{3}\.$/.test(name)) name = name.slice(0, -1);
  return name;
}

async function main() {
  const servizi = await db.service.findMany({ select: { name: true, plural: true, singular: true } });
  const mestieri = [...new Set(servizi.flatMap((s) => [s.name, s.plural, s.singular ?? ""]).map((x) => x.toLowerCase().trim()).filter((x) => x.length >= 3))]
    .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const promo = new RegExp(`\\b(${PROMO_FISSE}|${mestieri.join("|")})\\b`, "i");

  const rows = await db.agency.findMany({ where: { source: { in: FONTI }, optedOutAt: null }, select: { id: true, name: true, importNote: true }, take: LIMIT || undefined });
  const cambi = rows.map((r) => ({ ...r, nuovo: cleanName(r.name, promo) })).filter((r) => r.nuovo !== r.name && r.nuovo.length >= 3);
  console.log(`${DRY ? "[dry] " : ""}nomi da ripulire: ${cambi.length} su ${rows.length} (fonti ${FONTI.join(", ")})`);
  console.log(cambi.slice(0, 15).map((c) => `  ${c.name}\n   → ${c.nuovo}`).join("\n"));
  if (DRY) { console.log(JSON.stringify({ daRipulire: cambi.length, dry: true })); return; }
  for (const c of cambi) {
    await db.agency.update({ where: { id: c.id }, data: { name: c.nuovo, importNote: c.importNote ? `${c.importNote} · nome originale: ${c.name}` : `nome originale: ${c.name}` } });
  }
  console.log(JSON.stringify({ rinominati: cambi.length }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
