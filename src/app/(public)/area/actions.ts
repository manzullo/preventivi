"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { BASE_URL } from "@/lib/site";
import { EMAIL_RE } from "@/modules/leadforms/schema";
import { sendEmail } from "@/modules/notify/email";
import { OWNER_COOKIE, currentOwnerId } from "@/modules/owner/auth";

/** Manda il link di accesso a un'email sul dominio del professionista. */
export async function requestOwnerLink(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const back = (m: string) => redirect(`/area/?msg=${encodeURIComponent(m)}`);
  if (!EMAIL_RE.test(email)) back("Email non valida");
  const dominio = email.split("@")[1];
  // Si accettano solo le schede con quel dominio: è la stessa prova della rivendicazione.
  const professionisti = await db.agency.findMany({
    where: { published: true, OR: [{ domain: dominio }, { domain: { endsWith: `.${dominio}` } }] },
    select: { id: true, name: true, slug: true },
    take: 5,
  });
  if (professionisti.length === 0) back("Nessuna scheda con questo dominio: rivendicala prima da /rivendica/");
  // Si entra solo dove la rivendicazione è stata approvata da una persona.
  const approvate = await db.agencyClaim.findMany({
    where: { status: "approved", agencyId: { in: professionisti.map((x) => x.id) } },
    select: { agencyId: true, email: true },
  });
  const mia = approvate.find((c) => c.email === email) ?? approvate[0];
  if (!mia) back("Questa scheda non è ancora approvata: rivendicala da /rivendica/ e ti verifichiamo a mano.");
  const a = professionisti.find((x) => x.id === mia!.agencyId)!;
  const token = randomBytes(24).toString("hex");
  await db.ownerLogin.create({ data: { agencyId: a.id, email, token } });
  try {
    await sendEmail(
      [email],
      `Accesso all'area di ${a.name}`,
      `Per entrare nell'area della tua attività apri questo link (vale 2 ore):\n${BASE_URL}/area/entra/?token=${token}\n\nSe non hai chiesto tu l'accesso, ignora questa email.`,
    );
  } catch (e) {
    back(`Invio email fallito (${String(e).slice(0, 80)})`);
  }
  back("Ti abbiamo mandato il link di accesso: controlla la posta.");
}

export async function ownerLogout() {
  const c = await cookies();
  c.delete(OWNER_COOKIE);
  redirect("/area/");
}

/** Salva i dati della scheda. Solo il professionista collegata, solo i campi suoi. */
export async function saveOwnerAgency(fd: FormData) {
  const id = await currentOwnerId();
  if (!id) redirect("/area/");
  const testo = (k: string) => String(fd.get(k) ?? "").trim();
  const numero = (k: string) => { const n = Number(testo(k)); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
  const lista = (k: string) => testo(k).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 24);
  const faq = testo("faq")
    .split("\n")
    .map((r) => r.split("|"))
    .filter((p) => p.length >= 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ q: p[0].trim(), a: p.slice(1).join("|").trim() }))
    .slice(0, 12);

  // Il profilo Trustpilot si aggiunge ai social già presenti, non li sostituisce.
  const professionista = await db.agency.findUnique({ where: { id }, select: { social: true } });
  const social = { ...((professionista?.social as Record<string, string> | null) ?? {}) };
  const tp = testo("trustpilot");
  if (tp.startsWith("http")) social.trustpilot = tp;
  else delete social.trustpilot;

  await db.agency.update({
    where: { id },
    data: {
      social: Object.keys(social).length ? (social as never) : undefined,
      description: testo("description").slice(0, 2000) || null,
      phone: testo("phone") || null,
      whatsapp: testo("whatsapp") || null,
      email: testo("email") || null,
      website: testo("website") || null,
      street: testo("street") || null,
      postalCode: testo("postalCode") || null,
      foundedYear: numero("foundedYear"),
      teamSize: testo("teamSize") || null,
      minBudget: numero("minBudget"),
      skills: lista("skills"),
      faq: faq.length ? faq : undefined,
    },
  });
  await db.changelogEntry.create({ data: { area: "site", action: "owner_update", subject: id, actor: "titolare" } });
  redirect("/area/scheda/?msg=Salvato");
}

/** Il professionista accetta o rifiuta una richiesta ricevuta. */
export async function respondFromArea(fd: FormData) {
  const id = await currentOwnerId();
  if (!id) redirect("/area/");
  const assignmentId = String(fd.get("id") ?? "");
  const azione = String(fd.get("azione") ?? "");
  const a = await db.leadAssignment.findUnique({ where: { id: assignmentId }, select: { id: true, agencyId: true, status: true } });
  if (!a || a.agencyId !== id) redirect("/area/richieste/?msg=Richiesta+non+trovata");
  if (a.status === "accepted" || a.status === "declined") redirect("/area/richieste/?msg=Richiesta+già+chiusa");
  await db.leadAssignment.update({
    where: { id: a.id },
    data: { status: azione === "accetta" ? "accepted" : "declined", respondedAt: new Date() },
  });
  redirect(`/area/richieste/?msg=${azione === "accetta" ? "Richiesta+accettata" : "Richiesta+rifiutata"}`);
}
