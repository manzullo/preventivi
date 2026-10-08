// Proxy (ex middleware): assegna una volta per sessione il bucket A/B
// (0-99) con cui le pagine scelgono la variante di form, senza redirect.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get("ma_ab")) {
    res.cookies.set("ma_ab", String(Math.floor(Math.random() * 100)), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  }
  return res;
}

export const config = { matcher: ["/preventivo/:path*", "/embed/:path*"] };
