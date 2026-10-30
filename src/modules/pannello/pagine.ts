// Il titolo delle pagine del sito, per mostrarle nel pannello come le vede
// una persona ("Agenzie SEO a Roma") e non come un percorso ("/agenzie-seo/roma/").
//
// Le pagine si riconoscono dal percorso: le pagine di elenco stanno in
// LandingPage, le schede in /professionista/<slug>/, gli articoli in /blog/<slug>/.
// Per tutte le altre il titolo si ricava dall'ultimo pezzo del percorso.
import { db } from "@/lib/db";
import { BASE_URL, SITE_NAME } from "@/lib/site";

export type Pagina = { titolo: string; link: string };

/** Il percorso pulito: senza dominio, parametri e ancore, con la barra finale. */
export function percorso(p: string): string {
  let s = p.trim();
  try {
    if (/^https?:\/\//i.test(s)) s = new URL(s).pathname;
  } catch {
    // non è un indirizzo valido: si usa così com'è
  }
  s = s.split(/[?#]/)[0] || "/";
  if (!s.startsWith("/")) s = `/${s}`;
  return s.endsWith("/") ? s : `${s}/`;
}

const daPercorso = (p: string) => {
  const ultimo = p.split("/").filter(Boolean).pop();
  if (!ultimo) return `Home di ${SITE_NAME}`;
  const t = decodeURIComponent(ultimo).replace(/[-_]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Titolo e indirizzo completo di ogni percorso, con poche interrogazioni in tutto. */
export async function titoliPagine(percorsi: (string | null | undefined)[]): Promise<Map<string, Pagina>> {
  const puliti = [...new Set(percorsi.filter((p): p is string => Boolean(p)).map(percorso))];
  const schede = puliti.map((p) => p.match(/^\/professionista\/([^/]+)\/$/)?.[1]).filter((s): s is string => Boolean(s));
  const articoli = puliti.map((p) => p.match(/^\/blog\/([^/]+)\/$/)?.[1]).filter((s): s is string => Boolean(s));
  const [elenchi, agenzie, blog] = await Promise.all([
    puliti.length
      ? db.landingPage.findMany({ where: { path: { in: puliti } }, select: { path: true, title: true, metaTitle: true } })
      : [],
    schede.length ? db.agency.findMany({ where: { slug: { in: schede } }, select: { slug: true, name: true } }) : [],
    articoli.length ? db.page.findMany({ where: { slug: { in: articoli } }, select: { slug: true, title: true } }) : [],
  ]);
  const titolo = new Map<string, string>();
  for (const l of elenchi) titolo.set(l.path, l.metaTitle || l.title);
  for (const a of agenzie) titolo.set(`/professionista/${a.slug}/`, `Scheda: ${a.name}`);
  for (const b of blog) titolo.set(`/blog/${b.slug}/`, `Articolo: ${b.title}`);
  return new Map(puliti.map((p) => [p, { titolo: titolo.get(p) ?? daPercorso(p), link: `${BASE_URL}${p}` }]));
}

/** Titolo e link di un percorso già risolto, nella forma che va in `campi`. */
export function campiPagina(nome: string, p: string | null | undefined, titoli: Map<string, Pagina>): Record<string, string> {
  if (!p) return {};
  const pagina = titoli.get(percorso(p));
  if (!pagina) return {};
  return { [nome]: pagina.titolo, [`${nome}_link`]: pagina.link };
}

/** La pagina nella forma `{ titolo, url }` che il pannello mostra nella riga. */
export function paginaDi(p: string | null | undefined, titoli: Map<string, Pagina>) {
  const pagina = p ? titoli.get(percorso(p)) : undefined;
  return pagina ? { titolo: pagina.titolo, url: pagina.link } : undefined;
}
