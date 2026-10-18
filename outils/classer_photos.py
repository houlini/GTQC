"""Copie les photos reçues (dossier Photos/) vers assets/img/ avec des noms utiles.

Les originaux ne sont pas modifiés. Les grandes images sont réduites pour le web.
Produit aussi database/inventaire_images.csv (original -> nouveau nom + description).

Usage : python outils/classer_photos.py
"""
import csv, shutil
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC, DST = ROOT / "Photos", ROOT / "assets" / "img"
MAX_W = 1920

S02, SP2 = "S02", "S02/sponsors"
L1, LIV, TEAMS = "Saison 01/Logo Sponsor S01", "Saison 01/Livery Sponsor S01", "Saison 01/teams s01"

# (original, destination sans extension ou None = non copié, catégorie, description, à confirmer)
ITEMS = [
    # --- Logo / identité GTQC
    (f"{S02}/image.jpg", "logo/gtqc-logo-neon", "Logo", "Logo GTQC (fleur de lys) effet néon bleu", ""),
    (f"{L1}/logo.png", "logo/gt7qc-logo-s01", "Logo", "Ancien logo GT7QC avec drapeau du Québec (Saison 1)", ""),
    (f"{L1}/Logo gt7qc.png", "logo/gt7qc-logo-s01-petit", "Logo", "Ancien logo GT7QC, petite version", ""),
    (f"{L1}/gd logo.jpg", "logo/gd-logo", "Logo", "Logo « GD » (G88D / graphisme GD ?)", "Oui"),
    # --- Saison 2
    (f"{S02}/imasage.jpg", "saisons/s02-affiche", "Saison", "Affiche « Championnat Saison 2 »", ""),
    (f"{S02}/image (1).jpg", "saisons/s02-tryouts-affiche", "Saison", "Affiche verticale Tryouts S02 (voiture de nuit)", ""),
    (f"{S02}/image (2).jpg", "saisons/s02-tryouts-banniere", "Saison", "Bannière Tryouts S02 avec logo GTQC", ""),
    (f"{S02}/Capture d’écran 2026-07-29 224757.jpg", None, "Données", "Capture du calendrier S02 avec les dates → reporté dans Manches", ""),
    (f"{S02}/Manches/IMG_7533.PNG", "manches/s02-r01", "Manche", "Vignette Manche 1 – Sardegna (Ford GT)", ""),
    (f"{S02}/Manches/IMG_7532.PNG", "manches/s02-r02", "Manche", "Vignette Manche 2 – Alsace", ""),
    (f"{S02}/Manches/IMG_7531.PNG", "manches/s02-r03", "Manche", "Vignette Manche 3 – Fuji (NSX Gr.4)", ""),
    (f"{S02}/Manches/IMG_7537.PNG", "manches/s02-r04", "Manche", "Vignette Manche 4 – Daytona", ""),
    (f"{S02}/Manches/IMG_7536.PNG", "manches/s02-r05", "Manche", "Vignette Manche 5 – Maggiore", ""),
    (f"{S02}/Manches/IMG_7535.PNG", "manches/s02-r06", "Manche", "Vignette Manche 6 – Suzuka", ""),
    (f"{S02}/Manches/IMG_7534.PNG", "manches/s02-r07", "Manche", "Vignette Manche 7 – Sainte-Croix (Ferrari 458)", ""),
    (f"{S02}/Manches/IMG_7530.PNG", "manches/s02-r08", "Manche", "Vignette Manche 8 – Trial Mountain (WRX)", ""),
    (f"{S02}/Manches/IMG_7529.PNG", "manches/s02-r09", "Manche", "Vignette Manche 9 – Yas Marina (Super Formula)", ""),
    (f"{S02}/Manches/IMG_7549.PNG", "manches/s02-r10", "Manche", "Vignette Manche 10 – Grand Valley (finale)", ""),
    (f"{S02}/sardegna-road-track.webp", "circuits/sardegna-logo", "Circuit", "Logo du circuit Sardegna Road Track", ""),
    # --- Sponsors S02
    (f"{SP2}/TAG-logo.svg", "sponsors/tag-e", "Sponsor", "TAG E-Karting & Amusement – logo couleur (vectoriel)", ""),
    (f"{SP2}/E-TAG.png", "sponsors/tag-e-fond-transparent", "Sponsor", "TAG E-Karting – logo noir/bleu", ""),
    (f"{SP2}/images (1).png", "sponsors/tag-e-sans-texte", "Sponsor", "TAG – logo sans « E-Karting »", ""),
    (f"{SP2}/download.png", "sponsors/tag-e-icone", "Sponsor", "TAG – icône 28 px (favicon)", ""),
    (f"{SP2}/Capture d’écran 2026-07-29 220931.jpg", "sponsors/scale", "Sponsor", "SCALE Innovative Racing Suspension", ""),
    (f"{SP2}/images.png", "sponsors/scale-carre", "Sponsor", "SCALE – logo carré fond noir", ""),
    (f"{SP2}/scale_logo-simple_white.webp", "sponsors/scale-blanc", "Sponsor", "SCALE – logo blanc (pour fond foncé)", ""),
    (f"{SP2}/DUBBY (1) (1).svg", "sponsors/dubby", "Sponsor", "DUBBY – logo (vectoriel)", ""),
    (f"{SP2}/smile (2).svg", "sponsors/dubby-smiley", "Sponsor", "Smiley jaune aux yeux en X – mascotte Dubby", ""),
    (f"{SP2}/69406639b4d82c81a7aac42e_chez_miller_logo.svg", "sponsors/chez-miller", "Sponsor", "Chez Miller – logo texte (vectoriel)", ""),
    (f"{SP2}/69406cae487385a357dc4194_chez_miller_icon.svg", "sponsors/chez-miller-icone", "Sponsor", "Chez Miller – monogramme MC", ""),
    (f"{SP2}/image.webp", "sponsors/willy-woodshop-arbre-3d", "Sponsor", "Willy Woodshop – arbre version relief", ""),
    (f"{SP2}/329402661_5721430454560662_52477899221207765_n.jpg", None, "Sponsor", "Willy Woodshop – doublon basse résolution", ""),
    (f"{SP2}/Gmail - Proposition de partenariat – Communauté de sim racing québécoise GTQC.pdf", None, "Document",
     "Courriels TAG E-Karting (privé) → infos reportées dans le classeur Admin", ""),
    # --- Willy Woodshop (S01)
    (f"{L1}/Willy Woodshop.svg", "sponsors/willy-woodshop", "Sponsor", "Willy Woodshop – logo arbre couleur (vectoriel)", ""),
    (f"{L1}/Untitled_-_March_26,_2023_11.52.04.png", "sponsors/willy-woodshop-transparent", "Sponsor", "Willy Woodshop – PNG transparent haute résolution", ""),
    (f"{L1}/Untitled_-_March_26,_2023_11.52.04.svg", "sponsors/willy-woodshop-fond-noir", "Sponsor", "Willy Woodshop – sur fond noir (vectoriel)", ""),
    (f"{L1}/C2cwmU01.svg", "sponsors/willy-woodshop-trait", "Sponsor", "Willy Woodshop – version au trait noir (vectoriel)", ""),
    (f"{L1}/WW.PNG", "sponsors/willy-woodshop-rond", "Sponsor", "Willy Woodshop – pastille ronde", ""),
    (f"{L1}/IMG_5218.jpg", None, "Sponsor", "Willy Woodshop – doublon", ""),
    (f"{L1}/file.png", None, "Sponsor", "Willy Woodshop – doublon", ""),
    (f"{L1}/WW sml.PNG", None, "Sponsor", "Willy Woodshop – doublon 36 px", ""),
    # --- Sponsors S01
    (f"{L1}/logo (2).png", "sponsors/exp-agence-immobiliere", "Sponsor S01", "eXp Agence immobilière – logo noir", ""),
    (f"{L1}/white-logo.png", "sponsors/exp-agence-immobiliere-blanc", "Sponsor S01", "eXp Agence immobilière – logo blanc", ""),
    (f"{L1}/image (10).png", "sponsors/jean-michel-marcoux-banniere", "Sponsor S01", "Bannière Jean-Michel Marcoux, courtier eXp (avec téléphone)", ""),
    (f"{L1}/Capture d’écran 2026-02-02 204306.jpg", "sponsors/jean-michel-marcoux", "Sponsor S01", "Texte « Jean-Michel Marcoux – Courtier immobilier résidentiel »", ""),
    (f"{L1}/signature email.jpg", None, "Sponsor S01", "Signature courriel J.-M. Marcoux (coordonnées) – non publié", ""),
    (f"{L1}/media.jpeg", None, "Sponsor S01", "Photo portrait d'une personne (J.-M. Marcoux ?) – non publiée sans accord", "Oui"),
    (f"{L1}/tropix28f1c4ec-4824-46be-9451-622906e76d6e.png", "sponsors/garage-tropix", "Sponsor S01", "Garage Tropix – logo fond noir", ""),
    (f"{L1}/white tropix28f1c4ec-4824-46be-9451-622906e76d6e.png", "sponsors/garage-tropix-fond-blanc", "Sponsor S01", "Garage Tropix – logo fond blanc", ""),
    (f"{L1}/505066753_10230451101129100_5032218244736716672_n.jpg", "sponsors/garage-tropix-variante", "Sponsor S01", "Tropix Garage – autre variante", ""),
    (f"{L1}/28f1c4ec-4824-46be-9451-622906e76d6e.jpeg", None, "Sponsor S01", "Garage Tropix avec n° de téléphone – doublon", ""),
    (f"{L1}/tropix.jpg", None, "Sponsor S01", "Garage Tropix – doublon", ""),
    (f"{L1}/398430728_122122134938067068_2945324914014737498_n.jpg", "sponsors/bm-electrique", "Sponsor S01", "BM Électrique – logo fond noir", ""),
    (f"{L1}/474215240_122222958260067068_8388859578662514425_n.jpg", "sponsors/bm-electrique-orange", "Sponsor S01", "BM Électrique – logo fond orange", ""),
    (f"{L1}/301523968_378613781126776_238488557472836844_n.jpg", "sponsors/ceramei", "Sponsor S01", "CERAMEI – logo bleu", ""),
    (f"{L1}/52911852_1040951142782558_2113071588340400128_n.jpg", "sponsors/terrassement-rl", "Sponsor S01", "Terrassement R.L – Aménagement extérieur", ""),
    (f"{L1}/logo (1).png", "sponsors/terrassement-rl-blanc", "Sponsor S01", "Terrassement R.L – logo blanc", ""),
    (f"{L1}/rl.jpg", "sponsors/terrassement-rl-icone", "Sponsor S01", "R.L – icône", ""),
    (f"{L1}/exx logo.png", "sponsors/exscellant-calfeutrage", "Sponsor S01", "Exscellant Calfeutrage – logo", ""),
    (f"{L1}/330405278_1345682139561490_565802550781296112_n.jpg", None, "Sponsor S01", "Logo « X » vert/gris – entreprise inconnue, ignoré (gestionnaire)", ""),
    (f"{L1}/ttt.PNG", None, "Décoration S01", "RustyPod – autocollant de décoration (pas un commanditaire)", ""),
    (f"{L1}/10777-stk-G (1).jpg", None, "Décoration S01", "RustyPod – autocollant sur portière de camion (pas un commanditaire)", ""),
    (f"{L1}/10777-stk-G.jpg", None, "Sponsor S01", "RustyPod – doublon", ""),
    # --- Voitures / livrées S01
    (f"{L1}/Mustang GR3.jpg", "saisons/s01-mustang-gr3", "Saison 1", "Ford Mustang Gr.3 (exemple du forfait Platine « concessionnaire »)", ""),
    (f"{LIV}/911 S01.jpg", "livrees/s01-911-blanche", "Livrée S01", "Porsche 911 RSR blanche – livrée sponsors S01", ""),
    (f"{LIV}/IMG_6146.WEBP", "livrees/s01-course-gtr", "Livrée S01", "Course S01 – Nissan GT-R GTQC", ""),
    (f"{LIV}/IMG_6150.WEBP", "livrees/s01-course-amg-jaune", "Livrée S01", "Course S01 – Mercedes-AMG jaune", ""),
    (f"{LIV}/IMG_6151.WEBP", "livrees/s01-911-bleue", "Livrée S01", "Porsche 911 bleue – livrée sponsors S01", ""),
    (f"{LIV}/IMG_6152.WEBP", "livrees/s01-911-requin", "Livrée S01", "Porsche 911 bleue « requin » en course", ""),
    (f"{LIV}/IMG_6153.WEBP", "livrees/s01-course-peloton", "Livrée S01", "Course S01 – peloton devant les gradins", ""),
    (f"{LIV}/v1/IMG_7685.JPG", "livrees/s01-v1-avant", "Livrée S01 v1", "Concept livrée noire v1 – avant", ""),
    (f"{LIV}/v1/IMG_7686.JPG", "livrees/s01-v1-cote", "Livrée S01 v1", "Concept livrée noire v1 – côté", ""),
    (f"{LIV}/v1/IMG_7687.JPG", "livrees/s01-v1-capot", "Livrée S01 v1", "Concept livrée noire v1 – capot", ""),
    (f"{LIV}/v1/IMG_7688.JPG", "livrees/s01-v1-capot-noms", "Livrée S01 v1", "Capot avec noms des supporteurs « Citoyen »", ""),
    (f"{LIV}/v1/IMG_7689.JPG", "livrees/s01-v1-arriere", "Livrée S01 v1", "Concept livrée noire v1 – 3/4 arrière", ""),
    (f"{LIV}/v1/IMG_7690.JPG", "livrees/s01-v1-dessus", "Livrée S01 v1", "Concept livrée noire v1 – dessus", ""),
    (f"{LIV}/v1/IMG_7691.JPG", "livrees/s01-v1-profil", "Livrée S01 v1", "Concept livrée noire v1 – profil", ""),
    # --- Équipes S01
    (f"{TEAMS}/440a0c83-700d-47e6-8f93-b1d980f5d243.jpeg", "equipes/s01-trx", "Équipe S01", "Logo « TRX 2020-25 »", "Oui"),
    (f"{TEAMS}/B12E96E6-9079-4B0A-9FB0-263000448FFA.webp", "equipes/s01-equipe-casque", "Équipe S01", "Affiche d'équipe (casque, drapeau à damier) – nom inconnu", "Oui"),
    (f"{TEAMS}/DD48AFA3-3626-4FB6-AE18-5FFF85807884.webp", "equipes/s01-cobra-kai", "Équipe S01", "Cobra Kai Racing Team (RalphXtreme, VIP_JP_Scale)", ""),
    (f"{TEAMS}/GDC__qcgt.webp", "equipes/s01-gentleman-driver-club", "Équipe S01", "Gentleman Driver Club GTQC", ""),
    # --- Documents
    (f"{L1}/CoC GTQC s.pdf", "documents/code-de-conduite", "Document", "Code de conduite & règlement officiel → onglet Reglements", ""),
    (f"{L1}/gt7qc v1.docx", None, "Document", "Plan de commandite S01 (forfaits) → onglet Sponsors / Admin", ""),
]
RESSOURCES = ["Arms_of_France_(France_Moderne).svg.png", "Coat_of_arms_of_Quebec.svg.png",
              "Coat_of_arms_of_Québec_(1867-1939).svg.png", "Flag_of_Gaspesie.svg.png", "Fleur_de_lys_du_québec.svg.png",
              "Lion_Couchant.svg.png", "Lion_Passant.svg.png", "Lion_Salient.svg.png", "Lion_Sejant.svg",
              "Lion_Sejant.svg.png", "Lion_Tricorporated.svg.png",
              "bg,f8f8f8-flat,750x,075,f-pad,750x1000,f8f8f8.jpg", "flat,750x,075,f-pad,750x1000,f8f8f8.jpg"]
for f in RESSOURCES:
    ITEMS.append((f"{L1}/{f}", None, "Ressource graphique",
                  "Héraldique / Gaspésie (inspiration pour logo ou livrée) – pas pour le site", ""))


def copy(src: Path, dst_noext: str) -> str:
    ext = src.suffix.lower()
    if ext in (".svg", ".pdf", ".webp"):
        dst = DST / f"{dst_noext}{ext}"
        dst.parent.mkdir(parents=True, exist_ok=True)
        if ext == ".svg" and not src.read_bytes()[:200].lstrip().startswith((b"<", b"\xef\xbb\xbf<")):
            raise ValueError("faux SVG")
        shutil.copyfile(src, dst)
        return dst.relative_to(ROOT).as_posix()
    im = ImageOps.exif_transpose(Image.open(src))
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    # Seuls les logos gardent la transparence ; les photos/vignettes passent en JPG (plus léger)
    is_logo = dst_noext.split("/")[0] in ("logo", "sponsors", "equipes", "circuits")
    has_alpha = is_logo and im.mode in ("RGBA", "LA", "P") and ext == ".png"
    if has_alpha:
        dst = DST / f"{dst_noext}.png"
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, optimize=True)
    else:
        dst = DST / f"{dst_noext}.jpg"
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.convert("RGB").save(dst, quality=85, optimize=True, progressive=True)
    return dst.relative_to(ROOT).as_posix()


rows, missing = [], []
seen = set()
for orig, dst, cat, desc, conf in ITEMS:
    src = SRC / orig
    seen.add(src.resolve())
    if not src.exists():
        missing.append(orig)
        continue
    new = copy(src, dst) if dst else ""
    rows.append(dict(original=f"Photos/{orig}", nouveau=new, categorie=cat, description=desc, a_confirmer=conf))

autres = [p for p in SRC.rglob("*") if p.is_file() and p.resolve() not in seen]
(ROOT / "database").mkdir(exist_ok=True)
with open(ROOT / "database" / "inventaire_images.csv", "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)

print(f"{len(rows)} fichiers inventoriés, {sum(1 for r in rows if r['nouveau'])} copiés dans assets/img")
print("Introuvables :", missing or "aucun")
print("Non classés :", [str(p.relative_to(SRC)) for p in autres] or "aucun")
