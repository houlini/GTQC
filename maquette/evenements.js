/* GTQC – page Événements : onglet Evenements (publier = TRUE). Le prochain en vedette avec compte à rebours,
   puis la liste à venir et les événements passés. */
(() => {
  const G = window.GT, D = G.D, { $, esc } = G;
  const fmtJour = new Intl.DateTimeFormat("fr-CA", { day: "numeric" });
  const fmtMois = new Intl.DateTimeFormat("fr-CA", { month: "short" });
  const fmtSem = new Intl.DateTimeFormat("fr-CA", { weekday: "long" });
  const evs = D.Evenements.filter(e => G.yes(e.publier) && e.date).sort((a, b) => a.date.localeCompare(b.date));
  const fini = e => e.statut === "Terminé" || G.asDate(e.date, "23:59") < new Date();
  const avenir = evs.filter(e => !fini(e)), passes = evs.filter(fini).reverse();
  const prochain = avenir[0];

  // Course de la ligue la même fin de semaine ? (les événements tombent les dimanches sans course)
  const voisine = e => D.Manches.find(m => G.yes(m.publier) && m.date && Math.abs(G.asDate(m.date) - G.asDate(e.date)) < 2 * 864e5);
  const circuitDe = e => e.circuit_id ? G.circuits[e.circuit_id] : null;
  const statutTxt = e => fini(e) ? "Terminé" : e.statut === "Prévu" ? "Confirmé" : e.statut || "À venir";

  // ---------- En vedette
  let minuteur;
  if (prochain) {
    const c = circuitDe(prochain);
    const trace = c && c.gt7_layout_id ? `${G.IMG}circuits/traces/${c.gt7_layout_id.replace(/-reverse$/, "")}.png` : "";
    const cal = G.cfg.calendrier_google_url;
    $("hero").innerHTML = `
      <div class="ev-hero-bg" aria-hidden="true">${esc(fmtJour.format(G.asDate(prochain.date)))}</div>
      ${trace ? `<img class="trace ev-trace" src="${trace}" alt="">` : ""}
      <div class="ev-hero-in">
        <div class="badges"><span class="badge next">Prochain événement</span><span class="badge">Ouvert à la communauté</span></div>
        <h2>${esc(prochain.titre)}</h2>
        <p class="when">${esc(G.fmtLong.format(G.asDate(prochain.date)))} · ${prochain.heure ? esc(G.hm(prochain.heure)) : "heure à confirmer"}${c ? " · " + esc(c.nom) : ""}</p>
        ${prochain.description ? `<p class="ev-desc">${esc(prochain.description)}</p>` : ""}
        <div class="count" id="evCount" aria-label="Compte à rebours"></div>
        <div class="ctas">${cal ? `<a class="pill-btn" href="${esc(cal)}" target="_blank" rel="noopener">Ajouter au calendrier</a>` : ""}
          ${prochain.lien ? `<a class="pill-btn ghost" href="${esc(prochain.lien)}" target="_blank" rel="noopener">Détails</a>` : `<a class="pill-btn ghost" href="tv.html">Suivre sur GTQC TV</a>`}</div>
      </div>`;
    const cible = G.asDate(prochain.date, prochain.heure || "19:00");
    const tic = () => {
      const s = Math.max(0, Math.floor((cible - new Date()) / 1000));
      $("evCount").innerHTML = [["jours", s / 86400], ["heures", s % 86400 / 3600], ["min", s % 3600 / 60], ["sec", s % 60]]
        .map(([l, v]) => `<div><b>${String(Math.floor(v)).padStart(2, "0")}</b><span>${l}</span></div>`).join("");
    };
    tic(); minuteur = setInterval(tic, 1000);
  } else {
    $("hero").innerHTML = `<div class="ev-hero-in"><div class="badges"><span class="badge">Événements</span></div><h2>Prochain événement bientôt annoncé</h2>
      <p class="when">Suis la ligue sur Facebook et Instagram pour ne rien manquer.</p></div>`;
  }

  // ---------- Listes
  const carte = (e, i) => {
    const d = G.asDate(e.date), m = voisine(e), c = circuitDe(e);
    const info = [fmtSem.format(d), e.heure ? G.hm(e.heure) : "", c && c.nom].filter(Boolean).join(" · ");
    return `<li class="ev-card${e === prochain ? " on" : ""}" style="--i:${i}">
      <div class="ev-date"><b>${esc(fmtJour.format(d))}</b><span>${esc(fmtMois.format(d).replace(".", ""))}</span></div>
      <div class="ev-main"><h3>${esc(e.titre)}</h3><p>${esc(info)}</p>
        ${m && !fini(e) ? `<p class="ev-note">Course de la ligue le ${esc(G.fmtShort.format(G.asDate(m.date)).replace(".", ""))} : ${esc(G.label(m))}</p>` : ""}</div>
      <span class="ev-tag ${fini(e) ? "" : e.statut === "Prévu" ? "ok" : ""}">${esc(statutTxt(e))}</span></li>`;
  };
  $("avenir").innerHTML = avenir.map(carte).join("") || `<li class="muted">Aucun événement annoncé pour l'instant.</li>`;
  $("passes").innerHTML = passes.map(carte).join("") || `<li class="muted">Rien encore.</li>`;
  $("hPasses").parentElement.hidden = !passes.length;

  G.chrome();
})();
