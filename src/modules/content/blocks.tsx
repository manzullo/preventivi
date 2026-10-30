// Shortcode negli articoli: i risultati non si scrivono a mano, si interrogano.
// Sintassi come nei plugin PartySpot: [nome attributo="valore"].
//   [professionisti servizio="seo" citta="roma" numero="5"]  griglia di schede vere
//   [classifica servizio="seo" citta="roma" numero="10"]  tabella numerata
//   [numeri servizio="seo" citta="roma"]  quanti professionisti, recensioni, budget mediano
//   [faq servizio="seo" citta="roma"]  domande e risposte dai dati
//   [preventivi]  riquadro per il modulo multi-preventivo
//   [link servizio="seo" citta="roma" testo="professionisti SEO a Roma"]  link interno
//   [citta servizio="agenzie-seo" numero="12"]  le città dove esiste la pagina
import Link from "next/link";
import { AgencyCard } from "@/components/AgencyCard";
import { QuoteBox } from "@/components/QuoteCta";
import { Chip, Rating } from "@/design/ui";
import { db } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { fmt, paths } from "@/lib/site";
import { cityScopeIds, listAgencies } from "@/modules/directory/listing";
import { listingFaq } from "@/modules/directory/listingFaq";
import { pagineEsistenti, publishedPages } from "@/modules/directory/pages";
import { budgetStats } from "@/modules/directory/proof";

const NAMES = ["professionisti", "classifica", "citta", "numeri", "faq", "preventivi", "link"] as const;
// [dato tipo="professionisti"] si risolve dentro il testo, prima del markdown.
const RE_DATO = /\[dato((?:\s+[a-z]+="[^"]*")*)\s*\]/g;
type Name = (typeof NAMES)[number];
type Block = { kind: "md"; text: string } | { kind: "code"; name: Name; attrs: Record<string, string> };

const RE = new RegExp(`\\[(${NAMES.join("|")})((?:\\s+[a-z]+="[^"]*")*)\\s*\\]`, "g");

/** Spezza il corpo dell'articolo in testo e shortcode. */
export function parseBlocks(body: string): Block[] {
  const out: Block[] = [];
  let last = 0;
  for (const m of body.matchAll(RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "md", text: body.slice(last, start) });
    const attrs: Record<string, string> = {};
    for (const a of (m[2] ?? "").matchAll(/([a-z]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    out.push({ kind: "code", name: m[1] as Name, attrs });
    last = start + m[0].length;
  }
  if (last < body.length) out.push({ kind: "md", text: body.slice(last) });
  return out;
}

async function scope(attrs: Record<string, string>) {
  const serviceSlug = attrs.servizio || undefined;
  const service = serviceSlug ? await db.service.findUnique({ where: { slug: serviceSlug }, select: { name: true, plural: true, slug: true, singular: true, gender: true } }) : null;
  const city = attrs.citta ? await db.city.findUnique({ where: { slug: attrs.citta }, select: { id: true, slug: true, name: true, isCapital: true } }) : null;
  const cityIds = city ? await cityScopeIds(city) : undefined;
  return { serviceSlug: service?.slug, service, city, cityIds };
}

const titolo = (service: { plural: string } | null, city: { name: string } | null) =>
  `${service?.plural ?? "Professionisti"}${city ? ` a ${city.name}` : " in Italia"}`;

// Il link scende di un livello quando la pagina servizio × città non esiste:
// sotto PUBLISH_THRESHOLD non viene generata, e un blocco scritto in redazione
// manderebbe il lettore su un 404.
const listingHref = async (serviceSlug?: string, citySlug?: string) => {
  if (serviceSlug && citySlug) {
    const paio = paths.serviceCity(serviceSlug, citySlug);
    return (await pagineEsistenti([paio])).has(paio) ? paio : paths.service(serviceSlug);
  }
  return serviceSlug ? paths.service(serviceSlug) : citySlug ? paths.city(citySlug) : paths.home();
};

async function Agenzie({ attrs }: { attrs: Record<string, string> }) {
  const { serviceSlug, service, city, cityIds } = await scope(attrs);
  const take = Math.min(Math.max(Number(attrs.numero || 3), 1), 12);
  const { items, total } = await listAgencies({ serviceSlug, cityIds, pageSize: take, page: 1 });
  if (!items.length) return null;
  const href = await listingHref(serviceSlug, city?.slug);
  return (
    <section className="not-prose my-10">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="t-h3">{titolo(service, city)}</h3>
        <Link href={href} className="t-meta text-action hover:underline">
          Vedi tutte le {fmt(total)} →
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((a, i) => (
          <AgencyCard key={a.id} agency={a} position={i + 1} />
        ))}
      </div>
    </section>
  );
}

/**
 * Le città in cui quel servizio ha una pagina pubblicata, con quanti professionisti
 * ci sono. In fondo a un articolo è il pezzo che porta chi legge dove si
 * sceglie: l'articolo spiega, l'elenco per città fa arrivare le richieste.
 * Senza "servizio" elenca le città più grandi della directory.
 */
async function Citta({ attrs }: { attrs: Record<string, string> }) {
  const take = Math.min(Math.max(Number(attrs.numero || 12), 1), 30);
  const s = attrs.servizio ? await db.service.findUnique({ where: { slug: attrs.servizio }, select: { id: true, plural: true } }) : null;
  const pagine = await publishedPages(s ? { kind: "service_city", serviceId: s.id, take } : { kind: "city", take });
  if (!pagine.length) return null;
  return (
    <section className="not-prose my-10">
      <h3 className="t-h3 mb-1">{s ? `${s.plural} città per città` : "I professionisti città per città"}</h3>
      <p className="t-meta mb-4">Ogni città ha il suo elenco, ordinato per recensioni pubbliche.</p>
      <div className="flex flex-wrap gap-2">
        {pagine.map((p) => (
          <Chip key={p.path} href={p.path} count={p.resultCount}>
            {p.city?.name}
          </Chip>
        ))}
      </div>
    </section>
  );
}

async function Classifica({ attrs }: { attrs: Record<string, string> }) {
  const { serviceSlug, service, city, cityIds } = await scope(attrs);
  const take = Math.min(Math.max(Number(attrs.numero || 10), 1), 25);
  const { items } = await listAgencies({ serviceSlug, cityIds, pageSize: take, page: 1 });
  if (!items.length) return null;
  return (
    <section className="not-prose my-10 overflow-x-auto">
      <h3 className="t-h3 mb-4">{titolo(service, city)}: la classifica di oggi</h3>
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <thead>
          <tr className="t-meta border-b border-line text-ink">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Professionista</th>
            <th className="py-2 pr-3">Città</th>
            <th className="py-2">Recensioni</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a, i) => (
            <tr key={a.id} className="border-b border-line/70">
              <td className="py-2.5 pr-3 font-semibold text-ink-2">{i + 1}</td>
              <td className="py-2.5 pr-3">
                <Link href={paths.agency(a.slug)} className="font-semibold text-ink hover:text-action">
                  {a.name}
                </Link>
              </td>
              <td className="t-meta py-2.5 pr-3">{a.city?.name ?? "—"}</td>
              <td className="py-2.5">
                <Rating value={a.rating} count={a.reviewCount} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="t-meta mt-3">Ordine da recensioni pubbliche e completezza della scheda. Le schede in evidenza sono segnalate.</p>
    </section>
  );
}

async function Numeri({ attrs }: { attrs: Record<string, string> }) {
  const { serviceSlug, service, city, cityIds } = await scope(attrs);
  const { items, total } = await listAgencies({ serviceSlug, cityIds, pageSize: 100, page: 1 });
  if (!total) return null;
  const recensioni = items.reduce((n, a) => n + (a.reviewCount ?? 0), 0);
  const budget = await budgetStats({ published: true, ...(cityIds ? { cityId: { in: cityIds } } : {}), ...(serviceSlug ? { services: { some: { service: { slug: serviceSlug } } } } : {}) });
  const dati = [
    { k: "Professionisti in elenco", v: fmt(total) },
    { k: "Recensioni pubbliche", v: fmt(recensioni) },
    { k: "Prezzi da (mediana)", v: budget.median ? `${fmt(budget.median)} €` : "—" },
  ];
  return (
    <section className="not-prose my-8 grid gap-3 sm:grid-cols-3">
      {dati.map((d) => (
        <div key={d.k} className="rounded-card border border-line bg-surface p-4">
          <p className="t-h3">{d.v}</p>
          <p className="t-meta mt-1">
            {d.k} · {titolo(service, city)}
          </p>
        </div>
      ))}
    </section>
  );
}

async function Faq({ attrs }: { attrs: Record<string, string> }) {
  const { serviceSlug, service, city, cityIds } = await scope(attrs);
  const { items, total } = await listAgencies({ serviceSlug, cityIds, pageSize: 100, page: 1 });
  const budget = await budgetStats({ published: true, ...(cityIds ? { cityId: { in: cityIds } } : {}), ...(serviceSlug ? { services: { some: { service: { slug: serviceSlug } } } } : {}) });
  const faq = listingFaq({
    servicePlural: service?.plural,
    serviceName: service?.name,
    serviceSingular: service?.singular, serviceGender: service?.gender,
    cityName: city?.name,
    total,
    reviewCount: items.reduce((n, a) => n + (a.reviewCount ?? 0), 0),
    budgetMedian: budget.median,
    budgetSamples: budget.samples,
  });
  return (
    <section className="not-prose my-10">
      <h3 className="t-h3 mb-4">Domande frequenti</h3>
      <dl className="divide-y divide-line border-y border-line">
        {faq.map((f) => (
          <div key={f.q} className="py-4">
            <dt className="font-semibold text-ink">{f.q}</dt>
            <dd className="t-body mt-1 text-ink-2">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

async function LinkInterno({ attrs }: { attrs: Record<string, string> }) {
  const { serviceSlug, service, city } = await scope(attrs);
  const href = await listingHref(serviceSlug, city?.slug);
  return (
    <p className="my-4">
      <Link href={href} className="font-semibold text-action hover:underline">
        {attrs.testo || titolo(service, city)}
      </Link>
    </p>
  );
}

/** Sostituisce i [dato ...] con il numero aggiornato, dentro la frase. */
async function risolviDati(testo: string): Promise<string> {
  const trovati = [...testo.matchAll(RE_DATO)];
  if (!trovati.length) return testo;
  let out = testo;
  for (const m of trovati) {
    const attrs: Record<string, string> = {};
    for (const a of (m[1] ?? "").matchAll(/([a-z]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const { serviceSlug, cityIds } = await scope(attrs);
    const where = {
      published: true,
      ...(cityIds ? { cityId: { in: cityIds } } : {}),
      ...(serviceSlug ? { services: { some: { service: { slug: serviceSlug } } } } : {}),
    };
    let valore = "";
    if (attrs.tipo === "recensioni") {
      const r = await db.review.count({ where: { agency: where } });
      valore = fmt(r);
    } else if (attrs.tipo === "citta") {
      valore = fmt(await db.city.count({ where: { agencies: { some: { published: true } } } }));
    } else if (attrs.tipo === "budget") {
      const b = await budgetStats(where);
      valore = b.median ? `${fmt(b.median)} €` : "non disponibile";
    } else {
      valore = fmt(await db.agency.count({ where }));
    }
    out = out.replace(m[0], valore);
  }
  return out;
}

/** Corpo dell'articolo: markdown più blocchi che leggono il database. */
export async function ArticleBody({ body }: { body: string }) {
  const blocks = parseBlocks(await risolviDati(body));
  return (
    <div className="prose-basic t-body mt-8">
      {await Promise.all(
        blocks.map(async (b, i) => {
          if (b.kind === "md") return <div key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(b.text) }} />;
          if (b.name === "preventivi") return <div key={i} className="not-prose my-10"><QuoteBox href={paths.quote()} position="mid" /></div>;
          if (b.name === "professionisti") return <Agenzie key={i} attrs={b.attrs} />;
          if (b.name === "classifica") return <Classifica key={i} attrs={b.attrs} />;
          if (b.name === "citta") return <Citta key={i} attrs={b.attrs} />;
          if (b.name === "numeri") return <Numeri key={i} attrs={b.attrs} />;
          if (b.name === "faq") return <Faq key={i} attrs={b.attrs} />;
          return <LinkInterno key={i} attrs={b.attrs} />;
        }),
      )}
    </div>
  );
}
