from common import Session

NAME = "derStandard"
SEARCH = "https://immobilien.derstandard.at/suche/wien/mieten-wohnung"


def scrape(session: Session):
    # derStandard sperrt Zugriffe von außerhalb Österreichs (GitHub-Server stehen in den USA).
    # Hier wird nur geprüft, ob die Seite erreichbar ist; ein Parser folgt, sobald sie es ist.
    r = session.s.get(SEARCH, timeout=30)
    if r.status_code == 403 or "nicht in deiner Region" in r.text:
        raise RuntimeError("von GitHub-Servern aus gesperrt (nur aus Österreich erreichbar)")
    r.raise_for_status()
    raise RuntimeError("erreichbar, aber noch kein Parser vorhanden")
