/* GTQC TV — directs Twitch des pilotes (colonne Pilotes.twitch), comme LNHQ TV.
   Source : API /twitch (Worker gtqc-api, mise à jour chaque minute). Une chaîne compte « en direct »
   si elle diffuse avec le tag GTQC (ou GTQC dans le titre). 1, 2 ou 4 streams, plein écran, clavardage.
   Adresse : ?chaine=nom (1 stream) ou ?vue=2&chaines=a,b */
(() => {
  const G = window.GT, { $, esc } = G;
  const RAFRAICHIR_MS = 60 * 1000;
  const MODES = [1, 2, 4];
  const params = new URLSearchParams(location.search);
  const modeInitial = () => {
    const p = Number(params.get("vue"));
    if (MODES.includes(p)) return p;
    try { const m = Number(localStorage.getItem("gtqcTvMode")); if (MODES.includes(m)) return m; } catch (e) {}
    return 1;
  };
  const state = {
    chaines: [], choisie: (params.get("chaine") || "").toLowerCase(),
    sonActif: false, lecteurDe: "",               // le son n'est activé qu'après un clic (lecture auto bloquée sinon)
    mode: modeInitial(), cases: (params.get("chaines") || "").toLowerCase().split(",").filter(Boolean),
    fermees: new Set(), chat: "", multi: null, tag: G.cfg.tag_twitch || "GTQC",
  };
  const nombre = new Intl.NumberFormat("fr-CA");
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const avatar = c => { const i = el("img"); i.src = G.IMG + (c.avatar || "casques/casque-avatar.jpg"); i.alt = ""; i.loading = "lazy"; return i; };
  const enDirect = c => c.live && c.gtqc;
  const lobbyTxt = l => l === "R" ? "Réserve" : l ? "Division " + l.slice(1) : "";
  const depuis = iso => { const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return min < 60 ? min + " min" : Math.floor(min / 60) + " h " + String(min % 60).padStart(2, "0"); };
  const iframe = (src, titre) => { const f = el("iframe"); f.src = src; f.title = titre; f.allowFullscreen = true; f.setAttribute("allow", "autoplay; fullscreen"); return f; };
  const hote = location.hostname;
  const lecteurSrc = (ch, muet) => `https://player.twitch.tv/?channel=${ch}&parent=${hote}&autoplay=true&muted=${muet}`;
  const chatSrc = ch => `https://www.twitch.tv/embed/${ch}/chat?parent=${hote}&darkpopout`;
  const trouver = ch => state.chaines.find(x => x.chaine === ch);
  const nomDe = c => c.pseudo || c.nom || c.chaine;

  /* ---------- 1 stream ---------- */
  function renderScene() {
    const c = trouver(state.choisie);
    if (!c) {
      state.lecteurDe = "";
      const v = el("div", "tv-vide");
      v.append(el("strong", null, `Personne n'est en direct avec le tag ${state.tag} pour l'instant.`),
        el("span", null, "Les directs des pilotes apparaissent ici automatiquement. Choisis une chaîne plus bas pour voir ses anciennes vidéos."));
      $("scene").replaceChildren(v);
      return;
    }
    if (state.lecteurDe !== c.chaine) {
      state.lecteurDe = c.chaine;
      const scene = el("div", "tv-scene avec-chat"), lecteur = el("div", "tv-lecteur"), chat = el("div", "tv-chat");
      lecteur.append(iframe(lecteurSrc(c.chaine, !state.sonActif), "Lecteur Twitch de " + c.chaine));
      chat.append(iframe(chatSrc(c.chaine), "Clavardage Twitch de " + c.chaine));
      scene.append(lecteur, chat);
      const infos = el("div", "tv-infos"); infos.id = "tvInfos";
      $("scene").replaceChildren(scene, infos);
    }
    const texte = el("div", "tv-infos-titre");
    texte.append(el("strong", null, nomDe(c) + (c.lobby ? " · " + lobbyTxt(c.lobby) : "")),
      el("span", null, enDirect(c) ? `${c.titre || ""}${c.spectateurs != null ? " · " + nombre.format(c.spectateurs) + " spectateurs" : ""}` : "Hors ligne : anciennes vidéos de la chaîne"));
    const lien = el("a", "tv-lien", "Ouvrir sur Twitch ↗");
    lien.href = "https://www.twitch.tv/" + c.chaine; lien.target = "_blank"; lien.rel = "noopener";
    const fiche = el("a", "tv-lien", "Fiche du pilote"); fiche.href = "pilotes.html#" + c.pilote_id;
    $("tvInfos").replaceChildren(avatar(c), texte, fiche, lien);
  }

  /* ---------- 2 ou 4 streams : les cases vides se remplissent avec les directs les plus regardés ---------- */
  function remplirCases(live) {
    const cases = state.cases.slice(0, state.mode).map(c => (trouver(c) ? c : ""));
    while (cases.length < state.mode) cases.push("");
    const libres = live.map(c => c.chaine).filter(c => !cases.includes(c) && !state.fermees.has(c));
    for (let i = 0; i < cases.length && libres.length; i++) if (!cases[i]) cases[i] = libres.shift();
    state.cases = cases;
    if (!cases.includes(state.chat)) state.chat = cases.find(Boolean) || "";
  }
  function caseVide() { const v = el("div", "tv-case-vide"); v.append(el("strong", null, "Case libre"), el("span", null, "Choisis une chaîne plus bas pour l'afficher ici.")); return v; }
  function caseStream(ch) {
    const boite = el("div", "tv-case"), tete = el("div", "tv-case-tete"), fermer = el("button", "tv-case-fermer", "✕");
    tete.title = "Afficher le clavardage de cette chaîne";
    tete.addEventListener("click", () => { state.chat = ch; render(); });
    fermer.type = "button"; fermer.title = "Retirer cette chaîne";
    fermer.addEventListener("click", ev => { ev.stopPropagation(); basculer(ch); });
    tete.append(el("span", "tv-case-nom"), el("span", "tv-case-detail"), fermer);
    const lecteur = el("div", "tv-lecteur");
    lecteur.append(iframe(lecteurSrc(ch, true), "Lecteur Twitch de " + ch));
    boite.append(tete, lecteur);
    return boite;
  }
  function renderMulti(live) {
    remplirCases(live);
    if (!state.multi || state.multi.mode !== state.mode) {
      const scene = el("div", "tv-scene avec-chat"), grille = el("div", "tv-multi mode-" + state.mode), chat = el("div", "tv-chat");
      scene.append(grille, chat);
      $("scene").replaceChildren(scene);
      state.multi = { mode: state.mode, grille, chat, chatDe: "", places: [] };
      for (let i = 0; i < state.mode; i++) { const v = caseVide(); grille.append(v); state.multi.places.push({ chaine: "", el: v }); }
    }
    const m = state.multi;
    state.cases.forEach((ch, i) => {
      const place = m.places[i];
      if (place.chaine !== ch) { const n = ch ? caseStream(ch) : caseVide(); place.el.replaceWith(n); m.places[i] = { chaine: ch, el: n }; }
      if (!ch) return;
      const c = trouver(ch), tete = m.places[i].el.querySelector(".tv-case-tete");
      tete.querySelector(".tv-case-nom").textContent = nomDe(c) + (c.lobby ? " · " + c.lobby : "");
      tete.querySelector(".tv-case-detail").textContent = enDirect(c) ? "🔴 " + nombre.format(c.spectateurs || 0) : "Hors ligne";
      m.places[i].el.classList.toggle("is-chat", ch === state.chat);
    });
    if (m.chatDe !== state.chat) { m.chatDe = state.chat; m.chat.replaceChildren(...(state.chat ? [iframe(chatSrc(state.chat), "Clavardage Twitch de " + state.chat)] : [])); }
    m.chat.style.visibility = state.chat ? "" : "hidden";
  }
  function basculer(ch) {
    const i = state.cases.indexOf(ch);
    if (i >= 0) { state.cases[i] = ""; state.fermees.add(ch); }
    else { state.fermees.delete(ch); const libre = state.cases.indexOf(""); state.cases[libre >= 0 ? libre : state.mode - 1] = ch; state.chat = ch; }
    render();
  }
  function changerMode(mode) {
    if (mode === state.mode) return;
    if (mode === 1) state.choisie = state.chat || state.cases.find(Boolean) || state.choisie;
    else if (state.mode === 1 && state.choisie) state.cases = [state.choisie];
    state.mode = mode; state.multi = null; state.lecteurDe = "";
    try { localStorage.setItem("gtqcTvMode", String(mode)); } catch (e) {}
    render();
  }
  function majAdresse() {
    const url = new URL(location.href);
    if (state.mode === 1) { url.searchParams.delete("vue"); url.searchParams.delete("chaines"); if (state.choisie) url.searchParams.set("chaine", state.choisie); }
    else {
      url.searchParams.set("vue", String(state.mode)); url.searchParams.delete("chaine");
      const liste = state.cases.filter(Boolean);
      if (liste.length) url.searchParams.set("chaines", liste.join(",")); else url.searchParams.delete("chaines");
    }
    history.replaceState(null, "", url);
  }

  /* ---------- Cartes des chaînes ---------- */
  function carte(c) {
    const choisie = state.mode === 1 ? c.chaine === state.choisie : state.cases.includes(c.chaine);
    const b = el("button", "tv-carte" + (enDirect(c) ? "" : " is-hors-ligne") + (choisie ? " is-choisie" : ""));
    b.type = "button"; b.setAttribute("aria-pressed", String(choisie));
    const corps = el("div", "tv-carte-corps"), nom = el("div", "tv-carte-nom");
    nom.append(el("span", null, nomDe(c)));
    if (enDirect(c)) nom.append(el("span", "tv-badge", "En direct"));
    else if (c.live) nom.append(el("span", "tv-badge is-autre", "En ligne sans le tag " + state.tag));
    const detail = enDirect(c) ? `${nombre.format(c.spectateurs || 0)} spectateurs · depuis ${depuis(c.debut)}${c.titre ? " · " + c.titre : ""}` : [lobbyTxt(c.lobby), "twitch.tv/" + c.chaine].filter(Boolean).join(" · ");
    corps.append(nom, el("div", "tv-carte-detail", detail));
    b.title = enDirect(c) && c.titre ? c.titre : nomDe(c);
    b.append(avatar(c), corps);
    b.addEventListener("click", () => {
      if (state.mode === 1) choisir(c.chaine);
      else { basculer(c.chaine); $("scene").scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    return b;
  }
  function choisir(ch) {
    if (ch === state.choisie) return;
    state.choisie = ch; state.sonActif = true;
    render();
    $("scene").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function render() {
    const live = state.chaines.filter(enDirect).sort((a, b) => (b.spectateurs || 0) - (a.spectateurs || 0));
    const hors = state.chaines.filter(c => !enDirect(c)).sort((a, b) => (b.live - a.live) || nomDe(a).localeCompare(nomDe(b), "fr"));
    if (!state.choisie && live.length) state.choisie = live[0].chaine;
    document.querySelectorAll(".tv-modes button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.mode) === state.mode)));
    if (state.mode === 1) { state.multi = null; renderScene(); } else renderMulti(live);
    majAdresse();
    $("grilleLive").replaceChildren(...live.map(carte));
    $("grilleHors").replaceChildren(...hors.map(carte));
    $("groupeLive").hidden = !live.length; $("groupeHors").hidden = !hors.length;
    $("compteLive").textContent = live.length ? `(${live.length})` : "";
    $("compteHors").textContent = hors.length ? `(${hors.length})` : "";
    $("resume").textContent = live.length ? `🔴 ${live.length} en direct` : "Personne en direct";
  }

  function note(texte) { $("note").hidden = !texte; $("note").textContent = texte || ""; }

  // Sans API (pas encore en ligne) : les chaînes connues du classeur, toutes hors ligne.
  function chainesDuClasseur() {
    return G.D.Pilotes.filter(p => p.twitch && !G.no(p.actif)).map(p => ({ chaine: String(p.twitch).toLowerCase(), pilote_id: p.pilote_id, pseudo: p.pseudo, avatar: p.avatar, lobby: "", live: false, gtqc: false }));
  }

  async function load() {
    if (!G.API) {
      state.chaines = chainesDuClasseur();
      note(state.chaines.length ? "Statut des directs bientôt disponible." : "GTQC TV arrive bientôt : les pilotes ajouteront leur chaîne Twitch à leur fiche, et leurs directs de soirs de course apparaîtront ici.");
      render();
      return;
    }
    try {
      const d = await G.twitchStatus();
      if (!d.chaines) throw new Error(d.erreur || "réponse vide");
      state.chaines = d.chaines; state.tag = d.tag || state.tag;
      note(d.ok ? (state.chaines.length ? "" : "Aucune chaîne Twitch pour l'instant : à ajouter dans la fiche des pilotes (admin).") : "Statut des directs indisponible pour le moment.");
      render();
    } catch (err) {
      console.error(err);
      if (!state.chaines.length) { state.chaines = chainesDuClasseur(); note("Impossible de savoir qui est en direct pour le moment."); render(); }
    }
  }

  /* ---------- Plein écran : la grille (2 ou 4) ou le lecteur (1). Sans API plein écran (iPhone), .is-plein couvre l'écran. ---------- */
  let plein = null;
  const cibleEcran = () => state.mode === 1 ? $("scene").querySelector(".tv-lecteur") : state.multi && state.multi.grille;
  function entrerPleinEcran() {
    const cible = cibleEcran();
    if (!cible || plein) return;
    const quitter = el("button", "tv-quitter", "✕ Quitter le plein écran");
    quitter.type = "button"; quitter.addEventListener("click", sortirPleinEcran);
    cible.append(quitter); cible.classList.add("is-plein");
    plein = { cible, quitter, minuteur: 0 };
    const montrer = () => { cible.classList.add("montre-quitter"); clearTimeout(plein.minuteur); plein.minuteur = setTimeout(() => cible.classList.remove("montre-quitter"), 2500); };
    plein.montrer = montrer; cible.addEventListener("mousemove", montrer); montrer();
    const demande = cible.requestFullscreen || cible.webkitRequestFullscreen;
    if (demande) Promise.resolve(demande.call(cible)).catch(() => {});
  }
  function sortirPleinEcran() {
    if (!plein) return;
    const { cible, quitter, montrer } = plein;
    plein = null;
    cible.classList.remove("is-plein", "montre-quitter"); cible.removeEventListener("mousemove", montrer); quitter.remove();
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  ["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, () => { if (plein && !(document.fullscreenElement || document.webkitFullscreenElement)) sortirPleinEcran(); }));
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && plein) sortirPleinEcran(); });
  $("pleinEcran").addEventListener("click", entrerPleinEcran);
  document.querySelectorAll(".tv-modes button").forEach(b => b.addEventListener("click", () => changerMode(Number(b.dataset.mode))));

  G.chrome();
  load();
  if (G.API) {
    setInterval(() => { if (!document.hidden) load(); }, RAFRAICHIR_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  }
})();
