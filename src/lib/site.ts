// Costanti di sito e costruzione dei path. Ogni URL pubblico passa da qui,
// così una rinomina si fa in un punto solo (e genera un Redirect).

export const SITE_NAME = "Mister Wolf";

/**
 * Abbassa la prima lettera per infilare un nome dentro una frase: "Professionisti SEO"
 * diventa "professionisti SEO" e non "professionisti seo".
 *
 * Se però la prima parola ha già una maiuscola dentro, è un nome scritto così e
 * non si tocca: "WordPress" abbassato diventa "wordPress", che è peggio di
 * lasciarlo in maiuscolo a metà frase.
 */
export const minuscola = (s: string) => {
  const prima = s.split(" ")[0] ?? "";
  if (/[A-Z]/.test(prima.slice(1))) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
};
export const SITE_TAGLINE =
  "Trova professionisti e aziende vicino a te e confronta i preventivi";
export const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4450"
).replace(/\/+$/, "");

/** Sotto questa soglia una pagina listing non esiste (404), niente noindex. */
export const PUBLISH_THRESHOLD = 3;
export const PAGE_SIZE = 12;
export const SITEMAP_CHUNK = 2000;
export const CURRENT_YEAR = new Date().getFullYear();

export const COMPARISON_PREFIX = "migliori-";
export const ALTERNATIVE_PREFIX = "alternative-a-";

/** Primo segmento riservato alle route statiche: mai uno slug di entità. */
export const RESERVED_SLUGS = new Set([
  "professionista",
  "preventivo",
  "grazie",
  "blog",
  "admin",
  "api",
  "metodologia",
  "candidatura",
  "rivendica",
  "embed",
  "loader",
  "lead",
  "sitemap",
  "sitemap-index.xml",
  "robots.txt",
]);

/**
 * Articoli davanti al singolare di una categoria: "un idraulico", "l'elettricista",
 * "uno psicologo", "un'estetista", "la carrozzeria". Senza singolare vale
 * "un professionista".
 */
export function articoli(singular?: string | null, gender: string = "m"): { un: string; il: string } {
  const w = (singular ?? "").trim();
  if (!w) return { un: "un professionista", il: "il professionista" };
  const vocale = /^[aeiouàèéìòùh]/i.test(w);
  if (gender === "f") return vocale ? { un: `un'${w}`, il: `l'${w}` } : { un: `una ${w}`, il: `la ${w}` };
  if (vocale) return { un: `un ${w}`, il: `l'${w}` };
  if (/^(s[^aeiou]|z|gn|ps|pn|x|y)/i.test(w)) return { un: `uno ${w}`, il: `lo ${w}` };
  return { un: `un ${w}`, il: `il ${w}` };
}

export function absoluteUrl(path: string): string {
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function fmt(n: number): string {
  // Node qui non ha i dati di locale italiani (Intl ricade su un formato senza
  // separatore): il punto delle migliaia lo mettiamo a mano.
  const [int, dec] = Math.abs(n).toFixed(Number.isInteger(n) ? 0 : 2).split(".");
  const raggruppato = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-" : "") + raggruppato + (dec ? "," + dec : "");
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

type Query = Record<string, string | number | undefined | null>;

function qs(query?: Query): string {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const paths = {
  home: () => "/",
  service: (s: string) => `/${s}/`,
  city: (c: string) => `/${c}/`,
  region: (r: string) => `/${r}/`,
  serviceCity: (s: string, c: string) => `/${s}/${c}/`,
  agency: (a: string) => `/professionista/${a}/`,
  skill: (s: string) => `/competenze/${s}/`,
  skillCity: (s: string, c: string) => `/competenze/${s}/${c}/`,
  comparison: (s: string) => `/${COMPARISON_PREFIX}${s}/`,
  alternative: (c: string) => `/${ALTERNATIVE_PREFIX}${c}/`,
  methodology: () => "/metodologia/",
  thanks: () => "/grazie/",
  /** Pagina della richiesta per il cliente: k è la firma dell'id (lib/crypto). */
  request: (id: string, k: string) => `/richiesta/${id}/?k=${encodeURIComponent(k)}`,
  quote: (query?: Query) => `/preventivo/${qs(query)}`,
  withQuery: (path: string, query?: Query) => `${path}${qs(query)}`,
};
