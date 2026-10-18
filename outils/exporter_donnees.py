"""Convertit un export .xlsx du Google Sheet GTQC_Base_Donnees en maquette/data.js (un objet par onglet).

Usage : python outils/exporter_donnees.py <export.xlsx | fichier JSON {content: base64} | maquette/data.js>
(avec data.js : refiltre seulement les réglages des prochaines manches)

Copie de secours du site : en ligne, le site lit l'API (apps-script/gtqc.gs), qui applique les mêmes règles.
Onglets dont le nom commence par « _ » (inscriptions, admins, journal) : jamais exportés.
"""
import base64, io, json, sys, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1])

# Onglets internes ou trop lourds : pas dans la maquette
SKIP = {"Forfaits_Commandite", "Lobbys"}

# Réglages d'une manche gardés secrets jusqu'à quelques jours avant la course (même liste que gtqc.gs)
REGLAGES = ["heure_du_jour", "vitesse_temps", "conditions", "arret_pit_min", "conso_carburant", "usure_pneus",
            "carburant_initial_l", "ravitaillement", "temps_pit_s"]


def masquer_reglages(data, aujourdhui=None):
    """Retire les réglages des manches à venir, sauf si Manches.reglages_visibles = TRUE ou si la date
    de dévoilement (date - Config.reglages_jours_avant, 7 par défaut) est passée."""
    aujourdhui = aujourdhui or datetime.date.today()
    cfg = {r.get("cle"): r.get("valeur") for r in data.get("Config", [])}
    try:
        jours = int(cfg.get("reglages_jours_avant") or 7)
    except ValueError:
        jours = 7
    for m in data.get("Manches", []):
        for k in ("reglages_caches", "reglages_reveles_le"):
            m.pop(k, None)
        if not m.get("date") or m.get("statut") == "Terminée":
            continue
        force = str(m.get("reglages_visibles", "")).upper()
        date = datetime.date.fromisoformat(str(m["date"])[:10])
        reveal = date - datetime.timedelta(days=jours)
        if force == "TRUE" or (force != "FALSE" and aujourdhui >= reveal) or aujourdhui > date:
            continue
        for k in REGLAGES:
            m.pop(k, None)
        m["reglages_caches"] = True
        if force != "FALSE":
            m["reglages_reveles_le"] = reveal.isoformat()
    return data


dest = ROOT / "maquette" / "data.js"
if src.suffix.lower() == ".js":
    t = src.read_text(encoding="utf-8")
    data = masquer_reglages(json.loads(t[t.index("{"):t.rindex("}") + 1]))
    dest.write_text("window.GTQC = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("Réglages masqués :", [m["course_id"] for m in data["Manches"] if m.get("reglages_caches")])
    sys.exit()

import openpyxl
raw = src.read_bytes()
if src.suffix.lower() != ".xlsx":
    raw = base64.b64decode(json.loads(raw)["content"])
wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)


def val(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, datetime.time):
        return v.strftime("%H:%M")
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


data = {}
for ws in wb.worksheets:
    if ws.title in SKIP or ws.title.startswith("_"):
        continue
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        continue
    head = [h for h in rows[0] if h]
    out = []
    for r in rows[1:]:
        d = {h: val(r[i]) for i, h in enumerate(head) if i < len(r) and r[i] not in (None, "")}
        if d:
            out.append(d)
    data[ws.title] = out

masquer_reglages(data)
# Captures cachées ou de vérification (écran des résultats avec les identifiants PSN) : jamais publiées
data["Photos"] = [p for p in data.get("Photos", []) if p.get("url") and str(p.get("publier", "")).upper() == "TRUE" and p.get("source") != "Résultats"]
dest.parent.mkdir(exist_ok=True)
dest.write_text("window.GTQC = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print({k: len(v) for k, v in data.items()})
print(dest, round(dest.stat().st_size / 1024), "Ko")
