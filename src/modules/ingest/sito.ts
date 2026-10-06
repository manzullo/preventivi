// Scraper generico per directory e siti che pubblicano i dati delle attività
// in JSON-LD (schema.org LocalBusiness e sottotipi): legge le pagine elenco,
// segue i link alle schede e alle pagine successive, estrae nome, indirizzo,
// telefono, sito, coordinate, voto e recensioni. Un sito nuovo non richiede
// codice: basta una configurazione in data/siti/{nome}.json (vedi SiteConfig).
// Le regole di robots.txt e le pause sono quelle di http.ts.

import { politeGet } from "./http";
import type { IngestRecord, IngestReview } from "./types";

export type SiteConfig = {
  /** Nome breve della fonte, finisce in Agency.source e Review.source. */
  source: string;
  /**
   * Pagine elenco di partenza, con {categoria} e {citta} sostituiti dai
   * valori di `categorie` e dallo slug (o da `citta[slug]`) della città.
   */
  start: string;
  /**
   * Slug nostro → come il sito scrive la categoria nell'indirizzo. Una lista
   * quando al nostro servizio corrispondono più categorie del sito.
   */
  categorie: Record<string, string | string[]>;
  /** Slug nostro della città → come la scrive il sito (se diverso). */
  citta?: Record<string, string>;
  /** Regex sugli href: link alle schede delle attività. */
  scheda: string;
  /** Regex sugli href: link alla pagina elenco successiva. */
  successiva?: string;
  /** Pagine elenco massime per categoria × città. */
  maxPagine?: number;
  /** Pausa minima fra due richieste allo stesso sito, in ms. */
  pausaMs?: number;
  /**
   * Come leggere la scheda: "jsonld" (predefinito) o "prontopro", che non
   * pubblica JSON-LD ma il profilo nei dati di Next.js (__NEXT_DATA__), o
   * "instapro", che legge i professionisti direttamente dalle pagine elenco
   * (il profilo si compone nel browser e nell'HTML non c'è).
   */
  estrattore?: "jsonld" | "prontopro" | "instapro";
};

const BUSINESS = /LocalBusiness|Organization|ProfessionalService|HomeAndConstructionBusiness|Plumber|Electrician|HousePainter|Locksmith|RoofingContractor|GeneralContractor|HVACBusiness|MovingCompany|Attorney|LegalService|AccountingService|Notary|Dentist|Physician|MedicalBusiness|HealthAndBeautyBusiness|BeautySalon|HairSalon|DaySpa|AutoRepair|AutoBodyShop|Florist|Store|FoodEstablishment|EducationalOrganization|Photograph/i;

type Ld = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

/** Tutti gli oggetti JSON-LD della pagina, appiattendo @graph e liste. */
export function jsonLdObjects(html: string): Ld[] {
  const out: Ld[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") {
      const o = x as Ld;
      out.push(o);
      if (o["@graph"]) walk(o["@graph"]);
      if (o.itemListElement) walk(o.itemListElement);
      if (o.item) walk(o.item);
    }
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      // JSON-LD rotto: capita, si salta.
    }
  }
  return out;
}

const isBusiness = (o: Ld) => [o["@type"]].flat().some((t) => typeof t === "string" && BUSINESS.test(t));

// Alcune directory (PagineGialle) mettono HTML nella descrizione JSON-LD.
const senzaHtml = (t?: string) => t?.replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim() || undefined;

/** I servizi offerti (schema.org makesOffer), uno per riga: "Servizi: a; b". */
const offerte = (o: Ld) => {
  const v = [o.makesOffer]
    .flat()
    .map((x) => (x && typeof x === "object" ? ((x as Ld).itemOffered as Ld | undefined) : undefined))
    .map((i) => (i ? str(i.category) ?? str(i.name) : undefined))
    .filter((x): x is string => Boolean(x));
  return v.length ? `Servizi: ${[...new Set(v)].join("; ")}` : undefined;
};

const contatto = (o: Ld, k: string) => [o.contactPoint].flat().map((c) => (c && typeof c === "object" ? str((c as Ld)[k]) : undefined)).find(Boolean);

/**
 * Scheda ProntoPro → IngestRecord. ProntoPro mostra nome, categoria, città e
 * presentazione; telefono, sito, indirizzo e recensioni no (li vende come
 * contatti): serve per la cernita dei nomi, i recapiti vanno cercati altrove.
 */
export function mapProntoPro(html: string, ctx: { source: string; url: string; serviceSlug: string; citySlug: string }): IngestRecord | null {
  const raw = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!raw) return null;
  let p: Ld | undefined;
  try {
    p = (JSON.parse(raw) as { props?: { pageProps?: { proProfile?: Ld } } }).props?.pageProps?.proProfile;
  } catch {
    return null;
  }
  const name = str(p?.userBusinessName);
  if (!p || !name) return null;
  return {
    source: ctx.source,
    sourceRef: `${ctx.source}:${str(p.profileId) ?? ctx.url}`,
    sourceUrl: ctx.url,
    name,
    cityName: str(p.cityName) ?? ctx.citySlug,
    description: str(p.profileDescription),
    serviceSlugs: [ctx.serviceSlug],
    reviews: [],
    categories: [str(p.serviceName)].filter((x): x is string => Boolean(x)),
  };
}

const testo = (h: string) =>
  h
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

/**
 * Pagina elenco Instapro → un IngestRecord per professionista. Ogni card ha
 * il link /ditta/{slug}, nome, "4,9/5" con il numero di recensioni e la
 * presentazione; telefono e indirizzo no (Instapro li dà solo a chi paga),
 * quindi le schede restano bozze finché i recapiti non arrivano da altre fonti.
 */
export function mapInstaproElenco(html: string, ctx: { source: string; url: string; serviceSlug: string; citySlug: string }): IngestRecord[] {
  const re = /<a\b[^>]*href=["'](?:https:\/\/www\.instapro\.it)?\/ditta\/([a-z0-9-]+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi;
  const hits = [...html.matchAll(re)].map((m) => ({ slug: m[1], at: m.index ?? 0, label: testo(m[2]).join(" ") }));
  const bySlug = new Map<string, { at: number; label: string }>();
  for (const h of hits) {
    const prev = bySlug.get(h.slug);
    if (!prev) bySlug.set(h.slug, { at: h.at, label: h.label });
    else if (!prev.label && h.label) prev.label = h.label;
  }
  const ordine = [...bySlug.entries()].sort((a, b) => a[1].at - b[1].at);
  const out: IngestRecord[] = [];
  ordine.forEach(([slug, h], i) => {
    const fine = ordine[i + 1]?.[1].at ?? Math.min(html.length, h.at + 20000);
    const righe = testo(html.slice(h.at, fine));
    const name = h.label || righe[0];
    if (!name || name.length > 120) return;
    const blocco = righe.join("\n");
    const voto = /(\d[.,]\d)\s*\/\s*5/.exec(blocco);
    const n = /(\d[\d.]*)\s*(?:recension|valutazion|review)/i.exec(blocco);
    const rating = voto ? Number(voto[1].replace(",", ".")) : NaN;
    const count = n ? Number(n[1].replace(/\./g, "")) : NaN;
    // La presentazione è la riga più lunga che non sia la recensione in evidenza.
    const description = righe
      .filter((r) => r !== name && r.length > 60 && !/^contatta|recension/i.test(r))
      .sort((a, b) => b.length - a.length)[0];
    const rec: IngestRecord = {
      source: ctx.source,
      sourceRef: `${ctx.source}:${slug}`,
      sourceUrl: `https://www.instapro.it/ditta/${slug}`,
      name,
      cityName: ctx.citySlug,
      description,
      serviceSlugs: [ctx.serviceSlug],
      reviews: [],
    };
    if (Number.isFinite(rating) && rating >= 1 && rating <= 5) rec.rating = rating;
    if (Number.isFinite(count) && count > 0) rec.reviewCount = count;
    out.push(rec);
  });
  return out;
}

/** Oggetto JSON-LD di un'attività → IngestRecord. */
export function mapLdBusiness(o: Ld, ctx: { source: string; url: string; serviceSlug: string; citySlug: string }): IngestRecord | null {
  const name = str(o.name);
  if (!name) return null;
  const addr = (first(o.address) ?? {}) as Ld;
  const geo = (first(o.geo) ?? {}) as Ld;
  const agg = (first(o.aggregateRating) ?? {}) as Ld;
  const reviews: IngestReview[] = [o.review]
    .flat()
    .filter((r): r is Ld => Boolean(r && typeof r === "object"))
    .map((r, i) => {
      const rating = Number(((first(r.reviewRating) ?? {}) as Ld).ratingValue);
      const author = first(r.author);
      return {
        author: str(typeof author === "object" && author ? (author as Ld).name : author),
        rating,
        text: str(r.reviewBody) ?? str(r.description),
        publishedAt: str(r.datePublished),
        sourceUrl: ctx.url,
        sourceRef: `${ctx.source}:${ctx.url}#${str(r["@id"]) ?? i}`,
      };
    })
    .filter((r) => r.rating >= 1 && r.rating <= 5);
  const sameAs = [o.sameAs].flat().map(str).filter(Boolean) as string[];
  const website = str(o.url) && !str(o.url)!.includes(new URL(ctx.url).host) ? str(o.url) : sameAs.find((u) => !/facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok/i.test(u) && !u.includes(new URL(ctx.url).host));
  const lat = Number(geo.latitude);
  const lng = Number(geo.longitude);
  const rec: IngestRecord = {
    source: ctx.source,
    sourceRef: str(o["@id"]) ?? ctx.url,
    sourceUrl: ctx.url,
    name,
    website,
    // PagineGialle mette telefono ed email (anche) in contactPoint.
    phone: str(first(o.telephone)) ?? contatto(o, "telephone"),
    email: (str(first(o.email)) ?? contatto(o, "email"))?.replace(/^mailto:/i, ""),
    street: str(addr.streetAddress),
    postalCode: str(addr.postalCode),
    cityName: str(addr.addressLocality) ?? ctx.citySlug,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    description: senzaHtml(str(o.description)),
    sourceDescription: offerte(o),
    serviceSlugs: [ctx.serviceSlug],
    reviews,
  };
  const rating = Number(agg.ratingValue);
  const count = Number(agg.reviewCount ?? agg.ratingCount);
  if (Number.isFinite(rating) && rating > 0) rec.rating = rating;
  if (Number.isFinite(count) && count > 0) rec.reviewCount = count;
  return rec;
}

/** Link assoluti della pagina che rispettano la regex. */
export function links(html: string, base: string, pattern: RegExp): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"), base).toString();
      if (pattern.test(u)) out.add(u);
    } catch {
      // href non valido
    }
  }
  return [...out];
}

/**
 * Una categoria in una città: pagine elenco (con le successive fino a
 * maxPagine), poi ogni scheda. Se la pagina elenco ha già i dati completi in
 * JSON-LD le schede si leggono lo stesso, perché di solito hanno di più
 * (recensioni, coordinate).
 */
export async function scrapeSite(cfg: SiteConfig, opts: { serviceSlug: string; citySlug: string; limit?: number; log?: (s: string) => void }): Promise<IngestRecord[]> {
  const log = opts.log ?? (() => undefined);
  const cats = [cfg.categorie[opts.serviceSlug] ?? []].flat();
  if (!cats.length) return [];
  const citta = cfg.citta?.[opts.citySlug] ?? opts.citySlug;
  const schede = new Set<string>();
  const dirette = new Map<string, IngestRecord>();
  const viste = new Set<string>();
  const basta = () => Boolean(opts.limit && schede.size + dirette.size >= opts.limit);
  for (const cat of cats) {
    let pagina: string | undefined = cfg.start.replace("{categoria}", cat).replace("{citta}", citta);
    for (let n = 0; pagina && n < (cfg.maxPagine ?? 10) && !viste.has(pagina) && !basta(); n++) {
      viste.add(pagina);
      let html: string;
      try {
        html = await politeGet(pagina, { minDelayMs: cfg.pausaMs });
      } catch (e) {
        // Una categoria che il sito non ha in quella città (404) non ferma le altre.
        log(`elenco non disponibile: ${pagina} · ${String(e).slice(0, 80)}`);
        break;
      }
      if (cfg.estrattore === "instapro") {
        for (const r of mapInstaproElenco(html, { source: cfg.source, url: pagina, serviceSlug: opts.serviceSlug, citySlug: opts.citySlug })) {
          if (!dirette.has(r.sourceRef)) dirette.set(r.sourceRef, r);
        }
      } else {
        for (const l of links(html, pagina, new RegExp(cfg.scheda))) schede.add(l);
      }
      log(`elenco ${n + 1}: ${pagina} · schede finora ${schede.size + dirette.size}`);
      // La successiva è la pagina col numero più basso dopo questa: "1, 2, 3…
      // 29" in fondo all'elenco non deve far tornare a pagina 1 o saltare a 29.
      const numero = (u: string) => Number(/(\d+)(?:\.html)?$/.exec(u)?.[1] ?? NaN);
      pagina = cfg.successiva
        ? links(html, pagina, new RegExp(cfg.successiva))
            .filter((u) => !viste.has(u) && !(numero(u) <= n + 1))
            .sort((a, b) => (numero(a) || 0) - (numero(b) || 0))[0]
        : undefined;
    }
  }
  const out: IngestRecord[] = [...dirette.values()].slice(0, opts.limit ?? Infinity);
  for (const url of [...schede].slice(0, opts.limit ?? Infinity)) {
    try {
      const html = await politeGet(url, { minDelayMs: cfg.pausaMs });
      const ctx = { source: cfg.source, url, serviceSlug: opts.serviceSlug, citySlug: opts.citySlug };
      const ld = cfg.estrattore === "prontopro" ? undefined : jsonLdObjects(html).find(isBusiness);
      const rec = cfg.estrattore === "prontopro" ? mapProntoPro(html, ctx) : ld ? mapLdBusiness(ld, ctx) : null;
      if (rec) out.push(rec);
      log(`${rec ? "ok" : "senza dati"}: ${url}`);
    } catch (e) {
      log(`errore: ${url} · ${String(e)}`);
    }
  }
  return out;
}
