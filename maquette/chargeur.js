/* GTQC – charge les données puis les scripts de la page.
   Avec l'API (Worker gtqc-api → Apps Script) : données à jour du Sheet, réglages des prochaines
   manches retirés côté serveur. Sans API (adresse vide, hors ligne ou en panne) : data.js, l'export du dépôt.
   Utilisation : <script src="chargeur.js" data-scripts="commun.js app.js"></script> */
(() => {
  // Adresse de l'API publique (Worker gtqc-api). Tant qu'elle ne répond pas, le site lit data.js.
  const API = "https://api.gtqc.net";
  window.GTQC_API = API;

  const moi = document.currentScript;
  const scripts = (moi.dataset.scripts || "commun.js").split(/\s+/).filter(Boolean);
  const charger = src => new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => ko(new Error(src));
    document.body.appendChild(s);
  });
  // Téléchargés tout de suite, en même temps que les données ; exécutés dans l'ordre une fois les données là
  const prechargement = (href, as) => {
    const l = document.createElement("link");
    l.rel = "preload"; l.as = as; l.href = href;
    document.head.appendChild(l);
  };
  scripts.forEach(src => prechargement(src, "script"));
  const IMG = /\/maquette\//.test(location.pathname) || location.protocol === "file:" ? "../assets/img/" : "assets/img/";
  prechargement(IMG + "logo/gtqc-logo-fonce-web.webp", "image");

  const depuisApi = async () => {
    if (!API) throw new Error("pas d'API");
    const ctrl = new AbortController();
    // L'API répond en ~0,1 à 0,3 s (cache du Worker) ; au-delà de 3 s, on passe à data.js
    const minuteur = setTimeout(() => ctrl.abort(), 3000);
    try {
      const rep = await fetch(API + "/donnees", { signal: ctrl.signal });
      const d = await rep.json();
      if (!d.ok || !d.donnees) throw new Error(d.erreur || "réponse vide");
      window.GTQC = d.donnees;
    } finally { clearTimeout(minuteur); }
  };

  let secours = false;
  // Petit avis en bas de l'écran : les données viennent de la copie du site, pas du classeur
  const avisSecours = () => {
    const p = document.createElement("p");
    p.className = "offline"; p.setAttribute("role", "status");
    p.innerHTML = `<span><b>Données hors ligne.</b> Le classement et les résultats peuvent dater un peu.</span>
      <button type="button">Réessayer</button><button type="button" class="x" aria-label="Fermer l'avis">×</button>`;
    p.querySelector("button").addEventListener("click", () => location.reload());
    p.querySelector(".x").addEventListener("click", () => p.remove());
    document.body.appendChild(p);
  };
  const erreurPage = () => {
    const main = document.querySelector("main") || document.body;
    main.innerHTML = `<div class="load-error" role="alert"><b>La page n'a pas pu se charger.</b>
      Vérifie ta connexion, puis réessaie.<br><button type="button" class="pill-btn">Réessayer</button></div>`;
    main.querySelector("button").addEventListener("click", () => location.reload());
  };

  depuisApi()
    .catch(err => {
      if (API) { console.warn("API GTQC indisponible, données du dépôt :", err.message); secours = true; }
      return charger("data.js");
    })
    .then(() => scripts.reduce((p, src) => p.then(() => charger(src)), Promise.resolve()))
    .then(() => { if (secours) avisSecours(); })
    .catch(err => { console.error("Chargement de la page :", err); erreurPage(); })
    // La page apparaît d'un coup (fondu) une fois remplie, même en cas d'erreur
    .finally(() => document.body.classList.add("pret"));
})();
