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
| `apps-script/` | `gtqc.gs` : seule porte d'entrée vers le Sheet privé (données publiques, admin, formulaire) |
| `workers/api/` | Worker Cloudflare de l'API publique : `/donnees`, `/twitch` (GTQC TV), `/inscription` |
| `workers/admin/` | Worker de l'admin (derrière Cloudflare Access) et son interface (`public/`) |

Ne jamais ajouter au dépôt les données personnelles des pilotes (noms réels, courriels, PSN) :
elles restent dans le classeur privé (`_prive/`, exclu de Git) ou dans les onglets `_…` du Sheet, jamais publiés.

## Tester en local

```bash
python -m http.server 8765
```

- Site : http://localhost:8765/maquette/ (sans API, il lit `maquette/data.js`)
- Admin en **mode démo** : http://localhost:8765/workers/admin/public/ (données du dépôt, rien n'est enregistré)

Après un export du Sheet : `python outils/exporter_donnees.py <export.xlsx>`. Le script retire les réglages des
prochaines manches de `data.js` (même règle que l'API).

## Mise en ligne

Domaine : **gtqc.net** (zone Cloudflare). À faire une fois :

1. **Apps Script** : sur script.google.com, crée le projet « GTQC » avec le compte propriétaire du Sheet. Colle
   `apps-script/gtqc.gs` et `appsscript.json` (ou remplis `SCRIPT_ID` dans `apps-script/deployer.ps1` et lance-le).
   Exécute `creerSecret` une fois, puis *Déployer → Nouveau déploiement → Application web* (exécuter en tant que
   moi, accès : tout le monde). Copie l'adresse `/exec` et la propriété `SECRET`.
   Facultatif : propriété `NOTIF_COURRIEL` = adresse avertie à chaque inscription. Le script demande l'accès au Sheet
   et à Drive (dossier « GTQC — Captures des manches », créé au premier envoi de capture).
2. **Twitch** : dev.twitch.tv → Console → Applications (l'appli de LNHQ peut servir) : Client ID et secret.
3. **Worker API** (`workers/api`) : (route `api.gtqc.net` déjà dans `wrangler.toml`) :
   `npx wrangler secret put SCRIPT_URL`, `SCRIPT_SECRET`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, et `npx wrangler deploy`.
4. **Cloudflare Access** : Zero Trust → Access → Applications → *Self-hosted* sur `admin.gtqc.net`, politique
   « courriels » avec les admins. Copie le domaine d'équipe et l'AUD dans `workers/admin/wrangler.toml`.
5. **Worker admin** (`workers/admin`) : `npx wrangler secret put SCRIPT_URL` et `SCRIPT_SECRET`, puis `npx wrangler deploy`.
   Pour lire les captures de résultats GT7 : `npx wrangler secret put GEMINI_KEY` (clé gratuite sur aistudio.google.com).
6. **Site** : Worker « gtqc » relié au dépôt GitHub (Workers Builds) : chaque Push le redéploie avec `wrangler.jsonc`.
   `site/worker.js` sert `maquette/` à la racine (gtqc.net/pilotes.html) et `assets/`, rien d'autre du dépôt.
   L'API `https://api.gtqc.net` est déjà dans `maquette/chargeur.js` et `Config.api_url` ; tant qu'elle
   ne répond pas, le site lit `data.js`. Les admins sont listés dans l'onglet `_Admins` (colonne `actif`).
