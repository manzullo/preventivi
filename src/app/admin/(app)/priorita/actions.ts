"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function quando(fd: FormData, k: string): Date | null {
  const v = str(fd, k);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Mette un professionista nella corsia in evidenza di una pagina: tutto il servizio, tutta la città, o l'incrocio dei due. */
export async function creaPosizione(fd: FormData) {
  await requireAdmin();
  const cercata = str(fd, "professionista");
  const professionista = await db.agency.findFirst({
    where: { OR: [{ slug: cercata.toLowerCase() }, { name: { equals: cercata, mode: "insensitive" } }] },
    select: { id: true, slug: true },
  });
  if (!professionista) {
    revalidatePath("/admin/priorita/");
    return;
  }
  const servizio = str(fd, "servizio");
  const citta = str(fd, "citta");
  const [s, c] = await Promise.all([
    servizio ? db.service.findUnique({ where: { slug: servizio }, select: { id: true } }) : null,
    citta ? db.city.findUnique({ where: { slug: citta }, select: { id: true } }) : null,
  ]);
  await db.placement.create({
    data: {
      agencyId: professionista.id,
      serviceId: s?.id ?? null,
      cityId: c?.id ?? null,
      priority: Math.min(Math.max(Number(str(fd, "priorita")) || 10, 1), 999),
      label: str(fd, "etichetta") || null,
      note: str(fd, "note") || null,
      startsAt: quando(fd, "inizio"),
      endsAt: quando(fd, "fine"),
    },
  });
  await db.changelogEntry.create({ data: { area: "site", action: "placement_create", subject: professionista.slug, actor: "admin" } });
  revalidatePath("/admin/priorita/");
}

export async function togliPosizione(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const p = await db.placement.findUnique({ where: { id }, select: { agency: { select: { slug: true } } } });
  await db.placement.delete({ where: { id } });
  await db.changelogEntry.create({ data: { area: "site", action: "placement_remove", subject: p?.agency.slug, actor: "admin" } });
  revalidatePath("/admin/priorita/");
}
