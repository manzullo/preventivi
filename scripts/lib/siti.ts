// Pezzi in comune agli script che leggono i siti dei professionisti
// (enrich-sites, contatti, citta-da-sito, piva-import, logo-da-sito,
// dubbi-doppioni): l'elenco delle schede con sito, l'archivio grezzo in
// data/raw/sites/, l'estrazione di telefono, email e partita IVA.
// Ogni lettura di rete passa da src/modules/ingest/http.ts (robots.txt,
// pausa per sito, User-Agent dichiarato).
import fs from "node:fs";
import { db } from "../../src/lib/db";
import { allowed, SCRAPER_UA } from "../../src/modules/ingest/http";
import { normalizeDomain } from "../../src/modules/ingest/normalize";

export const DIR_SITI = "data/raw/sites";
export const DIR_CONTATTI = "data/raw/contatti";

export function argomenti() {
  const args = process.argv.slice(2);
  return {
    args,
    opt: (k: string, d = "") => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] ?? d) : d; },
    flag: (k: string) => args.includes(k),
  };
}

/** Host senza www: è il nome del file grezzo in data/raw/sites/. */
export function hostDi(url: string): string | null {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

/**
 * Schede con un sito vero (pubblicate e bozze, non quelle con opposizione):
 * i social e le directory non contano come sito, vedi normalizeDomain.
 */
export async function schedeConSito(opts: { city?: string; limit?: number; extra?: object } = {}) {
  const rows = await db.agency.findMany({
    where: { optedOutAt: null, website: { not: null }, ...(opts.city ? { city: { slug: opts.city } } : {}), ...(opts.extra ?? {}) },
    select: { id: true, slug: true, name: true, website: true, domain: true, phone: true, email: true, vatNumber: true, published: true, city: { select: { name: true } } },
    orderBy: [{ published: "desc" }, { score: "desc" }],
  });
  const out = rows
    .map((r) => ({ ...r, website: /^https?:\/\//i.test(r.website!) ? r.website! : `https://${r.website}`, host: normalizeDomain(r.website) ?? null }))
    .filter((r): r is typeof r & { host: string } => Boolean(r.host));
  return opts.limit ? out.slice(0, opts.limit) : out;
}

export type SitoLetto = {
  name?: string; website?: string; host?: string; title?: string | null; description?: string | null;
  phone?: string | null; email?: string | null; piva?: string | null; address?: string | null;
  textSample?: string; text?: string; skills?: string[]; error?: string;
};

/** Archivio grezzo dei siti già letti, per host. */
export function sitiLetti(): Map<string, SitoLetto> {
  const out = new Map<string, SitoLetto>();
  if (!fs.existsSync(DIR_SITI)) return out;
  for (const f of fs.readdirSync(DIR_SITI).filter((x) => x.endsWith(".json"))) {
    try {
      const j = JSON.parse(fs.readFileSync(`${DIR_SITI}/${f}`, "utf8")) as SitoLetto;
      if (j.host && !j.error) out.set(String(j.host).replace(/^www\./, ""), j);
    } catch { /* file rovinato: si salta */ }
  }
  return out;
}

const decodi = (s: string) => s
  .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
  .replace(/&nbsp;|&#160;/g, " ")
  .replace(/&amp;/g, "&");

/** Testo leggibile di una pagina HTML. */
export const testoDa = (html: string) => decodi(html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;/gi, " "))
  .replace(/\s+/g, " ")
  .trim();

/** Numero italiano scritto in chiaro: fisso o mobile, con o senza prefisso. */
export function telefonoDa(testo: string): string | null {
  const t = decodi(testo).replace(/[   ]/g, " ");
  const candidati = [
    ...t.matchAll(/(?:tel(?:efono)?\.?|cell(?:ulare)?\.?|chiama(?:ci)?|phone|whatsapp)[\s:]*((?:\+39\s?)?(?:0\d{1,3}[\s./-]?\d{5,8}|3\d{2}[\s./-]?\d{3}[\s./-]?\d{3,4}))/gi),
    ...t.matchAll(/(\+39\s?(?:0\d{1,3}[\s./-]?\d{5,8}|3\d{2}[\s./-]?\d{3}[\s./-]?\d{3,4}))/g),
    ...t.matchAll(/\b(0\d{1,3}[\s./-]\d{6,8})\b/g),
    ...t.matchAll(/\b(3\d{2}[\s./-]?\d{3}[\s./-]?\d{3,4})\b/g),
  ];
  for (const m of candidati) {
    const cifre = m[1].replace(/[\s./-]/g, "").replace(/^\+39/, "");
    if (cifre.length < 8 || cifre.length > 11) continue;
    if (/^(\d)\1+$/.test(cifre)) continue; // 000000000
    return `+39 ${cifre}`;
  }
  return null;
}

export function pivaDa(testo: string): string | null {
  const m = decodi(testo).match(/(?:p\.?\s?iva|partita iva|vat(?:\s?number)?|c\.?f\.?\s?\/?\s?p\.?\s?iva)[\s:.]*((?:IT)?\s?\d{11})/i);
  return m ? m[1].replace(/\s/g, "").replace(/^IT/i, "") : null;
}

export function emailDa(testo: string): string | null {
  const m = decodi(testo).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  const e = m?.[0]?.toLowerCase();
  if (!e || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(e) || e.includes("example.") || e.includes("sentry")) return null;
  return e;
}

/** Indirizzo italiano: via/piazza ... numero civico, CAP facoltativo. */
export function indirizzoDa(testo: string): string | null {
  return testo.match(/\b(via|viale|piazza|piazzale|largo|corso|vicolo|contrada|strada|località|loc\.)\s[^,.;]{3,60},?\s?\d{1,4}[a-z]?(?:[^,.;]{0,20}\b\d{5}\b[^,.;]{0,30})?/i)?.[0]?.trim() ?? null;
}

const pausaPerHost = new Map<string, number>();

/**
 * GET binario (immagini) con le stesse regole di politeGet, che restituisce
 * solo testo: robots.txt, User-Agent dichiarato, una richiesta alla volta per
 * sito con una pausa fra l'una e l'altra.
 */
export async function politeGetBuffer(url: string, opts: { minDelayMs?: number; maxBytes?: number } = {}): Promise<Buffer | null> {
  if (!(await allowed(url))) return null;
  const host = new URL(url).host;
  const wait = opts.minDelayMs ?? 1500;
  const since = Date.now() - (pausaPerHost.get(host) ?? 0);
  if (since < wait) await new Promise((r) => setTimeout(r, wait - since));
  pausaPerHost.set(host, Date.now());
  try {
    const r = await fetch(url, { headers: { "User-Agent": SCRAPER_UA, Accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.byteLength > 200 && buf.byteLength < (opts.maxBytes ?? 8_000_000) ? buf : null;
  } catch { return null; }
}

/** Lavora una coda con N lavoratori in parallelo (siti diversi, pause per sito in http.ts). */
export async function inParallelo<T>(lista: T[], n: number, fai: (x: T, i: number) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < lista.length) { const k = i++; await fai(lista[k], k); } }));
}
