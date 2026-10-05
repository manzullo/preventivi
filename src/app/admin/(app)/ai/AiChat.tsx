"use client";

// Chat AI: port della pagina AI Assistant. Cronologia in localStorage,
// prompt rapidi, contesto (account, form, periodo), tool in lettura
// eseguiti da soli, tool in scrittura con card di conferma.

import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@/design/ui";

type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };
type Msg = { role: "user" | "assistant" | "tool"; content: string; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string };
type Pending = { call: ToolCall; preview: string };
type Chat = { id: string; title: string; messages: Msg[]; updatedAt: number };
type Account = { id: string; name: string; manager: boolean };
type Form = { id: string; name: string };

const KEY = "ma_ai_chats";
const GENERIC = [
  ["Setup nuova campagna", "Aiutami a strutturare una nuova campagna Google Ads search per generare lead di professionisti di marketing (servizio + città). Suggerisci: tipi di campagna, budget consigliato, struttura degli ad group per servizio e città, esempi di keyword e annunci."],
  ["Spiegami QS", "Spiegami come funziona il Quality Score di Google Ads, da cosa è composto (expected CTR, ad relevance, landing page experience) e cosa posso fare per migliorarlo. Dammi una checklist concreta."],
  ["Match types", "Quando usare BROAD, PHRASE o EXACT match? Dammi esempi concreti per il mio settore (lead gen di servizi di marketing per città). Quale strategia per una campagna nuova vs una matura?"],
  ["Best practice RSA", "Quali sono le best practice per scrivere annunci RSA che convertono? Dammi: 1) framework per le headline pinnate; 2) formule che funzionano; 3) errori comuni da evitare."],
  ["Strategie di bidding", "Quale strategia di bidding consigli a chi ha 0-30 conversioni/mese, 30-100, 100+? Spiega le differenze tra Manual CPC, Target CPA, Maximize Conversions, Target ROAS: quando e perché."],
  ["Negative baseline", "Lista esaustiva di negative keyword di base da aggiungere a qualsiasi campagna search di lead generation per professionisti di marketing: blocca lavoro, gratis, corsi, tutorial, software, ecc. Raggruppale per categoria."],
  ["Scrivi RSA", "Scrivimi 5 headline (max 30 caratteri) e 3 description (max 90 caratteri) per un annuncio RSA che porti richieste di preventivo per professionisti SEO a Roma. Tono diretto, con CTA."],
] as const;
const ACCOUNT = [
  ["Executive Summary", "Dammi un executive summary del mio account Google Ads: spesa totale, conversioni, CPA, ROAS stimato e i 3 problemi più urgenti."],
  ["Analisi 30gg", "Analizza il mio account Google Ads degli ultimi 30 giorni: quali campagne stanno performando bene e quali male, e perché."],
  ["Search terms", "Guarda i miei search term degli ultimi 30 giorni. Trova: 1) query con click ma 0 conversioni da bloccare come negative; 2) query convertenti da promuovere a EXACT."],
  ["Campagne in dumping", "Trova le campagne in dumping: alta spesa, basse conversioni, CPA molto sopra la media. Per ognuna dimmi se pausare, ridurre budget o cosa cambiare."],
  ["Cosa scalare", "Quale ad group ha più potenziale di scalare? Cerca quelli con CPA basso e budget non saturo. Suggerisci di quanto aumentare il budget."],
  ["Ribilancia budget", "Voglio ridistribuire il budget tra campagne. Mostrami una proposta basata sul CPA: dove tagliare, dove aumentare, a parità di budget totale."],
  ["Mio Quality Score", "Calcola il Quality Score medio delle mie keyword e identifica quelle con QS sotto 5. Per ognuna spiega come migliorarlo."],
  ["Espandi keyword", "In base ai miei search term convertenti, suggerisci 10 nuove keyword (mix exact/phrase) con bid stimato e a quale ad group assegnarle."],
  ["Keyword che bruciano", "Quali keyword mangiano budget senza convertire? Lista con keyword, spesa, click, 0 conv e azione consigliata (pausare, abbassare bid, cambiare match type)."],
  ["Migliora annunci", "Analizza i miei annunci RSA. Per ognuno dimmi quali headline performano meglio, quali sostituire, e suggerisci 3 nuove headline basate sui pattern vincenti."],
  ["Verifica geo-targeting", "Controlla il geo-targeting di TUTTE le mie campagne (list_campaign_locations) e verifica che le località corrispondano alle città delle pagine servizio × città. Segnala esclusioni mancanti."],
  ["Compare form", "Confronta i miei form: quali generano lead e quali no? Per quelli con basso tasso, identifica lo step con più abbandono e suggerisci come ridurlo."],
] as const;

const load = (): Chat[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const save = (c: Chat[]) => { try { localStorage.setItem(KEY, JSON.stringify(c.slice(0, 30))); } catch { /* spazio esaurito */ } };
const uid = () => Math.random().toString(36).slice(2, 10);

export function AiChat({ accounts, forms, initialCustomer, initialForm, configured }: { accounts: Account[]; forms: Form[]; initialCustomer?: string; initialForm?: string; configured: boolean }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [usage, setUsage] = useState({ in: 0, out: 0 });
  const [customerId, setCustomerId] = useState(initialCustomer ?? "");
  const [formId, setFormId] = useState(initialForm ?? "");
  const [days, setDays] = useState(30);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { const c = load(); setChats(c); setCurrent(c[0]?.id ?? null); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [chats, pending, busy]);

  const chat = chats.find((c) => c.id === current);
  const messages = chat?.messages ?? [];

  function persist(next: Chat[]) { setChats(next); save(next); }
  function newChat() { const c: Chat = { id: uid(), title: "Nuova conversazione", messages: [], updatedAt: Date.now() }; persist([c, ...chats]); setCurrent(c.id); setPending([]); }
  function update(id: string, fn: (c: Chat) => Chat) { persist(chats.map((c) => (c.id === id ? fn(c) : c))); }

  const ctx = () => ({ customerId: customerId || undefined, customerName: accounts.find((a) => a.id === customerId)?.name, formId: formId || undefined, formName: forms.find((f) => f.id === formId)?.name, days });

  async function callModel(id: string, msgs: Msg[], round = 0) {
    const r = await fetch("/api/ai/chat/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: msgs, context: ctx() }) });
    const d = (await r.json()) as { ok: boolean; error?: string; text?: string; tool_calls?: ToolCall[]; usage?: { in: number; out: number } };
    if (!d.ok) { update(id, (c) => ({ ...c, messages: [...msgs, { role: "assistant", content: `Errore: ${d.error}` }] })); return; }
    setUsage((u) => ({ in: u.in + (d.usage?.in ?? 0), out: u.out + (d.usage?.out ?? 0) }));
    const assistant: Msg = { role: "assistant", content: d.text ?? "", tool_calls: d.tool_calls?.length ? d.tool_calls : undefined };
    let next = [...msgs, assistant];
    update(id, (c) => ({ ...c, messages: next, updatedAt: Date.now() }));
    if (!d.tool_calls?.length || round >= 6) return;
    const waiting: Pending[] = [];
    for (const call of d.tool_calls) {
      const t = await fetch("/api/ai/tool/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: call.name, arguments: call.arguments, confirmed: false }) });
      const tr = (await t.json()) as { ok: boolean; error?: string; result?: unknown; requires_confirmation?: boolean; preview?: string };
      if (tr.requires_confirmation) { waiting.push({ call, preview: tr.preview ?? "" }); continue; }
      next = [...next, { role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify(tr.ok ? tr.result : { error: tr.error }).slice(0, 60_000) }];
      update(id, (c) => ({ ...c, messages: next }));
    }
    if (waiting.length) { setPending(waiting); return; }
    await callModel(id, next, round + 1);
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    let id = current;
    let base = chats;
    if (!id) { const c: Chat = { id: uid(), title: text.slice(0, 40), messages: [], updatedAt: Date.now() }; base = [c, ...chats]; persist(base); id = c.id; setCurrent(id); }
    const cur = base.find((c) => c.id === id)!;
    const msgs: Msg[] = [...cur.messages, { role: "user", content: text.trim() }];
    persist(base.map((c) => (c.id === id ? { ...c, messages: msgs, title: c.messages.length ? c.title : text.slice(0, 40), updatedAt: Date.now() } : c)));
    setInput(""); setBusy(true);
    try { await callModel(id, msgs); } finally { setBusy(false); }
  }

  async function resolvePending(p: Pending, confirmed: boolean) {
    if (!current) return;
    setBusy(true);
    let content: string;
    if (confirmed) {
      const t = await fetch("/api/ai/tool/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: p.call.name, arguments: p.call.arguments, confirmed: true }) });
      const tr = (await t.json()) as { ok: boolean; error?: string; result?: unknown };
      content = JSON.stringify(tr.ok ? tr.result : { error: tr.error });
    } else content = JSON.stringify({ cancelled: true, note: "L'utente ha annullato questa azione." });
    const rest = pending.filter((x) => x.call.id !== p.call.id);
    setPending(rest);
    const cur = chats.find((c) => c.id === current)!;
    const msgs: Msg[] = [...cur.messages, { role: "tool", tool_call_id: p.call.id, name: p.call.name, content }];
    update(current, (c) => ({ ...c, messages: msgs }));
    if (rest.length === 0) { try { await callModel(current, msgs, 1); } finally { setBusy(false); } } else setBusy(false);
  }

  const SEL = "rounded-slot border-[1.5px] border-line bg-canvas px-2 py-1 text-sm";
  return (
    <div className="grid h-[calc(100vh-4rem)] gap-4 lg:grid-cols-[260px_1fr_260px]">
      <aside className="flex flex-col overflow-hidden rounded-card border border-line bg-canvas p-3">
        <Button onClick={newChat} variant="outline" className="min-h-9 px-4 py-1.5 text-sm">+ Nuova chat</Button>
        <ul className="mt-3 flex-1 space-y-1 overflow-auto">
          {chats.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { setCurrent(c.id); setPending([]); }} className={cn("block w-full truncate rounded-slot px-3 py-1.5 text-left text-sm", c.id === current ? "bg-tonal text-action" : "hover:bg-surface")}>{c.title}</button>
            </li>
          ))}
        </ul>
        <p className="t-meta mt-2">Token: {usage.in} in / {usage.out} out</p>
      </aside>

      <section className="flex flex-col overflow-hidden rounded-card border border-line bg-canvas">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <span className="t-kicker">Contesto</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={SEL}><option value="">nessun account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.manager ? " (MCC)" : ""}</option>)}</select>
          <select value={formId} onChange={(e) => setFormId(e.target.value)} className={SEL}><option value="">nessun form</option>{forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={SEL}>{[7, 30, 90].map((d) => <option key={d} value={d}>{d} giorni</option>)}</select>
          {!configured && <span className="ml-auto text-sm font-semibold text-brand">Provider AI non configurato: Impostazioni → AI Assistant</span>}
        </div>
        <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
          {messages.length === 0 && <p className="t-body text-ink-2">Benvenuto. Chiedi qualcosa o usa un prompt rapido. Con un account selezionato leggo i dati reali; le modifiche partono solo dopo la tua conferma.</p>}
          {messages.map((m, i) => m.role === "tool" ? (
            <p key={i} className="t-meta">↳ tool <code>{m.name}</code>: {m.content.length > 200 ? `${m.content.slice(0, 200)}…` : m.content}</p>
          ) : (
            <div key={i} className={cn("max-w-[85%] whitespace-pre-wrap rounded-card px-4 py-3 text-sm", m.role === "user" ? "ml-auto bg-action text-white" : "bg-surface")}>
              {m.content || (m.tool_calls?.length ? `Chiamo ${m.tool_calls.map((t) => t.name).join(", ")}…` : "")}
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.call.id} className="rounded-card border-2 border-warn-fg/40 bg-warn p-4 text-sm">
              <p className="font-bold">Conferma azione: {p.call.name}</p>
              <p className="mt-1">{p.preview}</p>
              <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(p.call.arguments, null, 1)}</pre>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => resolvePending(p, true)} disabled={busy} className="min-h-9 px-4 py-1.5 text-sm">✓ Applica</Button>
                <Button onClick={() => resolvePending(p, false)} disabled={busy} variant="outline" className="min-h-9 px-4 py-1.5 text-sm">✗ Annulla</Button>
              </div>
            </div>
          ))}
          {busy && <p className="t-meta">Sto lavorando…</p>}
          <div ref={bottom} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2 border-t border-line p-3">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }} rows={2} placeholder="Scrivi un messaggio… (Shift+Invio per andare a capo)" className="flex-1 resize-none rounded-slot border-[1.5px] border-line px-3 py-2 text-sm outline-none focus:border-action" />
          <Button type="submit" disabled={busy || !input.trim()} arrow className="min-h-9 self-end px-4 py-2 text-sm">Invia</Button>
        </form>
      </section>

      <aside className="overflow-auto rounded-card border border-line bg-canvas p-3">
        <p className="t-kicker mb-2">Generali</p>
        <div className="flex flex-wrap gap-1.5">{GENERIC.map(([l, p]) => <button key={l} type="button" onClick={() => void send(p)} className="rounded-pill bg-surface px-3 py-1 text-xs font-semibold hover:bg-tonal hover:text-action">{l}</button>)}</div>
        <p className="t-kicker mt-4 mb-2">Sul tuo account</p>
        <div className="flex flex-wrap gap-1.5">{ACCOUNT.map(([l, p]) => <button key={l} type="button" onClick={() => void send(p)} className="rounded-pill bg-surface px-3 py-1 text-xs font-semibold hover:bg-tonal hover:text-action">{l}</button>)}</div>
      </aside>
    </div>
  );
}
