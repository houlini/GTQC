// GTQC — Worker de l'API publique du site (api.<domaine>) :
//   GET  /donnees     onglets publics du classeur (via Apps Script, réglages des prochaines manches retirés)
//   GET  /twitch      GTQC TV : chaînes des pilotes (Pilotes.twitch) et qui est en direct avec le tag GTQC
//   POST /inscription formulaire « Rejoindre » (relayé au script, piège à robots ici)
// Les clés Twitch et le code du script restent ici (secrets). Réponses gardées 60 s / 30 s en cache.

const DUREE_DONNEES = 60;
const DUREE_TWITCH = 30;
const FUSEAU = 'America/Toronto';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origine = request.headers.get('Origin') || '';
    const origines = String(env.ORIGINES || '').split(',').map(s => s.trim()).filter(Boolean);
    // Le site en local (http://localhost:…) peut aussi lire l'API, pour les tests.
    const cors = {
      'Access-Control-Allow-Origin': origines.includes(origine) || /^http:\/\/localhost(:\d+)?$/.test(origine) ? origine : (origines[0] || '*'),
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    let rep;
    if (url.pathname === '/donnees' && request.method === 'GET') rep = await enCache(ctx, 'donnees', DUREE_DONNEES, () => donnees(env));
    else if (url.pathname === '/twitch' && request.method === 'GET') rep = await enCache(ctx, 'twitch', DUREE_TWITCH, () => twitch(env, ctx));
    else if (url.pathname === '/inscription' && request.method === 'POST') rep = await inscription(request, env);
    else rep = json({ ok: false, erreur: 'introuvable' }, 404, 0);
    const finale = new Response(rep.body, rep);
    Object.entries(cors).forEach(([k, v]) => finale.headers.set(k, v));
    finale.headers.set('Cache-Control', 'no-store');
    return finale;
  },
};

/* ---------- Cache partagé ----------
   L'âge est vérifié ici (en-tête X-Genere) : les réglages de cache de la zone peuvent allonger la durée annoncée. */
async function enCache(ctx, nom, duree, construire) {
  const cache = caches.default;
  const cle = new Request('https://cache.gtqc/' + nom);
  let rep = await cache.match(cle);
  if (rep && !(Date.now() - Number(rep.headers.get('X-Genere') || 0) < duree * 1000)) rep = null;
  if (!rep) {
    rep = await construire();
    if (rep.ok) ctx.waitUntil(cache.put(cle, rep.clone()));
  }
  return rep;
}

async function donnees(env) {
  const r = await script(env, 'donnees');
  return r.ok ? json(r, 200, DUREE_DONNEES) : json({ ok: false, erreur: r.erreur || 'script' }, 502, 0);
}

/* ---------- GTQC TV ---------- */
async function twitch(env, ctx) {
  // Pilotes et calendrier : la copie de /donnees en cache suffit (60 s)
  const dRep = await enCache(ctx, 'donnees', DUREE_DONNEES, () => donnees(env));
  if (!dRep.ok) return json({ ok: false, erreur: 'classeur' }, 502, 0);
  const d = (await dRep.clone().json()).donnees;
  const cfg = Object.fromEntries((d.Config || []).map(r => [r.cle, r.valeur]));
  const tag = String(cfg.tag_twitch || 'GTQC').toLowerCase();
  const soiree = soireeDeCourse(d, cfg);
  const saison = cfg.saison_courante;
  const lobby = id => {
    const e = (d.Engagements || []).find(x => x.saison_id === saison && x.pilote_id === id);
    return e ? (e.role === 'Réserve' ? 'R' : e.categorie_id || '') : '';
  };
  const vues = new Set();
  const chaines = (d.Pilotes || []).filter(p => p.twitch && String(p.actif).toUpperCase() !== 'FALSE').map(p => ({
    chaine: String(p.twitch).toLowerCase(), pilote_id: p.pilote_id, pseudo: p.pseudo, avatar: p.avatar || '', lobby: lobby(p.pilote_id),
    live: false, gtqc: false,
  })).filter(c => /^[a-z0-9_]{3,25}$/.test(c.chaine) && !vues.has(c.chaine) && vues.add(c.chaine));

  const base = { maj: new Date().toISOString(), tag: cfg.tag_twitch || 'GTQC', pendant_course: !!soiree, course: soiree };
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) return json({ ok: false, erreur: 'config', ...base, chaines }, 200, 0);
  try {
    const enDirect = await streams(env, chaines.map(c => c.chaine));
    chaines.forEach(c => {
      const s = enDirect.get(c.chaine);
      if (!s) return;
      const tags = (s.tags || []).map(t => t.toLowerCase());
      c.live = true;
      // Tag Twitch « GTQC », ou le mot GTQC dans le titre, avec ou sans « # » : la diffusion
      // PlayStation n'a pas de tags et retire les « # » du titre.
      c.gtqc = tags.includes(tag) || new RegExp('(^|[^a-z0-9])' + tag + '($|[^a-z0-9])', 'i').test(s.title || '');
      c.nom = s.user_name;
      c.titre = s.title;
      c.jeu = s.game_name;
      c.spectateurs = s.viewer_count;
      c.debut = s.started_at;
    });
  } catch (err) {
    console.error('Twitch :', err.message);
    return json({ ok: false, erreur: 'twitch', ...base, chaines }, 200, 0);
  }
  return json({ ok: true, ...base, chaines }, 200, DUREE_TWITCH);
}

/** Manche du jour (heure de Montréal) dans la plage Config.fenetre_direct, sinon null. */
function soireeDeCourse(d, cfg) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(p => [p.type, p.value]));
  const jour = `${parts.year}-${parts.month}-${parts.day}`, heure = `${parts.hour}:${parts.minute}`;
  const [debut, fin] = String(cfg.fenetre_direct || '17:30-23:30').split('-').map(s => s.trim());
  if (heure < debut || heure > fin) return null;
  const m = (d.Manches || []).find(x => String(x.publier).toUpperCase() !== 'FALSE' && x.date && (x.date === jour || (x.date_fin && x.date <= jour && jour <= x.date_fin)));
  return m ? { course_id: m.course_id, manche: m.manche, type: m.type } : null;
}

async function streams(env, logins, reessai = false) {
  const resultat = new Map();
  if (!logins.length) return resultat;
  const jeton = await jetonTwitch(env);
  for (let i = 0; i < logins.length; i += 100) {
    const params = new URLSearchParams();
    logins.slice(i, i + 100).forEach(l => params.append('user_login', l));
    params.set('first', '100');
    const rep = await fetch('https://api.twitch.tv/helix/streams?' + params, {
      headers: { 'Client-Id': env.TWITCH_CLIENT_ID, 'Authorization': 'Bearer ' + jeton },
    });
    // Jeton invalidé avant son échéance : on l'oublie (mémoire et cache) et on en redemande un, une fois.
    if (rep.status === 401) {
      jetonMemoire = null;
      await caches.default.delete(CLE_JETON);
      if (!reessai) return streams(env, logins, true);
      throw new Error('jeton refusé (vérifier TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET)');
    }
    if (!rep.ok) throw new Error('HTTP ' + rep.status);
    (await rep.json()).data.forEach(s => resultat.set(s.user_login.toLowerCase(), s));
  }
  return resultat;
}

// Jeton d'application Twitch (valide ~60 jours), gardé en mémoire et dans le cache.
const CLE_JETON = new Request('https://cache.gtqc/twitch-jeton');
let jetonMemoire = null;
async function jetonTwitch(env) {
  if (jetonMemoire && jetonMemoire.expire > Date.now()) return jetonMemoire.valeur;
  const enCacheJeton = await caches.default.match(CLE_JETON);
  if (enCacheJeton) {
    jetonMemoire = await enCacheJeton.json();
    if (jetonMemoire.expire > Date.now()) return jetonMemoire.valeur;
  }
  const rep = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!rep.ok) throw new Error('jeton Twitch HTTP ' + rep.status);
  const d = await rep.json();
  const duree = Math.max(60, d.expires_in - 3600);
  jetonMemoire = { valeur: d.access_token, expire: Date.now() + duree * 1000 };
  await caches.default.put(CLE_JETON, new Response(JSON.stringify(jetonMemoire), { headers: { 'Cache-Control': 'max-age=' + duree } }));
  return jetonMemoire.valeur;
}

/* ---------- Formulaire « Rejoindre » ---------- */
const CHAMPS_INSCRIPTION = ['type', 'pseudo_discord', 'psn', 'courriel', 'region', 'controle', 'driver_rating', 'twitch',
  'disponibilites', 'experience', 'message', 'consentement'];

async function inscription(request, env) {
  const texte = await request.text();
  if (texte.length > 6000) return json({ ok: false, erreur: 'taille' }, 413, 0);
  let d;
  try { d = JSON.parse(texte); } catch { return json({ ok: false, erreur: 'json' }, 400, 0); }
  // Piège à robots : champ invisible que seul un robot remplit. On répond « reçu » sans rien enregistrer.
  if (d.site) return json({ ok: true }, 200, 0);
  const propre = Object.fromEntries(CHAMPS_INSCRIPTION.filter(k => k in d).map(k => [k, d[k]]));
  const r = await script(env, 'inscrire', propre);
  return json(r, r.ok ? 200 : r.erreur === 'script' ? 502 : 400, 0);
}

/* ---------- Apps Script ---------- */
async function script(env, action, corps) {
  if (!env.SCRIPT_URL || !env.SCRIPT_SECRET) return { ok: false, erreur: 'config' };
  const cible = new URL(env.SCRIPT_URL);
  cible.searchParams.set('action', action);
  cible.searchParams.set('courriel', 'api');
  cible.searchParams.set('secret', env.SCRIPT_SECRET);
  try {
    let rep = await fetch(cible, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps || {}), redirect: 'manual' });
    // Apps Script répond par une redirection vers le résultat, à lire en GET.
    if (rep.status >= 300 && rep.status < 400) rep = await fetch(rep.headers.get('Location'));
    return JSON.parse(await rep.text());
  } catch (err) {
    console.error('Script :', action, err.message);
    return { ok: false, erreur: 'script' };
  }
}

function json(donnees, statut = 200, cache = 0) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache ? 'public, max-age=' + cache : 'no-store',
      'X-Genere': String(Date.now()),
    },
  });
}
