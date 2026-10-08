"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BASE_URL } from "@/lib/site";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/modules/notify/email";

/** Approva una rivendicazione: da qui in poi il titolare entra nell'area. */
export async function approveClaim(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const note = String(fd.get("note") ?? "").trim().slice(0, 500) || null;
  const c = await db.agencyClaim.findUnique({ where: { id }, include: { agency: { select: { id: true, name: true, slug: true, email: true } } } });
  if (!c) return;

  const token = randomBytes(24).toString("hex");
  await db.$transaction([
    db.agencyClaim.update({ where: { id: c.id }, data: { status: "approved", approvedAt: new Date(), approvedBy: process.env.ADMIN_EMAIL ?? "admin", note } }),
    db.agency.update({ where: { id: c.agencyId }, data: { claimed: true, claimedAt: new Date(), verified: true, email: c.agency.email ?? c.email } }),
    db.ownerLogin.create({ data: { agencyId: c.agencyId, email: c.email, token } }),
    db.changelogEntry.create({ data: { area: "site", action: "claim_approved", subject: c.agency.slug, actor: c.email } }),
  ]);

  try {
    await sendEmail(
      [c.email],
      `${c.agency.name}: rivendicazione approvata`,
      `Abbiamo verificato la richiesta: la scheda di ${c.agency.name} è tua.\n\nEntra nell'area professionista da questo link (vale 2 ore):\n${BASE_URL}/area/entra/?token=${token}\n\nDa lì aggiorni la scheda, rispondi alle richieste dei clienti e vedi i numeri.\nLe volte successive entri da ${BASE_URL}/area/ chiedendo un nuovo link.`,
    );
  } catch { /* il titolare può comunque chiedere il link da /area/ */ }
  revalidatePath("/admin/rivendicazioni/");
}

/** Respinge la richiesta: la scheda resta com'era. */
export async function rejectClaim(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const note = String(fd.get("note") ?? "").trim().slice(0, 500) || null;
  const c = await db.agencyClaim.findUnique({ where: { id }, include: { agency: { select: { slug: true, name: true } } } });
  if (!c) return;
  await db.$transaction([
    db.agencyClaim.update({ where: { id: c.id }, data: { status: "rejected", note } }),
    db.changelogEntry.create({ data: { area: "site", action: "claim_rejected", subject: c.agency.slug, actor: c.email } }),
  ]);
  try {
    await sendEmail([c.email], `${c.agency.name}: rivendicazione non approvata`, `Non siamo riusciti a verificare che tu gestisca ${c.agency.name}.${note ? `\n\nMotivo: ${note}` : ""}\n\nSe è un errore rispondi a questa email con un riferimento verificabile (numero aziendale, visura, indirizzo email del dominio con firma).`);
  } catch { /* nessun blocco */ }
  revalidatePath("/admin/rivendicazioni/");
}
