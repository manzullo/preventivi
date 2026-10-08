// Promessa, etichetta del CTA e microcopy in un punto solo: il neurobranding
// vive di ripetizione identica (hero, listing, form, scheda, grazie).

export const PROMISE = "Ordine per recensioni. Le schede in evidenza sono segnalate.";
// Etichetta presa da Instapro: un verbo che dice cosa succede al click
// ("invia"), non una promessa astratta. Il "gratis" sta nel microcopy sotto.
export const CTA_LABEL = "Invia la tua richiesta";
export const CTA_MICRO = "2 minuti · gratis · nessuna registrazione · senza intermediari";
export const CTA_QUESTION = "Non vuoi chiamarli uno per uno?";
export const CTA_TEXT = "Un modulo solo: i professionisti adatti ti rispondono e parli direttamente con loro, senza commissioni.";
/** I tre passi, uguali in home e accanto al modulo (lo schema di Instapro). */
export const HOW_IT_WORKS: [string, string][] = [
  ["Invia gratis la tua richiesta", "Che lavoro, dove e quando: due minuti, nessun account."],
  ["Ricevi le risposte dei professionisti", "Giriamo la richiesta ai professionisti della zona scelti per recensioni, non per chi paga. Ti contattano loro."],
  ["Confronta i profili e scegli", "Recensioni con la fonte, lavori e prezzi: scegli chi ti convince e ci parli direttamente."],
];

/** Invito per chi lavora, ripetuto in testata, home e pagina professionisti. */
export const PRO_CTA_LABEL = "Iscriviti gratis";
export const PRO_CTA_QUESTION = "Sei un professionista?";

/**
 * Quanti professionisti ricevono al massimo una richiesta. Resta il limite tecnico,
 * ma non si scrive più nei testi che invitano: un numero piccolo in mezzo a un
 * invito suona come un tetto, non come un servizio.
 */
export const MAX_QUOTES = 3;

/** Soglia sotto cui i numeri di prova sociale non si mostrano (sarebbero deboli). */
export const SOCIAL_PROOF_MIN = 20;
