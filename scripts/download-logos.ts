// Porta nel nostro spazio i loghi che sono ancora URL esterni (della fonte):
// public/loghi/<slug>.webp, 256 px, e aggiorna Agency.logoUrl. 4 in parallelo,
// idempotente (salta i file già presenti). Ogni download passa da
// politeGetBuffer (robots.txt, pausa per sito, User-Agent dichiarato). Uso:
//   tsx scripts/download-logos.ts [--limit 500] [--dry] --confirm
// Serve INGEST_ENABLED=1 e --confirm, come per ogni ingest di rete.
import "./lib/env";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { ingestAllowed } from "../src/modules/ingest/types";
import { argomenti, inParallelo, politeGetBuffer } from "./lib/siti";

const { opt, flag } = argomenti();
const LIMIT = Number(opt("--limit", "0"));
const DRY = flag("--dry");
const DIR = "public/loghi";

async function main() {
  const rows = await db.agency.findMany({
    where: { optedOutAt: null, logoUrl: { startsWith: "http" } },
    select: { id: true, slug: true, logoUrl: true },
    orderBy: [{ published: "desc" }, { score: "desc" }],
    take: LIMIT || undefined,
  });
  console.log(`loghi da scaricare: ${rows.length}`);
  if (DRY) { for (const r of rows.slice(0, 5)) console.log(`  ${r.slug} ← ${r.logoUrl}`); console.log(JSON.stringify({ daScaricare: rows.length, dry: true })); return; }
  ingestAllowed(flag("--confirm"));
  fs.mkdirSync(DIR, { recursive: true });

  let ok = 0, fail = 0;
  await inParallelo(rows, 4, async (r) => {
    const out = path.join(DIR, `${r.slug}.webp`);
    try {
      if (!fs.existsSync(out)) {
        const buf = await politeGetBuffer(r.logoUrl!);
        if (!buf) throw new Error("immagine non scaricata (robots.txt, errore o file vuoto)");
        await sharp(buf).resize(256, 256, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toFile(out);
      }
      await db.agency.update({ where: { id: r.id }, data: { logoUrl: `/loghi/${r.slug}.webp` } });
      ok++;
    } catch (e) {
      fail++;
      if (fail <= 5) console.error(r.slug, String(e).slice(0, 80));
    }
    if ((ok + fail) % 300 === 0) console.log(`${ok + fail}/${rows.length} · ok ${ok} · errori ${fail}`);
  });
  console.log(JSON.stringify({ ok, fail }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
