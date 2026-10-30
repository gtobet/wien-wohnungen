import json
import re

from common import MAX_PRICE, MIN_AREA, Session, is_swap, listing, outdoor_from_text, to_float

NAME = "ImmoScout24"
BASE = "https://www.immobilienscout24.at"
SEARCH = "/regional/wien/wien/wohnung-mieten{page}?primaryPriceTo={price}&primaryAreaFrom={area}"
MAX_PAGES = 40

BADGE_OUTDOOR = {
    "BALCONY": "Balkon",
    "TERRACE": "Terrasse",
    "ROOF_TERRACE": "Terrasse",
    "LOGGIA": "Loggia",
    "GARDEN": "Garten",
    "PRIVATE_GARDEN": "Garten",
}


def _state(html):
    m = re.search(r"window\.__INITIAL_STATE__=(.*?)</script>", html, re.S)
    if not m:
        raise ValueError("ImmoScout24: __INITIAL_STATE__ nicht gefunden")
    s = re.sub(r"(?<=[:,\[])undefined(?=[,\]}])", "null", m.group(1))
    data, _ = json.JSONDecoder().raw_decode(s)
    return data["reduxAsyncConnect"]["pageData"]["results"]


def parse(html):
    results = _state(html)
    out = []
    for h in results.get("hits") or []:
        if (h.get("meta") or {}).get("hasChildren"):
            continue  # Bauprojekte mit vielen Einheiten, ohne konkrete Wohnung
        badges = [((b.get("details") or {}).get("value")) for b in h.get("typedBadges") or []]
        outdoor = [BADGE_OUTDOOR[b] for b in badges if b in BADGE_OUTDOOR]
        for extra in outdoor_from_text(h.get("headline")):
            if extra not in outdoor:
                outdoor.append(extra)
        address = h.get("addressString") or ""
        pc = re.search(r"\b(1\d\d0)\b", address)
        pic = (h.get("primaryPictureImageProps") or {}).get("src")
        out.append(
            listing(
                id=f"is24-{h['exposeId']}",
                platform=NAME,
                url=(h.get("links") or {}).get("absoluteURL") or f"{BASE}/expose/{h['exposeId']}",
                title=h.get("headline"),
                price=to_float(h.get("primaryPrice")) or None,
                price_note="Miete laut Inserat",
                area=to_float(h.get("primaryArea")),
                rooms=to_float(h.get("numberOfRooms")),
                postcode=pc.group(1) if pc else None,
                address=address,
                outdoor=outdoor,
                swap=is_swap(h.get("headline")),
                image=pic,
                published=h.get("dateCreated"),
            )
        )
    pagination = results.get("pagination") or {}
    return out, pagination.get("nextURL"), int(results.get("totalHits") or 0)


def scrape(session: Session):
    items = []
    for page in range(1, MAX_PAGES + 1):
        suffix = "" if page == 1 else f"/seite-{page}"
        html = session.get(BASE + SEARCH.format(page=suffix, price=MAX_PRICE, area=MIN_AREA)).text
        found, next_url, total = parse(html)
        if page == 1:
            print(f"  ImmoScout24: {total} Treffer laut Suche")
        items.extend(found)
        if not next_url:
            break
    return items
