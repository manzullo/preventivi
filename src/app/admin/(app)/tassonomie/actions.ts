"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { requireRuolo } from "@/lib/auth";
import { slugify } from "@/modules/ingest/normalize";
import { rebuildLandingPages } from "@/modules/directory/pages";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
function torna(msg: string): never {
  redirect(`/admin/tassonomie/?msg=${encodeURIComponent(msg)}`);
}

/** Le query servono all'importazione: una per riga, senza il nome della città. */
const righe = (s: string) =>
  s
    .split(/[\n,]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);

/**
 * Nuovo servizio. Dopo il salvataggio le pagine si ricostruiscono da sole: la
 * pagina del servizio e gli incroci con le città nascono quando ci sono
 * abbastanza professionisti, quindi un servizio appena creato resta senza pagina
 * finché non gli si assegnano le schede.
 */
export async function creaServizio(fd: FormData) {
  await requireRuolo("owner", "editor");
  const plural = str(fd, "plural");
  const name = str(fd, "name") || plural;
  if (!plural) torna("Serve il nome al plurale, quello che si legge in cima alla pagina");

  const slug = slugify(str(fd, "slug") || plural);
  if (!slug) torna("Indirizzo non valido");
  const esiste = await db.service.findUnique({ where: { slug }, select: { id: true } });
  if (esiste) torna(`Esiste già un servizio con indirizzo /${slug}/`);

  const ultima = await db.service.aggregate({ _max: { position: true } });
  await db.service.create({
    data: {
      slug,
      name,
      plural,
      intro: str(fd, "intro") || null,
      queries: righe(str(fd, "queries")) as unknown as Prisma.InputJsonValue,
      position: (ultima._max.position ?? 0) + 1,
      active: fd.get("active") !== null,
    },
  });
  await db.changelogEntry.create({ data: { area: "site", action: "service_create", subject: slug, actor: "admin" } });
  await rebuildLandingPages();
  revalidatePath("/", "layout");
  torna(`Creato: ${plural}. Ora assegnalo ai professionisti: la pagina compare quando ne ha almeno tre.`);
}

export async function salvaServizio(fd: FormData) {
  await requireRuolo("owner", "editor");
  const id = str(fd, "id");
  const s = await db.service.findUnique({ where: { id }, select: { slug: true } });
  if (!s) torna("Servizio non trovato");

  await db.service.update({
    where: { id },
    data: {
      name: str(fd, "name"),
      plural: str(fd, "plural"),
      intro: str(fd, "intro") || null,
      queries: righe(str(fd, "queries")) as unknown as Prisma.InputJsonValue,
      position: Number(str(fd, "position")) || 0,
      active: fd.get("active") !== null,
    },
  });
  await db.changelogEntry.create({ data: { area: "site", action: "service_update", subject: s.slug, actor: "admin" } });
  await rebuildLandingPages();
  revalidatePath("/", "layout");
  torna("Salvato");
}

/**
 * Cancella, ma solo se non lo usa nessuno. Un servizio con professionisti attaccate si
 * spegne invece di sparire: cancellarlo porterebbe via anche le pagine che
 * i motori di ricerca hanno già in archivio.
 */
export async function togliServizio(fd: FormData) {
  await requireRuolo("owner");
  const id = str(fd, "id");
  const s = await db.service.findUnique({
    where: { id },
    select: { slug: true, plural: true, _count: { select: { agencies: true, pages: true, leads: true } } },
  });
  if (!s) torna("Servizio non trovato");
  if (s._count.agencies || s._count.leads) {
    torna(`${s.plural} è attaccato a ${s._count.agencies} professionisti e ${s._count.leads} richieste: spegnilo invece di cancellarlo`);
  }
  await db.landingPage.deleteMany({ where: { serviceId: id } });
  await db.service.delete({ where: { id } });
  await db.changelogEntry.create({ data: { area: "site", action: "service_remove", subject: s.slug, actor: "admin" } });
  await rebuildLandingPages();
  revalidatePath("/", "layout");
  torna(`Cancellato: ${s.plural}`);
}


/**
 * Un altro modo di chiamare lo stesso servizio. Diventa una pagina sua solo se
 * gli si scrive un testo proprio, e il pannello non lascia pubblicare senza:
 * due indirizzi con lo stesso elenco e lo stesso testo si mangiano a vicenda,
 * i motori di ricerca ne tengono uno solo.
 */
export async function creaAlias(fd: FormData) {
  await requireRuolo("owner", "editor");
  const serviceId = str(fd, "serviceId");
  const label = str(fd, "label");
  if (!label) torna("Serve il modo in cui la gente lo chiama, per esempio: pubblicità su ChatGPT");

  const slug = slugify(str(fd, "slug") || label);
  if (!slug) torna("Indirizzo non valido");

  // Nessun indirizzo può stare in due posti: si controllano anche servizi,
  // città e regioni, che vivono tutti sullo stesso primo segmento.
  const [alias, servizio, citta, regione] = await Promise.all([
    db.serviceAlias.findUnique({ where: { slug }, select: { id: true } }),
    db.service.findUnique({ where: { slug }, select: { id: true } }),
    db.city.findUnique({ where: { slug }, select: { id: true } }),
    db.region.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (alias || servizio || citta || regione) torna(`L'indirizzo /${slug}/ è già preso`);

  const intro = str(fd, "intro");
  const vuolePubblicare = fd.get("published") !== null;
  await db.serviceAlias.create({
    data: {
      serviceId,
      slug,
      label,
      agencyLabel: str(fd, "agencyLabel") || null,
      variants: righe(str(fd, "variants")) as unknown as Prisma.InputJsonValue,
      intro: intro || null,
      // Senza testo proprio la pagina non nasce: una copia di quella del
      // servizio non aiuta chi legge e non entra in nessuna classifica.
      published: vuolePubblicare && intro.length >= 200,
      position: Number(str(fd, "position")) || 0,
    },
  });
  await db.changelogEntry.create({ data: { area: "site", action: "alias_create", subject: slug, actor: "admin" } });
  revalidatePath("/", "layout");
  torna(
    vuolePubblicare && intro.length < 200
      ? `Aggiunto "${label}", ma senza pagina: per pubblicarla servono almeno 200 caratteri di testo suo`
      : `Aggiunto: ${label}`,
  );
}

export async function salvaAlias(fd: FormData) {
  await requireRuolo("owner", "editor");
  const id = str(fd, "id");
  const a = await db.serviceAlias.findUnique({ where: { id }, select: { slug: true, label: true } });
  if (!a) torna("Modo di dire non trovato");
  const intro = str(fd, "intro");
  const vuolePubblicare = fd.get("published") !== null;
  await db.serviceAlias.update({
    where: { id },
    data: {
      label: str(fd, "label") || a.label,
      agencyLabel: str(fd, "agencyLabel") || null,
      variants: righe(str(fd, "variants")) as unknown as Prisma.InputJsonValue,
      intro: intro || null,
      published: vuolePubblicare && intro.length >= 200,
      position: Number(str(fd, "position")) || 0,
    },
  });
  revalidatePath("/", "layout");
  torna(vuolePubblicare && intro.length < 200 ? "Salvato, ma la pagina resta spenta: servono almeno 200 caratteri di testo suo" : "Salvato");
}

export async function togliAlias(fd: FormData) {
  await requireRuolo("owner", "editor");
  const id = str(fd, "id");
  const a = await db.serviceAlias.findUnique({ where: { id }, select: { slug: true, label: true } });
  if (!a) torna("Modo di dire non trovato");
  await db.serviceAlias.delete({ where: { id } });
  await db.changelogEntry.create({ data: { area: "site", action: "alias_remove", subject: a.slug, actor: "admin" } });
  revalidatePath("/", "layout");
  torna(`Tolto: ${a.label}`);
}


// ---------- Competenze ----------
// Le competenze non hanno una tabella: sono testi dentro la scheda di ogni
// professionista. Rinominarne una vuol dire riscriverla in tutte le schede che la
// dichiarano; unirne due vuol dire sostituire un nome con l'altro e togliere
// i doppioni. Da qui si fa senza aprire il database.

/** Riscrive una competenza in tutte le schede che la portano. */
export async function rinominaCompetenza(fd: FormData) {
  await requireRuolo("owner", "editor");
  const da = str(fd, "da");
  const a = str(fd, "a");
  if (!da || !a || da === a) torna("Serve il nome di prima e quello nuovo");

  const schede = await db.agency.findMany({
    where: { skills: { array_contains: [da] } },
    select: { id: true, skills: true },
  });
  for (const s of schede) {
    const lista = (Array.isArray(s.skills) ? (s.skills as unknown[]) : []).map(String);
    // Il Set toglie il doppione quando il nome nuovo c'era già: è il caso
    // dell'unione di due competenze in una.
    const nuova = [...new Set(lista.map((x) => (x === da ? a : x)))];
    await db.agency.update({ where: { id: s.id }, data: { skills: nuova as unknown as Prisma.InputJsonValue } });
  }
  await db.changelogEntry.create({ data: { area: "site", action: "skill_rename", subject: `${da} -> ${a}`, actor: "admin" } });
  revalidatePath("/", "layout");
  torna(`Rinominata in ${schede.length} schede: "${da}" ora è "${a}"`);
}

/** Toglie una competenza da tutte le schede: sparisce dal sito e dalla ricerca. */
export async function togliCompetenza(fd: FormData) {
  await requireRuolo("owner");
  const nome = str(fd, "nome");
  if (!nome) torna("Serve il nome");
  const schede = await db.agency.findMany({
    where: { skills: { array_contains: [nome] } },
    select: { id: true, skills: true },
  });
  for (const s of schede) {
    const lista = (Array.isArray(s.skills) ? (s.skills as unknown[]) : []).map(String).filter((x) => x !== nome);
    await db.agency.update({ where: { id: s.id }, data: { skills: lista as unknown as Prisma.InputJsonValue } });
  }
  await db.changelogEntry.create({ data: { area: "site", action: "skill_remove", subject: nome, actor: "admin" } });
  revalidatePath("/", "layout");
  torna(`Tolta da ${schede.length} schede: ${nome}`);
}

/** Promuove una competenza a servizio: la pagina diventa una tassonomia vera. */
export async function competenzaAServizio(fd: FormData) {
  await requireRuolo("owner", "editor");
  const nome = str(fd, "nome");
  const plural = str(fd, "plural") || `Professionisti ${nome.toLowerCase()}`;
  const slug = slugify(str(fd, "slug") || plural);
  if (!nome || !slug) torna("Serve la competenza e un indirizzo");

  const preso = await db.service.findUnique({ where: { slug }, select: { id: true } });
  if (preso) torna(`Esiste già un servizio con indirizzo /${slug}/`);

  const ultima = await db.service.aggregate({ _max: { position: true } });
  const s = await db.service.create({
    data: {
      slug,
      name: nome,
      plural,
      intro: null,
      queries: [nome.toLowerCase()] as unknown as Prisma.InputJsonValue,
      position: (ultima._max.position ?? 0) + 1,
      active: true,
    },
  });

  // Chi dichiara quella competenza entra nel servizio nuovo.
  const schede = await db.agency.findMany({ where: { skills: { array_contains: [nome] } }, select: { id: true } });
  for (const a of schede) {
    await db.agencyService.upsert({
      where: { agencyId_serviceId: { agencyId: a.id, serviceId: s.id } },
      create: { agencyId: a.id, serviceId: s.id, weight: 0.7 },
      update: {},
    });
  }
  await db.changelogEntry.create({ data: { area: "site", action: "skill_to_service", subject: slug, actor: "admin" } });
  await rebuildLandingPages();
  revalidatePath("/", "layout");
  torna(`"${nome}" è diventata il servizio ${plural}, con ${schede.length} professionisti`);
}
