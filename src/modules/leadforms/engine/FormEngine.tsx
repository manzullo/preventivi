"use client";

// Engine del form multi-step. Stesso componente per pagina pubblica, embed
// e anteprima admin (prop `preview`: niente tracking, niente submit).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, cn } from "@/design/ui";
import { ContactStep } from "./ContactStep";
import { StepRenderer } from "./StepRenderer";
import { beacon, ensureVisit, pushDataLayer, sessionId, type Tracking } from "./client-tracking";
import { EMAIL_RE, PHONE_RE, contaCifre, conditionMet, type Answers, type Contact, type PublicForm, type PublicStep } from "../schema";

type Props = {
  form: PublicForm;
  prefilled?: Record<string, string>;
  preview?: boolean;
  clientId?: string;
  submitEndpoint?: string;
};

function mapTracking(t: Tracking) {
  return {
    utmSource: t.utm_source,
    utmMedium: t.utm_medium,
    utmCampaign: t.utm_campaign,
    utmTerm: t.utm_term,
    utmContent: t.utm_content,
    gclid: t.gclid,
    gbraid: t.gbraid,
    wbraid: t.wbraid,
    referrer: t.referrer,
    landingPath: t.landing_path,
    matchType: t.matchtype,
    device: t.device,
    network: t.network,
  };
}

export function FormEngine({ form, prefilled = {}, preview = false, clientId, submitEndpoint = "/api/forms/submit/" }: Props) {
  const cid = clientId ?? form.config.clientId;
  const [answers, setAnswers] = useState<Answers>(() => ({ ...prefilled }));
  const [contact, setContact] = useState<Contact>({});
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const visitRef = useRef<{ visitId: string | null; tracking: Tracking }>({ visitId: null, tracking: {} });
  const formRef = useRef<HTMLFormElement>(null);
  const viewed = useRef(new Set<string>());

  const visible = useMemo(
    () => form.steps.filter((s) => conditionMet(s.config.condition, answers) && !(s.config.skipIfPrefilled && prefilled[s.key])),
    [form.steps, answers, prefilled],
  );
  const total = visible.length;
  const step: PublicStep | undefined = visible[Math.min(index, Math.max(0, total - 1))];
  const isContact = step?.config.type === "contact";
  const isLast = index >= total - 1;

  useEffect(() => {
    if (preview) return;
    ensureVisit(cid, form.config.customParams).then((v) => {
      visitRef.current = v;
    });
    // Ripresa: bozza della stessa sessione (lead parziale).
    fetch(`/api/forms/draft/?form=${encodeURIComponent(form.slug)}&session=${encodeURIComponent(sessionId())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { draft?: { answers?: Answers; contact?: Contact; lastStepKey?: string } | null } | null) => {
        const draft = d?.draft;
        if (!draft) return;
        if (draft.answers) setAnswers((a) => ({ ...draft.answers, ...a }));
        if (draft.contact) setContact((c) => ({ ...draft.contact, ...c }));
        resumeRef.current = true;
      })
      .catch(() => undefined);
  }, [preview, cid, form.config.customParams, form.slug]);

  // Salvataggio bozza a ogni cambio (debounce): recupero degli abbandoni.
  const draftTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (preview || Object.keys(answers).length === 0) return;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      void fetch("/api/forms/draft/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formSlug: form.slug, sessionId: sessionId(), answers, contact, lastStepKey: step?.key, clientId: cid, landingPath: visitRef.current.tracking.landing_path }), keepalive: true });
    }, 900);
    return () => window.clearTimeout(draftTimer.current);
  }, [answers, contact, preview, form.slug, cid, step?.key]);

  useEffect(() => {
    if (!step || preview || viewed.current.has(step.id)) return;
    viewed.current.add(step.id);
    pushDataLayer("psf_step_view", { psf_form_id: form.slug, psf_step_index: index, psf_step_name: step.config.title, psf_step_key: step.key, psf_client_id: cid });
    beacon({ type: "step_view", formId: form.id, stepId: step.id, sessionId: sessionId(), path: window.location.pathname });
  }, [step, index, preview, form.id, form.slug, cid]);

  const complete = useCallback(
    (s: PublicStep, i: number) => {
      if (preview) return;
      pushDataLayer("psf_step_completed", { psf_form_id: form.slug, psf_step_index: i, psf_step_name: s.config.title, psf_step_key: s.key, psf_client_id: cid });
      beacon({ type: "step_completed", formId: form.id, stepId: s.id, sessionId: sessionId(), path: window.location.pathname });
    },
    [preview, form.id, form.slug, cid],
  );

  // Dopo la ripresa: salta al primo passo visibile ancora senza risposta.
  const resumeRef = useRef(false);
  useEffect(() => {
    if (!resumeRef.current) return;
    resumeRef.current = false;
    const first = visible.findIndex((s) => s.config.type !== "summary" && !answered(s, answers));
    if (first > 0) setIndex(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const answered = (s: PublicStep, a: Answers) => {
    if (s.config.type === "summary") return true;
    const v = a[s.key];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && String(v).trim() !== "";
  };

  const advance = useCallback(
    (from: PublicStep, i: number) => {
      complete(from, i);
      setIndex((x) => Math.min(x + 1, total - 1));
    },
    [complete, total],
  );

  function setAnswer(key: string, value: Answers[string], autoAdvance?: boolean) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setErrors({});
    if (autoAdvance && step && step.key === key && !isLast) {
      window.setTimeout(() => advance(step, index), 220);
    }
  }

  /**
   * Quello che è scritto davvero nei campi. Il riempimento automatico di Chrome
   * e dei gestori di password inserisce il testo senza far scattare l'evento
   * che React ascolta: senza questa lettura il modulo dice "campo obbligatorio"
   * mentre il nome e l'email sono lì, sotto gli occhi di chi scrive.
   */
  function contattiDalModulo(): Contact {
    const nodo = formRef.current;
    if (!nodo) return contact;
    const letti: Contact = { ...contact };
    for (const el of nodo.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input[name], textarea[name], select[name]")) {
      if (!el.name || el.type === "checkbox" || el.type === "radio") continue;
      const v = el.value.trim();
      if (v && !(letti[el.name] ?? "").trim()) letti[el.name] = v;
    }
    return letti;
  }

  async function doSubmit() {
    if (preview || submitting || !step) return;
    const errs: Record<string, string> = {};
    const contatti = isContact ? contattiDalModulo() : contact;
    if (contatti !== contact) setContact(contatti);
    if (isContact && step.config.type === "contact") {
      for (const f of step.config.fields) {
        const v = (contatti[f.key] ?? "").trim();
        if (f.required && !v) errs[f.key] = "Campo obbligatorio";
        else if (v && f.type === "email" && !EMAIL_RE.test(v)) errs[f.key] = "Email non valida";
        else if (v && f.type === "tel" && (!PHONE_RE.test(v) || contaCifre(v) < 6)) errs[f.key] = "Telefono non valido";
      }
      if (contatti.consenso !== "1") errs.consenso = "Serve il consenso per essere ricontattato.";
    } else if (step.config.required && !answered(step, answers)) {
      errs[step.key] = "Scegli una risposta per continuare.";
    }
    if (Object.keys(errs).length) return setErrors(errs);

    setSubmitting(true);
    setGlobalError(null);
    const t = visitRef.current;
    const body = {
      formSlug: form.slug,
      answers,
      contact: contatti,
      prefilled,
      visitId: t.visitId,
      sessionId: sessionId(),
      tracking: mapTracking(t.tracking),
      clientId: cid,
      landingPath: t.tracking.landing_path,
      honeypot: contatti.hp ?? "",
    };
    try {
      const res = await fetch(submitEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { ok: boolean; leadId?: string; redirect?: string; error?: string; fields?: Record<string, string> };
      if (!res.ok || !data.ok || !data.redirect) {
        const campi = data.fields ?? {};
        setErrors(campi);
        // Se manca la risposta a un passo precedente, riportiamo la persona
        // dov'è il buco: dire "controlla i campi" sull'ultima schermata, dove
        // quel campo non c'è, manda solo in confusione.
        const buco = visible.findIndex((s) => campi[s.key]);
        if (buco >= 0 && buco !== index) {
          setIndex(buco);
          setGlobalError(null);
        } else {
          setGlobalError(data.error ?? "Invio non riuscito, riprova.");
        }
        setSubmitting(false);
        return;
      }
      complete(step, index);
      if (window.parent !== window) window.parent.postMessage({ type: "ma:lead", leadId: data.leadId, redirect: data.redirect }, "*");
      window.location.assign(data.redirect);
    } catch {
      setGlobalError("Connessione non riuscita, riprova.");
      setSubmitting(false);
    }
  }

  /** Controlla i campi dei contatti quando si lascia quel passo senza inviare. */
  function contattiValidi(): boolean {
    if (!step || step.config.type !== "contact") return true;
    const contatti = contattiDalModulo();
    setContact(contatti);
    const errs: Record<string, string> = {};
    for (const f of step.config.fields) {
      const v = (contatti[f.key] ?? "").trim();
      if (f.required && !v) errs[f.key] = "Campo obbligatorio";
      else if (v && f.type === "email" && !EMAIL_RE.test(v)) errs[f.key] = "Email non valida";
      else if (v && f.type === "tel" && (!PHONE_RE.test(v) || contaCifre(v) < 6)) errs[f.key] = "Telefono non valido";
    }
    if (contatti.consenso !== "1") errs.consenso = "Serve il consenso per essere ricontattato.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return false;
    }
    return true;
  }

  function next() {
    if (!step) return;
    if (isLast) return void doSubmit();
    if (isContact && !contattiValidi()) return;
    if (step.config.required && !answered(step, answers)) return setErrors({ [step.key]: "Scegli una risposta per continuare." });
    setErrors({});
    advance(step, index);
  }

  function back() {
    setErrors({});
    setGlobalError(null);
    setIndex((x) => Math.max(0, x - 1));
  }

  if (!step) {
    return <p className="t-body text-ink-2">Questo modulo non ha ancora passi configurati.</p>;
  }

  const pct = Math.round(((index + 1) / total) * 100);
  const submitLabel = (step.config.type === "contact" && step.config.submitLabel) || form.config.submitButtonText;

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        void doSubmit();
      }}
      noValidate
      className="relative rounded-panel border border-line bg-canvas p-6 shadow-card sm:p-8"
      data-form={form.slug}
    >
      <header className="mb-6">
        {form.config.headerBadge && <span className="inline-flex rounded-pill bg-tonal px-3 py-1 text-xs font-bold text-action">{form.config.headerBadge}</span>}
        <p className="t-h2 mt-2">{form.config.headerTitle}</p>
        {form.config.showProgress && total > 1 && (
          <div className="mt-4" aria-hidden>
            <div className="t-meta flex justify-between">
              <span>
                Passo {index + 1} di {total}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-pill bg-surface">
              <div className="h-1.5 rounded-pill bg-action transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </header>

      <div key={step.id} className={cn(form.config.animations && "animate-[fadeIn_.25s_ease]")}>
        <p className="t-title" id={`step-${step.id}`}>
          {step.config.title}
        </p>
        {step.config.subtitle && <p className="t-meta mt-1">{step.config.subtitle}</p>}
        <div className="mt-5" role="group" aria-labelledby={`step-${step.id}`}>
          {isContact && step.config.type === "contact" ? (
            <ContactStep
              config={step.config}
              value={contact}
              onChange={setContact}
              errors={errors}
              onClearError={(k) => setErrors((e) => (e[k] ? Object.fromEntries(Object.entries(e).filter(([x]) => x !== k)) : e))}
            />
          ) : (
            <StepRenderer step={step} value={answers[step.key]} onChange={(v, auto) => setAnswer(step.key, v, auto)} steps={form.steps} answers={answers} />
          )}
        </div>
        {errors[step.key] && <p className="mt-3 text-sm font-semibold text-brand">{errors[step.key]}</p>}
        {globalError && <p className="mt-3 text-sm font-semibold text-brand">{globalError}</p>}
      </div>

      <footer className="mt-8 flex items-center justify-between gap-3">
        <button type="button" onClick={back} disabled={index === 0} className="t-meta font-bold text-ink-2 hover:text-ink disabled:invisible">
          ← Indietro
        </button>
        {isLast ? (
          <Button type="submit" arrow disabled={submitting}>
            {submitting ? "Invio in corso..." : submitLabel}
          </Button>
        ) : (
          <Button type="button" onClick={next} arrow>
            Continua
          </Button>
        )}
      </footer>
      {isContact && <p className="t-meta mt-4 text-ink-3">{form.config.privacyText}</p>}
      {form.testMode && <p className="t-kicker mt-4 text-warn-fg">Modalità test: i lead non vengono conteggiati</p>}
    </form>
  );
}
