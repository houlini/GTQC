"""Construit la liste de référence des 122 tracés GT7 (database/circuits_gt7.csv).

Sources :
- Données (pays, longueur, dénivelé, virages, ligne droite) : liste officielle
  https://www.gran-turismo.com/us/gt7/tracklist/ (octobre 2026), en milles → converties en km / m.
- Logo du lieu : images de cette même page officielle.
- Image du tracé : Gran Turismo Wiki (Fandom) https://gran-turismo.fandom.com/wiki/Gran_Turismo_7/Track_List
  Un tracé « Reverse » utilise la même image que le sens normal.

Usage : python outils/circuits_gt7.py <gt7_official.json>
"""
import csv, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MI = 1.609344
LOGO = "https://www.gran-turismo.com/common/dist/gt7/tracklist/assets/{}.png"
WIKI = "https://static.wikia.nocookie.net/gran-turismo/images/"

PAYS = {"France": "France", "Italy": "Italie", "Brazil": "Brésil", "Japan": "Japon", "U.S.": "États-Unis",
        "United Kingdom": "Royaume-Uni", "Canada": "Canada", "Spain": "Espagne", "Belgium": "Belgique",
        "Switzerland": "Suisse", "Croatia": "Croatie", "Australia": "Australie", "Germany": "Allemagne",
        "Austria": "Autriche", "UAE": "Émirats arabes unis"}
CODE = {"France": "FR", "Italy": "IT", "Brazil": "BR", "Japan": "JP", "U.S.": "US", "United Kingdom": "GB",
        "Canada": "CA", "Spain": "ES", "Belgium": "BE", "Switzerland": "CH", "Croatia": "HR",
        "Australia": "AU", "Germany": "DE", "Austria": "AT", "UAE": "AE"}
FICTIFS = ("Alsace", "Lago Maggiore", "Blue Moon Bay", "BB Raceway", "Sainte-Croix", "Colorado Springs",
           "Deep Forest", "Dragon Trail", "Eiger", "Fishermans", "Grand Valley", "High Speed Ring", "Kyoto",
           "Lake Louise", "Northern Isle", "Sardegna", "Special Stage", "Tokyo Expressway", "Trial Mountain")

# Nom officiel (sans « Reverse ») → image du tracé sur le wiki
TRACE = {
    "24 Heures du Mans Racing Circuit": "1/1f/Circuit_de_la_Sarthe_map.png",
    "Alsace - Test Course": "f/f3/Alsace_TC.png",
    "Alsace - Village": "e/ef/Alsace_-_Village.jpg",
    "Autodrome Lago Maggiore - Center": "6/6b/Autodrome_Lago_Maggiore_-_Center.jpg",
    "Autodrome Lago Maggiore - East": "b/b3/Autodrome_Lago_Maggiore_-_East.jpg",
    "Autodrome Lago Maggiore - East End": "4/41/Autodrome_Lago_Maggiore_-_East_End.jpg",
    "Autodrome Lago Maggiore - Full Course": "c/cc/Autodrome_Lago_Maggiore_-_GP.jpg",
    "Autodrome Lago Maggiore - West": "3/3e/Autodrome_Lago_Maggiore_-_West.jpg",
    "Autodrome Lago Maggiore - West End": "5/51/Autodrome_Lago_Maggiore_-_West_End.jpg",
    "Autodromo Nazionale Monza": "8/8f/Autodromo_Nazionale_Monza.jpg",
    "Autodromo Nazionale Monza No Chicane": "b/b0/Autodromo_Nazionale_Monza_%28No_Chicane%29.jpg",
    "Autódromo de Interlagos": "3/34/Interlagos.jpg",
    "Autopolis International Racing Course": "0/0c/Autopolis_International_Racing_Course.jpg",
    "Autopolis International Racing Course - Short Course": "1/10/Autopolis_International_Racing_Course_-_Shortcut_Course.jpg",
    "Blue Moon Bay Speedway": "a/a1/Blue_Moon_Bay_Speedway.jpg",
    "Blue Moon Bay Speedway - Infield A": "3/32/Blue_Moon_Bay_Speedway_-_Infield_A.jpg",
    "Blue Moon Bay Speedway - Infield B": "c/cd/Blue_Moon_Bay_Speedway_-_Infield_B.jpg",
    "Brands Hatch Grand Prix Circuit": "d/d8/Brands_Hatch_GP.jpg",
    "Brands Hatch Indy Circuit": "e/ea/Brands_Hatch_Indy.jpg",
    "BB Raceway": "1/1d/Bb_raceway.jpg",
    "Circuit Gilles-Villeneuve": "c/c9/Circuit_Gilles-Villeneuve.png",
    "Circuit de Barcelona-Catalunya GP Layout": "9/94/Circuit_de_Barcelona-Catalunya_Grand_Prix_Layout.jpg",
    "Circuit de Barcelona-Catalunya GP Layout No Chicane": "e/e1/Circuit_de_Barcelona-Catalunya_Grand_Prix_Layout_No_Chicane.png",
    "Circuit de Barcelona-Catalunya National Layout": "c/ce/Circuit_de_Barcelona-Catalunya_National_Layout.png",
    "Circuit de Barcelona-Catalunya Rallycross Layout": "4/4d/Circuit_de_Barcelona-Catalunya_Rallycross_Layout.png",
    "Circuit de Sainte-Croix - A": "6/68/Circuit_de_Sainte-Croix_-_A1.jpg",
    "Circuit de Sainte-Croix - B": "5/51/Circuit_de_Sainte-Croix_-_B.jpg",
    "Circuit de Sainte-Croix - C": "b/b6/Circuit_de_Sainte-Croix_-_C.jpg",
    "Circuit de Spa-Francorchamps": "f/ff/Spa-Francorchamps.jpg",
    "Spa 24h layout": "5/50/Circuit_de_Spa-Francorchamps_-_24h.jpg",
    "Colorado Springs - Lake": "8/86/Colorado_Springs_-_Lake.jpg",
    "Daytona Road Course": "c/c9/Daytona_Road_Course.jpg",
    "Daytona Tri-Oval": "e/e0/Daytona_Superspeedway.jpg",
    "Deep Forest Raceway": "6/60/Deep_Forest_Raceway_%28GT7%29.png",
    "Dragon Trail - Gardens": "a/a7/Dragon_Trail_-_Gardens.jpg",
    "Dragon Trail - Seaside": "2/2f/Dragon_Trail.jpg",
    "Eiger Nordwand": "2/2d/Eiger_Nordwand_%28GT7%29_map.png",
    "Fishermans Ranch": "e/e1/Fisherman%27s_Ranch.jpg",
    "Fuji International Speedway": "9/9b/Fuji_Speedway_2005.jpg",
    "Fuji International Speedway (Short)": "d/d6/Fuji_Speedway_2005_GT.jpg",
    "Goodwood Motor Circuit": "9/93/Goodwood_Motor_Circuit.jpg",
    "Grand Valley - Highway 1": "0/01/Grand_Valley_Highway_1.png",
    "Grand Valley - South": "e/e4/Grand_Valley_South.png",
    "High Speed Ring": "f/f3/High_Speed_Ring_GT7_Map.png",
    "Kyoto Driving Park - Miyabi": "6/6d/Kyoto_Driving_Park_-_Miyabi.jpg",
    "Kyoto Driving Park - Yamagiwa": "a/a4/Kyoto_Driving_Park_-_Yamagiwa.jpg",
    "Kyoto Driving Park - Yamagiwa+Miyabi": "1/15/Kyoto_Driving_Park_-_Yamagiwa_Miyabi.jpg",
    "Lake Louise Long Track": "7/76/Lake_Louise_Long_Track.png",
    "Lake Louise Short Track": "9/95/Lake_Louise_Short_Track.png",
    "Lake Louise Tri-Oval": "a/a4/Lake_Louise_Tri-Oval.png",
    "Michelin Raceway Road Atlanta": "8/87/Michelin_Raceway_Road_Atlanta.png",
    "Mount Panorama Motor Racing Circuit": "3/30/Mount_Panorama.jpg",
    "Northern Isle Speedway": "d/dd/Northern_Isle_Speedway.jpg",
    "Nürburgring 24h": "0/02/N%C3%BCrburgring_24h.jpg",
    "Nürburgring GP": "f/f6/N%C3%BCrburgring_GPF.jpg",
    "Nürburgring Nordschleife": "4/41/N%C3%BCrburgring_Nordschleife.jpg",
    "Nürburgring Nordschleife Tourist": "4/41/N%C3%BCrburgring_Nordschleife.jpg",
    "Nürburgring Sprint": "c/c4/N%C3%BCrburgring_typeV.jpg",
    "Red Bull Ring": "7/75/Red_Bull_Ring.jpg",
    "Red Bull Ring Short Track": "6/6c/Red_Bull_Ring_Short_Track.jpg",
    "Sardegna - Road Track - A": "5/54/Sardegna_-_Road_Track_-_A.jpg",
    "Sardegna - Road Track - B": "6/6c/Sardegna_-_Road_Track_-_B.jpg",
    "Sardegna - Road Track - C": "5/54/Sardegna_-_Road_Track_-_C.jpg",
    "Sardegna - Windmills": "f/f5/Sardegna_-_Windmills.jpg",
    "Special Stage Route X": "6/6d/Special_Stage_Route_X.jpg",
    "SUGO International Racing Course": "d/df/Sportsland_SUGO.png",
    "Suzuka Circuit": "f/fb/Suzuka_Circuit.jpg",
    "Suzuka Circuit East Course": "c/c3/Suzuka_Circuit_East_Course.jpg",
    "Tokyo Expressway - Central Clockwise": "1/1c/Tokyo_Expressway_Central_Outer_Loop.jpg",
    "Tokyo Expressway - Central Counterclockwise": "7/72/Tokyo_Expressway_Central_Inner_Loop.jpg",
    "Tokyo Expressway - East Clockwise": "1/16/Tokyo_Expressway_East_Outer_Loop.jpg",
    "Tokyo Expressway - East Counterclockwise": "1/16/Tokyo_Expressway_East_Inner_Loop.jpg",
    "Tokyo Expressway - South Clockwise": "8/8b/Tokyo_Expressway_South_Outer_Loop.jpg",
    "Tokyo Expressway - South Counterclockwise": "0/0f/Tokyo_Expressway_South_Inner_Loop.jpg",
    "Trial Mountain Circuit": "5/59/Trial_Mountain_GT7_Map.png",
    "Tsukuba Circuit": "7/7c/Tsukuba_Circuit.jpg",
    "Watkins Glen Long Course": "5/52/Watkins_Glen_International_%28Long_Course%29.png",
    "Watkins Glen Short Course": "3/3d/Watkins_Glen_International_%28Short_Course%29.png",
    "WeatherTech Raceway Laguna Seca": "c/ce/Mazda_Raceway_Laguna_Seca.jpg",
    "Willow Springs International Raceway: Big Willow": "d/d0/Willow_Springs_%28Big_Willow%29.jpg",
    "Willow Springs International Raceway: Horse Thief Mile": "0/0d/Willow_Springs_Horse_Thief_Mile.jpg",
    "Willow Springs International Raceway: Streets of Willow Springs": "c/cf/Willow_Springs_%28Streets_of_Willow%29.jpg",
    "Yas Marina Circuit": "b/b0/Yas_Marina_Circuit.png",
}

# Tracés utilisés ou prévus par GTQC → circuit_id de l'onglet Circuits
GTQC = {
    "Nürburgring GP": ("nurburgring-gp", "S02 (tryouts)"),
    "Sardegna - Road Track - A": ("sardegna-road-a", "S02"),
    "Sardegna - Road Track - C": ("sardegna-road-c", "S03 (brouillon)"),
    "Alsace - Village": ("alsace-village", "S02"),
    "Fuji International Speedway": ("fuji-speedway", "S02"),
    "Daytona Road Course": ("daytona-road", "S02"),
    "Autodrome Lago Maggiore - Full Course Reverse": ("maggiore-full-rev", "S02"),
    "Suzuka Circuit": ("suzuka-circuit", "S02"),
    "Circuit de Sainte-Croix - A": ("sainte-croix-a", "S02"),
    "Trial Mountain Circuit Reverse": ("trial-mountain-rev", "S02"),
    "Yas Marina Circuit": ("yas-marina", "S02"),
    "Grand Valley - Highway 1 Reverse": ("grand-valley-hwy1-rev", "S02"),
    "SUGO International Racing Course": ("sugo", "S03 (brouillon)"),
    "Circuit Gilles-Villeneuve": ("gilles-villeneuve", "S03 (brouillon)"),
    "Blue Moon Bay Speedway - Infield A": ("blue-moon-bay-infield-a", "S03 (brouillon)"),
    "Willow Springs International Raceway: Horse Thief Mile": ("willow-springs-htm", "S03 (brouillon)"),
    "Dragon Trail - Seaside": ("dragon-trail-seaside", "S03 (brouillon)"),
    "Deep Forest Raceway": ("deep-forest", "S03 (brouillon - sens à choisir)"),
    "Eiger Nordwand": ("eiger-nordwand", "S03 (brouillon)"),
    "Brands Hatch Grand Prix Circuit": ("brands-hatch", "S03 (brouillon)"),
    "Autopolis International Racing Course": ("autopolis", "S03 (brouillon)"),
}


def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def split(name):
    """Sépare le lieu et la variante : « Sardegna - Road Track - A » → (« Sardegna », « Road Track - A »)."""
    for sep in (": ", " - "):
        if sep in name:
            lieu, var = name.split(sep, 1)
            return lieu, var
    for lieu in ("Nürburgring", "Lake Louise", "Brands Hatch", "Watkins Glen", "Red Bull Ring", "Daytona",
                 "Autodromo Nazionale Monza", "24 Heures du Mans Racing Circuit", "Circuit de Barcelona-Catalunya",
                 "Suzuka Circuit", "Fuji International Speedway", "Blue Moon Bay Speedway", "High Speed Ring",
                 "BB Raceway", "Deep Forest Raceway", "Eiger Nordwand", "Fishermans Ranch", "Trial Mountain Circuit"):
        if name.startswith(lieu):
            return lieu, name[len(lieu):].strip(" ()") or "Complet"
    if name.startswith("Spa 24h"):
        return "Circuit de Spa-Francorchamps", "24h"
    return name, "Complet"


rows = []
for name, country, length, elev, turns, straight, logo in json.load(open(sys.argv[1], encoding="utf-8")):
    reverse = name.endswith(" Reverse")
    base = name[:-len(" Reverse")] if reverse else name
    lieu, var = split(name)
    gtqc = GTQC.get(name, ("", ""))
    rows.append(dict(
        layout_id=slug(name), nom_officiel=name, lieu=lieu, variante=var, reverse="TRUE" if reverse else "FALSE",
        pays=PAYS[country], code_pays=CODE[country],
        fictif="TRUE" if any(f in name for f in FICTIFS) else "FALSE",
        longueur_km=round(length * MI, 2), denivele_m_approx=round(elev * MI * 1000), virages=turns,
        ligne_droite_m=round(straight * MI * 1000),
        logo_lieu_url=LOGO.format(logo), trace_url=WIKI + TRACE[base] if base in TRACE else "",
        circuit_id_gtqc=gtqc[0], utilise_gtqc=gtqc[1]))

out = ROOT / "database" / "circuits_gt7.csv"
with open(out, "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print(f"{len(rows)} tracés, {len({r['lieu'] for r in rows})} lieux, {sum(r['reverse'] == 'TRUE' for r in rows)} reverse")
print("Sans image de tracé :", [r["nom_officiel"] for r in rows if not r["trace_url"]] or "aucun")
print("Utilisés par GTQC :", sum(1 for r in rows if r["circuit_id_gtqc"]), "/", len(GTQC))
