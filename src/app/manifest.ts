// Manifest minimo: serve a chi aggiunge il sito alla schermata iniziale del
// telefono e a far scegliere al browser l'icona giusta.
import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_TAGLINE,
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#171e24",
    lang: "it",
    icons: [
      { src: "/logo-icona.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
