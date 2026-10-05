"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/design/ui";
import { PHONE_PREFIXES, PHONE_PREFIX_DEFAULT, type Contact, type StepConfig } from "../schema";

type ContactConfig = Extract<StepConfig, { type: "contact" }>;

// Aspetto comune dei campi, senza larghezza: la larghezza la decide chi lo usa,
// altrimenti due classi di larghezza si scontrano e vince quella sbagliata.
const CAMPO =
  "rounded-slot border-[1.5px] bg-canvas px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-action focus-visible:ring-3 focus-visible:ring-action/25";
const FIELD = `w-full ${CAMPO}`;

export function ContactStep({ config, value, onChange, errors, onClearError }: { config: ContactConfig; value: Contact; onChange: (v: Contact) => void; errors: Record<string, string>; onClearError?: (k: string) => void }) {
  const set = (k: string, v: string) => {
    onChange({ ...value, [k]: v });
    // Appena si scrive, l'avviso su quel campo sparisce: resta solo finché
    // il campo è davvero da sistemare.
    if (errors[k]) onClearError?.(k);
  };
  const box = useRef<HTMLDivElement>(null);
  // Lo stato più recente, per il controllo periodico qui sotto: senza questo
  // riferimento il controllo lavorerebbe sulla fotografia del primo disegno e
  // rimetterebbe indietro quello che l'utente ha appena spuntato.
  const ultimo = useRef(value);
  ultimo.current = value;

  // Il riempimento automatico del browser scrive nei campi senza avvisare React.
  // Poco dopo l'apertura del passo si guarda cosa c'è scritto davvero e lo si
  // porta dentro, così i valori finiscono anche nella bozza salvata.
  useEffect(() => {
    const nodo = box.current;
    if (!nodo) return;
    const campi = () => [...nodo.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]")].filter((el) => el.name && el.type !== "checkbox");

    // Dalla bozza ai campi: se il modulo era stato lasciato a metà, i valori
    // salvati tornano dentro i campi vuoti.
    for (const el of campi()) {
      const salvato = (ultimo.current[el.name] ?? "").trim();
      if (salvato && !el.value.trim()) el.value = salvato;
    }

    // Dai campi allo stato: prende quello che ha scritto il browser da solo,
    // partendo sempre dallo stato corrente e senza toccare il resto.
    const leggi = () => {
      const adesso = ultimo.current;
      const aggiunte: Contact = {};
      for (const el of campi()) {
        const v = el.value.trim();
        if (v && !(adesso[el.name] ?? "").trim()) aggiunte[el.name] = v;
      }
      if (Object.keys(aggiunte).length) onChange({ ...adesso, ...aggiunte });
    };
    const timer = window.setInterval(leggi, 700);
    return () => window.clearInterval(timer);
    // Si guarda all'apertura del passo: dopo bastano gli eventi normali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={box} className="grid gap-4 sm:grid-cols-2">
      {config.fields.map((f) => {
        const err = errors[f.key];
        const border = err ? "border-brand" : "border-line";
        const wide = f.type === "textarea";
        return (
          <label key={f.key} className={cn("block", wide && "sm:col-span-2")}>
            <span className="t-meta mb-1.5 block text-ink">
              {f.label}
              {f.required && <span aria-hidden> *</span>}
            </span>
            {f.type === "textarea" ? (
              <textarea name={f.key} className={cn(FIELD, border, "min-h-28")} placeholder={f.placeholder} defaultValue={value[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            ) : f.type === "tel" ? (
              // Prefisso e numero stanno dentro una cornice sola: sono un campo
              // unico, e il prefisso occupa il minimo indispensabile.
              <span className={cn("flex items-stretch overflow-hidden rounded-slot border-[1.5px] bg-canvas focus-within:border-action focus-within:ring-3 focus-within:ring-action/25", border)}>
                <select
                  name={`${f.key}_prefisso`}
                  aria-label="Prefisso internazionale"
                  autoComplete="tel-country-code"
                  className="w-[5.5rem] shrink-0 border-0 bg-transparent py-3 pl-3 pr-1 text-[15px] text-ink outline-none"
                  defaultValue={value[`${f.key}_prefisso`] ?? PHONE_PREFIX_DEFAULT}
                  onChange={(e) => set(`${f.key}_prefisso`, e.target.value)}
                >
                  {PHONE_PREFIXES.map((p) => (
                    <option key={`${p.code}-${p.label}`} value={p.code}>
                      {p.flag} {p.code}
                    </option>
                  ))}
                </select>
                <span aria-hidden className="my-2 w-px shrink-0 bg-line" />
                <input
                  name={f.key}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-[15px] text-ink outline-none placeholder:text-ink-3"
                  placeholder={f.placeholder || "333 1234567"}
                  defaultValue={value[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </span>
            ) : (
              <input
                name={f.key}
                type={f.type === "email" ? "email" : "text"}
                inputMode={f.type === "email" ? "email" : "text"}
                autoComplete={f.type === "email" ? "email" : f.type === "company" ? "organization" : "name"}
                className={cn(FIELD, border)}
                placeholder={f.placeholder}
                defaultValue={value[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
            {f.hint && !err && <span className="t-meta mt-1 block text-ink-3">{f.hint}</span>}
            {err && <span className="mt-1 block text-sm font-semibold text-brand">{err}</span>}
          </label>
        );
      })}

      {/* Honeypot: invisibile agli umani, i bot lo compilano. */}
      <label className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden" aria-hidden tabIndex={-1}>
        Sito web
        <input type="text" name="hp" autoComplete="off" tabIndex={-1} defaultValue={value.hp ?? ""} onChange={(e) => set("hp", e.target.value)} />
      </label>

      <label className="flex items-start gap-3 sm:col-span-2">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-action)]" checked={value.consenso === "1"} onChange={(e) => set("consenso", e.target.checked ? "1" : "")} />
        <span className="t-body text-ink-2">
          {config.consentText}{" "}
          <Link href="/privacy/" target="_blank" className="font-semibold text-action underline">
            Informativa privacy
          </Link>
        </span>
      </label>
      {errors.consenso && <p className="text-sm font-semibold text-brand sm:col-span-2">{errors.consenso}</p>}
    </div>
  );
}
