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
  'POST /api/capture': 'capture',
  'POST /api/psn': 'psn',
  'POST /api/pilote': 'pilote',
  'POST /api/engagement': 'engagement',
  'POST /api/grille': 'grille',
  'POST /api/remplacements': 'remplacements',
  'POST /api/inscription': 'inscription',
  'POST /api/demande': 'demande',
  // Même nom que l'action : l'admin envoie à /api/<action>
  'POST /api/demandeStatut': 'demandeStatut',
  'POST /api/demandeCapture': 'demandeCapture',
  'POST /api/demande/voir': 'demandeVoir',
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
    // Lecture d'une capture des résultats de GT7 : faite ici (clé Gemini), rien n'est enregistré.
    if (url.pathname === '/api/resultats/lire' && request.method === 'POST') {
      const texte = await request.text();
      if (texte.length > MAX_OCTETS_PHOTO) return json({ ok: false, erreur: 'taille' }, 413);
      let photo;
      try { photo = JSON.parse(texte); } catch { return json({ ok: false, erreur: 'json' }, 400); }
      return lireCapture(env, photo);
    }
    const action = ACTIONS[request.method + ' ' + url.pathname];
    if (!action) return json({ ok: false, erreur: 'route' }, 404);
    let corps = '{}';
    if (request.method === 'POST') {
      corps = await request.text();
      if (corps.length > (action === 'photo' || action === 'demandeCapture' ? MAX_OCTETS_PHOTO : MAX_OCTETS)) return json({ ok: false, erreur: 'taille' }, 413);
    }
    const r = await script(env, action, courriel, corps);
    return json(r, r.ok ? 200 : r.erreur === 'script' ? 502 : r.erreur === 'admin' ? 403 : 400);
  },
};

/* ---------- Lecture des captures de résultats GT7 (Gemini, comme LNHQ) ---------- */
// Le tableau de fin de course de GT7 : position, nom du pilote (identifiant PSN ou pseudo), voiture,
// temps total ou écart, meilleur tour. Les noms sont rapprochés des pilotes dans l'admin (onglet _PSN).
async function lireCapture(env, photo) {
  if (!env.GEMINI_KEY) return json({ ok: false, erreur: 'lecture_indisponible' });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.mime) || !photo.data) return json({ ok: false, erreur: 'photo' });
  const consigne = 'This image shows the race results screen of Gran Turismo 7 (a results table after a race). '
    + 'It may be a phone photo of a TV, or a screenshot of a stream or web page with other things around it: only use the game table. '
    + 'For each row from top to bottom, copy: the finishing position number, the driver name exactly as written (online ID, '
    + 'keep letters, digits, "_" and "-"), the car name if shown, the total time or gap to the winner as displayed (e.g. "45:12.345", '
    + '"+3.210", "+1 Lap"), and the best lap time of that driver if a best lap column is shown (e.g. "1:58.432"). '
    + 'Set "statut" to DNF if the row says DNF, retired or has no finishing time because the driver did not finish, '
    + 'DSQ if disqualified, otherwise CLASSE. Set "lisible" to false if this is not such a results table or it cannot be read. '
    + 'Never invent a row or a value: leave unreadable values empty.';
  const corps = {
    contents: [{ parts: [{ inline_data: { mime_type: photo.mime, data: photo.data } }, { text: consigne }] }],
    generationConfig: {
      temperature: 0,
      mediaResolution: 'MEDIA_RESOLUTION_HIGH',
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          lisible: { type: 'BOOLEAN' },
          lignes: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                position: { type: 'INTEGER' }, nom: { type: 'STRING' }, voiture: { type: 'STRING' },
                temps: { type: 'STRING' }, meilleur_tour: { type: 'STRING' }, statut: { type: 'STRING', enum: ['CLASSE', 'DNF', 'DSQ'] },
              },
              required: ['position', 'nom', 'statut'],
            },
          },
        },
        required: ['lisible', 'lignes'],
      },
    },
  };
  // Modèle gratuit parfois surchargé (503) : un nouvel essai, puis le modèle de secours.
  const modeles = [env.GEMINI_MODEL || 'gemini-flash-latest', env.GEMINI_MODEL_SECOURS || 'gemini-flash-lite-latest'];
  let derniere = 'lecture';
  for (const modele of modeles) {
    for (let essai = 0; essai < 2; essai++) {
      try {
        const rep = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
          body: JSON.stringify(corps),
        });
        if (!rep.ok) {
          console.error('Gemini', modele, rep.status, (await rep.text()).slice(0, 300));
          derniere = rep.status === 429 ? 'quota' : 'lecture';
          if (rep.status === 400 && corps.generationConfig.mediaResolution) { delete corps.generationConfig.mediaResolution; essai--; continue; }
          if (rep.status === 503 && essai === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
          break;
        }
        const donnees = await rep.json();
        const texte = (donnees.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        return json({ ok: true, lecture: nettoyerLecture(JSON.parse(texte)), modele });
      } catch (err) {
        console.error('Gemini', modele, err.message);
        break;
      }
    }
  }
  return json({ ok: false, erreur: derniere });
}

// Positions plausibles seulement, noms sans symboles inventés, temps au format de GT7.
function nettoyerLecture(l) {
  const temps = v => { const t = String(v || '').trim(); return /^[+\d:.,\s]{1,14}(lap|laps|tour|tours)?$/i.test(t) ? t : ''; };
  const vues = new Set();
  l.lignes = (Array.isArray(l.lignes) ? l.lignes : []).map(x => ({
    position: Number(x.position) || 0,
    nom: String(x.nom || '').trim().replace(/[^\p{L}\p{N}_\-. ]/gu, '').slice(0, 40),
    voiture: String(x.voiture || '').trim().slice(0, 60),
    temps: temps(x.temps), meilleur_tour: temps(x.meilleur_tour),
    statut: ['DNF', 'DSQ'].includes(x.statut) ? x.statut : 'Classé',
  })).filter(x => x.position > 0 && x.position <= 40 && x.nom && !vues.has(x.position) && vues.add(x.position)).sort((a, b) => a.position - b.position);
  return { lisible: !!l.lisible && l.lignes.length > 0, lignes: l.lignes };
}

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
