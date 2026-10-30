"use client";

// Mappa dei professionisti con Leaflet (licenza BSD, gratuito).
// Si carica solo quando l'utente la apre: chi non la usa non la scarica.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

export type MapPoint = { slug: string; name: string; lat: number; lng: number; rating: number | null; reviewCount: number; city: string | null };

// Fondo della mappa. Fino al 22/09/2026 erano le tessere Carto Positron:
// da allora vogliono una chiave e tornano con "API KEY REQUIRED" stampato
// sopra, quindi si usa OpenStreetMap, gratuito e senza chiave.
//
// La policy OSM (operations.osmfoundation.org/policies/tiles/) chiede questo
// indirizzo esatto, senza sottodomini `{s}` e senza `{r}`, l'attribuzione
// visibile e niente prelievi in blocco. Qui la mappa si apre solo se l'utente
// la chiede e scarica solo il riquadro che sta guardando: è uso normale.
// La stessa policy raccomanda di non fissare l'indirizzo nel codice, così si
// può cambiare fornitore (Carto con chiave, o altri) senza toccare i file:
// le tre variabili qui sotto arrivano dall'ambiente al momento della build.
const TILE = process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIB =
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap">segnala un errore</a>';
// OSM standard è a colori pieni: smorzandolo somiglia al grigio di Positron e
// i numeri blu delle sedi restano leggibili. Vale solo per le tessere, non per
// i segnaposto. Con un fondo già grigio basta mettere "none".
const FILTRO = process.env.NEXT_PUBLIC_TILE_FILTER || "saturate(0.3) brightness(1.06) contrast(0.92)";

function pin(position: number) {
  return `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;background:var(--color-action,#0B57D0);color:#fff;font:600 12px/1 system-ui;box-shadow:0 1px 4px rgba(0,0,0,.35)">${position}</span>`;
}

export function AgencyMap({ points, height = 420 }: { points: MapPoint[]; height?: number }) {
  const [aperta, setAperta] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const mappa = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!aperta || !box.current || mappa.current || points.length === 0) return;
    let vivo = true;
    (async () => {
      const L = await import("leaflet");
      if (!vivo || !box.current) return;
      const map = L.map(box.current, { scrollWheelZoom: false });
      mappa.current = map;
      L.tileLayer(TILE, { attribution: ATTRIB, maxZoom: 19 }).addTo(map);
      // Solo il riquadro delle tessere: i segnaposto stanno in un altro strato
      // e restano a colori pieni.
      const strato = map.getPane("tilePane");
      if (strato) strato.style.filter = FILTRO;
      const gruppo: [number, number][] = [];
      points.forEach((p, i) => {
        gruppo.push([p.lat, p.lng]);
        L.marker([p.lat, p.lng], { icon: L.divIcon({ html: pin(i + 1), className: "", iconSize: [26, 26], iconAnchor: [13, 13] }), title: p.name })
          .addTo(map)
          .bindPopup(
            `<strong>${p.name}</strong><br>${p.city ?? ""}${p.rating && p.reviewCount ? ` · ${p.rating.toFixed(1)} su ${p.reviewCount} recensioni` : ""}<br><a href="/agenzia/${p.slug}/">Vedi la scheda</a>`,
          );
      });
      map.fitBounds(gruppo, { padding: [30, 30], maxZoom: 15 });
    })();
    return () => {
      vivo = false;
      mappa.current?.remove();
      mappa.current = null;
    };
  }, [aperta, points]);

  if (points.length === 0) return null;

  if (!aperta) {
    return (
      <button
        type="button"
        onClick={() => setAperta(true)}
        className="flex w-full items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4 text-left hover:border-ink/25"
      >
        <span>
          <span className="block font-semibold text-ink">Vedi dove sono sulla mappa</span>
          <span className="t-meta block">{points.length} sedi con indirizzo verificato</span>
        </span>
        <span aria-hidden className="text-xl text-action">⌖</span>
      </button>
    );
  }

  return (
    <div>
      <div ref={box} style={{ height }} className="w-full overflow-hidden rounded-card border border-line" />
      <p className="t-meta mt-2">Trascina per spostarti, tocca un numero per aprire la scheda. La posizione arriva dalla scheda Google dell&apos;professionista.</p>
    </div>
  );
}
