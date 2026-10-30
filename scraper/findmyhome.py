import html as htmllib
import re
from urllib.parse import quote

from common import MAX_PRICE, MIN_AREA, Session, district_from_postcode, is_reserved, is_swap, listing, outdoor_from_text, to_float

NAME = "findmyhome"
BASE = "https://www.findmyhome.at"
# The result list takes at most 30 per page. The extra keys in "vars" mirror the detail search form
# (prb = price to, flv = area from); if findmyhome ignores them, the local filter below still applies.
VARS = f"id:13;w_m:1;land:AT;bl:9;prb:{MAX_PRICE};flv:{MIN_AREA};"
SEARCH = BASE + "/immo/wohnung-mieten/wien?id=13&entry={entry}&sort=&dir=DESC&pp=30&vars=" + quote(VARS) + "&lang=de&module=select&list="
PAGE_SIZE = 30
MAX_PAGES = 35
# Detail pages carry the gallery, the address and the outdoor areas. Only new listings are fetched,
# known ones reuse what an earlier run stored.
MAX_DETAILS = 60
PREVIOUS = {}
INFO = {}

OUTDOOR_ROWS = {"balkon": "Balkon", "terrasse": "Terrasse", "dachterrasse": "Terrasse", "loggia": "Loggia", "garten": "Garten"}


def _text(fragment):
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()


def _decode(resp):
    # The site declares nothing useful and serves Latin-1.
    return resp.content.decode("latin-1")


def parse(page):
    out = []
    for block in page.split("<!-- **** IMMO LIST ***** -->")[1:]:
        block = block.split("<!-- *** ROW END IMMO LIST *** -->")[0]
        m = re.search(r"<h3 class=\"obj_list\">(.*?)</h3>", block, re.S)
        if not m:
            continue
        link = re.search(r"href='/(\d+)[^']*'[^>]*>(.*?)</a>", m.group(1), re.S)
        if not link:
            continue
        oid, title = link.group(1), _text(link.group(2))
        desc = re.search(r'<p class="immobilie_description[^"]*">(.*?)<a href=', block, re.S)
        desc = _text(desc.group(1)) if desc else ""
        plz = re.search(r"<strong>Ort:\s*(\d{4})</strong>", block)
        price = re.search(r"<strong>Miete[n]?:\s*</strong><br>([^<]*)", block)
        area = re.search(r"<strong>Fl&auml;che:\s*</strong><br>\s*([\d.,]+)", block)
        rooms = re.search(r"<strong>Zimmer:\s*</strong><br>\s*([\d.,]+)", block)
        img = re.search(r"<img src='(http[^']+)'", block)
        postcode = plz.group(1) if plz else None
        out.append(
            listing(
                id=f"fmh-{oid}",
                platform=NAME,
                url=f"{BASE}/{oid}",
                title=title,
                price=to_float(price.group(1).replace(",-", "")) if price else None,
                price_note="Gesamtmiete laut Inserat",
                area=to_float(area.group(1)) if area else None,
                rooms=to_float(rooms.group(1)) if rooms else None,
                postcode=postcode,
                address=f"{postcode} Wien" if postcode else None,
                outdoor=outdoor_from_text(title, desc),
                swap=is_swap(title, desc),
                reserved=is_reserved(title, desc),
                image=img.group(1) if img else None,
            )
        )
    entries = [int(x) for x in re.findall(r"entry=(\d+)", page)]
    return out, (max(entries) + PAGE_SIZE if entries else len(out))


def parse_detail(page):
    rows = {}
    for k, v in re.findall(r"<tr><td>(.*?)</td><td align=\"right\">(.*?)</td></tr>", page, re.S):
        rows[_text(k).rstrip(":").lower()] = v
    images = []
    for src in re.findall(r'<li data-thumb="[^"]*" data-src="([^"]+)"', page):
        if src not in images:
            images.append(src)
    outdoor = []
    for key, label in OUTDOOR_ROWS.items():
        if key in rows and label not in outdoor:
            outdoor.append(label)
    address = rows.get("anschrift")
    address = ", ".join(p.strip() for p in htmllib.unescape(re.sub(r"<br\s*/?>", "\n", address)).split("\n") if p.strip()) if address else None
    note = None
    for key in ("nettomiete", "hauptmietzins", "brutto-miete"):
        if key in rows:
            note = f"Gesamtmiete, davon {key.capitalize()} {_text(rows[key])}"
            break
    return {"images": images, "outdoor": outdoor, "address": address, "price_note": note}


def _apply(item, detail):
    if detail.get("images"):
        item["images"] = detail["images"][:12]
        item["image"] = item["images"][0]
    for label in detail.get("outdoor") or []:
        if label not in item["outdoor"]:
            item["outdoor"].append(label)
    if detail.get("address"):
        item["address"] = detail["address"]
    if detail.get("price_note"):
        item["price_note"] = detail["price_note"]


def scrape(session: Session):
    INFO.clear()
    items, total, page = [], None, 0
    for page in range(MAX_PAGES):
        found, total_seen = parse(_decode(session.get(SEARCH.format(entry=page * PAGE_SIZE))))
        total = max(total or 0, total_seen)
        if not found:
            break
        items.extend(found)
        if (page + 1) * PAGE_SIZE >= total:
            break
    INFO.update(pages=page + 1, total=total, raw=len(items))
    kept = [
        x for x in items
        if (x["price"] is None or x["price"] <= MAX_PRICE)
        and (x["area"] is None or x["area"] >= MIN_AREA)
        and district_from_postcode(x["postcode"])
    ]
    fetched = failed = 0
    for item in kept:
        old = PREVIOUS.get(item["id"])
        if old and old.get("detailed"):
            _apply(item, {k: old.get(k) for k in ("images", "outdoor", "address", "price_note")})
            item["detailed"] = True
            continue
        if fetched >= MAX_DETAILS:
            continue
        fetched += 1
        try:
            detail = parse_detail(_decode(session.get(item["url"])))
        except Exception as e:
            failed += 1
            print(f"  findmyhome: Detail {item['id']} fehlgeschlagen ({e})")
            continue
        _apply(item, detail)
        item["detailed"] = True
    INFO.update(details=fetched, detail_errors=failed)
    return kept
