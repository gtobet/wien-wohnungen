import pathlib, requests
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
URLS = {
    "willhaben": "https://www.willhaben.at/iad/immobilien/mietwohnungen/wien?rows=90&PRICE_TO=850&ESTATE_SIZE/LIVING_AREA_FROM=50",
    "is24": "https://www.immobilienscout24.at/regional/wien/wien/wohnung-mieten",
    "derstandard": "https://immobilien.derstandard.at/suche/wien/mieten-wohnung",
    "immowelt": "https://www.immowelt.at/suche/wien/wohnungen/mieten",
}
out = pathlib.Path("probe/out"); out.mkdir(parents=True, exist_ok=True)
for name, url in URLS.items():
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "de-AT,de;q=0.9"}, timeout=30)
        (out / f"{name}.html").write_text(r.text)
        print(name, r.status_code, r.url, len(r.text))
        (out / f"{name}.status").write_text(f"{r.status_code} {r.url}\n")
    except Exception as e:
        print(name, "ERR", e)
        (out / f"{name}.status").write_text(f"ERR {e}\n")
