"""Prova di Scrapling sulle fonti non protette, accanto ai nostri scraper.

Prende un campione di schede dal database (PagineGialle: la pagina della
scheda; siti dei professionisti: la home), rilegge le stesse pagine con il
Fetcher semplice di Scrapling e confronta campo per campo cosa trova in più o
in meno rispetto a quello che abbiamo già salvato.

Regole, uguali a quelle di http.ts:
  - robots.txt rispettato, pausa minima per sito, User-Agent dichiarato;
  - niente StealthyFetcher/PlayWrightFetcher, niente impersonate o header
    "stealth": nessun aggiramento di controlli anti-bot. Su siti protetti
    (Cloudflare & co.) la pagina semplicemente non si legge e si segnala.
Non scrive nel database: il risultato va in data/raw/scrapling-prova.json.

Uso (dalla cartella preventivi, con DATABASE_URL nel .env):
  python3 -m pip install "scrapling[fetchers]"
  python3 -I scripts/py/scrapling_prova.py --pg 20 --siti 20
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.robotparser
from urllib.parse import urlparse

from scrapling.fetchers import Fetcher
from scrapling.parser import Selector

UA = os.environ.get("SCRAPER_UA", "MisterWolfBot/0.1 (+https://github.com/manzullo/preventivi)")
PAUSA_S = 3.0

TEL = re.compile(r"(?:\+39[\s.-]?)?(?:0\d{1,3}|3\d{2})[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{1,4})?")
MAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]{2,}")
PIVA = re.compile(r"(?:P\.?\s?IVA|partita\s+iva|VAT)[^\d]{0,15}(?:IT)?\s?(\d{11})", re.I)
SOCIAL = re.compile(r"https?://(?:www\.)?(facebook|instagram|linkedin|youtube|tiktok)\.com/[^\s\"'<>]+", re.I)


def env():
    if os.path.exists(".env"):
        for riga in open(".env", encoding="utf8"):
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", riga.strip())
            if m and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip('"')


def query(sql):
    url = os.environ["DATABASE_URL"].split("?")[0]
    out = subprocess.run(["psql", url, "-At", "-c", f"select json_agg(t) from ({sql}) t"], capture_output=True, text=True, check=True).stdout.strip()
    return json.loads(out) if out else []


_robots = {}
_ultimo = {}


def permesso(url):
    o = urlparse(url)
    base = f"{o.scheme}://{o.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser(base + "/robots.txt")
        try:
            rp.read()
        except Exception:
            rp = None
        _robots[base] = rp
    rp = _robots[base]
    return True if rp is None else rp.can_fetch(UA, url)


def leggi(url):
    if not permesso(url):
        return None, "robots.txt lo vieta"
    host = urlparse(url).netloc
    attesa = PAUSA_S - (time.time() - _ultimo.get(host, 0))
    if attesa > 0:
        time.sleep(attesa)
    _ultimo[host] = time.time()
    try:
        r = Fetcher.get(url, headers={"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9"}, stealthy_headers=False, impersonate=None, timeout=20, follow_redirects=True)
    except Exception as e:  # rete, TLS, timeout
        return None, f"errore: {str(e)[:80]}"
    if r.status >= 400:
        return None, f"HTTP {r.status}"
    return r, None


def jsonld(page):
    out = []
    for raw in page.css('script[type="application/ld+json"]::text').getall():
        try:
            x = json.loads(raw)
        except Exception:
            continue
        pila = [x]
        while pila:
            o = pila.pop()
            if isinstance(o, list):
                pila.extend(o)
            elif isinstance(o, dict):
                out.append(o)
                for k in ("@graph", "itemListElement", "item"):
                    if k in o:
                        pila.append(o[k])
    return out


def estrai(page):
    """Tutto quello che Scrapling sa tirare fuori dalla pagina, senza regole per sito."""
    testo = page.get_all_text(ignore_tags=("script", "style"))
    ld = [o for o in jsonld(page) if o.get("name") and (o.get("telephone") or o.get("address") or o.get("aggregateRating"))]
    biz = ld[0] if ld else {}
    agg = biz.get("aggregateRating") or {}
    # Prima il JSON-LD, poi i link tel:, solo alla fine il testo (dove una
    # partita IVA di 11 cifre somiglia a un numero: si scarta).
    tel = [biz["telephone"]] if isinstance(biz.get("telephone"), str) else []
    tel = tel or [h[4:] for h in page.css('a[href^="tel:"]::attr(href)').getall()]
    tel = tel or [t for t in TEL.findall(testo) if not re.fullmatch(r"\d{11}", t.strip())][:3]
    mail = [h[7:].split("?")[0] for h in page.css('a[href^="mailto:"]::attr(href)').getall()] or MAIL.findall(testo)[:3]
    orari = biz.get("openingHours") or biz.get("openingHoursSpecification")
    immagini = [i for i in [page.css('meta[property="og:image"]::attr(content)').get(), *([biz.get("image")] if isinstance(biz.get("image"), str) else (biz.get("image") or []))] if i]
    return {
        "nome": biz.get("name") or page.css("title::text").get(),
        "telefono": tel[0].strip() if tel else None,
        "email": mail[0].strip() if mail else None,
        "piva": (PIVA.search(testo) or [None, None])[1],
        "indirizzo": (biz.get("address") or {}).get("streetAddress") if isinstance(biz.get("address"), dict) else None,
        "descrizione": biz.get("description") or page.css('meta[name="description"]::attr(content)').get(),
        "orari": bool(orari),
        "immagini": len(immagini),
        "social": sorted({m.group(1).lower() for m in SOCIAL.finditer(page.html_content if hasattr(page, "html_content") else str(page))}),
        "voto": agg.get("ratingValue"),
        "n_recensioni": agg.get("reviewCount") or agg.get("ratingCount"),
        "recensioni_testo": len([r for r in (biz.get("review") or []) if isinstance(r, dict)]) if isinstance(biz.get("review"), list) else 0,
    }


def nostri(r):
    return {
        "telefono": r.get("phone"),
        "email": r.get("email"),
        "piva": r.get("vatNumber"),
        "indirizzo": r.get("street"),
        "descrizione": r.get("description"),
        "social": sorted((r.get("social") or {}).keys()),
        "immagini": 1 if r.get("logoUrl") else 0,
        "n_recensioni": r.get("reviewCount"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pg", type=int, default=20)
    ap.add_argument("--siti", type=int, default=20)
    a = ap.parse_args()
    env()
    cols = 'id, name, phone, email, "vatNumber", street, description, social, "logoUrl", "reviewCount", "sourceUrl", website'
    campione = [("paginegialle", r["sourceUrl"], r) for r in query(f"select {cols} from \"Agency\" where source='paginegialle' and \"sourceUrl\" is not null order by random() limit {a.pg}")]
    campione += [("sito", r["website"], r) for r in query(f"select {cols} from \"Agency\" where website is not null and website like 'http%' order by random() limit {a.siti}")]

    righe = []
    for fonte, url, r in campione:
        page, errore = leggi(url)
        s = estrai(page) if page else None
        righe.append({"fonte": fonte, "url": url, "nome": r["name"], "errore": errore, "scrapling": s, "nostri": nostri(r)})
        print(f"{fonte:12} {'OK ' if s else 'NO '} {url[:70]} {errore or ''}", flush=True)

    # Riepilogo: per ogni campo, quante schede lo hanno da noi e quante da Scrapling, e quante solo da Scrapling.
    campi = ["telefono", "email", "piva", "indirizzo", "descrizione", "social", "immagini", "n_recensioni"]
    extra = ["orari", "voto", "recensioni_testo"]
    riepilogo = {}
    for fonte in ("paginegialle", "sito"):
        rr = [x for x in righe if x["fonte"] == fonte]
        lette = [x for x in rr if x["scrapling"]]
        tab = {"campione": len(rr), "lette": len(lette)}
        for c in campi:
            noi = sum(1 for x in lette if x["nostri"][c])
            loro = sum(1 for x in lette if x["scrapling"][c])
            solo = sum(1 for x in lette if x["scrapling"][c] and not x["nostri"][c])
            tab[c] = {"noi": noi, "scrapling": loro, "solo_scrapling": solo}
        for c in extra:
            tab[c] = {"scrapling": sum(1 for x in lette if x["scrapling"][c])}
        riepilogo[fonte] = tab

    os.makedirs("data/raw", exist_ok=True)
    json.dump({"riepilogo": riepilogo, "righe": righe}, open("data/raw/scrapling-prova.json", "w", encoding="utf8"), ensure_ascii=False, indent=1, default=str)
    print(json.dumps(riepilogo, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.exit(main())
