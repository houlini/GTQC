/* GTQC – page Pilotes (liste en cartes + fiche détaillée via #pilote_id). Calculs : commun.js. */
(() => {
  const G = window.GT, D = G.D, { $, esc } = G;
  let season = G.current, filter = "tous";

  // Avatar : colonne Pilotes.avatar (chemin sous assets/img/) si présente, sinon le casque GTQC × Vacecraft
  const avatar = id => {
    const own = (G.pilots[id] || {}).avatar;
    return `<img class="avatar${own ? "" : " default"}" src="${G.IMG + esc(own || "casques/casque-avatar.jpg")}" alt="" loading="lazy">`;
  };

  // ---------- Données d'une saison
  function roster() {
    const st = G.standings(season);
    const byId = Object.fromEntries(st.map(r => [r.id, r]));
    const ids = new Set([...st.map(r => r.id), ...D.Engagements.filter(e => e.saison_id === season).map(e => e.pilote_id)]);
    return [...ids].filter(id => G.pilots[id]).map(id => {
      const e = D.Engagements.find(x => x.saison_id === season && x.pilote_id === id) || {};
      const s = byId[id] || { rank: "–", pts: 0, tag: "" };
      const reserve = e.role === "Réserve" || s.tag === "R";
      const tag = G.isCurrent(season) ? (s.tag || (reserve ? "R" : "")) : (reserve ? "R" : "");
      return { id, rank: s.rank, pts: +s.pts || 0, tag, reserve, numero: (G.pilots[id] || {}).numero, team: G.teamOf(id, season), note: s.note };
    }).sort((a, b) => (isNaN(+a.rank) ? 999 : +a.rank) - (isNaN(+b.rank) ? 999 : +b.rank) || b.pts - a.pts || G.name(a.id).localeCompare(G.name(b.id)));
  }

  // ---------- Liste
  function renderList() {
    $("seasonSwitch").innerHTML = G.seasons.map(s => `<button type="button" role="tab" aria-selected="${s.saison_id === season}" data-s="${s.saison_id}">${esc(s.nom)}</button>`).join("");
    const opts = G.isCurrent(season) ? [["tous", "Tous"], ["D1", "Division 1"], ["D2", "Division 2"], ["R", "Réserves"]] : [["tous", "Tous"], ["titulaires", "Titulaires"], ["R", "Réserves"]];
    $("filters").innerHTML = opts.map(([k, l]) => `<button type="button" aria-pressed="${k === filter}" data-f="${k}">${l}</button>`).join("");
    const list = roster().filter(p => filter === "tous" || (filter === "titulaires" ? !p.reserve : p.tag === filter));
    $("grid").innerHTML = list.map(p => {
      const big = p.numero || (/^\d+$/.test(p.rank) ? p.rank : "");
      const div = p.tag === "R" ? "Réserve" : p.tag ? "Division " + p.tag.slice(1) : "";
      return `<li><a class="dcard t-${p.tag || "x"}" href="#${esc(p.id)}">
        <span class="dnum" aria-hidden="true">${esc(big)}</span>
        ${avatar(p.id)}
        <span class="dinfo">
          <span class="dname">${esc(G.name(p.id))}</span>
          <span class="dmeta">${esc([div, p.team && p.team.nom].filter(Boolean).join(" · "))}</span>
        </span>
        <span class="dpts"><b>${esc(G.num(p.pts))}</b> pts${/^\d+$/.test(p.rank) ? ` · ${esc(p.rank)}<sup>e</sup>` : ""}</span>
      </a></li>`;
    }).join("") || `<li class="muted">Aucun pilote.</li>`;
  }
  $("seasonSwitch").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; season = b.dataset.s; filter = "tous"; renderList(); });
  $("filters").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; filter = b.dataset.f; renderList(); });

  // ---------- Fiche pilote
  function spark(rows) {
    const pts = []; let s = 0;
    rows.filter(r => r.counts).forEach(r => { s += r.pts; pts.push([r.m.manche, s]); });
    if (pts.length < 2) return "";
    const W = 520, H = 140, L = 8, R = 40, T = 14, B = 26, max = Math.max(...pts.map(p => p[1]), 1), min = Math.min(0, ...pts.map(p => p[1]));
    const x = i => L + i * (W - L - R) / (pts.length - 1), y = v => T + (H - T - B) * (1 - (v - min) / (max - min || 1));
    const line = pts.map((p, i) => `${x(i)},${y(p[1])}`).join(" ");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Points cumulés">
      <polygon points="${x(0)},${y(min)} ${line} ${x(pts.length - 1)},${y(min)}" fill="rgba(230,255,0,.12)"/>
      <polyline points="${line}" fill="none" stroke="#E6FF00" stroke-width="3" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[1])}" r="${i === pts.length - 1 ? 5 : 3}" fill="#E6FF00"/><text x="${x(i)}" y="${H - 6}" text-anchor="middle">M${p[0]}</text>`).join("")}
      <text x="${x(pts.length - 1) + 10}" y="${y(pts[pts.length - 1][1]) + 5}" class="end">${G.num(pts[pts.length - 1][1])}</text></svg>`;
  }
  function renderDetail(id) {
    const p = G.pilots[id];
    if (!p) { location.hash = ""; return; }
    const seasons = G.seasonsOf(id);
    const s = seasons.some(x => x.saison_id === season) ? season : (seasons[0] || {}).saison_id || season;
    const st = G.pilotStats(id, s);
    const reserve = (D.Engagements.find(e => e.saison_id === s && e.pilote_id === id) || {}).role === "Réserve";
    const tag = st.tag || (reserve ? "R" : "");
    const team = G.teamOf(id, s);
    const chips = [tag === "R" ? "Réserve" : tag ? "Division " + tag.slice(1) : "", team && team.nom, p.controle, p.driver_rating && "Rating " + p.driver_rating].filter(Boolean);
    const box = (v, l) => `<div class="sbox"><b>${esc(v ?? "–")}</b><span>${l}</span></div>`;
    const rows = st.rows.map(r => {
      const c = G.circ(r.m);
      const pos = r.r && r.r.position ? r.r.position : "";
      const penTxt = r.pens.map(x => x.type === "Points" ? x.points + " pts" : x.type === "Temps" ? "+" + x.secondes + " s" : "avert.").join(", ");
      return `<tr class="${r.counts ? "" : "nc"}"><td>M${r.m.manche}</td><td class="muted">${esc(G.fmtShort.format(G.asDate(r.m.date)).replace(".", ""))}</td>
        <td>${G.flag(c.code_pays)} ${esc(c.nom || "")}</td><td>${r.r && r.r.categorie_id ? `<span class="div-tag ${r.r.categorie_id}">${r.r.categorie_id}</span>` : ""}</td>
        <td class="num">${pos ? pos + "<sup>e</sup>" : "–"}${r.r && G.yes(r.r.meilleur_tour) ? ' <span class="fl">MT</span>' : ""}</td>
        <td class="pen">${esc(penTxt)}</td><td class="num b">${esc(G.num(r.pts))}${r.counts ? "" : '<span class="muted"> *</span>'}</td></tr>`;
    }).join("");
    $("detailView").innerHTML = `
      <a class="back" href="#">‹ Tous les pilotes</a>
      <div class="pd-hero t-${tag || "x"}">
        <div class="pd-avatar">${avatar(id)}${p.avatar ? "" : '<span class="pd-soon">Casque de la ligue</span>'}</div>
        <div class="pd-id">
          <span class="pd-rank">${/^\d+$/.test(st.rank) ? st.rank + "<sup>e</sup> au classement" : esc(st.rank)}</span>
          <h1>${esc(p.pseudo)}</h1>
          <div class="pd-chips">${chips.map(c => `<span>${esc(c)}</span>`).join("")}</div>
          ${seasons.length > 1 ? `<div class="season-switch inline" id="pdSeason">${seasons.map(x => `<button type="button" aria-selected="${x.saison_id === s}" data-s="${x.saison_id}">${esc(x.nom)}</button>`).join("")}</div>` : ""}
        </div>
      </div>
      <div class="sboxes">
        ${box(G.num(st.pts), "points")}${box(st.races, "courses")}${box(st.wins, "victoires")}${box(st.podiums, "podiums")}
        ${box(st.best ? st.best + "e" : "–", "meilleur résultat")}${box(st.fastest, "meilleurs tours")}${box(st.penalties, "pénalités")}
      </div>
      ${spark(st.rows) ? `<div class="pd-block"><h2>Points cumulés</h2>${spark(st.rows)}</div>` : ""}
      <div class="pd-block"><h2>Résultats ${esc((G.seasons.find(x => x.saison_id === s) || {}).nom || "")}</h2>
        ${rows ? `<div class="table-wrap"><table class="rtable"><thead><tr><th>Manche</th><th>Date</th><th>Circuit</th><th>Div.</th><th class="num">Pos.</th><th>Pénalités</th><th class="num">Pts</th></tr></thead><tbody>${rows}</tbody></table></div>
          ${st.rows.some(r => !r.counts) ? `<p class="muted small">* Points qui ne comptent pas dans le total officiel des pilotes.</p>` : ""}
          ${!G.isCurrent(s) ? `<p class="muted small">Positions non disponibles pour la Saison 1 : seuls les points ont été conservés.</p>` : ""}`
          : `<p class="muted">Aucun résultat cette saison.</p>`}
      </div>`;
    const sw = $("pdSeason");
    if (sw) sw.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; season = b.dataset.s; renderDetail(id); });
  }

  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    const detail = !!id && !!G.pilots[id];
    $("listView").hidden = detail; $("detailView").hidden = !detail;
    if (detail) renderDetail(id); else renderList();
    scrollTo(0, 0);
  }
  addEventListener("hashchange", route);
  G.chrome(); route();
})();
