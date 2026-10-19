"""Version du logo GTQC pour fond foncé : fond blanc intérieur rendu transparent, lettres noires passées en blanc,
bleu conservé, et léger halo jaune fluo (#E6FF00) autour du dessin.

Usage : python outils/logo_gtqc_fonce.py
Lit assets/img/logo/gtqc-logo.png, crée assets/img/logo/gtqc-logo-fonce.png
"""
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "img" / "logo" / "gtqc-logo.png"
OUT = ROOT / "assets" / "img" / "logo" / "gtqc-logo-fonce.png"
GLOW = (230, 255, 0)
PAD = 28

src = Image.open(SRC).convert("RGBA")
w, h = src.size
px = []
for r, g, b, a0 in src.getdata():
    # « Dé-mélange » du blanc : pixel = a × couleur + (1 - a) × blanc, avec a tiré du canal le plus clair
    a = (255 - min(r, g, b)) / 255
    if a < 0.02:
        px.append((255, 255, 255, 0)); continue
    c = [max(0, min(255, round((v - (1 - a) * 255) / a))) for v in (r, g, b)]
    # Les pixels sans couleur (noir ou gris) deviennent blancs pour rester lisibles sur fond foncé
    if max(c) - min(c) < 60:
        c = [255, 255, 255]
    px.append((*c, round(a * a0)))
logo = Image.new("RGBA", (w, h)); logo.putdata(px)

canvas = Image.new("RGBA", (w + 2 * PAD, h + 2 * PAD), (0, 0, 0, 0))
canvas.paste(logo, (PAD, PAD))

# Halo : silhouette élargie puis floutée, en jaune fluo, sous le logo
sil = canvas.getchannel("A").filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(9)).point(lambda v: round(v * 0.85))
glow = Image.new("RGBA", canvas.size, GLOW + (0,)); glow.putalpha(sil)
glow.alpha_composite(canvas)
glow.save(OUT, optimize=True)
print(OUT.name, glow.size)

# Version du site : affichée à 38-42 px de haut, donc 132 px suffisent même sur écran 3x (WebP ≈ 17 Ko au lieu de 115)
WEB = OUT.with_name("gtqc-logo-fonce-web.webp")
web = glow.resize((round(glow.width * 132 / glow.height), 132), Image.LANCZOS)
web.save(WEB, quality=90, method=6)
print(WEB.name, web.size)
