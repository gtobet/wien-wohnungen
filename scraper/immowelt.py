import json
import re

from common import MAX_PRICE, MIN_AREA, Session, is_swap, listing, outdoor_from_text, to_float
from lzstring import decompress_from_base64

NAME = "immowelt"
# The filterable classified-search endpoint answers bots with 403 and the SEO search page ignores
# filter parameters, so this reads the first pages of all Vienna rentals and filters locally.
# The filter parameters stay in the URL in case immowelt starts honouring them; the variant with
# the fewest hits wins.
SEARCH_VARIANTS = [
    "https://www.immowelt.at/suche/mieten/wohnung/wien/wien-1010/ad08at2093"
    "?priceMax={price}&spaceMin={area}&order=DateDesc&page={page}",
]
MAX_PAGES = 10

SUBTYPE_OUTDOOR = {"TERRACE": "Terrasse", "GARDEN": "Garten", "BALCONY": "Balkon"}


def _page_props(html):
    m = re.search(r'<script id="__UFRN_FETCHER__">(.*?)</script>', html, re.S)
    if not m:
        raise ValueError("immowelt: __UFRN_FETCHER__ nicht gefunden")
    s = m.group(1)
    raw = s[s.index("JSON.parse(") + len("JSON.parse(") : s.rindex(")")]
    data = json.loads(json.loads(raw))["data"]
    packed = data.get("classified-serp-init-data")
    if not packed:
        raise ValueError("immowelt: Suchdaten fehlen")
    return json.loads(decompress_from_base64(packed))["pageProps"]


def parse(html):
    props = _page_props(html)
    out = []
    for cid in props.get("classifieds") or []:
        c = (props.get("classifiedsData") or {}).get(cid)
        if not c:
            continue
        raw = c.get("rawData") or {}
        hard = c.get("hardFacts") or {}
        desc = c.get("mainDescription") or {}
        price_info = hard.get("price") or {}
        facts = {f.get("type"): f.get("splitValue") for f in hard.get("facts") or []}
        headline = desc.get("headline") or hard.get("title")
        outdoor = []
        if raw.get("propertySubType") in SUBTYPE_OUTDOOR:
            outdoor.append(SUBTYPE_OUTDOOR[raw["propertySubType"]])
        for extra in outdoor_from_text(headline, desc.get("description")):
            if extra not in outdoor:
                outdoor.append(extra)
        addr = (c.get("location") or {}).get("address") or {}
        images = (c.get("gallery") or {}).get("images") or []
        out.append(
            listing(
                id=f"iw-{c.get('id') or cid}",
                platform=NAME,
                url=c.get("url"),
                title=headline,
                price=to_float(price_info.get("value")) or to_float(raw.get("price")),
                price_note=price_info.get("additionalInformation") or "Miete laut Inserat",
                area=to_float(facts.get("livingSpace")) or to_float((raw.get("surface") or {}).get("main")),
                rooms=to_float(facts.get("numberOfRooms")) or to_float(raw.get("nbroom")),
                postcode=addr.get("zipCode"),
                address=" ".join(x for x in [addr.get("street"), addr.get("zipCode"), addr.get("city")] if x),
                outdoor=outdoor,
                swap=is_swap(headline, desc.get("description")),
                image=images[0].get("url") if images else None,
                published=(c.get("metadata") or {}).get("creationDate"),
            )
        )
    return out, int(props.get("totalCount") or 0)


INFO = {}


def scrape(session: Session):
    INFO.clear()
    best = None
    for template in SEARCH_VARIANTS:
        try:
            found, total = parse(session.get(template.format(price=MAX_PRICE, area=MIN_AREA, page=1)).text)
        except Exception as e:
            print(f"  immowelt: Variante fehlgeschlagen ({e})")
            INFO[template.split("/")[-2] + "?" + template.split("?")[1].split("&")[0]] = {"error": str(e)[:120]}
            continue
        print(f"  immowelt: {total} Treffer mit {template.split('?')[1]}")
        INFO[template.split("/")[-2] + "?" + template.split("?")[1].split("&")[0]] = {"total": total, "page1": len(found)}
        if best is None or total < best[2]:
            best = (template, found, total)
    if best is None:
        raise RuntimeError("keine Suchvariante erreichbar")
    template, items, total = best
    INFO["pages"] = 1
    for page in range(2, MAX_PAGES + 1):
        if len(items) >= total:
            break
        found, _ = parse(session.get(template.format(price=MAX_PRICE, area=MIN_AREA, page=page)).text)
        if not found:
            break
        items.extend(found)
        INFO["pages"] = page
    INFO["raw"] = len(items)
    return [x for x in items if (x["price"] is None or x["price"] <= MAX_PRICE) and (x["area"] is None or x["area"] >= MIN_AREA)]
