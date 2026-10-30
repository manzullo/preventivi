// Categorie Google Maps → pertinenza, dalle regex Service.googleMatch (vedi
// scripts/seed-services.ts): al posto dell'elenco a mano di guidaagenzie.
import { db } from "../../src/lib/db";

export async function categorieGoogle() {
  const servizi = await db.service.findMany({ where: { active: true, googleMatch: { not: null } }, select: { slug: true, googleMatch: true } });
  const regole = servizi.flatMap((s) => { try { return [{ slug: s.slug, re: new RegExp(s.googleMatch!, "i") }]; } catch { return []; } });
  return {
    /** Categorie della directory a cui appartiene la categoria Google. */
    servizi: (cat: string) => regole.filter((r) => r.re.test(cat)).map((r) => r.slug),
    /** Vero se la categoria Google non appartiene a nessuna categoria della directory. */
    fuoriTema: (cat: string) => Boolean(cat) && !regole.some((r) => r.re.test(cat)),
  };
}
