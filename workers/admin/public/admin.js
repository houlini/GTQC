/* GTQC Admin — manches, résultats, grille des lobbys, réserves, pilotes, VOD et inscriptions.
   Lecture : GET /api/etat (tout le classeur, onglets privés compris). Écriture : POST /api/<action>
   (Worker gtqc-admin → Apps Script, courriel vérifié par Cloudflare Access + onglet _Admins).
   En local sans Worker : mode démo avec ../../../maquette/data.js, rien n'est enregistré. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const yes = v => v === true || String(v).toUpperCase() === "TRUE";
  const no = v => v === false || String(v).toUpperCase() === "FALSE";
  const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const REGLAGES = [["heure_du_jour", "Moment de la journée"], ["vitesse_temps", "Vitesse du temps"], ["conditions", "Conditions"],
    ["arret_pit_min", "Arrêts obligatoires"], ["conso_carburant", "Consommation"], ["usure_pneus", "Usure des pneus"],
    ["carburant_initial_l", "Carburant au départ (L)"], ["ravitaillement", "Ravitaillement"], ["temps_pit_s", "Temps au stand (s)"]];
  const STATUTS_RES = ["Classé", "DNF", "DNS", "DSQ"];
  const STATUTS_INSCR = ["Nouvelle", "Contactée", "Acceptée", "Réserve", "Refusée", "Archivée"];

  let D = null, demo = false, tab = "manches", saison = "";
  const ui = {}; // choix gardés entre deux rendus (manche choisie, lobby, brouillons)

  /* ---------- Serveur ---------- */
  async function charger() {
    try {
      const rep = await fetch("/api/etat", { cache: "no-store" });
      const r = await rep.json();
      if (!r.ok) throw new Error(r.erreur || "etat");
      D = r.donnees;
      $("moi").textContent = r.moi.nom + " · " + r.moi.courriel;
    } catch (err) {
      if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        $("main").innerHTML = `<div class="adm-card err"><h2>Accès impossible</h2><p>${err.message === "admin" ? "Ton courriel n'est pas dans la liste des admins (onglet _Admins du classeur)." : "Le serveur ne répond pas (" + esc(err.message) + ")."}</p></div>`;
        return false;
      }
      await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "../../../maquette/data.js"; s.onload = ok; s.onerror = ko; document.head.append(s); });
      D = window.GTQC; demo = true; $("demo").hidden = false; $("moi").textContent = "démo";
    }
    for (const k of ["Vods", "Photos", "_PSN", "Grilles", "Remplacements", "_Inscriptions", "_Journal", "Engagements", "Penalites", "Manches_Categories"]) D[k] = D[k] || [];
    saison = saison || cfg().saison_courante || "S02";
    return true;
  }
  // Codes renvoyés par le Worker ou Apps Script → phrase pour l'admin
  const ERREURS = {
    occupe: "un autre enregistrement est en cours. Réessaie dans quelques secondes.",
    script: "le classeur Google ne répond pas. Réessaie dans un moment.",
    config: "l'admin est mal configuré (adresse ou secret du script manquant dans le Worker).",
    acces: "ta session a expiré. Recharge la page pour te reconnecter.",
    admin: "ton courriel n'est pas dans la liste des admins (onglet _Admins).",
    champs: "il manque des informations.",
    date: "la date est invalide.",
    pseudo: "le pseudo est vide.",
    existe: "un pilote avec ce pseudo existe déjà. Utilise « Modifier » sur sa ligne.",
    statut: "statut inconnu.",
    taille: "le fichier est trop lourd.",
    format: "format d'image non accepté (JPEG, PNG ou WebP).",
    introuvable: "élément introuvable (déjà supprimé ?).",
  };
  let occupe = false;
  /** Enregistre une action. recharger: false pour enchaîner plusieurs envois et recharger une seule fois à la fin. */
  async function envoyer(action, corps, message, { recharger = true } = {}) {
    if (demo) { toast("Mode démo : « " + message + " » non enregistré.", "warn"); return { ok: true, demo: true }; }
    if (occupe && recharger) { toast("Enregistrement en cours, attends la fin avant de recommencer.", "warn"); return { ok: false, occupe: true }; }
    occupe = true;
    main.classList.add("occupe");
    main.querySelectorAll("button.btn").forEach(b => { b.disabled = true; });
    try {
      const rep = await fetch("/api/" + action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      // Session Access expirée : la réponse est une page de connexion, pas du JSON
      const r = await rep.json().catch(() => ({ ok: false, erreur: "acces" }));
      if (!r.ok) throw new Error(ERREURS[r.erreur] || r.detail || r.erreur || "erreur inconnue");
      if (recharger) { toast(message + " : enregistré.", "ok"); await charger(); render(); }
      return r;
    } catch (err) {
      toast(message + " : échec, " + err.message, "err");
      main.querySelectorAll("button.btn").forEach(b => { b.disabled = false; });
      return { ok: false };
    } finally { occupe = false; main.classList.remove("occupe"); }
  }
  let minuteur;
  function toast(txt, cls) { const t = $("toast"); t.textContent = txt; t.className = "adm-toast " + (cls || ""); t.hidden = false; clearTimeout(minuteur); minuteur = setTimeout(() => { t.hidden = true; }, cls === "err" ? 12000 : 5000); }

  /* ---------- Données dérivées ---------- */
  const cfg = () => Object.fromEntries((D.Config || []).map(r => [r.cle, r.valeur]));
  const pilotes = () => D.Pilotes.slice().sort((a, b) => String(a.pseudo).localeCompare(String(b.pseudo), "fr"));
  const pseudo = id => (D.Pilotes.find(p => p.pilote_id === id) || {}).pseudo || id || "";
  const manches = () => D.Manches.filter(m => m.saison_id === saison).sort((a, b) => a.manche - b.manche);
  const comptees = () => manches().filter(m => (m.type === "Course" || m.type === "Finale") && !no(m.points_pilotes));
  const resultatsDe = cid => D.Resultats.filter(r => r.course_id === cid);
  const circuit = id => (D.Circuits.find(c => c.circuit_id === id) || {});
  const nomManche = m => `M${m.manche} · ${circuit(m.circuit_id).nom || m.circuit_id || "?"} · ${m.date || ""}`;
  const engagements = () => D.Engagements.filter(e => e.saison_id === saison);
  const titulaires = () => engagements().filter(e => e.role === "Titulaire");
  const reserves = () => engagements().filter(e => e.role === "Réserve").sort((a, b) => (Number(a.ordre_reserve) || 99) - (Number(b.ordre_reserve) || 99) || pseudo(a.pilote_id).localeCompare(pseudo(b.pilote_id), "fr"));
  /** Lobby d'un pilote. Sans « num » : le plus récent (dernière grille publiée, sinon l'engagement).
      Avec « num » (numéro de manche) : la grille en vigueur à cette manche. Une grille publiée d'avance
      (pour une manche plus tard) ne change donc pas le lobby des manches d'avant. */
  const lobbyDe = (id, num) => {
    const gs = D.Grilles.filter(x => x.saison_id === saison && x.pilote_id === id).sort((a, b) => b.a_partir_de - a.a_partir_de);
    const eng = (engagements().find(e => e.pilote_id === id) || {}).categorie_id || "";
    if (num == null || !gs.length) return gs[0] ? gs[0].categorie_id : eng;
    const g = gs.find(x => Number(x.a_partir_de) <= Number(num));
    if (g) return g.categorie_id;
    // Seulement des grilles plus tard : le lobby d'avant se déduit du mouvement de la première
    const premiere = gs[gs.length - 1];
    return premiere.mouvement === "Montée" ? "D2" : premiere.mouvement === "Descente" ? "D1" : premiere.categorie_id;
  };
  const numDe = cid => (D.Manches.find(x => x.course_id === cid) || {}).manche;
  const bareme = cat => D.Bareme_Points.filter(b => b.categorie_id === cat);
  const ptsPosition = (cat, pos) => Number((bareme(cat).find(b => Number(b.position) === Number(pos)) || {}).points || 0);
  function totaux() {
    const t = {};
    for (const m of comptees()) {
      for (const r of resultatsDe(m.course_id)) t[r.pilote_id] = (t[r.pilote_id] || 0) + (Number(r.points) || 0) + (Number(r.points_bonus) || 0);
      for (const p of D.Penalites.filter(x => x.course_id === m.course_id && typeof x.points === "number")) t[p.pilote_id] = (t[p.pilote_id] || 0) + p.points;
    }
    return t;
  }
  const prochaine = () => comptees().find(m => !resultatsDe(m.course_id).length) || manches()[manches().length - 1];
  const options = (liste, choisi, vide) => (vide != null ? `<option value="">${esc(vide)}</option>` : "") + liste.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(choisi ?? "") ? " selected" : ""}>${esc(l)}</option>`).join("");
  const optManches = choisi => options(manches().map(m => [m.course_id, nomManche(m)]), choisi);
  const optPilotes = (choisi, vide = "Choisir un pilote", liste = pilotes()) => options(liste.map(p => [p.pilote_id, p.pseudo]), choisi, vide);
  const champ = (nom, lib, val, type = "text", extra = "") => `<label>${esc(lib)}<input name="${nom}" type="${type}" value="${esc(val ?? "")}" ${extra}></label>`;
  const lireForm = f => Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));

  /* ---------- Manches ---------- */
  function vueManches() {
    const ms = manches();
    const choisie = ui.manche === "nouvelle" ? null : ms.find(m => m.course_id === ui.manche);
    const liste = `<table class="adm-table"><thead><tr><th>Manche</th><th>Date</th><th>Circuit</th><th>Type</th><th>Statut</th><th>Réglages</th><th></th></tr></thead><tbody>
      ${ms.map(m => `<tr${choisie && choisie.course_id === m.course_id ? ' class="on"' : ""}><td>M${m.manche}</td><td>${esc(m.date)}</td><td>${esc(circuit(m.circuit_id).nom || m.circuit_id)}</td><td>${esc(m.type)}</td><td>${esc(m.statut || "")}</td>
        <td>${m.reglages_caches ? "🔒 cachés" : yes(m.reglages_visibles) ? "visibles" : no(m.reglages_visibles) ? "cachés (forcé)" : "auto"}</td><td><button type="button" class="lien" data-edit="${esc(m.course_id)}">Modifier</button></td></tr>`).join("")}
      </tbody></table>`;
    return `<div class="adm-head"><h1>Manches <small>${esc(saison)}</small></h1><div class="adm-actions">${choixSaison()}<button type="button" class="btn" data-new>+ Nouvelle manche</button></div></div>
      <p class="muted">Les réglages (heure, usure, carburant…) restent cachés sur le site jusqu'à ${esc(cfg().reglages_jours_avant || 7)} jours avant la course (Config.reglages_jours_avant), sauf choix « Toujours visibles ».</p>
      ${ui.manche ? formManche(choisie) : ""}${liste}`;
  }
  function formManche(m) {
    const ms = manches(), dern = ms[ms.length - 1] || {};
    const nouveau = !m;
    // Nouvelle manche : réglages copiés de la dernière, 2 semaines plus tard
    const base = m || Object.assign({}, dern, { course_id: "", manche: (dern.manche || 0) + 1, date: dern.date ? new Date(new Date(dern.date + "T12:00").getTime() + 14 * 864e5).toISOString().slice(0, 10) : "", statut: "À venir", circuit_id: "", type: "Course", reglages_visibles: "" });
    const cats = D.Manches_Categories.filter(x => x.course_id === (m || dern).course_id);
    const cat = id => cats.find(x => x.categorie_id === id) || {};
    return `<form class="adm-card" id="fManche"><h2>${nouveau ? "Nouvelle manche" : "Modifier " + esc(nomManche(m))}</h2>
      <input type="hidden" name="course_id" value="${esc(m ? m.course_id : "")}">
      <div class="adm-grid">
        ${champ("manche", "Numéro", base.manche, "number", 'min="0" required')}
        <label>Type<select name="type">${options(["Course", "Finale", "Spéciale", "Tryout"].map(t => [t, t]), base.type)}</select></label>
        ${champ("date", "Date", base.date, "date", "required")}${champ("date_fin", "Date de fin (tryouts)", m ? m.date_fin : "", "date")}
        <label class="wide">Circuit<select name="circuit_id" required>${options(D.Circuits.slice().sort((a, b) => String(a.nom).localeCompare(String(b.nom), "fr")).map(c => [c.circuit_id, c.nom + (c.layout && c.layout !== "Complet" ? " · " + c.layout : "")]), base.circuit_id, "Choisir")}</select></label>
        ${champ("groupe_voiture", "Voitures", base.groupe_voiture)}
        <label>Statut<select name="statut">${options(["À venir", "Terminée", "Annulée", "Reportée"].map(t => [t, t]), base.statut)}</select></label>
        <label>Publier sur le site<select name="publier">${options([["TRUE", "Oui"], ["FALSE", "Non"]], no(base.publier) ? "FALSE" : "TRUE")}</select></label>
        <label>Compte pour les pilotes<select name="points_pilotes">${options([["TRUE", "Oui"], ["FALSE", "Non"]], no(base.points_pilotes) ? "FALSE" : "TRUE")}</select></label>
      </div>
      <h3>Réglages de course</h3>
      <div class="adm-grid">${REGLAGES.map(([k, l]) => champ(k, l, base[k])).join("")}
        <label class="wide">Visibilité sur le site<select name="reglages_visibles">${options([["", `Auto : dévoilés ${cfg().reglages_jours_avant || 7} jours avant`], ["TRUE", "Toujours visibles"], ["FALSE", "Cachés jusqu'à la course"]], String(base.reglages_visibles ?? "").toUpperCase())}</select></label>
      </div>
      ${m && m.reglages_caches ? '<p class="warn">Ces réglages viennent de la copie publique (cachés) : en mode démo, les champs vides ne veulent pas dire que le Sheet est vide.</p>' : ""}
      <h3>Lobbys</h3>
      <div class="adm-grid">${["D1", "D2"].map(c => `${champ("heure_" + c, `Départ ${c}`, cat(c).heure_depart, "time")}${champ("duree_" + c, `Durée ${c}`, cat(c).duree, "text", 'placeholder="~40 min"')}${champ("tours_" + c, `Tours ${c}`, cat(c).tours, "number")}`).join("")}</div>
      ${champ("note_publique", "Note publique", base.note_publique, "text", 'class="wide"')}
      <div class="adm-actions"><button class="btn" type="submit">Enregistrer</button><button class="btn ghost" type="button" data-cancel>Annuler</button></div></form>`;
  }

  /* ---------- Résultats et pénalités ---------- */
  function vueResultats() {
    const m = D.Manches.find(x => x.course_id === ui.res) || prochaine();
    if (!m) return "<p>Aucune manche.</p>";
    ui.res = m.course_id; ui.lobby = ui.lobby || "D1";
    // Un brouillon par manche et lobby : changer de lobby ou de manche ne perd rien. Tant qu'il n'est pas modifié,
    // il suit le classeur (données rechargées après chaque enregistrement).
    const cle = m.course_id + ui.lobby;
    ui.brouillons = ui.brouillons || {};
    if (!ui.brouillons[cle] || !ui.brouillons[cle].modifie) {
      const ex = resultatsDe(m.course_id).filter(r => (r.categorie_id || "") === ui.lobby).sort((a, b) => a.position - b.position);
      ui.brouillons[cle] = { cle, lignes: ex.map(r => ({ pilote_id: r.pilote_id, statut: r.statut || "Classé", meilleur_tour: yes(r.meilleur_tour), note: r.note || "" })) };
    }
    const b = ui.brouillon = ui.brouillons[cle];
    const enCours = c => ui.brouillons[m.course_id + c] && ui.brouillons[m.course_id + c].modifie;
    // Pilotes proposés : le lobby, les remplaçants prévus pour cette manche, puis les réserves
    const rempl = D.Remplacements.filter(r => r.course_id === m.course_id && r.remplacant_id && (!r.categorie_id || r.categorie_id === ui.lobby)).map(r => r.remplacant_id);
    const duLobby = titulaires().filter(e => lobbyDe(e.pilote_id, m.manche) === ui.lobby).map(e => e.pilote_id);
    const proposes = [...new Set([...duLobby, ...rempl, ...reserves().map(e => e.pilote_id)])];
    const liste = [...proposes.map(id => D.Pilotes.find(p => p.pilote_id === id)).filter(Boolean), ...pilotes().filter(p => !proposes.includes(p.pilote_id))];
    const bonus = Number(cfg().points_meilleur_tour) || 0;
    const pens = ui.pens && ui.pens.cle === m.course_id ? ui.pens : (ui.pens = { cle: m.course_id, lignes: D.Penalites.filter(p => p.course_id === m.course_id).map(p => ({ ...p })) });
    return `<div class="adm-head"><h1>Résultats</h1><div class="adm-actions"><select id="resManche">${optManches(m.course_id)}</select>
        <div class="seg" id="resLobby">${["D1", "D2"].map(c => `<button type="button" data-lobby="${c}" aria-pressed="${ui.lobby === c}">Lobby ${c.slice(1)}${enCours(c) ? " · non enregistré" : ""}</button>`).join("")}</div></div></div>
      <div class="adm-cols">
        <div class="adm-card"><h2>Lire une capture du jeu</h2>
          <p class="muted">Capture ou photo de l'écran des résultats de GT7 (plusieurs si le tableau tient sur 2 pages). Positions, DNF et meilleur tour sont remplis dans le tableau ; tu vérifies avant d'enregistrer.</p>
          <label class="drop" id="dropLu"><input type="file" id="luFichiers" accept="image/jpeg,image/png,image/webp" multiple hidden>
            <b>Glisse la capture des résultats ici</b><span>ou clique pour la choisir</span></label>
          <p class="muted" id="luEtat"></p>
          <h2>Ou coller le classement</h2>
          <p class="muted">Un pilote par ligne, dans l'ordre d'arrivée (pseudo, ou « 3, pseudo »). Ajoute DNF / DNS / DSQ et MT (meilleur tour) sur la ligne au besoin. Fichier CSV ou texte accepté.</p>
          <textarea id="colle" rows="8" placeholder="Jaynord MT&#10;AMS_Lookie22&#10;Flagman DNF"></textarea>
          <div class="adm-actions"><button type="button" class="btn ghost" id="lireColle">Remplir le tableau</button><label class="btn ghost file">Fichier…<input type="file" id="fichier" accept=".csv,.txt,text/plain,text/csv" hidden></label></div>
          <p class="warn" id="inconnus" hidden></p>
        </div>
        <div class="adm-card"><h2>${esc(nomManche(m))} · Lobby ${ui.lobby.slice(1)}</h2>
          <table class="adm-table"><thead><tr><th>Pos.</th><th>Pilote</th><th>Statut</th><th>MT</th><th>Pts</th><th>Note</th><th></th></tr></thead><tbody>
          ${b.lignes.map((l, i) => {
            const pts = l.statut === "Classé" ? ptsPosition(ui.lobby, i + 1) + (l.meilleur_tour ? bonus : 0) : 0;
            return `<tr data-i="${i}" class="${l.lu && !l.pilote_id ? "manque" : ""}"><td>${i + 1}</td><td><select data-k="pilote_id">${optPilotes(l.pilote_id, "Choisir", liste)}</select>${l.lu ? `<small class="lu">lu : ${esc(l.lu)}</small>` : ""}</td>
              <td><select data-k="statut">${options(STATUTS_RES.map(s => [s, s]), l.statut)}</select></td>
              <td><input type="radio" name="mt" data-k="meilleur_tour" ${l.meilleur_tour ? "checked" : ""} aria-label="Meilleur tour"></td><td class="num">${pts}</td>
              <td><input data-k="note" value="${esc(l.note)}" placeholder="ex. Remplace X"></td>
              <td class="nowrap"><button type="button" class="lien" data-up="${i}" aria-label="Monter">↑</button><button type="button" class="lien" data-down="${i}" aria-label="Descendre">↓</button><button type="button" class="lien" data-del="${i}" aria-label="Retirer">✕</button></td></tr>`;
          }).join("") || `<tr><td colspan="7" class="muted">Aucun résultat : colle le classement ou ajoute les pilotes.</td></tr>`}</tbody></table>
          <div class="adm-actions"><button type="button" class="btn ghost" id="ajLigne">+ Pilote</button><button type="button" class="btn ghost" id="ajLobby">Ajouter tout le lobby</button></div>
          <label class="check"><input type="checkbox" id="terminer" ${m.statut === "Terminée" ? "checked" : ""}> Marquer la manche comme terminée</label>
          <div class="adm-actions"><button type="button" class="btn" id="saveRes">Enregistrer les résultats</button>${b.modifie ? `<span class="warn-txt">Modifications non enregistrées</span><button type="button" class="lien" id="annulerRes">Annuler les modifications</button>` : ""}<span class="muted">Points calculés avec le barème du lobby${bonus ? ` (+${bonus} meilleur tour)` : ""}.</span></div>
          ${blocVerif(m.course_id, ui.lobby)}
        </div>
      </div>
      <div class="adm-card"><h2>Pénalités de la manche</h2>
        <table class="adm-table"><thead><tr><th>Pilote</th><th>Type</th><th>Points / secondes</th><th>Motif</th><th>Publique</th><th></th></tr></thead><tbody>
        ${pens.lignes.map((p, i) => `<tr data-p="${i}"><td><select data-k="pilote_id">${optPilotes(p.pilote_id, "Choisir")}</select></td>
          <td><select data-k="type">${options(["Points", "Temps", "Avertissement"].map(t => [t, t]), p.type)}</select></td>
          <td><input data-k="${p.type === "Temps" ? "secondes" : "points"}" type="number" value="${esc(p.type === "Temps" ? p.secondes : Math.abs(p.points || 0))}" ${p.type === "Avertissement" ? "disabled" : ""}></td>
          <td><input data-k="motif" value="${esc(p.motif)}"></td><td><input type="checkbox" data-k="publier" ${no(p.publier) ? "" : "checked"}></td>
          <td><button type="button" class="lien" data-pdel="${i}">✕</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">Aucune pénalité.</td></tr>`}</tbody></table>
        <div class="adm-actions"><button type="button" class="btn ghost" id="ajPen">+ Pénalité</button><button type="button" class="btn" id="savePen">Enregistrer les pénalités</button></div>
      </div>`;
  }
  /** Lit le texte collé : une ligne par pilote, statut (DNF…) et MT reconnus, pseudos rapprochés sans accents ni symboles. */
  /** Nom lu (PSN ou pseudo) → pilote : onglet privé _PSN d'abord, puis le pseudo sans accents ni symboles. */
  function trouverPilote(nom) {
    const n = norm(nom);
    if (!n) return "";
    const lien = D._PSN.find(x => norm(x.psn) === n);
    if (lien) return lien.pilote_id;
    // PSN de la fiche (Pilotes.psn, plusieurs séparés par « / »)
    const parPsn = D.Pilotes.find(x => String(x.psn || "").split(/[\/,;]/).some(v => norm(v) === n));
    if (parPsn) return parPsn.pilote_id;
    const p = D.Pilotes.find(x => norm(x.pseudo) === n || norm(x.pilote_id) === n)
      || D.Pilotes.find(x => n.length > 3 && norm(x.pseudo).length > 3 && (norm(x.pseudo).includes(n) || n.includes(norm(x.pseudo))));
    return p ? p.pilote_id : "";
  }
  /** Lignes lues sur une ou plusieurs captures (fusionnées par position) → tableau des résultats. */
  function appliquerLecture(lues) {
    const parPos = new Map();
    lues.forEach(l => { if (!parPos.has(l.position)) parPos.set(l.position, l); });
    const lignes = [...parPos.values()].sort((a, b) => a.position - b.position);
    // Meilleur tour : le plus petit temps parmi les pilotes classés (format m:ss.xxx)
    const sec = t => { const m = /^(?:(\d+):)?(\d{1,2})[.,](\d{1,3})$/.exec(String(t || "").trim()); return m ? (Number(m[1] || 0) * 60 + Number(m[2]) + Number("0." + m[3])) : Infinity; };
    const mt = lignes.filter(l => l.statut === "Classé").reduce((best, l) => sec(l.meilleur_tour) < sec(best && best.meilleur_tour) ? l : best, null);
    // La position enregistrée est le rang dans le tableau : une position illisible garde sa ligne (à compléter),
    // sinon tous les pilotes suivants seraient remontés d'une place
    const derniere = lignes.length ? lignes[lignes.length - 1].position : 0, trous = [];
    const lu = new Map(lignes.map(l => [l.position, l]));
    ui.brouillon.lignes = [];
    for (let pos = 1; pos <= derniere; pos++) {
      const l = lu.get(pos);
      if (!l) { trous.push(pos); ui.brouillon.lignes.push({ pilote_id: "", lu: `position ${pos} illisible`, illisible: true, statut: "Classé", meilleur_tour: false, note: "" }); continue; }
      ui.brouillon.lignes.push({ pilote_id: trouverPilote(l.nom), lu: l.nom, statut: l.statut, meilleur_tour: !!mt && sec(mt.meilleur_tour) < Infinity && l === mt, note: "" });
    }
    ui.brouillon.modifie = true;
    render();
    const manquants = ui.brouillon.lignes.filter(l => !l.pilote_id && !l.illisible).length;
    toast(`${lignes.length} pilotes lus${trous.length ? `, position${trous.length > 1 ? "s" : ""} ${trous.join(", ")} illisible${trous.length > 1 ? "s" : ""} (choisis le pilote d'après la capture)` : ""}${manquants ? `, ${manquants} à associer (choisis le pilote : il sera retenu pour les prochaines fois)` : ""}. Vérifie avant d'enregistrer.`, manquants || trous.length ? "warn" : "ok");
  }
  async function lireCaptures(fichiers) {
    const liste = [...fichiers].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!liste.length) return toast("Choisis des captures JPEG, PNG ou WebP.", "err");
    if (demo) return toast("Mode démo : la lecture des captures se fait par le serveur (clé Gemini), disponible une fois l'admin en ligne.", "warn");
    const etat = $("luEtat"), lues = [], images = [];
    for (const [i, f] of liste.entries()) {
      etat.textContent = `Lecture ${i + 1} / ${liste.length} : ${f.name}…`;
      try {
        const img = await reduire(f);
        images.push(img);
        const rep = await fetch("/api/resultats/lire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: img.data, mime: img.mime }) });
        const r = await rep.json();
        if (!r.ok) throw new Error({ lecture_indisponible: "clé Gemini absente du Worker", quota: "quota Gemini atteint, réessaie dans une minute" }[r.erreur] || r.erreur);
        if (!r.lecture.lisible) throw new Error("tableau des résultats introuvable sur l'image");
        lues.push(...r.lecture.lignes);
      } catch (err) { toast(`${f.name} : ${err.message}`, "err"); }
    }
    etat.textContent = "";
    // Gardées pour la vérification : envoyées avec les résultats, elles remplacent la capture précédente
    if (lues.length) { ui.capturesLues = { cle: ui.res + ui.lobby, images }; appliquerLecture(lues); }
  }
  /** Envoie les captures lues (source « Résultats », privées) une fois les résultats enregistrés. */
  async function garderCaptures(cid, cat) {
    const c = ui.capturesLues;
    if (!c || c.cle !== cid + cat) return;
    const lot = String(Date.now());
    for (const img of c.images) {
      try {
        const rep = await fetch("/api/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: cid, categorie_id: cat, source: "Résultats", lot, data: img.data, mime: img.mime }) });
        const r = await rep.json();
        if (!r.ok) throw new Error(r.erreur || "erreur");
      } catch (err) { toast("Capture de vérification non gardée : " + err.message, "err"); return; }
    }
    ui.capturesLues = null;
  }
  async function voirCapture(id, bouton) {
    bouton.disabled = true; bouton.textContent = "Chargement…";
    try {
      const rep = await fetch("/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo_id: id }) });
      const r = await rep.json();
      if (!r.ok) throw new Error(r.erreur || "erreur");
      const img = document.createElement("img");
      img.className = "verif-img"; img.alt = "Capture de vérification"; img.src = `data:${r.mime};base64,${r.data}`;
      bouton.replaceWith(img);
    } catch (err) { bouton.disabled = false; bouton.textContent = "Réessayer"; toast("Capture illisible : " + err.message, "err"); }
  }
  /** Bloc « capture de vérification » sous le tableau des résultats. */
  function blocVerif(cid, cat) {
    const enAttente = ui.capturesLues && ui.capturesLues.cle === cid + cat ? ui.capturesLues.images : [];
    const gardees = D.Photos.filter(p => p.course_id === cid && (p.categorie_id || "") === cat && p.source === "Résultats");
    if (!enAttente.length && !gardees.length) return "";
    return `<div class="verif"><h3>Capture de vérification</h3>
      ${enAttente.length ? `<div class="verif-grid">${enAttente.map(i => `<img class="verif-img" src="${i.apercu}" alt="Capture lue">`).join("")}</div>
        <p class="muted">Sera gardée à l'enregistrement et remplacera la précédente${gardees.length ? ` (du ${esc(gardees[0].ajoute_le)})` : ""}. Privée : jamais affichée sur le site.</p>`
      : `<p class="muted">Dernière capture, gardée le ${esc(gardees[0].ajoute_le)} (privée).</p>
        <div class="verif-grid">${gardees.map((p, i) => `<button type="button" class="btn ghost" data-verif="${esc(p.photo_id)}">Voir${gardees.length > 1 ? " la page " + (i + 1) : " la capture"}</button>`).join("")}</div>`}</div>`;
  }
  function lireClassement(texte) {
    const inconnus = [], lignes = [];
    texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
      const morceaux = l.split(/[,;\t]/).map(s => s.trim()).filter(Boolean);
      let statut = "Classé", mt = false;
      const mots = morceaux.filter(s => {
        if (/^(dnf|dns|dsq)$/i.test(s)) { statut = s.toUpperCase(); return false; }
        if (/^(mt|fl|meilleur tour)$/i.test(s)) { mt = true; return false; }
        return !/^\d{1,2}(e|er)?\.?$/i.test(s);
      });
      let nom = mots.join(" ");
      const fin = nom.match(/\s+(DNF|DNS|DSQ|MT)$/i);
      if (fin) { if (/MT/i.test(fin[1])) mt = true; else statut = fin[1].toUpperCase(); nom = nom.slice(0, fin.index); }
      nom = nom.replace(/^\d{1,2}(e|er)?[.)]?\s+/i, "");
      if (!nom) return;
      // Un pseudo inconnu garde sa ligne (à associer) : le retirer remonterait tous les pilotes suivants
      const id = trouverPilote(nom);
      lignes.push({ pilote_id: id, lu: nom, statut, meilleur_tour: mt, note: "" });
      if (!id) inconnus.push(nom);
    });
    return { lignes, inconnus };
  }

  /* ---------- Grille des lobbys ---------- */
  function vueGrille() {
    const t = totaux(), tb = ptsBloc(), b2 = bloc();
    const tit = titulaires().map(e => ({ id: e.pilote_id, pts: Math.round((t[e.pilote_id] || 0) * 10) / 10, bloc: Math.round((tb[e.pilote_id] || 0) * 10) / 10, actuel: lobbyDe(e.pilote_id, (Number(ui.grilleDe || (comptees().find(m => !resultatsDe(m.course_id).length) || {}).manche) || 99) - 1) }))
      .sort((a, b) => (a.actuel || "D9").localeCompare(b.actuel || "D9") || b.bloc - a.bloc || b.pts - a.pts);
    const rangs = {};
    tit.forEach(r => { rangs[r.actuel] = (rangs[r.actuel] || 0) + 1; r.rang = `${r.actuel || "?"} · ${rangs[r.actuel]}`; });
    const faites = comptees().filter(m => resultatsDe(m.course_id).length).length;
    const suivante = comptees().find(m => !resultatsDe(m.course_id).length);
    const aPartir = ui.grilleDe || (suivante ? suivante.manche : "");
    if (!ui.prop || ui.prop.cle !== saison + aPartir) ui.prop = { cle: saison + aPartir, choix: proposer(tit) };
    const zonesUp = bareme("D2").filter(b => /mont/i.test(b.zone || "")).length, zonesDown = bareme("D1").filter(b => /desc/i.test(b.zone || "")).length;
    const hist = [...new Set(D.Grilles.filter(g => g.saison_id === saison).map(g => g.a_partir_de))].sort((a, b) => b - a);
    return `<div class="adm-head"><h1>Grille des lobbys <small>${esc(saison)}</small></h1><div class="adm-actions">${choixSaison()}</div></div>
      <p class="muted">Révision aux 2 manches (${faites} manche${faites > 1 ? "s" : ""} comptée${faites > 1 ? "s" : ""}). Proposition d'après les points des 2 dernières manches${b2.length ? " (" + b2.map(m => "M" + m.manche).join(" et ") + ")" : ""}, au plus ${Math.min(zonesUp, zonesDown) || 3} changements, souvent aucun : le meilleur du Lobby 2 prend la place du dernier du Lobby 1 seulement s'il a plus de points sur ces 2 manches (puis le 2e contre l'avant-dernier, etc.). Tu peux tout changer avant de publier : la décision reste à l'administration.</p>
      <div class="adm-card">
        <div class="adm-actions"><label class="inline">Grille valide à partir de la manche <input type="number" id="grilleDe" min="1" value="${esc(aPartir)}"></label>
          <button type="button" class="btn ghost" id="reprop">Refaire la proposition</button></div>
        <table class="adm-table"><thead><tr><th>Rang lobby</th><th>Pilote</th><th>Pts 2 dernières</th><th>Pts saison</th><th>Lobby actuel</th><th>Nouveau lobby</th><th>Mouvement</th></tr></thead><tbody>
        ${tit.map(r => { const n = ui.prop.choix[r.id] || r.actuel; const mv = mouvement(r.actuel, n);
          return `<tr class="${mv ? "move" : ""}"><td>${r.rang}</td><td>${esc(pseudo(r.id))}</td><td class="num">${r.bloc}</td><td class="num">${r.pts}</td><td>${esc(r.actuel || "?")}</td>
            <td><select data-g="${esc(r.id)}">${options([["D1", "Lobby 1"], ["D2", "Lobby 2"]], n)}</select></td><td>${mv ? (mv === "Montée" ? "▲ Montée" : "▼ Descente") : ""}</td></tr>`; }).join("")}</tbody></table>
        <div class="adm-actions"><button type="button" class="btn" id="saveGrille">Publier la grille</button><span class="muted">Le site public affiche le nouveau lobby de chaque pilote dans les 5 minutes.</span></div>
      </div>
      ${hist.length ? `<div class="adm-card"><h2>Grilles publiées</h2>${hist.map(h => { const g = D.Grilles.filter(x => x.saison_id === saison && x.a_partir_de === h); const mv = g.filter(x => x.mouvement);
        return `<p><b>Dès la manche ${esc(h)}</b> · ${esc((g[0] || {}).publie_le || "")} · ${mv.length ? mv.map(x => `${esc(pseudo(x.pilote_id))} ${x.mouvement === "Montée" ? "▲" : "▼"}`).join(", ") : "aucun changement"}</p>`; }).join("")}</div>` : ""}`;
  }
  const mouvement = (avant, apres) => avant && apres && avant !== apres ? (apres === "D1" ? "Montée" : "Descente") : "";
  /** Les 2 dernières manches comptées avec résultats : le bloc qui décide des montées et descentes. */
  const bloc = () => comptees().filter(m => resultatsDe(m.course_id).length).slice(-2);
  function ptsBloc() {
    const t = {};
    for (const m of bloc()) {
      for (const r of resultatsDe(m.course_id)) t[r.pilote_id] = (t[r.pilote_id] || 0) + (Number(r.points) || 0) + (Number(r.points_bonus) || 0);
      for (const p of D.Penalites.filter(x => x.course_id === m.course_id && typeof x.points === "number")) t[p.pilote_id] = (t[p.pilote_id] || 0) + p.points;
    }
    return t;
  }
  // Uniquement les points des 2 dernières manches, maximum 3 changements, souvent 0. Le barème du Lobby 1
  // est plus élevé (même le dernier y fait ~17 pts) : un pilote du Lobby 2 ne dépasse un pilote du Lobby 1
  // que si celui-ci a perdu des points (course manquée, DNF, pénalité). On échange le meilleur du Lobby 2
  // avec le dernier du Lobby 1 tant que le premier a strictement plus de points. L'administration valide.
  function proposer(tit) {
    const max = Math.min(bareme("D2").filter(b => /mont/i.test(b.zone || "")).length, bareme("D1").filter(b => /desc/i.test(b.zone || "")).length) || 3;
    const choix = Object.fromEntries(tit.map(r => [r.id, r.actuel || "D2"]));
    const d1 = tit.filter(r => r.actuel === "D1").sort((a, b) => a.bloc - b.bloc || a.pts - b.pts);
    const d2 = tit.filter(r => r.actuel !== "D1").sort((a, b) => b.bloc - a.bloc || b.pts - a.pts);
    for (let i = 0; i < max && i < d1.length && i < d2.length && d2[i].bloc > d1[i].bloc; i++) { choix[d2[i].id] = "D1"; choix[d1[i].id] = "D2"; }
    return choix;
  }

  /* ---------- Réserves ---------- */
  function vueReserves() {
    const m = D.Manches.find(x => x.course_id === ui.abs) || prochaine();
    ui.abs = m && m.course_id;
    const rs = reserves();
    const engages = new Set(engagements().map(e => e.pilote_id));
    if (!ui.absBrouillon || ui.absBrouillon.cle !== ui.abs) {
      ui.absBrouillon = { cle: ui.abs, lignes: Object.fromEntries(D.Remplacements.filter(r => r.course_id === ui.abs).map(r => [r.absent_id, { remplacant_id: r.remplacant_id || "", note: r.note || "" }])) };
    }
    const a = ui.absBrouillon.lignes;
    const pris = new Set(Object.values(a).map(x => x.remplacant_id).filter(Boolean));
    return `<div class="adm-head"><h1>Réserves <small>${esc(saison)}</small></h1><div class="adm-actions">${choixSaison()}</div></div>
      <div class="adm-cols reserves">
        <div class="adm-card"><h2>Pilotes de réserve</h2><p class="muted">Ordre de priorité pour les remplacements (1 = appelé en premier).</p>
          <table class="adm-table"><thead><tr><th>Ordre</th><th>Pilote</th><th class="num">Rempl.</th><th></th></tr></thead><tbody>
          ${rs.map(e => `<tr><td><input type="number" min="1" class="court" data-ordre="${esc(e.pilote_id)}" value="${esc(e.ordre_reserve ?? "")}"></td><td>${esc(pseudo(e.pilote_id))}</td>
            <td class="num">${D.Remplacements.filter(r => r.remplacant_id === e.pilote_id && String(r.course_id).startsWith(saison)).length}</td>
            <td class="nowrap"><select data-promo="${esc(e.pilote_id)}"><option value="">Promouvoir…</option><option value="D1">Titulaire Lobby 1</option><option value="D2">Titulaire Lobby 2</option><option value="retirer">Retirer des réserves</option></select></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Aucun pilote de réserve.</td></tr>`}</tbody></table>
          <div class="adm-actions"><select id="nouvRes">${optPilotes("", "Ajouter un pilote…", pilotes().filter(p => !engages.has(p.pilote_id) && !no(p.actif)))}</select><button type="button" class="btn ghost" id="ajRes">Ajouter</button><button type="button" class="btn" id="saveOrdre">Enregistrer l'ordre</button></div>
        </div>
        <div class="adm-card"><h2>Absences et remplaçants</h2>
          ${m ? `<div class="adm-actions"><select id="absManche">${optManches(ui.abs)}</select><button type="button" class="btn ghost" id="autoRes">Assigner les réserves dans l'ordre</button></div>
          ${["D1", "D2"].map(cat => `<h3>Lobby ${cat.slice(1)}</h3><table class="adm-table"><tbody>
            ${titulaires().filter(e => lobbyDe(e.pilote_id, m.manche) === cat).map(e => { const x = a[e.pilote_id]; return `<tr class="${x ? "move" : ""}"><td><label class="check"><input type="checkbox" data-absent="${esc(e.pilote_id)}" data-cat="${cat}" ${x ? "checked" : ""}> ${esc(pseudo(e.pilote_id))}</label></td>
              <td>${x ? `<select data-rempl="${esc(e.pilote_id)}">${options(rs.filter(r => r.pilote_id === x.remplacant_id || !pris.has(r.pilote_id)).map(r => [r.pilote_id, pseudo(r.pilote_id)]), x.remplacant_id, "À combler")}</select>` : ""}</td></tr>`; }).join("")}</tbody></table>`).join("")}
          <div class="adm-actions"><button type="button" class="btn" id="saveAbs">Enregistrer les absences</button></div>` : "<p>Aucune manche.</p>"}
        </div>
      </div>`;
  }

  /* ---------- Pilotes ---------- */
  function vuePilotes() {
    const q = norm(ui.q || "");
    const ps = pilotes().filter(p => !q || norm(p.pseudo).includes(q) || norm(p.twitch).includes(q) || norm(p.psn).includes(q));
    const p = ui.pilote === "nouveau" ? {} : D.Pilotes.find(x => x.pilote_id === ui.pilote);
    return `<div class="adm-head"><h1>Pilotes <small>${D.Pilotes.length}</small></h1><div class="adm-actions"><input type="search" id="q" placeholder="Rechercher" value="${esc(ui.q || "")}"><button type="button" class="btn" data-pnew>+ Nouveau pilote</button></div></div>
      <p class="muted">Cet onglet est publié : pseudo et PSN seulement, aucun nom réel ni courriel. Le PSN aide à reconnaître les captures de résultats ; la chaîne Twitch fait apparaître le pilote sur GTQC TV.</p>
      ${ui.pilote ? `<form class="adm-card" id="fPilote"><h2>${p.pilote_id ? "Modifier " + esc(p.pseudo) : "Nouveau pilote"}</h2><input type="hidden" name="pilote_id" value="${esc(p.pilote_id || "")}">
        <div class="adm-grid">${champ("pseudo", "Pseudo (Discord)", p.pseudo, "text", "required")}${champ("numero", "Numéro", p.numero, "number")}${champ("region", "Région", p.region)}
          <label>Contrôle<select name="controle">${options([["Volant", "Volant"], ["Manette", "Manette"]], p.controle, "?")}</select></label>${champ("driver_rating", "Driver Rating", p.driver_rating)}
          ${champ("psn", "PSN (plusieurs : séparer par /)", p.psn)}${champ("twitch", "Chaîne Twitch", p.twitch, "text", 'placeholder="nom ou twitch.tv/nom"')}${champ("avatar", "Avatar (fichier ajouté au site par le webmestre)", p.avatar, "text", 'placeholder="vide = casque GTQC"')}
          <label>Actif<select name="actif">${options([["TRUE", "Oui"], ["FALSE", "Non"]], no(p.actif) ? "FALSE" : "TRUE")}</select></label>
          ${(() => { const e = engagements().find(y => y.pilote_id === p.pilote_id) || {};
            return `<label>Rôle en ${esc(saison)}<select name="role">${options([["Titulaire", "Titulaire"], ["Réserve", "Réserve"], ["Inactif", "Inactif"]], e.role, "Pas inscrit")}</select></label>
            <label>Lobby (titulaire)<select name="lobby">${options([["D1", "Lobby 1"], ["D2", "Lobby 2"]], e.role === "Titulaire" ? lobbyDe(p.pilote_id) : "", "Choisir")}</select></label>`; })()}
          <label class="wide">Bio<textarea name="bio" rows="2">${esc(p.bio || "")}</textarea></label></div>
        <div class="adm-actions"><button class="btn" type="submit">Enregistrer</button><button class="btn ghost" type="button" data-pcancel>Annuler</button></div></form>` : ""}
      <table class="adm-table"><thead><tr><th>Pseudo</th><th>PSN</th><th>Lobby</th><th>Contrôle</th><th>DR</th><th>Twitch</th><th>Actif</th><th></th></tr></thead><tbody>
      ${ps.map(x => { const e = engagements().find(y => y.pilote_id === x.pilote_id); return `<tr><td>${esc(x.pseudo)}</td><td>${esc(x.psn || "")}</td><td>${esc(e ? (e.role === "Réserve" ? "Réserve" : lobbyDe(x.pilote_id)) : "")}</td><td>${esc(x.controle || "")}</td><td>${esc(x.driver_rating || "")}</td>
        <td>${x.twitch ? `<a href="https://www.twitch.tv/${esc(x.twitch)}" target="_blank" rel="noopener">${esc(x.twitch)}</a>` : ""}</td><td>${no(x.actif) ? "Non" : "Oui"}</td><td><button type="button" class="lien" data-pedit="${esc(x.pilote_id)}">Modifier</button></td></tr>`; }).join("")}</tbody></table>`;
  }

  /* ---------- VOD ---------- */
  function vueVods() {
    const passees = manches().filter(m => m.statut === "Terminée" || resultatsDe(m.course_id).length);
    const m = D.Manches.find(x => x.course_id === ui.vod) || passees[passees.length - 1] || manches()[0];
    if (!m) return "<p>Aucune manche.</p>";
    ui.vod = m.course_id;
    if (!ui.vodB || ui.vodB.cle !== m.course_id) ui.vodB = { cle: m.course_id, lignes: D.Vods.filter(v => v.course_id === m.course_id).sort((a, b) => a.ordre - b.ordre).map(v => ({ ...v })) };
    const sans = passees.filter(x => !D.Vods.some(v => v.course_id === x.course_id));
    return `<div class="adm-head"><h1>Rediffusions</h1><div class="adm-actions"><select id="vodManche">${optManches(m.course_id)}</select></div></div>
      ${sans.length ? `<p class="warn">Manches terminées sans VOD : ${sans.map(x => "M" + x.manche).join(", ")}</p>` : ""}
      <div class="adm-card"><h2>${esc(nomManche(m))}</h2><p class="muted">Liens YouTube ou Twitch (VOD, extrait ou chaîne). La plateforme est reconnue d'après l'adresse.</p>
        <table class="adm-table"><thead><tr><th>Lobby</th><th>Titre</th><th>Adresse</th><th>Publique</th><th></th></tr></thead><tbody>
        ${ui.vodB.lignes.map((v, i) => `<tr data-v="${i}"><td><select data-k="categorie_id">${options([["D1", "Lobby 1"], ["D2", "Lobby 2"]], v.categorie_id, "Les deux")}</select></td>
          <td><input data-k="titre" value="${esc(v.titre)}" placeholder="ex. Diffusion avec commentateur"></td><td><input data-k="url" type="url" value="${esc(v.url)}" placeholder="https://youtu.be/… ou https://www.twitch.tv/videos/…"></td>
          <td><input type="checkbox" data-k="publier" ${no(v.publier) ? "" : "checked"}></td><td><button type="button" class="lien" data-vdel="${i}">✕</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Aucune rediffusion.</td></tr>`}</tbody></table>
        <div class="adm-actions"><button type="button" class="btn ghost" id="ajVod">+ Lien</button><button type="button" class="btn" id="saveVod">Enregistrer</button></div></div>`;
  }

  /* ---------- Captures des manches (jeu ou diffusion) ---------- */
  const srcPhoto = (p, w) => /^https:\/\/lh3\./.test(p.url) ? `${p.url}=w${w}` : p.url;
  function vuePhotos() {
    const ms = manches();
    const m = D.Manches.find(x => x.course_id === ui.ph) || ms.filter(x => x.statut === "Terminée" || resultatsDe(x.course_id).length).pop() || ms[0];
    if (!m) return "<p>Aucune manche.</p>";
    ui.ph = m.course_id;
    // Les captures de vérification des résultats (privées) sont dans l'onglet Résultats, pas ici
    if (!ui.phB || ui.phB.cle !== m.course_id) ui.phB = { cle: m.course_id, lignes: D.Photos.filter(p => p.course_id === m.course_id && p.source !== "Résultats").sort((a, b) => a.ordre - b.ordre).map(p => ({ ...p })) };
    const compte = ms.map(x => [x, D.Photos.filter(p => p.course_id === x.course_id && p.source !== "Résultats").length]);
    return `<div class="adm-head"><h1>Captures <small>${esc(saison)}</small></h1><div class="adm-actions">${choixSaison()}<select id="phManche">${optManches(m.course_id)}</select></div></div>
      <p class="muted">Captures du jeu (photo mode, podium, écran des résultats) ou de la diffusion. Elles s'affichent dans la fiche de la manche sur le site. Les images sont réduites à 1920 px avant l'envoi et rangées dans le dossier Drive « GTQC — Captures des manches ».</p>
      <p class="muted">${compte.map(([x, n]) => `<button type="button" class="lien${x.course_id === m.course_id ? " on" : ""}" data-phm="${esc(x.course_id)}">M${x.manche} (${n})</button>`).join(" ")}</p>
      <div class="adm-card"><h2>${esc(nomManche(m))}</h2>
        <div class="adm-actions"><label class="inline">Lobby <select id="phLobby">${options([["D1", "Lobby 1"], ["D2", "Lobby 2"]], ui.phLobby || "", "Les deux")}</select></label>
          <label class="inline">Source <select id="phSource">${options([["Jeu", "Jeu"], ["Diffusion", "Diffusion"]], ui.phSource || "Jeu")}</select></label></div>
        <label class="drop" id="drop"><input type="file" id="phFichiers" accept="image/jpeg,image/png,image/webp" multiple hidden>
          <b>Glisse les captures ici</b><span>ou clique pour les choisir (JPEG, PNG, WebP, plusieurs à la fois)</span></label>
        <p class="muted" id="phEtat"></p>
        <div class="ph-grid">${ui.phB.lignes.map((p, i) => `<figure class="ph" data-ph="${i}">
          <img src="${esc(srcPhoto(p, 480))}" alt="" loading="lazy">
          <input data-k="legende" value="${esc(p.legende || "")}" placeholder="Légende (facultatif)">
          <div class="adm-actions"><select data-k="categorie_id">${options([["D1", "Lobby 1"], ["D2", "Lobby 2"]], p.categorie_id, "Les deux")}</select>
            <label class="check"><input type="checkbox" data-k="publier" ${no(p.publier) ? "" : "checked"}> Visible</label></div>
          <div class="adm-actions"><button type="button" class="lien" data-phup="${i}" aria-label="Avant">←</button><button type="button" class="lien" data-phdown="${i}" aria-label="Après">→</button>
            <a class="lien" href="${esc(srcPhoto(p, 1920))}" target="_blank" rel="noopener">Voir</a><button type="button" class="lien" data-phdel="${i}">Retirer</button></div></figure>`).join("") || `<p class="muted">Aucune capture pour cette manche.</p>`}</div>
        <div class="adm-actions"><button type="button" class="btn" id="savePh">Enregistrer légendes et ordre</button><span class="muted">Une capture retirée va à la corbeille de Drive.</span></div>
      </div>`;
  }
  /** Réduit une image à 1920 px de large au plus, en JPEG (les PNG du jeu sont très lourds). */
  function reduire(fichier) {
    return new Promise((ok, ko) => {
      const img = new Image(), url = URL.createObjectURL(fichier);
      img.onload = () => {
        const k = Math.min(1, 1920 / img.naturalWidth), c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const data = c.toDataURL("image/jpeg", 0.86);
        ok({ data: data.split(",")[1], mime: "image/jpeg", apercu: data });
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error(fichier.name)); };
      img.src = url;
    });
  }
  async function envoyerPhotos(fichiers) {
    const liste = [...fichiers].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!liste.length) return toast("Choisis des images JPEG, PNG ou WebP.", "err");
    const etat = $("phEtat"), cid = ui.ph, cat = $("phLobby").value, source = $("phSource").value;
    let faits = 0;
    for (const f of liste) {
      etat.textContent = `Envoi ${faits + 1} / ${liste.length} : ${f.name}`;
      try {
        const img = await reduire(f);
        if (demo) { D.Photos.push({ photo_id: "demo-" + Date.now() + faits, course_id: cid, categorie_id: cat, url: img.apercu, legende: "", ordre: 99, publier: true, source }); faits++; continue; }
        const rep = await fetch("/api/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: cid, categorie_id: cat, source, data: img.data, mime: img.mime }) });
        const r = await rep.json();
        if (!r.ok) throw new Error(r.erreur || "erreur");
        D.Photos.push(r.photo); faits++;
      } catch (err) { toast(`${f.name} : échec (${err.message})`, "err"); }
    }
    ui.phB = null;
    if (!demo && faits) await charger();
    render();
    toast(demo ? `Mode démo : ${faits} capture(s) affichée(s), rien n'est enregistré.` : `${faits} capture(s) ajoutée(s).`, demo ? "warn" : "ok");
  }

  /* ---------- Inscriptions (onglet privé) ---------- */
  function vueInscriptions() {
    const filtre = ui.fi || "actives";
    const toutes = D._Inscriptions.slice().reverse();
    const liste = toutes.filter(x => filtre === "toutes" || (filtre === "actives" ? !["Refusée", "Archivée", "Acceptée"].includes(x.statut) : x.statut === filtre));
    const libType = { ligue: "Joindre la ligue", reserve: "Réserve", question: "Question" };
    return `<div class="adm-head"><h1>Inscriptions</h1><div class="adm-actions"><select id="fi">${options([["actives", "À traiter"], ["toutes", "Toutes"], ...STATUTS_INSCR.map(s => [s, s])], filtre)}</select></div></div>
      <p class="muted">Infos personnelles : visibles ici seulement (onglet _Inscriptions, jamais publié). Le pilote créé ne garde que le pseudo.</p>
      ${liste.map(x => { const existe = D.Pilotes.find(p => norm(p.pseudo) === norm(x.pseudo_discord)); return `<div class="adm-card inscr" data-id="${esc(x.id)}">
        <div class="adm-head"><h2>${esc(x.pseudo_discord)} <small>${esc(libType[x.type] || x.type)} · ${esc(x.recu_le)}</small></h2><span class="tag">${esc(x.statut || "Nouvelle")}</span></div>
        <dl class="kv">${[["Courriel", x.courriel], ["PSN", x.psn], ["Région", x.region], ["Contrôle", x.controle], ["Driver Rating", x.driver_rating], ["Twitch", x.twitch], ["Disponibilités", x.disponibilites], ["Expérience", x.experience], ["Message", x.message]].filter(k => k[1]).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        <div class="adm-actions"><select data-istatut>${options(STATUTS_INSCR.map(s => [s, s]), x.statut || "Nouvelle")}</select><input data-inote value="${esc(x.note_admin || "")}" placeholder="Note interne">
          <button type="button" class="btn ghost" data-isave>Enregistrer</button>
          ${existe ? `<span class="muted">Pilote existant : ${esc(existe.pseudo)}</span>` : `<button type="button" class="btn ghost" data-icreer="reserve">Créer comme réserve</button><button type="button" class="btn ghost" data-icreer="pilote">Créer comme titulaire</button>`}</div></div>`; }).join("") || `<p class="muted">Aucune demande.</p>`}`;
  }

  function vueJournal() {
    return `<div class="adm-head"><h1>Journal</h1></div><table class="adm-table"><thead><tr><th>Date</th><th>Admin</th><th>Action</th><th>Détails</th></tr></thead><tbody>
      ${D._Journal.map(j => `<tr><td class="nowrap">${esc(j.date)}</td><td>${esc(j.courriel)}</td><td>${esc(j.action)}</td><td>${esc(j.details)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">${demo ? "Pas de journal en mode démo." : "Rien pour l'instant."}</td></tr>`}</tbody></table>`;
  }

  /* ---------- Guide : une animation par onglet (refaites par outils/guide_admin_gifs.py) ---------- */
  const GUIDE = [
    ["manches", "Manches", "Créer et modifier le calendrier. « + Nouvelle manche » reprend la dernière manche, 2 semaines plus tard : il reste à choisir le circuit. Les réglages restent cachés sur le site jusqu'à 7 jours avant la course (mode « Auto »)."],
    ["resultats", "Résultats", "Choisis la manche et le lobby, puis glisse la capture de GT7 ou colle le classement (un pilote par ligne, MT, DNF, DNS, DSQ). Vérifie, corrige l'ordre, enregistre. Les pénalités se saisissent en bas de l'onglet."],
    ["grille", "Grille", "Proposition des montées et descentes d'après les 2 dernières manches (au plus 3 échanges, souvent aucun). Change ce que tu veux, indique la manche de départ, puis publie."],
    ["reserves", "Réserves", "À gauche : ordre d'appel des réserves et promotions. À droite : coche les absents de la manche, assigne les réserves dans l'ordre, enregistre."],
    ["pilotes", "Pilotes", "Liste publique : pseudos et PSN seulement, jamais de nom réel ni de courriel. « Modifier » ouvre la fiche (PSN, Twitch, rôle et lobby de la saison)."],
    ["vods", "VOD", "« + Lien » par rediffusion : lobby, titre et adresse YouTube ou Twitch (https://…)."],
    ["photos", "Captures", "Images de la manche affichées sur le site. Choisis le lobby et la source, glisse les images, ajoute une légende au besoin, enregistre."],
    ["inscriptions", "Inscriptions", "Demandes du formulaire « Rejoindre ». Fais avancer le statut, ajoute une note interne, ou crée le pilote (réserve ou titulaire) : seul le pseudo passe dans la fiche publique. Demande fictive dans l'animation."],
    ["journal", "Journal", "Lecture seule : qui a enregistré quoi, et quand. Entrées fictives dans l'animation."],
  ];
  function vueGuide() {
    return `<div class="adm-head"><h1>Guide</h1></div>
      <p class="muted">Une animation par onglet. Rien n'est enregistré tant que tu n'as pas cliqué sur le bouton Enregistrer de la section ; un message en bas de l'écran confirme ou explique l'échec.</p>
      <p class="guide-som">${GUIDE.map(([id, titre]) => `<button type="button" class="lien" data-guide="${id}">${titre}</button>`).join("")}</p>
      ${GUIDE.map(([id, titre, texte]) => `<section class="adm-card guide" id="g-${id}"><div class="adm-head"><h2>${titre}</h2><button type="button" class="btn ghost" data-aller="${id}">Ouvrir l'onglet</button></div>
        <p>${esc(texte)}</p><img src="guide/${id}.gif" alt="Animation : onglet ${titre}" loading="lazy" width="1280" height="720"></section>`).join("")}`;
  }

  const choixSaison = () => `<select id="saison">${options(D.Saisons.slice().sort((a, b) => b.saison_id.localeCompare(a.saison_id)).map(s => [s.saison_id, s.nom || s.saison_id]), saison)}</select>`;
  const VUES = { manches: vueManches, resultats: vueResultats, grille: vueGrille, reserves: vueReserves, pilotes: vuePilotes, vods: vueVods, photos: vuePhotos, inscriptions: vueInscriptions, journal: vueJournal, guide: vueGuide };

  function render() {
    document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
    const n = D._Inscriptions.filter(x => !x.statut || x.statut === "Nouvelle").length;
    $("nbInscr").textContent = n ? n : "";
    $("main").innerHTML = VUES[tab]();
    if (tab === "pilotes" && ui.focusQ) { const q = $("q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); ui.focusQ = false; }
  }

  /* ---------- Événements ---------- */
  $("tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.tab; try { localStorage.setItem("gtqcAdminTab", tab); } catch (err) {} history.replaceState(null, "", "#" + tab); render(); });
  const main = $("main");
  main.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "saison") { saison = t.value; ui.prop = null; ui.manche = null; return render(); }
    if (t.id === "resManche") { ui.res = t.value; return render(); }
    if (t.id === "absManche") { ui.abs = t.value; ui.absBrouillon = null; return render(); }
    if (t.id === "vodManche") { ui.vod = t.value; ui.vodB = null; return render(); }
    if (t.id === "phManche") { ui.ph = t.value; ui.phB = null; return render(); }
    if (t.id === "phLobby") { ui.phLobby = t.value; return; }
    if (t.id === "phSource") { ui.phSource = t.value; return; }
    if (t.id === "phFichiers" && t.files.length) { envoyerPhotos(t.files); return; }
    if (t.id === "luFichiers" && t.files.length) { lireCaptures(t.files); return; }
    const ph = t.closest("[data-ph]");
    if (ph && t.dataset.k) { ui.phB.lignes[+ph.dataset.ph][t.dataset.k] = t.type === "checkbox" ? t.checked : t.value; return; }
    if (t.id === "fi") { ui.fi = t.value; return render(); }
    if (t.id === "grilleDe") { ui.grilleDe = Number(t.value) || ""; return; }
    if (t.id === "fichier" && t.files[0]) { t.files[0].text().then(txt => { $("colle").value = txt; $("lireColle").click(); }); return; }
    const ligne = t.closest("tr[data-i]");
    if (ligne && t.dataset.k) {
      const l = ui.brouillon.lignes[+ligne.dataset.i];
      if (t.dataset.k === "meilleur_tour") ui.brouillon.lignes.forEach(x => { x.meilleur_tour = x === l; });
      else l[t.dataset.k] = t.value;
      ui.brouillon.modifie = true;
      return render();
    }
    const pl = t.closest("tr[data-p]");
    if (pl && t.dataset.k) { const p = ui.pens.lignes[+pl.dataset.p]; p[t.dataset.k] = t.type === "checkbox" ? t.checked : t.value; if (t.dataset.k === "type") render(); return; }
    const vl = t.closest("tr[data-v]");
    if (vl && t.dataset.k) { ui.vodB.lignes[+vl.dataset.v][t.dataset.k] = t.type === "checkbox" ? t.checked : t.value; return; }
    if (t.dataset.g) { ui.prop.choix[t.dataset.g] = t.value; return render(); }
    if (t.dataset.absent) {
      if (t.checked) ui.absBrouillon.lignes[t.dataset.absent] = { remplacant_id: "", note: "", categorie_id: t.dataset.cat }; else delete ui.absBrouillon.lignes[t.dataset.absent];
      return render();
    }
    if (t.dataset.rempl) { ui.absBrouillon.lignes[t.dataset.rempl].remplacant_id = t.value; return render(); }
    if (t.dataset.promo && t.value) {
      const id = t.dataset.promo, v = t.value;
      const corps = v === "retirer" ? { saison_id: saison, pilote_id: id, role: "Inactif", ordre_reserve: "" } : { saison_id: saison, pilote_id: id, role: "Titulaire", categorie_id: v, ordre_reserve: "" };
      if (confirm(v === "retirer" ? `Retirer ${pseudo(id)} des réserves ?` : `${pseudo(id)} devient titulaire du Lobby ${v.slice(1)} ?`)) envoyer("engagement", { engagement: corps }, pseudo(id));
      else t.value = "";
    }
  });
  main.addEventListener("input", e => {
    if (e.target.id === "q") { ui.q = e.target.value; ui.focusQ = true; render(); }
    const ligne = e.target.closest("tr[data-i]");
    if (ligne && e.target.dataset.k === "note") { ui.brouillon.lignes[+ligne.dataset.i].note = e.target.value; ui.brouillon.modifie = true; }
  });
  main.addEventListener("click", async e => {
    const t = e.target.closest("button, [data-edit]");
    if (!t) return;
    const d = t.dataset;
    if (d.guide) return $("g-" + d.guide).scrollIntoView({ behavior: "smooth" });
    if (d.aller) { tab = d.aller; history.replaceState(null, "", "#" + tab); scrollTo(0, 0); return render(); }
    if ("new" in d) { ui.manche = "nouvelle"; return render(); }
    if (d.edit) { ui.manche = d.edit; render(); return $("fManche").scrollIntoView({ behavior: "smooth" }); }
    if ("cancel" in d) { ui.manche = null; return render(); }
    if (t.id === "lireColle") {
      const r = lireClassement($("colle").value);
      ui.brouillon.lignes = r.lignes; ui.brouillon.modifie = true;
      render();
      if (r.inconnus.length) { $("inconnus").hidden = false; $("inconnus").textContent = `Pseudos non reconnus, gardés à leur position : ${r.inconnus.join(", ")}. Choisis le pilote sur chaque ligne surlignée (il sera retenu pour les prochaines fois), ou crée-le dans Pilotes.`; }
      return;
    }
    if (t.id === "ajLigne") { ui.brouillon.lignes.push({ pilote_id: "", statut: "Classé", meilleur_tour: false, note: "" }); ui.brouillon.modifie = true; return render(); }
    if (t.id === "ajLobby") {
      const deja = new Set(ui.brouillon.lignes.map(l => l.pilote_id));
      // Titulaires du lobby à cette manche ; un absent est remplacé par le réserviste prévu dans l'onglet Réserves
      const num = numDe(ui.res);
      titulaires().filter(x => lobbyDe(x.pilote_id, num) === ui.lobby).forEach(x => {
        const r = D.Remplacements.find(y => y.course_id === ui.res && y.absent_id === x.pilote_id);
        if (r && !r.remplacant_id) return; // absent sans remplaçant : pas de ligne
        const id = r ? r.remplacant_id : x.pilote_id;
        if (!deja.has(id)) { deja.add(id); ui.brouillon.lignes.push({ pilote_id: id, statut: "Classé", meilleur_tour: false, note: r ? "Remplace " + pseudo(x.pilote_id) : "" }); }
      });
      ui.brouillon.modifie = true;
      return render();
    }
    if (d.lobby) { ui.lobby = d.lobby; return render(); }
    const L = ui.brouillon && ui.brouillon.lignes;
    if (d.up) { const i = +d.up; if (i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]]; ui.brouillon.modifie = true; return render(); }
    if (d.down) { const i = +d.down; if (i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]]; ui.brouillon.modifie = true; return render(); }
    if (d.del) { L.splice(+d.del, 1); ui.brouillon.modifie = true; return render(); }
    if (t.id === "annulerRes") {
      if (!confirm("Annuler les modifications de ce lobby et revenir aux résultats enregistrés ?")) return;
      delete ui.brouillons[ui.brouillon.cle];
      if (ui.capturesLues && ui.capturesLues.cle === ui.brouillon.cle) ui.capturesLues = null;
      return render();
    }
    if (t.id === "saveRes") {
      if (L.some(l => !l.pilote_id)) return toast("Chaque ligne doit avoir un pilote.", "err");
      if (new Set(L.map(l => l.pilote_id)).size !== L.length) return toast("Un pilote apparaît deux fois.", "err");
      // Noms lus sur la capture et associés à la main : retenus dans _PSN pour les prochaines lectures
      const nouveaux = L.filter(l => l.lu && !l.illisible && l.pilote_id && trouverPilote(l.lu) !== l.pilote_id);
      if (nouveaux.length) await envoyer("psn", { lignes: nouveaux.map(l => ({ psn: l.lu, pilote_id: l.pilote_id })) }, `${nouveaux.length} nom(s) retenu(s)`, { recharger: false });
      const cid = ui.res, cat = ui.lobby;
      const r = await envoyer("resultats", { course_id: cid, categorie_id: cat, terminer: $("terminer").checked, lignes: L.map((l, i) => ({ pilote_id: l.pilote_id, statut: l.statut, meilleur_tour: l.meilleur_tour, note: l.note, position: i + 1 })) }, `Résultats ${cid} ${cat}`);
      if (r.ok && !r.demo) {
        const brouillon = ui.brouillons[cid + cat];
        if (brouillon) brouillon.modifie = false;
        // envoyer() a déjà rechargé le classeur ; on recharge encore seulement si des captures ont été gardées
        if (ui.capturesLues) { await garderCaptures(cid, cat); await charger(); }
        render();
      }
      return;
    }
    if (d.verif) return voirCapture(d.verif, t);
    if (t.id === "ajPen") { ui.pens.lignes.push({ pilote_id: "", type: "Points", points: 1, motif: "", publier: true }); return render(); }
    if (d.pdel) { ui.pens.lignes.splice(+d.pdel, 1); return render(); }
    if (t.id === "savePen") return envoyer("penalites", { course_id: ui.res, lignes: ui.pens.lignes.map(p => ({ ...p, publier: !no(p.publier) })) }, `Pénalités ${ui.res}`);
    if (t.id === "reprop") { ui.prop = null; return render(); }
    if (t.id === "saveGrille") {
      const de = Number($("grilleDe").value);
      if (!de) return toast("Indique la manche à partir de laquelle la grille s'applique.", "err");
      const t2 = totaux();
      const lignes = titulaires().map(x => x.pilote_id).sort((a, b) => (t2[b] || 0) - (t2[a] || 0)).map((id, i) => ({ pilote_id: id, categorie_id: ui.prop.choix[id] || lobbyDe(id, de - 1), rang: i + 1, mouvement: mouvement(lobbyDe(id, de - 1), ui.prop.choix[id] || lobbyDe(id, de - 1)) }));
      if (!confirm(`Publier la grille dès la manche ${de} ? ${lignes.filter(l => l.mouvement).length} changement(s).`)) return;
      return envoyer("grille", { saison_id: saison, a_partir_de: de, lignes }, `Grille dès M${de}`);
    }
    if (t.id === "ajRes") { const id = $("nouvRes").value; if (!id) return; return envoyer("engagement", { engagement: { saison_id: saison, pilote_id: id, role: "Réserve", categorie_id: "", ordre_reserve: reserves().length + 1 } }, `${pseudo(id)} en réserve`); }
    if (t.id === "saveOrdre") {
      const champs = [...main.querySelectorAll("[data-ordre]")];
      // Un envoi par réserve modifiée, puis un seul rechargement du classeur
      const changes = champs.filter(c => String((reserves().find(x => x.pilote_id === c.dataset.ordre) || {}).ordre_reserve ?? "") !== c.value);
      if (!changes.length) return toast("Aucun changement d'ordre.", "warn");
      for (const c of changes) {
        const r = await envoyer("engagement", { engagement: { saison_id: saison, pilote_id: c.dataset.ordre, ordre_reserve: Number(c.value) || "" } }, "Ordre de " + pseudo(c.dataset.ordre), { recharger: false });
        if (!r.ok) return;
      }
      if (demo) return;
      toast(`Ordre des réserves : ${changes.length} changement(s) enregistré(s).`, "ok");
      await charger(); render();
      return;
    }
    if (t.id === "autoRes") {
      const a = ui.absBrouillon.lignes, pris = new Set(Object.values(a).map(x => x.remplacant_id).filter(Boolean));
      const libres = reserves().map(r => r.pilote_id).filter(id => !pris.has(id));
      Object.values(a).forEach(x => { if (!x.remplacant_id && libres.length) x.remplacant_id = libres.shift(); });
      return render();
    }
    if (t.id === "saveAbs") {
      const lignes = Object.entries(ui.absBrouillon.lignes).map(([absent_id, x]) => ({ absent_id, remplacant_id: x.remplacant_id, categorie_id: x.categorie_id || lobbyDe(absent_id, numDe(ui.abs)), note: x.note }));
      return envoyer("remplacements", { course_id: ui.abs, lignes }, `Absences ${ui.abs}`);
    }
    if ("pnew" in d) { ui.pilote = "nouveau"; return render(); }
    if (d.pedit) { ui.pilote = d.pedit; render(); return $("fPilote").scrollIntoView({ behavior: "smooth" }); }
    if ("pcancel" in d) { ui.pilote = null; return render(); }
    if (t.id === "ajVod") { ui.vodB.lignes.push({ categorie_id: "", titre: "", url: "", publier: true }); return render(); }
    if (d.vdel) { ui.vodB.lignes.splice(+d.vdel, 1); return render(); }
    if (d.phm) { ui.ph = d.phm; ui.phB = null; return render(); }
    const P = ui.phB && ui.phB.lignes;
    if (d.phup) { const i = +d.phup; if (i > 0) [P[i - 1], P[i]] = [P[i], P[i - 1]]; return render(); }
    if (d.phdown) { const i = +d.phdown; if (i < P.length - 1) [P[i + 1], P[i]] = [P[i], P[i + 1]]; return render(); }
    if (d.phdel) { if (confirm("Retirer cette capture ? Elle ira à la corbeille de Drive après l'enregistrement.")) { P.splice(+d.phdel, 1); render(); } return; }
    if (t.id === "savePh") return envoyer("photos", { course_id: ui.ph, lignes: P.map(p => ({ photo_id: p.photo_id, legende: p.legende, categorie_id: p.categorie_id, source: p.source, publier: !no(p.publier) })) }, `Captures ${ui.ph}`);
    if (t.id === "saveVod") {
      const mauvais = ui.vodB.lignes.filter(v => v.url && !/^https:\/\//.test(v.url));
      if (mauvais.length) return toast("Les adresses doivent commencer par https://", "err");
      return envoyer("vods", { course_id: ui.vod, lignes: ui.vodB.lignes.filter(v => v.url).map(v => ({ ...v, publier: !no(v.publier) })) }, `VOD ${ui.vod}`);
    }
    const carte = t.closest(".inscr");
    if (carte) {
      const x = D._Inscriptions.find(i => String(i.id) === carte.dataset.id);
      if ("isave" in d) return envoyer("inscription", { id: x.id, statut: carte.querySelector("[data-istatut]").value, note_admin: carte.querySelector("[data-inote]").value }, "Demande de " + x.pseudo_discord);
      if (d.icreer) {
        const r = await envoyer("pilote", { pilote: { pseudo: x.pseudo_discord, psn: x.psn || "", controle: x.controle || "", driver_rating: x.driver_rating || "", twitch: x.twitch || "", region: x.region || "", actif: true } }, "Pilote " + x.pseudo_discord, { recharger: false });
        if (!r.ok || r.demo) return;
        if (d.icreer === "reserve") await envoyer("engagement", { engagement: { saison_id: saison, pilote_id: r.pilote.pilote_id, role: "Réserve", ordre_reserve: reserves().length + 1 } }, x.pseudo_discord + " en réserve", { recharger: false });
        await envoyer("inscription", { id: x.id, statut: d.icreer === "reserve" ? "Réserve" : "Acceptée" }, "Demande de " + x.pseudo_discord);
        // Titulaire : la fiche s'ouvre pour choisir le rôle et le lobby de la saison
        if (d.icreer === "pilote") { tab = "pilotes"; ui.pilote = r.pilote.pilote_id; history.replaceState(null, "", "#pilotes"); render(); toast(`${x.pseudo_discord} créé : choisis son rôle et son lobby, puis Enregistrer.`, "ok"); }
      }
    }
  });
  // Glisser-déposer des captures
  main.addEventListener("dragover", e => { const z = e.target.closest(".drop"); if (!z) return; e.preventDefault(); z.classList.add("over"); });
  main.addEventListener("dragleave", e => { const z = e.target.closest(".drop"); if (z) z.classList.remove("over"); });
  main.addEventListener("drop", e => {
    const z = e.target.closest(".drop"); if (!z) return;
    e.preventDefault(); z.classList.remove("over");
    if (z.id === "dropLu") lireCaptures(e.dataTransfer.files); else envoyerPhotos(e.dataTransfer.files);
  });
  main.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target, v = lireForm(f);
    if (f.id === "fManche") {
      const m = { course_id: v.course_id, saison_id: saison, manche: Number(v.manche), type: v.type, date: v.date, date_fin: v.date_fin, circuit_id: v.circuit_id, groupe_voiture: v.groupe_voiture,
        statut: v.statut, publier: v.publier === "TRUE", points_pilotes: v.points_pilotes === "TRUE", note_publique: v.note_publique, reglages_visibles: v.reglages_visibles };
      REGLAGES.forEach(([k]) => { m[k] = v[k]; });
      if (!m.course_id && manches().some(x => Number(x.manche) === m.manche)) return toast(`La manche ${m.manche} existe déjà.`, "err");
      const categories = ["D1", "D2"].map(c => ({ categorie_id: c, heure_depart: v["heure_" + c], duree: v["duree_" + c], tours: v["tours_" + c] })).filter(c => c.heure_depart || c.duree || c.tours);
      envoyer("manche", { manche: m, categories }, `Manche ${m.manche}`).then(r => { if (r.ok && !r.demo) { ui.manche = null; render(); } });
    }
    if (f.id === "fPilote") {
      const { role, lobby, ...reste } = v;
      const p = { ...reste, actif: v.actif === "TRUE" };
      if (!p.pilote_id) {
        delete p.pilote_id;
        const doublon = D.Pilotes.find(x => x.pilote_id === slug(p.pseudo) || norm(x.pseudo) === norm(p.pseudo));
        if (doublon) return toast(`${doublon.pseudo} existe déjà : utilise « Modifier » sur sa ligne plutôt que « Nouveau pilote ».`, "err");
      }
      if (role === "Titulaire" && !lobby) return toast("Choisis le lobby du titulaire.", "err");
      // Le lobby d'un titulaire déjà placé par une grille publiée se change dans l'onglet Grille (historique des lobbys)
      if (role === "Titulaire" && p.pilote_id && lobby !== lobbyDe(p.pilote_id) && D.Grilles.some(g => g.saison_id === saison && g.pilote_id === p.pilote_id)) return toast("Ce pilote est déjà dans une grille publiée : change son lobby dans l'onglet Grille.", "err");
      (async () => {
        const avant = p.pilote_id && engagements().find(y => y.pilote_id === p.pilote_id) || {};
        const changeRole = role && (role !== avant.role || (role === "Titulaire" && lobby !== lobbyDe(p.pilote_id)));
        const r = await envoyer("pilote", { pilote: p }, "Pilote " + p.pseudo, { recharger: !changeRole });
        if (!r.ok || r.demo) return;
        if (changeRole) {
          const id = p.pilote_id || r.pilote.pilote_id;
          const e = role === "Titulaire" ? { role, categorie_id: lobby, ordre_reserve: "" }
            : role === "Réserve" ? { role, categorie_id: "", ordre_reserve: avant.role === "Réserve" ? avant.ordre_reserve : reserves().length + 1 }
            : { role, ordre_reserve: "" };
          await envoyer("engagement", { engagement: { saison_id: saison, pilote_id: id, ...e } }, `${p.pseudo} : ${role}${role === "Titulaire" ? " Lobby " + lobby.slice(1) : ""}`);
        }
        ui.pilote = null; render();
      })();
    }
  });

  try { tab = localStorage.getItem("gtqcAdminTab") || tab; } catch (err) {}
  // Lien direct vers une section : admin.../#grille
  if (VUES[location.hash.slice(1)]) tab = location.hash.slice(1);
  addEventListener("hashchange", () => { if (VUES[location.hash.slice(1)]) { tab = location.hash.slice(1); render(); } });
  charger().then(ok => { if (ok) render(); });
  // Résultats saisis mais pas enregistrés : le navigateur demande confirmation avant de quitter ou recharger
  addEventListener("beforeunload", e => { if (Object.values(ui.brouillons || {}).some(b => b.modifie)) { e.preventDefault(); e.returnValue = ""; } });
  // Tests en mode démo : lecture simulée d'une capture
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.GTQCAdmin = { appliquerLecture, trouverPilote };
})();
