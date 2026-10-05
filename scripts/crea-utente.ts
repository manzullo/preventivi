// Crea un utente del pannello con password generata.
//   tsx scripts/crea-utente.ts --email luca@esempio.it --nome Luca --ruolo editor
// La password compare una volta sola qui: si copia e si consegna a voce o per
// un canale sicuro. Nel database resta solo l'impronta.
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
  const pw = generaPassword();
  const dati = { name: opt("--nome") || null, role: ruolo, password: hashPassword(pw), active: true };
  const u = await db.adminUser.upsert({ where: { email }, create: { email, ...dati }, update: dati });
  console.log(JSON.stringify({ email: u.email, nome: u.name, ruolo: u.role, password: pw }, null, 1));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
