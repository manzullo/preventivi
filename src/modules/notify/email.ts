import nodemailer from "nodemailer";
import { settings } from "@/lib/settings";

export async function sendEmail(to: string[], subject: string, text: string): Promise<void> {
  const s = await settings.smtp();
  if (!s.host || !s.from) throw new Error("SMTP non configurato");
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
  });
  // Il mittente resta l'indirizzo del dominio che ha la posta configurata; il
  // nome visibile è quello del sito, così chi riceve legge "Mister Wolf".
  const from = s.fromName ? `"${s.fromName.replace(/"/g, "")}" <${s.from}>` : s.from;
  await transport.sendMail({ from, to: to.join(", "), subject, text, ...(s.replyTo ? { replyTo: s.replyTo } : {}) });
}
