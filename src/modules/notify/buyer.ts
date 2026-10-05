// Email di conferma a chi ha inviato la richiesta (reciprocità e impegno:
// riceve subito qualcosa e sa cosa succede dopo). Mai bloccante: se SMTP
// non è configurato, si esce in silenzio.

import { db } from "@/lib/db";
import { settings } from "@/lib/settings";
import { BASE_URL, SITE_NAME } from "@/lib/site";
import { sendEmail } from "./email";

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
    "3. Confronti i preventivi con calma. Nessuna commissione, nessun intermediario.",
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
