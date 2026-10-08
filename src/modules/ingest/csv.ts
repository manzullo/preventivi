// Import manuale da CSV (separatore ; o ,). Colonne riconosciute:
// nome, sito, telefono, email, indirizzo, cap, citta, descrizione, servizi (slug separati da |), source_ref
// Le "liste di nomi" dei concorrenti usano lo stesso formato con le sole colonne nome e citta:
// diventano query per Places (namesToQueries), non schede.

import type { IngestRecord } from "./types";

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === sep && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i] ?? `col${i}`, v])));
}

export function csvToRecords(text: string): IngestRecord[] {
  return parseCsv(text)
    .filter((r) => r.nome)
    .map((r, i) => ({
      source: "csv",
      sourceRef: r.source_ref || `csv-${Date.now()}-${i}`,
      name: r.nome,
      website: r.sito || undefined,
      phone: r.telefono || undefined,
      email: r.email || undefined,
      street: r.indirizzo || undefined,
      postalCode: r.cap || undefined,
      cityName: r.citta || undefined,
      description: r.descrizione || undefined,
      serviceSlugs: (r.servizi ?? "").split("|").map((s) => s.trim()).filter(Boolean),
    }));
}

/** Lista di nomi (nome;citta) → query di ricerca mirate per Places. */
export function namesToQueries(text: string): { name: string; city: string; query: string }[] {
  return parseCsv(text).filter((r) => r.nome).map((r) => ({ name: r.nome, city: r.citta ?? "", query: `${r.nome} ${r.citta ?? ""}`.trim() }));
}
