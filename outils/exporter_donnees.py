"""Convertit un export .xlsx du Google Sheet GTQC_Base_Donnees en maquette/data.js (un objet par onglet).

Usage : python outils/exporter_donnees.py <export.xlsx | fichier JSON {content: base64}>

Plus tard, le site lira directement les CSV publiés du Sheet ; ce script sert à la maquette.
"""
import base64, io, json, sys, datetime
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1])
raw = src.read_bytes()
if src.suffix.lower() != ".xlsx":
    raw = base64.b64decode(json.loads(raw)["content"])
wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)

# Onglets internes ou trop lourds : pas dans la maquette
SKIP = {"_LISEZMOI", "Forfaits_Commandite", "Lobbys"}


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
    if ws.title in SKIP:
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

dest = ROOT / "maquette" / "data.js"
dest.parent.mkdir(exist_ok=True)
dest.write_text("window.GTQC = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print({k: len(v) for k, v in data.items()})
print(dest, round(dest.stat().st_size / 1024), "Ko")
