// Ricalcola score/rating/reviewCount di tutte i professionisti: `npm run score`.

import { db } from "../src/lib/db";
import { recalcAllScores } from "../src/modules/ranking/score";

recalcAllScores()
  .then((r) => console.log(`score ricalcolato su ${r.agencies} professionisti (media globale ${r.globalMean})`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
