/* GTQC – page Courses (calquée sur redbullracing.com/races). Les calculs sont dans commun.js. */
(() => {
  const G = window.GT, D = G.D, { $, esc } = G;
  let season = G.current, sel = 0, mode = "pilotes", showAll = false, picked = null;

  // ---------- Saisons
  function renderSeasons() {
    $("seasonSwitch").innerHTML = G.seasons.map(s => `<button type="button" role="tab" aria-selected="${s.saison_id === season}" data-s="${s.saison_id}">${esc(s.nom)}</button>`).join("");
  }
  $("seasonSwitch").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    season = b.dataset.s; mode = "pilotes"; showAll = false; picked = null; renderAll();
  });

  // ---------- Rail de dates (vertical, centré sur la manche choisie)
  const STEP = 104;
  const mobile = () => matchMedia("(max-width: 860px)").matches;
  function renderRail() {
    $("rail").innerHTML = G.rounds(season).map((m, i) => {
      const d = G.asDate(m.date);
      return `<li data-i="${i}" class="${m.type !== "Course" && m.type !== "Finale" ? "special" : ""}"><button type="button" aria-label="${esc(G.label(m))}, ${esc(G.circ(m).nom)}">
        <span class="d">${String(d.getDate()).padStart(2, "0")}</span>
        <span class="m">${G.flag(G.circ(m).code_pays)} ${esc(G.fmtMon.format(d).replace(".", ""))}</span></button></li>`;
    }).join("");
    placeRail();
  }
  function placeRail() {
    [...$("rail").children].forEach(li => {
      const dist = +li.dataset.i - sel, a = Math.abs(dist);
      li.classList.toggle("on", dist === 0);
      if (mobile()) { li.style.transform = li.style.opacity = li.style.pointerEvents = ""; return; }
      li.style.transform = `translateY(calc(-50% + ${dist * STEP}px))`;
      li.style.opacity = [1, .5, .25, .1][a] ?? 0;
      li.style.pointerEvents = a > 3 ? "none" : "";
    });
    if (mobile()) { const on = $("rail").querySelector(".on"); on && on.scrollIntoView({ inline: "center", block: "nearest" }); }
  }
  const go = i => { sel = Math.max(0, Math.min(G.rounds(season).length - 1, i)); placeRail(); renderEvent(); };
  $("rail").addEventListener("click", e => { const li = e.target.closest("li"); if (li) go(+li.dataset.i); });
  $("railUp").addEventListener("click", () => go(sel - 1));
  $("railDown").addEventListener("click", () => go(sel + 1));
  let wheelLock = 0;
  document.querySelector(".rail-wrap").addEventListener("wheel", e => {
    if (mobile()) return;
    e.preventDefault();
    const t = Date.now(); if (t - wheelLock < 280) return; wheelLock = t;
    go(sel + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  document.addEventListener("keydown", e => {
    if (!$("drawer").hidden && e.key === "Escape") return closeDrawer();
    if (document.activeElement && document.activeElement.closest(".rail-wrap")) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); go(sel + 1); }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); go(sel - 1); }
    }
  });

  // ---------- Manche en vedette
  let timer;
  function renderEvent() {
    const m = G.rounds(season)[sel], c = G.circ(m), res = G.results(m.course_id), nxt = G.nextRound(season);
    const over = res.length > 0 || G.isPast(m);
    const seasonImg = (D.Saisons.find(s => s.saison_id === season) || {}).image;
    // Photo recadrée sans texte (outils/photos_manches.py) quand elle existe, sinon l'image de la saison
    const bg = m.image && /^manches\//.test(m.image) ? m.image.replace("manches/", "manches/photo/") : (m.image || seasonImg);
    $("heroBg").style.backgroundImage = bg ? `url("${G.IMG + bg}")` : "";
    let extra = "";
    if (res.length) {
      const cats = [...new Set(res.map(r => r.categorie_id || ""))];
      extra = `<div class="winners">${cats.map(cat => {
        const w = res.filter(r => (r.categorie_id || "") === cat).sort((a, b) => (a.position || 99) - (b.position || 99) || b.points - a.points)[0];
        return `<div><small>Vainqueur${cat ? " " + esc(cat) : ""}</small><strong>${esc(G.name(w.pilote_id))}</strong></div>`;
      }).join("")}</div>`;
    } else if (!over && m.type !== "Tryout") extra = `<div class="count" id="count" aria-label="Compte à rebours"></div>`;
    const badge = res.length || (over && m.type === "Tryout") ? `<span class="badge">Terminée</span>`
      : over ? `<span class="badge">Résultats à venir</span>`
      : nxt && nxt.course_id === m.course_id ? `<span class="badge next">Prochaine course</span>` : `<span class="badge">À venir</span>`;
    const src = G.traceSrc(m);
    $("event").innerHTML = `
      ${src ? `<img class="trace" src="${src}" alt="" onerror="this.classList.add('missing')">` : ""}
      <div class="badges"><span class="badge">${esc(G.label(m))}</span>${badge}</div>
      <h1>${esc(c.nom || m.circuit_id)}</h1>
      <div class="where">${G.flag(c.code_pays)} ${esc(c.layout && c.layout !== "Complet" ? c.layout : c.pays || "")}</div>
      <div class="when">${esc(G.fmtLong.format(G.asDate(m.date)))}${m.date_fin ? " au " + esc(G.fmtLong.format(G.asDate(m.date_fin))) : ""}${m.type !== "Tryout" ? " · " + esc(G.hm(G.startOf(m))) : ""}</div>
      ${extra}
      <div class="ctas"><button class="pill-btn" type="button" id="openDrawer">${res.length ? "Voir les résultats" : "Voir la manche"}</button>
      ${G.cfg.twitch_url ? `<a class="pill-btn ghost" href="${esc(G.cfg.twitch_url)}" target="_blank" rel="noopener">${over ? "Revoir sur Twitch" : "Regarder sur Twitch"}</a>` : ""}</div>`;
    $("openDrawer").addEventListener("click", openDrawer);
    clearInterval(timer);
    if ($("count")) {
      const target = G.asDate(m.date, G.startOf(m));
      const tick = () => {
        const s = Math.max(0, Math.floor((target - new Date()) / 1000));
        $("count").innerHTML = [["jours", s / 86400], ["heures", s % 86400 / 3600], ["min", s % 3600 / 60], ["sec", s % 60]]
          .map(([l, v]) => `<div><b>${String(Math.floor(v)).padStart(2, "0")}</b><span>${l}</span></div>`).join("");
      };
      tick(); timer = setInterval(tick, 1000);
    }
  }

  // ---------- Fiche de la manche (panneau)
  function openDrawer() {
    const m = G.rounds(season)[sel], c = G.circ(m), g = G.layout(m), src = G.traceSrc(m);
    const stats = [["km", c.longueur_km], ["virages", c.virages], ["m de ligne droite", g.ligne_droite_m]].filter(s => s[1]);
    const kv = [["Voitures", m.groupe_voiture], ["Moment de la journée", [m.heure_du_jour, m.vitesse_temps].filter(Boolean).join(" ")],
      ["Conditions", m.conditions], ["Consommation", m.conso_carburant], ["Usure des pneus", m.usure_pneus],
      ["Arrêt obligatoire", m.arret_pit_min ? m.arret_pit_min + " arrêt" : ""], ["Carburant au départ", m.carburant_initial_l ? m.carburant_initial_l + " L" : ""],
      ["Ravitaillement", m.ravitaillement], ["Temps au stand", m.temps_pit_s ? "≈ " + m.temps_pit_s + " s" : ""]].filter(x => x[1]);
    const cars = D.Voitures.filter(v => v.saison_id === season && v.groupe === m.groupe_voiture).map(v => v.voiture);
    const res = G.results(m.course_id), pen = G.pens(m.course_id);
    const cats = D.Manches_Categories.filter(x => x.course_id === m.course_id);
    const ids = [...new Set([...cats.map(x => x.categorie_id || ""), ...res.map(r => r.categorie_id || "")])];
    const cards = ids.map(cat => {
      const info = cats.find(x => (x.categorie_id || "") === cat) || {};
      const rows = res.filter(r => (r.categorie_id || "") === cat).sort((a, b) => (a.position || 99) - (b.position || 99) || b.points - a.points);
      const meta = [info.tours ? info.tours + " tours" : info.duree, info.heure_depart ? "départ " + G.hm(info.heure_depart) : ""].filter(Boolean).join(" · ");
      const pl = pen.filter(x => rows.some(r => r.pilote_id === x.pilote_id));
      return `<div class="card"><h3>${cat ? "Division " + cat.slice(1) : "Résultats"} <small>${esc(meta)}</small></h3>
        ${rows.length ? `<table class="mini">${rows.map((r, i) => `<tr><td>${r.position || i + 1}</td><td><a class="plink" href="pilotes.html#${esc(r.pilote_id)}">${esc(G.name(r.pilote_id))}</a>${G.yes(r.meilleur_tour) ? '<span class="fl">MT</span>' : ""}</td><td>${r.points + (r.points_bonus || 0)}</td></tr>`).join("")}</table>`
          : `<p class="muted">${G.isPast(m) ? "Aucun résultat saisi." : "Résultats après la course."}</p>`}
        ${pl.map(x => `<div class="pen">⚑ ${esc(G.name(x.pilote_id))} : ${esc(x.type === "Points" ? x.points + " pts" : x.type === "Temps" ? "+" + x.secondes + " s" : "avertissement")}</div>`).join("")}</div>`;
    }).join("");
    $("drawerBody").innerHTML = `
      <div class="dr-head"><span class="badge" style="justify-self:start">${esc(G.label(m))}</span><h2 id="drawerTitle">${esc(c.nom)}</h2>
        <div class="where">${G.flag(c.code_pays)} ${esc([c.pays, c.layout].filter(Boolean).join(" · "))}</div>
        <div class="muted">${esc(G.fmtLong.format(G.asDate(m.date)))}</div></div>
      ${src ? `<div class="dr-trace"><img src="${src}" alt="Tracé de ${esc(c.nom)}"></div>` : ""}
      ${stats.length ? `<div class="stats">${stats.map(s => `<div><b>${esc(String(s[1]).replace(".", ","))}</b><span>${s[0]}</span></div>`).join("")}</div>` : ""}
      ${kv.length ? `<dl class="kv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      ${cars.length ? `<p class="muted">Voitures permises : ${cars.map(esc).join(", ")}</p>` : ""}
      ${m.note_publique ? `<p class="muted">${esc(m.note_publique)}</p>` : ""}
      <div class="cards">${cards}</div>`;
    $("drawer").hidden = false;
    document.querySelector(".drawer-close").focus();
  }
  function closeDrawer() { $("drawer").hidden = true; const b = $("openDrawer"); b && b.focus(); }
  $("drawer").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeDrawer(); });

  // ---------- Classement (2 colonnes)
  function renderStandings() {
    const hasTeams = !G.isCurrent(season) && G.official(season, "Equipe").length;
    $("toggle").className = "toggle" + (hasTeams ? "" : " single");
    $("toggle").innerHTML = `<button type="button" class="opt ${mode === "pilotes" ? "on" : ""}" data-m="pilotes">Pilotes</button>
      <button type="button" class="sw" role="switch" aria-checked="${mode === "equipes"}" aria-label="Pilotes ou équipes" data-m="flip"></button>
      <button type="button" class="opt ${mode === "equipes" ? "on" : ""}" data-m="equipes">Équipes</button>`;
    const list = G.standings(season, mode);
    const shown = showAll ? list : list.slice(0, 8);
    $("rows").innerHTML = shown.map((r, i) => {
      const team = mode === "equipes";
      const nm = team ? (G.teams[r.id] || {}).nom || r.id : G.name(r.id);
      const tag = r.tag ? `<span class="div-tag ${r.tag}">${r.tag === "R" ? "Rés." : r.tag}</span>` : "<span></span>";
      const t = G.teamOf(r.id, season);
      const sub = team ? D.Equipe_Membres.filter(x => x.equipe_id === r.id && x.pilote_id).map(x => G.name(x.pilote_id)).join(" · ")
        : G.isCurrent(season) ? (r.tag ? "Division " + r.tag.slice(1) : "") : [t && t.nom, r.note].filter(Boolean).join(" · ");
      const n = team ? `<span class="n">${esc(nm)}</span>` : `<a class="n plink" href="pilotes.html#${esc(r.id)}">${esc(nm)}</a>`;
      return `<li class="${i === 0 ? "lead" : ""}"><span class="p">${esc(r.rank)}</span>${n}${tag}<span class="t">${esc(sub)}</span><span class="pts">${esc(G.num(+r.pts))}</span></li>`;
    }).join("");
    $("moreWrap").hidden = list.length <= 8;
    $("moreWrap").classList.toggle("open", showAll);
    $("moreBtn").textContent = showAll ? "Voir moins" : "Voir plus";
    $("stNote").textContent = G.isCurrent(season)
      ? `Après ${G.pilotRounds(season).length} manches. Les points des divisions 1 et 2 s'additionnent ; les lobbys changent aux 2 manches selon ce classement.`
      : mode === "pilotes" ? "Classement officiel tel qu'annoncé. Le total des pilotes ne compte pas la manche 10." : "Les points des remplaçants comptent pour les équipes.";
  }
  $("toggle").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    mode = b.dataset.m === "flip" ? (mode === "pilotes" ? "equipes" : "pilotes") : b.dataset.m; showAll = false; renderStandings();
  });
  $("moreBtn").addEventListener("click", () => { showAll = !showAll; renderStandings(); if (!showAll) $("classement").scrollIntoView(); });

  // ---------- Résultats : position à l'arrivée de chaque course, ou position au classement général après chaque manche
  let chartMode = "arrivee";
  function finishes() {
    const rs = G.pilotRounds(season), out = {}, cat = {};
    rs.forEach((m, i) => G.results(m.course_id).forEach(r => {
      if (r.position) { (out[r.pilote_id] = out[r.pilote_id] || [])[i] = r.position; (cat[r.pilote_id] = cat[r.pilote_id] || [])[i] = r.categorie_id; }
    }));
    return { rs, out, cat };
  }
  function renderChart() {
    const canFinish = G.isCurrent(season);  // la S1 n'a que des points, pas de positions
    if (!canFinish) chartMode = "classement";
    $("chartMode").innerHTML = canFinish ? [["arrivee", "Arrivée de la course"], ["classement", "Classement général"]]
      .map(([k, l]) => `<button type="button" aria-pressed="${k === chartMode}" data-c="${k}">${l}</button>`).join("") : "";
    $("chartSub").textContent = chartMode === "arrivee"
      ? "Position à l'arrivée dans le lobby du pilote (D1 ou D2) à chaque manche."
      : "Position au classement général (points cumulés) après chaque manche.";
    const ranking = G.positions(season);
    const { rs, out, cat } = chartMode === "arrivee" ? finishes() : { ...ranking, cat: {} };
    const last = rs.length - 1;
    const rk = ranking.out, rl = ranking.rs.length - 1;
    // Liste des pilotes triée par classement général, quel que soit le mode
    const all = Object.keys(rk).filter(id => out[id]).sort((a, b) => (rk[a][rl] || 99) - (rk[b][rl] || 99));
    if (!picked) picked = all.slice(0, 5);
    $("pickerPop").innerHTML = all.map(id => `<label><input type="checkbox" value="${esc(id)}" ${picked.includes(id) ? "checked" : ""}> ${esc(G.name(id))}</label>`).join("");
    const W = 1100, H = 460, L = 40, R = 24, T = 18, B = 46;
    const maxPos = Math.max(5, ...picked.flatMap(id => (out[id] || []).filter(Boolean)));
    const x = i => L + (rs.length <= 1 ? (W - L - R) / 2 : i * (W - L - R) / (rs.length - 1));
    const y = p => T + (p - 1) * (H - T - B) / Math.max(1, maxPos - 1);
    let s = `<g class="g">`;
    const stepY = maxPos > 20 ? 5 : maxPos > 10 ? 2 : 1;
    for (let p = 1; p <= maxPos; p += stepY) s += `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 12}" y="${y(p) + 4}" text-anchor="end">${p}</text>`;
    rs.forEach((m, i) => { s += `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}" stroke-dasharray="2 6"/><text x="${x(i)}" y="${H - 18}" text-anchor="middle">M${m.manche}</text>`; });
    s += `</g>`;
    picked.forEach((id, k) => {
      const col = G.COLORS[k % G.COLORS.length], pts = (out[id] || []).map((p, i) => p ? [x(i), y(p), p, i] : null).filter(Boolean);
      if (!pts.length) return;
      s += `<polyline fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => p[0] + "," + p[1]).join(" ")}"/>`;
      pts.forEach(p => {
        const lob = (cat[id] || [])[p[3]];
        const what = chartMode === "arrivee" ? `${p[2]}e à l'arrivée${lob ? " (" + lob + ")" : ""}` : `${p[2]}e au classement`;
        s += `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${col}"><title>${esc(G.name(id))} · M${rs[p[3]].manche} : ${what}</title></circle>`;
      });
    });
    const c = $("chart");
    c.setAttribute("viewBox", `0 0 ${W} ${H}`);
    c.innerHTML = rs.length ? s : `<text x="20" y="40">Aucune manche terminée.</text>`;
    $("legend").innerHTML = picked.map((id, k) => `<span style="--c:${G.COLORS[k % G.COLORS.length]}"><i></i>${esc(G.name(id))} · ${rk[id] && rk[id][rl] ? rk[id][rl] + "e au classement" : "–"}</span>`).join("");
  }
  $("chartMode").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; chartMode = b.dataset.c; renderChart(); });
  $("pickerBtn").addEventListener("click", () => { const p = $("pickerPop"); p.hidden = !p.hidden; $("pickerBtn").setAttribute("aria-expanded", String(!p.hidden)); });
  document.addEventListener("click", e => { if (!e.target.closest("#picker")) { $("pickerPop").hidden = true; $("pickerBtn").setAttribute("aria-expanded", "false"); } });
  $("pickerPop").addEventListener("change", e => {
    const id = e.target.value;
    picked = e.target.checked ? [...picked, id].slice(-10) : picked.filter(v => v !== id);
    renderChart();
  });

  function renderAll() {
    const rs = G.rounds(season), nxt = G.nextRound(season), last = G.done(season).slice(-1)[0];
    sel = Math.max(0, rs.findIndex(m => m.course_id === (nxt || last || rs[0]).course_id));
    renderSeasons(); renderRail(); renderEvent(); renderStandings(); renderChart();
  }
  G.chrome(); addEventListener("resize", placeRail); renderAll();
})();
