/* GTQC – maquette de la page Courses (calquée sur redbullracing.com/races).
   Données : data.js (export du Google Sheet). Le vrai site lira les CSV publiés du Sheet. */
(() => {
  const D = window.GTQC;
  const IMG = /\/maquette\//.test(location.pathname) || location.protocol === "file:" ? "../assets/img/" : "assets/img/";
  const yes = v => v === true || v === "TRUE";
  const cfg = Object.fromEntries(D.Config.map(r => [r.cle, r.valeur]));
  const idx = (rows, k) => Object.fromEntries(rows.map(r => [r[k], r]));
  const circuits = idx(D.Circuits, "circuit_id");
  const gt7 = idx(D.Circuits_GT7, "layout_id");
  const pilots = idx(D.Pilotes, "pilote_id");
  const teams = idx(D.Equipe, "equipe_id");
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const name = id => (pilots[id] && pilots[id].pseudo) || id;
  const now = new Date();
  const asDate = (d, h = "12:00") => new Date(`${d}T${String(h).replace("~", "")}:00`);
  const fmtLong = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fmtMon = new Intl.DateTimeFormat("fr-CA", { month: "short" });
  const COLORS = ["#E6FF00", "#3D7BFF", "#3DDC97", "#FF8A3D", "#FF5FA2", "#A98BFF", "#5CE1E6", "#FFFFFF", "#FFD166", "#8BC34A"];

  // ---------- Drapeaux simplifiés (SVG), pour ne pas dépendre des emojis
  const FLAGS = {
    IT: '<rect width="3" height="2" fill="#fff"/><rect width="1" height="2" fill="#009246"/><rect x="2" width="1" height="2" fill="#CE2B37"/>',
    FR: '<rect width="3" height="2" fill="#fff"/><rect width="1" height="2" fill="#0055A4"/><rect x="2" width="1" height="2" fill="#EF4135"/>',
    BE: '<rect width="1" height="2" fill="#000"/><rect x="1" width="1" height="2" fill="#FAE042"/><rect x="2" width="1" height="2" fill="#ED2939"/>',
    DE: '<rect width="3" height=".67" fill="#000"/><rect y=".67" width="3" height=".67" fill="#DD0000"/><rect y="1.33" width="3" height=".67" fill="#FFCE00"/>',
    AT: '<rect width="3" height="2" fill="#ED2939"/><rect y=".67" width="3" height=".67" fill="#fff"/>',
    HR: '<rect width="3" height=".67" fill="#FF0000"/><rect y=".67" width="3" height=".67" fill="#fff"/><rect y="1.33" width="3" height=".67" fill="#171796"/><rect x="1.2" y=".5" width=".6" height=".8" fill="#FF0000"/>',
    ES: '<rect width="3" height="2" fill="#AA151B"/><rect y=".5" width="3" height="1" fill="#F1BF00"/>',
    JP: '<rect width="3" height="2" fill="#fff"/><circle cx="1.5" cy="1" r=".6" fill="#BC002D"/>',
    CH: '<rect width="3" height="2" fill="#D52B1E"/><rect x="1.3" y=".45" width=".4" height="1.1" fill="#fff"/><rect x=".95" y=".8" width="1.1" height=".4" fill="#fff"/>',
    CA: '<rect width="3" height="2" fill="#fff"/><rect width=".75" height="2" fill="#D80621"/><rect x="2.25" width=".75" height="2" fill="#D80621"/><path d="M1.5 .45l.15.35.3-.1-.1.4.2.1-.35.25.05.3h-.5l.05-.3-.35-.25.2-.1-.1-.4.3.1z" fill="#D80621"/>',
    US: '<rect width="3" height="2" fill="#fff"/>' + [0, 2, 4, 6, 8, 10, 12].map(i => `<rect y="${i * 2 / 13}" width="3" height="${2 / 13}" fill="#B22234"/>`).join("") + '<rect width="1.3" height="1.08" fill="#3C3B6E"/>',
    AE: '<rect width="3" height=".67" fill="#00732F"/><rect y=".67" width="3" height=".67" fill="#fff"/><rect y="1.33" width="3" height=".67" fill="#000"/><rect width=".75" height="2" fill="#FF0000"/>',
    GB: '<rect width="3" height="2" fill="#012169"/><path d="M0 0L3 2M3 0L0 2" stroke="#fff" stroke-width=".4"/><path d="M0 0L3 2M3 0L0 2" stroke="#C8102E" stroke-width=".15"/><rect x="1.25" width=".5" height="2" fill="#fff"/><rect y=".75" width="3" height=".5" fill="#fff"/><rect x="1.35" width=".3" height="2" fill="#C8102E"/><rect y=".85" width="3" height=".3" fill="#C8102E"/>',
    AU: '<rect width="3" height="2" fill="#012169"/><rect width="1.5" height="1" fill="#012169"/><path d="M0 0L1.5 1M1.5 0L0 1" stroke="#fff" stroke-width=".2"/><rect x=".65" width=".2" height="1" fill="#fff"/><rect y=".4" width="1.5" height=".2" fill="#fff"/><rect x=".7" width=".1" height="1" fill="#C8102E"/><rect y=".45" width="1.5" height=".1" fill="#C8102E"/><circle cx="2.2" cy="1.3" r=".15" fill="#fff"/><circle cx=".75" cy="1.5" r=".2" fill="#fff"/>',
    BR: '<rect width="3" height="2" fill="#009C3B"/><path d="M1.5 .2L2.7 1 1.5 1.8.3 1z" fill="#FFDF00"/><circle cx="1.5" cy="1" r=".42" fill="#002776"/>',
  };
  const flag = cc => FLAGS[cc] ? `<svg class="flag" viewBox="0 0 3 2" preserveAspectRatio="none" aria-label="${esc(cc)}">${FLAGS[cc]}</svg>` : "";

  // ---------- Données de saison
  const seasons = D.Saisons.filter(s => yes(s.publier)).sort((a, b) => b.saison_id.localeCompare(a.saison_id));
  let season = cfg.saison_courante || seasons[0].saison_id;
  let sel = 0, mode = "pilotes", showAll = false, picked = null;
  const isCurrent = () => season === cfg.saison_courante;
  const rounds = () => D.Manches.filter(m => m.saison_id === season && yes(m.publier)).sort((a, b) => a.manche - b.manche);
  const counted = () => rounds().filter(m => m.type === "Course" || m.type === "Finale");
  const results = cid => D.Resultats.filter(r => r.course_id === cid);
  const pens = cid => D.Penalites.filter(p => p.course_id === cid && yes(p.publier));
  const isPast = m => asDate(m.date_fin || m.date, "23:59") < now;
  const nextRound = () => counted().find(m => !isPast(m));
  const circ = m => circuits[m.circuit_id] || {};
  const layout = m => gt7[circ(m).gt7_layout_id] || {};
  const traceSrc = m => circ(m).gt7_layout_id ? `${IMG}circuits/traces/${circ(m).gt7_layout_id.replace(/-reverse$/, "")}.png` : "";
  const startOf = (m, cat = "D2") => (D.Manches_Categories.find(x => x.course_id === m.course_id && x.categorie_id === cat) || {}).heure_depart || m.heure || "19:00";
  const label = m => m.type === "Tryout" ? "Tryouts" : m.type === "Spéciale" ? "Course ouverte au public" : m.type === "Finale" ? `Manche ${m.manche} · Finale` : `Manche ${m.manche}`;
  const hm = h => String(h).replace(":", " h ");

  function totalsAfter(list) {
    const tot = {};
    for (const m of list) {
      for (const r of results(m.course_id)) tot[r.pilote_id] = (tot[r.pilote_id] || 0) + (r.points || 0) + (r.points_bonus || 0);
      for (const p of pens(m.course_id)) if (typeof p.points === "number") tot[p.pilote_id] = (tot[p.pilote_id] || 0) + p.points;
    }
    return tot;
  }
  function lastLobby(id) {
    let c = "";
    for (const m of counted()) for (const r of results(m.course_id)) if (r.pilote_id === id && r.categorie_id) c = r.categorie_id;
    return c;
  }
  function standings() {
    if (!isCurrent()) {
      return D.Classement_Final.filter(r => r.saison_id === season && r.type === (mode === "pilotes" ? "Pilote" : "Equipe"))
        .map(r => ({ id: r.id, rank: String(r.rang), pts: r.total_officiel, tag: r.role === "Réserve" ? "R" : "", note: r.note || "" }));
    }
    const tot = totalsAfter(counted().filter(isPast));
    const list = Object.entries(tot).map(([id, pts]) => ({ id, pts: Math.round(pts * 10) / 10, tag: lastLobby(id) })).sort((a, b) => b.pts - a.pts);
    list.forEach((r, i) => { r.rank = i && list[i - 1].pts === r.pts ? list[i - 1].rank : String(i + 1); });
    return list;
  }

  // ---------- Saisons
  function renderSeasons() {
    $("seasonSwitch").innerHTML = seasons.map(s => `<button type="button" role="tab" aria-selected="${s.saison_id === season}" data-s="${s.saison_id}">${esc(s.nom)}</button>`).join("");
  }
  $("seasonSwitch").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    season = b.dataset.s; mode = "pilotes"; showAll = false; picked = null; pickDefault(); renderAll();
  });

  // ---------- Rail de dates (vertical, centré sur la manche choisie)
  const STEP = 104;
  function renderRail() {
    const rs = rounds();
    $("rail").innerHTML = rs.map((m, i) => {
      const d = asDate(m.date);
      return `<li data-i="${i}" class="${m.type !== "Course" && m.type !== "Finale" ? "special" : ""}"><button type="button" aria-label="${esc(label(m))}, ${esc(circ(m).nom)}">
        <span class="d">${String(d.getDate()).padStart(2, "0")}</span>
        <span class="m">${flag(circ(m).code_pays)} ${esc(fmtMon.format(d).replace(".", ""))}</span></button></li>`;
    }).join("");
    placeRail();
  }
  function placeRail() {
    const mobile = matchMedia("(max-width: 860px)").matches;
    [...$("rail").children].forEach(li => {
      const i = +li.dataset.i, dist = i - sel, a = Math.abs(dist);
      li.classList.toggle("on", dist === 0);
      if (mobile) { li.style.transform = ""; li.style.opacity = ""; li.style.pointerEvents = ""; return; }
      li.style.transform = `translateY(calc(-50% + ${dist * STEP}px))`;
      li.style.opacity = a === 0 ? 1 : a === 1 ? .5 : a === 2 ? .25 : a === 3 ? .1 : 0;
      li.style.pointerEvents = a > 3 ? "none" : "";
    });
    if (mobile) { const on = $("rail").querySelector(".on"); on && on.scrollIntoView({ inline: "center", block: "nearest" }); }
  }
  const go = i => { const n = rounds().length; sel = Math.max(0, Math.min(n - 1, i)); placeRail(); renderEvent(); };
  $("rail").addEventListener("click", e => { const li = e.target.closest("li"); if (li) go(+li.dataset.i); });
  $("railUp").addEventListener("click", () => go(sel - 1));
  $("railDown").addEventListener("click", () => go(sel + 1));
  let wheelLock = 0;
  document.querySelector(".rail-wrap").addEventListener("wheel", e => {
    if (matchMedia("(max-width: 860px)").matches) return;
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
    const m = rounds()[sel], c = circ(m), past = isPast(m), nxt = nextRound();
    const seasonImg = (D.Saisons.find(s => s.saison_id === season) || {}).image;
    // Photo recadrée sans texte (outils/photos_manches.py) quand elle existe, sinon la vignette ou l'image de la saison
    const bg = m.image && /^manches\//.test(m.image) ? m.image.replace("manches/", "manches/photo/") : (m.image || seasonImg);
    $("heroBg").style.backgroundImage = bg ? `url("${IMG + bg}")` : "";
    let extra = "";
    if (past) {
      const res = results(m.course_id);
      const cats = [...new Set(res.map(r => r.categorie_id || ""))];
      extra = res.length ? `<div class="winners">${cats.map(cat => {
        const w = res.filter(r => (r.categorie_id || "") === cat).sort((a, b) => (a.position || 99) - (b.position || 99) || b.points - a.points)[0];
        return `<div><small>Vainqueur${cat ? " " + esc(cat) : ""}</small><strong>${esc(name(w.pilote_id))}</strong></div>`;
      }).join("")}</div>` : "";
    } else if (m.type !== "Tryout") extra = `<div class="count" id="count" aria-label="Compte à rebours"></div>`;
    const badge = past ? `<span class="badge">Terminée</span>` : nxt && nxt.course_id === m.course_id ? `<span class="badge next">Prochaine course</span>` : `<span class="badge">À venir</span>`;
    const src = traceSrc(m);
    $("event").innerHTML = `
      ${src ? `<img class="trace" src="${src}" alt="" onerror="this.classList.add('missing')">` : ""}
      <div class="badges"><span class="badge">${esc(label(m))}</span>${badge}</div>
      <h1>${esc(c.nom || m.circuit_id)}</h1>
      <div class="where">${flag(c.code_pays)} ${esc(c.layout && c.layout !== "Complet" ? c.layout : c.pays || "")}</div>
      <div class="when">${esc(fmtLong.format(asDate(m.date)))}${m.date_fin ? " au " + esc(fmtLong.format(asDate(m.date_fin))) : ""}${m.type !== "Tryout" ? " · " + esc(hm(startOf(m))) : ""}</div>
      ${extra}
      <div class="ctas"><button class="pill-btn" type="button" id="openDrawer">${past ? "Voir les résultats" : "Voir la manche"}</button>
      ${cfg.twitch_url ? `<a class="pill-btn ghost" href="${esc(cfg.twitch_url)}" target="_blank" rel="noopener">${past ? "Revoir sur Twitch" : "Regarder sur Twitch"}</a>` : ""}</div>`;
    $("openDrawer").addEventListener("click", openDrawer);
    clearInterval(timer);
    if ($("count")) {
      const target = asDate(m.date, startOf(m));
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
    const m = rounds()[sel], c = circ(m), g = layout(m), src = traceSrc(m);
    const stats = [["km", c.longueur_km], ["virages", c.virages], ["m de ligne droite", g.ligne_droite_m]].filter(s => s[1]);
    const kv = [["Voitures", m.groupe_voiture], ["Moment de la journée", [m.heure_du_jour, m.vitesse_temps].filter(Boolean).join(" ")],
      ["Conditions", m.conditions], ["Consommation", m.conso_carburant], ["Usure des pneus", m.usure_pneus],
      ["Arrêt obligatoire", m.arret_pit_min ? m.arret_pit_min + " arrêt" : ""], ["Carburant au départ", m.carburant_initial_l ? m.carburant_initial_l + " L" : ""],
      ["Ravitaillement", m.ravitaillement], ["Temps au stand", m.temps_pit_s ? "≈ " + m.temps_pit_s + " s" : ""]].filter(x => x[1]);
    const cars = D.Voitures.filter(v => v.saison_id === season && v.groupe === m.groupe_voiture).map(v => v.voiture);
    const res = results(m.course_id), pen = pens(m.course_id);
    const cats = D.Manches_Categories.filter(x => x.course_id === m.course_id);
    const ids = [...new Set([...cats.map(x => x.categorie_id || ""), ...res.map(r => r.categorie_id || "")])];
    const cards = ids.map(cat => {
      const info = cats.find(x => (x.categorie_id || "") === cat) || {};
      const rows = res.filter(r => (r.categorie_id || "") === cat).sort((a, b) => (a.position || 99) - (b.position || 99) || b.points - a.points);
      const meta = [info.tours ? info.tours + " tours" : info.duree, info.heure_depart ? "départ " + hm(info.heure_depart) : ""].filter(Boolean).join(" · ");
      const pl = pen.filter(x => rows.some(r => r.pilote_id === x.pilote_id));
      return `<div class="card"><h3>${cat ? "Division " + cat.slice(1) : "Résultats"} <small>${esc(meta)}</small></h3>
        ${rows.length ? `<table class="mini">${rows.map((r, i) => `<tr><td>${r.position || i + 1}</td><td>${esc(name(r.pilote_id))}${yes(r.meilleur_tour) ? '<span class="fl">MT</span>' : ""}</td><td>${r.points + (r.points_bonus || 0)}</td></tr>`).join("")}</table>`
          : `<p class="muted">${isPast(m) ? "Aucun résultat saisi." : "Résultats après la course."}</p>`}
        ${pl.map(x => `<div class="pen">⚑ ${esc(name(x.pilote_id))} : ${esc(x.type === "Points" ? x.points + " pts" : x.type === "Temps" ? "+" + x.secondes + " s" : "avertissement")}</div>`).join("")}</div>`;
    }).join("");
    $("drawerBody").innerHTML = `
      <div class="dr-head"><span class="badge" style="justify-self:start">${esc(label(m))}</span><h2 id="drawerTitle">${esc(c.nom)}</h2>
        <div class="where">${flag(c.code_pays)} ${esc([c.pays, c.layout].filter(Boolean).join(" · "))}</div>
        <div class="muted">${esc(fmtLong.format(asDate(m.date)))}</div></div>
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
    const hasTeams = D.Classement_Final.some(r => r.saison_id === season && r.type === "Equipe") && !isCurrent();
    $("toggle").className = "toggle" + (hasTeams ? "" : " single");
    $("toggle").innerHTML = `<button type="button" class="opt ${mode === "pilotes" ? "on" : ""}" data-m="pilotes">Pilotes</button>
      <button type="button" class="sw" role="switch" aria-checked="${mode === "equipes"}" aria-label="Pilotes ou équipes" data-m="flip"></button>
      <button type="button" class="opt ${mode === "equipes" ? "on" : ""}" data-m="equipes">Équipes</button>`;
    const list = standings();
    const shown = showAll ? list : list.slice(0, 8);
    const teamOf = id => { const t = (D.Engagements.find(e => e.saison_id === season && e.pilote_id === id) || {}).equipe_id; return t && teams[t] ? teams[t].nom : ""; };
    $("rows").innerHTML = shown.map((r, i) => {
      const nm = mode === "equipes" ? (teams[r.id] || {}).nom || r.id : name(r.id);
      const tag = r.tag ? `<span class="div-tag ${r.tag}">${r.tag === "R" ? "Rés." : r.tag}</span>` : "<span></span>";
      const sub = mode === "equipes"
        ? D.Equipe_Membres.filter(x => x.equipe_id === r.id && x.pilote_id).map(x => name(x.pilote_id)).join(" · ")
        : isCurrent() ? (r.tag ? "Division " + r.tag.slice(1) : "") : [teamOf(r.id), r.note].filter(Boolean).join(" · ");
      return `<li class="${i === 0 ? "lead" : ""}"><span class="p">${esc(r.rank)}</span><span class="n">${esc(nm)}</span>${tag}<span class="t">${esc(sub)}</span><span class="pts">${esc(String(r.pts).replace(".", ","))}</span></li>`;
    }).join("");
    $("moreWrap").hidden = list.length <= 8;
    $("moreWrap").classList.toggle("open", showAll);
    $("moreBtn").textContent = showAll ? "Voir moins" : "Voir plus";
    $("stNote").textContent = isCurrent()
      ? `Après ${counted().filter(isPast).length} manches. Les points des divisions 1 et 2 s'additionnent ; les lobbys changent aux 2 manches selon ce classement.`
      : mode === "pilotes" ? "Classement officiel tel qu'annoncé. Le total des pilotes ne compte pas la manche 10." : "Les points des remplaçants comptent pour les équipes.";
  }
  $("toggle").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    mode = b.dataset.m === "flip" ? (mode === "pilotes" ? "equipes" : "pilotes") : b.dataset.m; showAll = false; renderStandings();
  });
  $("moreBtn").addEventListener("click", () => { showAll = !showAll; renderStandings(); if (!showAll) $("classement").scrollIntoView(); });

  // ---------- Résultats : position au classement après chaque manche
  function positionsSeries() {
    const rs = counted().filter(isPast), out = {};
    rs.forEach((m, i) => {
      const tot = totalsAfter(rs.slice(0, i + 1));
      const order = Object.entries(tot).sort((a, b) => b[1] - a[1]);
      order.forEach(([id], k) => { (out[id] = out[id] || [])[i] = k + 1; });
    });
    return { rs, out };
  }
  function pickDefault() {
    const base = isCurrent() ? standings() : D.Classement_Final.filter(r => r.saison_id === season && r.type === "Pilote" && /^\d+$/.test(r.rang)).map(r => ({ id: r.id }));
    picked = base.slice(0, 5).map(r => r.id);
  }
  function renderChart() {
    const { rs, out } = positionsSeries();
    const all = Object.keys(out).sort((a, b) => (out[a][rs.length - 1] || 99) - (out[b][rs.length - 1] || 99));
    $("pickerPop").innerHTML = all.map(id => `<label><input type="checkbox" value="${esc(id)}" ${picked.includes(id) ? "checked" : ""}> ${esc(name(id))}</label>`).join("");
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
      const col = COLORS[k % COLORS.length], pts = (out[id] || []).map((p, i) => p ? [x(i), y(p), p, i] : null).filter(Boolean);
      if (!pts.length) return;
      s += `<polyline fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => p[0] + "," + p[1]).join(" ")}"/>`;
      pts.forEach(p => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${col}"><title>${esc(name(id))} · M${rs[p[3]].manche} : ${p[2]}e</title></circle>`; });
    });
    const c = $("chart");
    c.setAttribute("viewBox", `0 0 ${W} ${H}`);
    c.innerHTML = rs.length ? s : `<text x="20" y="40">Aucune manche terminée.</text>`;
    $("legend").innerHTML = picked.map((id, k) => `<span style="--c:${COLORS[k % COLORS.length]}"><i></i>${esc(name(id))}</span>`).join("");
  }
  $("pickerBtn").addEventListener("click", () => { const p = $("pickerPop"); p.hidden = !p.hidden; $("pickerBtn").setAttribute("aria-expanded", String(!p.hidden)); });
  document.addEventListener("click", e => { if (!e.target.closest("#picker")) { $("pickerPop").hidden = true; $("pickerBtn").setAttribute("aria-expanded", "false"); } });
  $("pickerPop").addEventListener("change", e => {
    const id = e.target.value;
    picked = e.target.checked ? [...picked, id].slice(-10) : picked.filter(x => x !== id);
    renderChart();
  });

  // ---------- Éléments fixes
  function renderStatic() {
    $("logo").src = $("logo2").src = IMG + (cfg.logo || "logo/gtqc-logo.png");
    if (cfg.twitch_url) $("twitchTop").href = cfg.twitch_url; else $("twitchTop").hidden = true;
    $("partners").innerHTML = D.Sponsors.filter(s => yes(s.afficher)).sort((a, b) => a.ordre - b.ordre).map(s => {
      const logo = s.logo_fond_fonce || s.logo;
      const inner = logo ? `<img src="${IMG + esc(logo)}" alt="${esc(s.nom)}">` : `<span class="txt">${esc(s.nom)}</span>`;
      return s.site_web ? `<a href="${esc(s.site_web)}" target="_blank" rel="noopener" title="${esc(s.nom)}">${inner}</a>` : `<span title="${esc(s.nom)}">${inner}</span>`;
    }).join("");
    $("horaire").innerHTML = ["D2", "D1"].map(cat => `<div class="sched-h">Lobby ${cat.slice(1)}</div><dl class="sched">${(D.Horaire || []).filter(h => h.categorie_id === cat).sort((a, b) => a.ordre - b.ordre).map(h => `<dt>${esc(String(h.heure))}</dt><dd>${esc(h.etape)}${h.duree ? " (" + esc(h.duree) + ")" : ""}</dd>`).join("")}</dl>`).join("");
    $("links").innerHTML = [["Facebook", cfg.facebook_url], ["Instagram", cfg.instagram_url], ["Twitch", cfg.twitch_url], ["YouTube", cfg.youtube_url]].filter(l => l[1]).map(([n, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${n}</a></li>`).join("");
    $("mail").textContent = cfg.courriel_contact || "";
    const bar = $("topbar"); const onScroll = () => bar.classList.toggle("solid", scrollY > 40);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    addEventListener("resize", placeRail);
  }

  function renderAll() {
    const rs = rounds(), nxt = nextRound();
    const last = counted().filter(isPast).slice(-1)[0];
    sel = Math.max(0, rs.findIndex(m => m.course_id === (nxt || last || rs[0]).course_id));
    renderSeasons(); renderRail(); renderEvent(); renderStandings(); renderChart();
  }
  renderStatic(); pickDefault(); renderAll();
})();
