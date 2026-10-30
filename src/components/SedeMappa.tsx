// Mappa della sede: riquadro di OpenStreetMap, senza JavaScript e senza chiavi,
// come nelle altre schede contatti dei nostri siti. Carica solo se serve.
export function SedeMappa({ lat, lng, nome, indirizzo }: { lat: number | null; lng: number | null; nome: string; indirizzo?: string | null }) {
  if (lat === null || lng === null) return null;
  const d = 0.006;
  const bbox = `${lng - d}%2C${lat - d / 1.6}%2C${lng + d}%2C${lat + d / 1.6}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <div className="mt-4">
      <iframe
        title={`Dove si trova ${nome}`}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-52 w-full rounded-slot border border-line"
      />
      <p className="t-meta mt-2">
        {indirizzo ? `${indirizzo} · ` : ""}
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noopener" className="font-semibold text-action">
          Apri la mappa ↗
        </a>
      </p>
    </div>
  );
}
