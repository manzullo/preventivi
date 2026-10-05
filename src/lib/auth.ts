// Accesso al pannello: utenti con ruolo nella tabella AdminUser, più le
// credenziali in variabile d'ambiente come porta di servizio del proprietario.
// La sessione è un cookie firmato che porta email e ruolo, così ogni pagina sa
// chi ha davanti senza interrogare il database.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const ADMIN_COOKIE = "ma_admin";
const TTL_MS = 1000 * 60 * 60 * 24 * 14;

const secret = () => process.env.APP_SECRET || "dev-secret-change-me";

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Cosa può fare ciascun ruolo. Chi non compare, non entra. */
export const RUOLI = {
  owner: "tutto, compresi utenti e impostazioni",
  editor: "schede, pagine, richieste e priorità",
  viewer: "solo lettura",
} as const;
export type Ruolo = keyof typeof RUOLI;

export type Sessione = { email: string; ruolo: Ruolo };

export function makeToken(email = "", ruolo: Ruolo = "owner"): string {
  // L'email viaggia codificata: nel cookie non devono finire punti extra che
  // spezzerebbero il conteggio delle parti.
  const p = `admin.${Buffer.from(email).toString("base64url")}.${ruolo}.${Date.now() + TTL_MS}`;
  return `${p}.${sign(p)}`;
}

/** Sessione valida, oppure niente. Vale anche per i cookie del vecchio formato. */
export function leggiToken(t: string | undefined): Sessione | null {
  if (!t) return null;
  const i = t.lastIndexOf(".");
  if (i < 0) return null;
  const p = t.slice(0, i);
  const sig = t.slice(i + 1);
  const want = sign(p);
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;

  const parti = p.split(".");
  // Formato vecchio, "admin.<scadenza>": vale ancora, ed è del proprietario.
  if (parti.length === 2) {
    const exp = Number(parti[1]);
    return exp && exp > Date.now() ? { email: process.env.ADMIN_EMAIL ?? "", ruolo: "owner" } : null;
  }
  if (parti.length !== 4) return null;
  const exp = Number(parti[3]);
  if (!exp || exp < Date.now()) return null;
  const ruolo = parti[2] as Ruolo;
  if (!(ruolo in RUOLI)) return null;
  return { email: Buffer.from(parti[1], "base64url").toString("utf8"), ruolo };
}

export function verifyToken(t: string | undefined): boolean {
  return leggiToken(t) !== null;
}

function same(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Controlla le credenziali: prima gli utenti in tabella, poi le variabili
 * d'ambiente. Quelle restano come porta di servizio del proprietario, utile
 * quando il database non ha ancora nessun utente o si perde l'accesso.
 */
export async function checkCredentials(email: string, pw: string): Promise<Sessione | null> {
  const mail = email.trim().toLowerCase();
  if (!mail || !pw) return null;

  const u = await db.adminUser.findUnique({ where: { email: mail } });
  if (u && u.active && verifyPassword(pw, u.password)) {
    await db.adminUser.update({ where: { id: u.id }, data: { lastLogin: new Date() } });
    return { email: u.email, ruolo: (u.role in RUOLI ? u.role : "viewer") as Ruolo };
  }
  if (u) return null; // utente noto ma password sbagliata: non si prova altro

  const wantEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const wantPw = process.env.ADMIN_PASSWORD || "";
  if (!wantEmail || !wantPw) return null;
  return same(wantEmail, mail) && same(wantPw, pw) ? { email: wantEmail, ruolo: "owner" } : null;
}

export async function sessione(): Promise<Sessione | null> {
  const c = await cookies();
  return leggiToken(c.get(ADMIN_COOKIE)?.value);
}

export async function isAdmin(): Promise<boolean> {
  return (await sessione()) !== null;
}

export async function requireAdmin(): Promise<Sessione> {
  const s = await sessione();
  if (!s) redirect("/admin/login/");
  return s;
}

/** Pagine riservate a certi ruoli: chi non ce l'ha torna alla dashboard. */
export async function requireRuolo(...ruoli: Ruolo[]): Promise<Sessione> {
  const s = await requireAdmin();
  if (!ruoli.includes(s.ruolo)) redirect("/admin/?msg=" + encodeURIComponent("Non hai i permessi per quella sezione"));
  return s;
}

/** Chi guarda e basta non deve poter salvare: si usa prima di ogni scrittura. */
export async function requireScrittura(): Promise<Sessione> {
  return requireRuolo("owner", "editor");
}
