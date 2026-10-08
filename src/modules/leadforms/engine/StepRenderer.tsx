"use client";

// Un solo renderer per frontend e anteprima admin (chiude il bug del plugin
// dove image_select/slider/number funzionavano solo in admin).

import { useMemo, useState } from "react";
import { cn } from "@/design/ui";
import { jobOptions, type Answers, type Option, type PublicStep } from "../schema";
import { DateStep, RatingStep, SummaryStep } from "./ExtraSteps";

type Value = string | string[] | number | undefined;
type OnChange = (v: string | string[] | number, autoAdvance?: boolean) => void;

export function StepRenderer({ step, value, onChange, steps = [], answers = {} }: { step: PublicStep; value: Value; onChange: OnChange; steps?: PublicStep[]; answers?: Answers }) {
  const c = step.config;
  switch (c.type) {
    case "cards":
      return <OptionGrid options={c.options} value={value} multiple={c.multiple} columns={c.columns} onChange={onChange} />;
    case "multi":
      return <OptionGrid options={c.options} value={value} multiple columns={c.columns} onChange={onChange} />;
    case "image_select":
      return <ImageGrid options={c.options} value={value} multiple={c.multiple} onChange={onChange} />;
    case "video":
      return <VideoStep url={c.videoUrl} maxHeight={c.maxHeight} autoplay={c.autoplay} options={c.options} value={value} onChange={onChange} />;
    case "slider":
      return <SliderStep min={c.min} max={c.max} step={c.step} prefix={c.prefix} suffix={c.suffix} value={typeof value === "number" ? value : (c.defaultValue ?? c.min)} onChange={onChange} />;
    case "number":
      return <NumberStep min={c.min} max={c.max} step={c.step} prefix={c.prefix} suffix={c.suffix} value={typeof value === "number" ? value : c.defaultValue} onChange={onChange} />;
    case "select": {
      // "Che lavoro": poche voci, si sceglie con un tocco come su Instapro.
      const lavori = jobOptions(c, answers);
      if (lavori) return <OptionGrid options={lavori} value={value} multiple={false} columns={2} onChange={onChange} />;
      return c.searchable ? (
        <SearchSelect options={c.options} value={value} placeholder={c.placeholder} onChange={onChange} />
      ) : (
        <PlainSelect options={c.options} value={value} placeholder={c.placeholder} onChange={onChange} />
      );
    }
    case "textarea":
      return <TextareaStep value={typeof value === "string" ? value : ""} placeholder={c.placeholder} maxLength={c.maxLength} onChange={onChange} />;
    case "date":
      return <DateStep config={c} value={value} onChange={onChange} />;
    case "rating":
      return <RatingStep config={c} value={value} onChange={onChange} />;
    case "summary":
      return <SummaryStep config={c} steps={steps} answers={answers} />;
    case "contact":
      return null;
  }
}

function selected(value: Value): string[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [String(value)];
}

const CARD =
  "flex w-full items-center gap-3 rounded-slot border-[1.5px] px-4 py-3.5 text-left text-[15px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-action/40";
const CARD_ON = "border-action bg-tonal text-action";
const CARD_OFF = "border-line bg-canvas text-ink hover:border-ink/35";

function OptionGrid({ options, value, multiple, columns, onChange }: { options: Option[]; value: Value; multiple: boolean; columns: number; onChange: OnChange }) {
  const cur = selected(value);
  const toggle = (v: string) => {
    if (!multiple) return onChange(v, true);
    onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  return (
    <div className={cn("grid gap-2.5", columns >= 3 ? "sm:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "")} role={multiple ? "group" : "radiogroup"}>
      {options.map((o) => {
        const on = cur.includes(o.value);
        return (
          <button key={o.value} type="button" role={multiple ? "checkbox" : "radio"} aria-checked={on} onClick={() => toggle(o.value)} className={cn(CARD, on ? CARD_ON : CARD_OFF)}>
            {o.icon && <span aria-hidden className="text-xl">{o.icon}</span>}
            <span className="flex-1">
              {o.label}
              {o.description && <span className="t-meta block font-medium">{o.description}</span>}
            </span>
            {multiple && <span aria-hidden className={cn("h-5 w-5 rounded-md border-[1.5px]", on ? "border-action bg-action" : "border-ink/25")} />}
          </button>
        );
      })}
    </div>
  );
}

function ImageGrid({ options, value, multiple, onChange }: { options: Option[]; value: Value; multiple: boolean; onChange: OnChange }) {
  const cur = selected(value);
  const toggle = (v: string) => {
    if (!multiple) return onChange(v, true);
    onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map((o) => {
        const on = cur.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => toggle(o.value)} className={cn("overflow-hidden rounded-card border-[1.5px] text-left transition-colors", on ? "border-action" : "border-line hover:border-ink/35")}>
            {o.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="aspect-[4/3] w-full bg-surface" />
            )}
            <span className={cn("block px-3 py-2.5 text-sm font-semibold", on ? "bg-tonal text-action" : "text-ink")}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function VideoStep({ url, maxHeight, autoplay, options, value, onChange }: { url: string; maxHeight?: number; autoplay: boolean; options: Option[]; value: Value; onChange: OnChange }) {
  const [muted, setMuted] = useState(true);
  const yt = youtubeId(url);
  const style = maxHeight ? { maxHeight } : undefined;
  return (
    <div>
      <div className="relative overflow-hidden rounded-card bg-ink" style={style}>
        {yt ? (
          <iframe
            key={muted ? "m" : "u"}
            title="Video"
            className="aspect-video w-full"
            src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=${autoplay ? 1 : 0}&mute=${muted ? 1 : 0}&playsinline=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video className="aspect-video w-full" src={url} autoPlay={autoplay} muted={muted} playsInline controls />
        )}
        {muted && (
          <button type="button" onClick={() => setMuted(false)} className="absolute right-3 bottom-3 rounded-pill bg-canvas/90 px-3.5 py-2 text-xs font-bold text-ink shadow-card">
            Attiva audio
          </button>
        )}
      </div>
      {options.length > 0 && (
        <div className="mt-5">
          <OptionGrid options={options} value={value} multiple={false} columns={2} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function SliderStep({ min, max, step, prefix, suffix, value, onChange }: { min: number; max: number; step: number; prefix?: string; suffix?: string; value: number; onChange: OnChange }) {
  return (
    <div>
      <p className="t-h2 text-action">
        {prefix}
        {value.toLocaleString("it-IT")}
        {suffix}
      </p>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-4 w-full accent-[var(--color-action)]" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} />
      <div className="t-meta mt-1 flex justify-between">
        <span>
          {prefix}
          {min.toLocaleString("it-IT")}
          {suffix}
        </span>
        <span>
          {prefix}
          {max.toLocaleString("it-IT")}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function NumberStep({ min, max, step, prefix, suffix, value, onChange }: { min: number; max: number; step: number; prefix?: string; suffix?: string; value: number; onChange: OnChange }) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  const btn = "flex h-12 w-12 items-center justify-center rounded-pill border-[1.5px] border-ink/15 text-xl font-bold hover:border-ink/35 disabled:opacity-40";
  return (
    <div className="flex items-center gap-4">
      <button type="button" className={btn} onClick={() => set(value - step)} disabled={value <= min} aria-label="Diminuisci">
        −
      </button>
      <p className="t-h2 min-w-24 text-center">
        {prefix}
        {value.toLocaleString("it-IT")}
        {suffix}
      </p>
      <button type="button" className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label="Aumenta">
        +
      </button>
    </div>
  );
}

const FIELD =
  "w-full rounded-slot border-[1.5px] border-line bg-canvas px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-action focus-visible:ring-3 focus-visible:ring-action/25";

function PlainSelect({ options, value, placeholder, onChange }: { options: Option[]; value: Value; placeholder?: string; onChange: OnChange }) {
  return (
    <select className={FIELD} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value, true)}>
      <option value="">{placeholder ?? "Scegli..."}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SearchSelect({ options, value, placeholder, onChange }: { options: Option[]; value: Value; placeholder?: string; onChange: OnChange }) {
  const cur = typeof value === "string" ? value : "";
  const current = options.find((o) => o.value === cur);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    // Cerca anche nelle parole chiave: un comune minore trova il suo capoluogo.
    const src = needle ? options.filter((o) => o.label.toLowerCase().includes(needle) || o.keywords?.some((k) => k.toLowerCase().includes(needle))) : options;
    return src;
  }, [needle, options]);
  const via = (o: Option) => (needle && !o.label.toLowerCase().includes(needle) ? o.keywords?.find((k) => k.toLowerCase().includes(needle)) : undefined);
  return (
    <div>
      {current && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-pill bg-tonal px-3.5 py-1.5 text-sm font-bold text-action">
          {current.label}
          <button type="button" onClick={() => onChange("")} aria-label="Cambia" className="text-action/70 hover:text-action">
            ×
          </button>
        </p>
      )}
      <input type="search" className={FIELD} placeholder={placeholder ?? "Cerca..."} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      <ul className="mt-2 max-h-72 overflow-auto rounded-slot border border-line" role="listbox">
        {list.map((o) => (
          <li key={o.value}>
            <button type="button" role="option" aria-selected={o.value === cur} onClick={() => onChange(o.value, true)} className={cn("flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] hover:bg-surface", o.value === cur && "bg-tonal text-action")}>
              <span className="font-semibold">
                {o.label}
                {via(o) && <span className="ml-2 font-normal text-ink-3">include {via(o)}</span>}
              </span>
              {o.description && <span className="t-meta">{o.description}</span>}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="t-meta px-4 py-3">Nessun risultato per “{q}”.</li>}
      </ul>
    </div>
  );
}

function TextareaStep({ value, placeholder, maxLength, onChange }: { value: string; placeholder?: string; maxLength: number; onChange: OnChange }) {
  return (
    <div>
      <textarea className={cn(FIELD, "min-h-36 resize-y")} placeholder={placeholder} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
      <p className="t-meta mt-1 text-right text-ink-3">
        {value.length}/{maxLength}
      </p>
    </div>
  );
}
