// Crea (o aggiorna) un utente del pannello con password generata.
//   tsx scripts/crea-utente.ts --email luca@esempio.it --nome Luca --ruolo editor
// La password compare una volta sola qui: si copia e si consegna a voce o per
// un canale sicuro. Nel database resta solo l'impronta.
// Per impostare una password scelta, passala nell'ambiente (non sulla riga di
// comando, che resta nella cronologia) e non viene stampata:
//   read -rs NUOVA_PASSWORD && export NUOVA_PASSWORD && tsx scripts/crea-utente.ts --email … --ruolo owner
import fs from "node:fs";
for (const line of (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
import { db } from "../src/lib/db";
import { generaPassword, hashPassword } from "../src/lib/password";

const args = process.argv.slice(2);
const opt = (k: string, d = "") => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

async function main() {
  const email = opt("--email").trim().toLowerCase();
  if (!email.includes("@")) throw new Error("serve --email");
  const ruolo = ["owner", "editor", "viewer"].includes(opt("--ruolo", "editor")) ? opt("--ruolo", "editor") : "editor";
  const scelta = process.env.NUOVA_PASSWORD || "";
  if (scelta && scelta.length < 8) throw new Error("NUOVA_PASSWORD troppo corta (minimo 8 caratteri)");
  const pw = scelta || generaPassword();
  const dati = { name: opt("--nome") || null, role: ruolo, password: hashPassword(pw), active: true };
  const u = await db.adminUser.upsert({ where: { email }, create: { email, ...dati }, update: dati });
  console.log(JSON.stringify({ email: u.email, nome: u.name, ruolo: u.role, password: scelta ? "(quella scelta, non stampata)" : pw }, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
