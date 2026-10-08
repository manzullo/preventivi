import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// Nessun blocco ai bot AI (lezione guidalocation): la visibilità nelle
// risposte generate vale quanto quella in SERP.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/", "/preventivo/", "/grazie/", "/embed/"] },
      { userAgent: ["GPTBot", "ClaudeBot", "Google-Extended", "PerplexityBot"], allow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap-index.xml"),
  };
}
