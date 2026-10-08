// Controlla che il posto Google agganciato a ogni scheda sia davvero quel
// professionista. Il caso tipico dell'errore: l'idraulico si chiama "Rossi"
// e Google restituisce "Trattoria da Rossi" di un'altra provincia, con 500
// recensioni di cucina. Senza controllo quelle recensioni finiscono nella
// scheda e gonfiano il punteggio. Lavora sulle copie grezze già salvate
// (SourceSnapshot "google"), senza rete; lo sblocco è lo stesso degli ingest
// perché stacca recensioni di una fonte a pagamento. Uso:
//   tsx scripts/verifica-google.ts --confirm [--applica]
// Serve INGEST_ENABLED=1 e --confirm. Senza --applica è una prova a vuoto.
import "./lib/env";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { ingestAllowed } from "../src/modules/ingest/types";
import { recalcAllScores } from "../src/modules/ranking/score";
import { categorieGoogle } from "./lib/categorie-google";
import { argomenti, hostDi } from "./lib/siti";

const { flag } = argomenti();
const APPLICA = flag("--applica") && !flag("--dry");
const DIR = "data/raw/google";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

async function main() {
  ingestAllowed(flag("--confirm"));
  const cat = await categorieGoogle();
  const righe = await db.sourceSnapshot.findMany({
    where: { source: "google" },
    select: { agencyId: true, data: true, agency: { select: { slug: true, name: true, domain: true, googlePlaceId: true, city: { select: { name: true, province: true } }, services: { select: { service: { select: { slug: true } } } } } } },
  });
  const scartare: { slug: string; motivo: string; posto: string }[] = [];
  const dubbi: { slug: string; motivo: string; posto: string }[] = [];
  const fuoriTema: { slug: string; motivo: string; posto: string }[] = [];

  for (const r of righe) {
    const a = r.agency;
    if (!a?.googlePlaceId) continue;
    const p = r.data as Record<string, unknown>;
    const titolo = String(p.title ?? p.name ?? "");
    const categoria = String(p.categoryName ?? p.category ?? "").toLowerCase();
    const dGoogle = typeof p.website === "string" && p.website ? hostDi(p.website) : null;
    const indirizzo = String(p.address ?? "");
    const posto = `${titolo}${categoria ? ` (${categoria})` : ""}${indirizzo ? ` · ${indirizzo.slice(-40)}` : ""}`;

    // Quanto il nome del posto somiglia al nome della scheda: è il segnale che
    // dice se stiamo guardando lo stesso professionista o un omonimo.
    const x = new Set(norm(a.name).split(" ").filter((w) => w.length > 2));
    const y = new Set(norm(titolo).split(" ").filter((w) => w.length > 2));
    let inter = 0; for (const w of x) if (y.has(w)) inter++;
    const somiglianza = x.size && y.size ? inter / Math.min(x.size, y.size) : 0;
    const stessoSito = Boolean(a.domain && dGoogle && a.domain === dGoogle);
    const stessaCitta = a.city?.name ? norm(indirizzo).includes(norm(a.city.name)) : true;
    // Sigla della provincia dentro l'indirizzo Google ("00177 Roma RM"): se è
    // un'altra provincia, quasi sempre è un omonimo, non una sede.
    const sigla = indirizzo.match(/\b(\d{5})\s+[^,]*?\b([A-Z]{2})\b/)?.[2] ?? null;
    const provinciaDiversa = Boolean(sigla && a.city?.province && sigla !== a.city.province);
    const fuori = cat.fuoriTema(categoria);
    const suoi = a.services.map((s) => s.service.slug);
    const pertinente = categoria ? cat.servizi(categoria).some((s) => suoi.includes(s)) : true;

    // 1. Sito diverso: due attività diverse, non c'è margine di dubbio.
    if (a.domain && dGoogle && a.domain !== dGoogle) { scartare.push({ slug: a.slug, motivo: `sito diverso: ${dGoogle} contro ${a.domain}`, posto }); continue; }
    // 2. Nome che non c'entra e nessun sito che confermi: posto sbagliato.
    if (!stessoSito && somiglianza < 0.6) { scartare.push({ slug: a.slug, motivo: `nome diverso (somiglianza ${somiglianza.toFixed(2)})`, posto }); continue; }
    // 3. Nome simile ma attività di tutt'altro tipo in un'altra città: omonimia.
    if (!stessoSito && fuori && !stessaCitta) { scartare.push({ slug: a.slug, motivo: `omonimo fuori città: ${categoria}`, posto }); continue; }
    // 3b. Provincia diversa senza sito che confermi: omonimo in un'altra zona.
    if (!stessoSito && provinciaDiversa) { scartare.push({ slug: a.slug, motivo: `altra provincia: ${sigla} contro ${a.city?.province}`, posto }); continue; }
    // 4. È davvero questo professionista, ma Google lo classifica fuori dalle
    //    nostre categorie: non si stacca niente, la decisione è editoriale.
    if (fuori) { fuoriTema.push({ slug: a.slug, motivo: `attività classificata ${categoria}`, posto }); continue; }
    // 5. Stesso professionista ma indirizzo altrove (può essere una sede) o
    //    categoria Google di un altro mestiere: lo guardiamo.
    if (!stessaCitta && indirizzo) dubbi.push({ slug: a.slug, motivo: `indirizzo fuori dalla città della scheda (${a.city?.name})`, posto });
    else if (!pertinente) dubbi.push({ slug: a.slug, motivo: `categoria Google di un altro mestiere: ${categoria}`, posto });
  }

  fs.mkdirSync(DIR, { recursive: true });
  const scrivi = (f: string, l: typeof scartare) => fs.writeFileSync(`${DIR}/${f}`, l.map((s) => `${s.slug}\t${s.motivo}\t${s.posto}`).join("\n") + "\n");
  scrivi("abbinamenti-sbagliati.txt", scartare);
  scrivi("abbinamenti-dubbi.txt", dubbi);
  scrivi("attivita-fuori-tema.txt", fuoriTema);
  console.log(`copie Google esaminate: ${righe.length} · da staccare: ${scartare.length} · dubbi: ${dubbi.length} · attività fuori tema ma scheda giusta: ${fuoriTema.length} · elenchi in ${DIR}/`);
  for (const s of scartare.slice(0, 12)) console.log(`  ✗ ${s.slug}: ${s.motivo} → ${s.posto}`);
  if (!APPLICA) { console.log("prova a vuoto: rilancia con --applica per staccare i posti sbagliati"); return; }

  let recCancellate = 0;
  for (const s of scartare) {
    const a = await db.agency.findUnique({ where: { slug: s.slug }, select: { id: true, externalRatings: true, importNote: true } });
    if (!a) continue;
    const del = await db.review.deleteMany({ where: { agencyId: a.id, source: "google" } });
    recCancellate += del.count;
    const ext = (Array.isArray(a.externalRatings) ? a.externalRatings : []).filter((e) => (e as { source?: string })?.source !== "google");
    await db.sourceSnapshot.deleteMany({ where: { agencyId: a.id, source: "google" } });
    await db.agency.update({
      where: { id: a.id },
      data: { googlePlaceId: null, googleUrl: null, googleSyncedAt: null, externalRatings: ext as never, importNote: [a.importNote, `google staccato: ${s.motivo}`].filter(Boolean).join(" · ") },
    });
  }
  const sc = await recalcAllScores();
  console.log(JSON.stringify({ staccate: scartare.length, recensioniCancellate: recCancellate, ricalcolate: sc.agencies }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
