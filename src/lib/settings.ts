// Impostazioni globali tipizzate sopra la tabella Setting (chiave/valore).
// I segreti sono cifrati prima di essere salvati.

import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { decrypt, encrypt } from "./crypto";
import { db } from "./db";

export const smtpSchema = z.object({
  host: z.string().default(""),
  port: z.number().int().default(587),
  secure: z.boolean().default(false),
  user: z.string().default(""),
  pass: z.string().default(""), // in chiaro solo in memoria
  // Indirizzo che spedisce: sta su un dominio già configurato per la posta
  // (SPF e DKIM sono i suoi), non sul dominio del sito.
  from: z.string().default(""),
  // Nome visibile nella casella di chi riceve: "Mister Wolf".
  fromName: z.string().default(""),
  // Dove finiscono le risposte, se diverso dal mittente.
  replyTo: z.string().default(""),
});
export type SmtpSettings = z.infer<typeof smtpSchema>;

export const whatsappSchema = z.object({
  provider: z.enum(["none", "evolution", "callmebot"]).default("none"),
  evolutionUrl: z.string().default(""),
  evolutionInstance: z.string().default(""),
  evolutionKey: z.string().default(""),
  callmebotKey: z.string().default(""),
});
export type WhatsappSettings = z.infer<typeof whatsappSchema>;

export const trackingSchema = z.object({
  gtmId: z.string().default(""),
  ga4Id: z.string().default(""),
  /**
   * Microsoft Clarity: mappe dei clic e registrazioni delle sessioni.
   * Scrive cookie di terze parti, quindi va acceso solo insieme a un avviso
   * sui cookie che lo tiene spento finché chi visita non dice di sì.
   */
  clarityId: z.string().default(""),
});
export type TrackingSettings = z.infer<typeof trackingSchema>;

// Google Ads: stesse chiavi del plugin (psf_gads_*), qui in un solo record.
export const gadsSchema = z.object({
  developerToken: z.string().default(""),
  clientId: z.string().default(""),
  clientSecret: z.string().default(""),
  refreshToken: z.string().default(""),
  loginCustomerId: z.string().default(""),
  accessToken: z.string().default(""),
  accessExpires: z.number().default(0),
  accountEmail: z.string().default(""),
  lastError: z.string().default(""),
  defaultCustomerId: z.string().default(""),
});
export type GadsSettings = z.infer<typeof gadsSchema>;

// AI Assistant: provider attivo, chiavi e modelli per provider (port di psf_ai_*).
export const aiSchema = z.object({
  activeProvider: z.enum(["claude", "openai", "gemini", "deepseek", "kieai"]).default("claude"),
  temperature: z.number().default(0.7),
  maxTokens: z.number().int().default(4096),
  claudeKey: z.string().default(""),
  claudeModel: z.string().default(""),
  openaiKey: z.string().default(""),
  openaiModel: z.string().default(""),
  geminiKey: z.string().default(""),
  geminiModel: z.string().default(""),
  deepseekKey: z.string().default(""),
  deepseekModel: z.string().default(""),
  kieaiKey: z.string().default(""),
  kieaiModel: z.string().default(""),
});
export type AiSettings = z.infer<typeof aiSchema>;

// Opzioni del sito pubblico (blocco "Nei dintorni" come guidalocation, CTA).
export const siteSchema = z.object({
  nearbyBlock: z.boolean().default(true),
  nearbyGroups: z.coerce.number().int().min(1).max(5).default(3),
  nearbyPerGroup: z.coerce.number().int().min(1).max(6).default(4),
  nearbyCap: z.coerce.number().int().min(1).max(20).default(10),
  whatsappCta: z.boolean().default(true),
  faqAuto: z.boolean().default(true),
  heroTest: z.boolean().default(true), // resta per compatibilità: vale come "auto"
  /**
   * Vestito della fascia in cima agli elenchi e del riquadro di richiesta.
   * auto = metà sessioni chiara e metà scura, con il risultato in Performance.
   * Le altre scelte valgono per tutti e non fanno nessun test.
   */
  heroStyle: z.enum(["auto", "light", "dark", "action", "plain"]).default("auto"),
});

/** Le facce disponibili, con la riga che le descrive nel pannello. */
export const HERO_STYLES: { valore: SiteSettings["heroStyle"]; nome: string; nota: string }[] = [
  { valore: "auto", nome: "A caso, per confronto", nota: "metà sessioni vedono la chiara, metà la scura: il confronto sta in Performance" },
  { valore: "light", nome: "Chiara", nota: "fondo grigio tenue, bottone blu" },
  { valore: "dark", nome: "Scura", nota: "fondo nero, bottone bianco: l'unica cosa chiara è il bottone" },
  { valore: "action", nome: "Blu piena", nota: "fondo del colore del marchio, bottone bianco" },
  { valore: "plain", nome: "Senza fascia", nota: "solo titolo e bottone sul fondo della pagina" },
];
export type SiteSettings = z.infer<typeof siteSchema>;

const SECRET_FIELDS: Record<string, string[]> = {
  ai: ["claudeKey", "openaiKey", "geminiKey", "deepseekKey", "kieaiKey"],
  smtp: ["pass"],
  whatsapp: ["evolutionKey", "callmebotKey"],
  gads: ["developerToken", "clientSecret", "refreshToken", "accessToken"],
};

async function read<T>(key: string, schema: z.ZodType<T>): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  const raw = (row?.value ?? {}) as Record<string, unknown>;
  for (const f of SECRET_FIELDS[key] ?? []) {
    if (typeof raw[f] === "string" && raw[f]) {
      try {
        raw[f] = decrypt(raw[f] as string);
      } catch {
        raw[f] = "";
      }
    }
  }
  return schema.parse(raw);
}

async function write(key: string, value: Record<string, unknown>): Promise<void> {
  const stored = { ...value };
  for (const f of SECRET_FIELDS[key] ?? []) {
    if (typeof stored[f] === "string" && stored[f]) stored[f] = encrypt(stored[f] as string);
  }
  await db.setting.upsert({ where: { key }, create: { key, value: stored as Prisma.InputJsonValue }, update: { value: stored as Prisma.InputJsonValue } });
}

export const settings = {
  site: () => read("site", siteSchema),
  saveSite: (v: SiteSettings) => write("site", v),
  ai: () => read("ai", aiSchema),
  saveAi: (v: AiSettings) => write("ai", v),
  gads: () => read("gads", gadsSchema),
  saveGads: (v: GadsSettings) => write("gads", v),
  patchGads: async (p: Partial<GadsSettings>) => write("gads", { ...(await read("gads", gadsSchema)), ...p }),
  smtp: () => read("smtp", smtpSchema),
  whatsapp: () => read("whatsapp", whatsappSchema),
  tracking: () => read("tracking", trackingSchema),
  saveSmtp: (v: SmtpSettings) => write("smtp", v),
  saveWhatsapp: (v: WhatsappSettings) => write("whatsapp", v),
  saveTracking: (v: TrackingSettings) => write("tracking", v),
};
