# Guida Agenzie: build standalone Next.js 16 + Prisma 6 (Postgres esterno).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next genera in questa fase sitemap e pagine statiche leggendo il database:
# senza l'indirizzo la build si ferma.
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
# L'indirizzo pubblico finisce dentro il codice compilato (canonical, sitemap,
# robots, dati strutturati): se manca qui, il sito pubblica link a localhost.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# Fondo della mappa: anche questo finisce dentro il codice compilato. Se
# restano vuote valgono i valori scritti in AgencyMap.tsx (OpenStreetMap
# standard, senza chiave); servono per passare a un altro fornitore.
ARG NEXT_PUBLIC_TILE_URL
ENV NEXT_PUBLIC_TILE_URL=$NEXT_PUBLIC_TILE_URL
ARG NEXT_PUBLIC_TILE_ATTRIBUTION
ENV NEXT_PUBLIC_TILE_ATTRIBUTION=$NEXT_PUBLIC_TILE_ATTRIBUTION
ARG NEXT_PUBLIC_TILE_FILTER
ENV NEXT_PUBLIC_TILE_FILTER=$NEXT_PUBLIC_TILE_FILTER
ENV NEXT_TELEMETRY_DISABLED=1
# Tetto alle risorse della compilazione: sulla VPS questa fase convive con una
# cinquantina di contenitori su 7,8 GB, e senza limite ha già fatto cadere la
# macchina (17/09/2026). Di libero lì ce n'è circa 2 GB: due processi da 1 GB
# ci stanno, i nove che Next aprirebbe da solo no.
ENV NEXT_BUILD_CPUS=2 NODE_OPTIONS=--max-old-space-size=1024
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4450 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/generated/prisma ./src/generated/prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY scripts/start.sh ./start.sh
EXPOSE 4450
CMD ["sh", "./start.sh"]
