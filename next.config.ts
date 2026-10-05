import type { NextConfig } from "next";

// Quanti processi paralleli può usare la compilazione per generare le pagine.
//
// Di suo Next ne apre uno per core: sul Mac va benissimo, sulla VPS no. Lì la
// compilazione gira dentro Docker accanto a una cinquantina di contenitori, e
// nove processi che chiedono memoria insieme hanno già bloccato la macchina
// (17/09/2026: tutti i siti giù, riavvio forzato). Il valore arriva
// dall'ambiente, così il Mac resta veloce e il server resta in piedi.
const processiDiCompilazione = Number(process.env.NEXT_BUILD_CPUS) || undefined;

const nextConfig: NextConfig = {
  // Convenzione guidalocation: ogni URL pubblico termina con "/".
  trailingSlash: true,
  // Immagine Docker snella: server.js + tracce, senza node_modules interi.
  output: "standalone",
  ...(processiDiCompilazione ? { experimental: { cpus: processiDiCompilazione } } : {}),
};

export default nextConfig;
