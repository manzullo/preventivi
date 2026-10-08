import type { Metadata } from "next";
import { Onest } from "next/font/google";
import "@/app/globals.css";

const onest = Onest({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin Mister Wolf" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${onest.variable} h-full antialiased`}>
      <body className="min-h-full bg-surface font-sans">{children}</body>
    </html>
  );
}
