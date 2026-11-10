import html as htmllib
import re

from common import MAX_PRICE, MIN_AREA, Session, district_from_postcode, is_reserved, is_swap, listing, outdoor_from_text, to_float

NAME = "wohnnet"
BASE = "https://www.wohnnet.at"
# The result list has no price filter in the URL, but it can be sorted by price. Reading cheapest
# first and stopping once a whole page is above the limit keeps the number of requests small.
SEARCH = BASE + "/immobilien/mietwohnungen/wien?sortierung=guenstigste-zuerst&seite={page}"
MAX_PAGES = 50
INFO = {}

# Listing types that already say there is outdoor space.
TYPE_OUTDOOR = {"gartenwohnung": "Garten", "terrassenwohnung": "Terrasse", "dachterrassenwohnung": "Terrasse"}


def _text(fragment):
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()


def parse(page):
    out = []
    for block in page.split("<!-- Realty -->")[1:]:
        block = block.split("<!-- Topobjects -->")[0]
        a = re.search(r'<a href="(/immobilien/([a-z-]+?)-[^"]*-(\d+))" data-id="(\d+)" data-title="([^"]*)"', block)
        if not a:
            continue
        path, kind, oid, title = a.group(1), a.group(2), a.group(4), htmllib.unescape(a.group(5))
        place = re.search(r'fa-map-marker-alt[^>]*></i>\s*([^<]+)', block)
        place = _text(place.group(1)) if place else ""
        plz = re.search(r"\b(1\d{2}0)\b", place)
        area = re.search(r"<b[^>]*>([\d.,]+)</b>\s*m²", block)
        rooms = re.search(r"<b[^>]*>([\d.,]+)</b>\s*Zimmer", block)
        price = re.search(r"<b[^>]*>([\d.,]+)\s*€</b>", block)
        img = re.search(r'<div class="realty-image[^"]*">\s*<img[^>]*src="([^"]+)"', block)
        badges = [_text(b) for b in re.findall(r'detail-page-badge">(.*?)</span>', block)]
        outdoor = outdoor_from_text(title)
        label = TYPE_OUTDOOR.get(kind)
        if label and label not in outdoor:
            outdoor.append(label)
        postcode = plz.group(1) if plz else None
        out.append(
            listing(
                id=f"wn-{oid}",
                platform=NAME,
                url=BASE + path,
                title=title,
                price=to_float(price.group(1)) if price else None,
                price_note="Miete laut Inserat",
                area=to_float(area.group(1)) if area else None,
                rooms=to_float(rooms.group(1)) if rooms else None,
                postcode=postcode,
                address=place or None,
                outdoor=outdoor,
                swap=is_swap(title),
                reserved=is_reserved(title, *badges),
                image=htmllib.unescape(img.group(1)) if img else None,
            )
        )
    total = re.search(r"([\d.]+) Treffer", page)
    return out, int(total.group(1).replace(".", "")) if total else None


def scrape(session: Session):
    INFO.clear()
    items, total, page = [], None, 0
    for page in range(1, MAX_PAGES + 1):
        found, t = parse(session.get(SEARCH.format(page=page)).text)
        total = total or t
        if not found:
            break
        items.extend(found)
        prices = [x["price"] for x in found if x["price"] is not None]
        if prices and min(prices) > MAX_PRICE:
            break
    INFO.update(pages=page, total=total, raw=len(items))
    return [
        x for x in items
        if (x["price"] is None or x["price"] <= MAX_PRICE)
        and (x["area"] is None or x["area"] >= MIN_AREA)
        and district_from_postcode(x["postcode"])
    ]
