// Riassunto fattuale costruito solo con dati verificabili della scheda.
// Sostituisce il testo delle fonti finché non scriviamo noi la descrizione.
import { fmt } from "@/lib/site";

type SummaryInput = {
  name: string;
  city?: { name: string } | null;
  services?: { service: { name: string } }[];
  rating?: number | null;
  reviewCount?: number | null;
  foundedYear?: number | null;
  teamSize?: string | null;
  minBudget?: number | null;
  skills?: unknown;
};

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;

export function factSummary(a: SummaryInput, opts: { short?: boolean } = {}): string | null {
  const servizi = (a.services ?? []).map((s) => s.service.name.toLowerCase()).slice(0, opts.short ? 2 : 3);
  const skills = Array.isArray(a.skills) ? (a.skills as string[]).slice(0, 3) : [];
  const frasi: string[] = [];

  const dove = a.city ? ` con sede a ${a.city.name}` : "";
  if (servizi.length) frasi.push(`${a.name} è un professionista${dove} che lavora su ${list(servizi)}.`);
  else if (dove) frasi.push(`${a.name} è un professionista${dove}.`);
  else return null;

  if (opts.short) {
    // In elenco la frase completa si ripeterebbe uguale su decine di schede:
    // meglio i tratti che distinguono davvero (competenze, anno).
    const tratti = [
      ...skills,
      a.foundedYear ? `dal ${a.foundedYear}` : null,
    ].filter(Boolean) as string[];
    return tratti.length ? tratti.slice(0, 4).join(" · ") : frasi[0];
  }

  const dati = [
    a.foundedYear ? `in attività dal ${a.foundedYear}` : null,
    a.teamSize ? `squadra di ${a.teamSize} persone` : null,
    a.minBudget ? `lavori da ${fmt(a.minBudget)} € in su` : null,
  ].filter(Boolean) as string[];
  if (dati.length) frasi.push(`${list(dati.map((d, i) => (i === 0 ? d.charAt(0).toUpperCase() + d.slice(1) : d)))}.`);

  if (a.rating && a.reviewCount)
    frasi.push(`Media ${a.rating.toFixed(1)} su ${a.reviewCount} ${a.reviewCount === 1 ? "recensione pubblica" : "recensioni pubbliche"}.`);

  if (skills.length) frasi.push(`Competenze dichiarate nelle fonti: ${list(skills)}.`);

  return frasi.join(" ");
}
