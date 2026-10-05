import Link from "next/link";
import { SegnaInterno } from "@/components/admin/SegnaInterno";
import { Marchio } from "@/components/SiteHeader";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/admin/actions";

// Il menu in due blocchi: prima quello che si fa ogni giorno, in fondo quello
// che si guarda ogni tanto. Le pagine di misura stavano in mezzo alle altre e
// spezzavano il lavoro.
const NAV = [
  { href: "/admin/", label: "Dashboard" },
  { href: "/admin/lead/", label: "Lead" },
  { href: "/admin/agenzie/", label: "Professionisti" },
  { href: "/admin/priorita/", label: "Priorità" },
  { href: "/admin/tassonomie/", label: "Servizi" },
  { href: "/admin/candidature/", label: "Candidature" },
  { href: "/admin/rivendicazioni/", label: "Rivendicazioni" },
  { href: "/admin/pagine/", label: "Pagine e blog" },
  { href: "/admin/seo/", label: "SEO pagine" },
  { href: "/admin/form/", label: "Form" },
  { href: "/admin/ads/", label: "Google Ads" },
  { href: "/admin/keywords/", label: "Keyword" },
  { href: "/admin/ai/", label: "AI Assistant" },
  { href: "/admin/utenti/", label: "Utenti" },
  { href: "/admin/impostazioni/", label: "Impostazioni" },
];

const NAV_ANALISI = [
  { href: "/admin/traffico/", label: "Traffico" },
  { href: "/admin/visite/", label: "Visite" },
  { href: "/admin/analytics/", label: "Performance" },
  { href: "/admin/cronologia/", label: "Cronologia" },
  { href: "/admin/connettore/", label: "Connettore AI" },
  { href: "/admin/debug/", label: "Debug" },
];

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-line bg-canvas px-4 py-6">
        <Link href="/admin/">
          <Marchio testo="text-lg" icona="size-6" />
        </Link>
        <p className="t-kicker mt-1 mb-6">Admin</p>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="block rounded-slot px-3 py-2 text-sm font-semibold text-ink hover:bg-surface">
              {n.label}
            </Link>
          ))}
          <SegnaInterno />
          {/* Cartella vera, apribile e richiudibile: il browser se ne ricorda da
              solo finché resti sulla pagina, e non serve una riga di codice. */}
          <details className="mt-5 group" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-slot px-3 py-2 text-sm font-semibold text-ink hover:bg-surface">
              <span className="text-ink-3 transition-transform group-open:rotate-90">›</span>
              Analisi e statistiche
            </summary>
            <div className="mt-1 space-y-1 border-l border-line pl-2">
              {NAV_ANALISI.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="block rounded-slot px-3 py-2 text-sm font-semibold text-ink hover:bg-surface"
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>
        <div className="mt-8 space-y-1 border-t border-line pt-4">
          <Link href="/" className="block rounded-slot px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-surface">
            Vai al sito ↗
          </Link>
          <form action={logout}>
            <button type="submit" className="block w-full rounded-slot px-3 py-2 text-left text-sm font-semibold text-ink-2 hover:bg-surface">
              Esci
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
