"""Télécharge les images de tracés (Gran Turismo Wiki) et les logos des lieux (gran-turismo.com)
listés dans database/circuits_gt7.csv, vers assets/img/circuits/.

Usage : python outils/telecharger_traces.py
"""
import csv, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_T = ROOT / "assets" / "img" / "circuits" / "traces-source"
OUT_L = ROOT / "assets" / "img" / "circuits" / "logos-lieux"
OUT_T.mkdir(parents=True, exist_ok=True)
OUT_L.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (GTQC site; usage non commercial)"}

rows = list(csv.DictReader(open(ROOT / "database" / "circuits_gt7.csv", encoding="utf-8-sig")))
jobs = {}
for r in rows:
    base = r["layout_id"].removesuffix("-reverse")  # un Reverse partage l'image du sens normal
    if r["trace_url"]:
        jobs[OUT_T / (base + Path(r["trace_url"]).suffix.lower())] = r["trace_url"]
    if r["logo_lieu_url"]:
        jobs[OUT_L / (r["lieu"].lower().replace(" ", "-").replace(":", "") + ".png")] = r["logo_lieu_url"]

ok = fail = 0
for dest, url in jobs.items():
    if dest.exists():
        continue
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as resp:
            dest.write_bytes(resp.read())
        ok += 1
    except Exception as e:  # noqa: BLE001
        fail += 1
        print("ÉCHEC", url, e)
    time.sleep(0.3)
print(f"{ok} téléchargés, {fail} échecs, {len(jobs)} fichiers au total")
