#!/bin/sh
# Applica le migrazioni al database di produzione, da eseguire sul server
# dentro /root/preventivi. Usa un contenitore usa e getta, così l'immagine
# dell'applicazione resta leggera.
set -e
cd "$(dirname "$0")/.."
DB=$(grep '^DATABASE_URL_BUILD=' .env | cut -d= -f2- | tr -d '"')
docker run --rm --network host -v "$PWD:/app" -w /app -e DATABASE_URL="$DB" \
  node:22-alpine npx --yes prisma@6.19.3 migrate deploy --schema prisma/schema
