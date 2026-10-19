---
target: accueil Courses
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Admin\\Documents\\GitHub\\GTQC\\maquette\\index.html"
target_fingerprint: "sha256:17c404e0b466272be0846496266c7cbfcbbd313f9eeb1d3e1ab264378da6c87e"
target_path: "C:\\Users\\Admin\\Documents\\GitHub\\GTQC\\maquette\\index.html"
timestamp: 2026-10-19T22-45-27Z
slug: maquette-index-html
---
Method: dual-agent (A: design review · B: detector + browser)

# Critique : accueil Courses (maquette/index.html), 2026-10-19

## Score (24/40, Acceptable)
| # | Heuristique | Note | Problème clé |
|---|---|---|---|
| 1 | État du système | 2 | Écran navy vide jusqu'à ~4-5 s (body:not(.pret)); heure/compte à rebours = départ D2 seulement, sans le dire |
| 2 | Langage du monde réel | 3 | Lobby 2 / Division 2 / D2 mélangés |
| 3 | Contrôle | 3 | Molette détournée sur le rail desktop; aucune URL par manche |
| 4 | Cohérence | 2 | Ordre D2/D1 (pied de page) vs D1/D2 (tiroir); sélecteur de saison placé autrement que sur Pilotes |
| 5 | Prévention d'erreurs | 3 | Sélecteur du graphique retire en silence au-delà de 10 |
| 6 | Reconnaissance | 2 | Le pilote doit se rappeler sa division; réglages cachés derrière « Voir la manche » |
| 7 | Efficacité | 2 | Pas de lien direct, pas de « mon pilote » |
| 8 | Esthétique | 3 | Graphique avec grandes bandes vides; division répétée dans le classement; « Maquette » en pied de page |
| 9 | Récupération | 2 | Repli data.js silencieux |
| 10 | Aide | 2 | Notes D1/D2 et réglages cachés sans lien vers Règlements |

## Spécificité
Squelette Red Bull (rail de dates, H1 géant, compte à rebours) habillé d'éléments GTQC réels (tracé, D1/D2, casque, partenaires). Le plus propre à la ligue (deux lobbys le même soir) est absent du hero.
Détecteur : 29 trouvailles CLI, presque toutes faux positifs (logos sans src remplis par JS, contraste calculé sur fond blanc par défaut, side-tab = ligne horizontale). Navigateur : contraste 2,2:1 des mois des manches passées du rail; halo jaune sur les boutons (choix de marque); halo radial sur Événements (thème). Mobile : 17 cibles < 44 px.

## Priorités
- [P1] Heure et compte à rebours = D2 seulement, hero muet sur les lobbys → afficher D2 18 h 45 · D1 19 h 45, ouvertures des lobbys, terme unique, même ordre. (clarify, layout)
- [P1] Compte à rebours dans une zone aria-live="polite" réécrite chaque seconde → déplacer l'annonce. (harden)
- [P2] Réglages cachés derrière un bouton générique → « Voir les réglages » + puce « Réglages disponibles » / « Réglages le 25 oct. ». (clarify)
- [P2] Écran vide au chargement + repli silencieux → coquille immédiate, délai API ~2,5 s, mention hors ligne. (harden, optimize)
- [P2] Graphique des résultats cassé sur mobile (min-width 640px, texte ~5 px, survol seulement, couleur seule). (adapt)

## Personas
Casey (pilote mobile, soir de course) : écran vide, heure fausse pour D1, ouvertures des lobbys tout en bas, réglages à un tap, pas de « ma position ».
Jordan (recrue) : rien n'explique GTQC hors pied de page, aucun appel à Rejoindre/Discord dans la page, jargon D1/D2/MT non expliqué.
Sam (accessibilité) : compte à rebours annoncé en boucle, flèches et dates du rail à faible contraste, pas d'aria-current, tiroir sans piège de focus, graphique en couleur seule.

## Mineurs
D1 + « Division 1 » en double; dégradé « Voir plus » cache à moitié la 8e ligne; « VOITURES Gr.2 » + « Voitures permises » en double; « Maquette, octobre 2026 · Google Sheet… » en pied de page; heures « -19:25 » vs « 18 h 45 »; flèches du rail petites, chevauchent « sept » à 1440×900; logo href="#"; bouton du sélecteur pas en pilule; partenaires sans titre; liens sociaux du pied ~20 px de haut.

## Questions
1. Le hero devrait-il changer selon le moment (semaine de course, soir de course, lendemain)?
2. Le rail Red Bull mérite-t-il 22 % de la largeur? Un calendrier propre à GTQC (deux lobbys par soir)?
3. Quelle phrase et quel bouton feraient sentir une recrue invitée?
