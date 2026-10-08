"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { BASE_URL } from "@/lib/site";
import { EMAIL_RE } from "@/modules/leadforms/schema";
import { sendEmail } from "@/modules/notify/email";

// Rivendicazione: l'email deve stare sul dominio del sito in scheda. Il link
// con token conferma e marca la scheda come rivendicata e verificata.

export async function requestClaim(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const ruolo = String(fd.get("role") ?? "").trim().slice(0, 80) || null;
  const telefono = String(fd.get("phone") ?? "").trim().slice(0, 40) || null;
  const back = (m: string) => redirect(`/rivendica/${slug}/?msg=${encodeURIComponent(m)}`);
  const a = await db.agency.findUnique({ where: { slug } });
  if (!a || !a.published) back("Scheda non trovata");
  if (!EMAIL_RE.test(email)) back("Email non valida");
  if (!a!.domain) back("Questa scheda non ha un sito web: scrivici e verifichiamo a mano.");
  const domain = email.split("@")[1];
  if (domain !== a!.domain && !domain.endsWith(`.${a!.domain}`)) back(`Serve un'email sul dominio ${a!.domain}.`);
  const token = randomBytes(24).toString("hex");
  await db.agencyClaim.create({ data: { agencyId: a!.id, email, token, role: ruolo, phone: telefono } });
  try {
    await sendEmail([email], `Conferma la rivendicazione di ${a!.name}`, `Per confermare che gestisci ${a!.name} apri questo link:\n${BASE_URL}/rivendica/${slug}/?token=${token}\n\nSe non hai chiesto tu la rivendicazione, ignora questa email.`);
  } catch (e) {
    back(`Invio email fallito (${String(e).slice(0, 80)}): scrivici e verifichiamo a mano.`);
  }
  back("Email inviata: apri il link per confermare.");
}

export async function confirmClaim(slug: string, token: string): Promise<{ ok: boolean; message: string }> {
  const c = await db.agencyClaim.findUnique({ where: { token }, include: { agency: true } });
  if (!c || c.agency.slug !== slug) return { ok: false, message: "Link non valido." };
  if (c.status === "approved") return { ok: true, message: "Rivendicazione già approvata: puoi entrare nell'area professionista." };
  if (c.status === "rejected") return { ok: false, message: "Rivendicazione respinta. Scrivici se pensi sia un errore." };
  if (c.status === "email_ok") return { ok: true, message: "Indirizzo già confermato: stiamo verificando la richiesta." };
  if (Date.now() - c.createdAt.getTime() > 7 * 864e5) return { ok: false, message: "Link scaduto: richiedi una nuova email." };
  // L'email prova l'indirizzo, non la persona: la scheda diventa verificata solo
  // dopo un controllo nostro, altrimenti chiunque abbia una casella sul dominio
  // potrebbe prendersi la scheda di un'altra professionista.
  await db.$transaction([
    db.agencyClaim.update({ where: { id: c.id }, data: { status: "email_ok", verifiedAt: new Date() } }),
    db.changelogEntry.create({ data: { area: "site", action: "claim_email_ok", subject: c.agency.slug, actor: c.email } }),
  ]);
  try {
    await sendEmail(
      [process.env.ADMIN_EMAIL ?? ""],
      `Rivendicazione da verificare: ${c.agency.name}`,
      `${c.email} ha confermato l'indirizzo per ${c.agency.name} (${BASE_URL}/agenzia/${c.agency.slug}/).\nRuolo dichiarato: ${c.role ?? "non indicato"}\nTelefono: ${c.phone ?? "non indicato"}\n\nApprova o respingi da ${BASE_URL}/admin/rivendicazioni/`,
    );
  } catch { /* la pratica resta comunque in elenco nell'admin */ }
  return {
    ok: true,
    message: "Indirizzo confermato. Ora controlliamo a mano che tu gestisca davvero il professionista: ti scriviamo entro un giorno lavorativo, di solito con una telefonata al numero pubblico del professionista.",
  };
}
