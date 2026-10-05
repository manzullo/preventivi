#!/usr/bin/env bash
# Deploy di Mister Wolf sulla VPS IONOS.
#   ./scripts/deploy.sh
# Cosa fa: copia il codice, applica le migrazioni con un contenitore usa e
# getta, ricostruisce l'immagine e riavvia. Il database resta dov'è.
#
# Sul server servono, dentro /root/preventivi/.env:
#   DATABASE_URL        indirizzo interno (host "db"), usato a regime
#   DATABASE_URL_BUILD  stesso database via 127.0.0.1:5434, usato dalla build
#   NEXT_PUBLIC_SITE_URL, POSTGRES_*, APP_SECRET, ADMIN_*, CRON_KEY
# La build legge il database (genera sitemap e pagine statiche) e incorpora
# l'indirizzo pubblico nel codice: entrambi arrivano come argomenti di build.
set -euo pipefail
HOST="${DEPLOY_HOST:-root@217.154.105.171}"
DIR="${DEPLOY_DIR:-/root/preventivi}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/ionos_vps}"

rsync -az --delete -e "ssh -i $KEY" \
  --exclude node_modules --exclude .next --exclude .git --exclude .claude --exclude .env \
  --exclude '*.db' --exclude 'data/raw' ./ "$HOST:$DIR/"

ssh -i "$KEY" "$HOST" "cd $DIR && sh scripts/migra.sh && docker compose up -d --build && sleep 15 && docker compose ps"
curl -sI "${NEXT_PUBLIC_SITE_URL:?NEXT_PUBLIC_SITE_URL}/" | head -1
