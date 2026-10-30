import re
import time

import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)

# Wide search bounds. The app narrows down to the actual criteria, so they can be changed there
# without touching the scraper.
MAX_PRICE = 1000
MIN_AREA = 40
MAX_IMAGES = 12

OUTDOOR_WORDS = {
    "balkon": "Balkon",
    "terrasse": "Terrasse",
    "loggia": "Loggia",
    "garten": "Garten",
    "eigengarten": "Garten",
    "freifläche": "Freifläche",
    "freiflaeche": "Freifläche",
}
_OUTDOOR_RE = re.compile(
    r"(?<![a-zäöü])(dach)?(balkon|terrasse|loggia|eigengarten|garten|freifl(?:ä|ae)che)", re.I
)
_NOT_OUTDOOR_RE = re.compile(r"wintergarten|gartenblick|ohne (balkon|terrasse|freifl)", re.I)
_SWAP_RE = re.compile(r"wohnticket|wohnungstausch|tauschwohnung|zum tausch|tausche", re.I)


class Session:
    def __init__(self, delay=1.5):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Language": "de-AT,de;q=0.9,en;q=0.5"})
        self.delay = delay
        self._last = 0.0

    def get(self, url, **kw):
        wait = self._last + self.delay - time.time()
        if wait > 0:
            time.sleep(wait)
        r = self.s.get(url, timeout=30, **kw)
        self._last = time.time()
        r.raise_for_status()
        return r


def outdoor_from_text(*texts):
    found = []
    for text in texts:
        if not text:
            continue
        cleaned = _NOT_OUTDOOR_RE.sub(" ", text)
        for m in _OUTDOOR_RE.finditer(cleaned):
            label = OUTDOOR_WORDS[m.group(2).lower()]
            if label not in found:
                found.append(label)
    return found


def is_swap(*texts):
    return any(t and _SWAP_RE.search(t) for t in texts)


def district_from_postcode(postcode):
    m = re.fullmatch(r"1(\d\d)0", str(postcode or "").strip())
    if not m:
        return None
    d = int(m.group(1))
    return d if 1 <= d <= 23 else None


def to_float(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = re.sub(r"[^\d,.\-]", "", str(value))
    if not s:
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(".") > 1 or re.search(r"\.\d{3}$", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def listing(**kw):
    base = {
        "id": None,
        "platform": None,
        "url": None,
        "title": None,
        "price": None,
        "price_note": None,
        "area": None,
        "rooms": None,
        "postcode": None,
        "district": None,
        "address": None,
        "outdoor": [],
        "swap": False,
        "image": None,
        "images": [],
        "published": None,
    }
    base.update(kw)
    if not base["images"] and base["image"]:
        base["images"] = [base["image"]]
    base["images"] = base["images"][:MAX_IMAGES]
    if base["image"] is None and base["images"]:
        base["image"] = base["images"][0]
    if base["district"] is None:
        base["district"] = district_from_postcode(base["postcode"])
    return base
