// Title, description, metadata e JSON-LD. I template contengono il numero
// reale di professionisti e l'anno corrente: l'anno sta nel title, mai nell'URL.

import type { Metadata } from "next";
import { CURRENT_YEAR, SITE_NAME, absoluteUrl, fmt, minuscola, paths } from "@/lib/site";

/**
 * Il tag <title>, cioè la riga azzurra nei risultati di ricerca.
 *
 * Regola: la prima cosa che si legge deve essere quello che la gente digita.
 * "web agency roma" fa 2.900 ricerche al mese, "migliori web agency roma" ne
 * fa 70: il servizio e la città vengono prima, il resto è ciò che convince a
 * cliccare fra dieci risultati uguali, cioè quante sono e di quale anno sono.
 */
export const titles = {
  // Senza "i migliori / le migliori": il genere cambia da categoria a
  // categoria (idraulici, imprese edili) e il title non lo sa.
  serviceCity: (plural: string, city: string) => `${plural} a ${city}: classifica ${CURRENT_YEAR} per recensioni`,
  service: (plural: string) => `${plural} in Italia: classifica ${CURRENT_YEAR} per recensioni`,
  city: (city: string) => `Professionisti e aziende a ${city}: classifica ${CURRENT_YEAR}`,
  region: (region: string, n: number) => `Professionisti in ${region}: ${fmt(n)} schede città per città`,
  comparison: (plural: string) => `${plural} in Italia: la classifica ${CURRENT_YEAR}`,
  alternative: (name: string) => `Alternative a ${name}: dove chiedere preventivi senza crediti`,
  agency: (name: string, city?: string | null) =>
    city ? `${name} (${city}): recensioni, servizi e contatti` : `${name}: recensioni, servizi e contatti`,
};

/**
 * L'H1, che è un'altra cosa dal <title> e finora era la stessa.
 *
 * In cima alla pagina il numero e l'anno sono rumore: chi è arrivato li vede
 * già nella riga sotto il titolo e nel conteggio dell'elenco. Qui serve la
 * frase pulita, quella che la persona aveva in testa mentre cercava.
 */
export const headings = {
  serviceCity: (plural: string, city: string) => `${plural} a ${city} ${CURRENT_YEAR}`,
  service: (plural: string) => `${plural} in Italia ${CURRENT_YEAR}`,
  city: (city: string) => `Professionisti e aziende a ${city} ${CURRENT_YEAR}`,
  region: (region: string) => `Professionisti e aziende in ${region} ${CURRENT_YEAR}`,
  comparison: (plural: string) => `${plural} in Italia: classifica ${CURRENT_YEAR}`,
  alternative: (name: string) => `Alternative a ${name}`,
};

/**
 * Il sottotitolo sotto l'H1: dice in una riga cosa si fa in questa pagina.
 * L'H1 nomina, il sottotitolo invita: sono i due mezzi passi che servono a
 * capire di essere nel posto giusto prima di guardare l'elenco.
 */
export const sottotitoli = {
  serviceCity: (plural: string, city: string) =>
    `${plural} a ${city}: confronta recensioni e zone servite, poi chiedi un preventivo gratis.`,
  service: (plural: string) => `${plural} in tutta Italia, città per città: confronta e chiedi un preventivo gratis.`,
  city: (city: string) => `Professionisti e aziende a ${city}, per categoria: confronta e chiedi un preventivo gratis.`,
  skill: (nome: string, city?: string) =>
    `Professionisti per ${nome}${city ? ` a ${city}` : " in Italia"}: confronta e chiedi un preventivo gratis.`,
};

/**
 * Le descrizioni. Non promettono più che nessuno paghi per la posizione,
 * perché le schede in evidenza esistono: dicono cosa si trova nella pagina e
 * che l'ordine nasce dalle recensioni, il che è vero e verificabile.
 */
export const descriptions = {
  serviceCity: (plural: string, city: string, n: number) =>
    `${plural} a ${city}: ${fmt(n)} schede a confronto con recensioni, fonte e contatti diretti. Preventivi gratis e senza impegno.`,
  service: (plural: string, n: number) =>
    `${fmt(n)} schede di ${minuscola(plural)} in Italia, città per città: recensioni con la fonte e contatti diretti. Preventivi gratis in due minuti.`,
  city: (city: string, n: number) =>
    `${fmt(n)} professionisti e aziende a ${city} per casa, eventi, benessere, lezioni e lavoro: recensioni con la fonte e preventivi gratis.`,
  region: (region: string, n: number) =>
    `Professionisti e aziende in ${region}: ${fmt(n)} schede con recensioni, divise per città e per categoria.`,
  comparison: (plural: string, n: number) =>
    `La classifica ${CURRENT_YEAR} di ${minuscola(plural)} in Italia: ${fmt(n)} schede, ordine calcolato dalle recensioni pubbliche con la formula pubblicata.`,
  alternative: (name: string) =>
    `Cerchi un'alternativa a ${name}? Professionisti con recensioni verificabili, contatti diretti e preventivi gratis senza crediti da comprare.`,
  agency: (name: string, city?: string | null, services?: string[]) =>
    `${name}${city ? ` a ${city}` : ""}: ${services?.length ? services.slice(0, 3).join(", ") + ". " : ""}Recensioni con fonte, contatti e richiesta preventivo.`,
};

/** Canonical sempre sul path base: le pagine filtrate/paginate non duplicano. */
export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}): Metadata {
  const canonical = absoluteUrl(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical },
    robots: opts.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: canonical,
      type: "website",
      siteName: SITE_NAME,
      locale: "it_IT",
    },
  };
}

// ---------- JSON-LD ----------

export type Crumb = { name: string; href: string };

export function breadcrumbJsonLd(items: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.href),
    })),
  };
}

export function itemListJsonLd(
  name: string,
  items: { name: string; slug: string; rating?: number | null; reviewCount?: number; city?: { name: string } | null }[],
  offset = 0,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: items.map((a, i) => ({
      "@type": "ListItem",
      position: offset + i + 1,
      // L'elemento punta all'entità della scheda: gli assistenti risalgono a voto,
      // recensioni e città senza dover aprire la pagina.
      item: {
        "@type": "ProfessionalService",
        "@id": `${absoluteUrl(paths.agency(a.slug))}#professionista`,
        name: a.name,
        url: absoluteUrl(paths.agency(a.slug)),
        ...(a.city ? { address: { "@type": "PostalAddress", addressLocality: a.city.name, addressCountry: "IT" } } : {}),
        ...(a.rating && a.reviewCount
          ? { aggregateRating: { "@type": "AggregateRating", ratingValue: a.rating, reviewCount: a.reviewCount, bestRating: 5, worstRating: 1 } }
          : {}),
      },
    })),
  };
}

/** Pagina-elenco: dice cosa contiene, quando è cambiata e chi la pubblica. */
export function collectionPageJsonLd(opts: { name: string; description: string; path: string; dateModified?: Date; total?: number }) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    inLanguage: "it-IT",
    ...(opts.dateModified ? { dateModified: opts.dateModified.toISOString() } : {}),
    isPartOf: { "@type": "WebSite", "@id": `${absoluteUrl("/")}#sito` },
    publisher: { "@id": `${absoluteUrl("/")}#organizzazione` },
  };
}

/** Sito con ricerca interna: la casella per nome professionista è indicizzabile. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${absoluteUrl("/")}#sito`,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    inLanguage: "it-IT",
    publisher: { "@id": `${absoluteUrl("/")}#organizzazione` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/cerca/")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function agencyJsonLd(a: {
  name: string;
  slug: string;
  website: string | null;
  phone: string | null;
  description: string | null;
  rating: number | null;
  reviewCount: number;
  street: string | null;
  postalCode: string | null;
  city: { name: string } | null;
  lat: number | null;
  lng: number | null;
  // Facoltativi: servono a farsi citare dagli assistenti, non solo indicizzare.
  minBudget?: number | null;
  foundedYear?: number | null;
  vatNumber?: string | null;
  logoUrl?: string | null;
  googleUrl?: string | null;
  social?: unknown;
  skills?: unknown;
  services?: { service: { name: string } }[];
  reviews?: { author: string | null; rating: number; text: string | null; publishedAt: Date | null; source: string; sourceUrl: string | null }[];
}) {
  // social è salvato come oggetto {facebook: url, linkedin: url, ...}
  const social = Array.isArray(a.social)
    ? (a.social as string[])
    : a.social && typeof a.social === "object"
      ? Object.values(a.social as Record<string, unknown>).filter((v): v is string => typeof v === "string" && v.startsWith("http"))
      : [];
  const skills = Array.isArray(a.skills) ? (a.skills as string[]) : [];
  const sameAs = [a.website, ...social].filter(Boolean) as string[];
  return {
    "@context": "https://schema.org",
    // ProfessionalService: sottotipo di LocalBusiness, è ciò che gli assistenti si aspettano da una scheda professionista.
    "@type": "ProfessionalService",
    name: a.name,
    url: absoluteUrl(paths.agency(a.slug)),
    ...(sameAs.length ? { sameAs } : {}),
    ...(a.logoUrl ? { image: a.logoUrl.startsWith("http") ? a.logoUrl : absoluteUrl(a.logoUrl) } : {}),
    ...(a.googleUrl ? { hasMap: a.googleUrl } : {}),
    ...(a.minBudget ? { priceRange: `da ${a.minBudget} EUR` } : {}),
    ...(a.foundedYear ? { foundingDate: String(a.foundedYear) } : {}),
    ...(a.vatNumber ? { vatID: `IT${a.vatNumber}`, taxID: a.vatNumber } : {}),
    ...(skills.length ? { knowsAbout: skills } : {}),
    ...(a.services?.length
      ? {
          makesOffer: a.services.map((s) => ({
            "@type": "Offer",
            itemOffered: { "@type": "Service", name: s.service.name, ...(a.city ? { areaServed: { "@type": "City", name: a.city.name } } : {}) },
          })),
        }
      : {}),
    ...(a.reviews?.length
      ? {
          review: a.reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.author ?? "Cliente" },
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            ...(r.text ? { reviewBody: r.text.slice(0, 800) } : {}),
            ...(r.publishedAt ? { datePublished: r.publishedAt.toISOString().slice(0, 10) } : {}),
            ...(r.sourceUrl ? { url: r.sourceUrl } : {}),
            publisher: { "@type": "Organization", name: r.source },
          })),
        }
      : {}),
    ...(a.phone ? { telephone: a.phone } : {}),
    ...(a.description ? { description: a.description } : {}),
    ...(a.city
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: a.city.name,
            addressCountry: "IT",
            ...(a.street ? { streetAddress: a.street } : {}),
            ...(a.postalCode ? { postalCode: a.postalCode } : {}),
          },
        }
      : {}),
    ...(a.lat !== null && a.lng !== null
      ? { geo: { "@type": "GeoCoordinates", latitude: a.lat, longitude: a.lng } }
      : {}),
    ...(a.reviewCount > 0 && a.rating !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: a.rating,
            reviewCount: a.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}
