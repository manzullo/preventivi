import Link from "next/link";
import { ownerLogout } from "./actions";

// Barra dell'area: poche voci, sempre le stesse.
export function AreaNav({ attiva, nome, slug }: { attiva: "scheda" | "richieste" | "numeri"; nome: string; slug: string }) {
  const voci = [
    { k: "scheda", href: "/area/scheda/", label: "La scheda" },
    { k: "richieste", href: "/area/richieste/", label: "Richieste" },
    { k: "numeri", href: "/area/statistiche/", label: "Numeri" },
  ] as const;
  return (
    <div className="mb-8 border-b border-line pb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="t-kicker">Area professionista</p>
          <h1 className="t-h2 mt-1">{nome}</h1>
        </div>
        <div className="t-meta flex items-center gap-4">
          <Link href={`/agenzia/${slug}/`} className="text-ink hover:text-action">Vedi la scheda pubblica ↗</Link>
          <form action={ownerLogout}>
            <button type="submit" className="text-ink-3 hover:text-ink">Esci</button>
          </form>
        </div>
      </div>
      <nav className="mt-4 flex gap-2">
        {voci.map((v) => (
          <Link
            key={v.k}
            href={v.href}
            className={`rounded-pill px-4 py-2 text-sm font-semibold ${attiva === v.k ? "bg-tonal text-action" : "text-ink hover:bg-surface"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
