// Password del pannello: si salva l'impronta, mai il testo.
// scrypt sta nella libreria di Node, quindi niente dipendenze in più, ed è
// pensato apposta per essere lento e costoso da attaccare a forza bruta.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384; // costo: circa un decimo di secondo per tentativo
const LUNGHEZZA = 64;

/** Impronta da salvare: `scrypt$<sale>$<impronta>`. */
export function hashPassword(pw: string): string {
  const sale = randomBytes(16).toString("hex");
  const impronta = scryptSync(pw, sale, LUNGHEZZA, { N }).toString("hex");
  return `scrypt$${sale}$${impronta}`;
}

/** Confronto a tempo costante: due password sbagliate impiegano lo stesso tempo. */
export function verifyPassword(pw: string, salvata: string): boolean {
  const parti = salvata.split("$");
  if (parti.length !== 3 || parti[0] !== "scrypt") return false;
  const [, sale, atteso] = parti;
  try {
    const impronta = scryptSync(pw, sale, LUNGHEZZA, { N }).toString("hex");
    const a = Buffer.from(impronta, "hex");
    const b = Buffer.from(atteso, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Password casuale leggibile: fuori i caratteri che si confondono (zero e O,
 * uno e elle), così si può dettare al telefono senza sbagliare. Venti caratteri
 * da questo alfabeto valgono circa 116 bit, molto oltre quello che serve.
 */
export function generaPassword(lunghezza = 20): string {
  const alfabeto = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_";
  const byte = randomBytes(lunghezza * 3);
  const limite = 256 - (256 % alfabeto.length);
  let out = "";
  for (let i = 0; out.length < lunghezza && i < byte.length; i++) {
    // Si scartano i valori oltre il limite: altrimenti le prime lettere
    // dell'alfabeto uscirebbero più spesso delle altre.
    if (byte[i] >= limite) continue;
    out += alfabeto[byte[i] % alfabeto.length];
  }
  return out;
}
