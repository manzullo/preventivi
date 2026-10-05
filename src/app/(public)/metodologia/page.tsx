import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Kicker } from "@/design/ui";
import { paths } from "@/lib/site";
import { pageMeta } from "@/modules/directory/seo";
import { CONFIDENCE_M, DECAY_FLOOR, HALF_LIFE_MONTHS } from "@/modules/ranking/score";

export const metadata: Metadata = pageMeta({
  title: "Metodologia: come calcoliamo la classifica",
  description:
    "La formula del punteggio, le fonti delle recensioni e la regola che vale per tutti: nessun professionista paga per la posizione.",
  path: paths.methodology(),
});

const UPDATED = "2026-09-09";

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Metodologia", href: paths.methodology() }]} />
      <Kicker className="mb-2">Aggiornata il {UPDATED}</Kicker>
      <h1 className="t-h1">Come calcoliamo la classifica</h1>
      <div className="prose-basic t-body mt-6 max-w-3xl">
        <p>
          Ogni professionista in directory ha un punteggio calcolato solo dalle recensioni: quel numero non
          si compra e non si sposta a mano. Sopra il punteggio c&apos;è una sola eccezione, dichiarata:
          alcune schede possono comparire in cima perché lo abbiamo deciso noi, e in quel caso portano
          l&apos;etichetta &quot;In evidenza&quot;. Se la formula cambia, cambia anche questa pagina, con la data.
        </p>

        <h2>Due corsie, e si vede quale</h2>
        <p>
          La corsia normale è il punteggio delle recensioni: lì dentro nessuno può salire pagando, e
          un&apos;professionista che rivendica la scheda può correggere i dati ma non l&apos;ordine.
        </p>
        <p>
          La seconda corsia sta davanti all&apos;elenco: alcune professionisti pagano per stare lì, altre ce le
          mettiamo noi per scelta editoriale, sempre per un periodo. Chi è in quella corsia porta
          l&apos;etichetta &quot;In evidenza&quot; al posto del numero di posizione, e fra loro l&apos;ordine lo decidono
          la priorità concordata e, a parità di priorità, di nuovo le recensioni.
        </p>
        <p>
          Quello che il pagamento non fa: non aggiunge un decimo di punteggio, né a chi paga né a
          scapito degli altri. Sotto la corsia in evidenza l&apos;elenco è quello di sempre, ordinato per
          recensioni, e gli stessi professionisti restano dove il loro punteggio le mette.
        </p>

        <h2>La formula</h2>
        <p>
          Usiamo una media bayesiana: la media del professionista pesa in proporzione al numero di
          recensioni, il resto lo copre la media di tutti i professionisti. Poche recensioni alte non
          bastano per superare chi ne ha molte.
        </p>
        <p>
          <code>score = [ v/(v+m) · R + m/(v+m) · C ] · decay</code>
        </p>
        <ul>
          <li>
            <code>v</code>: numero di recensioni del professionista
          </li>
          <li>
            <code>R</code>: media delle sue recensioni (da 1 a 5)
          </li>
          <li>
            <code>C</code>: media di tutte le recensioni in directory
          </li>
          <li>
            <code>m</code>: soglia di confidenza, oggi <code>{CONFIDENCE_M}</code>
          </li>
          <li>
            <code>decay</code>: <code>0,5^(mesi dall'ultima recensione / {HALF_LIFE_MONTHS})</code>, con un
            minimo di <code>{DECAY_FLOOR}</code>. Un professionista ferma da due anni pesa la metà. Una recensione importata senza data vale dal giorno in cui l'abbiamo letta dalla fonte.
          </li>
        </ul>
        <p>A parità di punteggio conta il numero di recensioni, poi l'ordine alfabetico.</p>

        <h2>Da dove vengono le recensioni</h2>
        <p>
          Da fonti pubbliche, riportate con attribuzione e link all'originale, oppure da clienti che
          hanno usato il modulo di richiesta preventivo su questo sito. Entrano nel punteggio anche i
          rating aggregati di fonti esterne con licenza o accordo scritto (oggi Pick an Agency, dati
          con licenza CC BY 4.0 e link al profilo; in seguito Sortlist e Google): ogni scheda dice
          quante recensioni ha e dove stanno. Non pubblichiamo recensioni senza fonte e non le
          riscriviamo.
        </p>

        <h2>Quando una pagina esiste</h2>
        <p>
          Una pagina per servizio e città viene pubblicata solo se ha almeno tre professionisti. Sotto
          quella soglia la pagina non esiste: preferiamo un elenco corto e vero a uno lungo e vuoto.
        </p>

        <h2>Se qualcosa è sbagliato</h2>
        <p>
          Un professionista classificato male, un dato errato, una recensione che non torna: la scheda ha un
          comando per rivendicarla e correggerla. Ogni correzione viene registrata.
        </p>
      </div>
    </div>
  );
}
