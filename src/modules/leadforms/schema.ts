// Contratto di configurazione di form e step: port di PartySpot Forms.
// Le chiavi del plugin (step_type, field_id, image_url, ...) diventano
// camelCase; i tipi di step restano gli stessi nove.

import { z } from "zod";

export const optionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().optional(),
  imageUrl: z.string().optional(),
  description: z.string().optional(),
  // Nomi alternativi che fanno trovare l'opzione (comuni minori → capoluogo).
  keywords: z.array(z.string()).optional(),
});
export type Option = z.infer<typeof optionSchema>;

export const conditionSchema = z.object({
  fieldKey: z.string().min(1),
  operator: z.enum(["equals", "not_equals", "in", "not_in", "gte", "lte", "exists"]),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

export const contactFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "email", "tel", "textarea", "company"]),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  // Microcopy sotto il campo: il perché della richiesta (es. telefono).
  hint: z.string().optional(),
});
export type ContactField = z.infer<typeof contactFieldSchema>;

const base = {
  title: z.string().min(1),
  subtitle: z.string().optional(),
  required: z.boolean().default(true),
  // Se la risposta arriva già dall'URL (es. ?servizio=), lo step si salta.
  skipIfPrefilled: z.boolean().default(true),
  condition: conditionSchema.optional(),
};

export const stepConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cards"), ...base, options: z.array(optionSchema).min(1), multiple: z.boolean().default(false), columns: z.number().int().min(1).max(4).default(2) }),
  z.object({ type: z.literal("multi"), ...base, options: z.array(optionSchema).min(1), columns: z.number().int().min(1).max(4).default(2) }),
  z.object({ type: z.literal("image_select"), ...base, options: z.array(optionSchema).min(1), multiple: z.boolean().default(false) }),
  z.object({ type: z.literal("video"), ...base, videoUrl: z.string().min(1), maxHeight: z.number().int().optional(), autoplay: z.boolean().default(true), options: z.array(optionSchema).default([]) }),
  z.object({ type: z.literal("slider"), ...base, min: z.number(), max: z.number(), step: z.number().default(1), prefix: z.string().optional(), suffix: z.string().optional(), defaultValue: z.number().optional() }),
  z.object({ type: z.literal("number"), ...base, min: z.number().default(0), max: z.number().default(100), step: z.number().default(1), defaultValue: z.number().default(1), prefix: z.string().optional(), suffix: z.string().optional() }),
  z.object({ type: z.literal("select"), ...base, options: z.array(optionSchema).default([]), source: z.enum(["services", "cities"]).optional(), searchable: z.boolean().default(false), placeholder: z.string().optional() }),
  z.object({ type: z.literal("textarea"), ...base, placeholder: z.string().optional(), minLength: z.number().int().default(0), maxLength: z.number().int().default(2000) }),
  z.object({ type: z.literal("contact"), ...base, fields: z.array(contactFieldSchema).min(1), consentText: z.string().default("Acconsento al trattamento dei dati per essere ricontattato."), submitLabel: z.string().optional() }),
  // Data (o solo fascia oraria) con slot in stile BookingWidget di Tabbble.
  z.object({ type: z.literal("date"), ...base, askDate: z.boolean().default(true), minDaysAhead: z.number().int().default(0), slots: z.array(z.string()).default(["Mattina (9-13)", "Pomeriggio (14-18)", "Quando volete"]) }),
  // Valutazione 1-5 (stelle) con etichette agli estremi.
  z.object({ type: z.literal("rating"), ...base, max: z.number().int().min(3).max(10).default(5), lowLabel: z.string().default("Per niente"), highLabel: z.string().default("Moltissimo") }),
  // Riepilogo delle risposte + stima indicativa per servizio (prezzi/formule di guidalocation).
  z.object({ type: z.literal("summary"), ...base, showEstimate: z.boolean().default(true), estimateLabel: z.string().default("Stima indicativa"), estimateNote: z.string().default("Ordine di grandezza basato sul servizio scelto: il preventivo vero lo fanno i professionisti."), estimates: z.array(z.object({ serviceSlug: z.string(), min: z.number(), max: z.number(), unit: z.string().default("€/mese") })).default([]) }),
]);
export type StepConfig = z.infer<typeof stepConfigSchema>;
export type StepType = StepConfig["type"];

export const STEP_TYPES: { type: StepType; label: string }[] = [
  { type: "cards", label: "Scelta a schede" },
  { type: "multi", label: "Scelta multipla" },
  { type: "image_select", label: "Scelta con immagini" },
  { type: "video", label: "Video" },
  { type: "slider", label: "Cursore" },
  { type: "number", label: "Numero (+/-)" },
  { type: "select", label: "Menu a tendina" },
  { type: "textarea", label: "Testo libero" },
  { type: "contact", label: "Contatti" },
  { type: "date", label: "Data e fascia oraria" },
  { type: "rating", label: "Valutazione (stelle)" },
  { type: "summary", label: "Riepilogo e stima" },
];

export const formConfigSchema = z.object({
  headerTitle: z.string().default("Chiedi un preventivo"),
  headerBadge: z.string().optional(),
  submitButtonText: z.string().default("Invia la richiesta"),
  privacyText: z.string().default("I tuoi dati servono solo per metterti in contatto con i professionisti selezionati."),
  successTitle: z.string().default("Richiesta inviata"),
  successMessage: z.string().default("Ti ricontattiamo entro un giorno lavorativo con una selezione di professionisti."),
  redirectUrl: z.string().optional(),
  webhookUrl: z.string().url().optional(),
  gtmId: z.string().optional(),
  // "load": il form carica gtm.js; "present": il sito ha già GTM, niente doppio caricamento.
  gtmMode: z.enum(["load", "present"]).default("present"),
  ga4Id: z.string().optional(),
  clientId: z.string().default("migliori-agenzie"),
  eventType: z.string().default("lead"),
  value: z.number().optional(),
  currency: z.string().default("EUR"),
  customParams: z.array(z.string()).default([]),
  animations: z.boolean().default(true),
  showProgress: z.boolean().default(true),
  accentColor: z.string().optional(),
});
export type FormConfig = z.infer<typeof formConfigSchema>;

export type Answers = Record<string, string | string[] | number>;
export type Contact = Record<string, string>;

export type PublicStep = {
  id: string;
  key: string;
  position: number;
  config: StepConfig;
};

export type PublicForm = {
  id: string;
  slug: string;
  name: string;
  testMode: boolean;
  config: FormConfig;
  steps: PublicStep[];
};

export function parseFormConfig(raw: unknown): FormConfig {
  return formConfigSchema.parse(raw ?? {});
}

export function parseStepConfig(raw: unknown): StepConfig | null {
  const r = stepConfigSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Valuta una condizione sulle risposte correnti. */
export function conditionMet(c: Condition | undefined, answers: Answers): boolean {
  if (!c) return true;
  const v = answers[c.fieldKey];
  const list = Array.isArray(v) ? v : v === undefined ? [] : [String(v)];
  // Valori multipli anche come stringa "a, b, c" (comodo nel builder).
  const target = typeof c.value === "string" && c.value.includes(",") && (c.operator === "in" || c.operator === "not_in") ? c.value.split(",").map((x) => x.trim()).filter(Boolean) : c.value;
  switch (c.operator) {
    case "exists":
      return list.length > 0 && list.some((x) => x !== "");
    case "equals":
      return list.includes(String(target));
    case "not_equals":
      return !list.includes(String(target));
    case "in":
      return Array.isArray(target) ? list.some((x) => target.includes(x)) : list.includes(String(target));
    case "not_in":
      return Array.isArray(target) ? !list.some((x) => target.includes(x)) : !list.includes(String(target));
    case "gte":
      return Number(v) >= Number(target);
    case "lte":
      return Number(v) <= Number(target);
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Servono almeno sei cifre vere: "+39 " o "---" non sono numeri.
export const PHONE_RE = /^[\d\s+\-().]{6,25}$/;
export const contaCifre = (s: string) => (s.match(/\d/g) ?? []).length;

/**
 * Prefissi telefonici. In cima l'Italia e i paesi da cui arrivano davvero le
 * richieste; sotto il resto in ordine alfabetico. La bandiera aiuta a trovare
 * la riga giusta senza leggere il numero.
 */
export const PHONE_PREFIXES = [
  { code: "+39", label: "Italia", flag: "🇮🇹" },
  { code: "+41", label: "Svizzera", flag: "🇨🇭" },
  { code: "+378", label: "San Marino", flag: "🇸🇲" },
  { code: "+377", label: "Monaco", flag: "🇲🇨" },
  { code: "+43", label: "Austria", flag: "🇦🇹" },
  { code: "+32", label: "Belgio", flag: "🇧🇪" },
  { code: "+55", label: "Brasile", flag: "🇧🇷" },
  { code: "+359", label: "Bulgaria", flag: "🇧🇬" },
  { code: "+1", label: "Canada", flag: "🇨🇦" },
  { code: "+86", label: "Cina", flag: "🇨🇳" },
  { code: "+357", label: "Cipro", flag: "🇨🇾" },
  { code: "+385", label: "Croazia", flag: "🇭🇷" },
  { code: "+45", label: "Danimarca", flag: "🇩🇰" },
  { code: "+20", label: "Egitto", flag: "🇪🇬" },
  { code: "+971", label: "Emirati Arabi Uniti", flag: "🇦🇪" },
  { code: "+372", label: "Estonia", flag: "🇪🇪" },
  { code: "+358", label: "Finlandia", flag: "🇫🇮" },
  { code: "+33", label: "Francia", flag: "🇫🇷" },
  { code: "+49", label: "Germania", flag: "🇩🇪" },
  { code: "+81", label: "Giappone", flag: "🇯🇵" },
  { code: "+30", label: "Grecia", flag: "🇬🇷" },
  { code: "+91", label: "India", flag: "🇮🇳" },
  { code: "+353", label: "Irlanda", flag: "🇮🇪" },
  { code: "+972", label: "Israele", flag: "🇮🇱" },
  { code: "+371", label: "Lettonia", flag: "🇱🇻" },
  { code: "+370", label: "Lituania", flag: "🇱🇹" },
  { code: "+352", label: "Lussemburgo", flag: "🇱🇺" },
  { code: "+356", label: "Malta", flag: "🇲🇹" },
  { code: "+212", label: "Marocco", flag: "🇲🇦" },
  { code: "+52", label: "Messico", flag: "🇲🇽" },
  { code: "+47", label: "Norvegia", flag: "🇳🇴" },
  { code: "+64", label: "Nuova Zelanda", flag: "🇳🇿" },
  { code: "+31", label: "Paesi Bassi", flag: "🇳🇱" },
  { code: "+48", label: "Polonia", flag: "🇵🇱" },
  { code: "+351", label: "Portogallo", flag: "🇵🇹" },
  { code: "+44", label: "Regno Unito", flag: "🇬🇧" },
  { code: "+420", label: "Repubblica Ceca", flag: "🇨🇿" },
  { code: "+40", label: "Romania", flag: "🇷🇴" },
  { code: "+7", label: "Russia", flag: "🇷🇺" },
  { code: "+381", label: "Serbia", flag: "🇷🇸" },
  { code: "+421", label: "Slovacchia", flag: "🇸🇰" },
  { code: "+386", label: "Slovenia", flag: "🇸🇮" },
  { code: "+34", label: "Spagna", flag: "🇪🇸" },
  { code: "+1", label: "Stati Uniti", flag: "🇺🇸" },
  { code: "+27", label: "Sudafrica", flag: "🇿🇦" },
  { code: "+46", label: "Svezia", flag: "🇸🇪" },
  { code: "+216", label: "Tunisia", flag: "🇹🇳" },
  { code: "+90", label: "Turchia", flag: "🇹🇷" },
  { code: "+380", label: "Ucraina", flag: "🇺🇦" },
  { code: "+36", label: "Ungheria", flag: "🇭🇺" },
];

/** Prefisso usato quando il visitatore non sceglie: quasi tutti scrivono dall'Italia. */
export const PHONE_PREFIX_DEFAULT = "+39";
