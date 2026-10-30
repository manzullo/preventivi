// Crea il form di default "preventivo" se manca: `npm run seed:form`.

import { db } from "../src/lib/db";
import { ensureDefaultForm } from "../src/modules/leadforms/forms";

ensureDefaultForm()
  .then((r) => console.log(`form preventivo: ${r.created ? "creato" : "già presente"} (${r.id})`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
