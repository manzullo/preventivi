import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { Kicker } from "@/design/ui";
import { db } from "@/lib/db";
import { SITE_NAME, absoluteUrl, fmt } from "@/lib/site";
import { pageMeta } from "@/modules/directory/seo";

export const revalidate = 3600;

export const metadata: Metadata = pageMeta({
  title: "Chi siamo",
  description: "Chi c'è dietro Mister Wolf, come guadagniamo, quali dati usiamo e come li verifichiamo.",
  path: "/chi-siamo/",
});

export default async function ChiSiamo() {
  const [professionisti, recensioni, citta, servizi] = await Promise.all([
    db.agency.count({ where: { published: true } }),
    db.review.count(),
    db.city.count({ where: { agencies: { some: { published: true } } } }),
    db.service.count({ where: { active: true } }),
  ]);
  const aggiornato = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Chi siamo", href: "/chi-siamo/" }]} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": `${absoluteUrl("/")}#organizzazione`,
          name: SITE_NAME,
          url: absoluteUrl("/"),
          description: `Directory italiana di professionisti e aziende: ${professionisti} schede ordinate per recensioni pubbliche.`,
          areaServed: { "@type": "Country", name: "Italia" },
          knowsAbout: ["preventivi", "artigiani", "servizi per la casa", "eventi", "professionisti"],
        }}
      />

      <Kicker className="mt-4">Chi siamo</Kicker>
      <h1 className="t-h1 mt-2">Una directory che non si compra</h1>

      <div className="prose-basic t-body mt-6 text-ink-2">
        <p>
          {SITE_NAME} raccoglie {fmt(professionisti)} professionisti e aziende in {fmt(citta)} città e li ordina
          con {fmt(recensioni)} recensioni pubbliche, ognuna con la fonte e il link all&apos;originale. I servizi coperti sono {fmt(servizi)}.
        </p>
        <p>
          Il progetto nasce da una domanda concreta: chi cerca un&apos;professionista in Italia trova classifiche costruite sugli abbonamenti,
          non sui risultati. Qui l&apos;ordine dipende da media delle recensioni, numero di recensioni e completezza della scheda. Nessuna
          professionista può comprare il punteggio. Può comprare una posizione in evidenza, che in pagina si vede.
        </p>
        <h2>Come guadagniamo</h2>
        <p>
          Le richieste dei clienti vengono girate ai professionisti adatti. In futuro il contatto sarà a pagamento per l&apos;professionista che lo accetta,
          e ci saranno abbonamenti per gestire la scheda con statistiche e badge di verifica. Nessuna di queste cose tocca la classifica:
          se un giorno lo facessimo, questa pagina lo direbbe prima.
        </p>
        <h2>Da dove vengono i dati</h2>
        <p>
          Da fonti pubbliche: i siti dei professionisti, i portali di settore che ne consentono l&apos;uso con attribuzione e le schede Google.
          Ogni valutazione riporta la fonte accanto al numero. I testi delle schede li scriviamo noi a partire dai dati verificabili.
        </p>
        <h2>Correzioni</h2>
        <p>
          Se un dato è sbagliato, l&apos;professionista può <Link href="/rivendica/">rivendicare la scheda</Link> e correggerlo, oppure chiedere la
          rimozione. Il metodo completo di calcolo è in <Link href="/metodologia/">metodologia</Link>.
        </p>
      </div>

      <p className="t-meta mt-8">Pagina aggiornata il {aggiornato}.</p>
    </div>
  );
}
