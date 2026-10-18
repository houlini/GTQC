/* GTQC – page Règlements : lit l'onglet Reglements du Sheet (déjà nettoyé des infos personnelles). */
(() => {
  const G = window.GT, D = G.D, { $, esc } = G;
  const slug = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const rules = D.Reglements.filter(r => r.texte);
  const sections = [...new Set(rules.map(r => r.section))];

  // Grille de points (onglet Bareme_Points) affichée dans la section des lobbys
  function pointsGrid() {
    const cats = ["D1", "D2"];
    const rows = Math.max(...cats.map(c => D.Bareme_Points.filter(b => b.categorie_id === c).length));
    const cell = (c, i) => {
      const b = D.Bareme_Points.filter(x => x.categorie_id === c).sort((a, z) => a.position - z.position)[i];
      if (!b) return "<td></td><td></td>";
      const z = b.zone ? (/Mont/.test(b.zone) ? "up" : "down") : "";
      return `<td class="${z}">${b.position}</td><td class="${z} b">${b.points}</td>`;
    };
    return `<div class="pgrid-wrap"><table class="pgrid">
      <thead><tr><th colspan="2">Lobby 1</th><th colspan="2">Lobby 2</th></tr><tr><th>Pos.</th><th>Pts</th><th>Pos.</th><th>Pts</th></tr></thead>
      <tbody>${Array.from({ length: rows }, (_, i) => `<tr>${cats.map(c => cell(c, i)).join("")}</tr>`).join("")}</tbody></table>
      <p class="legend-zones"><span class="up">Montée possible au Lobby 1</span><span class="down">Descente possible au Lobby 2</span><span>+${esc(G.cfg.points_meilleur_tour || 1)} point pour le meilleur tour</span></p></div>`;
  }

  // Livrées officielles S02 (images découpées des captures du Livery Creator, sans le nom du créateur)
  const LIVREES = [
    ["Gr.3", "30 août 2026", [["renault-rs01", "Renault R.S.01 GT3"], ["nissan-gtr", "Nissan GT-R Nismo GT3"], ["genesis-x-vgt", "Genesis X Gran Berlinetta VGT"],
      ["ferrari-458", "Ferrari 458 Italia GT3"], ["chevrolet-corvette", "Chevrolet Corvette C7 Gr.3"], ["ford-gt", "Ford GT LM Race Car Spec II"], ["subaru-wrx", "Subaru WRX Gr.3"]]],
    ["Gr.4", "14 septembre 2026", [["bmw-m4", "BMW M4 Gr.4"], ["honda-nsx", "Honda NSX Gr.4"], ["subaru-wrx", "Subaru WRX Gr.4"]]],
  ];
  const liveries = () => LIVREES.map(([cat, date, cars]) => `<div class="lv-group">
      <h3>Livrées ${cat} <span class="muted">· version du ${date}</span></h3>
      <ul class="lv-grid">${cars.map(([f, nom]) => `<li><figure><img src="${G.IMG}livrees/s02-${cat.toLowerCase().replace(".", "")}-${f}.jpg" alt="Livrée GTQC ${esc(nom)}" loading="lazy"><figcaption>${esc(nom)}</figcaption></figure></li>`).join("")}</ul>
    </div>`).join("") + `<p class="muted small">Dans GT7 : Showcase › Livrées, recherche par tag « GTQC ».</p>`;

  $("intro").textContent = "En participant au championnat GTQC, chaque pilote accepte le code de conduite et le code d'affichage. Les décisions des admins et des stewards sont finales.";
  $("toc").innerHTML = sections.map(s => `<a href="#${slug(s)}">${esc(s)}</a>`).join("");
  $("content").innerHTML = sections.map(s => {
    const list = rules.filter(r => r.section === s).sort((a, b) => a.ordre - b.ordre);
    const n = (s.match(/^(\d+)\./) || [])[1];
    const title = s.replace(/^\d+\.\s*/, "");
    return `<section class="rp-sec" id="${slug(s)}">
      <h2>${n ? `<span class="rp-n">${n}</span>` : ""}${esc(title)}</h2>
      <ol class="rp-list">${list.map(r => `<li>${r.titre ? `<h3>${esc(r.titre)}</h3>` : ""}<p>${esc(r.texte)}</p></li>`).join("")}</ol>
      ${/lobby|point/i.test(s) ? pointsGrid() : ""}
      ${/livr/i.test(s) ? `<div class="lv">${liveries()}</div>` : ""}
    </section>`;
  }).join("");

  // Section active dans le sommaire
  const links = [...$("toc").querySelectorAll("a")];
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-30% 0px -60% 0px" });
  document.querySelectorAll(".rp-sec").forEach(s => obs.observe(s));
  G.chrome();
})();
