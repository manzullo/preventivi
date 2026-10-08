// Smista un lead alle regole di notifica attive: filtri per form, valore,
// servizio, città. Ogni invio finisce in NotificationLog. Mai bloccante.

import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { BASE_URL } from "@/lib/site";
import { sendEmail } from "./email";
import { sendWhatsapp } from "./whatsapp";

export type Rules = { minValue?: number; services?: string[]; cities?: string[]; excludeTest?: boolean };

export function leadText(l: { id: string; name: string | null; company: string | null; email: string | null; phone: string | null; budget: string | null; timing: string | null; description: string | null; service?: { plural: string } | null; city?: { name: string } | null; utmSource: string | null; gclid: string | null; clientId: string | null }): string {
  return [
    `Nuovo lead: ${l.name ?? "senza nome"}${l.company ? ` (${l.company})` : ""}`,
    `${l.service?.plural ?? "servizio n.d."} a ${l.city?.name ?? "città n.d."}`,
    `Budget: ${l.budget ?? "-"} · Tempi: ${l.timing ?? "-"}`,
    `Email: ${l.email ?? "-"} · Tel: ${l.phone ?? "-"}`,
    l.description ? `Note: ${l.description.slice(0, 300)}` : null,
    `Origine: ${l.gclid ? "Google Ads" : l.utmSource ?? "diretto"}${l.clientId ? ` · ${l.clientId}` : ""}`,
    `${BASE_URL}/admin/lead/${l.id}/`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function dispatchNotifications(leadId: string): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { service: true, city: true, submission: { select: { testMode: true } } } });
  if (!lead) return;
  const rules = await db.notification.findMany({ where: { enabled: true, OR: [{ formId: null }, { formId: lead.formId ?? "" }] } });
  const text = leadText(lead);

  for (const n of rules) {
    const r = (n.rules ?? {}) as Rules;
    const skip =
      (r.excludeTest !== false && lead.submission?.testMode) ||
      (r.minValue !== undefined && (lead.value ?? 0) < r.minValue) ||
      (r.services?.length && !r.services.includes(lead.service?.slug ?? "")) ||
      (r.cities?.length && !r.cities.includes(lead.city?.slug ?? ""));
    const recipients = (Array.isArray(n.recipients) ? n.recipients : []) as string[];
    if (skip || recipients.length === 0) {
      await db.notificationLog.create({ data: { notificationId: n.id, leadId, status: "skipped", payload: { reason: skip ? "regole" : "nessun destinatario" } as Prisma.InputJsonValue } });
      continue;
    }
    try {
      if (n.channel === "email") await sendEmail(recipients, `Nuovo lead: ${lead.name ?? ""} · ${lead.service?.plural ?? ""}`, text);
      else await sendWhatsapp(recipients, text);
      await db.notificationLog.create({ data: { notificationId: n.id, leadId, status: "sent", payload: { recipients } as Prisma.InputJsonValue } });
    } catch (e) {
      await db.notificationLog.create({ data: { notificationId: n.id, leadId, status: "failed", error: String(e).slice(0, 500) } });
    }
  }
}
