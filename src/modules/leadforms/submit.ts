// Submit: valida contro gli step, crea Submission + Lead, attribuisce la
// visita, accoda l'upload conversione, chiama il webhook. La conversione
// client-side NON parte qui: parte su /grazie/ con il lead_id (niente race
// condition con il redirect).

import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { paths } from "@/lib/site";
import { getPublicForm } from "./forms";
import {
  EMAIL_RE,
  PHONE_RE,
  contaCifre,
  stepVisible,
  type Answers,
  type Contact,
  type PublicForm,
  type StepConfig,
} from "./schema";
import { hashIp, type VisitInput } from "./tracking";
import { sendBuyerConfirmation } from "@/modules/notify/buyer";
import { dispatchNotifications } from "@/modules/notify/dispatch";
import { enqueueUploads, processUploads } from "@/modules/ads/uploads";

export type SubmitInput = {
  formSlug: string;
  answers: Answers;
  contact: Contact;
  prefilled?: Record<string, string>;
  visitId?: string;
  sessionId?: string;
  tracking?: Partial<VisitInput>;
  clientId?: string;
  landingPath?: string;
  honeypot?: string;
  ip?: string | null;
  userAgent?: string;
};

export type SubmitResult =
  | { ok: true; leadId: string; redirect: string }
  | { ok: false; status: number; error: string; fields?: Record<string, string> };

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== "";
}

function validateAgainst(form: PublicForm, answers: Answers, contact: Contact, prefilled: Record<string, string>) {
  const fields: Record<string, string> = {};
  for (const s of form.steps) {
    const c: StepConfig = s.config;
    if (!stepVisible(c, answers, prefilled, s.key)) continue;
    if (c.type === "contact") {
      for (const f of c.fields) {
        const v = (contact[f.key] ?? "").trim();
        if (f.required && !v) fields[f.key] = "Campo obbligatorio";
        else if (v && f.type === "email" && !EMAIL_RE.test(v)) fields[f.key] = "Email non valida";
        else if (v && f.type === "tel" && (!PHONE_RE.test(v) || contaCifre(v) < 6)) fields[f.key] = "Telefono non valido";
      }
      continue;
    }
    if (c.required && !hasValue(answers[s.key])) fields[s.key] = "Risposta mancante";
    if (c.type === "textarea" && typeof answers[s.key] === "string") {
      const len = (answers[s.key] as string).length;
      if (len > c.maxLength) fields[s.key] = `Massimo ${c.maxLength} caratteri`;
    }
  }
  return fields;
}

const str = (v: unknown, max = 500): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : Array.isArray(v) && v.length ? v.join(", ").slice(0, max) : undefined;

export async function submitForm(input: SubmitInput): Promise<SubmitResult> {
  if (input.honeypot) return { ok: false, status: 400, error: "Richiesta non valida" };

  const form = await getPublicForm(input.formSlug);
  if (!form) return { ok: false, status: 404, error: "Form non trovato" };

  const prefilled = input.prefilled ?? {};
  const answers: Answers = { ...prefilled, ...input.answers };
  const fields = validateAgainst(form, answers, input.contact, prefilled);
  if (Object.keys(fields).length) return { ok: false, status: 422, error: "Controlla i campi", fields };

  // Attribuzione: la visita registrata all'ingresso vince sui parametri correnti.
  const visit = input.visitId ? await db.visit.findUnique({ where: { id: input.visitId } }) : null;
  const t = input.tracking ?? {};
  const attr = {
    gclid: visit?.gclid ?? str(t.gclid),
    gbraid: visit?.gbraid ?? str(t.gbraid),
    wbraid: visit?.wbraid ?? str(t.wbraid),
    utmSource: visit?.utmSource ?? str(t.utmSource),
    utmMedium: visit?.utmMedium ?? str(t.utmMedium),
    utmCampaign: visit?.utmCampaign ?? str(t.utmCampaign),
    utmTerm: visit?.utmTerm ?? str(t.utmTerm),
    utmContent: visit?.utmContent ?? str(t.utmContent),
    matchType: visit?.matchType ?? str(t.matchType),
    device: visit?.device ?? str(t.device),
    network: visit?.network ?? str(t.network),
  };

  const [service, city, agency] = await Promise.all([
    str(answers.servizio) ? db.service.findUnique({ where: { slug: String(answers.servizio) } }) : null,
    str(answers.citta) ? db.city.findUnique({ where: { slug: String(answers.citta) } }) : null,
    str(answers.professionista) ? db.agency.findUnique({ where: { slug: String(answers.professionista) } }) : null,
  ]);

  // Il testo della casella viene fotografato adesso, insieme alla risposta:
  // se un domani lo riscriviamo, i lead vecchi devono conservare la frase che
  // quella persona ha davvero letto. È la parte che il GDPR chiede di poter
  // dimostrare, e la configurazione del modulo cambia.
  const passoContatti = form.steps.find((x) => x.config.type === "contact");
  const testoConsenso =
    passoContatti?.config.type === "contact" ? passoContatti.config.consentText : undefined;
  const contatto = {
    ...input.contact,
    ...(input.contact.consenso === "1" && testoConsenso ? { consenso_testo: testoConsenso } : {}),
  };

  const phonePrefix = str(input.contact.telefono_prefisso) ?? "";
  const phone = str(input.contact.telefono);
  const clientId = str(input.clientId) ?? form.config.clientId;
  const ipHash = hashIp(input.ip);

  const { lead } = await db.$transaction(async (tx) => {
    const submission = await tx.submission.create({
      data: {
        formId: form.id,
        answers: answers as Prisma.InputJsonValue,
        contact: contatto as Prisma.InputJsonValue,
        testMode: form.testMode,
        visitId: visit?.id,
        clientId,
        landingPath: str(input.landingPath),
        ipHash,
        userAgent: str(input.userAgent, 300),
      },
    });
    const lead = await tx.lead.create({
      data: {
        submissionId: submission.id,
        formId: form.id,
        serviceId: service?.id,
        cityId: city?.id,
        agencyId: agency?.id,
        budget: str(answers.budget),
        timing: str(answers.tempi),
        description: str(answers.descrizione, 4000),
        name: str(input.contact.nome),
        email: str(input.contact.email)?.toLowerCase(),
        phone: phone ? `${phonePrefix} ${phone}`.trim() : undefined,
        company: str(input.contact.azienda),
        ...attr,
        landingPath: str(input.landingPath),
        clientId,
        value: form.config.value,
        currency: form.config.currency,
        eventType: form.config.eventType,
        status: form.testMode ? "rejected" : "new",
      },
    });
    await tx.analyticsEvent.create({
      data: {
        type: "form_submit",
        formId: form.id,
        sessionId: input.sessionId,
        path: str(input.landingPath),
        serviceSlug: service?.slug,
        citySlug: city?.slug,
        meta: { leadId: lead.id, testMode: form.testMode } as Prisma.InputJsonValue,
      },
    });
    if (input.sessionId) await tx.formDraft.updateMany({ where: { formId: form.id, sessionId: input.sessionId }, data: { converted: true } });
    // Coda per l'upload offline (solo conversioni con upload API attivo).
    if (attr.gclid && !form.testMode) await enqueueUploads(tx, lead.id, form.id, attr.gclid, form.config.value);
    return { lead };
  });

  // Webhook: stesso payload del plugin (risposte + attribuzione + form_id),
  // più lead_id. Errori registrati, mai bloccanti.
  if (form.config.webhookUrl && !form.testMode) {
    const body = JSON.stringify({ ...answers, ...input.contact, ...attr, form_id: form.slug, lead_id: lead.id, client_id: clientId });
    try {
      const res = await fetch(form.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.error(`webhook ${form.config.webhookUrl}: HTTP ${res.status}`);
    } catch (e) {
      console.error("webhook error", e);
    }
  }

  // Notifiche: dopo la risposta al browser non serve aspettare, ma in ambienti
  // serverless il processo può morire: si attende con timeout breve.
  await Promise.race([
    Promise.all([dispatchNotifications(lead.id).catch((e) => console.error("notifiche", e)), sendBuyerConfirmation(lead.id).catch((e) => console.error("conferma", e)), processUploads({ leadId: lead.id }).catch((e) => console.error("upload", e))]),
    new Promise((r) => setTimeout(r, 8_000)),
  ]);

  const base = form.config.redirectUrl || paths.thanks();
  const redirect = `${base}${base.includes("?") ? "&" : "?"}lead=${lead.id}`;
  return { ok: true, leadId: lead.id, redirect };
}
