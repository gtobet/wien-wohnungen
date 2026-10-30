import re, requests, sys
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
s = requests.Session(); s.headers["User-Agent"] = UA
url = sys.argv[1]
out = open("probe/shadow.txt", "w")
h = s.get(url, timeout=30).text
out.write(f"detail len {len(h)}\n")
for m in re.finditer(r"(?i).{0,300}shadow.{0,300}", h):
    out.write("HTML: " + m.group(0) + "\n\n")
chunks = sorted(set(re.findall(r'(/_next/static/[^"\']+\.js)', h)))
out.write(f"{len(chunks)} chunks\n")
for c in chunks:
    try:
        js = s.get("https://www.willhaben.at" + c, timeout=30).text
    except Exception as e:
        out.write(f"ERR {c} {e}\n"); continue
    for m in re.finditer(r"(?i).{0,500}shadowmap.{0,800}", js):
        out.write(f"JS {c}: " + m.group(0) + "\n\n")
