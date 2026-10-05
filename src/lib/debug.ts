// Log tecnico (port di PSF_Debug): scrive su DebugLog e in console. Mai
// bloccante: gli errori di scrittura del log non fermano il chiamante.

import type { Prisma } from "@/generated/prisma";
import { db } from "./db";

type Level = "info" | "warn" | "error";

async function write(level: Level, area: string, message: string, meta?: unknown) {
  const line = `[${area}] ${message}`;
  if (level === "error") console.error(line, meta ?? "");
  else if (level === "warn") console.warn(line, meta ?? "");
  try {
    await db.debugLog.create({
      data: { level, area, message: message.slice(0, 1000), meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  } catch {
    /* il DB potrebbe non essere raggiungibile: il log resta in console */
  }
}

export const debug = {
  info: (area: string, message: string, meta?: unknown) => write("info", area, message, meta),
  warn: (area: string, message: string, meta?: unknown) => write("warn", area, message, meta),
  error: (area: string, message: string, meta?: unknown) => write("error", area, message, meta),
  /** Tiene solo gli ultimi `keep` record. */
  prune: async (keep = 5000) => {
    const old = await db.debugLog.findMany({ orderBy: { createdAt: "desc" }, skip: keep, take: 1, select: { createdAt: true } });
    if (old[0]) await db.debugLog.deleteMany({ where: { createdAt: { lte: old[0].createdAt } } });
  },
};
