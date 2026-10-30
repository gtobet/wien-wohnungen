import json
import re

from common import MAX_PRICE, MIN_AREA, Session, is_swap, listing, outdoor_from_text, to_float

NAME = "willhaben"
SEARCH = (
    "https://www.willhaben.at/iad/immobilien/mietwohnungen/wien"
    "?rows=90&PRICE_TO={price}&ESTATE_SIZE/LIVING_AREA_FROM={area}&page={page}"
)
MAX_PAGES = 10


def _attrs(ad):
    return {a["name"]: a["values"] for a in ad.get("attributes", {}).get("attribute", [])}


def _first(attrs, key):
    v = attrs.get(key)
    return v[0] if v else None


def parse(html):
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        raise ValueError("willhaben: __NEXT_DATA__ nicht gefunden")
    result = json.loads(m.group(1))["props"]["pageProps"]["searchResult"]
    out = []
    for ad in result["advertSummaryList"]["advertSummary"]:
        a = _attrs(ad)
        title = _first(a, "HEADING") or ad.get("description")
        body = _first(a, "BODY_DYN")
        outdoor = list(a.get("FREE_AREA_TYPE_NAME") or [])
        for extra in outdoor_from_text(title):
            if extra not in outdoor:
                outdoor.append(extra)
        seo = _first(a, "SEO_URL")
        images = ad.get("advertImageList", {}).get("advertImage") or []
        out.append(
            listing(
                id=f"wh-{ad['id']}",
                platform=NAME,
                url=f"https://www.willhaben.at/iad/{seo}" if seo else f"https://www.willhaben.at/iad/object?adId={ad['id']}",
                title=title,
                price=to_float(_first(a, "PRICE")),
                price_note="Gesamtmiete laut Inserat",
                area=to_float(_first(a, "ESTATE_SIZE/LIVING_AREA") or _first(a, "ESTATE_SIZE")),
                rooms=to_float(_first(a, "NUMBER_OF_ROOMS")),
                postcode=_first(a, "POSTCODE"),
                address=_first(a, "ADDRESS"),
                outdoor=outdoor,
                swap=is_swap(title, body),
                image=images[0].get("thumbnailImageUrl") if images else None,
                published=_first(a, "PUBLISHED_String"),
            )
        )
    return out, int(result.get("rowsFound") or 0)


def scrape(session: Session):
    items = []
    for page in range(1, MAX_PAGES + 1):
        html = session.get(SEARCH.format(price=MAX_PRICE, area=MIN_AREA, page=page)).text
        found, total = parse(html)
        items.extend(found)
        if not found or len(items) >= total:
            break
    return items
