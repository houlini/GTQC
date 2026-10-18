"""Construit la nouvelle base de données GTQC (publique + privée) à partir du Sheet existant."""
import re, sys, unicodedata
from collections import defaultdict
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

SRC, OUT_PUB, OUT_PRIV = sys.argv[1], sys.argv[2], sys.argv[3]
src = openpyxl.load_workbook(SRC, data_only=True)
report = []

def s(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()

def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")

def key(t):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", s(t)).encode("ascii", "ignore").decode().lower())

# ---------------------------------------------------------------- Pilotes
pilots = {}      # pilote_id -> dict
alias = {}       # key(nom ou pseudo) -> pilote_id

def add_alias(pid, *names):
    for n in names:
        k = key(n)
        if k:
            alias.setdefault(k, pid)

def find(*names):
    for n in names:
        k = key(n)
        if k and k in alias:
            return alias[k]
    return None

JUNK = {"discord", "discordname", "nom", "s03", "nompilotesreserves"}

def upsert(discord, nom, psn="", gridfinder="", gtname="", **extra):
    if key(discord) in JUNK or key(nom) in JUNK or (not key(discord) and not key(nom)):
        return None
    pid =find(discord, psn, gridfinder, nom) if (discord or nom) else None
    if not pid:
        base = slug(discord or psn or nom)
        pid = base
        i = 2
        while pid in pilots:
            pid = f"{base}-{i}"; i += 1
        pilots[pid] = dict(pilote_id=pid, pseudo=discord or psn or nom, nom_complet=nom, psn=psn,
                           gridfinder=gridfinder, discord=discord, gt_name=gtname)
    p = pilots[pid]
    for k_, v in dict(psn=psn, gridfinder=gridfinder, discord=discord, nom_complet=nom, gt_name=gtname, **extra).items():
        if v and not p.get(k_):
            p[k_] = v
    add_alias(pid, discord, psn, gridfinder, nom)
    return pid

st = src["Standing"]
standing_rows = []
for r in range(3, 40):
    row = {c.column_letter: c.value for c in st[r]}
    discord, nom = s(row.get("F")), s(row.get("G"))
    if not (discord or nom):
        continue
    pid = upsert(discord, nom, s(row.get("D")), s(row.get("C")), s(row.get("E")))
    if not pid:
        continue
    standing_rows.append((pid, row))
add_alias(find("SFRT_Zacktoto"), "Zacktoto")

tr = src["Tryoutsregister"]
tryout = {}
for r in range(2, tr.max_row + 1):
    v = [s(c.value) for c in tr[r]]
    if len(v) < 12 or not (v[5] or v[7]):
        continue
    pid = upsert(v[5], v[7], v[3], v[2], v[4], controle=v[9], driver_rating=v[10])
    if not pid:
        continue
    tryout[pid] = dict(lobby=v[1], facebook=v[6], email=v[8], tryout=v[11], tryout_note=v[12] + " " + v[13],
                       note=" | ".join(x for x in v[15:17] if x), mail_inscription=v[17] if len(v) > 17 else "",
                       paiement=v[18] if len(v) > 18 else "", note_xtra=" ".join(v[19:]).strip())

ins = src["inscriptions"]
inscr = {}
for r in range(2, ins.max_row + 1):
    v = [s(c.value) for c in ins[r]]
    if len(v) < 6 or not (v[3] or v[5] or v[4]):
        continue
    pid = upsert(v[3], v[5] or v[4], v[2], v[1], controle=v[7] if len(v) > 7 else "",
                 driver_rating=v[8] if len(v) > 8 else "")
    if not pid:
        continue
    inscr[pid] = dict(facebook=v[4], email=v[6] if len(v) > 6 else "", lobby_inscription=v[10] if len(v) > 10 else "")

res_ws = src["Reserves"]
reserves_notes = {}
for r in range(5, 20):
    v = [s(c.value) for c in res_ws[r]]
    if len(v) > 2 and (v[1] or v[2]):
        pid = upsert(v[1], v[2])
        if not pid:
            continue
        reserves_notes[pid] = " ".join(x for x in v[3:] if x)

lob = src["Lobby"]
def block(col_num, rows):
    out = {}
    for r in rows:
        num = lob.cell(r, col_num).value
        lobby = s(lob.cell(r, col_num + 1).value)
        d = s(lob.cell(r, col_num + 2).value)
        n = s(lob.cell(r, col_num + 3).value)
        if not d and not n:
            continue
        pid = upsert(d, n)
        if not pid:
            continue
        out[pid] = (lobby, s(num))
    return out
lobby_r12 = block(2, range(3, 40))
lobby_r34 = block(8, range(3, 40))
lobby_r3_reel = block(8, range(41, 80))
lobby_r56 = block(14, range(3, 40))

# Normaliser quelques champs
for p in pilots.values():
    c = p.get("controle", "").lower()
    p["controle"] = "Volant" if c.startswith("wheel") else ("Manette" if c.startswith("controller") else "")

# ---------------------------------------------------------------- Catégories / barème
CAT = {"lobby 1": "D1", "lobby 2": "D2"}
scale = {"D1": [35, 32, 30, 28, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17],
         "D2": [20, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]}

# ---------------------------------------------------------------- Circuits
circuits = [
    # id, nom, layout, pays, code pays, fictif
    ("nurburgring-gp", "Nürburgring", "GP", "Allemagne", "DE", False),
    ("sardegna-road-a", "Sardegna – Road Track", "Layout A", "Italie", "IT", True),
    ("sardegna-road-c", "Sardegna – Road Track", "Layout C", "Italie", "IT", True),
    ("alsace-village", "Alsace", "Village", "France", "FR", True),
    ("fuji-speedway", "Fuji International Speedway", "Circuit complet", "Japon", "JP", False),
    ("daytona-road", "Daytona International Speedway", "Road Course", "États-Unis", "US", False),
    ("maggiore-full-rev", "Lake Maggiore", "Full Course Reverse", "Italie", "IT", True),
    ("suzuka-circuit", "Suzuka Circuit", "Circuit complet", "Japon", "JP", False),
    ("sainte-croix-a", "Circuit de Sainte-Croix", "Layout A", "France", "FR", True),
    ("trial-mountain-rev", "Trial Mountain Circuit", "Reverse", "États-Unis", "US", True),
    ("yas-marina", "Yas Marina Circuit", "Grand Prix", "Émirats arabes unis", "AE", False),
    ("grand-valley-hwy1-rev", "Grand Valley", "Highway 1 Reverse", "États-Unis", "US", True),
    ("sugo", "Sportsland SUGO", "", "Japon", "JP", False),
    ("autumn-ring", "Autumn Ring", "", "Japon", "JP", True),
    ("gilles-villeneuve", "Circuit Gilles-Villeneuve", "", "Canada", "CA", False),
    ("blue-moon-bay-infield-a", "Blue Moon Bay Speedway", "Infield A", "États-Unis", "US", True),
    ("willow-springs-htm", "Willow Springs International Raceway", "Horse Thief Mile", "États-Unis", "US", False),
    ("dragon-trail-seaside", "Dragon Trail", "Seaside", "Croatie", "HR", True),
    ("deep-forest", "Deep Forest Raceway", "", "Suisse", "CH", True),
    ("eiger-nordwand", "Eiger Nordwand", "", "Suisse", "CH", True),
    ("tokyo-expressway", "Tokyo Expressway", "", "Japon", "JP", False),
    ("brands-hatch", "Brands Hatch", "", "Royaume-Uni", "GB", False),
    ("autopolis", "Autopolis International Racing Course", "", "Japon", "JP", False),
]
s02_track_ids = ["nurburgring-gp", "sardegna-road-a", "alsace-village", "fuji-speedway", "daytona-road",
                 "maggiore-full-rev", "suzuka-circuit", "sainte-croix-a", "trial-mountain-rev",
                 "yas-marina", "grand-valley-hwy1-rev"]
cond_jeu = {"fuji-speedway": "Météo aléatoire", "daytona-road": "Jour à nuit", "suzuka-circuit": "Pluie",
            "trial-mountain-rev": "Tôt le matin", "yas-marina": "Jour à nuit",
            "grand-valley-hwy1-rev": "Lever ou coucher du soleil", "nurburgring-gp": "Tryouts"}

# ---------------------------------------------------------------- Manches S02
cal = src["Calendrier"]
def cal_block(r0):
    out = {}
    for r in range(r0, r0 + 11):
        v = [s(c.value) for c in cal[r]]
        out[int(v[0])] = v
    return out
c1, c2 = cal_block(4), cal_block(18)
manches, manches_cat = [], []
def grp(g):
    g = g.replace("(S02)", "").strip()
    return {"Gr2": "Gr.2"}.get(g, g)
def num(t):
    m = re.search(r"\d+", t or "")
    return int(m.group()) if m else ""
# Dates : capture du calendrier S02 (Photos/S02) — tous des dimanches
s02_dates = ["2026-08-16", "2026-09-06", "2026-09-20", "2026-10-04", "2026-10-11", "2026-10-25",
             "2026-11-08", "2026-11-15", "2026-11-22", "2026-12-06", "2026-12-13"]
for m in range(0, 11):
    v = c1[m]
    cid = s02_track_ids[m]
    manches.append(dict(
        course_id=f"S02-R{m:02d}", saison_id="S02", manche=m,
        type="Tryout" if m == 0 else ("Finale" if m == 10 else "Course"),
        date=s02_dates[m], date_fin="2026-08-23" if m == 0 else "", heure="",
        circuit_id=cid, groupe_voiture=grp(v[3]),
        heure_du_jour=re.sub(r"\s*x\d+", "", v[5]).strip().capitalize(),
        vitesse_temps=(re.search(r"x\d+", v[5]) or [""])[0],
        conditions=cond_jeu.get(cid, ""),
        arret_pit_min=num(v[7]), conso_carburant=v[8].upper(), usure_pneus=v[9].upper(),
        carburant_initial_l=num(v[10]), ravitaillement=v[11].replace(" ", ""),
        temps_pit_s=num(v[12]) if len(v) > 12 else "",
        statut="Terminée" if 1 <= m <= 4 else ("Terminée" if m == 0 else "À venir"),
        publier=m != 0, lien_stream="",
        image="saisons/s02-tryouts-banniere.jpg" if m == 0 else f"manches/s02-r{m:02d}.jpg",
        note_publique="Tryouts du 16 au 23 août" if m == 0 else ""))
    for cat, blk in (("D1", c1), ("D2", c2)):
        w = blk[m]
        manches_cat.append(dict(course_id=f"S02-R{m:02d}", categorie_id=cat,
                                tours=num(w[4]) if "lap" in w[4].lower() else "",
                                duree=w[4] if "min" in w[4].lower() else "",
                                meteo_slots=w[6] if m != 0 else "",
                                heure_depart="18:30" if cat == "D2" else "", lien_stream=""))

# ---------------------------------------------------------------- Résultats S02 (R1–R4)
pts_cols = {1: ("I", "J"), 2: ("K", "L"), 3: ("M", "N"), 4: ("O", "P")}
results, pending = [], []
used = defaultdict(dict)
for pid, row in standing_rows:
    for rnd, (pc, fc) in pts_cols.items():
        pts = row.get(pc)
        if pts is None:
            continue
        pts = float(pts)
        fl = bool(row.get(fc))
        if rnd in (1, 2):
            lb = lobby_r12.get(pid)
        elif rnd == 3:
            lb = lobby_r3_reel.get(pid) or lobby_r34.get(pid)
        else:
            lb = lobby_r34.get(pid)
        cat = CAT.get((lb[0] if lb else "").lower().strip())
        statut, pos = "", ""
        if pts == 0:
            if not fl:
                continue  # absent / n'a pas couru
        elif cat and int(pts) in scale[cat] and pts.is_integer():
            pos = scale[cat].index(int(pts)) + 1
            statut = "Classé"
            prev = used[(rnd, cat)].get(pos)
            if prev:
                report.append(f"CONFLIT R{rnd} {cat} P{pos}: {prev} et {pid} ({pts} pts)")
            used[(rnd, cat)][pos] = pid
        else:
            pending.append((rnd, pid, pts, fl, cat))
            continue
        results.append(dict(course_id=f"S02-R{rnd:02d}", categorie_id=cat or "", pilote_id=pid,
                            position=pos, points=pts if pts else 0, meilleur_tour=fl,
                            points_bonus=1 if fl else 0, statut=statut, note=""))

# Remplaçants (réserves) : déduire le lobby là où la position est libre
for rnd, pid, pts, fl, cat in pending:
    free = [c for c in scale if pts.is_integer() and int(pts) in scale[c]
            and (scale[c].index(int(pts)) + 1) not in used[(rnd, c)]]
    note, pos, statut = "", "", "À vérifier"
    if len(free) == 1:
        cat = free[0]
        pos = scale[cat].index(int(pts)) + 1
        used[(rnd, cat)][pos] = pid
        statut, note = "Classé", "Remplaçant – lobby déduit des points"
    else:
        report.append(f"A VERIFIER R{rnd}: {pid} {pts} pts, lobby={cat}, possibilités libres={free}")
        note = f"{pts:g} pts hors barème" if not free else "Lobby ambigu"
    results.append(dict(course_id=f"S02-R{rnd:02d}", categorie_id=cat or "", pilote_id=pid,
                        position=pos, points=pts, meilleur_tour=fl, points_bonus=1 if fl else 0,
                        statut=statut, note=note))
results.sort(key=lambda x: (x["course_id"], x["categorie_id"], x["position"] or 99))

# Pénalités de points (colonne Q = cumul) + descriptions stewards
pen_rows = []
spw = src["Stewardspenalty"]
round_cols = {"I": 1, "J": 2, "K": 3, "L": 4, "M": 5, "N": 6, "O": 7, "P": 8, "Q": 9, "R": 10}
for r in range(3, 40):
    row = {c.column_letter: c.value for c in spw[r]}
    pid = find(s(row.get("F")), s(row.get("H")))
    if not pid:
        continue
    for col, rnd in round_cols.items():
        d = s(row.get(col))
        if not d:
            continue
        m_pts = re.search(r"-\s*([\d.,]+)\s*pt", d)
        m_sec = re.search(r"(\d+)\s*sec", d)
        typ = "Points" if m_pts else ("Temps" if m_sec else ("Avertissement" if "warning" in d.lower() else "Note"))
        pen_rows.append(dict(course_id=f"S02-R{rnd:02d}", pilote_id=pid, type=typ,
                             secondes=int(m_sec.group(1)) if m_sec else "",
                             points=-float(m_pts.group(1).replace(",", ".")) if m_pts else "",
                             motif=d, publier=typ != "Note"))
# Vérifier contre la colonne Q du Standing
for pid, row in standing_rows:
    q = row.get("Q")
    tot = sum(p["points"] for p in pen_rows if p["pilote_id"] == pid and p["points"] != "")
    if q and abs(float(q) - tot) > 0.01:
        report.append(f"PENALITE: {pid} Standing={q} vs Stewards={tot} -> valeur du Standing retenue")
        pts_rows = [p for p in pen_rows if p["pilote_id"] == pid and p["points"] != ""]
        if len(pts_rows) == 1:
            pts_rows[0]["points"] = float(q)
            tot = float(q)
    calc = sum(x["points"] + x["points_bonus"] for x in results if x["pilote_id"] == pid) + tot
    if row.get("X") not in (None, "") and abs(float(row["X"]) - calc) > 0.01:
        report.append(f"TOTAL: {pid} Standing={row['X']} vs recalculé={calc}")

# ---------------------------------------------------------------- Engagements S02
engagements = []
for pid, row in standing_rows:
    lb = s(row.get("B")).lower()
    role = s(row.get("H")) or "Pilote"
    engagements.append(dict(saison_id="S02", pilote_id=pid,
                            categorie_id=CAT.get(lb, ""), role="Réserve" if "reserve" in (role + lb).lower() else "Titulaire",
                            numero="", equipe_id="", temps_tryout=tryout.get(pid, {}).get("tryout", ""),
                            note=reserves_notes.get(pid, "")))
seen = {e["pilote_id"] for e in engagements}
for pid, (lb, _) in {**lobby_r12, **lobby_r34, **lobby_r56}.items():
    if pid not in seen and "reserve" in lb.lower():
        engagements.append(dict(saison_id="S02", pilote_id=pid, categorie_id="", role="Réserve", numero="",
                                equipe_id="", temps_tryout=tryout.get(pid, {}).get("tryout", ""),
                                note=reserves_notes.get(pid, "")))
        seen.add(pid)

# Lobbys par bloc de manches (promotion / relégation)
lobby_assign = []
for label, blk in (("R01-R02", lobby_r12), ("R03 (réel)", lobby_r3_reel), ("R03-R04", lobby_r34), ("R05-R06", lobby_r56)):
    for pid, (lb, n) in blk.items():
        lobby_assign.append(dict(saison_id="S02", manches=label, rang_grille=n, pilote_id=pid,
                                 categorie_id=CAT.get(lb.lower().strip(), "Réserve")))

# ================================================================ Écriture
HDR_FILL = PatternFill("solid", fgColor="0B1E3F")
HDR_FONT = Font(bold=True, color="FFFFFF")
NOTE_FONT = Font(italic=True, color="666666")

def sheet(wb, name, cols, rows, desc, widths=None, lists=None):
    ws = wb.create_sheet(name)
    ws.append(cols)
    for c in ws[1]:
        c.fill, c.font = HDR_FILL, HDR_FONT
        c.alignment = Alignment(vertical="center")
    for r in rows:
        ws.append([r.get(c, "") if isinstance(r, dict) else r[i] for i, c in enumerate(cols)])
    ws.freeze_panes = "A2"
    for i, c in enumerate(cols, 1):
        w = (widths or {}).get(c) or min(45, max(12, len(c) + 2,
              *[len(s(ws.cell(r, i).value)) + 2 for r in range(2, min(ws.max_row, 60) + 1)]))
        ws.column_dimensions[get_column_letter(i)].width = w
    for col, values in (lists or {}).items():
        idx = cols.index(col) + 1
        dv = DataValidation(type="list", formula1='"' + ",".join(values) + '"', allow_blank=True)
        ws.add_data_validation(dv)
        dv.add(f"{get_column_letter(idx)}2:{get_column_letter(idx)}1000")
    guide.append((name, desc))
    return ws

BOOL = ["TRUE", "FALSE"]

# ---------------- PUBLIC
pub = openpyxl.Workbook(); pub.remove(pub.active)
guide = []
g = pub.create_sheet("_LISEZMOI")

sheet(pub, "Config", ["cle", "valeur", "description"], [
    ("nom_ligue", "GTQC", "Nom affiché"),
    ("nom_complet", "Gran Turismo Québec", "Nom long (courriels de commandite)"),
    ("slogan", "Communauté de sim racing 100 % québécoise", "Tiré du plan de commandite"),
    ("communaute", "2 600", "Nb de passionnés dans la communauté (juillet 2026)"),
    ("courriel_contact", "gtqc.club@gmail.com", "À CONFIRMER : courriel public de la ligue"),
    ("saison_courante", "S02", "saison_id affichée par défaut"),
    ("plateforme", "PlayStation 5 – Gran Turismo 7", "À CONFIRMER"),
    ("diffusion", "Twitch, YouTube, Facebook", "Courses diffusées en direct avec commentateur"),
    ("discord_url", "", "Lien d'invitation Discord"),
    ("facebook_url", "", ""), ("instagram_url", "", ""), ("youtube_url", "", ""), ("twitch_url", "", ""),
    ("calendrier_google_url", "https://calendar.google.com/calendar/u/1?cid=Z3RxYy5jbHViQGdtYWlsLmNvbQ", "Calendrier des événements publics"),
    ("inscription_url", "", "Lien Gridfinder / formulaire"),
    ("inscription_ouverte", "FALSE", "TRUE = bouton S'inscrire visible"),
    ("frais_inscription", "", "À CONFIRMER (pistes : 40 $ à 50 $)"),
    ("jour_course", "Dimanche", "Toutes les manches S02 tombent un dimanche"),
    ("heure_course", "18:30", "D2 à 18 h 30, D1 ensuite (onglet FRED)"),
    ("points_meilleur_tour", "1", "Bonus pour le meilleur tour"),
    ("logo", "logo/gtqc-logo.png", "Logo officiel (fond transparent, intérieur blanc)"),
    ("couleur_fond", "#0A1330", "Fond du site (bleu marine foncé)"),
    ("couleur_principale", "#0048FF", "Bleu du logo GTQC"),
    ("couleur_accent", "#E6FF00", "Jaune fluo : boutons, manche en vedette, points forts"),
    ("couleur_texte", "#FFFFFF", "Texte sur fond foncé"),
], "Paramètres généraux du site (clé / valeur).")

sheet(pub, "Saisons", ["saison_id", "nom", "type", "annee", "date_debut", "date_fin", "statut", "nb_manches",
                       "groupe_principal", "description", "image", "publier"], [
    ("S01", "Saison 1", "Championnat", "2026", "2026-03-01", "", "Terminée", 8, "Gr.3",
     "Première saison sous le nom GT7QC : 8 courses sur 4 mois, 1 course aux 2 semaines, flotte de 14 voitures aux couleurs des commanditaires. À COMPLÉTER : résultats et champion.",
     "livrees/s01-911-blanche.jpg", "FALSE"),
    ("S02", "Saison 2", "Championnat", "2026", "2026-09-06", "2026-12-13", "En cours", 10, "Gr.3",
     "Tryouts du 16 au 23 août au Nürburgring, puis 10 manches le dimanche jusqu'à la finale à Grand Valley.",
     "saisons/s02-affiche.jpg", "TRUE"),
    ("S03", "Saison 3", "Championnat", "2027", "", "", "Planification", 10, "Gr.3", "Calendrier en brouillon", "", "FALSE"),
], "Championnats (2 par année) et éditions spéciales.",
    lists={"type": ["Championnat", "Édition spéciale"], "statut": ["Planification", "Inscriptions", "En cours", "Terminée"], "publier": BOOL})

sheet(pub, "Categories", ["categorie_id", "nom", "nom_court", "description", "ordre", "couleur"], [
    ("D1", "Division 1", "Lobby 1", "À CONFIRMER : 14 pilotes les plus rapides", 1, "#E6FF00"),
    ("D2", "Division 2", "Lobby 2", "À CONFIRMER", 2, "#0048FF"),
], "Les 2 catégories (Lobby 1 / Lobby 2).")

sheet(pub, "Bareme_Points", ["categorie_id", "position", "points"],
      [(c, i + 1, p) for c in scale for i, p in enumerate(scale[c])],
      "Points par position dans chaque catégorie.")

pil_cols = ["pilote_id", "pseudo", "prenom", "nom", "afficher_nom", "psn", "gridfinder", "numero",
            "region", "controle", "driver_rating", "equipe_id", "photo", "bio", "actif"]
pil_rows = []
for p in sorted(pilots.values(), key=lambda x: x["pseudo"].lower()):
    parts = p["nom_complet"].split(" ", 1)
    pil_rows.append(dict(pilote_id=p["pilote_id"], pseudo=p["pseudo"], prenom=parts[0].title() if parts else "",
                         nom=(parts[1] if len(parts) > 1 else "").title(), afficher_nom="FALSE",
                         psn=p.get("psn", ""), gridfinder=p.get("gridfinder", ""), controle=p.get("controle", ""),
                         driver_rating=p.get("driver_rating", ""), photo="", actif="TRUE"))
sheet(pub, "Pilotes", pil_cols, pil_rows,
      "Un pilote = une ligne. pilote_id sert de clé partout. afficher_nom=FALSE tant que le pilote n'a pas consenti.",
      lists={"controle": ["Volant", "Manette"], "afficher_nom": BOOL, "actif": BOOL})

sheet(pub, "Engagements", ["saison_id", "pilote_id", "categorie_id", "role", "numero", "equipe_id", "temps_tryout", "note"],
      engagements, "Qui court dans quelle saison/catégorie.", lists={"role": ["Titulaire", "Réserve"]})

sheet(pub, "Lobbys", ["saison_id", "manches", "rang_grille", "pilote_id", "categorie_id"], lobby_assign,
      "Répartition des lobbys par bloc de 2 manches (promotion / relégation).")

sheet(pub, "Circuits", ["circuit_id", "nom", "layout", "pays", "code_pays", "fictif", "longueur_km", "logo", "image_trace", "image"],
      [dict(circuit_id=c[0], nom=c[1], layout=c[2], pays=c[3], code_pays=c[4], fictif=str(c[5]).upper(),
            logo="circuits/sardegna-logo.webp" if c[0].startswith("sardegna") else "") for c in circuits],
      "Liste des circuits GT7 utilisés ou prévus.")

sheet(pub, "Manches", list(manches[0].keys()), manches,
      "Calendrier : une ligne par course. date au format AAAA-MM-JJ.",
      lists={"type": ["Tryout", "Course", "Finale", "Spéciale"], "statut": ["À venir", "En cours", "Terminée", "Annulée"],
             "publier": BOOL})

sheet(pub, "Manches_Categories", list(manches_cat[0].keys()), manches_cat,
      "Détails propres à chaque catégorie pour une manche (nb de tours, météo).")

sheet(pub, "Resultats", ["course_id", "categorie_id", "pilote_id", "position", "points", "meilleur_tour",
                         "points_bonus", "statut", "note"], results,
      "Résultat d'un pilote à une manche. Le classement est calculé par le site.",
      lists={"statut": ["Classé", "DNF", "DNS", "DSQ", "À vérifier"], "meilleur_tour": BOOL})

sheet(pub, "Penalites", ["course_id", "pilote_id", "type", "secondes", "points", "motif", "publier"], pen_rows,
      "Décisions des stewards. points négatifs = retirés du classement.",
      lists={"type": ["Avertissement", "Temps", "Points", "Disqualification", "Note"], "publier": BOOL})

voit = [("S02", "Gr.3", v) for v in ["Genesis X Gr.3", "Ford GT Race Car '18", "Renault R.S.01 GT3", "Subaru WRX Gr.3", "Chevrolet Corvette Gr.3", "Ferrari 458 Gr.3", "Nissan GT-R Gr.3 '18"]] + \
       [("S02", "Gr.4", v) for v in ["BMW M4 Gr.4", "Honda NSX Gr.4", "Subaru WRX Gr.4"]] + \
       [("S02", "Gr.2", v) for v in ["Honda NSX Gr.2", "Lexus RC F Gr.2", "Nissan GT-R Gr.2"]] + \
       [("S02", "Super Formula", "Super Formula SF23")]
sheet(pub, "Voitures", ["saison_id", "groupe", "voiture", "image"], [dict(saison_id=a, groupe=b, voiture=c) for a, b, c in voit],
      "Voitures permises par groupe et par saison (onglet « info Saison 2 »).")

sheet(pub, "Equipe", ["equipe_id", "saison_id", "nom", "description", "logo", "couleur", "instagram_url", "publier"], [
    ("gtqc-team", "S02", "GTQC Team", "À COMPLÉTER : nom officiel, logo et mission de la Team", "", "", "", "TRUE"),
    ("cobra-kai", "S01", "Cobra Kai Racing Team", "« Strike first – Strike hard – No mercy »", "equipes/s01-cobra-kai.webp", "#FFD400", "", "FALSE"),
    ("gentleman-driver-club", "S01", "Gentleman Driver Club GTQC", "", "equipes/s01-gentleman-driver-club.webp", "", "", "FALSE"),
    ("trx", "S01", "TRX (À CONFIRMER)", "Logo « TRX 2020-25 »", "equipes/s01-trx.jpg", "#E30613", "", "FALSE"),
    ("equipe-casque", "S01", "À CONFIRMER", "Affiche avec casque et drapeau à damier — nom inconnu", "equipes/s01-equipe-casque.webp", "", "", "FALSE"),
], "La Team de la ligue + les équipes de la Saison 1 (dossier « teams s01 »).", lists={"publier": BOOL})

sheet(pub, "Equipe_Membres", ["equipe_id", "membre", "pilote_id", "role", "photo", "ordre", "note"], [
    dict(equipe_id="gtqc-team", membre="G", role="TD", ordre=1, note="À CONFIRMER (onglet RT)"),
    dict(equipe_id="gtqc-team", membre="Cardinal", role="El Capitan", ordre=2),
    dict(equipe_id="gtqc-team", membre="Jay", pilote_id=find("Jaynord") or "", role="À CONFIRMER", ordre=3),
    dict(equipe_id="gtqc-team", membre="René", pilote_id=find("ralphxtreme") or "", role="VP", ordre=4),
    dict(equipe_id="gtqc-team", membre="S13", pilote_id=find("S-TH1RT3EN") or "", role="", ordre=5),
    dict(equipe_id="gtqc-team", membre="Kenny", pilote_id=find("Kenny_sul_cuir") or "", role="", ordre=6, note="Msg (CART en ce moment)"),
    dict(equipe_id="gtqc-team", membre="Bilodeau", pilote_id=find("C.bilodeau") or "", role="", ordre=7),
    dict(equipe_id="cobra-kai", membre="RalphXtreme", pilote_id=find("ralphxtreme") or "", ordre=1, note="Nom sur l'affiche"),
    dict(equipe_id="cobra-kai", membre="VIP_JP_Scale", pilote_id=find("jp_scale7930") or "", ordre=2, note="Nom sur l'affiche"),
], "Membres des équipes (onglet « RT » + affiches S01). Liens vers Pilotes quand possible — à valider.")

sheet(pub, "Organisation", ["membre", "role", "responsabilites", "photo", "ordre"], [
    ("JP, René, GD", "Host Lobby", "2 responsables par lobby", "", 1),
    ("", "Pointeur", "Saisie des résultats", "", 2),
    ("GD", "Communications", "Publications Facebook", "", 3),
    ("GD", "Graphisme", "Miniatures YouTube", "", 4),
    ("S13 (?)", "Réseaux sociaux", "Instagram, photos / vidéos", "", 5),
    ("JP", "Race Engineer", "Conditions de piste, pneus", "", 6),
    ("Jay", "Race Engineer", "Véhicules", "", 7),
    ("Fred", "Commentateur / Stream", "Diffusion des courses", "", 8),
], "Staff de la ligue (onglet S03 > ROLES).")

# id, nom, saisons, niveau, statut, contribution, description, afficher, logo, logo_fond_fonce, site_web
sponsors = [
    ("tag-e", "TAG E-Karting & Amusement", "S02", "Platine", "Confirmé", "Cartes-cadeaux 300 $",
     "Centre de karting électrique et d'amusement (Sainte-Thérèse, bientôt Québec)", "TRUE",
     "sponsors/tag-e.svg", "sponsors/tag-e.svg", "https://tagekarting.com"),
    ("scale", "SCALE – Innovative Racing Suspension", "S02", "", "Confirmé", "",
     "Partenaire d'origine (OG). Logo présent sur les vignettes officielles S02.", "TRUE",
     "sponsors/scale-carre.png", "sponsors/scale-blanc.webp", ""),
    ("willy-woodshop", "Willy Woodshop", "S01,S02", "", "Confirmé", "Trophées",
     "Fabrication de trophées. Partenaire d'origine (OG).", "TRUE",
     "sponsors/willy-woodshop.svg", "sponsors/willy-woodshop-fond-noir.svg", ""),
    ("dubby", "Dubby", "S02", "", "Confirmé", "Starter pack 40 $ + swag", "", "TRUE",
     "sponsors/dubby.svg", "sponsors/dubby.svg", ""),
    ("vicecraft", "Vicecraft", "S02", "", "Confirmé", "2 casques personnalisés",
     "Casques custom (« Vacecraft » dans la source). LOGO MANQUANT", "TRUE", "", "", ""),
    ("cardinal", "Cardinal", "S02", "", "Confirmé", "2 cours de perfectionnement (1 h chacun)",
     "Coaching. Personne ou entreprise ? LOGO MANQUANT", "TRUE", "", "", ""),
    ("chez-miller", "Chez Miller", "S02", "", "À confirmer", "", "Microbrasserie / bistro (logo reçu)", "FALSE",
     "sponsors/chez-miller.svg", "sponsors/chez-miller.svg", ""),
    ("octoprint", "Octoprint", "S03", "", "Piste", "T-shirts", "Vêtements", "FALSE", "", "", ""),
    ("mana", "Mana", "S03", "", "Piste", "", "Boisson énergisante (Qc)", "FALSE", "", "", ""),
    ("guru", "GURU", "S03", "", "Piste", "", "Boisson énergisante (Qc)", "FALSE", "", "", ""),
    ("behy", "Behy", "S03", "", "Piste", "", "Boisson énergisante (Qc)", "FALSE", "", "", ""),
    ("advanced-sim-racing", "Advanced Sim Racing", "S03", "", "Piste", "", "Accessoires sim racing", "FALSE", "", "", ""),
    ("fanabox", "Fanabox", "S03", "", "Piste", "", "Boutique en ligne produits de course", "FALSE", "", "", ""),
    ("owala", "Owala", "S03", "", "Piste", "", "", "FALSE", "", "", ""),
    # --- Saison 1 (dossier « Logo Sponsor S01 » + logos vus sur les livrées)
    ("jean-michel-marcoux", "Jean-Michel Marcoux – Courtier immobilier eXp", "S01", "", "Terminé", "",
     "Courtier immobilier résidentiel, eXp Agence immobilière", "FALSE",
     "sponsors/exp-agence-immobiliere.png", "sponsors/exp-agence-immobiliere-blanc.png", ""),
    ("garage-tropix", "Garage Tropix", "S01", "", "Terminé", "", "", "FALSE",
     "sponsors/garage-tropix-fond-blanc.png", "sponsors/garage-tropix.png", ""),
    ("bm-electrique", "BM Électrique", "S01", "", "Terminé", "", "", "FALSE",
     "sponsors/bm-electrique-orange.jpg", "sponsors/bm-electrique.jpg", ""),
    ("ceramei", "CERAMEI", "S01", "", "Terminé", "", "", "FALSE", "sponsors/ceramei.jpg", "", ""),
    ("terrassement-rl", "Terrassement R.L", "S01", "", "Terminé", "", "Aménagement extérieur : pavé, muret, béton, asphalte, gazon", "FALSE",
     "sponsors/terrassement-rl.jpg", "sponsors/terrassement-rl-blanc.png", ""),
    ("exscellant-calfeutrage", "Exscellant Calfeutrage", "S01", "", "Terminé", "", "", "FALSE",
     "sponsors/exscellant-calfeutrage.png", "", ""),
    ("rustypod", "RustyPod", "S01", "", "À confirmer", "", "rustypod.com – autocollants. Commanditaire ou simple autocollant ?", "FALSE",
     "sponsors/rustypod.png", "", "https://rustypod.com"),
    ("goplex", "GoPlex", "S01", "", "À confirmer", "", "Logo vu sur les livrées S01. LOGO MANQUANT", "FALSE", "", "", ""),
    ("eurokart", "EuroKart", "S01", "", "À confirmer", "", "Logo vu sur la livrée noire v1. LOGO MANQUANT", "FALSE", "", "", ""),
]
spons_cols = ["sponsor_id", "nom", "saisons", "niveau", "statut", "contribution", "description", "afficher",
              "logo", "logo_fond_fonce", "site_web", "ordre"]
sheet(pub, "Sponsors", spons_cols,
      [dict(zip(spons_cols, list(x) + [i + 1])) for i, x in enumerate(sponsors)],
      "Commanditaires. Seuls ceux avec afficher=TRUE apparaissent sur le site. logo = pour fond clair, logo_fond_fonce = pour le site (fond marine).",
      lists={"niveau": ["Platine", "Or", "Argent", "Bronze", "Citoyen"],
             "statut": ["Confirmé", "À confirmer", "Piste", "Terminé"], "afficher": BOOL})

sheet(pub, "Forfaits_Commandite", ["forfait", "prix", "places", "emplacements", "avantages", "ordre"], [
    ("Platine", 300, 1, "Côtés, capot, pare-chocs arrière, toit complet, aileron (6 emplacements)",
     "Voiture « concessionnaire » de votre marque pour toute la saison ; prix en articles promotionnels possible ; logo vectorisé gratuit ; mentions en direct (Twitch, YouTube, Facebook) ; logo sur la bannière Facebook ; position prioritaire sur la grille des sponsors ; présence sur photos et vidéos", 1),
    ("Or", 150, 2, "Côtés, pare-chocs avant et arrière, capot (4 emplacements)",
     "Prix en articles promotionnels possible ; mentions en direct ; logo vectorisé gratuit ; nom sur les publications des courses", 2),
    ("Argent", 60, 3, "Côtés (portes avant), arrière (2 emplacements)", "Logo vectorisé gratuit ; mention sur les publications", 3),
    ("Bronze", 20, 3, "Côtés arrière et capot (2 emplacements)", "Logo vectorisé gratuit ; mention sur les publications", 4),
    ("Citoyen", 5, "Illimité", "Nom inscrit sur le capot", "Supporteur officiel ; mention sur les publications", 5),
], "Forfaits du plan de commandite S01 (gt7qc v1.docx) — À CONFIRMER pour S02/S03 (page « Devenir partenaire »).")

prix = [("Podium", "D1 et D2 — top 3 ?", "", ""), ("Meilleur dépassement", "", "", ""),
        ("Meilleure livrée", "", "Tyyuukk / Flagman (nominés ?)", ""), ("Meilleure stratégie", "", "", ""),
        ("Assiduité", "", "", ""), ("Remontada", "", "", ""), ("Persévérance / amélioration", "", "", ""),
        ("Meilleur « pire » crash", "", "", ""), ("Meilleur à la manette", "", "", "Support manette + chargeur"),
        ("Prix réserves", "", "ZackToto / AppetitePat", ""), ("Commentateur", "", "Fred", ""),
        ("Saison la plus courte", "", "Rowdy", "")]
sheet(pub, "Prix", ["saison_id", "prix", "categorie", "gagnant", "pilote_id", "recompense", "sponsor_id", "publier"],
      [dict(saison_id="S02", prix=a, categorie=b, gagnant=c, recompense=d, publier="FALSE") for a, b, c, d in prix],
      "Prix de fin de saison.", lists={"publier": BOOL})

pe = src["Public Event"]
events = []
for r in range(6, 13):
    d = pe.cell(r, 2).value
    t = s(pe.cell(r, 3).value)
    if d:
        events.append(dict(evenement_id=f"EV-{d:%Y%m%d}", date=d.strftime("%Y-%m-%d"), heure="", titre=t or "À déterminer",
                           description="", circuit_id="", voitures="", responsable=s(pe.cell(r, 4).value),
                           statut="Terminé" if d.strftime("%Y-%m-%d") < "2026-10-17" else ("Prévu" if t else "Idée"),
                           lien="", image="", publier="TRUE" if t else "FALSE"))
sheet(pub, "Evenements", list(events[0].keys()), events,
      "Événements publics / éditions spéciales hors championnat.",
      lists={"statut": ["Idée", "Prévu", "Terminé", "Annulé"], "publier": BOOL})

sheet(pub, "Reglements", ["section", "ordre", "titre", "texte"], [
    ("1. Comportement en piste", 1, "Prévisibilité", "Les pilotes doivent garder une trajectoire constante. Les changements de direction brusques en zone de freinage sont interdits."),
    ("1. Comportement en piste", 2, "Règle du mouvement unique", "En défense, un seul changement de trajectoire est permis. Le « blocking » réactif est strictement interdit."),
    ("1. Comportement en piste", 3, "Espace de course", "Si un adversaire est à votre hauteur (essieu avant au niveau de votre essieu arrière), laissez-lui au moins la largeur d'une voiture."),
    ("1. Comportement en piste", 4, "Retour en piste", "Après une sortie, attendre un écart suffisant et revenir parallèlement à la piste."),
    ("2. Assiduité", 1, "Participation", "La participation à chaque manche est requise pour l'intégrité du championnat."),
    ("2. Assiduité", 2, "Sanction", "Un pilote qui cumule 3 absences dans la saison peut être expulsé définitivement du championnat."),
    ("2. Assiduité", 3, "Conséquences", "Une expulsion pour absences ne donne droit à aucun remboursement et retire l'admissibilité aux prix de fin de saison."),
    ("3. Éthique et discipline", 1, "Conduite irresponsable", "Toute action irresponsable, dangereuse ou antisportive (en piste ou dans les communications) entraîne une sanction immédiate."),
    ("3. Éthique et discipline", 2, "Tolérance zéro", "Le « revenge ramming » et le harcèlement des membres ou des officiels mènent à une exclusion sans préavis."),
    ("3. Éthique et discipline", 3, "Droit de l'administration", "L'administration peut expulser un pilote si elle le juge nécessaire pour protéger l'image et l'ambiance de la ligue."),
    ("3. Éthique et discipline", 4, "Remboursement et prix", "En cas d'expulsion pour comportement, aucun remboursement et aucune admissibilité aux prix."),
    ("4. Communication et litiges", 1, "Réclamations", "Tout incident se rapporte après la course par le système officiel des commissaires (stewarding). Les plaintes publiques sur les réseaux sociaux sont interdites."),
    ("5. Livrées", 1, "Approbation", "3 demandes d'approbation par saison. Sauf un changement de couleur, chaque modification (design, etc.) doit être approuvée."),
    ("5. Livrées", 2, "Sans approbation", "Pas de qualification, départ en dernière position."),
    ("Acceptation", 1, "", "En participant au championnat, le pilote reconnaît avoir lu, compris et accepté le Code de conduite."),
], "Code de conduite officiel (PDF « CoC GTQC ») + règles de livrée (onglet Code conduite). PDF : documents/code-de-conduite.pdf")

sheet(pub, "Actualites", ["date", "titre", "resume", "contenu", "image", "lien", "publier"], [],
      "Nouvelles / annonces affichées sur l'accueil.", lists={"publier": BOOL})

sheet(pub, "Medias", ["date", "type", "titre", "course_id", "url", "miniature", "publier"], [],
      "Vidéos (replays, streams), galeries photo.", lists={"type": ["Vidéo", "Stream", "Photo", "Galerie"], "publier": BOOL})

g.append(["Onglet", "Contenu"])
for c in g[1]:
    c.fill, c.font = HDR_FILL, HDR_FONT
for name, desc in guide:
    g.append([name, desc])
g.append([])
for line in ["CONVENTIONS",
             "• Ligne 1 = noms de colonnes : ne pas les renommer (le site les lit).",
             "• Les *_id relient les onglets entre eux (ex. Resultats.pilote_id → Pilotes.pilote_id).",
             "• Dates : AAAA-MM-JJ — Heures : HH:MM — Booléens : TRUE / FALSE.",
             "• Images : chemin relatif à assets/img/ du site (ex. sponsors/tag-e.svg). Inventaire : database/inventaire_images.csv",
             "• Ce classeur est PUBLIC (lu par le site). Aucune donnée personnelle ici (courriels, paiements…) → classeur Admin."]:
    g.append([line])
    g.cell(g.max_row, 1).font = NOTE_FONT if line.startswith("•") else Font(bold=True)
g.column_dimensions["A"].width = 22
g.column_dimensions["B"].width = 100
pub.save(OUT_PUB)

# ---------------- PRIVÉ
priv = openpyxl.Workbook(); priv.remove(priv.active)
guide = []
pr = []
for p in sorted(pilots.values(), key=lambda x: x["pseudo"].lower()):
    t, i = tryout.get(p["pilote_id"], {}), inscr.get(p["pilote_id"], {})
    pr.append(dict(pilote_id=p["pilote_id"], nom_complet=p["nom_complet"], courriel=t.get("email") or i.get("email", ""),
                   facebook=t.get("facebook") or i.get("facebook", ""), discord=p.get("discord", ""),
                   consentement_nom_public="", consentement_photo=""))
sheet(priv, "Pilotes_Prive", list(pr[0].keys()), pr, "Coordonnées et consentements — NE PAS PUBLIER.",
      lists={"consentement_nom_public": BOOL, "consentement_photo": BOOL})
ir = []
for pid, t in tryout.items():
    ir.append(dict(saison_id="S02", pilote_id=pid, lobby_tryout=t["lobby"], temps_tryout=t["tryout"],
                   mail_inscription=t["mail_inscription"], paiement_recu=t["paiement"],
                   note=" | ".join(x for x in [t["tryout_note"].strip(), t["note"], t["note_xtra"]] if x)))
sheet(priv, "Inscriptions", list(ir[0].keys()), ir, "Suivi des inscriptions / paiements par saison.")
sheet(priv, "Sponsors_Suivi", ["sponsor_id", "contact", "courriel", "telephone", "entente", "montant", "echeance", "note"],
      [dict(sponsor_id="tag-e", contact="(voir le classeur privé)",
            courriel="", entente="Forfait Platine contre cartes-cadeaux TAG",
            montant=300, note="Intérêt reçu le 6 févr. 2026 (S01 déjà complète). Relance le 9 juil. 2026 pour S02 : cartes-cadeaux, code promo membres, événement spécial karting. Entente annuelle à négocier."),
       dict(sponsor_id="mana", note="GURU vs Mana : choisir un seul (boisson énergisante)"),
       dict(sponsor_id="advanced-sim-racing", note="À pousser"),
       dict(sponsor_id="octoprint", note="Idée : 28 t-shirts à 10 $ (280 $) ; inscription un peu plus chère avec t-shirt inclus"),
       dict(sponsor_id="cardinal", note="Idée forfait : inscription + 1 h de coaching gratuit")],
      "Suivi commercial des commanditaires.")
priv.save(OUT_PRIV)

print(f"Pilotes: {len(pilots)} | Résultats: {len(results)} | Pénalités: {len(pen_rows)} | Engagements: {len(engagements)}")
print("\n".join(report) or "Aucune anomalie")
