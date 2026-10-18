/* GTQC – charge les données puis les scripts de la page.
   Avec l'API (Worker gtqc-api → Apps Script) : données à jour du Sheet, réglages des prochaines
   manches retirés côté serveur. Sans API (adresse vide, hors ligne ou en panne) : data.js, l'export du dépôt.
   Utilisation : <script src="chargeur.js" data-scripts="commun.js app.js"></script> */
(() => {
  // Adresse de l'API publique, à remplir quand le domaine sera choisi (ex. https://api.gtqc.ca).
  const API = "";
  window.GTQC_API = API;

  const moi = document.currentScript;
  const scripts = (moi.dataset.scripts || "commun.js").split(/\s+/).filter(Boolean);
  const charger = src => new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => ko(new Error(src));
    document.body.appendChild(s);
  });
  const depuisApi = async () => {
    if (!API) throw new Error("pas d'API");
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), 5000);
    try {
      const rep = await fetch(API + "/donnees", { signal: ctrl.signal });
      const d = await rep.json();
      if (!d.ok || !d.donnees) throw new Error(d.erreur || "réponse vide");
      window.GTQC = d.donnees;
    } finally { clearTimeout(minuteur); }
  };

  depuisApi()
    .catch(err => { if (API) console.warn("API GTQC indisponible, données du dépôt :", err.message); return charger("data.js"); })
    .then(() => scripts.reduce((p, src) => p.then(() => charger(src)), Promise.resolve()))
    .catch(err => console.error("Chargement de la page :", err));
})();
