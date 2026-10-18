/* =========================================================================
   GTQC — application web Apps Script liée au classeur GTQC_Base_Donnees (privé).
   Seule porte d'entrée vers le classeur : les Workers Cloudflare l'appellent avec le
   code SECRET (propriété du script), jamais le navigateur directement.

   Actions publiques (Worker gtqc-api) :
     donnees   → tous les onglets publics, réglages des prochaines manches retirés
     inscrire  → formulaire « Rejoindre » (onglet privé _Inscriptions)
   Actions admin (Worker gtqc-admin, derrière Cloudflare Access ; courriel dans _Admins) :
     etat, manche, resultats, penalites, vods, photo, photos, psn, pilote, engagement, grille,
     remplacements, inscription

   Onglets dont le nom commence par « _ » : jamais publiés.
   Propriétés du script (Paramètres du projet → Propriétés du script) :
     SECRET            code partagé avec les Workers (obligatoire)
     NOTIF_COURRIEL    adresse avertie à chaque inscription (facultatif)
     DOSSIER_PHOTOS    dossier Drive des captures des manches (créé au premier envoi)
   ========================================================================= */

const SHEET_ID = '1LqsTQ97T14vUCWpr3Bj6HyFB5K2nuciy7moEFfzaQEk';
const FUSEAU = 'America/Toronto';
const ONGLETS_INTERNES = ['Forfaits_Commandite', 'Lobbys'];
// Réglages gardés secrets jusqu'à quelques jours avant la course (même liste que outils/exporter_donnees.py)
const REGLAGES = ['heure_du_jour', 'vitesse_temps', 'conditions', 'arret_pit_min', 'conso_carburant', 'usure_pneus',
  'carburant_initial_l', 'ravitaillement', 'temps_pit_s'];
const CHAMPS_PILOTE = ['pseudo', 'numero', 'region', 'controle', 'driver_rating', 'equipe_id', 'avatar', 'bio', 'actif', 'twitch', 'psn'];
const STATUTS_INSCRIPTION = ['Nouvelle', 'Contactée', 'Acceptée', 'Réserve', 'Refusée', 'Archivée'];
const CLE_CACHE = 'donnees-v2';

function doGet(e) { return repondre(router(e, {})); }
function doPost(e) {
  let corps = {};
  try { corps = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return repondre({ ok: false, erreur: 'json' }); }
  return repondre(router(e, corps));
}

function router(e, corps) {
  const p = e.parameter || {};
  // Propriété SECRET si elle existe, sinon le code envoyé par deployer.ps1 (Secret.js, généré depuis _prive/, jamais dans Git)
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET') || (typeof SECRET_DEPLOYE !== 'undefined' ? SECRET_DEPLOYE : '');
  if (!secret || p.secret !== secret) return { ok: false, erreur: 'secret' };
  try {
    if (p.action === 'donnees') return { ok: true, maj: new Date().toISOString(), donnees: donneesPubliques() };
    if (p.action === 'inscrire') return inscrire(corps);

    const admin = adminDe(p.courriel);
    if (!admin) return { ok: false, erreur: 'admin' };
    const actions = { etat, manche, resultats, penalites, vods, photo, photos, capture, psn, pilote, engagement, grille, remplacements, inscription };
    const f = actions[p.action];
    if (!f) return { ok: false, erreur: 'action' };
    if (f === etat) return etat(admin);
    if (f === capture) return capture(corps);
    return avecVerrou(() => {
      const r = f(corps, admin);
      journal(admin.courriel, p.action, r.resume || '');
      CacheService.getScriptCache().remove(CLE_CACHE + '-n');
      return r;
    });
  } catch (err) {
    console.error(p.action, err && err.stack || err);
    return { ok: false, erreur: 'serveur', detail: String(err && err.message || err) };
  }
}

function repondre(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function avecVerrou(f) {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) return { ok: false, erreur: 'occupe' };
  try { return f(); } finally { verrou.releaseLock(); }
}

/* ---------- Lecture et écriture des onglets ---------- */
let classeurMemo = null;
const classeur = () => classeurMemo || (classeurMemo = SpreadsheetApp.openById(SHEET_ID));

// Fuseau du classeur (pas celui de Montréal) : sinon une heure « 18:45 » ressort « 21:45 »
let fuseauClasseur = null;
function valeur(v) {
  if (v instanceof Date) {
    const tz = fuseauClasseur || (fuseauClasseur = classeur().getSpreadsheetTimeZone());
    // Les heures seules arrivent comme des dates en 1899
    return v.getFullYear() < 1901 ? Utilities.formatDate(v, tz, 'HH:mm') : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return v;
}

function lire(nom) {
  const f = classeur().getSheetByName(nom);
  if (!f) return { feuille: null, entetes: [], lignes: [] };
  const vals = f.getDataRange().getValues();
  const entetes = (vals[0] || []).map(h => String(h).trim());
  const lignes = [];
  for (let i = 1; i < vals.length; i++) {
    const o = {};
    entetes.forEach((h, j) => { if (h && vals[i][j] !== '' && vals[i][j] !== null) o[h] = valeur(vals[i][j]); });
    if (Object.keys(o).length) { Object.defineProperty(o, '_ligne', { value: i + 1, enumerable: false }); lignes.push(o); }
  }
  return { feuille: f, entetes, lignes };
}

/** Lit plusieurs onglets en une seule fois (service avancé Sheets : 2 requêtes au lieu d'une par onglet).
    Valeurs brutes + valeurs affichées : une cellule affichée comme date (8/16/2026) ou heure (18:00) et dont la valeur
    brute est un nombre devient « yyyy-MM-dd » ou « HH:mm », comme dans lire(). Renvoie { onglet: [lignes] }. */
function lireTout(noms) {
  if (!noms.length) return {};
  const plages = noms.map(n => `'${n.replace(/'/g, "''")}'`);
  const brut = Sheets.Spreadsheets.Values.batchGet(SHEET_ID, { ranges: plages, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }).valueRanges;
  const affiche = Sheets.Spreadsheets.Values.batchGet(SHEET_ID, { ranges: plages, valueRenderOption: 'FORMATTED_VALUE' }).valueRanges;
  const deSerie = (n, vu) => {
    const ms = Math.round((n - 25569) * 864e5);   // 25569 = jours entre 1899-12-30 et 1970-01-01
    if (/^\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?$/i.test(vu) && n < 1) {
      const min = Math.round(n * 1440);
      return String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
    }
    return Utilities.formatDate(new Date(ms), 'UTC', 'yyyy-MM-dd');
  };
  const sortie = {};
  noms.forEach((nom, k) => {
    const vals = brut[k].values || [], vus = affiche[k].values || [];
    const entetes = (vals[0] || []).map(h => String(h).trim());
    const lignes = [];
    for (let i = 1; i < vals.length; i++) {
      const o = {};
      entetes.forEach((h, j) => {
        let v = vals[i][j];
        if (!h || v === '' || v === null || v === undefined) return;
        const vu = String((vus[i] || [])[j] || '');
        if (typeof v === 'number' && /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2})/.test(vu)) v = deSerie(v, vu);
        o[h] = v;
      });
      if (Object.keys(o).length) lignes.push(o);
    }
    sortie[nom] = lignes;
  });
  return sortie;
}

// Texte qui ressemble à une date, une heure ou une formule : apostrophe, pour que le Sheet le garde tel quel
// (sinon « 18:00 » devient un nombre et « +1 point » une formule en erreur).
function cellule(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^([=+\-@]|\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2})/.test(v)) return "'" + v;
  return v;
}

/** Ajoute les colonnes manquantes à l'en-tête et renvoie l'en-tête à jour. */
function entetesAvec(t, cles) {
  const manquantes = cles.filter(k => k && !t.entetes.includes(k) && !k.startsWith('_'));
  if (manquantes.length) {
    t.feuille.getRange(1, t.entetes.length + 1, 1, manquantes.length).setValues([manquantes]);
    t.entetes = t.entetes.concat(manquantes);
  }
  return t.entetes;
}

/** Met à jour la ligne qui correspond (fusion des champs) ou l'ajoute. */
function enregistrerLigne(nom, correspond, obj) {
  const t = lire(nom);
  const entetes = entetesAvec(t, Object.keys(obj));
  const ex = t.lignes.find(correspond);
  const fusion = Object.assign({}, ex || {}, obj);
  const ligne = entetes.map(h => cellule(fusion[h]));
  if (ex) t.feuille.getRange(ex._ligne, 1, 1, entetes.length).setValues([ligne]);
  else t.feuille.appendRow(ligne);
  return fusion;
}

/** Remplace toutes les lignes qui correspondent par une nouvelle liste. */
function remplacerLignes(nom, correspond, nouvelles) {
  const t = lire(nom);
  const entetes = entetesAvec(t, [].concat(...nouvelles.map(o => Object.keys(o))));
  // Suppression du bas vers le haut pour garder les numéros de ligne valides
  t.lignes.filter(correspond).map(l => l._ligne).sort((a, b) => b - a).forEach(n => t.feuille.deleteRow(n));
  if (nouvelles.length) {
    const debut = t.feuille.getLastRow() + 1;
    t.feuille.getRange(debut, 1, nouvelles.length, entetes.length).setValues(nouvelles.map(o => entetes.map(h => cellule(o[h]))));
  }
}

function journal(courriel, action, details) {
  const f = classeur().getSheetByName('_Journal');
  if (f) f.appendRow([Utilities.formatDate(new Date(), FUSEAU, "yyyy-MM-dd' 'HH:mm:ss"), courriel, action, String(details).slice(0, 500)]);
}

function adminDe(courriel) {
  const c = String(courriel || '').trim().toLowerCase();
  if (!c) return null;
  const a = lire('_Admins').lignes.find(x => String(x.courriel).toLowerCase() === c && x.actif !== false && String(x.actif).toUpperCase() !== 'FALSE');
  return a ? { courriel: c, nom: a.nom || c, role: a.role || 'admin' } : null;
}

const config = () => Object.fromEntries(lire('Config').lignes.map(r => [r.cle, r.valeur]));
const vrai = v => v === true || String(v).toUpperCase() === 'TRUE';
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const aujourdhui = () => Utilities.formatDate(new Date(), FUSEAU, 'yyyy-MM-dd');
const plusJours = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------- Données publiques ---------- */
function donneesPubliques() {
  const cache = CacheService.getScriptCache();
  const enCache = lireCache(cache);
  if (enCache) return enCache;
  const d = lireTout(classeur().getSheets().map(f => f.getName()).filter(nom => !nom.startsWith('_') && !ONGLETS_INTERNES.includes(nom)));
  masquerReglages(d);
  // Captures cachées ou de vérification (identifiants PSN) : jamais dans les données publiques
  d.Photos = (d.Photos || []).filter(p => p.url && vrai(p.publier) && p.source !== 'Résultats');
  ecrireCache(cache, d);
  return d;
}

/** Retire les réglages des manches à venir (règle détaillée dans outils/exporter_donnees.py). */
function masquerReglages(d) {
  const cfg = Object.fromEntries((d.Config || []).map(r => [r.cle, r.valeur]));
  const jours = Number(cfg.reglages_jours_avant) || 7;
  const auj = aujourdhui();
  (d.Manches || []).forEach(m => {
    if (!m.date || m.statut === 'Terminée') return;
    const force = String(m.reglages_visibles || '').toUpperCase();
    const reveal = plusJours(String(m.date).slice(0, 10), -jours);
    if (force === 'TRUE' || (force !== 'FALSE' && auj >= reveal) || auj > m.date) return;
    REGLAGES.forEach(k => delete m[k]);
    m.reglages_caches = true;
    if (force !== 'FALSE') m.reglages_reveles_le = reveal;
  });
}

// Le cache d'Apps Script limite chaque valeur à 100 Ko : la réponse est découpée en morceaux (5 min).
function ecrireCache(cache, d) {
  const texte = JSON.stringify(d), taille = 90000, morceaux = {};
  const n = Math.ceil(texte.length / taille);
  for (let i = 0; i < n; i++) morceaux[CLE_CACHE + '-' + i] = texte.slice(i * taille, (i + 1) * taille);
  morceaux[CLE_CACHE + '-n'] = String(n);
  cache.putAll(morceaux, 300);
}
function lireCache(cache) {
  const n = Number(cache.get(CLE_CACHE + '-n'));
  if (!n) return null;
  const cles = Array.from({ length: n }, (_, i) => CLE_CACHE + '-' + i);
  const m = cache.getAll(cles);
  if (cles.some(k => m[k] == null)) return null;
  return JSON.parse(cles.map(k => m[k]).join(''));
}

/* ---------- Formulaire « Rejoindre » ---------- */
function inscrire(c) {
  const txt = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
  const type = ['ligue', 'reserve', 'question'].includes(c.type) ? c.type : '';
  const courriel = txt(c.courriel, 120).toLowerCase();
  const discord = txt(c.pseudo_discord, 60);
  if (!type) return { ok: false, erreur: 'type' };
  if (!discord) return { ok: false, erreur: 'discord' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courriel)) return { ok: false, erreur: 'courriel' };
  if (type !== 'question' && !txt(c.psn, 40)) return { ok: false, erreur: 'psn' };
  if (!vrai(c.consentement)) return { ok: false, erreur: 'consentement' };

  // Une demande par courriel aux 10 minutes : protège contre les envois répétés
  const cache = CacheService.getScriptCache();
  const cle = 'inscr-' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, courriel)).slice(0, 20);
  if (cache.get(cle)) return { ok: true, deja: true };

  return avecVerrou(() => {
    const id = Utilities.getUuid().slice(0, 8);
    enregistrerLigne('_Inscriptions', () => false, {
      id, recu_le: Utilities.formatDate(new Date(), FUSEAU, 'yyyy-MM-dd HH:mm'), type,
      pseudo_discord: discord, psn: txt(c.psn, 40), courriel, region: txt(c.region, 60),
      controle: txt(c.controle, 30), driver_rating: txt(c.driver_rating, 10), twitch: txt(c.twitch, 80),
      disponibilites: txt(c.disponibilites, 300), experience: txt(c.experience, 600), message: txt(c.message, 2000),
      statut: 'Nouvelle',
    });
    cache.put(cle, '1', 600);
    const notif = PropertiesService.getScriptProperties().getProperty('NOTIF_COURRIEL');
    if (notif) {
      try {
        const libelle = { ligue: 'Joindre la ligue', reserve: 'Pilote de réserve', question: 'Question' }[type];
        MailApp.sendEmail(notif, `GTQC : nouvelle demande (${libelle}) de ${discord}`,
          `Type : ${libelle}\nDiscord : ${discord}\n\nÀ traiter dans l'admin, onglet Inscriptions.`);
      } catch (err) { console.warn('Courriel non envoyé :', err); }
    }
    return { ok: true, id };
  });
}

/* ---------- Admin ---------- */
function etat(admin) {
  const d = lireTout(classeur().getSheets().map(f => f.getName()).filter(nom => !ONGLETS_INTERNES.includes(nom)));
  d._Journal = (d._Journal || []).slice(-50).reverse();
  return { ok: true, moi: admin, donnees: d };
}

/** Crée ou modifie une manche, avec ses horaires par lobby (Manches_Categories). */
function manche(c) {
  const m = c.manche || {};
  if (!m.saison_id || !m.manche && m.manche !== 0) return { ok: false, erreur: 'champs' };
  m.course_id = m.course_id || `${m.saison_id}-R${String(m.manche).padStart(2, '0')}`;
  if (!m.date || !/^\d{4}-\d{2}-\d{2}$/.test(m.date)) return { ok: false, erreur: 'date' };
  const champs = ['course_id', 'saison_id', 'manche', 'type', 'date', 'date_fin', 'circuit_id', 'groupe_voiture', 'statut', 'publier',
    'image', 'note_publique', 'points_pilotes', 'reglages_visibles'].concat(REGLAGES);
  const propre = {};
  champs.forEach(k => { if (k in m) propre[k] = m[k]; });
  propre.manche = Number(propre.manche);
  const r = enregistrerLigne('Manches', x => x.course_id === propre.course_id, propre);
  if (Array.isArray(c.categories)) {
    remplacerLignes('Manches_Categories', x => x.course_id === propre.course_id,
      c.categories.filter(x => x.categorie_id).map(x => ({ course_id: propre.course_id, categorie_id: x.categorie_id, duree: x.duree || '', heure_depart: x.heure_depart || '', tours: x.tours || '' })));
  }
  return { ok: true, manche: r, resume: propre.course_id };
}

/** Résultats d'un lobby : points calculés ici à partir de Bareme_Points (+ meilleur tour). */
function resultats(c) {
  if (!c.course_id || !c.categorie_id || !Array.isArray(c.lignes)) return { ok: false, erreur: 'champs' };
  const bareme = lire('Bareme_Points').lignes.filter(b => b.categorie_id === c.categorie_id);
  const bonus = Number(config().points_meilleur_tour) || 0;
  const lignes = c.lignes.filter(l => l.pilote_id).map((l, i) => {
    const statut = l.statut || 'Classé';
    const position = Number(l.position) || i + 1;
    const classe = statut === 'Classé';
    const b = bareme.find(x => Number(x.position) === position);
    const mt = vrai(l.meilleur_tour);
    return {
      course_id: c.course_id, categorie_id: c.categorie_id, pilote_id: l.pilote_id, position,
      points: classe && b ? Number(b.points) : 0, meilleur_tour: mt, points_bonus: classe && mt ? bonus : 0,
      statut, note: l.note || '',
    };
  });
  remplacerLignes('Resultats', x => x.course_id === c.course_id && x.categorie_id === c.categorie_id, lignes);
  if (vrai(c.terminer)) enregistrerLigne('Manches', x => x.course_id === c.course_id, { course_id: c.course_id, statut: 'Terminée' });
  return { ok: true, lignes, resume: `${c.course_id} ${c.categorie_id} : ${lignes.length} pilotes` };
}

function penalites(c) {
  if (!c.course_id || !Array.isArray(c.lignes)) return { ok: false, erreur: 'champs' };
  const lignes = c.lignes.filter(l => l.pilote_id && l.type).map(l => ({
    course_id: c.course_id, pilote_id: l.pilote_id, type: l.type,
    points: l.type === 'Points' ? -Math.abs(Number(l.points) || 0) : '', secondes: l.type === 'Temps' ? Number(l.secondes) || 0 : '',
    motif: l.motif || '', publier: l.publier !== false,
  }));
  remplacerLignes('Penalites', x => x.course_id === c.course_id, lignes);
  return { ok: true, resume: `${c.course_id} : ${lignes.length} pénalités` };
}

/** Rediffusions d'une manche (YouTube ou Twitch). */
function vods(c) {
  if (!c.course_id || !Array.isArray(c.lignes)) return { ok: false, erreur: 'champs' };
  const lignes = c.lignes.filter(l => /^https:\/\//.test(l.url || '')).map((l, i) => ({
    course_id: c.course_id, categorie_id: l.categorie_id || '', titre: l.titre || '', url: l.url,
    plateforme: /youtu\.?be/i.test(l.url) ? 'YouTube' : /twitch\.tv/i.test(l.url) ? 'Twitch' : 'Vidéo',
    ordre: i + 1, publier: l.publier !== false,
  }));
  remplacerLignes('Vods', x => x.course_id === c.course_id, lignes);
  return { ok: true, resume: `${c.course_id} : ${lignes.length} VOD` };
}

/* ---------- Captures des manches (jeu, diffusion) : fichiers dans Drive, liens dans l'onglet Photos ---------- */
const MAX_OCTETS_PHOTO = 6 * 1024 * 1024;
const MIMES_PHOTO = ['image/jpeg', 'image/png', 'image/webp'];

/** Une image (base64, déjà réduite par le navigateur) : enregistrée dans Drive, lisible par lien, puis ajoutée à Photos. */
function photo(c) {
  if (!c.course_id || !c.data) return { ok: false, erreur: 'champs' };
  if (!MIMES_PHOTO.includes(c.mime)) return { ok: false, erreur: 'format' };
  const octets = Utilities.base64Decode(String(c.data));
  if (!octets.length || octets.length > MAX_OCTETS_PHOTO) return { ok: false, erreur: 'taille' };
  const nom = `${c.course_id}-${Date.now()}.${c.mime.split('/')[1].replace('jpeg', 'jpg')}`;
  // Capture de vérification des résultats (source « Résultats ») : seul le dernier envoi est gardé par manche et
  // lobby. c.lot regroupe les pages d'un même envoi ; les captures d'un envoi précédent vont à la corbeille.
  const verif = c.source === 'Résultats';
  if (verif) {
    const anciennes = lire('Photos').lignes.filter(x => x.course_id === c.course_id && (x.categorie_id || '') === (c.categorie_id || '')
      && x.source === 'Résultats' && String(x.lot || '') !== String(c.lot || ''));
    anciennes.forEach(x => { try { DriveApp.getFileById(x.photo_id).setTrashed(true); } catch (err) { console.warn('Fichier introuvable :', x.photo_id); } });
    if (anciennes.length) remplacerLignes('Photos', x => anciennes.some(a => a.photo_id === x.photo_id), []);
  }
  const fichier = dossierPhotos().createFile(Utilities.newBlob(octets, c.mime, nom));
  // L'écran des résultats montre les identifiants PSN : la capture de vérification reste privée (pas de lien public),
  // l'admin la lit avec l'action « capture ».
  if (!verif) fichier.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const deja = lire('Photos').lignes.filter(x => x.course_id === c.course_id).length;
  const ligne = {
    photo_id: fichier.getId(), course_id: c.course_id, categorie_id: c.categorie_id || '',
    url: verif ? '' : 'https://lh3.googleusercontent.com/d/' + fichier.getId(), legende: String(c.legende || '').slice(0, 200),
    // Les captures de vérification ne sont pas montrées sur le site
    ordre: deja + 1, publier: !verif, ajoute_le: Utilities.formatDate(new Date(), FUSEAU, 'yyyy-MM-dd HH:mm'), source: c.source || 'Jeu',
    lot: verif ? String(c.lot || '') : '',
  };
  enregistrerLigne('Photos', () => false, ligne);
  return { ok: true, photo: ligne, resume: `${c.course_id} : ${nom}` };
}

/** Légendes, ordre et visibilité des captures d'une manche ; une capture retirée de la liste va à la corbeille de Drive. */
function photos(c) {
  if (!c.course_id || !Array.isArray(c.lignes)) return { ok: false, erreur: 'champs' };
  // Les captures de vérification des résultats ne sont pas gérées ici (onglet Résultats de l'admin)
  const avant = lire('Photos').lignes.filter(x => x.course_id === c.course_id && x.source !== 'Résultats');
  const gardees = c.lignes.map(l => avant.find(x => x.photo_id === l.photo_id) && Object.assign({}, avant.find(x => x.photo_id === l.photo_id), {
    legende: String(l.legende || '').slice(0, 200), categorie_id: l.categorie_id || '', source: l.source || '', publier: l.publier !== false,
  })).filter(Boolean).map((l, i) => Object.assign(l, { ordre: i + 1 }));
  avant.filter(x => !gardees.some(g => g.photo_id === x.photo_id)).forEach(x => {
    try { DriveApp.getFileById(x.photo_id).setTrashed(true); } catch (err) { console.warn('Fichier introuvable :', x.photo_id); }
  });
  remplacerLignes('Photos', x => x.course_id === c.course_id && x.source !== 'Résultats', gardees);
  return { ok: true, resume: `${c.course_id} : ${gardees.length} captures` };
}

/** Capture de vérification (privée) d'une manche : renvoyée à l'admin en base64. */
function capture(c) {
  const p = lire('Photos').lignes.find(x => x.photo_id === c.photo_id && x.source === 'Résultats');
  if (!p) return { ok: false, erreur: 'introuvable' };
  const blob = DriveApp.getFileById(p.photo_id).getBlob();
  return { ok: true, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/** Identifiants PSN lus sur les captures de résultats → pilote (onglet privé _PSN, jamais publié). */
function psn(c) {
  if (!Array.isArray(c.lignes)) return { ok: false, erreur: 'champs' };
  const quand = Utilities.formatDate(new Date(), FUSEAU, 'yyyy-MM-dd HH:mm');
  const lignes = c.lignes.filter(l => l.psn && l.pilote_id).map(l => ({ psn: String(l.psn).trim().slice(0, 40), pilote_id: l.pilote_id }));
  lignes.forEach(l => enregistrerLigne('_PSN', x => String(x.psn).toLowerCase() === l.psn.toLowerCase(), Object.assign({ ajoute_le: quand }, l)));
  return { ok: true, resume: `${lignes.length} PSN` };
}

function dossierPhotos() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DOSSIER_PHOTOS');
  if (id) return DriveApp.getFolderById(id);
  const dossier = DriveApp.createFolder('GTQC — Captures des manches');
  props.setProperty('DOSSIER_PHOTOS', dossier.getId());
  return dossier;
}

/** Crée ou modifie un pilote (pseudo et PSN, publics ; aucune autre info personnelle dans cet onglet). */
function pilote(c) {
  const p = c.pilote || {};
  if (!p.pseudo && !p.pilote_id) return { ok: false, erreur: 'pseudo' };
  const id = p.pilote_id || slug(p.pseudo);
  const propre = { pilote_id: id };
  CHAMPS_PILOTE.forEach(k => { if (k in p) propre[k] = p[k]; });
  if ('twitch' in propre) propre.twitch = nomChaine(propre.twitch);
  const r = enregistrerLigne('Pilotes', x => x.pilote_id === id, propre);
  return { ok: true, pilote: r, resume: id };
}

function nomChaine(v) {
  const m = /(?:twitch\.tv\/)?@?([a-z0-9_]{3,25})\/?$/i.exec(String(v || '').replace(/^https?:\/\/(www\.)?/i, ''));
  return m ? m[1].toLowerCase() : '';
}

/** Inscription d'un pilote à une saison : lobby, rôle (Titulaire / Réserve), ordre des réserves. */
function engagement(c) {
  const e = c.engagement || {};
  if (!e.saison_id || !e.pilote_id) return { ok: false, erreur: 'champs' };
  const propre = {};
  ['saison_id', 'pilote_id', 'categorie_id', 'role', 'numero', 'equipe_id', 'ordre_reserve', 'note'].forEach(k => { if (k in e) propre[k] = e[k]; });
  enregistrerLigne('Engagements', x => x.saison_id === e.saison_id && x.pilote_id === e.pilote_id, propre);
  return { ok: true, resume: `${e.saison_id} ${e.pilote_id} ${e.role || ''} ${e.categorie_id || ''}` };
}

/** Nouvelle grille des lobbys (aux 2 manches) : historique dans Grilles, lobby courant dans Engagements. */
function grille(c) {
  if (!c.saison_id || !c.a_partir_de || !Array.isArray(c.lignes)) return { ok: false, erreur: 'champs' };
  const quand = Utilities.formatDate(new Date(), FUSEAU, 'yyyy-MM-dd HH:mm');
  const lignes = c.lignes.filter(l => l.pilote_id && l.categorie_id).map(l => ({
    saison_id: c.saison_id, a_partir_de: Number(c.a_partir_de), pilote_id: l.pilote_id, categorie_id: l.categorie_id,
    rang: l.rang || '', mouvement: l.mouvement || '', publie_le: quand,
  }));
  remplacerLignes('Grilles', x => x.saison_id === c.saison_id && Number(x.a_partir_de) === Number(c.a_partir_de), lignes);
  lignes.forEach(l => enregistrerLigne('Engagements', x => x.saison_id === c.saison_id && x.pilote_id === l.pilote_id,
    { saison_id: c.saison_id, pilote_id: l.pilote_id, categorie_id: l.categorie_id }));
  const bouges = lignes.filter(l => l.mouvement).map(l => `${l.pilote_id} ${l.mouvement}`).join(', ');
  return { ok: true, resume: `${c.saison_id} dès M${c.a_partir_de} : ${bouges || 'aucun changement'}` };
}

/** Absences et pilotes de réserve assignés pour une manche. */
function remplacements(c) {
  if (!c.course_id || !Array.isArray(c.lignes)) return { ok: false, erreur: 'champs' };
  const lignes = c.lignes.filter(l => l.absent_id).map(l => ({
    course_id: c.course_id, categorie_id: l.categorie_id || '', absent_id: l.absent_id, remplacant_id: l.remplacant_id || '',
    statut: l.remplacant_id ? (l.statut || 'Confirmé') : 'À combler', note: l.note || '',
  }));
  remplacerLignes('Remplacements', x => x.course_id === c.course_id, lignes);
  return { ok: true, resume: `${c.course_id} : ${lignes.length} absences` };
}

function inscription(c) {
  if (!c.id) return { ok: false, erreur: 'champs' };
  const maj = { id: c.id };
  if (c.statut) {
    if (!STATUTS_INSCRIPTION.includes(c.statut)) return { ok: false, erreur: 'statut' };
    maj.statut = c.statut;
  }
  if ('note_admin' in c) maj.note_admin = String(c.note_admin).slice(0, 1000);
  return { ok: true, inscription: enregistrerLigne('_Inscriptions', x => String(x.id) === String(c.id), maj), resume: `${c.id} ${c.statut || ''}` };
}

/** À lancer une fois dans l'éditeur (bouton Exécuter) : Google demande les autorisations du script
    (classeur, Drive pour les captures, courriel pour l'avis d'inscription). Sans elles, l'application web répond 403. */
function autoriser() {
  console.log('Classeur :', classeur().getName());
  console.log('Drive :', DriveApp.getRootFolder().getName());
  console.log('Courriels restants aujourd\'hui :', MailApp.getRemainingDailyQuota());
}

/** À lancer une fois dans l'éditeur : crée le code SECRET (à copier dans les deux Workers). */
function creerSecret() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid().slice(0, 8));
  console.log('SECRET créé. Copie-le depuis Paramètres du projet → Propriétés du script.');
}
