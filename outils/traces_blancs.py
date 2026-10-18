"""Transforme les images de tracés (assets/img/circuits/traces-source) en tracés blancs sur fond
transparent, recadrés (assets/img/circuits/traces/<layout_id>.png), pour le style Red Bull Racing.

Usage : python outils/traces_blancs.py
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "img" / "circuits" / "traces-source"
DST = ROOT / "assets" / "img" / "circuits" / "traces"
DST.mkdir(parents=True, exist_ok=True)
SIZE = 800


def line_mask(im: Image.Image) -> Image.Image:
    """Renvoie un masque (L) où le trait du circuit est blanc."""
    rgba = im.convert("RGBA")
    alpha = rgba.getchannel("A")
    lum = rgba.convert("L")
    if alpha.getextrema()[0] < 250:  # PNG avec transparence : le trait est ce qui est opaque
        return ImageChops.multiply(alpha, lum.point(lambda v: 255 if v > 60 else 0))
    w, h = lum.size
    corners = [lum.getpixel(p) for p in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]]
    bg = sorted(corners)[1]
    return ImageOps.invert(lum) if bg > 128 else lum


for f in sorted(SRC.iterdir()):
    m = line_mask(Image.open(f))
    m = m.point(lambda v: 0 if v < 70 else min(255, int((v - 70) * 1.6)))
    box = m.getbbox()
    if not box:
        print("vide :", f.name)
        continue
    m = m.crop(box)
    m.thumbnail((SIZE, SIZE), Image.LANCZOS)
    m = m.filter(ImageFilter.MaxFilter(3)) if max(m.size) >= 500 else m  # épaissit un peu les traits fins
    out = Image.new("RGBA", m.size, (255, 255, 255, 0))
    out.putalpha(m)
    out.save(DST / (f.stem + ".png"), optimize=True)
print(len(list(DST.glob("*.png"))), "tracés blancs dans", DST)
