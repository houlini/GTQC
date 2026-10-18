"""Prépare un logo de commanditaire : version d'origine recadrée + version blanche sur fond transparent
(pour le bandeau des partenaires sur fond marine).

Usage : python outils/logo_fond_fonce.py <image> <nom_sortie>
Crée assets/img/sponsors/<nom>.png (recadré) et assets/img/sponsors/<nom>-blanc.png
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img" / "sponsors"
src, name = Path(sys.argv[1]), sys.argv[2]

im = Image.open(src).convert("RGB")
lum = im.convert("L")
w, h = lum.size
bg = sorted(lum.getpixel(p) for p in [(3, 3), (w - 4, 3), (3, h - 4), (w - 4, h - 4)])[1]
# Masque du dessin : écart de luminosité avec le fond (le logo est plus foncé que le fond clair)
mask = lum.point(lambda v: max(0, min(255, int((bg - v) * 2.2))))
# Ignore une bordure de 2 % (ombres ou traits au bord de certaines images)
edge = max(2, int(min(w, h) * 0.02))
blank = Image.new("L", (w, h), 0)
blank.paste(mask.crop((edge, edge, w - edge, h - edge)), (edge, edge))
mask = blank
box = mask.point(lambda v: 255 if v > 40 else 0).getbbox()
pad = int(max(w, h) * 0.02)
box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))

orig = im.crop(box)
orig.thumbnail((800, 800))
orig.save(OUT / f"{name}.png", optimize=True)

m = mask.crop(box)
m.thumbnail((800, 800))
white = Image.new("RGBA", m.size, (255, 255, 255, 0))
white.putalpha(m)
white.save(OUT / f"{name}-blanc.png", optimize=True)
print(name, orig.size)
