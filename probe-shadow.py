import re, requests
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
s = requests.Session(); s.headers["User-Agent"] = UA
out = open("probe/shadow.txt", "w")
for base in ["https://app.shadowmap.org/", "https://willhaben-immoaddetail.poweredby.shadowmap.org/?lat=48.276&lng=16.4071&zoom=18.5"]:
    r = s.get(base, timeout=30)
    out.write(f"=== {base} {r.status_code}\n")
    for k, v in r.headers.items():
        if k.lower() in ("x-frame-options", "content-security-policy"):
            out.write(f"{k}: {v}\n")
    out.write(r.text[:3000] + "\n")
    js = sorted(set(re.findall(r'(?:src|href)="([^"]+\.js)"', r.text)))
    out.write(f"js: {js}\n")
    for j in js:
        u = requests.compat.urljoin(base, j)
        try:
            t = s.get(u, timeout=60).text
        except Exception as e:
            out.write(f"ERR {u} {e}\n"); continue
        out.write(f"--- {u} len {len(t)}\n")
        pats = [r'searchParams\.get\(["\'][^"\']+', r'\.get\(["\'](?:lat|lng|zoom|time|[a-zA-Z_]{1,20})["\']\)', r'(?i).{0,200}highlight.{0,200}', r'(?i).{0,200}selectedBuilding.{0,200}', r'(?i).{0,150}"(?:marker|pin)".{0,150}']
        for p in pats:
            seen = set()
            for m in re.finditer(p, t):
                g = m.group(0)
                if g in seen: continue
                seen.add(g)
                if len(seen) > 40: break
                out.write(f"[{p[:25]}] {g}\n")
