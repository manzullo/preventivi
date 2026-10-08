// Allinea il form "preventivo" in DB ai testi di DEFAULT_FORM_STEPS (npm run form:sync).
import { syncDefaultForm } from "../src/modules/leadforms/forms";

syncDefaultForm()
  .then((r) => {
    console.log("aggiornati:", r.updated.join(", ") || "nessuno");
    console.log("creati:", r.created.join(", ") || "nessuno");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
