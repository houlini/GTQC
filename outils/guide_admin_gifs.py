"""Génère les GIF de l'onglet Guide de l'admin (un par onglet) dans workers/admin/public/guide/.

L'admin tourne en mode démo local (données de maquette/data.js, rien n'est enregistré).
Un script Playwright fait les manipulations, ajoute une légende et un repère de clic, puis Pillow assemble les GIF.

    python -m pip install playwright pillow
    python -m playwright install chromium
    python outils/guide_admin_gifs.py            # tous les onglets
    python outils/guide_admin_gifs.py grille     # un seul onglet
"""
import io
import socket
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "workers" / "admin" / "public" / "guide"
LARGEUR, HAUTEUR, LARGEUR_GIF = 1280, 720, 1280

# Légende en bas, repère de clic, bannière démo cachée, messages « Mode démo » réécrits comme en ligne
HABILLAGE = """
(() => {
  const css = document.createElement('style');
  css.textContent = `
    #demo { display: none !important; }
    #g-cap { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 99999; max-width: 60%;
      background: rgba(12,14,20,.92); color: #fff; font: 600 21px/1.35 Outfit, system-ui, sans-serif; padding: 12px 22px;
      border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.35); text-align: center; }
    #g-cap:empty { display: none; }
    #g-dot { position: fixed; z-index: 99998; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
      border: 4px solid #ff8a00; background: rgba(255,138,0,.18); pointer-events: none; display: none; }`;
  document.head.append(css);
  const cap = document.createElement('div'); cap.id = 'g-cap';
  const dot = document.createElement('div'); dot.id = 'g-dot';
  document.body.append(cap, dot);
  const toast = document.getElementById('toast');
  new MutationObserver(() => {
    const t = toast.textContent, m = /^Mode démo : « (.+) » non enregistré\\.$/.exec(t), c = /^Mode démo : (\\d+) capture/.exec(t);
    if (m) { toast.textContent = m[1] + ' : enregistré.'; toast.className = 'adm-toast ok'; }
    else if (c) { toast.textContent = c[1] + ' capture(s) ajoutée(s).'; toast.className = 'adm-toast ok'; }
  }).observe(toast, { childList: true, characterData: true, subtree: true });
})();
"""


class Film:
    """Une suite d'images (capture d'écran + durée) pour un onglet."""

    def __init__(self, page):
        self.page, self.images = page, []

    def legende(self, texte):
        self.page.evaluate("t => { document.getElementById('g-cap').textContent = t; }", texte)

    def point(self, loc):
        loc.scroll_into_view_if_needed()
        b = loc.bounding_box()
        self.page.evaluate("([x, y]) => { const d = document.getElementById('g-dot'); d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.display = 'block'; }",
                           [b["x"] + b["width"] / 2, b["y"] + b["height"] / 2])

    def sans_point(self):
        self.page.evaluate("document.getElementById('g-dot').style.display = 'none'")

    def image(self, ms=1500):
        png = self.page.screenshot()
        self.images.append((Image.open(io.BytesIO(png)).convert("RGB"), ms))

    def dire(self, texte, ms=2600):
        self.legende(texte)
        self.image(ms)

    def cliquer(self, sel, texte, apres=1800):
        loc = self.page.locator(sel).first
        self.legende(texte)
        self.point(loc)
        self.image(1700)
        self.sans_point()
        loc.click()
        self.page.wait_for_timeout(450)
        self.image(apres)

    def choisir(self, sel, texte, valeur=None, index=None):
        loc = self.page.locator(sel).first
        self.legende(texte)
        self.point(loc)
        self.image(1300)
        self.sans_point()
        loc.select_option(value=valeur) if valeur is not None else loc.select_option(index=index)
        self.page.wait_for_timeout(350)
        self.image(1900)

    def ecrire(self, sel, valeur, texte):
        loc = self.page.locator(sel).first
        self.legende(texte)
        self.point(loc)
        self.image(1200)
        self.sans_point()
        loc.fill(valeur)
        loc.dispatch_event("change")
        self.page.wait_for_timeout(300)
        self.image(1900)

    def haut(self):
        self.page.evaluate("scrollTo(0, 0)")

    def enregistrer(self, nom):
        SORTIE.mkdir(parents=True, exist_ok=True)
        cadres, durees = [], []
        for img, ms in self.images:
            petite = img.resize((LARGEUR_GIF, round(img.height * LARGEUR_GIF / img.width)), Image.LANCZOS)
            cadres.append(petite.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
            durees.append(ms)
        durees[-1] = max(durees[-1], 3500)  # pause avant de recommencer
        chemin = SORTIE / f"{nom}.gif"
        cadres[0].save(chemin, save_all=True, append_images=cadres[1:], duration=durees, loop=0, optimize=True)
        print(f"{chemin.relative_to(RACINE)} : {len(cadres)} images, {chemin.stat().st_size // 1024} ko")


# ---------- Scénarios, un par onglet ----------

def manches(f):
    f.dire("Manches : le calendrier de la saison, avec le statut et la visibilité des réglages")
    f.cliquer("[data-new]", "« + Nouvelle manche » : tout est repris de la dernière manche, 2 semaines plus tard")
    f.choisir("#fManche select[name=circuit_id]", "Choisis le circuit (le reste est déjà rempli)", index=5)
    f.choisir("#fManche select[name=reglages_visibles]", "Réglages : « Auto » les cache sur le site jusqu'à 7 jours avant la course", valeur="")
    f.ecrire("#fManche input[name=heure_D1]", "21:00", "Lobbys : heure de départ, durée et tours pour chaque lobby")
    f.cliquer("#fManche button[type=submit]", "Enregistrer : la manche apparaît sur le site", apres=2600)
    f.cliquer("[data-cancel]", "Annuler ferme le formulaire sans rien changer")
    f.cliquer("[data-edit]", "« Modifier » sur une ligne pour corriger une manche existante", apres=2600)


def resultats(f):
    texte = f.page.evaluate("""() => {
      const D = window.GTQC, cfg = Object.fromEntries((D.Config || []).map(r => [r.cle, r.valeur])), s = cfg.saison_courante || 'S02';
      const ids = (D.Engagements || []).filter(e => e.saison_id === s && e.role === 'Titulaire' && e.categorie_id === 'D1').map(e => e.pilote_id).slice(0, 7);
      const ps = ids.map(id => (D.Pilotes.find(p => p.pilote_id === id) || {}).pseudo).filter(Boolean);
      return ps.map((p, i) => p + (i === 0 ? ' MT' : i === ps.length - 1 ? ' DNF' : '')).join('\\n');
    }""")
    f.dire("Résultats : choisis la manche et le lobby, puis remplis le classement")
    f.cliquer("#resLobby [data-lobby=D1]", "Un lobby à la fois : chacun garde son brouillon")
    f.legende("Capture du jeu : glisse l'écran des résultats de GT7 ici, il est lu automatiquement")
    f.point(f.page.locator("#dropLu"))
    f.image(3200)
    f.sans_point()
    f.ecrire("#colle", texte, "Ou colle le classement : un pilote par ligne, MT = meilleur tour, DNF / DNS / DSQ")
    f.cliquer("#lireColle", "« Remplir le tableau » : positions et points calculés avec le barème", apres=2800)
    f.cliquer("[data-down='1']", "Corrige l'ordre avec ↑ ↓, retire une ligne avec ✕")
    f.cliquer("#terminer", "Coche « Marquer la manche comme terminée »")
    f.cliquer("#saveRes", "Enregistrer les résultats", apres=2800)
    f.cliquer("#ajPen", "Pénalités : « + Pénalité », puis le pilote, le type et le motif")
    f.choisir("tr[data-p] select[data-k=pilote_id]", "Choisis le pilote pénalisé", index=3)
    f.ecrire("tr[data-p] input[data-k=motif]", "Contact au virage 1", "Motif (affiché sur le site si « Publique » est coché)")
    f.cliquer("#savePen", "Enregistrer les pénalités : les points sont déduits du total", apres=2800)


def grille(f):
    f.dire("Grille : proposition d'après les points des 2 dernières manches, au plus 3 échanges", 3400)
    f.page.locator(".adm-table").first.scroll_into_view_if_needed()
    f.dire("Les lignes surlignées montent (▲) ou descendent (▼). Souvent : aucun changement", 3000)
    f.choisir("[data-g] >> nth=-1", "Tu peux changer n'importe quel lobby avant de publier", valeur="D1")
    f.ecrire("#grilleDe", "5", "Indique la manche à partir de laquelle la grille s'applique")
    f.cliquer("#saveGrille", "« Publier la grille » (confirmation) : le site affiche aussitôt les nouveaux lobbys", apres=2800)
    f.cliquer("#reprop", "« Refaire la proposition » efface tes changements manuels")


def reserves(f):
    f.dire("Réserves : à gauche l'ordre d'appel, à droite les absences de la manche", 3000)
    f.cliquer("[data-absent] >> nth=1", "Coche les titulaires absents")
    f.cliquer("[data-absent] >> nth=4", "Autant d'absents qu'il faut, dans les deux lobbys")
    f.cliquer("#autoRes", "« Assigner les réserves dans l'ordre » : 1 = appelé en premier", apres=2400)
    f.cliquer("#saveAbs", "Enregistrer les absences : les remplaçants seront proposés dans Résultats", apres=2800)
    f.haut()
    f.ecrire("[data-ordre]", "2", "Change l'ordre de priorité, puis « Enregistrer l'ordre »")
    f.choisir("[data-promo]", "« Promouvoir… » : un réserviste devient titulaire ou quitte les réserves", index=0)


def pilotes(f):
    debut = f.page.evaluate("window.GTQC.Pilotes[0].pseudo.slice(0, 3)")
    f.dire("Pilotes : la liste publique (pseudo et PSN seulement, aucun nom réel)")
    f.ecrire("#q", debut, "Recherche par pseudo, PSN ou chaîne Twitch")
    f.cliquer("[data-pedit]", "« Modifier » ouvre la fiche du pilote", apres=2200)
    f.dire("Le PSN aide à reconnaître les captures, la chaîne Twitch l'affiche sur GTQC TV", 3200)
    f.page.locator("#fPilote select[name=role]").scroll_into_view_if_needed()
    f.dire("Rôle dans la saison (titulaire, réserve) et lobby du titulaire", 2600)
    f.cliquer("#fPilote button[type=submit]", "Enregistrer", apres=2800)
    f.ecrire("#q", "", "« + Nouveau pilote » pour en créer un (un pseudo en double est refusé)")


def vods(f):
    f.dire("VOD : les rediffusions de chaque manche (avertissement si une manche terminée n'en a pas)", 3000)
    f.cliquer("#ajVod", "« + Lien » ajoute une rediffusion")
    f.choisir("tr[data-v] >> nth=-1 >> select[data-k=categorie_id]", "Lobby 1, Lobby 2 ou les deux", valeur="D1")
    f.ecrire("tr[data-v] >> nth=-1 >> input[data-k=titre]", "Diffusion avec commentateur", "Un titre court")
    f.ecrire("tr[data-v] >> nth=-1 >> input[data-k=url]", "https://www.youtube.com/watch?v=exemple", "L'adresse YouTube ou Twitch (https://…)")
    f.cliquer("#saveVod", "Enregistrer : la vidéo apparaît dans la fiche de la manche", apres=2800)


def photos(f):
    f.dire("Captures : les images de la manche affichées sur le site (jeu ou diffusion)", 2800)
    f.choisir("#phLobby", "Choisis le lobby…", valeur="D1")
    f.choisir("#phSource", "… et la source", valeur="Jeu")
    f.legende("Glisse les images (ou clique) : réduites à 1920 px et rangées dans Drive")
    f.point(f.page.locator("#drop"))
    f.image(2400)
    f.sans_point()
    f.page.set_input_files("#phFichiers", str(RACINE / "assets/img/manches/s02-r01.jpg"))
    f.page.wait_for_timeout(1500)
    f.image(2000)
    f.ecrire("figure.ph >> nth=-1 >> input[data-k=legende]", "Départ du Lobby 1", "Légende facultative ; ← → pour l'ordre, « Visible » pour l'afficher")
    f.cliquer("#savePh", "Enregistrer légendes et ordre (une capture retirée va à la corbeille Drive)", apres=2800)


def inscriptions(f):
    # Demande fictive : le mode démo n'a pas l'onglet privé _Inscriptions
    f.page.evaluate("""() => { window.GTQC._Inscriptions.push({ id: 1, type: 'ligue', pseudo_discord: 'PiloteExemple', recu_le: '2026-10-18 20:14',
      courriel: 'exemple@exemple.com', psn: 'Pilote_Exemple', region: 'Québec', controle: 'Volant', driver_rating: 'B',
      disponibilites: 'Mardi soir', message: "Salut ! J'aimerais rejoindre la ligue.", statut: 'Nouvelle' });
      document.querySelector('[data-tab=inscriptions]').click(); }""")
    f.dire("Inscriptions (privé) : les demandes du formulaire « Rejoindre », avec les infos du pilote", 3200)
    f.choisir("[data-istatut]", "Fais avancer le statut : Contactée, Acceptée, Réserve, Refusée…", valeur="Contactée")
    f.ecrire("[data-inote]", "Écrit sur Discord le 19/10", "Une note interne, jamais publiée")
    f.cliquer("[data-isave]", "Enregistrer", apres=2400)
    f.cliquer("[data-icreer=reserve]", "« Créer comme réserve » ou « comme titulaire » : seul le pseudo passe dans la fiche publique", apres=3000)


def journal(f):
    f.page.evaluate("""() => { window.GTQC._Journal.push(
      { date: '2026-10-19 21:42', courriel: 'admin@exemple.com', action: 'resultats', details: 'S02-M05 D1 · 12 lignes' },
      { date: '2026-10-19 21:47', courriel: 'admin@exemple.com', action: 'penalites', details: 'S02-M05 · 1 ligne' },
      { date: '2026-10-19 22:03', courriel: 'admin@exemple.com', action: 'grille', details: 'Dès M6 · 2 changements' });
      document.querySelector('[data-tab=journal]').click(); }""")
    f.dire("Journal : chaque enregistrement, avec la date, l'admin et le détail", 3600)
    f.dire("Lecture seule : pratique pour savoir qui a changé quoi", 3000)


SCENARIOS = {"manches": manches, "resultats": resultats, "grille": grille, "reserves": reserves, "pilotes": pilotes,
             "vods": vods, "photos": photos, "inscriptions": inscriptions, "journal": journal}


def port_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    choix = sys.argv[1:] or list(SCENARIOS)
    port = port_libre()
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(RACINE)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1)
        with sync_playwright() as pw:
            nav = pw.chromium.launch()
            for nom in choix:
                page = nav.new_page(viewport={"width": LARGEUR, "height": HAUTEUR}, device_scale_factor=1, locale="fr-CA")
                page.on("dialog", lambda d: d.accept())
                page.goto(f"http://127.0.0.1:{port}/workers/admin/public/index.html#{nom}")
                page.wait_for_selector(".adm-head")
                page.evaluate(HABILLAGE)
                page.wait_for_timeout(400)
                film = Film(page)
                SCENARIOS[nom](film)
                film.legende("")
                film.enregistrer(nom)
                page.close()
            nav.close()
    finally:
        serveur.terminate()


if __name__ == "__main__":
    main()
