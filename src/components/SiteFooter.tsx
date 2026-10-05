import Link from "next/link";
import { Marchio } from "./SiteHeader";
import { db } from "@/lib/db";
import { CURRENT_YEAR, SITE_NAME, paths } from "@/lib/site";

// Footer-sitemap: cinque blocchi di link alle pagine pubblicate, come la
// home di guidalocation. Legge le LandingPage, quindi non linka mai un 404.

type Item = { href: string; label: string };

function Block({ title, items }: { title: string; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="t-kicker mb-3 text-ink-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="t-meta text-ink hover:text-action">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function SiteFooter() {
  const pages = await db.landingPage.findMany({
    where: { published: true, kind: { in: ["service", "city", "region", "comparison", "alternative"] } },
    select: {
      path: true,
      kind: true,
      resultCount: true,
      service: { select: { plural: true } },
      city: { select: { name: true } },
      competitor: { select: { name: true } },
    },
    orderBy: [{ resultCount: "desc" }, { path: "asc" }],
  });

  const posts = await db.page.count({ where: { kind: "blog", published: true } });
  const regionNames = new Map(
    (await db.region.findMany({ select: { slug: true, name: true } })).map((r) => [paths.region(r.slug), r.name]),
  );

  const pick = (kind: string, take: number, label: (p: (typeof pages)[number]) => string): Item[] =>
    pages
      .filter((p) => p.kind === kind)
      .slice(0, take)
      .map((p) => ({ href: p.path, label: label(p) }));

  const services = pick("service", 12, (p) => p.service?.plural ?? p.path);
  const cities = pick("city", 12, (p) => p.city?.name ?? p.path);
  const regions = pick("region", 20, (p) => regionNames.get(p.path) ?? p.path);
  const comparisons = pick("comparison", 8, (p) => `Migliori ${p.service?.plural.toLowerCase() ?? ""}`);
  const alternatives = pick("alternative", 8, (p) => `Alternative a ${p.competitor?.name ?? ""}`);

  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <Block title="Servizi" items={services} />
          <Block title="Città" items={cities} />
          <Block title="Regioni" items={regions} />
          <Block title="Classifiche" items={comparisons} />
          <Block title="Alternative" items={alternatives} />
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <div>
            <Marchio testo="text-lg" icona="size-6" />
            <p className="t-meta mt-1">
              Classifica per recensioni. Le schede in evidenza portano l'etichetta.
            </p>
          </div>
          <nav className="t-meta flex flex-wrap gap-5">
            <Link href={paths.methodology()} className="hover:text-action">
              Metodologia
            </Link>
            <Link href={paths.quote()} className="hover:text-action">
              Chiedi un preventivo
            </Link>
            <Link href="/cerca/" className="hover:text-action">
              Cerca per nome
            </Link>
            <Link href="/recensioni/" className="hover:text-action">
              Recensioni
            </Link>
            <Link href="/mappa/" className="hover:text-action">
              Mappa
            </Link>
            <Link href="/per-agenzie/" className="hover:text-action">
              Per i professionisti
            </Link>
            <Link href="/candidatura/" className="hover:text-action">
              Candida la tua attività
            </Link>
            <Link href="/rivendica/" className="hover:text-action">
              Rivendica la scheda
            </Link>
            <Link href="/chi-siamo/" className="hover:text-action">
              Chi siamo
            </Link>
            {posts > 0 && (
              <Link href="/blog/" className="hover:text-action">
                Blog
              </Link>
            )}
          </nav>
        </div>
        <p className="t-meta mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-3">
          <span>
            © {CURRENT_YEAR} {SITE_NAME}
          </span>
          <Link href="/privacy/" className="hover:text-action">
            Privacy
          </Link>
          <Link href="/cookie/" className="hover:text-action">
            Cookie
          </Link>
        </p>
      </div>
    </footer>
  );
}
