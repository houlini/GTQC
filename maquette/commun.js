/* GTQC – fonctions communes aux pages de la maquette (données, calculs du classement, drapeaux, en-tête/pied).
   Les données viennent de data.js (export du Google Sheet). */
window.GT = (() => {
  const D = window.GTQC;
  const IMG = /\/maquette\//.test(location.pathname) || location.protocol === "file:" ? "../assets/img/" : "assets/img/";
  const yes = v => v === true || v === "TRUE";
  const no = v => v === false || v === "FALSE";
  const cfg = Object.fromEntries(D.Config.map(r => [r.cle, r.valeur]));
  const idx = (rows, k) => Object.fromEntries(rows.map(r => [r[k], r]));
  const circuits = idx(D.Circuits, "circuit_id");
  const gt7 = idx(D.Circuits_GT7, "layout_id");
  const pilots = idx(D.Pilotes, "pilote_id");
  const teams = idx(D.Equipe, "equipe_id");
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const name = id => (pilots[id] && pilots[id].pseudo) || id;
  const asDate = (d, h = "12:00") => new Date(`${d}T${String(h).replace("~", "")}:00`);
  const fmtLong = new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fmtShort = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
  const fmtMon = new Intl.DateTimeFormat("fr-CA", { month: "short" });
  const COLORS = ["#E6FF00", "#3D7BFF", "#3DDC97", "#FF8A3D", "#FF5FA2", "#A98BFF", "#5CE1E6", "#FFFFFF", "#FFD166", "#8BC34A"];
  const num = v => String(Math.round(v * 10) / 10).replace(".", ",");

  // ---------- Drapeaux simplifiés (SVG)
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
    AU: '<rect width="3" height="2" fill="#012169"/><path d="M0 0L1.5 1M1.5 0L0 1" stroke="#fff" stroke-width=".2"/><rect x=".65" width=".2" height="1" fill="#fff"/><rect y=".4" width="1.5" height=".2" fill="#fff"/><rect x=".7" width=".1" height="1" fill="#C8102E"/><rect y=".45" width="1.5" height=".1" fill="#C8102E"/><circle cx="2.2" cy="1.3" r=".15" fill="#fff"/><circle cx=".75" cy="1.5" r=".2" fill="#fff"/>',
    BR: '<rect width="3" height="2" fill="#009C3B"/><path d="M1.5 .2L2.7 1 1.5 1.8.3 1z" fill="#FFDF00"/><circle cx="1.5" cy="1" r=".42" fill="#002776"/>',
  };
  const flag = cc => FLAGS[cc] ? `<svg class="flag" viewBox="0 0 3 2" preserveAspectRatio="none" aria-label="${esc(cc)}">${FLAGS[cc]}</svg>` : "";

  // ---------- Saisons et manches
  const seasons = D.Saisons.filter(s => yes(s.publier)).sort((a, b) => b.saison_id.localeCompare(a.saison_id));
  const current = cfg.saison_courante || seasons[0].saison_id;
  const isCurrent = s => s === current;
  const rounds = s => D.Manches.filter(m => m.saison_id === s && yes(m.publier)).sort((a, b) => a.manche - b.manche);
  const counted = s => rounds(s).filter(m => m.type === "Course" || m.type === "Finale");
  const results = cid => D.Resultats.filter(r => r.course_id === cid);
  const pens = cid => D.Penalites.filter(p => p.course_id === cid && yes(p.publier));
  /** Manches courues : celles qui ont des résultats saisis (et non la date). */
  const done = s => counted(s).filter(m => results(m.course_id).length);
  /** Manches qui comptent pour le total des pilotes (Manches.points_pilotes ≠ FALSE). */
  const pilotRounds = s => done(s).filter(m => !no(m.points_pilotes));
  const isPast = m => asDate(m.date_fin || m.date, "23:59") < new Date();
  const nextRound = s => counted(s).find(m => !results(m.course_id).length && !isPast(m));
  const circ = m => circuits[m.circuit_id] || {};
  const layout = m => gt7[circ(m).gt7_layout_id] || {};
  const traceSrc = m => circ(m).gt7_layout_id ? `${IMG}circuits/traces/${circ(m).gt7_layout_id.replace(/-reverse$/, "")}.png` : "";
  const startOf = (m, cat = "D2") => (D.Manches_Categories.find(x => x.course_id === m.course_id && x.categorie_id === cat) || {}).heure_depart || m.heure || "19:00";
  const label = m => m.type === "Tryout" ? "Tryouts" : m.type === "Spéciale" ? "Course ouverte au public" : m.type === "Finale" ? `Manche ${m.manche} · Finale` : `Manche ${m.manche}`;
  const hm = h => String(h).replace(":", " h ");

  // ---------- Points et classement
  const roundPts = (id, cid) => {
    let p = 0;
    for (const r of results(cid)) if (r.pilote_id === id) p += (r.points || 0) + (r.points_bonus || 0);
    for (const x of pens(cid)) if (x.pilote_id === id && typeof x.points === "number") p += x.points;
    return p;
  };
  const totals = list => {
    const t = {};
    for (const m of list) {
      for (const r of results(m.course_id)) t[r.pilote_id] = (t[r.pilote_id] || 0) + (r.points || 0) + (r.points_bonus || 0);
      for (const x of pens(m.course_id)) if (typeof x.points === "number") t[x.pilote_id] = (t[x.pilote_id] || 0) + x.points;
    }
    return t;
  };
  /** Rang avec égalités, comme le classement officiel de la ligue : 8, 8, puis 9 (rang « dense »). */
  const ranked = tot => {
    const list = Object.entries(tot).map(([id, pts]) => ({ id, pts: Math.round(pts * 10) / 10 })).sort((a, b) => b.pts - a.pts);
    const levels = [...new Set(list.map(r => r.pts))];
    list.forEach(r => { r.rank = String(levels.indexOf(r.pts) + 1); });
    return list;
  };
  const official = (s, type = "Pilote") => D.Classement_Final.filter(r => r.saison_id === s && r.type === type);
  /** Pilotes classés pour le graphique / les rangs : saison en cours = tous ; archives = rang officiel numérique (sans host ni réserves). */
  const eligible = s => isCurrent(s) ? null : new Set(official(s).filter(r => /^\d+$/.test(String(r.rang))).map(r => r.id));
  const lastLobby = (id, s) => {
    let c = "";
    for (const m of done(s)) for (const r of results(m.course_id)) if (r.pilote_id === id && r.categorie_id) c = r.categorie_id;
    return c;
  };
  function standings(s, mode = "pilotes") {
    if (!isCurrent(s)) {
      return official(s, mode === "pilotes" ? "Pilote" : "Equipe").map(r => ({ id: r.id, rank: String(r.rang), pts: r.total_officiel, tag: r.role === "Réserve" ? "R" : "", note: r.note || "" }));
    }
    return ranked(totals(pilotRounds(s))).map(r => ({ ...r, tag: lastLobby(r.id, s) }));
  }
  /** Rang au classement après chaque manche comptée. */
  function positions(s) {
    const rs = pilotRounds(s), el = eligible(s), out = {};
    rs.forEach((m, i) => {
      const tot = totals(rs.slice(0, i + 1));
      const filtered = Object.fromEntries(Object.entries(tot).filter(([id]) => !el || el.has(id)));
      for (const r of ranked(filtered)) (out[r.id] = out[r.id] || [])[i] = +r.rank;
    });
    return { rs, out };
  }
  const teamOf = (id, s) => {
    const e = D.Engagements.find(x => x.saison_id === s && x.pilote_id === id);
    return e && e.equipe_id && teams[e.equipe_id] ? teams[e.equipe_id] : null;
  };
  /** Statistiques d'un pilote pour une saison. */
  function pilotStats(id, s) {
    const st = standings(s).find(r => r.id === id);
    const rows = done(s).map(m => {
      const r = results(m.course_id).find(x => x.pilote_id === id);
      const p = pens(m.course_id).filter(x => x.pilote_id === id);
      return { m, r, pens: p, pts: roundPts(id, m.course_id), counts: !no(m.points_pilotes) };
    }).filter(x => x.r || x.pens.length);
    const pos = rows.map(x => x.r && x.r.position).filter(Boolean);
    return {
      rank: st ? st.rank : "–", pts: st ? st.pts : 0, tag: st ? st.tag : "",
      races: rows.filter(x => x.r).length,
      wins: pos.filter(p => p === 1).length, podiums: pos.filter(p => p <= 3).length,
      best: pos.length ? Math.min(...pos) : null,
      fastest: rows.filter(x => x.r && yes(x.r.meilleur_tour)).length,
      penalties: rows.reduce((n, x) => n + x.pens.length, 0),
      rows,
    };
  }
  const seasonsOf = id => seasons.filter(s => D.Engagements.some(e => e.saison_id === s.saison_id && e.pilote_id === id) || D.Resultats.some(r => r.pilote_id === id && r.course_id.startsWith(s.saison_id)));

  // ---------- En-tête et pied de page
  function chrome() {
    $("logo").src = IMG + (cfg.logo || "logo/gtqc-logo.png");
    if ($("logo2")) $("logo2").src = $("logo").src;
    if (cfg.twitch_url) $("twitchTop").href = cfg.twitch_url; else $("twitchTop").hidden = true;
    if ($("partners")) $("partners").innerHTML = D.Sponsors.filter(s => yes(s.afficher)).sort((a, b) => a.ordre - b.ordre).map(s => {
      const logo = s.logo_fond_fonce || s.logo;
      const inner = logo ? `<img src="${IMG + esc(logo)}" alt="${esc(s.nom)}">` : `<span class="txt">${esc(s.nom)}</span>`;
      return s.site_web ? `<a href="${esc(s.site_web)}" target="_blank" rel="noopener" title="${esc(s.nom)}">${inner}</a>` : `<span title="${esc(s.nom)}">${inner}</span>`;
    }).join("");
    if ($("horaire")) $("horaire").innerHTML = ["D2", "D1"].map(cat => `<div class="sched-h">Lobby ${cat.slice(1)}</div><dl class="sched">${(D.Horaire || []).filter(h => h.categorie_id === cat).sort((a, b) => a.ordre - b.ordre).map(h => `<dt>${esc(String(h.heure))}</dt><dd>${esc(h.etape)}${h.duree ? " (" + esc(h.duree) + ")" : ""}</dd>`).join("")}</dl>`).join("");
    if ($("links")) $("links").innerHTML = [["Facebook", cfg.facebook_url], ["Instagram", cfg.instagram_url], ["Twitch", cfg.twitch_url], ["YouTube", cfg.youtube_url]].filter(l => l[1]).map(([n, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${n}</a></li>`).join("");
    if ($("mail")) $("mail").textContent = cfg.courriel_contact || "";
    const bar = $("topbar"); const onScroll = () => bar.classList.toggle("solid", scrollY > 40);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    // Menu mobile : le bouton ouvre la navigation en panneau sous l'en-tête
    const btn = bar.querySelector(".menu-btn"), nav = bar.querySelector(".nav");
    nav.id = nav.id || "mainNav";
    btn.setAttribute("aria-controls", nav.id);
    const setOpen = open => {
      bar.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open);
      btn.innerHTML = open ? '<span aria-hidden="true">×</span> Fermer' : '<span aria-hidden="true">≡</span> Menu';
    };
    setOpen(false);
    btn.addEventListener("click", () => setOpen(!bar.classList.contains("open")));
    nav.addEventListener("click", e => { if (e.target.closest("a")) setOpen(false); });
    addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
  }

  return { D, IMG, yes, no, cfg, circuits, gt7, pilots, teams, $, esc, name, asDate, fmtLong, fmtShort, fmtMon, COLORS, num, flag,
    seasons, current, isCurrent, rounds, counted, results, pens, done, pilotRounds, isPast, nextRound, circ, layout, traceSrc,
    startOf, label, hm, roundPts, totals, ranked, official, standings, positions, teamOf, pilotStats, seasonsOf, chrome };
})();
