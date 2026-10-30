// Logo mancante: si prende dal sito del professionista (apple-touch-icon,
// icon grande, og:image o favicon) e si salva da noi in public/loghi/<slug>.webp
// a 256 px. Niente hotlink: le immagini restano sul nostro dominio. La pagina
// passa da politeGet, le immagini da politeGetBuffer (stesse regole). Uso:
//   tsx scripts/logo-da-sito.ts [--city roma] [--limit 300] [--dry] --confirm
// --dry  mostra quante schede senza logo hanno un sito, senza toccare la rete
// Serve INGEST_ENABLED=1 e --confirm, come per ogni ingest di rete.
import "./lib/env";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { politeGet } from "../src/modules/ingest/http";
import { ingestAllowed } from "../src/modules/ingest/types";
import { argomenti, inParallelo, politeGetBuffer, schedeConSito } from "./lib/siti";

const { opt, flag } = argomenti();
const CITY = opt("--city");
const LIMIT = Number(opt("--limit", "0"));
const DRY = flag("--dry");
const DIR = "public/loghi";

/** Candidati logo nell'ordine in cui li preferiamo. */
function candidati(html: string, base: string): string[] {
  const out: string[] = [];
  const abs = (u: string) => { try { return new URL(u, base).toString(); } catch { return null; } };
  const push = (u?: string | null) => { const a = u ? abs(u) : null; if (a && !out.includes(a)) out.push(a); };

  for (const m of html.matchAll(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/gi)) push(m[0].match(/href=["']([^"']+)["']/i)?.[1]);
  for (const m of html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi)) {
    const size = Number(m[0].match(/sizes=["'](\d+)/i)?.[1] ?? "0");
    if (size >= 96 || /\.(png|svg|webp)/i.test(m[0])) push(m[0].match(/href=["']([^"']+)["']/i)?.[1]);
  }
  for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]*>/gi)) push(m[0].match(/content=["']([^"']+)["']/i)?.[1]);
  push("/favicon.ico");
  return out.slice(0, 5);
}

async function main() {
  const rows = await schedeConSito({ city: CITY, limit: LIMIT, extra: { logoUrl: null } });
  console.log(`professionisti senza logo con sito: ${rows.length}${CITY ? ` (${CITY})` : ""}`);
  if (DRY) { console.log(JSON.stringify({ daCercare: rows.length, dry: true })); return; }
  ingestAllowed(flag("--confirm"));
  fs.mkdirSync(DIR, { recursive: true });

  let ok = 0, ko = 0;
  await inParallelo(rows, 4, async (r) => {
    const file = path.join(DIR, `${r.slug}.webp`);
    if (fs.existsSync(file)) { await db.agency.update({ where: { id: r.id }, data: { logoUrl: `/loghi/${r.slug}.webp` } }); ok++; return; }
    let html: string;
    try { html = (await politeGet(r.website)).slice(0, 200_000); } catch { ko++; return; }
    for (const url of candidati(html, r.website)) {
      const buf = await politeGetBuffer(url);
      if (!buf) continue;
      try {
        await sharp(buf, { animated: false })
          .resize(256, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .webp({ quality: 82 })
          .toFile(file);
        const meta = await sharp(file).metadata();
        if ((meta.width ?? 0) < 32) { fs.unlinkSync(file); continue; }
        await db.agency.update({ where: { id: r.id }, data: { logoUrl: `/loghi/${r.slug}.webp` } });
        ok++;
        return;
      } catch { /* formato non gestito: si prova il candidato dopo */ }
    }
    ko++;
    if ((ok + ko) % 100 === 0) console.log(`… ${ok + ko}/${rows.length} · presi ${ok}`);
  });
  console.log(JSON.stringify({ esaminati: rows.length, loghiPresi: ok, senzaLogo: ko }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
