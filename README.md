# Wien Wohnungen

Sammelt Wiener Mietwohnungen von mehreren Plattformen und zeigt sie in einer kleinen Web-App mit Filtern.

## So funktioniert's

- `scraper/` holt die Angebote. Pro Plattform gibt es ein Modul, das die Suchergebnisseiten ausliest:
  - **willhaben**: `__NEXT_DATA__` der Suchseite (Preis ≤ 1000 €, ab 40 m², 90 Treffer pro Seite)
  - **ImmoScout24**: `window.__INITIAL_STATE__` der Regionalsuche Wien
  - **immowelt**: komprimierte Suchdaten (`classified-serp-init-data`, lz-string) der Suchseite. Eingeschränkt: Die Suchseite ignoriert Preis- und Flächenfilter und die filterbare Suche sperrt Bots, daher werden nur die ersten 10 Seiten (300 Angebote) von ganz Wien gelesen und lokal gefiltert.
  - **derStandard**: von GitHub-Servern aus gesperrt (nur aus Österreich erreichbar), wird im Status als nicht erreichbar angezeigt
- `scraper/run.py` schreibt alles nach `docs/data/listings.json` und merkt sich, wann ein Angebot zum ersten Mal gesehen wurde. Fällt eine Plattform aus, bleiben ihre letzten Angebote erhalten und die App zeigt eine Warnung.
- Der Workflow `.github/workflows/update.yml` läuft dreimal täglich (05:15, 11:15, 17:15 UTC) und lässt sich unter *Actions → Angebote aktualisieren → Run workflow* auch manuell starten.
- `docs/` ist die App (reines HTML/JS, wird über GitHub Pages ausgeliefert).

Der Scraper sammelt bewusst etwas breiter (bis 1000 €, ab 40 m², ganz Wien). Die eigentlichen Kriterien stellt man in der App ein. Voreingestellt sind:

- Miete bis 850 €, ab 50 m², ab 2 Zimmer
- Bezirke 2, 3, 4, 5, 6, 7, 8, 12, 14, 15, 16, 20
- Wohnungstausch- und Wohnticket-Angebote ausgeblendet
- Schalter „Nur mit Balkon / Terrasse / Freifläche“

Filter, gemerkte und ausgeblendete Angebote speichert der Browser lokal.

### Karte

Die Karte (oben rechts ein- und ausschaltbar) zeigt beim Überfahren eines Angebots die Lage: einen Punkt, wenn das Inserat eine Adresse hat, einen Kreis bei ungefährer Lage (ImmoScout24) und sonst nur den Bezirk. Die Bezirksgrenzen stammen aus Open Government Data Wien und werden beim ersten Scraper-Lauf nach `docs/data/bezirke.geojson` geladen.

### Reserviert

willhaben liefert den Status „reserviert“ direkt mit. Bei allen Plattformen wird zusätzlich der Titel nach „reserviert“, „Anfragestopp“, „bereits vergeben“ usw. durchsucht. Reservierte Angebote sind standardmäßig ausgeblendet.

### Aktualisieren-Button

Der Button startet den Workflow über die GitHub-API. Dafür braucht der Browser einmalig einen Fine-grained Personal Access Token (nur dieses Repo, Berechtigung *Actions: Read and write*). Er wird nur im `localStorage` des Browsers gespeichert. Nach dem Start fragt die Seite alle 20 Sekunden nach neuen Daten und lädt sie automatisch, sobald GitHub Pages sie ausliefert (meist nach 3 bis 4 Minuten).

## Hinweise

- Preise stehen so drin, wie die Plattform sie liefert. Bei willhaben ist das meist die Gesamtmiete, bei immowelt die Nettokaltmiete.
- Freifläche wird aus den Plattform-Merkmalen und aus Titel/Beschreibung („Balkon“, „Terrasse“, „Loggia“, „Garten“) erkannt und kann daher fehlen oder (selten) falsch sein.
- Die Plattformen erlauben automatisiertes Auslesen laut AGB nicht. Das Projekt ist nur für den privaten Gebrauch gedacht und fragt wenige Seiten pro Lauf mit Pausen ab.

## Lokal ausführen

```sh
pip install -r requirements.txt
python scraper/run.py
python -m http.server -d docs 8000
```
