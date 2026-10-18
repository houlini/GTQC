// GTQC — Worker de l'admin (admin.<domaine>, derrière Cloudflare Access) : sert l'interface
// (dossier public/) et relaie les actions vers l'application web Apps Script, avec le
// courriel vérifié par Access. Le script refuse tout courriel absent de l'onglet _Admins.

const ACTIONS = {
  'GET /api/etat': 'etat',
  'POST /api/manche': 'manche',
  'POST /api/resultats': 'resultats',
  'POST /api/penalites': 'penalites',
  'POST /api/vods': 'vods',
  'POST /api/photo': 'photo',
  'POST /api/photos': 'photos',
  'POST /api/pilote': 'pilote',
  'POST /api/engagement': 'engagement',
  'POST /api/grille': 'grille',
  'POST /api/remplacements': 'remplacements',
  'POST /api/inscription': 'inscription',
};
const MAX_OCTETS = 200 * 1024;
// Une capture par envoi, réduite par le navigateur (base64 : environ 4/3 de l'image)
const MAX_OCTETS_PHOTO = 9 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    let courriel;
    try {
      courriel = await verifierAcces(request, env);
    } catch (err) {
      console.warn('Accès refusé :', err.message);
      return json({ ok: false, erreur: 'acces' }, 403);
    }
    const action = ACTIONS[request.method + ' ' + url.pathname];
    if (!action) return json({ ok: false, erreur: 'introuvable' }, 404);
    let corps = '{}';
    if (request.method === 'POST') {
      corps = await request.text();
      if (corps.length > (action === 'photo' ? MAX_OCTETS_PHOTO : MAX_OCTETS)) return json({ ok: false, erreur: 'taille' }, 413);
    }
    const r = await script(env, action, courriel, corps);
    return json(r, r.ok ? 200 : r.erreur === 'script' ? 502 : r.erreur === 'admin' ? 403 : 400);
  },
};

// Vérifie le jeton signé qu'Access ajoute à chaque requête autorisée, et renvoie le courriel.
async function verifierAcces(request, env) {
  const jeton = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jeton) throw new Error('jeton absent');
  const [enteteB64, chargeB64, signatureB64] = jeton.split('.');
  const entete = JSON.parse(texteB64url(enteteB64));
  const charge = JSON.parse(texteB64url(chargeB64));
  if (entete.alg !== 'RS256') throw new Error('algorithme inattendu');

  const certs = await fetch(env.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs', { cf: { cacheTtl: 3600 } }).then(r => r.json());
  const jwk = (certs.keys || []).find(k => k.kid === entete.kid);
  if (!jwk) throw new Error('clé inconnue');
  const cle = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valide = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cle, octetsB64url(signatureB64),
    new TextEncoder().encode(enteteB64 + '.' + chargeB64));
  if (!valide) throw new Error('signature invalide');

  const audiences = Array.isArray(charge.aud) ? charge.aud : [charge.aud];
  if (!audiences.includes(env.ACCESS_AUD)) throw new Error('audience invalide');
  if (charge.iss !== env.ACCESS_TEAM_DOMAIN) throw new Error('émetteur invalide');
  if (!charge.exp || charge.exp * 1000 < Date.now()) throw new Error('jeton expiré');
  if (!charge.email) throw new Error('courriel absent');
  return String(charge.email).toLowerCase();
}

// Action, courriel et secret passent dans l'adresse, construite ici : le navigateur ne peut pas les imposer.
async function script(env, action, courriel, corps) {
  if (!env.SCRIPT_URL || !env.SCRIPT_SECRET) return { ok: false, erreur: 'config' };
  const cible = new URL(env.SCRIPT_URL);
  cible.searchParams.set('action', action);
  cible.searchParams.set('courriel', courriel);
  cible.searchParams.set('secret', env.SCRIPT_SECRET);
  try {
    let rep = await fetch(cible, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps || '{}', redirect: 'manual' });
    if (rep.status >= 300 && rep.status < 400) rep = await fetch(rep.headers.get('Location'));
    const texte = await rep.text();
    try { return JSON.parse(texte); } catch {
      console.error('Réponse inattendue du script :', rep.status, texte.slice(0, 300));
      return { ok: false, erreur: 'script' };
    }
  } catch (err) {
    console.error('Script :', action, err.message);
    return { ok: false, erreur: 'script' };
  }
}

function json(donnees, statut = 200) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function octetsB64url(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
const texteB64url = s => new TextDecoder().decode(octetsB64url(s));
