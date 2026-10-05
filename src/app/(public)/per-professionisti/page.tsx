import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button, Kicker } from "@/design/ui";
import { db } from "@/lib/db";
import { MAX_QUOTES } from "@/lib/cta";
import { fmt } from "@/lib/site";
import { faqJsonLd } from "@/modules/directory/faq";
import { JsonLd } from "@/components/JsonLd";
import { pageMeta } from "@/modules/directory/seo";

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: "Per i professionisti: richieste dirette, nessuna commissione",
  description: "Come funziona Mister Wolf per professionisti e aziende: iscrizione gratuita, ordine basato solo sulle recensioni, richieste dei clienti inoltrate in chiaro.",
  path: "/per-agenzie/",
});

const faq = [
  { q: "Quanto costa comparire in elenco?", a: "Niente. La scheda è gratuita e resta gratuita. Non vendiamo posizioni, badge di prima fila o pacchetti di visibilità." },
  { q: "Posso pagare per stare più in alto?", a: "No. L'ordine dipende da media delle recensioni, numero di recensioni e completezza della scheda. È l'unica regola, ed è scritta nella metodologia." },
  { q: "Come arrivano le richieste?", a: `Chi cerca compila un modulo con progetto, città e budget. Selezioniamo fino a ${MAX_QUOTES} professionisti adatti e mandiamo la richiesta via email. Se accetti, vedi i contatti del cliente e gli scrivi direttamente.` },
  { q: "Devo pagare per una richiesta?", a: "Oggi no: stiamo costruendo il flusso e le richieste vengono inoltrate senza costi. Quando introdurremo un prezzo per contatto lo scriveremo qui prima, senza cambiare le regole della classifica." },
  { q: "Come verificate chi rivendica una scheda?", a: "In due passi. Prima confermi un indirizzo email sul dominio del professionista, poi controlliamo a mano che tu la gestisca davvero: di solito una telefonata al numero pubblico della scheda o un riscontro verificabile. Solo dopo l'approvazione la scheda diventa verificata e si apre l'area professionista. L'email da sola non basta: chiunque abbia una casella sul dominio potrebbe prendersi la scheda." },
  { q: "Da dove prendete i dati della mia scheda?", a: "Da fonti pubbliche: il vostro sito, portali di settore che ne consentono l'uso e le schede Google. Ogni recensione mostra la fonte con il link all'originale. Se un dato è sbagliato, rivendica la scheda e correggilo." },
  { q: "Voglio essere tolto dall'elenco.", a: "Scrivici dalla pagina contatti con un indirizzo del dominio del professionista: togliamo la scheda senza discussioni." },
];

export default async function PerAgenzie() {
  const [professionisti, recensioni, citta] = await Promise.all([
    db.agency.count({ where: { published: true } }),
    db.review.count(),
    db.city.count({ where: { agencies: { some: { published: true } } } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Per i professionisti", href: "/per-agenzie/" }]} />
      <JsonLd data={faqJsonLd(faq)} />

      <Kicker className="mt-4">Per professionisti e aziende</Kicker>
      <h1 className="t-h1 mt-2">Le richieste arrivano a te, non a un intermediario</h1>
      <p className="t-lead mt-3">
        Siamo una directory italiana di professionisti: {fmt(professionisti)} schede in {fmt(citta)} città, ordinate con {fmt(recensioni)} recensioni
        pubbliche verificabili. Il punteggio non si compra: si può comprare solo una posizione in evidenza,
        che il lettore riconosce dall'etichetta.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { t: "Scheda gratuita", d: "Servizi, competenze, contatti, recensioni con la fonte. Nessun costo di ingresso." },
          { t: "Ordine solo da recensioni", d: "Media, numero di recensioni e completezza. Nessun posto comprabile." },
          { t: "Contatto diretto", d: `Il cliente descrive il lavoro, noi giriamo la richiesta a ${MAX_QUOTES} professionisti. Poi parlate voi.` },
        ].map((c) => (
          <div key={c.t} className="rounded-card border border-line bg-surface p-5">
            <p className="font-semibold text-ink">{c.t}</p>
            <p className="t-body mt-1 text-ink-2">{c.d}</p>
          </div>
        ))}
      </div>

      <h2 className="t-h2 mt-12">Come si entra</h2>
      <ol className="mt-4 space-y-3">
        {[
          <>Se sei già in elenco, <Link href="/rivendica/" className="font-semibold text-action hover:underline">rivendica la scheda</Link> con un&apos;email sul dominio dell&apos;professionista.</>,
          <>Se non ci sei, <Link href="/candidatura/" className="font-semibold text-action hover:underline">candida l&apos;professionista</Link>: chiediamo sito, città, servizi e due referenze verificabili.</>,
          <>Completa la scheda: più è completa, più sale nella classifica (la completezza pesa nel punteggio).</>,
          <>Ricevi le richieste via email. Accetti o rifiuti in un click; i contatti del cliente li vedi solo se accetti.</>,
        ].map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="t-meta mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-tonal font-semibold text-action">{i + 1}</span>
            <span className="t-body text-ink-2">{t}</span>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button href="/candidatura/" arrow>Aggiungi la tua attività</Button>
        <Link href="/rivendica/" className="rounded-pill border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink/25 hover:text-action">
          Rivendica una scheda esistente
        </Link>
      </div>

      <h2 className="t-h2 mt-12">Domande frequenti</h2>
      <dl className="mt-4 divide-y divide-line border-y border-line">
        {faq.map((f) => (
          <div key={f.q} className="py-4">
            <dt className="font-semibold text-ink">{f.q}</dt>
            <dd className="t-body mt-1 text-ink-2">{f.a}</dd>
          </div>
        ))}
      </dl>

      <p className="t-meta mt-8">
        Il criterio con cui ordiniamo i professionisti è pubblico: <Link href="/metodologia/" className="text-action hover:underline">leggi la metodologia</Link>.
      </p>
    </div>
  );
}
