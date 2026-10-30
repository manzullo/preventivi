// Tracking lato server: visite (UTM/gclid), eventi per passo, funnel giornaliero.

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.APP_SECRET || "dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export type VisitInput = {
  sessionId: string;
  landingPath?: string;
  referrer?: string;
  clientId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  matchType?: string;
  device?: string;
  network?: string;
  ipHash?: string | null;
  userAgent?: string;
  /** Visita di chi gestisce il sito: resta in archivio ma non si conta. */
  interna?: boolean;
};

const trim = (s?: string | null) => (typeof s === "string" && s.trim() ? s.trim().slice(0, 500) : undefined);

export async function recordVisit(v: VisitInput): Promise<string> {
  // Se il gclid è presente e manca la sorgente, la sorgente è google/cpc:
  // stessa regola del plugin.
  const gclid = trim(v.gclid);
  const utmSource = trim(v.utmSource) ?? (gclid ? "google" : undefined);
  const utmMedium = trim(v.utmMedium) ?? (gclid ? "cpc" : undefined);
  const row = await db.visit.create({
    data: {
      sessionId: v.sessionId.slice(0, 80),
      landingPath: trim(v.landingPath),
      referrer: trim(v.referrer),
      clientId: trim(v.clientId),
      utmSource,
      utmMedium,
      utmCampaign: trim(v.utmCampaign),
      utmTerm: trim(v.utmTerm),
      utmContent: trim(v.utmContent),
      gclid,
      gbraid: trim(v.gbraid),
      wbraid: trim(v.wbraid),
      matchType: trim(v.matchType),
      device: trim(v.device),
      network: trim(v.network),
      ipHash: v.ipHash ?? null,
      userAgent: trim(v.userAgent),
      interna: v.interna ?? false,
    },
    select: { id: true },
  });
  return row.id;
}

export type StepEventInput = {
  type: "step_view" | "step_completed";
  formId: string;
  stepId: string;
  sessionId?: string;
  path?: string;
  meta?: Prisma.InputJsonValue;
};

function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function recordStepEvent(e: StepEventInput): Promise<void> {
  const step = await db.formStep.findUnique({ where: { id: e.stepId }, select: { id: true, formId: true } });
  if (!step || step.formId !== e.formId) return;
  const day = today();
  const inc = e.type === "step_view" ? { views: { increment: 1 } } : { completions: { increment: 1 } };
  await db.$transaction([
    db.analyticsEvent.create({
      data: { type: e.type, formId: e.formId, stepId: e.stepId, sessionId: e.sessionId, path: e.path, meta: e.meta },
    }),
    db.stepAnalytics.upsert({
      where: { formId_stepId_day: { formId: e.formId, stepId: e.stepId, day } },
      create: { formId: e.formId, stepId: e.stepId, day, views: e.type === "step_view" ? 1 : 0, completions: e.type === "step_completed" ? 1 : 0 },
      update: inc,
    }),
  ]);
}
