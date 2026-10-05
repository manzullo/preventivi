"use client";

// Campo di ricerca per nome professionista con risultati mentre si scrive.
// Separato dalla ricerca "servizio × città" dell'hero: qui si cerca chi si conosce già.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Rating } from "@/design/ui";
import { paths } from "@/lib/site";

type Item = { slug: string; name: string; rating: number | null; reviewCount: number; logoUrl: string | null; city: string | null; services: string[] };

export function SearchByName({ initial = "", destinazione = "scheda" }: { initial?: string; destinazione?: "scheda" | "rivendica" }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(Boolean(initial));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setItems([]); setTotal(0); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/cerca/?q=${encodeURIComponent(q.trim())}`);
        const data = (await r.json()) as { items: Item[]; total: number };
        setItems(data.items);
        setTotal(data.total);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  return (
    <div>
      <form
        onSubmit={(e) => { e.preventDefault(); setTouched(true); router.replace(`${destinazione === "rivendica" ? "/rivendica/" : "/cerca/"}?q=${encodeURIComponent(q.trim())}`); }}
        className="flex items-center gap-2 rounded-pill border border-line bg-canvas px-4 py-2 shadow-card focus-within:border-action"
      >
        <span aria-hidden className="text-ink-3">⌕</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setTouched(true); }}
          placeholder="Nome del professionista o suo sito"
          aria-label="Nome del professionista"
          className="min-h-10 w-full bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); setItems([]); setTotal(0); }} className="t-meta shrink-0 text-ink-3 hover:text-ink">
            pulisci
          </button>
        )}
      </form>

      <div className="mt-6">
        {loading && <p className="t-meta">Cerco…</p>}
        {!loading && touched && q.trim().length >= 2 && items.length === 0 && (
          <div className="rounded-card border border-line bg-surface p-6">
            <p className="t-title">Nessun professionista con questo nome</p>
            <p className="t-body mt-1 text-ink-2">
              Può darsi che non sia ancora in elenco. Puoi <Link href="/candidatura/" className="font-semibold text-action hover:underline">segnalarla o candidarla</Link>, oppure{" "}
              <Link href={paths.quote()} className="font-semibold text-action hover:underline">descrivere il lavoro</Link> e ricevere fino a 3 preventivi da professionisti simili.
            </p>
          </div>
        )}
        {items.length > 0 && (
          <>
            <p className="t-meta mb-3">{total} {total === 1 ? "risultato" : "risultati"}{total > items.length ? `, mostro i primi ${items.length}` : ""}</p>
            <ul className="divide-y divide-line rounded-card border border-line bg-canvas">
              {items.map((a) => (
                <li key={a.slug}>
                  <Link href={destinazione === "rivendica" ? `/rivendica/${a.slug}/` : paths.agency(a.slug)} className="flex items-center gap-4 p-4 hover:bg-surface">
                    {a.logoUrl && <Logo src={a.logoUrl} size={40} className="h-10 w-10 shrink-0 rounded-slot border border-line" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{a.name}</span>
                      <span className="t-meta block truncate">{[a.city, ...a.services].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Rating value={a.rating} count={a.reviewCount} />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
