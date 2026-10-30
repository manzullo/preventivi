// Richiesta preventivo: form multi-step (lead engine). Precompila servizio,
// città e professionista dai parametri della pagina di partenza e salta i passi
// già risposti. Resta fuori dall'indice: è una pagina di conversione.

import type { Metadata } from "next";
import Link from "next/link";
import { Kicker } from "@/design/ui";
import { CTA_MICRO, HOW_IT_WORKS, PROMISE } from "@/lib/cta";
import { db } from "@/lib/db";
import { paths } from "@/lib/site";
import { pagineEsistenti } from "@/modules/directory/pages";
import { pageMeta } from "@/modules/directory/seo";
import { FormEngine } from "@/modules/leadforms/engine/FormEngine";
import { cookies } from "next/headers";
import { DEFAULT_FORM_SLUG, ensureDefaultForm, getPublicForm, pickVariantSlug } from "@/modules/leadforms/forms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMeta({
  title: "Chiedi un preventivo",
  description: "Racconta cosa ti serve: selezioniamo i professionisti adatti e ti mettiamo in contatto.",
  path: paths.quote(),
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function QuotePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const bucketRaw = (await cookies()).get("ma_ab")?.value;
  const bucket = bucketRaw !== undefined ? Number(bucketRaw) : null;
  const requested = first(sp.form) || DEFAULT_FORM_SLUG;
  let form = await getPublicForm(await pickVariantSlug(requested, bucket));
  if (!form && requested === DEFAULT_FORM_SLUG) {
    await ensureDefaultForm();
    form = await getPublicForm(DEFAULT_FORM_SLUG);
  }

  const [service, city, agency] = await Promise.all([
    first(sp.servizio) ? db.service.findUnique({ where: { slug: first(sp.servizio)! } }) : null,
    first(sp.citta) ? db.city.findUnique({ where: { slug: first(sp.citta)! } }) : null,
    first(sp.professionista) ? db.agency.findUnique({ where: { slug: first(sp.professionista)! }, select: { slug: true, name: true } }) : null,
  ]);

  // "Torna alla classifica" solo se la classifica esiste davvero: la pagina
  // servizio × città sotto PUBLISH_THRESHOLD non viene generata.
  const paio = service && city ? paths.serviceCity(service.slug, city.slug) : null;
  const classificaHref = paio && (await pagineEsistenti([paio])).has(paio) ? paio : null;
  const prefilled: Record<string, string> = {};
  if (service) prefilled.servizio = service.slug;
  if (city) prefilled.citta = city.slug;
  if (agency) prefilled.professionista = agency.slug;
  // Il lavoro preciso arriva dalle pagine "Riparazione caldaia a Roma": il
  // passo "che lavoro" si salta, come il servizio. Testo libero, solo accorciato.
  const lavoro = first(sp.lavoro)?.trim().slice(0, 80);
  if (lavoro && service) prefilled.lavoro = lavoro;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1fr_360px]">
      <div>
        <ul className="t-meta mb-4 flex flex-wrap gap-x-4 gap-y-1" aria-label="Garanzie">
          {[...CTA_MICRO.split(" · "), PROMISE.replace(/\.$/, ""), "fino a 3 preventivi con un solo modulo"].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-pill bg-ok" />
              {t}
            </li>
          ))}
        </ul>
        {form ? <FormEngine form={form} prefilled={prefilled} /> : <p className="t-body">Modulo non disponibile.</p>}
      </div>
      <aside className="md:pt-2">
        <Kicker className="mb-2">Come funziona</Kicker>
        <ol className="t-body space-y-3 text-ink-2">
          {HOW_IT_WORKS.map(([t, d], i) => (
            <li key={t}>
              <strong className="text-ink">
                {i + 1}. {t}.
              </strong>{" "}
              {d}
            </li>
          ))}
        </ol>
        <p className="t-meta mt-4">Chi risponde: fino a 3 professionisti, scelte per recensioni. {PROMISE}</p>
        {(service || city || agency) && (
          <div className="mt-8 rounded-card border border-line bg-surface p-5">
            <p className="t-kicker mb-2">Richiesta per</p>
            {agency && <p className="t-title">{agency.name}</p>}
            {prefilled.lavoro && <p className="t-title">{prefilled.lavoro}</p>}
            {(service || city) && (
              <p className="t-body text-ink-2">{[service?.plural, city?.name].filter(Boolean).join(" a ")}</p>
            )}
            {classificaHref && (
              <Link href={classificaHref} className="t-meta mt-2 inline-block font-bold text-action">
                Torna alla classifica →
              </Link>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
