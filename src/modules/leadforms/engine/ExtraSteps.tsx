"use client";

// Step avanzati: data con fasce (slot come il BookingWidget di Tabbble),
// valutazione a stelle, riepilogo con stima indicativa per servizio.

import { cn } from "@/design/ui";
import type { Answers, PublicStep, StepConfig } from "../schema";

type OnChange = (v: string | string[] | number, autoAdvance?: boolean) => void;
type DateCfg = Extract<StepConfig, { type: "date" }>;
type RatingCfg = Extract<StepConfig, { type: "rating" }>;
type SummaryCfg = Extract<StepConfig, { type: "summary" }>;

const FIELD = "w-full rounded-slot border-[1.5px] border-line bg-canvas px-4 py-3 text-[15px] text-ink outline-none focus:border-action";

/** Valore salvato come "YYYY-MM-DD | fascia" oppure solo "fascia". */
export function DateStep({ config, value, onChange }: { config: DateCfg; value: unknown; onChange: OnChange }) {
  const cur = typeof value === "string" ? value : "";
  const [date, slot] = cur.includes(" | ") ? cur.split(" | ") : config.askDate ? [cur, ""] : ["", cur];
  const min = new Date(Date.now() + config.minDaysAhead * 864e5).toISOString().slice(0, 10);
  const set = (d: string, s: string) => onChange(config.askDate ? (s ? `${d} | ${s}` : d) : s, Boolean(s) && (!config.askDate || Boolean(d)));
  return (
    <div className="space-y-4">
      {config.askDate && <input type="date" min={min} value={date} onChange={(e) => set(e.target.value, slot)} className={FIELD} />}
      <div className="flex flex-wrap gap-2">
        {config.slots.map((s, i) => {
          const on = slot === s;
          const last = i === config.slots.length - 1;
          return (
            <button key={s} type="button" aria-pressed={on} onClick={() => set(date, s)} className={cn("rounded-slot px-[18px] py-[11px] text-sm font-bold transition-colors", on ? "bg-action text-white" : last ? "bg-surface text-ink hover:bg-tonal hover:text-action" : "bg-tonal text-action hover:brightness-95")}>
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RatingStep({ config, value, onChange }: { config: RatingCfg; value: unknown; onChange: OnChange }) {
  const cur = typeof value === "number" ? value : 0;
  return (
    <div>
      <div className="flex gap-2" role="radiogroup">
        {Array.from({ length: config.max }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={cur === n} aria-label={`${n} su ${config.max}`} onClick={() => onChange(n, true)} className={cn("flex h-12 w-12 items-center justify-center rounded-pill border-[1.5px] text-xl transition-colors", n <= cur ? "border-star bg-star/20 text-star" : "border-line text-ink-3 hover:border-ink/35")}>
            ★
          </button>
        ))}
      </div>
      <div className="t-meta mt-2 flex justify-between"><span>{config.lowLabel}</span><span>{config.highLabel}</span></div>
    </div>
  );
}

function labelFor(step: PublicStep, v: unknown): string {
  const c = step.config;
  const opts = "options" in c ? c.options : [];
  const one = (x: unknown) => opts.find((o) => o.value === String(x))?.label ?? String(x);
  if (Array.isArray(v)) return v.map(one).join(", ");
  return one(v);
}

export function SummaryStep({ config, steps, answers }: { config: SummaryCfg; steps: PublicStep[]; answers: Answers }) {
  const rows = steps.filter((s) => s.config.type !== "contact" && s.config.type !== "summary" && answers[s.key] !== undefined && answers[s.key] !== "").map((s) => ({ key: s.key, title: s.config.title, value: labelFor(s, answers[s.key]) }));
  const service = String(answers.servizio ?? "");
  const est = config.estimates.find((e) => e.serviceSlug === service);
  const fmt = (n: number) => n.toLocaleString("it-IT");
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-line rounded-slot border border-line">
        {rows.map((r) => (
          <div key={r.key} className="flex justify-between gap-4 px-4 py-2.5 text-sm"><dt className="text-ink-2">{r.title}</dt><dd className="text-right font-semibold">{r.value}</dd></div>
        ))}
        {rows.length === 0 && <p className="t-meta px-4 py-3">Nessuna risposta ancora.</p>}
      </dl>
      {config.showEstimate && est && (
        <div className="rounded-card bg-tonal p-5">
          <p className="t-kicker text-action">{config.estimateLabel}</p>
          <p className="t-h2 mt-1 text-action">{fmt(est.min)} – {fmt(est.max)} {est.unit}</p>
          <p className="t-meta mt-2">{config.estimateNote}</p>
        </div>
      )}
    </div>
  );
}
