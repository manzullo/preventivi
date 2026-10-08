import { PrismaClient } from "@/generated/prisma";

// Un solo client per processo: in dev Next.js ricarica i moduli e senza
// questo guard aprirebbe una connessione a ogni hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
