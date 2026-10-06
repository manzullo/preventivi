// Email di conferma a chi ha inviato la richiesta (reciprocità e impegno:
// riceve subito qualcosa e sa cosa succede dopo). Mai bloccante: se SMTP
// non è configurato, si esce in silenzio.

import { db } from "@/lib/db";
import { settings } from "@/lib/settings";
import { firma } from "@/lib/crypto";
import { BASE_URL, SITE_NAME, paths } from "@/lib/site";
import { sendEmail } from "./email";

/** Link alla pagina della richiesta per il cliente, firmato: niente login. */
export function linkRichiesta(leadId: string): string {
  return `${BASE_URL}${paths.request(leadId, firma(leadId))}`;
}

export async function sendBuyerConfirmation(leadId: string): Promise<boolean> {
  const smtp = await settings.smtp();
  if (!smtp.host || !smtp.from) return false;
  const l = await db.lead.findUnique({ where: { id: leadId }, include: { service: true, city: true, submission: { select: { testMode: true } } } });
  if (!l?.email || l.submission?.testMode) return false;
  const first = l.name?.split(" ")[0] ?? "";
  const what = [l.service?.plural, l.city?.name].filter(Boolean).join(" a ");
  const text = [
    `Ciao${first ? ` ${first}` : ""},`,
    "",
    `abbiamo ricevuto la tua richiesta${what ? ` per ${what}` : ""}. Codice: ${l.id.slice(-8)}.`,
    "",
    "Cosa succede adesso:",
    "1. Entro un giorno lavorativo scegliamo fino a 3 professionisti in base alle recensioni pubbliche. Nessuno paga per essere selezionato.",
    "2. I professionisti ti contattano direttamente, di solito con una chiamata breve.",
    "3. Confronti i profili e i preventivi con calma. Nessuna commissione, nessun intermediario.",
    "",
    "Qui vedi a chi è arrivata la richiesta e chi ha già risposto:",
    linkRichiesta(l.id),
    "",
    "Intanto, quattro domande da fare a ogni professionista: cosa è compreso nel prezzo; quando può iniziare e quanto ci mette; che garanzia dà sul lavoro; se serve un sopralluogo.",
    "",
    `Se qualcosa non torna, rispondi a questa email.`,
    `${SITE_NAME} · ${BASE_URL}`,
  ].join("\n");
  try {
    await sendEmail([l.email], `Richiesta ricevuta${what ? `: ${what}` : ""} (${l.id.slice(-8)})`, text);
    return true;
  } catch (e) {
    console.error("conferma al cliente", e);
    return false;
  }
}

/**
 * Un professionista ha accettato: il cliente lo sa subito, con nome, profilo e
 * telefono (su Instapro è l'avviso "un professionista ha risposto"). Mai
 * bloccante, come la conferma.
 */
export async function sendBuyerAccepted(assignmentId: string): Promise<boolean> {
  const smtp = await settings.smtp();
  if (!smtp.host || !smtp.from) return false;
  const a = await db.leadAssignment.findUnique({
    where: { id: assignmentId },
    include: { agency: { select: { name: true, slug: true, phone: true, rating: true, reviewCount: true } }, lead: { include: { service: true, city: true, submission: { select: { testMode: true } } } } },
  });
  const l = a?.lead;
  if (!a || !l?.email || l.submission?.testMode) return false;
  const first = l.name?.split(" ")[0] ?? "";
  const what = [l.service?.plural, l.city?.name].filter(Boolean).join(" a ");
  const voto = a.agency.rating && a.agency.reviewCount ? ` (${a.agency.rating.toFixed(1).replace(".", ",")} su 5, ${a.agency.reviewCount} recensioni)` : "";
  const text = [
    `Ciao${first ? ` ${first}` : ""},`,
    "",
    `${a.agency.name}${voto} ha accettato la tua richiesta${what ? ` per ${what}` : ""} e ti contatterà a breve.`,
    a.agency.phone ? `Se preferisci chiamare tu: ${a.agency.phone}` : null,
    `Profilo e recensioni: ${BASE_URL}${paths.agency(a.agency.slug)}`,
    "",
    "Tutte le risposte alla tua richiesta, per confrontarle:",
    linkRichiesta(l.id),
    "",
    `${SITE_NAME} · ${BASE_URL}`,
  ]
    .filter((x) => x !== null)
    .join("\n");
  try {
    await sendEmail([l.email], `${a.agency.name} ha accettato la tua richiesta (${l.id.slice(-8)})`, text);
    return true;
  } catch (e) {
    console.error("avviso accettazione al cliente", e);
    return false;
  }
}
