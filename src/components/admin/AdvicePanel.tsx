"use client";

// "Analisi AI": port del pannello laterale del plugin. Una chiamata, insight
// prioritizzati, link per continuare in chat.

import { useState } from "react";
import { Button } from "@/design/ui";

type Insight = { priority: string; category: string; title: string; description: string; action: string; impact: string };
type Resp = { ok: boolean; error?: string; insights?: Insight[]; raw?: string; usage?: { in: number; out: number }; truncation?: { truncated: boolean; reductions: string[] }; provider?: string; model?: string };

export function AdvicePanel({ level, customerId, formId, days, scopeId }: { level: string; customerId?: string; formId?: string; days: number; scopeId?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [res, setRes] = useState<Resp | null>(null);
  const [goal, setGoal] = useState("");

  async function run() {
    setState("loading");
    try {
      const r = await fetch("/api/ai/advice/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ level, customerId, formId, days, scopeId, goal: goal || undefined }) });
      setRes((await r.json()) as Resp);
    } catch (e) {
      setRes({ ok: false, error: String(e) });
    }
    setState("done");
  }
  const icon: Record<string, string> = { critical: "●", warning: "▲", info: "○" };
  const tone: Record<string, string> = { critical: "text-brand", warning: "text-warn-fg", info: "text-action" };

  return (
    <section className="rounded-card border border-line bg-canvas p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-title">Analisi AI · {level}</p>
        <div className="flex items-center gap-2">
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className="rounded-slot border-[1.5px] border-line px-2 py-1 text-sm">
            <option value="">obiettivo: generico</option>
            <option value="lead">più lead</option>
            <option value="roas">ROAS</option>
            <option value="qs">Quality Score</option>
            <option value="budget">meno sprechi</option>
          </select>
          <Button onClick={run} disabled={state === "loading"} variant="tonal" className="min-h-9 px-4 py-1.5 text-sm">{state === "loading" ? "Analizzo… (10-30 s)" : "Analizza"}</Button>
        </div>
      </div>
      {res && !res.ok && <p className="mt-3 text-sm font-semibold text-brand">AI non risponde: {res.error}</p>}
      {res?.ok && (
        <div className="mt-4 space-y-3">
          {res.truncation?.truncated && <p className="t-meta">Contesto troncato: {res.truncation.reductions.join(", ")}</p>}
          {(res.insights ?? []).length === 0 && !res.raw && <p className="t-meta">Nessun insight critico per questo ambito.</p>}
          {res.raw && <pre className="whitespace-pre-wrap rounded-slot bg-surface p-3 text-xs">{res.raw}</pre>}
          {(res.insights ?? []).map((it, i) => (
            <div key={i} className="rounded-slot border border-line p-3 text-sm">
              <p className="font-semibold"><span className={tone[it.priority] ?? ""}>{icon[it.priority] ?? "○"}</span> {it.title} <span className="t-meta ml-2">{it.priority} · {it.category}</span></p>
              <p className="mt-1 text-ink-2">{it.description}</p>
              <p className="mt-1"><strong>Azione:</strong> {it.action}</p>
              <p className="t-meta mt-1">Impatto: {it.impact}</p>
            </div>
          ))}
          <p className="t-meta">{res.provider} · {res.model} · token in {res.usage?.in} / out {res.usage?.out} · <a className="font-bold text-action" href={`/admin/ai/?customer=${customerId ?? ""}&form=${formId ?? ""}`}>Continua in chat →</a></p>
        </div>
      )}
    </section>
  );
}
