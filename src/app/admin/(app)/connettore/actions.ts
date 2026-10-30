"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRuolo } from "@/lib/auth";
import { creaChiave } from "@/modules/analisi/motore";

function torna(msg: string, chiave?: string): never {
  const q = new URLSearchParams({ msg });
  if (chiave) q.set("chiave", chiave);
  redirect(`/admin/connettore/?${q.toString()}`);
}

/**
 * Solo chi può scrivere può creare una chiave: chi la ottiene vede i numeri di
 * tutto il sito, e una chiave in mano a un assistente vive finché non la revochi.
 */
export async function nuovaChiave(fd: FormData) {
  const s = await requireRuolo("owner", "editor");
  const nome = String(fd.get("nome") ?? "").trim();
  if (!nome) torna("Dai un nome alla chiave: serve a ricordarsi dove l'hai messa");

  const chiave = await creaChiave(nome, s.email);
  await db.changelogEntry.create({ data: { area: "site", action: "api_key_create", subject: nome, actor: s.email } });
  revalidatePath("/admin/connettore/");
  // La chiave si vede una volta sola: dopo resta solo la sua impronta.
  torna("Chiave creata. Copiala adesso: non sarà più visibile.", chiave);
}

export async function revocaChiave(fd: FormData) {
  const s = await requireRuolo("owner", "editor");
  const id = String(fd.get("id") ?? "");
  const k = await db.apiKey.findUnique({ where: { id }, select: { nome: true } });
  if (!k) torna("Chiave non trovata");
  await db.apiKey.update({ where: { id }, data: { attiva: false, revocataIl: new Date() } });
  await db.changelogEntry.create({ data: { area: "site", action: "api_key_revoke", subject: k.nome, actor: s.email } });
  revalidatePath("/admin/connettore/");
  torna(`Revocata: ${k.nome}. Da adesso non funziona più.`);
}
