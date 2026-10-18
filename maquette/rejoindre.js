/* GTQC – formulaire « Rejoindre » : une seule demande (ligue, réserve ou question), envoyée à l'API
   (Worker gtqc-api → Apps Script → onglet privé _Inscriptions). Sans API : envoi par courriel. */
(() => {
  const G = window.GT, { $, esc } = G;
  const form = $("form");
  const ERREURS = {
    discord: "Indique ton pseudo Discord.", courriel: "Le courriel ne semble pas valide.", psn: "Indique ton identifiant PSN.",
    consentement: "Coche la case de consentement pour envoyer.", type: "Choisis ce que tu veux faire.",
    occupe: "Le serveur est occupé, réessaie dans une minute.", taille: "Le message est trop long.",
  };

  // Repères tirés du Sheet (jour de course, frais, plateforme)
  const facts = [["Plateforme", G.cfg.plateforme && !/confirmer/i.test(G.cfg.plateforme) ? G.cfg.plateforme : "PlayStation 5 · Gran Turismo 7"],
    ["Soir de course", [G.cfg.jour_course, G.cfg.heure_course && "dès " + G.hm(G.cfg.heure_course)].filter(Boolean).join(" ")],
    ["Lobbys", "2 lobbys, révisés aux 2 manches"]].filter(f => f[1]);
  $("facts").innerHTML = facts.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join("");

  const ouverte = G.yes(G.cfg.inscription_ouverte);
  function majType() {
    const type = form.type.value;
    const pilote = type !== "question";
    form.querySelectorAll("[data-pilote]").forEach(l => { l.hidden = !pilote; });
    form.psn.required = pilote;
    $("message").placeholder = pilote ? "Autre chose à nous dire ? (facultatif)" : "Ta question ou ta proposition";
    $("closed").hidden = !(type === "ligue" && !ouverte);
    $("closed").textContent = "Les inscriptions de la saison sont fermées : ta demande sera mise en liste d'attente pour la prochaine saison, ou comme pilote de réserve si tu le veux.";
  }
  form.addEventListener("change", e => { if (e.target.name === "type") majType(); });
  majType();

  const statut = (txt, cls) => { $("status").textContent = txt; $("status").className = "join-status " + (cls || ""); };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    d.consentement = form.consentement.checked;
    if (d.type === "question") ["psn", "region", "controle", "driver_rating", "twitch", "disponibilites", "experience"].forEach(k => delete d[k]);
    // Vérifications de base avant l'envoi (le serveur refait les mêmes)
    const manque = !d.pseudo_discord ? "discord" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.courriel || "") ? "courriel"
      : d.type !== "question" && !d.psn ? "psn" : !d.consentement ? "consentement" : "";
    if (manque) return statut(ERREURS[manque], "err");

    if (!G.API) {
      // Pas encore d'API : on prépare un courriel avec les réponses
      const lignes = Object.entries(d).filter(([k, v]) => v && !["site", "consentement"].includes(k)).map(([k, v]) => `${k} : ${v}`);
      location.href = `mailto:${G.cfg.courriel_contact || "gtqc.club@gmail.com"}?subject=${encodeURIComponent("GTQC : demande (" + d.type + ")")}&body=${encodeURIComponent(lignes.join("\n"))}`;
      return statut("Ton logiciel de courriel s'ouvre avec ta demande : il reste à l'envoyer.", "ok");
    }
    $("send").disabled = true;
    statut("Envoi…");
    try {
      const rep = await fetch(G.API + "/inscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const r = await rep.json();
      if (!r.ok) throw new Error(r.erreur || "erreur");
      form.reset(); majType();
      statut(r.deja ? "Demande déjà reçue : l'administration te répondra bientôt." : "Merci ! Demande reçue : l'administration te répondra sur Discord ou par courriel.", "ok");
    } catch (err) {
      statut(ERREURS[err.message] || `Envoi impossible pour le moment. Écris-nous à ${G.cfg.courriel_contact || "gtqc.club@gmail.com"}.`, "err");
    } finally { $("send").disabled = false; }
  });

  G.chrome();
})();
