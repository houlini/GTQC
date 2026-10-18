"""Recadre les vignettes officielles des manches S02 pour en faire des photos de fond sans texte
(le titre et le logo GTQC sont incrustés dans les vignettes) : assets/img/manches/photo/s02-rXX.jpg

Usage : python outils/photos_manches.py [planche_controle.jpg]
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Photos" / "S02" / "Manches"
OUT = ROOT / "assets" / "img" / "manches" / "photo"
OUT.mkdir(parents=True, exist_ok=True)
VIGNETTES = {"IMG_7533": "s02-r01", "IMG_7532": "s02-r02", "IMG_7531": "s02-r03", "IMG_7537": "s02-r04",
             "IMG_7536": "s02-r05", "IMG_7535": "s02-r06", "IMG_7534": "s02-r07", "IMG_7530": "s02-r08",
             "IMG_7529": "s02-r09", "IMG_7549": "s02-r10"}
BOX = (0, .44, .64, .77)  # gauche, haut, droite, bas (fractions) : sous le titre, à gauche du logo

sheet = Image.new("RGB", (5 * 400, 2 * 200))
for i, (src, dst) in enumerate(VIGNETTES.items()):
    im = Image.open(SRC / f"{src}.PNG").convert("RGB")
    w, h = im.size
    crop = im.crop((int(w * BOX[0]), int(h * BOX[1]), int(w * BOX[2]), int(h * BOX[3])))
    crop.save(OUT / f"{dst}.jpg", quality=82, optimize=True, progressive=True)
    t = crop.copy(); t.thumbnail((400, 200)); sheet.paste(t, ((i % 5) * 400, (i // 5) * 200))
if len(sys.argv) > 1:
    sheet.save(sys.argv[1])
print(len(VIGNETTES), "photos dans", OUT)
