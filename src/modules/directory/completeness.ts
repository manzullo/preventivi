// Completezza della scheda (agencyCompleteness di guidalocation): ogni campo
// pesa, la percentuale guida l'editor su cosa manca.

type AgencyForScore = {
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  cityId: string | null;
  lat: number | null;
  lng: number | null;
  whatsapp: string | null;
  minBudget: number | null;
  teamSize: string | null;
  foundedYear: number | null;
  servicesCount: number;
};

const CHECKS: { key: keyof AgencyForScore | "coords" | "services"; label: string; weight: number; ok: (a: AgencyForScore) => boolean }[] = [
  { key: "description", label: "descrizione (almeno 80 caratteri)", weight: 20, ok: (a) => (a.description?.trim().length ?? 0) >= 80 },
  { key: "services", label: "almeno un servizio", weight: 20, ok: (a) => a.servicesCount > 0 },
  { key: "cityId", label: "città", weight: 15, ok: (a) => Boolean(a.cityId) },
  { key: "website", label: "sito web", weight: 15, ok: (a) => Boolean(a.website) },
  { key: "phone", label: "telefono", weight: 8, ok: (a) => Boolean(a.phone) },
  { key: "email", label: "email", weight: 7, ok: (a) => Boolean(a.email) },
  { key: "coords", label: "coordinate", weight: 5, ok: (a) => a.lat !== null && a.lng !== null },
  { key: "whatsapp", label: "WhatsApp", weight: 3, ok: (a) => Boolean(a.whatsapp) },
  { key: "minBudget", label: "budget minimo", weight: 3, ok: (a) => Boolean(a.minBudget) },
  { key: "teamSize", label: "team", weight: 2, ok: (a) => Boolean(a.teamSize) },
  { key: "foundedYear", label: "anno di fondazione", weight: 2, ok: (a) => Boolean(a.foundedYear) },
];

export function agencyCompleteness(a: AgencyForScore): { score: number; missing: string[] } {
  let score = 0;
  const missing: string[] = [];
  for (const c of CHECKS) {
    if (c.ok(a)) score += c.weight;
    else missing.push(c.label);
  }
  return { score, missing };
}
