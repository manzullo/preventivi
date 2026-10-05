# Mister Wolf

Directory di professionisti e aziende con richiesta di preventivo, stile
ProntoPro: pagine per categoria, città e categoria × città, schede con
recensioni e form multi-step che gira la richiesta a fino a 3 professionisti.

Il nome è provvisorio. Il motore viene da [guidaagenzie](https://github.com/manzullo/guidaagenzie)
(stesso stack: Next.js 16, Prisma, Postgres, Tailwind 4). Piano in
[`docs/PIANO.md`](docs/PIANO.md), fonti dati in [`docs/FONTI-DATI.md`](docs/FONTI-DATI.md).

## Avvio in locale

```bash
cp .env.example .env              # e compila DATABASE_URL, APP_SECRET, ADMIN_*
npm ci
npx prisma migrate deploy
set -a; . ./.env; set +a          # gli script tsx leggono l'ambiente
npm run seed                      # città, categorie, concorrenti, form
npm run fixture                   # 50 schede finte su Roma, Milano, Torino
npm run dev                       # http://localhost:4450
```

`npm run fixture:clear` toglie le schede finte.
