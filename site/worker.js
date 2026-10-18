// GTQC — Worker du site public (gtqc.net). Déployé par Cloudflare à chaque « Push origin » (Workers Builds).
// Adresses propres : gtqc.net/pilotes.html sert maquette/pilotes.html ; les images restent sous /assets/.
// Seuls maquette/ et assets/ sont servis : le reste du dépôt (workers, apps-script, notes) n'est jamais public.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // www.gtqc.net → gtqc.net
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    let chemin = decodeURIComponent(url.pathname);
    if (chemin.includes('..')) return introuvable();
    // Anciens liens /maquette/… : même page à l'adresse propre
    if (chemin === '/maquette' || chemin.startsWith('/maquette/')) {
      return Response.redirect(url.origin + (chemin.slice('/maquette'.length) || '/') + url.search, 301);
    }
    if (chemin.startsWith('/assets/')) return servir(env, request, url, chemin);
    if (chemin === '/' || chemin.endsWith('/')) chemin += 'index.html';
    else if (!/\.[a-z0-9]+$/i.test(chemin)) chemin += '.html';   // gtqc.net/pilotes → pilotes.html
    return servir(env, request, url, '/maquette' + chemin);
  },
};

async function servir(env, request, url, chemin) {
  const cible = new URL(url);
  cible.pathname = chemin;
  const rep = await env.ASSETS.fetch(new Request(cible, request));
  return rep.status === 404 ? introuvable() : rep;
}

function introuvable() {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GTQC</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#00162B;color:#fff;font-family:system-ui,sans-serif;text-align:center">
<div><h1 style="margin:0 0 8px">Page introuvable</h1><p><a href="/" style="color:#E6FF00">Retour au calendrier GTQC</a></p></div>`,
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
