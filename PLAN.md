# GTQC – Plan du site web

Gran Turismo Québec (GTQC) est une ligue de course Gran Turismo 7 sur console. Elle a 2 divisions (**Division 1** et
**Division 2**, une par lobby), 1 course par semaine le dimanche, 2 championnats par année, des éditions spéciales,
une Team et des commanditaires.

Le style s'inspire de la page Courses de Red Bull Racing (https://www.redbullracing.com/int-en/races).

- **Base de données** : Google Sheet [GTQC_Base_Donnees](https://docs.google.com/spreadsheets/d/1LqsTQ97T14vUCWpr3Bj6HyFB5K2nuciy7moEFfzaQEk/edit)
  (dossier partagé GTQC). C'est **la référence** : on modifie les données là, pas dans les fichiers Excel du dépôt.
- **Questions au gestionnaire** : [Questions site GTQC](https://claude.ai/artifact/BRTTXaj54fF6Gg5aRNb1ja) (2 séries répondues le 17 oct. 2026, voir section 5).

---

## 1. Ce qu'on reprend de la page Red Bull Racing

| Élément Red Bull | Version GTQC |
|---|---|
| Fond bleu marine foncé, texte blanc, accent rouge, gros titres serrés | Mêmes codes avec les couleurs GTQC : fond marine `#0A1330`, bleu du logo `#0048FF`, **accent jaune fluo `#E6FF00`** à la place du rouge |
| **Rail vertical de dates** à gauche (jour + mois + drapeau) | Les 10 manches de la saison : date, drapeau du pays du circuit, n° de manche |
| **Hero de l'événement en vedette** (grande photo, nom du GP, circuit, dates, bouton « View Event Info ») | Prochaine manche : vignette officielle, circuit + tracé, date/heure, compte à rebours, bouton « Voir la manche » |
| **Classement** avec bascule *Driver / Team* + « Load more » | **Classement général** unique (les points D1 et D2 s'additionnent), avec un repère D1 / D2 qui montre le lobby actuel de chaque pilote |
| **Graphique Race Results** (position par course, choix des pilotes) | Graphique position/points par manche avec sélecteur de pilotes |
| **Bandeau des partenaires** en bas de page | Logos des commanditaires (onglet `Sponsors`, `afficher = TRUE`) |

## 2. Pages

1. **Accueil** : hero de la prochaine course + compte à rebours, derniers résultats, top 5 du classement général, nouvelles, sponsors.
2. **Courses** (la page « races ») : rail du calendrier, manche en vedette, classement général, graphique de résultats.
3. **Fiche d'une manche** (`/courses/s02-r05`) : circuit et tracé, voitures, nombre de tours par division, météo,
   carburant, pneus, arrêt obligatoire (tout est public, tryouts compris), résultats D1 et D2, pénalités, rediffusion Twitch.
4. **Classements** : un seul classement général, détail manche par manche, lobby de chaque pilote (il change aux
   2 manches selon ce classement), pénalités comptées dans la manche où elles ont eu lieu.
5. **Pilotes** : grille de cartes avec **avatar ou logo** et **pseudo Discord** (jamais le nom réel), numéro de course
   → fiche pilote (stats, résultats, historique des saisons).
6. **La Team** : présentation, membres et rôles.
7. **Événements spéciaux** : événements publics, le même soir que la manche (avant ou après). Pas de points.
8. **Partenaires** : logos, description et contribution des commanditaires actuels. Pas de page « Devenir partenaire ».
9. **Rejoindre / Règlements** : processus d'inscription, code de conduite officiel, règles de livrée.
10. **Archives** : saisons précédentes, avec le classement final S1 (à recevoir) et les équipes S1.
    Les commanditaires S1 ne sont **pas** affichés.

Site en **français seulement**, à l'adresse GitHub Pages gratuite. Liens : Facebook, Instagram, Twitch ; contact gtqc.club@gmail.com.

## 3. Architecture technique (retenue le 18 oct. 2026, même recette que LNHQ)

- **Données** : le Google Sheet reste **privé**. La seule porte d'entrée est l'Apps Script `apps-script/gtqc.gs`
  (exécuté avec le compte propriétaire). Il publie les onglets publics, **sans les réglages des prochaines manches**
  (dévoilés `Config.reglages_jours_avant` jours avant, ou selon `Manches.reglages_visibles`). Les onglets `_…`
  (`_Inscriptions`, `_Admins`, `_Journal`) ne sont jamais publiés.
- **API publique** : Worker Cloudflare `workers/api` (`api.<domaine>`) : `/donnees`, `/twitch` (GTQC TV) et
  `/inscription` (formulaire Rejoindre). Les clés Twitch et le code du script restent côté serveur.
- **Admin** : Worker `workers/admin` (`admin.<domaine>`), derrière **Cloudflare Access** (code par courriel). Seuls les
  courriels de `_Admins` peuvent écrire. Il gère les manches, les résultats (collés ou en fichier, points calculés avec
  le barème), les pénalités, la grille des lobbys aux 2 manches, les réserves et absences, les pilotes (Twitch compris),
  les VOD, les captures des manches et les inscriptions.
- **Captures des manches** (jeu ou diffusion) : envoyées depuis l'admin (réduites à 1920 px), rangées dans le dossier
  Drive « GTQC — Captures des manches » (lisible par lien) et listées dans l'onglet `Photos`. Le site les montre dans la
  fiche de la manche, avec une visionneuse.
- **Site** : statique (GitHub Pages). `maquette/chargeur.js` lit l'API, ou `data.js` (export de secours) tant que
  l'API n'est pas en ligne.
- **Classements calculés par le site** à partir de `Resultats` + `Penalites`, pour éviter les erreurs de formules à la main.
- **Domaine** : pas encore décidé. Mise en ligne détaillée dans le [README](README.md#mise-en-ligne).

### Saisie des résultats par capture d'écran (demandé par le gestionnaire)

Le gestionnaire veut téléverser une capture d'écran des résultats au lieu de taper les positions. Proposition :

1. Une page admin protégée (Google Apps Script, gratuit, liée au compte gtqc.club@gmail.com, accès limité aux admins).
2. On téléverse la capture des résultats de GT7, choisit la manche et la division.
3. La capture est lue automatiquement avec l'OCR **gratuit de Google Drive** (l'Apps Script convertit l'image en texte)
   et donne un tableau position → pseudo PSN → temps / meilleur tour.
4. L'admin vérifie et corrige le tableau, puis clique « Enregistrer » : les lignes vont dans l'onglet `Resultats`.

À savoir : l'écran de résultats de GT7 affiche les **identifiants PSN**. Il faut donc une table PSN → pilote, qui reste
dans le classeur **privé** (le PSN n'est plus dans le Sheet public). Le gestionnaire veut une solution **gratuite** :
l'OCR de Google Drive l'est. Si sa lecture est trop imprécise, l'autre option gratuite est Tesseract.js dans le navigateur.
La saisie est faite par un **admin**.

### Images (dans le dépôt GitHub)

```
assets/img/
  logo/        gtqc-logo.png (officiel, fond transparent), version néon, ancien logo GT7QC (S01), logo GD
  saisons/     affiche Saison 2, affiches tryouts, Mustang Gr.3 (S01)
  manches/     s02-r01.jpg … s02-r10.jpg  (vignettes officielles de chaque manche)
  circuits/    logo Sardegna (les tracés sont des liens dans Circuits_GT7)
  sponsors/    <sponsor_id>.svg|png  + variantes (-blanc, -fond-noir, -icone…)
  livrees/     livrées et photos de course de la Saison 1
  equipes/     logos des équipes de la Saison 1
  documents/   code-de-conduite.pdf
  pilotes/     (à venir) avatars <pilote_id>.png
```

Dans le Sheet, une image = son chemin à partir de `assets/img/` (ex. `sponsors/tag-e.svg`).

- Le dossier `Photos/` reçu a été classé par [outils/classer_photos.py](outils/classer_photos.py) ;
  [database/inventaire_images.csv](database/inventaire_images.csv) explique chaque fichier.
- Exclus de Git (`.gitignore`) : `Photos/` (courriels et téléphones privés), `_prive/`, et l'ancien export
  `database/GTQC_Base_Donnees.xlsx` (il contient les noms réels).
- **À recevoir** : avatars des pilotes, logo de la Team, logo d'EuroKart,
  liste des numéros de course, classement final S1. Pas de logo vectoriel : on utilise le PNG.

## 4. Base de données

- **Public** : le Google Sheet (lien en haut). Aucune donnée personnelle : pas de nom réel, de courriel, de PSN ni de Gridfinder.
- **Privé** : [_prive/GTQC_Admin_Prive.xlsx](_prive/GTQC_Admin_Prive.xlsx) (noms réels, courriels, PSN, Gridfinder,
  inscriptions, paiements, suivi des sponsors). À garder hors du Sheet public ; si on le met sur Drive, le partager
  seulement avec les admins et ne jamais le publier.

| Onglet | Rôle | Clé |
|---|---|---|
| `_LISEZMOI` | Guide et conventions | — |
| `Config` | Paramètres : liens, couleurs, logo, classement général, langue… | `cle` |
| `Saisons` | Championnats et éditions spéciales (sans points) | `saison_id` (S01, S02…) |
| `Categories` | Division 1 (Lobby 1) et Division 2 (Lobby 2) | `categorie_id` (D1, D2) |
| `Bareme_Points` | Points par position et par division | — |
| `Pilotes` | Profil public : pseudo, numéro, contrôle, rating, avatar | `pilote_id` |
| `Engagements` | Pilote × saison : division, titulaire/réserve, n°, temps de tryout | — |
| `Lobbys` | Répartition des pilotes dans les lobbys ; elle change aux 2 manches selon le classement général | — |
| `Circuits` | Circuits utilisés ou prévus ; longueur, virages et tracé viennent de `Circuits_GT7` par formule | `circuit_id` |
| `Circuits_GT7` | Les 122 tracés de GT7 (41 lieux, 36 Reverse) : longueur, dénivelé, virages, ligne droite, logo du lieu, image du tracé | `layout_id` |
| `Manches` | Calendrier : date, circuit, groupe, météo, carburant, pneus, pit | `course_id` (S02-R05) |
| `Manches_Categories` | Ce qui change selon la division (nb de tours, météo, heure, stream) | — |
| `Resultats` | Position, points, meilleur tour, statut, par pilote et par manche | — |
| `Penalites` | Décisions des stewards (avertissement, temps, points) | — |
| `Voitures` | Voitures permises par groupe et par saison | — |
| `Equipe` / `Equipe_Membres` | La Team et les équipes S1, avec leurs membres | `equipe_id` |
| `Organisation` | Staff (hosts, stewards, comms, stream…) | — |
| `Sponsors` | Commanditaires S01 à S03, statut, logos, afficher oui/non | `sponsor_id` |
| `Forfaits_Commandite` | Forfaits Platine à Citoyen (interne, `publier = FALSE`) | — |
| `Prix` | Prix de fin de saison | — |
| `Evenements` | Événements publics / spéciaux | `evenement_id` |
| `Reglements` | Code de conduite officiel complet | — |
| `Actualites`, `Medias` | Nouvelles, vidéos et photos (vides pour l'instant) | — |

Sources de `Circuits_GT7` : [liste officielle GT7](https://www.gran-turismo.com/us/gt7/tracklist/) (données, logos)
et [Gran Turismo Wiki](https://gran-turismo.fandom.com/wiki/Gran_Turismo_7/Track_List) (images des tracés) ;
script [outils/circuits_gt7.py](outils/circuits_gt7.py). Un tracé Reverse utilise la même image que le sens normal.

Les scripts [outils/import_ancien_sheet.py](outils/import_ancien_sheet.py) et `circuits_gt7.py` ont servi au premier
import seulement ; les relancer ne met pas le Google Sheet à jour.

## 5. Réponses du gestionnaire (17 oct. 2026) appliquées au Sheet

| Sujet | Décision | Changement |
|---|---|---|
| Divisions | **Division 1 / Division 2** partout (corrigé en 2e série ; d'abord « Pro / Am ») | `Categories` |
| Classement | **Un classement général** ; les lobbys changent aux 2 manches selon ce classement (corrigé en 2e série) | `Config.classement = general` |
| Pénalités en points | Comptent dans la manche où elles ont eu lieu | `Config.penalite_points` |
| Éditions spéciales | Pas de points | `Config.points_editions_speciales = FALSE` |
| Heures de départ | À déterminer | `Config.heure_course` vide |
| Réglages de course | Tout public, tryouts compris | `Manches` S02-R00 publié |
| Saison 2 | 10 courses | — |
| Pilotes | Pseudo seulement, pas de mineurs, avatars, numéros à venir | Noms réels, PSN et Gridfinder retirés du Sheet public (gardés dans le classeur privé) ; colonne `avatar` |
| Pseudo affiché | **Discord pour tout le monde** (corrigé en 2e série), même les 4 qui contiennent un nom de famille | `Pilotes.pseudo` |
| Team | « GTQC Team » pour l'instant ; « G » = GD (G88D) | `Equipe`, `Equipe_Membres` |
| Cardinal | Une entreprise | `Sponsors` |
| Équipes S1 | Dans les archives | `Equipe.publier = TRUE` |
| Sponsors S1 | Pas dans les archives ; seul EuroKart était un vrai commanditaire | RustyPod et GoPlex retirés ; EuroKart = commanditaire S1 |
| Chez Miller | Pas encore confirmé | inchangé (non affiché) |
| Vacecraft | Bon nom : Vacecraft, comme sur le logo (corrigé après « Vicecraft ») | `Sponsors`, `Reglements`, `Pilotes` |
| Forfaits | Pas de page « Devenir partenaire » | `Forfaits_Commandite.publier = FALSE` |
| Smiley jaune | Mascotte Dubby | image `sponsors/dubby-smiley.svg` |
| Logo « X » vert | Pas Exscellant, à ignorer | retiré de `assets/img` |
| enfant_batue | Pénalité de **-9** (pas -9,5) | `Penalites` ; son total passe de -2,5 à -2 |
| Le_Grand_jo, Daytona | À vérifier | inchangé |
| Genesis X | Genesis X Gran Berlinetta VGT Gr.3 | `Voitures` |
| Autumn Ring | Arrive dans une mise à jour de GT7 | note dans `Circuits` |
| Deep Forest (S3) | Reverse | `Circuits` |
| Tokyo Expressway (S3) | Central, sens horaire | `Circuits` |
| Site | GitHub Pages gratuit, français, Facebook + Instagram + Twitch, gtqc.club@gmail.com | `Config` |
| Mise à jour du Sheet | Un admin téléverse une capture d'écran ; lecture automatique gratuite seulement | voir section 3 |
| Horaire | D2 : lobby 18 h, qualif 18 h 30, course 18 h 45. D1 : lobby 19 h, qualif 19 h 30, course 19 h 45 | onglet `Horaire`, `Manches_Categories.heure_depart` |
| Le_Grand_jo, Daytona | 1 point valide : il y avait plus de pilotes, la 15e place valait 1 point | `Resultats` |
| enfant_batue | Pénalité de **-9,5** (corrigé) | `Penalites` |
| Numéros de course | Optionnels | — |
| Avatars | Plus tard, après avoir demandé une capture à chaque pilote | — |

### Saison 1 (archives)

- Calendrier repris de [Gridfinder](https://www.gridfinder.com/c/gtqc/gtqc-s01?tabName=Event-Schedule) : 9 manches
  comptées du 1er mars au 28 juin 2026, plus une course ouverte au public au Nordschleife (3 mai, sans points).
- Points par manche et classement final repris des captures du gestionnaire (`Resultats`, `Classement_Final`).
  Les résultats ne sont pas visibles sur Gridfinder sans connexion, donc le classement officiel est gardé **tel qu'annoncé**.
- Le total officiel des pilotes n'inclut pas la manche 10 (Autriche), alors que celui des équipes l'inclut.
  Le site affiche les totaux officiels de `Classement_Final` pour la S1, sans les recalculer.
- Tous les pilotes S1 sont affichés sous leur pseudo Discord, y compris les 7 qui n'ont couru qu'en S1.
- 8 équipes S1 avec leurs pilotes : Cobra Kai (championne), Team Rocket, Reserve Drivers (non éligible), Euro Racing Team,
  Gentleman Driver Club, TRX - Track Racing Xperience, Apex Racing Team, Turbo Têtards Racing Team.

## 6. Ce qu'on attend encore

- Logo d'EuroKart, et plus tard de la Team (logos Vacecraft et Cardinal Club reçus) ; logos des équipes S1 manquantes
  (Team Rocket, Reserve Drivers, Euro Racing Team, Apex Racing Team).
- Avatars des pilotes (plus tard).
- Domaine du site (puis mise en ligne de l'API et de l'admin) ; chaînes Twitch des pilotes (`Pilotes.twitch`).
- Lecture des captures de résultats GT7 : faite (admin → Résultats → « Lire une capture du jeu », Gemini gratuit comme
  LNHQ, clé `GEMINI_KEY`). Les identifiants PSN lus sont associés aux pilotes dans l'onglet privé `_PSN`, appris au fil
  des saisies. À tester sur de vraies captures une fois l'admin en ligne ; ensuite, saisir les anciennes manches.
- Les courses de la ligue sont diffusées sur une autre chaîne : `Config.twitch_url` n'est plus affiché sur le site.
- Réglé (S1) : le tableau « ENTRER POINTS ICI » contient les points marqués par les remplaçants. Ces points comptent
  pour l'équipe, mais pas pour le pilote remplacé. Les points par pilote du classement officiel sont donc les bons
  (inchangés dans `Resultats`), et le total des équipes inclut les remplaçants (noté dans `Classement_Final` et `Saisons`).
- Réglé (S1) : les 7 pilotes S1 sont affichés sous leur pseudo Discord (SPORTEC_Snake, pedlersmith, Dave, Driver-_-225,
  Etoccire1975, TRX_Sleded77, svtcobra) ; leurs noms réels sont dans le classeur privé.
- Réglé (S1) : Go Plex n'est pas remis dans les commanditaires.
- Réglé : Lake Louise = Long Track ; « Misha S13 » = S-TH1RT3EN ; l'affiche avec le casque n'est plus attribuée à une équipe.
  Détails S1 ajoutés : départ 19 h, nombre de tours, conditions, Subaru Impreza Gr.B pour le rallye de nuit à Lake Louise.
- Le pilote « Vacecraft » n'a pas de pseudo Discord connu : le site affiche « Vacecraft » pour l'instant.

### Vérification du 18 oct. 2026

- **Dates S02 corrigées** d'après [Gridfinder](https://www.gridfinder.com/c/gtqc/gtqc-saison-2) (la capture d'origine était un
  ancien brouillon) : M2 13 sept, M3 27 sept, M5 **18 oct**, M6 1er nov, M8 29 nov. Les autres dates étaient bonnes.
  Dates S01 vérifiées : identiques à Gridfinder.
- **Points** : les totaux S02 de la base égalent le Standing officiel pour les 32 pilotes. Les erreurs venaient du graphique
  (égalités mal gérées ; en S1, manche 10, host et réserves comptés). Corrigé : rangs « denses » comme la ligue (8, 8, 9),
  colonne `Manches.points_pilotes` (FALSE pour S01-M6 et S01-M10), manches terminées = manches avec résultats saisis.
- **Règlements S02** (fichier `reglements gtqc.txt`) intégrés dans l'onglet `Reglements` (38 règles en 7 sections), sans les
  identifiants Discord ni les PSN des admins. Le fichier brut est exclu de Git. Zones de montée/descente ajoutées à `Bareme_Points`.
- **À confirmer** :
  - Maggiore (M5) : Gridfinder dit « Center Reverse », le Sheet d'origine dit « Full Reverse ».
  - Sainte-Croix (M7) : Gridfinder indique 9 h au lieu de 18 h.
  - Les événements publics (20 sept, 4 oct, 25 oct, 8 nov, 22 nov) tombent en fait les dimanches **sans** course.
  - Réglé : le commanditaire s'écrit « Vacecraft », comme sur son logo.