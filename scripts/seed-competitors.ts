// Concorrenti per le pagine "/alternative-a-{slug}/". Idempotente.

import { db } from "../src/lib/db";

const COMPETITORS = [
  { slug: "prontopro", name: "ProntoPro", website: "https://www.prontopro.it", summary: "Marketplace di professionisti: il cliente descrive il lavoro, i professionisti pagano crediti per inviare un preventivo." },
  { slug: "instapro", name: "Instapro", website: "https://www.instapro.it", summary: "Ex Habitissimo: preventivi per lavori in casa, i professionisti comprano le richieste." },
  { slug: "pagine-gialle", name: "PagineGialle", website: "https://www.paginegialle.it", summary: "Elenco storico delle attività italiane; visibilità a pagamento e schede base gratuite." },
  { slug: "preventivi-it", name: "Preventivi.it", website: "https://www.preventivi.it", summary: "Portale di richiesta preventivi con smistamento delle richieste ai fornitori iscritti." },
  { slug: "starofservice", name: "StarOfService", website: "https://www.starofservice.it", summary: "Marketplace internazionale di servizi locali con richieste vendute ai professionisti." },
  { slug: "houzz", name: "Houzz", website: "https://www.houzz.it", summary: "Community su casa e arredo con elenco di professionisti e profili a pagamento." },
]

async function main() {
  let i = 0;
  for (const c of COMPETITORS) {
    await db.competitor.upsert({
      where: { slug: c.slug },
      create: { ...c, position: i },
      update: { ...c, position: i },
    });
    i++;
  }
  console.log(`concorrenti: ${await db.competitor.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
