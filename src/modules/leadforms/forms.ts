// Accesso ai form: lettura pubblica con opzioni dinamiche risolte e form di
// default "preventivo" (creato dal seed o al primo accesso).

import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import vocabolario from "../../../data/competenze.json";
import {
  parseFormConfig,
  parseStepConfig,
  type Option,
  type PublicForm,
  type StepConfig,
} from "./schema";

export const DEFAULT_FORM_SLUG = "preventivo";

/** Quanti lavori per servizio nel passo "che lavoro": i più cercati, poi "Altro". */
const JOBS_PER_SERVICE = 9;

/**
 * Il primo passo di Instapro ("Che lavori vuoi far realizzare?"): i lavori più
 * cercati per ogni servizio, dal vocabolario in data/competenze.json (già in
 * ordine di ricerca). Il valore è il testo stesso: arriva leggibile nel lead.
 */
async function jobOptions(): Promise<Option[]> {
  // Nel vocabolario ci sono anche nomi di mestieri ("Commercialisti" tra i
  // notai): sono categorie, non lavori, e qui confonderebbero.
  const mestieri = new Set(
    (await db.service.findMany({ select: { name: true, plural: true, singular: true } })).flatMap((s) => [s.name, s.plural, s.singular].filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase())),
  );
  const out: Option[] = [];
  for (const [servizio, tutti] of Object.entries(vocabolario as Record<string, string[]>)) {
    const lavori = tutti.filter((l) => !mestieri.has(l.toLowerCase())).slice(0, JOBS_PER_SERVICE);
    // Con meno di tre voci la domanda non aiuta: il passo si salta.
    if (lavori.length < 3) continue;
    for (const l of lavori) out.push({ value: l, label: l, parent: servizio });
  }
  out.push({ value: "Altro lavoro", label: "Altro lavoro", description: "Lo racconti tu tra poco" });
  return out;
}

async function dynamicOptions(source: "services" | "cities" | "jobs"): Promise<Option[]> {
  if (source === "jobs") return await jobOptions();
  if (source === "services") {
    const rows = await db.service.findMany({ where: { active: true }, orderBy: { position: "asc" } });
    return rows.map((s) => ({ value: s.slug, label: s.plural }));
  }
  // Capoluoghi come opzioni; i comuni minori diventano parole chiave del loro
  // capoluogo, così "Fiumicino" trova "Roma" (guidalocation: zone → città).
  const rows = await db.city.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true, province: true, isCapital: true, capitalSlug: true } });
  const minor = new Map<string, string[]>();
  for (const c of rows) {
    if (c.isCapital || !c.capitalSlug) continue;
    const list = minor.get(c.capitalSlug) ?? [];
    list.push(c.name);
    minor.set(c.capitalSlug, list);
  }
  return rows.filter((c) => c.isCapital).map((c) => ({ value: c.slug, label: c.name, description: c.province, keywords: minor.get(c.slug) }));
}

async function resolveStep(config: StepConfig): Promise<StepConfig> {
  if (config.type === "select" && config.source) {
    return { ...config, options: await dynamicOptions(config.source) };
  }
  return config;
}

export async function getPublicForm(slug: string, opts: { includeDraft?: boolean } = {}): Promise<PublicForm | null> {
  const form = await db.form.findUnique({
    where: { slug },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!form) return null;
  if (form.status !== "active" && !opts.includeDraft) return null;

  const steps = [];
  for (const s of form.steps) {
    if (!s.enabled) continue;
    const parsed = parseStepConfig({ type: s.type, ...(s.config as object) });
    if (!parsed) continue;
    steps.push({ id: s.id, key: s.key, position: s.position, config: await resolveStep(parsed) });
  }
  return {
    id: form.id,
    slug: form.slug,
    name: form.name,
    testMode: form.testMode,
    config: parseFormConfig(form.config),
    steps,
  };
}

/**
 * Form di default (PIANO 3d): una domanda per schermata, il perché sotto
 * ogni richiesta, riepilogo prima dei contatti, contatti per ultimi.
 * Stessa fonte per la creazione (`ensureDefaultForm`) e per l'allineamento
 * di un form già esistente (`syncDefaultForm`, `npm run form:sync`).
 */
export const DEFAULT_FORM_CONFIG = {
  headerTitle: "Chiedi un preventivo",
  headerBadge: "Gratis · 2 minuti",
  submitButtonText: "Ricevi i preventivi",
  privacyText: "I tuoi dati servono solo per metterti in contatto con i professionisti a cui giriamo la richiesta. Nessuna newsletter, nessuna cessione a terzi.",
  successTitle: "Richiesta ricevuta",
  successMessage: "Giriamo la richiesta a fino a 3 professionisti della zona scelti per recensioni: ti contattano direttamente loro con il preventivo.",
  eventType: "lead_preventivo",
  value: 25,
};

export const DEFAULT_FORM_STEPS: { key: string; type: string; config: Record<string, unknown> }[] = [
  { key: "servizio", type: "select", config: { title: "Di cosa hai bisogno?", subtitle: "Scegli la categoria: potrai descrivere il lavoro tra poco.", required: true, skipIfPrefilled: true, options: [], source: "services", searchable: true, placeholder: "Es. idraulico, fotografo, commercialista" } },
  { key: "lavoro", type: "select", config: { title: "Che lavoro devi far fare?", subtitle: "Scegli il più vicino al tuo: i dettagli li scrivi tra poco.", required: true, skipIfPrefilled: true, options: [], source: "jobs", searchable: false } },
  { key: "citta", type: "select", config: { title: "Dove ti serve?", subtitle: "Dove va fatto il lavoro. Puoi scrivere anche un comune piccolo: lo agganciamo al capoluogo.", required: true, skipIfPrefilled: true, options: [], source: "cities", searchable: true, placeholder: "Cerca una città o un comune" } },
  { key: "budget", type: "cards", config: { title: "Quanto pensi di spendere?", subtitle: "Serve solo a girare la richiesta alle persone giuste. Non è vincolante.", required: true, skipIfPrefilled: true, multiple: false, columns: 2, options: [
    { value: "lt200", label: "Meno di 200 €" },
    { value: "200-1000", label: "200 – 1.000 €" },
    { value: "1000-5000", label: "1.000 – 5.000 €" },
    { value: "gt5000", label: "Oltre 5.000 €" },
    { value: "unknown", label: "Non lo so", description: "Te lo dicono i professionisti col preventivo" },
  ] } },
  { key: "tempi", type: "cards", config: { title: "Quando ti serve?", subtitle: "Chi è libero in quel periodo risponde prima.", required: true, skipIfPrefilled: true, multiple: false, columns: 2, options: [
    { value: "urgent", label: "È urgente", description: "Oggi o domani" },
    { value: "now", label: "Entro una settimana" },
    { value: "1m", label: "Entro un mese" },
    { value: "explore", label: "Sono flessibile" },
  ] } },
  { key: "descrizione", type: "textarea", config: { title: "Descrivi il lavoro", subtitle: "Due righe bastano: cosa va fatto, misure o quantità, se serve un sopralluogo. Più dettagli dai, più precisi arrivano i preventivi.", required: false, skipIfPrefilled: false, placeholder: "Es. perdita sotto il lavello della cucina, da riparare entro la settimana...", minLength: 0, maxLength: 2000 } },
  { key: "riepilogo", type: "summary", config: { title: "Ecco cosa chiederemo ai professionisti", subtitle: "Controlla, poi lascia i contatti: manca un passo.", required: false, skipIfPrefilled: false, showEstimate: true, estimateLabel: "Stima indicativa", estimateNote: "Ordine di grandezza dal servizio scelto: il preventivo vero lo fanno i professionisti.", estimates: [] } },
  { key: "contatti", type: "contact", config: { title: "Dove ti mandiamo i preventivi?", subtitle: "Ti scrivono solo i professionisti selezionati per la tua richiesta. Mai altri.", required: true, skipIfPrefilled: false, consentText: "Acconsento a essere ricontattato dai professionisti selezionati per la mia richiesta. Nessuna newsletter.", submitLabel: "Ricevi i preventivi", fields: [
    { key: "nome", label: "Nome e cognome", type: "text", required: true, placeholder: "Mario Rossi" },
    { key: "email", label: "Email", type: "email", required: true, placeholder: "nome@email.it", hint: "Qui arrivano i preventivi." },
    { key: "telefono", label: "Telefono", type: "tel", required: true, placeholder: "333 1234567", hint: "Per un sopralluogo o una domanda veloce. Nessun call center." },
  ] } },
];

export async function ensureDefaultForm(): Promise<{ id: string; created: boolean }> {
  const existing = await db.form.findUnique({ where: { slug: DEFAULT_FORM_SLUG } });
  if (existing) return { id: existing.id, created: false };
  const config = parseFormConfig(DEFAULT_FORM_CONFIG);
  const form = await db.form.create({
    data: {
      slug: DEFAULT_FORM_SLUG,
      name: "Richiesta preventivo",
      status: "active",
      config: config as unknown as Prisma.InputJsonValue,
      steps: { create: DEFAULT_FORM_STEPS.map((s, i) => ({ key: s.key, type: s.type, position: i, enabled: true, config: s.config as unknown as Prisma.InputJsonValue })) },
    },
  });
  return { id: form.id, created: true };
}

/**
 * Allinea il form di default già in DB ai testi del codice: aggiorna titoli,
 * sottotitoli, microcopy e testi di config; crea i passi mancanti nella
 * posizione giusta; non tocca opzioni e passi aggiunti a mano.
 */
export async function syncDefaultForm(): Promise<{ updated: string[]; created: string[] }> {
  const form = await db.form.findUnique({ where: { slug: DEFAULT_FORM_SLUG }, include: { steps: true } });
  if (!form) {
    await ensureDefaultForm();
    return { updated: [], created: DEFAULT_FORM_STEPS.map((s) => s.key) };
  }
  const updated: string[] = [];
  const created: string[] = [];
  const cfg = { ...(form.config as Record<string, unknown>), ...DEFAULT_FORM_CONFIG };
  await db.form.update({ where: { id: form.id }, data: { config: cfg as unknown as Prisma.InputJsonValue } });
  for (let i = 0; i < DEFAULT_FORM_STEPS.length; i++) {
    const d = DEFAULT_FORM_STEPS[i];
    const cur = form.steps.find((s) => s.key === d.key);
    if (!cur) {
      // Nuovo passo: prende il posto del passo di default che lo segue.
      const after = DEFAULT_FORM_STEPS.slice(i + 1).map((s) => form.steps.find((x) => x.key === s.key)?.position).find((p) => p !== undefined);
      const position = after ?? form.steps.length;
      await db.formStep.updateMany({ where: { formId: form.id, position: { gte: position } }, data: { position: { increment: 1 } } });
      await db.formStep.create({ data: { formId: form.id, key: d.key, type: d.type, position, enabled: true, config: d.config as unknown as Prisma.InputJsonValue } });
      created.push(d.key);
      continue;
    }
    const old = cur.config as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...old };
    for (const k of ["title", "subtitle", "placeholder", "consentText", "submitLabel", "estimateLabel", "estimateNote"]) if (k in d.config) merged[k] = d.config[k];
    if (Array.isArray(d.config.fields) && Array.isArray(old.fields)) {
      const defs = d.config.fields as { key: string; hint?: string; placeholder?: string; label?: string }[];
      merged.fields = (old.fields as { key: string }[]).map((f) => {
        const df = defs.find((x) => x.key === f.key);
        return df ? { ...f, label: df.label ?? (f as { label?: string }).label, placeholder: df.placeholder, hint: df.hint } : f;
      });
    }
    if (Array.isArray(d.config.options) && Array.isArray(old.options) && (old.options as unknown[]).length) {
      const defs = d.config.options as { value: string; label: string; description?: string }[];
      merged.options = (old.options as { value: string }[]).map((o) => { const dd = defs.find((x) => x.value === o.value); return dd ? { ...o, label: dd.label, description: dd.description } : o; });
    }
    if (JSON.stringify(merged) !== JSON.stringify(old)) {
      await db.formStep.update({ where: { id: cur.id }, data: { config: merged as unknown as Prisma.InputJsonValue } });
      updated.push(d.key);
    }
  }
  return { updated, created };
}

/**
 * Variante A/B: se il form richiesto ha un abGroup, sceglie tra i form attivi
 * del gruppo in base al bucket (0-99) del cookie, pesando gli abWeight.
 * Restituisce lo slug da renderizzare.
 */
export async function pickVariantSlug(requestedSlug: string, bucket: number | null): Promise<string> {
  const base = await db.form.findUnique({ where: { slug: requestedSlug }, select: { abGroup: true } });
  if (!base?.abGroup) return requestedSlug;
  const variants = await db.form.findMany({ where: { abGroup: base.abGroup, status: "active" }, select: { slug: true, abWeight: true }, orderBy: { createdAt: "asc" } });
  if (variants.length < 2) return requestedSlug;
  const total = variants.reduce((s, v) => s + v.abWeight, 0);
  const point = ((bucket ?? 0) / 100) * total;
  let acc = 0;
  for (const v of variants) {
    acc += v.abWeight;
    if (point < acc) return v.slug;
  }
  return variants[variants.length - 1].slug;
}
