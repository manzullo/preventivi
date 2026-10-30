// I casi dubbi di fondi-doppioni.ts (data/raw/doppioni-da-controllare.txt) si
// decidono con la partita IVA, dalla scheda o letta dal sito (data/raw/sites/
// e data/raw/contatti/): se è la stessa, le schede si fondono; se sono due
// partite diverse, restano separate anche con telefono o studio in comune.
// Non si cancella mai una scheda con recensioni, richieste o assegnazioni.
// Di norma è una prova a vuoto: per fondere davvero serve --confirm. Uso:
//   tsx scripts/dubbi-doppioni.ts [--confirm]
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { recalcAllScores } from "../src/modules/ranking/score";
import { chiTiene, type Doppione, FILE_DECISI, FILE_DUBBI, fondi, selectDoppione } from "./lib/doppioni";
import { argomenti, DIR_CONTATTI, hostDi, pivaDa, sitiLetti } from "./lib/siti";

const { flag } = argomenti();
const APPLICA = flag("--confirm") && !flag("--dry");

async function main() {
  if (!fs.existsSync(FILE_DUBBI)) { console.log(`nessun file ${FILE_DUBBI}: lancia prima fondi-doppioni.ts`); return; }
  const righe = fs.readFileSync(FILE_DUBBI, "utf8").split("\n").map((r) => r.trim()).filter((r) => r && !r.startsWith("#"));
  const archivio = sitiLetti();

  const pivaDaFile = (x: Doppione): string | null => {
    const host = x.domain ?? (x.website ? hostDi(x.website) : null);
    if (!host) return null;
    const f = `${DIR_CONTATTI}/${host}.json`;
    const daContatti = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as { piva?: string }).piva : null;
    const j = archivio.get(host);
    const p = daContatti ?? j?.piva ?? (j?.textSample ? pivaDa(j.textSample) : null);
    return p ? p.replace(/\D/g, "") : null;
  };

  const esiti: { coppia: string; decisione: string; motivo: string }[] = [];
  let fuse = 0;
  for (const riga of righe) {
    const [a, b] = riga.split("·").map((x) => x.trim());
    if (!a || !b) continue;
    const [x, y] = (await Promise.all([
      db.agency.findUnique({ where: { slug: a }, select: selectDoppione }),
      db.agency.findUnique({ where: { slug: b }, select: selectDoppione }),
    ])) as [Doppione | null, Doppione | null];
    if (!x || !y) { esiti.push({ coppia: `${a} · ${b}`, decisione: "salta", motivo: "una delle due non esiste più" }); continue; }

    const px = x.vatNumber ?? pivaDaFile(x);
    const py = y.vatNumber ?? pivaDaFile(y);
    const coppia = `${x.slug} · ${y.slug}`;
    if (px && py && px === py) {
      const scelta = chiTiene(x, y);
      if (!scelta) { esiti.push({ coppia, decisione: "a mano", motivo: `stessa partita IVA ${px}, ma tutte e due con recensioni, richieste o titolare` }); continue; }
      esiti.push({ coppia, decisione: "fondere", motivo: `stessa partita IVA ${px}` });
      if (APPLICA && (await fondi(scelta[0], scelta[1], `stessa partita IVA ${px}`))) {
        if (!scelta[0].vatNumber) await db.agency.update({ where: { id: scelta[0].id }, data: { vatNumber: px } });
        fuse++;
      }
    } else if (px && py) {
      esiti.push({ coppia, decisione: "separate", motivo: `partite IVA diverse (${px} e ${py})` });
    } else {
      esiti.push({ coppia, decisione: "da guardare", motivo: `partita IVA mancante su ${!px ? x.slug : y.slug}` });
    }
  }

  for (const e of esiti) console.log(`${e.decisione.padEnd(12)} ${e.coppia} · ${e.motivo}`);
  const conta = esiti.reduce<Record<string, number>>((t, e) => ({ ...t, [e.decisione]: (t[e.decisione] ?? 0) + 1 }), {});
  if (fuse) await recalcAllScores();
  console.log(JSON.stringify({ coppie: righe.length, ...conta, fuse, dry: !APPLICA }));
  fs.writeFileSync(FILE_DECISI, esiti.map((e) => `${e.decisione} | ${e.coppia} | ${e.motivo}`).join("\n") + "\n");
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
