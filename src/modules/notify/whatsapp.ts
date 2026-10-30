// WhatsApp via Evolution API (self-hosted) oppure CallMeBot (personale).

import { settings } from "@/lib/settings";

export async function sendWhatsapp(numbers: string[], text: string): Promise<void> {
  const s = await settings.whatsapp();
  if (s.provider === "none") throw new Error("WhatsApp non configurato");
  for (const raw of numbers) {
    const number = raw.replace(/[^\d]/g, "");
    if (s.provider === "evolution") {
      const res = await fetch(`${s.evolutionUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(s.evolutionInstance)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: s.evolutionKey },
        body: JSON.stringify({ number, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Evolution HTTP ${res.status}`);
    } else {
      const url = `https://api.callmebot.com/whatsapp.php?phone=${number}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(s.callmebotKey)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`CallMeBot HTTP ${res.status}`);
    }
  }
}
