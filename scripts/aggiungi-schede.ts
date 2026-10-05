// Crea o aggiorna le schede chieste a mano, con i dati già decisi da noi, e
// crea prima le eventuali categorie nuove. La chiave è il dominio del sito
// (se c'è), altrimenti il nome nella stessa città: se la scheda esiste si
// toccano solo i campi presenti nel file (categorie e competenze si
// aggiungono a quelle che ha), altrimenti nasce con source "manual". Uso:
//   tsx scripts/aggiungi-schede.ts [data/aggiunte-manuali.json] [--dry]
//
// Formato del file:
//   { "serviziNuovi": [{ slug, name, plural, singular, gender?, group, intro?, queries, googleMatch? }],
//     "schede": [{ nome, sito?, citta?, telefono?, email?, servizi: [slug], competenze?, testo?, pubblica? }] }
import "./lib/env";
import fs from "node:fs";
import type { Prisma } from "../src/generated/prisma";
import { db } from "../src/lib/db";
import { rebuildLandingPages } from "../src/modules/directory/pages";
import { normalizeDomain, resolveCity, slugify, uniqueAgencySlug } from "../src/modules/ingest/normalize";
import { recalcAllScores } from "../src/modules/ranking/score";
import { argomenti } from "./lib/siti";

type ServizioNuovo = { slug: string; name: string; plural: string; singular?: string; gender?: "m" | "f"; group?: string; intro?: string; queries: string[]; googleMatch?: string };
type Scheda = {
  nome: string;
  sito?: string | null;
  citta?: string | null;
  telefono?: string;
  email?: string;
  servizi: string[];
  competenze?: string[];
  testo?: string;
  pubblica?: boolean;
};

const { args, flag } = argomenti();
const file = args.find((a) => !a.startsWith("--")) ?? "data/aggiunte-manuali.json";
const DRY = flag("--dry");
const lista = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const unisci = (a: unknown, b?: string[]) => [...new Set([...lista(a), ...(b ?? [])])] as unknown as Prisma.InputJsonValue;

async function main() {
  if (!fs.existsSync(file)) { console.log(`nessun file ${file}: uso tsx scripts/aggiungi-schede.ts [file.json] [--dry]`); return; }
  const { serviziNuovi = [], schede = [] } = JSON.parse(fs.readFileSync(file, "utf8")) as { serviziNuovi?: ServizioNuovo[]; schede?: Scheda[] };

  for (const s of serviziNuovi) {
    const gia = await db.service.findUnique({ where: { slug: s.slug }, select: { id: true } });
    console.log(JSON.stringify({ categoria: s.slug, esistente: Boolean(gia), dry: DRY }));
    if (gia || DRY) continue;
    const ultima = await db.service.aggregate({ _max: { position: true } });
    await db.service.create({ data: { ...s, intro: s.intro ?? null, queries: s.queries, position: (ultima._max.position ?? 0) + 1, active: true } });
    await db.changelogEntry.create({ data: { area: "site", action: "service_create", subject: s.slug, actor: "script" } });
  }

  for (const r of schede) {
    const domain = r.sito ? normalizeDomain(r.sito) : undefined;
    if (r.sito && !domain) console.log(`  ${r.nome}: "${r.sito}" non è un sito proprio (social o directory), si tiene come link ma non come chiave`);
    const city = r.citta ? await resolveCity(r.citta) : null;
    if (r.citta && !city) throw new Error(`${r.nome}: città "${r.citta}" non trovata`);
    const servizi = await db.service.findMany({ where: { slug: { in: r.servizi } }, select: { id: true, slug: true } });
    const mancanti = r.servizi.filter((s) => !servizi.some((x) => x.slug === s) && !(DRY && serviziNuovi.some((n) => n.slug === s)));
    if (mancanti.length) throw new Error(`${r.nome}: categorie inesistenti ${mancanti.join(", ")}`);

    // Lo stesso nome in due città sono due professionisti diversi: il nome vale come chiave solo con la città.
    const chiavi: Prisma.AgencyWhereInput[] = [];
    if (domain) chiavi.push({ domain });
    if (city) chiavi.push({ name: { equals: r.nome, mode: "insensitive" }, cityId: city.id });
    const gia = chiavi.length
      ? await db.agency.findFirst({ where: { OR: chiavi }, select: { id: true, slug: true, cityId: true, website: true, published: true, publishedAt: true, skills: true } })
      : null;
    // La regola di pubblicazione vuole città e almeno una categoria.
    const cityId = city?.id ?? gia?.cityId ?? null;
    const pubblica = r.pubblica === undefined ? (gia?.published ?? false) : r.pubblica && Boolean(cityId) && r.servizi.length > 0;

    const data: Prisma.AgencyUncheckedUpdateInput = {
      skills: unisci(gia?.skills, r.competenze),
      published: pubblica,
      publishedAt: pubblica ? (gia?.publishedAt ?? new Date()) : (gia?.publishedAt ?? null),
    };
    if (!gia && r.sito) Object.assign(data, { website: r.sito, domain: domain ?? null });
    if (city) data.cityId = city.id;
    if (r.telefono) data.phone = r.telefono;
    if (r.email) data.email = r.email;
    if (r.testo) data.description = r.testo;

    console.log(JSON.stringify({ nome: r.nome, scheda: gia?.slug ?? "nuova", citta: r.citta ?? null, categorie: r.servizi, pubblica, dry: DRY }));
    if (DRY) continue;

    const agency = gia
      ? await db.agency.update({ where: { id: gia.id }, data })
      : await db.agency.create({
          data: {
            ...(data as Prisma.AgencyUncheckedCreateInput),
            name: r.nome,
            slug: await uniqueAgencySlug(r.nome, city?.slug),
            source: "manual",
            sourceRef: `manual:${domain ?? slugify(`${r.nome} ${city?.slug ?? ""}`)}`,
          },
        });
    await db.$transaction(
      servizi.map((s, i) => db.agencyService.upsert({ where: { agencyId_serviceId: { agencyId: agency.id, serviceId: s.id } }, create: { agencyId: agency.id, serviceId: s.id, weight: Math.max(1, 10 - i) }, update: {} })),
    );
    await db.changelogEntry.create({ data: { area: "site", action: gia ? "agency_update" : "agency_create", subject: agency.slug, actor: "script" } });
  }

  if (!DRY && schede.length) {
    await recalcAllScores();
    await rebuildLandingPages();
  }
  console.log(JSON.stringify({ categorieNuove: serviziNuovi.length, schede: schede.length, dry: DRY }));
}

main().catch((e) => { console.error(String(e)); process.exit(1); }).finally(() => db.$disconnect());
