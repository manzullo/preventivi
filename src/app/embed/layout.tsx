import { Onest } from "next/font/google";
import "@/app/globals.css";

const onest = Onest({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-onest", display: "swap" });

// Root layout dell'embed: niente header/footer, sfondo trasparente.
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${onest.variable} antialiased`}>
      <head>
        <meta name="robots" content="noindex" />
      </head>
      <body className="bg-transparent font-sans">{children}</body>
    </html>
  );
}
