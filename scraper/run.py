"""Holt Mietangebote von allen Plattformen und schreibt docs/data/listings.json."""

import json
import pathlib
import sys
import traceback
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).parent))

import derstandard  # noqa: E402
import immoscout  # noqa: E402
import immowelt  # noqa: E402
import willhaben  # noqa: E402
from common import Session  # noqa: E402

PLATFORMS = [willhaben, immoscout, immowelt, derstandard]
OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "data" / "listings.json"


def main():
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text())
        except ValueError:
            pass
    prev_items = {x["id"]: x for x in previous.get("listings", [])}

    listings, status = [], {}
    for mod in PLATFORMS:
        print(f"{mod.NAME} …")
        try:
            items = mod.scrape(Session())
            seen = set()
            for item in items:
                if item["id"] in seen:
                    continue
                seen.add(item["id"])
                old = prev_items.get(item["id"])
                item["first_seen"] = old["first_seen"] if old else now
                item["last_seen"] = now
                listings.append(item)
            status[mod.NAME] = {"ok": True, "count": len(seen), "checked": now}
            if getattr(mod, "INFO", None):
                status[mod.NAME]["info"] = dict(mod.INFO)
            print(f"  {len(seen)} Angebote")
        except Exception as e:  # one broken platform must not take the others down
            traceback.print_exc()
            kept = [x for x in prev_items.values() if x["platform"] == mod.NAME]
            listings.extend(kept)
            last_ok = (previous.get("status", {}).get(mod.NAME) or {}).get("last_ok")
            status[mod.NAME] = {"ok": False, "error": str(e)[:200], "count": len(kept), "checked": now, "last_ok": last_ok}
        if status[mod.NAME]["ok"]:
            status[mod.NAME]["last_ok"] = now

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"updated": now, "status": status, "listings": listings}, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(listings)} Angebote gespeichert in {OUT}")


if __name__ == "__main__":
    main()
