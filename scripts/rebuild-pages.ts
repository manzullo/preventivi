// Ricalcola le LandingPage (conteggi e pubblicazione). Da lanciare dopo ogni
// import o cambio di soglia: `npm run pages:rebuild`.

import { db } from "../src/lib/db";
import { rebuildLandingPages } from "../src/modules/directory/pages";

rebuildLandingPages()
  .then((r) => console.log(`landing page: ${r.total} calcolate, ${r.published} pubblicate`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
