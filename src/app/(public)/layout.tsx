import type { Metadata } from "next";
import { Onest } from "next/font/google";
import "@/app/globals.css";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Consenso } from "@/components/Consenso";
import { Track } from "@/components/Track";
import { BASE_URL, SITE_NAME, SITE_TAGLINE, absoluteUrl } from "@/lib/site";
import { settings } from "@/lib/settings";
import { websiteJsonLd } from "@/modules/directory/seo";

// Una sola famiglia: Onest, dal display 800 al corpo 400.
const onest = Onest({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-onest",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: { default: `${SITE_NAME}: ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description:
    "Professionisti e aziende vicino a te classificati per recensioni, con le schede in evidenza segnalate. Contatti diretti, preventivi gratis.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-icon.png",
  },
};

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Clarity è l'unico pezzo che scrive cookie di terze parti: senza il suo
  // codice non si monta nemmeno la striscia del consenso.
  const { clarityId } = await settings.tracking();
  return (
    <html lang="it" className={`${onest.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans">
        {/* Identità del sito e ricerca interna: valgono per ogni pagina pubblica. */}
        <JsonLd data={websiteJsonLd()} />
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": `${absoluteUrl("/")}#organizzazione`,
            name: SITE_NAME,
            url: absoluteUrl("/"),
            description: SITE_TAGLINE,
            areaServed: { "@type": "Country", name: "Italia" },
            logo: { "@type": "ImageObject", url: absoluteUrl("/logo-icona.png"), width: 512, height: 512 },
            image: absoluteUrl("/logo.png"),
          }}
        />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Track />
        {clarityId && <Consenso clarityId={clarityId} />}
      </body>
    </html>
  );
}
