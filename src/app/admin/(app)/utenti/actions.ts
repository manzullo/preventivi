"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RUOLI, requireRuolo, sessione, type Ruolo } from "@/lib/auth";
import { generaPassword, hashPassword } from "@/lib/password";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ruoloValido = (r: string): Ruolo => (r in RUOLI ? (r as Ruolo) : "viewer");

/** Nuovo utente con password generata: si mostra una volta sola, poi sparisce. */
export async function creaUtente(fd: FormData) {
  await requireRuolo("owner");
  const email = str(fd, "email").toLowerCase();
  if (!email.includes("@")) redirect("/admin/utenti/?msg=" + encodeURIComponent("Email non valida"));

  const esiste = await db.adminUser.findUnique({ where: { email }, select: { id: true } });
  if (esiste) redirect("/admin/utenti/?msg=" + encodeURIComponent("Esiste già un utente con questa email"));

  const pw = generaPassword();
  await db.adminUser.create({
    data: { email, name: str(fd, "nome") || null, role: ruoloValido(str(fd, "ruolo")), password: hashPassword(pw) },
  });
  await db.changelogEntry.create({ data: { area: "site", action: "user_create", subject: email, actor: "admin" } });
  revalidatePath("/admin/utenti/");
  // La password passa una volta sola nell'indirizzo, poi resta solo l'impronta.
  redirect(`/admin/utenti/?nuovo=${encodeURIComponent(email)}&pw=${encodeURIComponent(pw)}`);
}

/** Nuova password per un utente che l'ha persa. */
export async function rigeneraPassword(fd: FormData) {
  await requireRuolo("owner");
  const id = str(fd, "id");
  const u = await db.adminUser.findUnique({ where: { id }, select: { email: true } });
  if (!u) redirect("/admin/utenti/");
  const pw = generaPassword();
  await db.adminUser.update({ where: { id }, data: { password: hashPassword(pw) } });
  await db.changelogEntry.create({ data: { area: "site", action: "user_password", subject: u.email, actor: "admin" } });
  revalidatePath("/admin/utenti/");
  redirect(`/admin/utenti/?nuovo=${encodeURIComponent(u.email)}&pw=${encodeURIComponent(pw)}`);
}

/** Accende o spegne un utente: spento non entra più, ma resta nello storico. */
export async function cambiaStato(fd: FormData) {
  await requireRuolo("owner");
  const id = str(fd, "id");
  const u = await db.adminUser.findUnique({ where: { id }, select: { email: true, active: true } });
  if (!u) redirect("/admin/utenti/");
  const io = await sessione();
  if (io?.email === u.email) redirect("/admin/utenti/?msg=" + encodeURIComponent("Non puoi disattivare te stesso"));
  await db.adminUser.update({ where: { id }, data: { active: !u.active } });
  revalidatePath("/admin/utenti/");
}

/** Cambio di ruolo. Nessuno può togliersi i permessi da solo. */
export async function cambiaRuolo(fd: FormData) {
  await requireRuolo("owner");
  const id = str(fd, "id");
  const u = await db.adminUser.findUnique({ where: { id }, select: { email: true } });
  if (!u) redirect("/admin/utenti/");
  const io = await sessione();
  if (io?.email === u.email) redirect("/admin/utenti/?msg=" + encodeURIComponent("Non puoi cambiare il tuo ruolo"));
  await db.adminUser.update({ where: { id }, data: { role: ruoloValido(str(fd, "ruolo")) } });
  await db.changelogEntry.create({ data: { area: "site", action: "user_role", subject: u.email, actor: "admin" } });
  revalidatePath("/admin/utenti/");
}
