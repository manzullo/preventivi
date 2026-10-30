// Da dove arriva davvero una visita.
//
// "Diretto" è il cestino dove finisce tutto ciò che non si sa riconoscere, e
// per questo è la voce che inganna di più: dentro ci stanno i segnalibri, i
// link aperti da un'applicazione e chi arriva da una ricerca senza che il
// browser lo dica. Qui il referrer viene letto per quello che è, e le famiglie
// restano poche e distinte, perché servono a decidere: la ricerca si lavora con
// i contenuti, le campagne con i soldi, gli assistenti con le citazioni.
//
// I link interni non sono una sorgente: una pagina del sito che ne apre
// un'altra non ha portato nessuno da fuori.

export type Famiglia = "ads" | "campagna" | "ricerca" | "llm" | "social" | "sito" | "diretto";

export type Sorgente = {
  famiglia: Famiglia;
  /** Come si chiama in pagina: "Google", "ChatGPT", "da corriere.it". */
  nome: string;
};

export const FAMIGLIE: { chiave: Famiglia; nome: string; spiega: string }[] = [
  { chiave: "ricerca", nome: "Motori di ricerca", spiega: "Google, Bing e gli altri, risultati non a pagamento" },
  { chiave: "llm", nome: "Assistenti AI", spiega: "ChatGPT, Claude, Perplexity, Copilot, Gemini" },
  { chiave: "ads", nome: "Google Ads", spiega: "clic pagati, riconosciuti dal gclid" },
  { chiave: "campagna", nome: "Campagne", spiega: "link con i parametri utm" },
  { chiave: "social", nome: "Social", spiega: "Facebook, Instagram, LinkedIn, X, TikTok, Reddit" },
  { chiave: "sito", nome: "Altri siti", spiega: "link da pagine di terzi" },
  { chiave: "diretto", nome: "Diretto o non rilevato", spiega: "nessuna provenienza registrata" },
];

const MOTORI = ["google.", "bing.", "duckduckgo.", "ecosia.", "yahoo.", "yandex.", "qwant.", "startpage.", "brave."];

// Gli assistenti mandano traffico e il referrer lo dichiara: è l'unico modo che
// abbiamo per misurare se le pagine scritte per farsi citare funzionano.
const ASSISTENTI: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "perplexity.ai": "Perplexity",
  "copilot.microsoft.com": "Copilot",
  "gemini.google.com": "Gemini",
  "bard.google.com": "Gemini",
  "you.com": "You.com",
  "poe.com": "Poe",
  "mistral.ai": "Le Chat",
};

const SOCIAL: Record<string, string> = {
  "facebook.com": "Facebook",
  "m.facebook.com": "Facebook",
  "l.facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "l.instagram.com": "Instagram",
  "linkedin.com": "LinkedIn",
  "lnkd.in": "LinkedIn",
  "t.co": "X",
  "x.com": "X",
  "twitter.com": "X",
  "tiktok.com": "TikTok",
  "reddit.com": "Reddit",
  "out.reddit.com": "Reddit",
  "youtube.com": "YouTube",
  "pinterest.com": "Pinterest",
  "whatsapp.com": "WhatsApp",
  "telegram.org": "Telegram",
};

function host(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function classificaSorgente(
  v: { referrer?: string | null; utmSource?: string | null; utmMedium?: string | null; gclid?: string | null },
  dominioSito = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost").hostname.replace(/^www\./, ""),
): Sorgente {
  if (v.gclid) return { famiglia: "ads", nome: "Google Ads" };

  const h = v.referrer ? host(v.referrer) : null;

  // Un link da una pagina del sito stesso non ha portato nessuno da fuori: la
  // provenienza vera è quella con cui la visita è cominciata.
  const interno = Boolean(h && (h === dominioSito || h.endsWith(`.${dominioSito}`) || h === "localhost"));

  if (v.utmSource) {
    const s = v.utmSource.toLowerCase();
    // Una campagna su Google resta una campagna, ma il nome dice quale.
    return { famiglia: "campagna", nome: v.utmMedium ? `${s} / ${v.utmMedium}` : s };
  }

  if (h && !interno) {
    const assistente = Object.entries(ASSISTENTI).find(([d]) => h === d || h.endsWith(`.${d}`));
    if (assistente) return { famiglia: "llm", nome: assistente[1] };

    const social = Object.entries(SOCIAL).find(([d]) => h === d || h.endsWith(`.${d}`));
    if (social) return { famiglia: "social", nome: social[1] };

    if (MOTORI.some((m) => h.startsWith(m) || h.includes(`.${m}`))) {
      const nome = h.split(".")[0];
      return { famiglia: "ricerca", nome: nome.charAt(0).toUpperCase() + nome.slice(1) };
    }

    return { famiglia: "sito", nome: `da ${h}` };
  }

  return { famiglia: "diretto", nome: "Diretto o non rilevato" };
}
