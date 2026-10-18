/* GTQC – page Événements : onglet Evenements (publier = TRUE). Le prochain en vedette (compte à rebours),
   puis des cartes à venir et passées. Chaque événement a une ambiance (colonne theme, sinon devinée d'après le
   titre : rallye, glace, Brésil) et le tracé de son circuit (circuit_id : onglet Circuits ou Circuits_GT7). */
(() => {
  const G = window.GT, D = G.D, { $, esc } = G;
  const fmtJour = new Intl.DateTimeFormat("fr-CA", { day: "numeric" });
  const fmtMois = new Intl.DateTimeFormat("fr-CA", { month: "short" });
  const evs = D.Evenements.filter(e => G.yes(e.publier) && e.date).sort((a, b) => a.date.localeCompare(b.date));
  const fini = e => e.statut === "Terminé" || G.asDate(e.date, "23:59") < new Date();
  const avenir = evs.filter(e => !fini(e)), passes = evs.filter(fini).reverse();
  const prochain = avenir[0];

  const THEMES = { glace: "Sur glace", terre: "Rallye", bresil: "Formule 1", kart: "Karting", proto: "Endurance", ligue: "Communauté" };
  const theme = e => e.theme && THEMES[e.theme] ? e.theme
    : /glace|ice|neige|snow/i.test(e.titre) ? "glace" : /rall|terre|dirt|gravel/i.test(e.titre) ? "terre"
    : /f1|br[ée]sil|brazil|interlagos/i.test(e.titre) ? "bresil" : /kart/i.test(e.titre) ? "kart"
    : /hypercar|endurance|lmh|prototype/i.test(e.titre + " " + (e.voitures || "")) ? "proto" : "ligue";
  // Photo du bandeau : celle de l'événement (colonne image), sinon la Porsche GTQC au stand
  const PHOTO_DEFAUT = "evenements/gtqc-porsche-stand.jpg";
  const circuitDe = e => {
    if (!e.circuit_id) return null;
    const c = G.circuits[e.circuit_id];
    if (c) return { nom: c.nom, layout: c.gt7_layout_id };
    const g = G.gt7[e.circuit_id];
    return g ? { nom: g.nom_officiel, layout: g.layout_id } : null;
  };
  const traceDe = e => { const c = circuitDe(e); return c && c.layout ? `${G.IMG}circuits/traces/${c.layout.replace(/-reverse$/, "")}.png` : ""; };
  const statutTxt = e => fini(e) ? "Terminé" : e.statut === "Prévu" ? "Confirmé" : e.statut || "À venir";
  const quand = e => [G.fmtLong.format(G.asDate(e.date)), e.heure ? G.hm(e.heure) : "heure à confirmer"].join(" · ");

  // ---------- En vedette
  if (prochain) {
    const c = circuitDe(prochain), tr = traceDe(prochain), cal = G.cfg.calendrier_google_url;
    $("hero").className = "ev-hero th-" + theme(prochain);
    $("hero").innerHTML = `
      <div class="ev-photo" aria-hidden="true" style="background-image:url('${G.IMG + esc(prochain.image || PHOTO_DEFAUT)}')"></div>
      <div class="ev-hero-in">
        <div class="ev-badges"><span class="badge next">Prochain événement</span><span class="badge">${esc(THEMES[theme(prochain)])}</span></div>
        <h2>${esc(prochain.titre)}</h2>
        <p class="ev-when">${esc(quand(prochain))}</p>
        ${c ? `<p class="ev-where">${esc(c.nom)}</p>` : ""}
        ${prochain.description ? `<p class="ev-desc">${esc(prochain.description)}</p>` : ""}
        <div class="ev-count" id="evCount" aria-label="Compte à rebours"></div>
        <div class="ctas">${cal ? `<a class="pill-btn" href="${esc(cal)}" target="_blank" rel="noopener">Ajouter au calendrier</a>` : ""}
          ${prochain.lien ? `<a class="pill-btn ghost" href="${esc(prochain.lien)}" target="_blank" rel="noopener">Détails</a>` : `<a class="pill-btn ghost" href="tv.html">Suivre sur GTQC TV</a>`}</div>
      </div>
      ${tr ? `<div class="ev-visual" aria-hidden="true"><div class="ev-plate"><img class="ev-trace" src="${tr}" alt="" onerror="this.closest('.ev-visual').remove()">
        ${c ? `<span>${esc(c.nom)}</span>` : ""}</div></div>` : ""}`;
    const cible = G.asDate(prochain.date, prochain.heure || "19:00");
    const tic = () => {
      const s = Math.max(0, Math.floor((cible - new Date()) / 1000));
      $("evCount").innerHTML = [["jours", s / 86400], ["heures", s % 86400 / 3600], ["min", s % 3600 / 60], ["sec", s % 60]]
        .map(([l, v]) => `<div><b>${String(Math.floor(v)).padStart(2, "0")}</b><span>${l}</span></div>`).join("");
    };
    tic(); setInterval(tic, 1000);
  } else {
    $("hero").className = "ev-hero th-ligue";
    $("hero").innerHTML = `<div class="ev-photo" aria-hidden="true" style="background-image:url('${G.IMG + PHOTO_DEFAUT}')"></div><div class="ev-hero-in"><div class="ev-badges"><span class="badge">Événements</span></div><h2>Prochain événement bientôt annoncé</h2>
      <p class="ev-when">Suis la ligue sur Facebook et Instagram pour ne rien manquer.</p></div>`;
  }

  // ---------- Cartes
  const carte = (e, i) => {
    const d = G.asDate(e.date), c = circuitDe(e), tr = traceDe(e);
    return `<li class="ev-card th-${theme(e)}${e === prochain ? " on" : ""}" style="--i:${i}">
      <div class="ev-card-top">
        <span class="ev-chip"><b>${esc(fmtJour.format(d))}</b>${esc(fmtMois.format(d).replace(".", ""))}</span>
        <span class="ev-kind">${esc(THEMES[theme(e)])}</span>
        ${e.image ? `<img class="ev-cover" src="${G.IMG + esc(e.image)}" alt="Affiche : ${esc(e.titre)}" loading="lazy">`
          : tr ? `<img src="${tr}" alt="" loading="lazy" onerror="this.remove()">` : ""}
      </div>
      <div class="ev-card-body">
        <h3>${esc(e.titre)}</h3>
        <p>${esc(quand(e))}${c ? "<br>" + esc(c.nom) : ""}</p>
        <span class="ev-tag ${fini(e) ? "" : e.statut === "Prévu" ? "ok" : ""}">${esc(statutTxt(e))}</span>
      </div></li>`;
  };
  $("avenir").innerHTML = avenir.map(carte).join("") || `<li class="muted">Aucun événement annoncé pour l'instant.</li>`;
  $("passes").innerHTML = passes.map(carte).join("");
  $("hPasses").parentElement.hidden = !passes.length;

  G.chrome();
})();
