"use client";

// Builder: lista step con drag&drop, editor per tipo, anteprima dal vivo con
// lo STESSO engine del frontend. Salva tutto in una volta via server action.

import { useMemo, useState, useTransition } from "react";
import { deleteForm, saveForm } from "@/app/admin/actions";
import { Button, cn } from "@/design/ui";
import { FormEngine } from "@/modules/leadforms/engine/FormEngine";
import { STEP_TYPES, formConfigSchema, stepConfigSchema, type FormConfig, type PublicForm, type StepType } from "@/modules/leadforms/schema";

type LooseConfig = Record<string, unknown> & { type: StepType };
export type BuilderInitial = {
  id?: string;
  name: string;
  slug: string;
  abGroup?: string | null;
  abWeight?: number;
  status: "draft" | "active" | "archived";
  testMode: boolean;
  config: FormConfig;
  steps: { id?: string; key: string; enabled: boolean; config: LooseConfig }[];
  conversions: { id?: string; name: string; gadsId: string; gadsLabel: string; value: number | null; currency: string; enabled: boolean; customerId?: string | null; conversionActionId?: string | null; apiUpload?: boolean }[];
};
type StepDraft = BuilderInitial["steps"][number] & { localId: string };

const uid = () => Math.random().toString(36).slice(2, 10);
const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown, d = 0) => (typeof v === "number" ? v : d);
const b = (v: unknown, d = false) => (typeof v === "boolean" ? v : d);

function defaultStep(type: StepType): LooseConfig {
  const base = { type, title: "Nuovo passo", required: true, skipIfPrefilled: true };
  switch (type) {
    case "cards":
    case "multi":
      return { ...base, options: [{ value: "a", label: "Opzione A" }, { value: "b", label: "Opzione B" }], columns: 2, multiple: type === "multi" };
    case "image_select":
      return { ...base, options: [{ value: "a", label: "Opzione A", imageUrl: "" }], multiple: false };
    case "video":
      return { ...base, videoUrl: "https://www.youtube.com/watch?v=", autoplay: true, options: [] };
    case "slider":
      return { ...base, min: 0, max: 100, step: 5, suffix: " %" };
    case "number":
      return { ...base, min: 1, max: 20, step: 1, defaultValue: 1 };
    case "select":
      return { ...base, options: [], source: "services", searchable: true, placeholder: "Cerca..." };
    case "textarea":
      return { ...base, required: false, placeholder: "", maxLength: 2000 };
    case "date":
      return { ...base, askDate: true, minDaysAhead: 0, slots: ["Mattina (9-13)", "Pomeriggio (14-18)", "Quando volete"] };
    case "rating":
      return { ...base, max: 5, lowLabel: "Per niente", highLabel: "Moltissimo" };
    case "summary":
      return { ...base, required: false, skipIfPrefilled: false, showEstimate: true, estimateLabel: "Stima indicativa", estimateNote: "Ordine di grandezza basato sul servizio scelto: il preventivo vero lo fanno i professionisti.", estimates: [] };
    case "contact":
      return { ...base, skipIfPrefilled: false, fields: [{ key: "nome", label: "Nome", type: "text", required: true }, { key: "email", label: "Email", type: "email", required: true }, { key: "telefono", label: "Telefono", type: "tel", required: true }], consentText: "Acconsento a essere ricontattato." };
  }
}

const IN = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-action";
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="t-meta mb-1 block text-ink">{label}</span>
      {children}
      {hint && <span className="t-meta mt-1 block text-ink-3">{hint}</span>}
    </label>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-action)]" />
      {label}
    </label>
  );
}

export function FormBuilder({ initial }: { initial: BuilderInitial }) {
  const [meta, setMeta] = useState({ id: initial.id, name: initial.name, slug: initial.slug, status: initial.status, testMode: initial.testMode, abGroup: initial.abGroup ?? "", abWeight: initial.abWeight ?? 50 });
  const [config, setConfig] = useState<FormConfig>(initial.config);
  const [steps, setSteps] = useState<StepDraft[]>(initial.steps.map((st, i) => ({ ...st, localId: st.id ?? `init-${i}` })));
  const [conversions, setConversions] = useState(initial.conversions);
  const [selected, setSelected] = useState<string | "form" | "conversions">(initial.steps.length ? "form" : "form");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState<number | null>(null);

  const stepErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const st of steps) {
      const r = stepConfigSchema.safeParse(st.config);
      if (!r.success) out[st.localId] = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      if (!/^[a-z0-9_]+$/.test(st.key)) out[st.localId] = "chiave non valida (solo a-z, 0-9, _)";
    }
    return out;
  }, [steps]);

  const previewForm = useMemo<PublicForm>(() => {
    const cfg = formConfigSchema.safeParse(config);
    return {
      id: "preview",
      slug: meta.slug,
      name: meta.name,
      testMode: meta.testMode,
      config: cfg.success ? cfg.data : formConfigSchema.parse({}),
      steps: steps
        .filter((st) => st.enabled && !stepErrors[st.localId])
        .map((st, i) => {
          const c = stepConfigSchema.parse(st.config);
          if (c.type === "select" && c.source && c.options.length === 0) {
            c.options = [{ value: "a", label: `Opzione dinamica 1 (${c.source})` }, { value: "b", label: "Opzione dinamica 2" }, { value: "c", label: "Opzione dinamica 3" }];
          }
          return { id: st.localId, key: st.key, position: i, config: c };
        }),
    };
  }, [config, meta, steps, stepErrors]);

  const update = (localId: string, patch: Partial<StepDraft> | { config: LooseConfig }) =>
    setSteps((all) => all.map((st) => (st.localId === localId ? { ...st, ...patch } : st)));
  const patchCfg = (localId: string, patch: Record<string, unknown>) =>
    setSteps((all) => all.map((st) => (st.localId === localId ? { ...st, config: { ...st.config, ...patch } } : st)));

  function addStep(type: StepType) {
    const st: StepDraft = { localId: uid(), key: `${type}_${steps.length + 1}`, enabled: true, config: defaultStep(type) };
    setSteps((all) => [...all, st]);
    setSelected(st.localId);
  }
  function move(from: number, to: number) {
    if (from === to) return;
    setSteps((all) => {
      const copy = [...all];
      const [it] = copy.splice(from, 1);
      copy.splice(to, 0, it);
      return copy;
    });
  }

  function save() {
    if (Object.keys(stepErrors).length) return setMessage({ ok: false, text: "Correggi gli step segnati in rosso prima di salvare." });
    const payload = { ...meta, abGroup: meta.abGroup || null, config, steps: steps.map(({ id, key, enabled, config }) => ({ id, key, enabled, config })), conversions };
    start(async () => {
      const r = await saveForm(JSON.stringify(payload));
      if (r.ok) {
        setMeta((m) => ({ ...m, id: r.id }));
        setMessage({ ok: true, text: "Salvato." });
        if (!meta.id) window.history.replaceState(null, "", `/admin/form/${r.id}/`);
      } else setMessage({ ok: false, text: r.error });
    });
  }

  const current = steps.find((st) => st.localId === selected);

  return (
    <div className="max-w-[1400px]">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Nome">
          <input className={IN} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
        </Field>
        <Field label="Slug">
          <input className={IN} value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} />
        </Field>
        <Field label="Stato">
          <select className={IN} value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value as BuilderInitial["status"] })}>
            <option value="draft">bozza</option>
            <option value="active">attivo</option>
            <option value="archived">archiviato</option>
          </select>
        </Field>
        <Toggle label="Modalità test" value={meta.testMode} onChange={(v) => setMeta({ ...meta, testMode: v })} />
        <Field label="Gruppo A/B" hint="stesso nome = varianti alternate"><input className={IN} value={meta.abGroup} onChange={(e) => setMeta({ ...meta, abGroup: e.target.value })} placeholder="es. preventivo" /></Field>
        <Field label="Peso %"><input type="number" min={1} max={100} className={IN} value={meta.abWeight} onChange={(e) => setMeta({ ...meta, abWeight: Number(e.target.value) || 50 })} /></Field>
        <div className="ml-auto flex items-center gap-3">
          {message && <span className={cn("text-sm font-semibold", message.ok ? "text-ok" : "text-brand")}>{message.text}</span>}
          {meta.id && (
            <button type="button" className="text-sm font-semibold text-ink-2 hover:text-brand" onClick={() => { if (confirm("Eliminare il form e tutti i suoi step?")) start(() => deleteForm(meta.id!)); }}>
              Elimina
            </button>
          )}
          <Button onClick={save} disabled={pending} className="min-h-10 px-5 py-2 text-sm">{pending ? "Salvo..." : "Salva"}</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr_420px]">
        {/* Lista step */}
        <aside className="rounded-card border border-line bg-canvas p-3">
          <button type="button" onClick={() => setSelected("form")} className={cn("mb-1 block w-full rounded-slot px-3 py-2 text-left text-sm font-semibold", selected === "form" ? "bg-tonal text-action" : "hover:bg-surface")}>Impostazioni form</button>
          <button type="button" onClick={() => setSelected("conversions")} className={cn("mb-3 block w-full rounded-slot px-3 py-2 text-left text-sm font-semibold", selected === "conversions" ? "bg-tonal text-action" : "hover:bg-surface")}>Conversioni Google Ads ({conversions.length})</button>
          <p className="t-kicker mb-2 px-3">Passi (trascina per ordinare)</p>
          <ol>
            {steps.map((st, i) => (
              <li
                key={st.localId}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
                onClick={() => setSelected(st.localId)}
                className={cn("mb-1 flex cursor-grab items-center gap-2 rounded-slot px-3 py-2 text-sm", selected === st.localId ? "bg-tonal text-action" : "hover:bg-surface", !st.enabled && "opacity-50")}
              >
                <span className="text-ink-3">⋮⋮</span>
                <span className="flex-1 truncate font-semibold">{i + 1}. {s(st.config.title) || st.key}</span>
                <span className={cn("text-xs", stepErrors[st.localId] ? "text-brand" : "text-ink-3")}>{stepErrors[st.localId] ? "!" : st.config.type}</span>
              </li>
            ))}
          </ol>
          <select className={cn(IN, "mt-3")} value="" onChange={(e) => e.target.value && addStep(e.target.value as StepType)}>
            <option value="">+ Aggiungi passo...</option>
            {STEP_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </aside>

        {/* Editor */}
        <section className="rounded-card border border-line bg-canvas p-5">
          {selected === "form" && <FormSettings config={config} onChange={setConfig} />}
          {selected === "conversions" && <ConversionsEditor rows={conversions} onChange={setConversions} />}
          {current && (
            <StepEditor
              step={current}
              others={steps.filter((x) => x.localId !== current.localId)}
              error={stepErrors[current.localId]}
              onMeta={(p) => update(current.localId, p)}
              onCfg={(p) => patchCfg(current.localId, p)}
              onDelete={() => { setSteps((all) => all.filter((x) => x.localId !== current.localId)); setSelected("form"); }}
            />
          )}
        </section>

        {/* Anteprima */}
        <aside>
          <p className="t-kicker mb-2">Anteprima (stesso engine del sito)</p>
          <div className="rounded-panel bg-surface p-3">
            <FormEngine key={JSON.stringify(previewForm)} form={previewForm} preview />
          </div>
        </aside>
      </div>
    </div>
  );
}

function FormSettings({ config, onChange }: { config: FormConfig; onChange: (c: FormConfig) => void }) {
  const set = (patch: Partial<FormConfig>) => onChange({ ...config, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Titolo"><input className={IN} value={config.headerTitle} onChange={(e) => set({ headerTitle: e.target.value })} /></Field>
      <Field label="Badge"><input className={IN} value={config.headerBadge ?? ""} onChange={(e) => set({ headerBadge: e.target.value || undefined })} /></Field>
      <Field label="Testo bottone invio"><input className={IN} value={config.submitButtonText} onChange={(e) => set({ submitButtonText: e.target.value })} /></Field>
      <Field label="Testo privacy"><input className={IN} value={config.privacyText} onChange={(e) => set({ privacyText: e.target.value })} /></Field>
      <Field label="Titolo successo"><input className={IN} value={config.successTitle} onChange={(e) => set({ successTitle: e.target.value })} /></Field>
      <Field label="Messaggio successo"><input className={IN} value={config.successMessage} onChange={(e) => set({ successMessage: e.target.value })} /></Field>
      <Field label="Redirect dopo l'invio" hint="Vuoto = /grazie/. Il lead_id viene sempre accodato."><input className={IN} value={config.redirectUrl ?? ""} onChange={(e) => set({ redirectUrl: e.target.value || undefined })} /></Field>
      <Field label="Webhook URL" hint="POST JSON con risposte, contatti, attribuzione, lead_id"><input className={IN} value={config.webhookUrl ?? ""} onChange={(e) => set({ webhookUrl: e.target.value || undefined })} /></Field>
      <Field label="GTM container"><input className={IN} placeholder="GTM-XXXXXXX" value={config.gtmId ?? ""} onChange={(e) => set({ gtmId: e.target.value || undefined })} /></Field>
      <Field label="GTM: come caricarlo">
        <select className={IN} value={config.gtmMode} onChange={(e) => set({ gtmMode: e.target.value as FormConfig["gtmMode"] })}>
          <option value="present">già presente nel sito (non ricaricare)</option>
          <option value="load">caricalo dal form</option>
        </select>
      </Field>
      <Field label="GA4 measurement ID"><input className={IN} placeholder="G-XXXXXXX" value={config.ga4Id ?? ""} onChange={(e) => set({ ga4Id: e.target.value || undefined })} /></Field>
      <Field label="Client ID (sito di origine)"><input className={IN} value={config.clientId} onChange={(e) => set({ clientId: e.target.value })} /></Field>
      <Field label="Tipo evento"><input className={IN} value={config.eventType} onChange={(e) => set({ eventType: e.target.value })} /></Field>
      <Field label="Valore lead"><input type="number" className={IN} value={config.value ?? ""} onChange={(e) => set({ value: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
      <Field label="Valuta"><input className={IN} value={config.currency} onChange={(e) => set({ currency: e.target.value })} /></Field>
      <Field label="Parametri URL extra" hint="separati da virgola, vengono salvati con la visita"><input className={IN} value={config.customParams.join(", ")} onChange={(e) => set({ customParams: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
      <div className="flex flex-wrap gap-5 sm:col-span-2">
        <Toggle label="Animazioni" value={config.animations} onChange={(v) => set({ animations: v })} />
        <Toggle label="Barra di avanzamento" value={config.showProgress} onChange={(v) => set({ showProgress: v })} />
      </div>
    </div>
  );
}

type Conv = BuilderInitial["conversions"][number];
function ConversionsEditor({ rows, onChange }: { rows: Conv[]; onChange: (r: Conv[]) => void }) {
  const set = (i: number, p: Partial<Conv>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div>
      <p className="t-body mb-4 text-ink-2">Ogni riga spara un evento <code>conversion</code> su /grazie/ con <code>send_to = ID/Label</code>. L'upload offline via API usa le stesse righe.</p>
      {rows.map((r, i) => (
        <div key={i} className="mb-3 grid gap-2 rounded-slot border border-line p-3 sm:grid-cols-5">
          <input className={IN} placeholder="Nome" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <input className={IN} placeholder="AW-123456789" value={r.gadsId} onChange={(e) => set(i, { gadsId: e.target.value })} />
          <input className={IN} placeholder="Label" value={r.gadsLabel} onChange={(e) => set(i, { gadsLabel: e.target.value })} />
          <input className={IN} type="number" placeholder="Valore" value={r.value ?? ""} onChange={(e) => set(i, { value: e.target.value === "" ? null : Number(e.target.value) })} />
          <div className="flex items-center justify-between gap-2">
            <Toggle label="attiva" value={r.enabled} onChange={(v) => set(i, { enabled: v })} />
            <button type="button" className="text-sm text-ink-2 hover:text-brand" onClick={() => onChange(rows.filter((_, k) => k !== i))}>×</button>
          </div>
          <div className="grid gap-2 sm:col-span-5 sm:grid-cols-[1fr_1fr_auto]">
            <input className={IN} placeholder="Customer ID (upload API, senza trattini)" value={r.customerId ?? ""} onChange={(e) => set(i, { customerId: e.target.value || null })} />
            <input className={IN} placeholder="ID numerico azione di conversione" value={r.conversionActionId ?? ""} onChange={(e) => set(i, { conversionActionId: e.target.value || null })} />
            <Toggle label="upload offline via API" value={Boolean(r.apiUpload)} onChange={(v) => set(i, { apiUpload: v })} />
          </div>
        </div>
      ))}
      <Button variant="outline" className="min-h-10 px-5 py-2 text-sm" onClick={() => onChange([...rows, { name: "Lead", gadsId: "", gadsLabel: "", value: null, currency: "EUR", enabled: true, customerId: null, conversionActionId: null, apiUpload: false }])}>+ Conversione</Button>
    </div>
  );
}

type OptRow = { value: string; label: string; icon?: string; imageUrl?: string; description?: string };
function OptionsEditor({ rows, images, onChange }: { rows: OptRow[]; images?: boolean; onChange: (r: OptRow[]) => void }) {
  const set = (i: number, p: Partial<OptRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div>
      <span className="t-meta mb-1 block text-ink">Opzioni</span>
      {rows.map((r, i) => (
        <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <input className={IN} placeholder="Etichetta" value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
          <input className={IN} placeholder="valore" value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
          {images ? (
            <input className={IN} placeholder="URL immagine" value={r.imageUrl ?? ""} onChange={(e) => set(i, { imageUrl: e.target.value })} />
          ) : (
            <input className={IN} placeholder="icona (emoji)" value={r.icon ?? ""} onChange={(e) => set(i, { icon: e.target.value || undefined })} />
          )}
          <button type="button" className="px-2 text-ink-2 hover:text-brand" onClick={() => onChange(rows.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      <button type="button" className="text-sm font-bold text-action" onClick={() => onChange([...rows, { value: `opt_${rows.length + 1}`, label: `Opzione ${rows.length + 1}` }])}>+ opzione</button>
    </div>
  );
}

function StepEditor({ step, others, error, onMeta, onCfg, onDelete }: { step: StepDraft; others: StepDraft[]; error?: string; onMeta: (p: Partial<StepDraft>) => void; onCfg: (p: Record<string, unknown>) => void; onDelete: () => void }) {
  const c = step.config;
  const cond = (c.condition ?? null) as { fieldKey?: string; operator?: string; value?: string } | null;
  const opts = (Array.isArray(c.options) ? c.options : []) as OptRow[];
  const fields = (Array.isArray(c.fields) ? c.fields : []) as { key: string; label: string; type: string; required: boolean; placeholder?: string; hint?: string }[];
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="t-kicker">{STEP_TYPES.find((t) => t.type === c.type)?.label}</p>
          {error && <p className="mt-1 text-sm font-semibold text-brand">{error}</p>}
        </div>
        <div className="flex items-center gap-4">
          <Toggle label="attivo" value={step.enabled} onChange={(v) => onMeta({ enabled: v })} />
          <button type="button" className="text-sm text-ink-2 hover:text-brand" onClick={onDelete}>Elimina passo</button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Chiave risposta" hint="es. servizio, budget: finisce nel payload e nel webhook"><input className={IN} value={step.key} onChange={(e) => onMeta({ key: e.target.value })} /></Field>
        <Field label="Titolo"><input className={IN} value={s(c.title)} onChange={(e) => onCfg({ title: e.target.value })} /></Field>
        <Field label="Sottotitolo"><input className={IN} value={s(c.subtitle)} onChange={(e) => onCfg({ subtitle: e.target.value || undefined })} /></Field>
        <div className="flex flex-wrap items-end gap-5 pb-2">
          <Toggle label="obbligatorio" value={b(c.required, true)} onChange={(v) => onCfg({ required: v })} />
          <Toggle label="salta se precompilato da URL" value={b(c.skipIfPrefilled, true)} onChange={(v) => onCfg({ skipIfPrefilled: v })} />
        </div>
      </div>

      {(c.type === "cards" || c.type === "multi") && (
        <>
          <OptionsEditor rows={opts} onChange={(r) => onCfg({ options: r })} />
          <div className="flex gap-5">
            {c.type === "cards" && <Toggle label="scelta multipla" value={b(c.multiple)} onChange={(v) => onCfg({ multiple: v })} />}
            <Field label="Colonne"><input type="number" min={1} max={4} className={IN} value={n(c.columns, 2)} onChange={(e) => onCfg({ columns: Number(e.target.value) })} /></Field>
          </div>
        </>
      )}
      {c.type === "image_select" && (
        <>
          <OptionsEditor rows={opts} images onChange={(r) => onCfg({ options: r })} />
          <Toggle label="scelta multipla" value={b(c.multiple)} onChange={(v) => onCfg({ multiple: v })} />
        </>
      )}
      {c.type === "video" && (
        <>
          <Field label="URL video (YouTube o mp4)"><input className={IN} value={s(c.videoUrl)} onChange={(e) => onCfg({ videoUrl: e.target.value })} /></Field>
          <div className="flex gap-5">
            <Field label="Altezza massima (px)"><input type="number" className={IN} value={n(c.maxHeight, 0) || ""} onChange={(e) => onCfg({ maxHeight: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            <Toggle label="autoplay (muto)" value={b(c.autoplay, true)} onChange={(v) => onCfg({ autoplay: v })} />
          </div>
          <OptionsEditor rows={opts} onChange={(r) => onCfg({ options: r })} />
        </>
      )}
      {(c.type === "slider" || c.type === "number") && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Min"><input type="number" className={IN} value={n(c.min)} onChange={(e) => onCfg({ min: Number(e.target.value) })} /></Field>
          <Field label="Max"><input type="number" className={IN} value={n(c.max, 100)} onChange={(e) => onCfg({ max: Number(e.target.value) })} /></Field>
          <Field label="Passo"><input type="number" className={IN} value={n(c.step, 1)} onChange={(e) => onCfg({ step: Number(e.target.value) })} /></Field>
          <Field label="Prefisso"><input className={IN} value={s(c.prefix)} onChange={(e) => onCfg({ prefix: e.target.value || undefined })} /></Field>
          <Field label="Suffisso"><input className={IN} value={s(c.suffix)} onChange={(e) => onCfg({ suffix: e.target.value || undefined })} /></Field>
          <Field label="Valore iniziale"><input type="number" className={IN} value={n(c.defaultValue, n(c.min))} onChange={(e) => onCfg({ defaultValue: Number(e.target.value) })} /></Field>
        </div>
      )}
      {c.type === "select" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sorgente dinamica">
              <select className={IN} value={s(c.source)} onChange={(e) => onCfg({ source: e.target.value || undefined })}>
                <option value="">opzioni manuali</option>
                <option value="services">servizi della directory</option>
                <option value="cities">capoluoghi</option>
                <option value="jobs">lavori del servizio scelto</option>
              </select>
            </Field>
            <Field label="Placeholder"><input className={IN} value={s(c.placeholder)} onChange={(e) => onCfg({ placeholder: e.target.value || undefined })} /></Field>
          </div>
          <Toggle label="con ricerca" value={b(c.searchable)} onChange={(v) => onCfg({ searchable: v })} />
          {!c.source && <OptionsEditor rows={opts} onChange={(r) => onCfg({ options: r })} />}
        </>
      )}
      {c.type === "textarea" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Placeholder"><input className={IN} value={s(c.placeholder)} onChange={(e) => onCfg({ placeholder: e.target.value || undefined })} /></Field>
          <Field label="Lunghezza massima"><input type="number" className={IN} value={n(c.maxLength, 2000)} onChange={(e) => onCfg({ maxLength: Number(e.target.value) })} /></Field>
        </div>
      )}
      {c.type === "contact" && (
        <>
          <span className="t-meta block text-ink">Campi</span>
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto_auto] items-center gap-2">
              <input className={IN} placeholder="chiave" value={f.key} onChange={(e) => onCfg({ fields: fields.map((x, k) => (k === i ? { ...x, key: e.target.value } : x)) })} />
              <input className={IN} placeholder="etichetta" value={f.label} onChange={(e) => onCfg({ fields: fields.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
              <select className={IN} value={f.type} onChange={(e) => onCfg({ fields: fields.map((x, k) => (k === i ? { ...x, type: e.target.value } : x)) })}>
                {["text", "email", "tel", "company", "textarea"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <input className={IN} placeholder="placeholder" value={f.placeholder ?? ""} onChange={(e) => onCfg({ fields: fields.map((x, k) => (k === i ? { ...x, placeholder: e.target.value } : x)) })} />
              <input className={IN} placeholder="microcopy sotto il campo (il perché)" value={f.hint ?? ""} onChange={(e) => onCfg({ fields: fields.map((x, k) => (k === i ? { ...x, hint: e.target.value || undefined } : x)) })} />
              <Toggle label="obbl." value={f.required} onChange={(v) => onCfg({ fields: fields.map((x, k) => (k === i ? { ...x, required: v } : x)) })} />
              <button type="button" className="px-1 text-ink-2 hover:text-brand" onClick={() => onCfg({ fields: fields.filter((_, k) => k !== i) })}>×</button>
            </div>
          ))}
          <button type="button" className="text-sm font-bold text-action" onClick={() => onCfg({ fields: [...fields, { key: `campo_${fields.length + 1}`, label: "Campo", type: "text", required: false }] })}>+ campo</button>
          <Field label="Testo consenso"><input className={IN} value={s(c.consentText)} onChange={(e) => onCfg({ consentText: e.target.value })} /></Field>
          <Field label="Etichetta bottone (opzionale)"><input className={IN} value={s(c.submitLabel)} onChange={(e) => onCfg({ submitLabel: e.target.value || undefined })} /></Field>
        </>
      )}

      {c.type === "date" && (
        <div className="grid grid-cols-2 gap-3">
          <Toggle label="chiedi anche la data" value={b(c.askDate, true)} onChange={(v) => onCfg({ askDate: v })} />
          <Field label="Giorni minimi di anticipo"><input type="number" className={IN} value={n(c.minDaysAhead)} onChange={(e) => onCfg({ minDaysAhead: Number(e.target.value) })} /></Field>
          <Field label="Fasce (una per riga)"><textarea className={IN} rows={3} value={(Array.isArray(c.slots) ? (c.slots as string[]) : []).join("\n")} onChange={(e) => onCfg({ slots: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></Field>
        </div>
      )}
      {c.type === "rating" && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Massimo"><input type="number" min={3} max={10} className={IN} value={n(c.max, 5)} onChange={(e) => onCfg({ max: Number(e.target.value) })} /></Field>
          <Field label="Etichetta bassa"><input className={IN} value={s(c.lowLabel)} onChange={(e) => onCfg({ lowLabel: e.target.value })} /></Field>
          <Field label="Etichetta alta"><input className={IN} value={s(c.highLabel)} onChange={(e) => onCfg({ highLabel: e.target.value })} /></Field>
        </div>
      )}
      {c.type === "summary" && (
        <div className="space-y-3">
          <Toggle label="mostra stima per servizio" value={b(c.showEstimate, true)} onChange={(v) => onCfg({ showEstimate: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Etichetta stima"><input className={IN} value={s(c.estimateLabel)} onChange={(e) => onCfg({ estimateLabel: e.target.value })} /></Field>
            <Field label="Nota sotto la stima"><input className={IN} value={s(c.estimateNote)} onChange={(e) => onCfg({ estimateNote: e.target.value })} /></Field>
          </div>
          <span className="t-meta block text-ink">Stime per servizio (slug servizio, min, max, unità)</span>
          {((Array.isArray(c.estimates) ? c.estimates : []) as { serviceSlug: string; min: number; max: number; unit?: string }[]).map((es, i, all) => (
            <div key={i} className="grid grid-cols-[1fr_90px_90px_100px_auto] gap-2">
              <input className={IN} placeholder="agenzie-seo" value={es.serviceSlug} onChange={(e) => onCfg({ estimates: all.map((x, k) => (k === i ? { ...x, serviceSlug: e.target.value } : x)) })} />
              <input type="number" className={IN} value={es.min} onChange={(e) => onCfg({ estimates: all.map((x, k) => (k === i ? { ...x, min: Number(e.target.value) } : x)) })} />
              <input type="number" className={IN} value={es.max} onChange={(e) => onCfg({ estimates: all.map((x, k) => (k === i ? { ...x, max: Number(e.target.value) } : x)) })} />
              <input className={IN} value={es.unit ?? "€/mese"} onChange={(e) => onCfg({ estimates: all.map((x, k) => (k === i ? { ...x, unit: e.target.value } : x)) })} />
              <button type="button" className="px-2 text-ink-2 hover:text-brand" onClick={() => onCfg({ estimates: all.filter((_, k) => k !== i) })}>×</button>
            </div>
          ))}
          <button type="button" className="text-sm font-bold text-action" onClick={() => onCfg({ estimates: [...((Array.isArray(c.estimates) ? c.estimates : []) as unknown[]), { serviceSlug: "", min: 500, max: 1500, unit: "€/mese" }] })}>+ stima</button>
        </div>
      )}

      <div className="rounded-slot border border-dashed border-line p-3">
        <p className="t-meta mb-2 text-ink">Mostra questo passo solo se</p>
        <div className="grid grid-cols-3 gap-2">
          <select className={IN} value={cond?.fieldKey ?? ""} onChange={(e) => onCfg({ condition: e.target.value ? { fieldKey: e.target.value, operator: cond?.operator ?? "equals", value: cond?.value ?? "" } : undefined })}>
            <option value="">sempre</option>
            {others.map((o) => <option key={o.localId} value={o.key}>{o.key}</option>)}
          </select>
          <select className={IN} disabled={!cond} value={cond?.operator ?? "equals"} onChange={(e) => onCfg({ condition: { ...cond, operator: e.target.value } })}>
            {["equals", "not_equals", "in", "not_in", "gte", "lte", "exists"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <input className={IN} disabled={!cond} placeholder="valore (più valori separati da virgola)" value={cond?.value ?? ""} onChange={(e) => onCfg({ condition: { ...cond, value: e.target.value } })} />
        </div>
      </div>
    </div>
  );
}
