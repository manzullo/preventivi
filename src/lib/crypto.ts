// Cifratura a riposo dei segreti (SMTP, token OAuth): AES-256-GCM con chiave
// derivata da APP_SECRET.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const key = () => createHash("sha256").update(process.env.APP_SECRET || "dev-secret-change-me").digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(token: string): string {
  const [iv, tag, data] = token.split(".");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/**
 * Firma corta di un valore (es. l'id di una richiesta): fa da chiave nei link
 * mandati per email al cliente, così la pagina si apre senza login e senza
 * che basti indovinare un id.
 */
export function firma(value: string): string {
  return createHmac("sha256", key()).update(value).digest("base64url").slice(0, 22);
}

export function firmaValida(value: string, k: string | undefined): boolean {
  if (!k) return false;
  const a = Buffer.from(firma(value));
  const b = Buffer.from(k);
  return a.length === b.length && timingSafeEqual(a, b);
}
