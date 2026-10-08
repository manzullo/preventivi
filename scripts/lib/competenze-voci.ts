// Il riconoscimento delle voci del vocabolario (data/competenze.json) di
// scripts/competenze.ts, in forma importabile: una voce entra se tutte le sue
// parole (per radice) compaiono nella stessa frase. scripts/competenze.ts lo
// tiene dentro main() e lancia il calcolo appena importato, quindi qui la
// stessa logica è ripresa riga per riga: se cambia là, va cambiata anche qui
// (o competenze.ts può importare questo file).
import fs from "node:fs";

const STOP = new Set(["di", "a", "e", "ed", "per", "del", "della", "dello", "dei", "delle", "degli", "in", "con", "da", "dal", "il", "lo", "la", "le", "gli", "un", "una", "su", "al", "alla", "roma"]);
const piano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const parole = (s: string) => piano(s).split(/[^a-z0-9]+/).filter(Boolean);
/** Radice corta: "riparazione" → "ripara", "caldaia" → "calda", "wc" → "wc". */
const radice = (w: string) => (w.length > 7 ? w.slice(0, 6) : w.length > 4 ? w.slice(0, w.length - 2) : w);

type Voce = { nome: string; radici: string[] };

/**
 * Prepara il vocabolario per categoria, già senza le voci che ripetono il nome
 * di una categoria (quelle hanno la loro pagina). Restituisce la funzione che
 * trova le voci in un testo per le categorie date.
 */
export function vocabolario(servizi: { slug: string; name: string; queries: unknown }[], file = "data/competenze.json") {
  const grezzo: Record<string, string[]> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const voci = new Map<string, Voce[]>(
    Object.entries(grezzo).map(([servizio, nomi]) => [
      servizio,
      nomi.map((nome) => ({ nome, radici: [...new Set(parole(nome).filter((w) => !STOP.has(w)).map(radice))] })).filter((v) => v.radici.length > 0),
    ]),
  );
  const categorie = servizi.flatMap((s) => [s.name, ...((s.queries as string[]) ?? [])]).map((t) => parole(t).filter((w) => !STOP.has(w)).map(radice));
  const uguale = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);
  const ripete = (v: Voce) => categorie.some((c) => c.length && v.radici.length <= c.length && v.radici.every((r) => c.some((p) => uguale(r, p))));
  for (const [slug, lista] of voci) voci.set(slug, lista.filter((v) => !ripete(v)));

  /** Voci presenti nel testo, cercate fra quelle delle categorie date (tutte se vuoto). */
  const trova = (testo: string, slugs: string[] = []): string[] => {
    const frasi = testo.split(/[.!?;:\n•·|]+/).map(parole).filter((f) => f.length);
    const presente = (v: Voce) => frasi.some((f) => v.radici.every((r) => f.some((w) => w.startsWith(r))));
    const trovate = new Set<string>();
    for (const slug of slugs.length ? slugs : [...voci.keys()]) for (const v of voci.get(slug) ?? []) if (presente(v)) trovate.add(v.nome);
    return [...trovate].sort((x, y) => x.localeCompare(y));
  };

  /** Voce del vocabolario → categorie che la elencano. */
  const categorieDi = new Map<string, string[]>();
  for (const [slug, nomi] of Object.entries(grezzo)) for (const n of nomi) categorieDi.set(n, [...(categorieDi.get(n) ?? []), slug]);

  return { trova, categorieDi };
}
