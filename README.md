# GTQC – site web de Gran Turismo Québec

Site de la ligue de sim racing Gran Turismo 7 **GTQC** : calendrier, classement, pilotes, Team et partenaires.

- **Données** : Google Sheet `GTQC_Base_Donnees` (dossier partagé GTQC). C'est la référence ; le site lit ses données.
- **Plan du site, décisions et questions** : [PLAN.md](PLAN.md)
- **Maquette de la page Courses** : [maquette/](maquette/) (ouvrir `maquette/index.html` avec un petit serveur local)

## Dossiers

| Dossier | Contenu |
|---|---|
| `assets/img/` | Images du site : logo, vignettes et photos des manches, tracés des circuits, sponsors, équipes |
| `database/` | Références : 122 tracés GT7 (`circuits_gt7.csv`), inventaire des images |
| `maquette/` | Maquette HTML de la page Courses (style Red Bull Racing) |
| `outils/` | Scripts Python : import, classement des photos, tracés, export des données |

Ne jamais ajouter au dépôt les données personnelles des pilotes (noms réels, courriels, PSN) :
elles restent dans le classeur privé (`_prive/`, exclu de Git).
