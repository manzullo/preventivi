// Smistamento: proposta di professionisti per un lead (stesso servizio, stesso
// perimetro città, ordinate per score), assegnazione (max 3 attive), invio
// via email al professionista, esito con prezzo di vendita.

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { BASE_URL } from "@/lib/site";
import { cityScopeIds, agencyCardSelect } from "@/modules/directory/listing";
import { sendEmail } from "@/modules/notify/email";

export const MAX_ACTIVE = 3;
export const TOKEN_DAYS = 14;

export async function suggestAgencies(leadId: string, take = 5) {
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { city: true, service: true, assignments: { select: { agencyId: true } } } });
  if (!lead) return [];
  const exclude = lead.assignments.map((a) => a.agencyId);
  const cityIds = lead.city ? await cityScopeIds(lead.city) : undefined;
  const base = { published: true, id: { notIn: exclude }, ...(lead.serviceId ? { services: { some: { serviceId: lead.serviceId } } } : {}) };
  const local = await db.agency.findMany({ where: { ...base, ...(cityIds ? { cityId: { in: cityIds } } : {}) }, select: agencyCardSelect, orderBy: [{ score: "desc" }, { reviewCount: "desc" }], take });
  if (local.length >= take || !cityIds) return local;
  // Se in città non bastano, si allarga a tutta Italia con lo stesso servizio.
  const more = await db.agency.findMany({ where: { ...base, id: { notIn: [...exclude, ...local.map((a) => a.id)] } }, select: agencyCardSelect, orderBy: [{ score: "desc" }, { reviewCount: "desc" }], take: take - local.length });
  return [...local, ...more];
}

export async function proposeAssignment(leadId: string, agencyId: string): Promise<{ ok: boolean; message: string }> {
  const active = await db.leadAssignment.count({ where: { leadId, status: { in: ["proposed", "sent", "accepted"] } } });
  if (active >= MAX_ACTIVE) return { ok: false, message: `Già ${MAX_ACTIVE} professionisti attivi su questo lead` };
  const exists = await db.leadAssignment.findUnique({ where: { leadId_agencyId: { leadId, agencyId } } });
  if (exists) return { ok: false, message: "Professionista già proposta" };
  await db.leadAssignment.create({ data: { leadId, agencyId, token: randomBytes(24).toString("base64url"), tokenExpiresAt: new Date(Date.now() + TOKEN_DAYS * 864e5) } });
  if (active === 0) await db.lead.updateMany({ where: { id: leadId, status: "new" }, data: { status: "qualified" } });
  return { ok: true, message: "Professionista proposta" };
}

function leadEmailText(l: { id: string; company: string | null; budget: string | null; timing: string | null; description: string | null; service: { plural: string } | null; city: { name: string } | null }, agencyName: string, link: string): string {
  return [
    `Buongiorno ${agencyName},`,
    "",
    `una richiesta su Mister Wolf corrisponde ai vostri servizi:`,
    `- Richiesta: ${l.service?.plural ?? "servizio n.d."} a ${l.city?.name ?? "città n.d."}`,
    `- Budget: ${l.budget ?? "-"} · Tempi: ${l.timing ?? "-"}`,
    l.company ? `- Azienda: ${l.company}` : null,
    l.description ? `- Note del cliente: ${l.description.slice(0, 600)}` : null,
    "",
    `Vi interessa? Rispondete da qui (senza login, link valido ${TOKEN_DAYS} giorni):`,
    link,
    "",
    `Dopo l'accettazione vedete nome, email e telefono del cliente e lo contattate direttamente. Nessuna commissione sul lavoro.`,
    `Riferimento: ${l.id.slice(-8)} · ${BASE_URL}`,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

export function assignmentLink(token: string): string {
  return `${BASE_URL}/lead/${token}/`;
}

export async function sendAssignment(assignmentId: string): Promise<{ ok: boolean; message: string }> {
  const a = await db.leadAssignment.findUnique({ where: { id: assignmentId }, include: { agency: true, lead: { include: { service: true, city: true } } } });
  if (!a) return { ok: false, message: "Assegnazione non trovata" };
  if (!a.agency.email) {
    await db.leadAssignment.update({ where: { id: a.id }, data: { status: "sent", sentAt: new Date(), note: "Segnato come inviato a mano (il professionista non ha email in scheda)" } });
    return { ok: true, message: "Segnato come inviato: il professionista non ha email, contattala a mano" };
  }
  try {
    let token = a.token;
    if (!token || !a.tokenExpiresAt || a.tokenExpiresAt < new Date()) {
      token = randomBytes(24).toString("base64url");
      await db.leadAssignment.update({ where: { id: a.id }, data: { token, tokenExpiresAt: new Date(Date.now() + TOKEN_DAYS * 864e5) } });
    }
    await sendEmail([a.agency.email], `Nuova richiesta: ${a.lead.service?.plural ?? "servizio"} a ${a.lead.city?.name ?? ""}`, leadEmailText(a.lead, a.agency.name, assignmentLink(token)));
    await db.leadAssignment.update({ where: { id: a.id }, data: { status: "sent", sentAt: new Date(), note: null } });
    return { ok: true, message: `Inviato a ${a.agency.email}` };
  } catch (e) {
    await db.leadAssignment.update({ where: { id: a.id }, data: { note: `Invio fallito: ${String(e).slice(0, 200)}` } });
    return { ok: false, message: `Invio fallito: ${String(e).slice(0, 200)}` };
  }
}

export async function setAssignmentStatus(assignmentId: string, status: string, price?: number | null): Promise<void> {
  if (!["proposed", "sent", "accepted", "declined"].includes(status)) return;
  const a = await db.leadAssignment.update({ where: { id: assignmentId }, data: { status, price: price ?? undefined } });
  if (status === "accepted") {
    const lead = await db.lead.findUnique({ where: { id: a.leadId }, select: { status: true, soldPrice: true } });
    if (lead && lead.status !== "sold") {
      await db.lead.update({ where: { id: a.leadId }, data: { status: "sold", soldAt: new Date(), soldPrice: price ?? lead.soldPrice ?? undefined, agencyId: a.agencyId } });
    }
  }
}

/**
 * Smistamento in un click: propone le prime professionisti suggeriti fino a
 * riempire i posti attivi (max 3) e invia subito l'email a ciascuna.
 */
export async function autoAssign(leadId: string): Promise<{ ok: boolean; message: string }> {
  const active = await db.leadAssignment.count({ where: { leadId, status: { in: ["proposed", "sent", "accepted"] } } });
  const free = MAX_ACTIVE - active;
  if (free <= 0) return { ok: false, message: `Già ${MAX_ACTIVE} professionisti attivi su questo lead` };
  const picks = await suggestAgencies(leadId, free);
  if (picks.length === 0) return { ok: false, message: "Nessun professionista pubblicato da proporre" };
  const results: string[] = [];
  for (const a of picks) {
    const p = await proposeAssignment(leadId, a.id);
    if (!p.ok) { results.push(`${a.name}: ${p.message}`); continue; }
    const row = await db.leadAssignment.findUnique({ where: { leadId_agencyId: { leadId, agencyId: a.id } }, select: { id: true } });
    const s = row ? await sendAssignment(row.id) : { ok: false, message: "assegnazione non trovata" };
    results.push(`${a.name}: ${s.message}`);
  }
  return { ok: true, message: results.join(" · ") };
}

/**
 * Risposta del professionista dal link nell'email. Accettata → contatto visibile e
 * lead segnato venduto (il prezzo lo mette l'admin); rifiutata → posto libero.
 */
export async function respondToAssignment(token: string, answer: "accepted" | "declined"): Promise<{ ok: boolean; message: string }> {
  const a = await db.leadAssignment.findUnique({ where: { token } });
  if (!a) return { ok: false, message: "Link non valido" };
  if (a.tokenExpiresAt && a.tokenExpiresAt < new Date()) return { ok: false, message: "Link scaduto: chiedeteci un nuovo invio" };
  if (a.status === "accepted" || a.status === "declined") return { ok: true, message: a.status === "accepted" ? "Già accettata" : "Già rifiutata" };
  await setAssignmentStatus(a.id, answer);
  await db.leadAssignment.update({ where: { id: a.id }, data: { respondedAt: new Date() } });
  return { ok: true, message: answer === "accepted" ? "Accettata" : "Rifiutata" };
}
