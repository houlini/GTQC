# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Principal : les pilotes de la ligue.** Ils viennent avant une soirée de course pour le calendrier, les
  réglages de la prochaine manche, leur lobby (D1 / D2) et leur classement, puis après pour les résultats.
  Beaucoup consultent sur téléphone.
- **Aussi :** recrues potentielles (joueurs GT7 qui découvrent la ligue et veulent la rejoindre), spectateurs
  (communauté qui suit les courses sur GTQC TV) et sponsors.
- **Admins** (liste dans l'onglet `_Admins`) : saisissent les résultats, créent les manches, génèrent la grille,
  gèrent réserves, VOD et inscriptions dans admin.gtqc.net.

## Product Purpose

gtqc.net est le site de GTQC (Gran Turismo Québec), ligue de sim racing Gran Turismo 7 sur PlayStation. Il
centralise l'information de la ligue que les pilotes allaient autrement chercher sur Discord.

Le site réussit quand :
- un pilote trouve vite les infos de sa course (réglages, lobby, horaire) sans demander à personne ;
- les admins publient résultats et grilles rapidement (lecture des captures GT7, grille proposée automatiquement).

## Positioning

- Ligue québécoise, entièrement en français.
- Deux divisions, avec une révision des lobbys toutes les 2 manches, uniquement selon les points (au plus 3
  échanges, souvent aucun).
- Organisation sérieuse (règlements, pénalités, réglages imposés, résultats tenus à jour) dans une ambiance
  conviviale (pilotes réguliers, réserves, événements spéciaux ouverts au public).

## Operating Context

- Données : Google Sheet privé `GTQC_Base_Donnees`, publié par Apps Script puis l'API `api.gtqc.net`. Les
  onglets `_…` ne sont jamais publiés.
- Soirées de course : 2 lobbys (D1, D2). GTQC TV affiche les streams Twitch des pilotes pendant les courses
  (bandeau « en direct » sur tout le site).
- Les réglages d'une manche restent cachés jusqu'à 7 jours avant (`Config.reglages_jours_avant`) ou selon
  `Manches.reglages_visibles`.
- Résultats saisis dans l'admin à partir des captures d'écran GT7 (lecture Gemini) ; les noms à l'écran sont des
  surnoms GT7, reliés aux pilotes par l'onglet privé `_PSN`.
- Événements spéciaux : le dimanche, sans points.

## Capabilities and Constraints

- Pages publiques : Courses (accueil), Pilotes, Événements, Règlements, GTQC TV, Rejoindre (formulaire unique :
  ligue, réserve ou question).
- Admin derrière Cloudflare Access : Manches, Résultats, Grille, Réserves, Pilotes, VOD, Captures, Inscriptions,
  Journal.
- Site statique (`maquette/`) servi par le Worker `gtqc` ; repli sur `maquette/data.js` si l'API ne répond pas.
- Pilotes affichés par pseudo Discord seulement. Le PSN peut être public (depuis le 18 oct. 2026). Noms réels,
  courriels et Gridfinder restent privés, jamais dans le dépôt ni dans les données publiques.
- Pas de page Team pour l'instant.
- Non décidé : avatars personnels et numéros des pilotes (à venir), sponsors à afficher.

## Brand Commitments

- Nom : **GTQC** (Gran Turismo Québec). Langue : français québécois.
- Logo : `assets/img/logo/` (dont `gtqc-logo-fonce.png`, version sans fond blanc).
- Casque GTQC × Vacecraft comme avatar par défaut : `assets/img/casques/casque-avatar.jpg`.

## Evidence on Hand

- Calendrier, résultats, classements et pénalités réels dans le Sheet (Saison 1 en archives, Saison 2 en cours).
- Photos de livrées Gr.3 / Gr.4 : `assets/img/livrees/`.
- Affiches et photos d'événements : `assets/img/evenements/` (Hypercar S01, Go-kart S02, stand Porsche).
- Tracés de 122 circuits GT7 : `database/circuits_gt7.csv`.
- Aucun témoignage, chiffre d'audience ni sponsor confirmé à afficher : ne pas en inventer.

## Product Principles

1. L'info de la prochaine course d'abord : réglages, lobby et horaire en un coup d'œil, surtout sur téléphone.
2. Le Sheet est la seule source de vérité ; le site ne fait que l'afficher.
3. Chaque tâche admin doit prendre moins d'effort que de la faire à la main dans le Sheet.
4. Sérieux comme une vraie série, accueillant comme une ligue entre amis.
5. Vie privée : pseudos seulement, rien de personnel en public.
