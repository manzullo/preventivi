"use server";

// Schede professionista dall'admin (il "CMS" del sito): crea, modifica, pubblica,
// importa CSV, accetta candidature. Ogni salvataggio ricalcola score e pagine.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseFaqText } from "@/modules/directory/faq";
import { rebuildLandingPages } from "@/modules/directory/pages";
import { csvToRecords } from "@/modules/ingest/csv";
import { importRecords } from "@/modules/ingest/import";
import { normalizeDomain, resolveCity, uniqueAgencySlug } from "@/modules/ingest/normalize";
import { recalcAllScores } from "@/modules/ranking/score";

async function guard() {
  if (!(await isAdmin())) throw new Error("Non autorizzato");
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const num = (fd: FormData, k: string) => (str(fd, k) ? Number(str(fd, k)) : null);

// Ricalcolo dei punteggi e ricostruzione delle pagine. Tocca tutto l'archivio
// (4.337 professionisti, 3.758 pagine a settembre 2026): tenuto dentro il salvataggio
// lasciava il bottone fermo per decine di secondi, e un bottone fermo sembra
// rotto — il 22/09/2026 la stessa scheda è stata salvata sei volte di fila,
// una ogni nove secondi, perché non succedeva niente a schermo.
//
// Ora il salvataggio scrive e risponde subito; il ricalcolo parte poco dopo e
// una volta sola, anche a salvataggi ravvicinati (il timer riparte a ogni
// salvataggio, così sei click fanno un lavoro solo).
//
// Passa dall'endpoint di manutenzione che già esiste invece di chiamare le
// funzioni qui: `revalidatePath` vale solo dentro una richiesta, e da un timer
// scollegato non funzionerebbe. Rifacendo le pagine *prima* di invalidare la
// cache, il sito pubblico non resta appeso a dati vecchi.
const ATTESA_RICALCOLO = 4000;
let ricalcoloInAttesa: ReturnType<typeof setTimeout> | null = null;

function programmaRicalcolo() {
  const chiave = process.env.CRON_KEY;
  // Senza chiave l'endpoint rifiuta: meglio il salvataggio lento di un sito
  // che non si aggiorna più senza dirlo.
  if (!chiave) return afterChangeSubito();
  if (ricalcoloInAttesa) clearTimeout(ricalcoloInAttesa);
  ricalcoloInAttesa = setTimeout(() => {
    ricalcoloInAttesa = null;
    const porta = process.env.PORT || "4450";
    fetch(`http://127.0.0.1:${porta}/api/cron/pagine/?key=${encodeURIComponent(chiave)}&punteggi=1`)
      .then((r) => { if (!r.ok) console.error("[ricalcolo] l'endpoint ha risposto", r.status); })
      .catch((e) => console.error("[ricalcolo] non partito:", e));
  }, ATTESA_RICALCOLO);
  // Non tenere vivo il processo solo per questo timer.
  (ricalcoloInAttesa as unknown as { unref?: () => void }).unref?.();
}

async function afterChangeSubito() {
  await recalcAllScores();
  await rebuildLandingPages();
  revalidatePath("/", "layout");
}

async function afterChange() {
  // La scheda appena toccata deve risultare aggiornata già al redirect; il
  // resto del sito lo sistema il ricalcolo programmato qui sotto.
  revalidatePath("/", "layout");
  programmaRicalcolo();
}

export async function saveAgency(fd: FormData) {
  await guard();
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) redirect(`/admin/agenzie/${id || "nuova"}/?msg=${encodeURIComponent("Nome obbligatorio")}`);
  const city = await resolveCity(str(fd, "city"));
  const website = opt(fd, "website");
  const existing = id ? await db.agency.findUnique({ where: { id }, select: { publishedAt: true } }) : null;
  const published = fd.get("published") === "on";
  const data = {
    name,
    website,
    domain: normalizeDomain(website) ?? null,
    phone: opt(fd, "phone"),
    email: opt(fd, "email"),
    street: opt(fd, "street"),
    postalCode: opt(fd, "postalCode"),
    cityId: city?.id ?? null,
    description: opt(fd, "description"),
    foundedYear: num(fd, "foundedYear"),
    teamSize: opt(fd, "teamSize"),
    minBudget: num(fd, "minBudget"),
    whatsapp: (opt(fd, "whatsapp") ?? "").replace(/\D/g, "") || null,
    metaTitle: opt(fd, "metaTitle"),
    logoUrl: opt(fd, "logoUrl"),
    metaDescription: opt(fd, "metaDescription"),
    faq: parseFaqText(str(fd, "faq")) as unknown as Prisma.InputJsonValue,
    skills: str(fd, "skills").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 40) as unknown as Prisma.InputJsonValue,
    published,
    publishedAt: published ? (existing?.publishedAt ?? new Date()) : (existing?.publishedAt ?? null),
    verified: fd.get("verified") === "on",
    claimed: fd.get("claimed") === "on",
    // Priorità nostra: 0 nessuna, più alto sta più in alto. Sposta la
    // posizione, non il punteggio: quello resta delle recensioni.
    priority: Math.min(Math.max(Number(str(fd, "priority")) || 0, 0), 999),
  };
  const services = fd.getAll("services").map(String);
  const agency = id
    ? await db.agency.update({ where: { id }, data })
    : await db.agency.create({ data: { ...data, slug: await uniqueAgencySlug(name, city?.slug), source: "manual", sourceRef: `manual-${Date.now()}` } });
  const rows = await db.service.findMany({ where: { slug: { in: services } }, select: { id: true } });
  await db.$transaction([
    db.agencyService.deleteMany({ where: { agencyId: agency.id, serviceId: { notIn: rows.map((r) => r.id) } } }),
    ...rows.map((r) => db.agencyService.upsert({ where: { agencyId_serviceId: { agencyId: agency.id, serviceId: r.id } }, create: { agencyId: agency.id, serviceId: r.id }, update: {} })),
  ]);
  await db.changelogEntry.create({ data: { area: "site", action: id ? "agency_update" : "agency_create", subject: agency.slug, actor: "admin" } });
  await afterChange();
  redirect(`/admin/agenzie/${agency.id}/?msg=${encodeURIComponent("Salvata")}`);
}

export async function removeAgency(fd: FormData) {
  await guard();
  const id = str(fd, "id");
  const a = await db.agency.findUnique({ where: { id }, select: { slug: true } });
  await db.agency.delete({ where: { id } });
  await db.changelogEntry.create({ data: { area: "site", action: "agency_remove", subject: a?.slug, actor: "admin" } });
  await afterChange();
  redirect("/admin/agenzie/");
}

export async function importCsvAction(fd: FormData) {
  await guard();
  const file = fd.get("file");
  const text = file instanceof File ? await file.text() : str(fd, "csv");
  if (!text.trim()) redirect(`/admin/agenzie/?msg=${encodeURIComponent("CSV vuoto")}`);
  const records = csvToRecords(text);
  const stats = await importRecords(records, { publish: fd.get("publish") === "on" });
  await db.changelogEntry.create({ data: { area: "ingest", action: "csv_import", diff: stats as unknown as Prisma.InputJsonValue, actor: "admin" } });
  await afterChange();
  redirect(`/admin/agenzie/?msg=${encodeURIComponent(`Import: ${stats.created} create, ${stats.updated} aggiornate, ${stats.skipped} saltate, ${stats.unresolvedCity} senza città`)}`);
}

export async function reviewApplication(fd: FormData) {
  await guard();
  const id = str(fd, "id");
  const decision = str(fd, "decision");
  const app = await db.application.findUnique({ where: { id } });
  if (!app) redirect("/admin/candidature/");
  if (decision === "reject") {
    await db.application.update({ where: { id }, data: { status: "rejected", reviewedAt: new Date() } });
    revalidatePath("/admin/candidature/");
    redirect("/admin/candidature/");
  }
  const city = await resolveCity(app.citySlug ?? undefined);
  const agency = await db.agency.create({
    data: {
      name: app.name,
      slug: await uniqueAgencySlug(app.name, city?.slug),
      website: app.website,
      domain: normalizeDomain(app.website) ?? null,
      email: app.email,
      phone: app.phone,
      cityId: city?.id,
      source: "application",
      sourceRef: app.id,
      published: false,
      claimed: true,
      claimedAt: new Date(),
      services: { create: (await db.service.findMany({ where: { slug: { in: (app.services as string[]) ?? [] } }, select: { id: true } })).map((s) => ({ serviceId: s.id })) },
    },
  });
  await db.application.update({ where: { id }, data: { status: "accepted", reviewedAt: new Date(), agencyId: agency.id } });
  await db.changelogEntry.create({ data: { area: "site", action: "application_accept", subject: agency.slug, actor: "admin" } });
  redirect(`/admin/agenzie/${agency.id}/?msg=${encodeURIComponent("Candidatura accettata: completa la scheda e pubblica")}`);
}
