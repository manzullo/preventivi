#!/bin/sh
# Avvio in container: solo il server. Le migrazioni le applica il deploy con un
# contenitore usa e getta (vedi scripts/migra.sh): l'immagine di produzione
# contiene i moduli tracciati da Next, non l'intero strumento di Prisma.
set -e
exec node server.js
