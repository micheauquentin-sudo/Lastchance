/* eslint-disable @next/next/no-location-assign-relative-destination */
/* ==========================================================================
   STUDIO KERMESSE — LOGIQUE INTERACTIVE COMPLÈTE (studio.js)
   Miroir fidèle de :
   - src/components/studio/coquille.tsx (CoquilleStudio)
   - src/components/vitrine/vitrine-studio.tsx (9 étapes Vitrine)
   - src/components/wheel/roue-studio.tsx (Studio 15 Jeux Instantanés & 18 Presets)
   - src/components/pronos/contest-studio.tsx (Studio Pronostics, 11 Event Kinds, 11 Thèmes)
   - src/components/loyalty/passeport-studio.tsx (Studio Passeport Fidélité, Parrainage & Jackpot)
   - src/lib/module-capabilities.ts (canExplore / canEditDraft / canPublish)
   ========================================================================== */
(function () {
  const CB = window.LC_CODEBASE;
  if (!CB) return;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let drafts = CB.loadDrafts();
  let auth = CB.loadAuth();

  // Sécurité cohérence : purge de fiches d'exemples d'un autre secteur restées en mémoire
  if (Array.isArray(drafts.vitrine?.customFiches)) {
    drafts.vitrine.customFiches = drafts.vitrine.customFiches.filter((f) => {
      if (f && f.nom === "Formule Déjeuner du Marché" && drafts.vitrine.secteur !== "restaurant") {
        return false;
      }
      return true;
    });
  }

  // Lecture des paramètres d'URL (?module=vitrine|roue|pronostics|fidelite|calendrier&preset=...&mech=...&sector=...)
  const params = new URLSearchParams(window.location.search);
  let currentModule = params.get("module") || drafts.lastModule || "vitrine";
  if (!["vitrine", "roue", "pronostics", "fidelite", "calendrier"].includes(currentModule)) {
    currentModule = "vitrine";
  }

  if (params.get("preset")) {
    const p = CB.WHEEL_PRESETS.find((x) => x.key === params.get("preset"));
    if (p) {
      drafts.roue.preset = p.key;
      Object.assign(drafts.roue, p.style);
      if (!p.style.fond && p.family === "ambiance") {
        drafts.roue.fond = "aucun";
      }
    }
  }
  if (params.get("mech")) {
    const m = CB.INSTANT_MECHANICS.find((x) => x.key === params.get("mech"));
    if (m) drafts.roue.gameType = m.key;
  }
  if (params.get("sector") && CB.VITRINE_SECTEURS[params.get("sector")]) {
    const secKey = params.get("sector");
    const sec = CB.VITRINE_SECTEURS[secKey];
    drafts.vitrine.secteur = secKey;
    drafts.vitrine.primary = sec.primary;
    drafts.vitrine.secondary = sec.secondary;
    drafts.vitrine.heading = sec.heading;
    drafts.vitrine.nom = sec.defaultNom;
    drafts.vitrine.accroche = sec.defaultAccroche;
    drafts.vitrine.histoire = sec.defaultHistoire;
    drafts.vitrine.badge = sec.defaultBadge;
    drafts.vitrine.customFiches = [];
  }

  drafts.lastModule = currentModule;
  CB.saveDrafts(drafts);

  /* ── DÉFINITION DES ÉTAPES OFFICIELLES PAR MODULE (Issues du code source Git) ── */
  const MODULE_STEPS = {
    vitrine: [
      { cle: "identite", titre: "Identité & Métier", resume: "Votre secteur (7 métiers), votre nom, votre accroche et votre histoire." },
      { cle: "horaires", titre: "Horaires", resume: "Vos jours d'ouverture et la pastille affichée en haut de votre vitrine." },
      { cle: "carte", titre: "Ma carte & Fiches", resume: "Vos prestations ou plats, prix, badges (Fait maison, Végétarien…) et portes d'action." },
      { cle: "parait", titre: "Ce qui paraît", resume: "Ordre des blocs (Accroche, Cartes, Réserver, Jeux) et expériences visibles." },
      { cle: "couleurs", titre: "Couleurs & Polices", resume: "Vos deux couleurs (préréglage métier ou sur mesure) et vos polices." },
      { cle: "allure", titre: "Fiches, Navigation & Ambiance", resume: "Style des cartes (Liste, Grille, Magazine), motif de fond, arrondis et barre basse." },
      { cle: "verification", titre: "Aperçu & Publication", resume: "Vérifiez votre vitrine finale et publiez votre QR code." },
    ],
    roue: [
      { cle: "jeu", titre: "Le jeu (15 mécaniques)", resume: "Choisissez parmi les 9 jeux de hasard et les 6 jeux d'adresse + limite par navigateur." },
      { cle: "lots", titre: "Les gains", resume: "Ce que vos clients peuvent gagner, à quelle fréquence et en quelle quantité (stock)." },
      { cle: "allure", titre: "L'habillage (18 Presets & 10 Fonds)", resume: "Les 8 Ambiances, les 10 Univers illustrés et les 10 fonds d'écran thématiques du code source." },
      { cle: "couleurs", titre: "Les couleurs & Objets", resume: "Thème de page (Kermesse ou Nuit), bouton d'action et éléments visuels propres à votre jeu." },
      { cle: "apres", titre: "Après le gain & Validité", resume: "Coordonnées demandées au gagnant et durée de validité du code de retrait en caisse." },
      { cle: "verification", titre: "Dernière vérification", resume: "Testez une partie complète et publiez votre jeu instantané." },
    ],
    pronostics: [
      { cle: "nom", titre: "Nom & Modèle d'événement", resume: "Choisissez parmi les 11 modèles (Sport avec calendrier officiel, Eurovision, Top Chef, Cérémonie…)." },
      { cle: "allure", titre: "L'allure (11 Thèmes)", resume: "Le thème saisonnier (Carton Kermesse, Football, Festival, Noël…) et son fond d'écran." },
      { cle: "matchs", titre: "Matchs & Questions", resume: "Les rencontres officielles à pronostiquer et la question subsidiaire." },
      { cle: "bareme", titre: "Les points (Barème)", resume: "Combien rapporte un score exact ou le bon vainqueur au classement général." },
      { cle: "lots", titre: "Les lots par rang", resume: "Ce que gagnent les meilleurs pronostiqueurs de votre établissement." },
    ],
    fidelite: [
      { cle: "nom", titre: "Le nom du programme", resume: "Comment votre passeport s'appelle sur le téléphone et dans Google Wallet." },
      { cle: "validation", titre: "Validation & Jackpot Collectif", resume: "Code tournant au comptoir (30s–5min) ou Scan en caisse + rattachement au Jackpot Collectif." },
      { cle: "niveaux", titre: "Les niveaux (Bronze, Argent, Or)", resume: "Seuils en points (1 visite validée = 100 points)." },
      { cle: "cadeaux", titre: "Mes cadeaux en points", resume: "Paliers de récompenses (dès 200 pts = 2 visites min, stock fini obligatoire)." },
      { cle: "parrainage", titre: "Le parrainage", resume: "Proposez à vos habitués d'inviter leurs proches et choisissez la double récompense." },
      { cle: "allure", titre: "L'allure du passeport", resume: "Choisissez l'un des 10 fonds d'écran illustrés derrière la carte de fidélité." },
    ],
    calendrier: [
      { cle: "format", titre: "Format & Période", resume: "Calendrier de l'Avent 24 jours, Compte à rebours 7 jours, Mois anniversaire ou Saison." },
      { cle: "surprises", titre: "Surprises & Récompenses", resume: "Définissez ce que vos clients découvrent en ouvrant la case du jour." },
      { cle: "allure", titre: "Habillage & Thème visuel", resume: "Choisissez l'ambiance graphique de votre calendrier sur smartphone." },
      { cle: "diffusion", titre: "Aperçu & Diffusion QR", resume: "Générez votre affiche comptoir et vos QR codes pour sacs et emballages (Uber Eats, Deliveroo)." },
    ],
  };

    /* ── PALETTES OFFICIELLES DES PRESETS DE LA ROUE ── */
  const WHEEL_PALETTES = {
    kermesse: ["#fcca59", "#f296bd", "#99b7f5", "#80ed99", "#ffd166", "#f3ead3"],
    classic: ["#7c3aed", "#d946ef", "#ffd34d", "#06b6d4", "#a78bfa", "#f43f5e"],
    neon: ["#22d3ee", "#f0abfc", "#06b6d4", "#ec4899", "#3b82f6", "#a855f7"],
    luxe: ["#d4af37", "#262626", "#f3e5ab", "#3f3f46", "#b45309", "#fafafa"],
    candy: ["#ffb3ba", "#baffc9", "#bae1ff", "#ffffba", "#ffdfba", "#e8d7ff"],
    minimal: ["#18181b", "#f4f4f5", "#3f3f46", "#e4e4e7", "#71717a", "#d4d4d8"],
    fiesta: ["#ff5722", "#ffeb3b", "#4caf50", "#e91e63", "#00bcd4", "#ff9800"],
    cartoon: ["#ff3366", "#ffcc00", "#33ccff", "#33cc66", "#cc33ff", "#ff9933"],
  };

  let currentStepIndex = 0;

  /* ── MISE À JOUR DE L'ÉTAT ET ENREGISTREMENT LOCAL ── */
  function triggerAutoSave() {
    CB.saveDrafts(drafts);
    try {
      localStorage.setItem("lc_studio_draft", JSON.stringify(drafts));
      localStorage.setItem("lc_active_module", currentModule);
    } catch {
      // Ignore quota errors
    }
    const statusEl = $("#k-autosave-status");
    if (statusEl) {
      statusEl.textContent = "⏳ Enregistrement…";
      setTimeout(() => {
        statusEl.textContent = "💾 Brouillon sauvegardé";
      }, 250);
    }
    updateHeaderAuthUI();
  }

  function updateHeaderAuthUI() {
    auth = CB.loadAuth();
    const publishBtn = $("#k-btn-publish");
    if (publishBtn) {
      publishBtn.textContent = "🚀 Publier ma création";
    }
  }

  /* ── NAVIGATION ENTRE LES 4 MODULES ET LEURS ÉTAPES ── */
  function renderModuleTabs() {
    $$("#k-module-switcher .k-mod-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.module === currentModule);
    });
  }

  let mobileView = "form";
  let savedFormScrollY = 0;

  function setMobileStudioView(nextView, preserveScroll) {
    mobileView = nextView === "preview" ? "preview" : "form";
    const workspace = $("#k-studio-workspace");
    const btnForm = $("#k-dock-btn-form");
    const btnPreview = $("#k-dock-btn-preview");
    if (nextView === "preview" && preserveScroll) {
      savedFormScrollY = window.scrollY;
    }
    if (workspace) {
      workspace.classList.toggle("is-mobile-preview", mobileView === "preview");
    }
    if (btnForm) btnForm.classList.toggle("is-active", mobileView === "form");
    if (btnPreview) btnPreview.classList.toggle("is-active", mobileView === "preview");

    if (mobileView === "preview") {
      window.scrollTo(0, 0);
    } else if (preserveScroll) {
      window.scrollTo(0, savedFormScrollY);
    }
  }

  function renderStepsBar() {
    const bar = $("#k-steps-bar");
    if (!bar) return;
    const steps = MODULE_STEPS[currentModule] || [];
    bar.innerHTML = steps.map((st, idx) => `
      <button type="button" class="k-step-pill ${idx === currentStepIndex ? "active" : ""}" data-idx="${idx}">
        <span class="k-step-num">${idx + 1}</span>
        <span>${st.titre}</span>
      </button>
    `).join("");

    const stepBadge = $("#k-dock-step-badge");
    if (stepBadge) {
      stepBadge.textContent = `${currentStepIndex + 1}/${steps.length}`;
    }

    const activePill = $(".k-step-pill.active", bar);
    if (activePill && bar.scrollWidth > bar.clientWidth) {
      const targetLeft = activePill.offsetLeft - (bar.clientWidth - activePill.offsetWidth) / 2;
      try {
        bar.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
      } catch {
        bar.scrollLeft = Math.max(0, targetLeft);
      }
    }

    $$(".k-step-pill", bar).forEach((btn) => {
      btn.addEventListener("click", () => {
        currentStepIndex = Number(btn.dataset.idx);
        if (mobileView === "preview") {
          setMobileStudioView("form", false);
        }
        renderStepsBar();
        renderFormColumn();
      });
    });
  }

  /* ── RENDU DE LA COLONNE DE GAUCHE (RÉGLAGES PAR ÉTAPE) ── */
  function renderFormColumn() {
    const col = $("#k-studio-form-col");
    if (!col) return;
    const steps = MODULE_STEPS[currentModule] || [];
    const step = steps[currentStepIndex] || steps[0];

    let bodyHtml = "";
    if (currentModule === "vitrine") bodyHtml = renderVitrineStep(step.cle);
    else if (currentModule === "roue") bodyHtml = renderRoueStep(step.cle);
    else if (currentModule === "pronostics") bodyHtml = renderPronosticsStep(step.cle);
    else if (currentModule === "fidelite") bodyHtml = renderFideliteStep(step.cle);
    else if (currentModule === "calendrier") bodyHtml = renderCalendrierStep(step.cle);

    const prevDisabled = currentStepIndex === 0 ? "disabled" : "";
    const isLast = currentStepIndex === steps.length - 1;

    col.innerHTML = `
      <div class="k-step-header-card">
        <span class="k-step-kicker">ÉTAPE ${currentStepIndex + 1} SUR ${steps.length}</span>
        <h2>${step.titre}</h2>
        <p>${step.resume}</p>
      </div>
      <div class="k-step-fields">
        ${bodyHtml}
      </div>
      <div class="k-step-footer-nav">
        <button type="button" class="k-btn k-btn-white" id="k-step-prev" ${prevDisabled}>← Étape précédente</button>
        ${
          isLast
            ? `<button type="button" class="k-btn k-btn-orange" id="k-step-publish-cta">🚀 Publier ma création →</button>`
            : `<button type="button" class="k-btn k-btn-yellow" id="k-step-next">Étape suivante (${steps[currentStepIndex + 1].titre}) →</button>`
        }
      </div>
    `;

    bindFormEvents(col);

    const prevBtn = $("#k-step-prev", col);
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        if (currentStepIndex > 0) {
          currentStepIndex--;
          renderStepsBar();
          renderFormColumn();
        }
      });
    }
    const nextBtn = $("#k-step-next", col);
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        if (currentStepIndex < steps.length - 1) {
          currentStepIndex++;
          renderStepsBar();
          renderFormColumn();
        }
      });
    }
    const pubCta = $("#k-step-publish-cta", col);
    if (pubCta) {
      pubCta.addEventListener("click", () => openPublishModal());
    }
  }

  /* ==========================================================================
     1. ÉTAPES DU STUDIO VITRINE (src/lib/vitrine.ts & exemples.ts)
     ========================================================================== */
  function renderVitrineStep(cle) {
    const v = drafts.vitrine;
    if (cle === "identite") {
      const sectorCards = Object.values(CB.VITRINE_SECTEURS).map((sec) => `
        <button type="button" class="k-choice-tile ${v.secteur === sec.key ? "active" : ""}" data-action="set-vitrine-sector" data-val="${sec.key}">
          <span style="font-size:1.4rem">${sec.icon}</span>
          <strong>${sec.label}</strong>
          <small style="display:flex;align-items:center;gap:4px;">
            <span style="width:12px;height:12px;border-radius:50%;background:${sec.primary};border:1px solid #211d16;display:inline-block;"></span>
            Palette métier auto
          </small>
        </button>
      `).join("");

      return `
        <div class="k-field-group">
          <label class="k-label">1. Votre secteur d'activité (ajuste le vocabulaire et la palette par défaut)</label>
          <div class="k-choice-grid-3">${sectorCards}</div>
        </div>
        <div class="k-field-group">
          <label class="k-label" for="v-nom">2. Nom de votre établissement</label>
          <input id="v-nom" type="text" class="k-input" value="${escapeAttr(v.nom)}" data-bind="vitrine.nom" />
        </div>
        <div class="k-field-group">
          <label class="k-label" for="v-slug">3. Adresse publique de votre vitrine QR</label>
          <div class="k-slug-row">
            <span>simplecommeqr.fr/v/</span>
            <input id="v-slug" type="text" class="k-input" value="${escapeAttr(v.slug)}" data-bind="vitrine.slug" />
          </div>
        </div>
        <div class="k-field-group">
          <label class="k-label" for="v-accroche">4. Phrase d'accroche (max 200 car.)</label>
          <input id="v-accroche" type="text" class="k-input" value="${escapeAttr(v.accroche)}" data-bind="vitrine.accroche" />
        </div>
        <div class="k-field-group">
          <label class="k-label" for="v-histoire">5. Notre histoire / Présentation</label>
          <textarea id="v-histoire" class="k-textarea" rows="3" data-bind="vitrine.histoire">${escapeHtml(v.histoire)}</textarea>
        </div>
      `;
    }

    if (cle === "horaires") {
      return `
        <div class="k-field-group">
          <label class="k-label" for="v-badge">Pastille d'ouverture en haut de la bannière (max 48 car.)</label>
          <input id="v-badge" type="text" class="k-input" value="${escapeAttr(v.badge)}" data-bind="vitrine.badge" />
          <small class="k-help">Ex : « Ouvert · 12h–14h30 & 19h–22h30 » ou « Sur rendez-vous · 9h30–19h »</small>
        </div>
        <div class="k-field-group">
          <label class="k-label" for="v-horaires">Précisions horaires & jours d'ouverture</label>
          <textarea id="v-horaires" class="k-textarea" rows="3" data-bind="vitrine.horairesTexte">${escapeHtml(v.horairesTexte)}</textarea>
        </div>
      `;
    }

    if (cle === "carte") {
      const customList = (v.customFiches || []).map((f, idx) => `
        <div class="k-item-editor-row">
          <div>
            <strong>${escapeHtml(f.nom)}</strong> — <span class="k-price-chip">${escapeHtml(f.prix)}</span>
            <small style="display:block;color:#3d382f;">${escapeHtml(f.description)}</small>
          </div>
          <button type="button" class="k-btn-mini-del" data-action="del-vitrine-fiche" data-idx="${idx}">Supprimer</button>
        </div>
      `).join("");

      const badgeOptions = Object.entries(CB.VITRINE_BADGES_FR).map(([k, lbl]) => `<option value="${k}">${lbl}</option>`).join("");

      return `
        <div class="k-field-group k-highlight-box">
          <label class="k-checkbox-row">
            <input type="checkbox" ${v.exemplesActifs ? "checked" : ""} data-bind-bool="vitrine.exemplesActifs" />
            <span><strong>Afficher les fiches d'exemple du métier (${CB.VITRINE_SECTEURS[v.secteur]?.label})</strong> dans l'aperçu</span>
          </label>
          <small class="k-help">Affiche des exemples réalistes et prêts à l'emploi selon votre activité pour tester le rendu de votre vitrine.</small>
        </div>

        <div class="k-field-group">
          <label class="k-label">Vos propres fiches / prestations ajoutées (${(v.customFiches || []).length})</label>
          <div class="k-items-stack">${customList || `<p class="k-help">Aucune fiche personnalisée ajoutée pour l'instant.</p>`}</div>
        </div>

        <div class="k-field-group k-add-box">
          <strong>+ Ajouter une fiche / prestation à ma vitrine</strong>
          <div class="k-grid-2" style="margin-top:0.5rem;">
            <input type="text" id="new-fiche-nom" class="k-input" placeholder="Nom (ex: Formule Midi, Coupe + Barbe…)" />
            <input type="text" id="new-fiche-prix" class="k-input" placeholder="Prix affiché (ex: 24,00 €)" />
          </div>
          <input type="text" id="new-fiche-desc" class="k-input" placeholder="Description courte…" style="margin-top:0.45rem;" />
          <div class="k-grid-2" style="margin-top:0.45rem;">
            <select id="new-fiche-badge" class="k-select">
              <option value="">Aucun badge</option>
              ${badgeOptions}
            </select>
            <select id="new-fiche-action" class="k-select">
              <option value="">Aucune porte d'action</option>
              <option value="reserver">📅 Porte : Réserver un créneau</option>
              <option value="boussole">🧭 Porte : Aider à choisir (Boussole)</option>
              <option value="offre">🎁 Porte : Voir les offres à retirer</option>
              <option value="quiz">🧠 Porte : Jouer au quiz</option>
            </select>
          </div>
          <button type="button" class="k-btn k-btn-yellow" id="btn-add-vitrine-fiche" style="margin-top:0.6rem;">+ Ajouter cette fiche à l'aperçu</button>
        </div>
      `;
    }

    if (cle === "parait") {
      const allBlocs = [
        { k: "accroche", l: "Accroche" },
        { k: "histoire", l: "Notre histoire" },
        { k: "cartes", l: "Nos cartes / prestations" },
        { k: "horaires", l: "Horaires" },
        { k: "reserver", l: "📅 Porte : Réserver un créneau / Moment" },
        { k: "experiences", l: "🎰 Porte : Jeux et expériences actives" },
      ];
      return `
        <div class="k-field-group">
          <label class="k-label">Blocs affichés sur votre vitrine publique</label>
          <div class="k-checks-list">
            ${allBlocs.map((b) => `
              <label class="k-checkbox-row">
                <input type="checkbox" ${v.blocs.includes(b.k) ? "checked" : ""} data-action="toggle-vitrine-bloc" data-val="${b.k}" />
                <span><strong>${b.l}</strong></span>
              </label>
            `).join("")}
          </div>
        </div>
        <div class="k-field-group">
          <label class="k-label">Expériences affichées dans le bloc Jeux</label>
          <div class="k-choice-grid-3">
            ${[
              ["loyalty", "🎟️ Passeport de fidélité"],
              ["pronostics", "🏆 Pronostics"],
              ["quiz", "🧠 Quiz express"],
              ["calendars", "📅 Calendrier"],
              ["duo", "🪞 Duo Miroir"],
              ["bande", "🎉 Portrait de la Bande"],
            ].map(([jk, jlbl]) => `
              <label class="k-checkbox-row k-box-check">
                <input type="checkbox" ${v.jeux[jk] ? "checked" : ""} data-action="toggle-vitrine-jeu" data-val="${jk}" />
                <span>${jlbl}</span>
              </label>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (cle === "couleurs") {
      return `
        <div class="k-field-group">
          <label class="k-label">Couleurs de votre vitrine (Contraste et lisibilité automatiques)</label>
          <div class="k-grid-2">
            <div class="k-color-picker-box">
              <span>Couleur d'accent (Primary)</span>
              <input type="color" value="${v.primary}" data-bind="vitrine.primary" />
              <code>${v.primary}</code>
            </div>
            <div class="k-color-picker-box">
              <span>Fond de page (Secondary)</span>
              <input type="color" value="${v.secondary}" data-bind="vitrine.secondary" />
              <code>${v.secondary}</code>
            </div>
          </div>
        </div>
        <div class="k-field-group">
          <label class="k-label">Police des titres</label>
          <div class="k-choice-grid-3">
            ${[
              ["elegant", "Élégante (Serif)"],
              ["sans", "Sans-serif (Classique)"],
              ["impact", "Impact (Forte)"],
              ["rounded", "Arrondie (Chaleureuse)"],
              ["modern", "Moderne (Épurée)"],
              ["script", "Manuscrite (Artisan)"],
            ].map(([fk, flbl]) => `
              <button type="button" class="k-choice-tile kp-tile-font-${fk} ${v.heading === fk ? "active" : ""}" data-action="set-field" data-path="vitrine.heading" data-val="${fk}">
                <strong>${flbl}</strong>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (cle === "allure") {
      return `
        <div class="k-field-group">
          <label class="k-label">Disposition des fiches</label>
          <div class="k-choice-grid-3">
            ${[
              ["liste", "📋 Liste (Classique)"],
              ["grille", "🔲 Grille (2 colonnes)"],
              ["magazine", "📰 Magazine (Éditorial)"],
            ].map(([sk, slbl]) => `
              <button type="button" class="k-choice-tile ${v.styleCartes === sk ? "active" : ""}" data-action="set-field" data-path="vitrine.styleCartes" data-val="${sk}">
                <strong>${slbl}</strong>
              </button>
            `).join("")}
          </div>
        </div>

        <div class="k-field-group">
          <label class="k-label">Motif de fond</label>
          <div class="k-choice-grid-4">
            ${[
              ["diagonales", "╱ Diagonales"],
              ["points", "⋯ Points"],
              ["damier", "🏁 Damier"],
              ["aucun", "⬜ Aucun"],
            ].map(([mk, mlbl]) => `
              <button type="button" class="k-choice-tile ${v.motif === mk ? "active" : ""}" data-action="set-field" data-path="vitrine.motif" data-val="${mk}">
                <strong>${mlbl}</strong>
              </button>
            `).join("")}
          </div>
        </div>

        <div class="k-field-group">
          <label class="k-label">Style d'affichage des prix</label>
          <div class="k-choice-grid-3">
            ${[
              ["accent", "Couleur d'accent"],
              ["pastille", "Pastille encadrée"],
              ["simple", "Texte sobre"],
            ].map(([pk, plbl]) => `
              <button type="button" class="k-choice-tile ${v.stylePrix === pk ? "active" : ""}" data-action="set-field" data-path="vitrine.stylePrix" data-val="${pk}">
                <strong>${plbl}</strong>
              </button>
            `).join("")}
          </div>
        </div>

        <div class="k-field-group">
          <label class="k-label">Barre d'action en bas de l'écran</label>
          <div class="k-choice-grid-3">
            ${[
              ["flottante", "Flottante"],
              ["pleine", "Pleine largeur"],
              ["masquee", "Masquée"],
            ].map(([bk, blbl]) => `
              <button type="button" class="k-choice-tile ${v.barreBasse === bk ? "active" : ""}" data-action="set-field" data-path="vitrine.barreBasse" data-val="${bk}">
                <strong>${blbl}</strong>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    return renderVerificationStepSummary("vitrine", "Votre Vitrine Digitale & Réservation est prête !");
  }

  /* ==========================================================================
     2. ÉTAPES DU STUDIO 15 JEUX INSTANTANÉS (src/lib/wheel-style.ts & catalog.ts)
     ========================================================================== */
  function renderRoueStep(cle) {
    const r = drafts.roue;
    if (cle === "jeu") {
      const hasardCards = CB.INSTANT_MECHANICS.filter((m) => m.family === "hasard").map((m) => `
        <button type="button" class="k-choice-tile ${r.gameType === m.key ? "active" : ""}" data-action="set-field" data-path="roue.gameType" data-val="${m.key}">
          <span style="font-size:1.35rem">${m.emoji}</span>
          <strong>${m.label}</strong>
          <small>Hasard · Tirage immédiat</small>
        </button>
      `).join("");

      const adresseCards = CB.INSTANT_MECHANICS.filter((m) => m.family === "adresse").map((m) => `
        <button type="button" class="k-choice-tile ${r.gameType === m.key ? "active" : ""}" data-action="set-field" data-path="roue.gameType" data-val="${m.key}">
          <span style="font-size:1.35rem">${m.emoji}</span>
          <strong>${m.label}</strong>
          <small>Adresse · Défi avant tirage</small>
        </button>
      `).join("");

      return `
        <div class="k-field-group">
          <label class="k-label" for="r-name">Titre affiché en haut de votre jeu</label>
          <input id="r-name" type="text" class="k-input" value="${escapeAttr(r.name)}" data-bind="roue.name" />
        </div>
        <div class="k-field-group">
          <label class="k-label">🎲 Famille 1 : Les 9 Jeux de Hasard (Tirage immédiat)</label>
          <div class="k-choice-grid-3">${hasardCards}</div>
        </div>
        <div class="k-field-group">
          <label class="k-label">🎯 Famille 2 : Les 6 Jeux d'Adresse (Le joueur doit réussir un défi avant que le tirage s'ouvre)</label>
          <div class="k-choice-grid-3">${adresseCards}</div>
        </div>
        <div class="k-field-group">
          <label class="k-label">Limite de participation par joueur</label>
          <div class="k-choice-grid-3">
            ${[
              ["once", "1 seule fois par joueur"],
              ["daily", "1 fois par jour"],
              ["weekly", "1 fois par semaine"],
            ].map(([lk, llbl]) => `
              <button type="button" class="k-choice-tile ${r.playLimit === lk ? "active" : ""}" data-action="set-field" data-path="roue.playLimit" data-val="${lk}">
                <strong>${llbl}</strong>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (cle === "lots") {
      const lotsHtml = (r.lots || []).map((l, idx) => `
        <div class="k-item-editor-row">
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <input type="color" value="${l.color || "#fcca59"}" data-action="lot-color" data-idx="${idx}" style="width:28px;height:28px;border:2px solid #211d16;border-radius:6px;cursor:pointer;" />
            <div>
              <strong>${escapeHtml(l.label)}</strong>
              <small style="display:block;">Poids : ${l.weight}% · Stock : ${l.stock} · ${l.isWinning ? "🎁 Lot gagnant" : "Perdant"}</small>
            </div>
          </div>
          <button type="button" class="k-btn-mini-del" data-action="del-roue-lot" data-idx="${idx}">Retirer</button>
        </div>
      `).join("");

      return `
        <div class="k-field-group">
          <label class="k-label">Vos lots et probabilités de gain</label>
          <div class="k-items-stack">${lotsHtml}</div>
        </div>
        <div class="k-field-group k-add-box">
          <strong>+ Ajouter un lot à faire gagner</strong>
          <div class="k-grid-2" style="margin-top:0.5rem;">
            <input type="text" id="new-lot-label" class="k-input" placeholder="Ex : Dessert offert, -20 %, Soin découverte…" />
            <input type="number" id="new-lot-stock" class="k-input" placeholder="Stock (ex: 50)" value="50" min="1" />
          </div>
          <button type="button" class="k-btn k-btn-yellow" id="btn-add-roue-lot" style="margin-top:0.6rem;">+ Ajouter ce lot</button>
        </div>
      `;
    }

    if (cle === "allure") {
      const ambiancesHtml = CB.WHEEL_PRESETS_AMBIANCE.map((p) => `
        <button type="button" class="k-choice-tile ${r.preset === p.key ? "active" : ""}" data-action="apply-wheel-preset" data-val="${p.key}">
          <div class="k-swatch-row">
            <span style="background:${p.swatch[0]}"></span>
            <span style="background:${p.swatch[1]}"></span>
            <span style="background:${p.swatch[2]}"></span>
          </div>
          <strong>${p.label}</strong>
          <small>Ambiance (${p.style.pageTheme})</small>
        </button>
      `).join("");

      const universHtml = CB.WHEEL_PRESETS_UNIVERS.map((p) => `
        <button type="button" class="k-choice-tile ${r.preset === p.key ? "active" : ""}" data-action="apply-wheel-preset" data-val="${p.key}">
          <img src="fonds/${p.style.fond}-vignette.webp" alt="${escapeAttr(p.label)}" class="k-fond-thumb" loading="lazy" />
          <strong>${p.label}</strong>
          <small>Univers + Fond illustré</small>
        </button>
      `).join("");

      const fondsHtml = ["aucun", ...CB.FOND_KEYS].map((fk) => `
        <button type="button" class="k-choice-tile ${(r.fond || "aucun") === fk ? "active" : ""}" data-action="set-field" data-path="roue.fond" data-val="${fk}">
          ${fk === "aucun" ? `<span style="font-size:1.3rem">🚫</span><strong>Aucun fond</strong>` : `<img src="fonds/${fk}-vignette.webp" alt="${CB.FOND_LABELS[fk]}" class="k-fond-thumb" loading="lazy" /><strong>${CB.FOND_LABELS[fk]}</strong>`}
        </button>
      `).join("");

      return `
        <div class="k-field-group">
          <label class="k-label">1. Les 8 ambiances de couleurs</label>
          <div class="k-choice-grid-4">${ambiancesHtml}</div>
        </div>
        <div class="k-field-group">
          <label class="k-label">2. Les 10 univers thématiques illustrés</label>
          <div class="k-choice-grid-3">${universHtml}</div>
        </div>
        <div class="k-field-group">
          <label class="k-label">3. Choix du fond d'écran illustré</label>
          <div class="k-choice-grid-4">${fondsHtml}</div>
        </div>
      `;
    }

    if (cle === "couleurs") {
      let specificField = "";

      if (r.gameType === "slot") {
        specificField = `
          <div class="k-field-group">
            <label class="k-label">Symboles de la Machine à sous</label>
            <div class="k-choice-grid-3">
              ${Object.entries(CB.SLOT_SYMBOL_SETS).map(([sk, sObj]) => `
                <button type="button" class="k-choice-tile ${r.slotSymbols === sk ? "active" : ""}" data-action="set-field" data-path="roue.slotSymbols" data-val="${sk}">
                  <span style="font-size:1.15rem">${sObj.symbols.join(" ")}</span>
                  <strong>${sObj.label}</strong>
                </button>
              `).join("")}
            </div>
          </div>
        `;
      } else if (r.gameType === "wheel") {
        specificField = `
          <div class="k-field-group">
            <label class="k-label">Anneau & Aiguille de la Roue de la Fortune</label>
            <div class="k-grid-2">
              <div class="k-color-picker-box">
                <span>Couleur de l'anneau</span>
                <input type="color" value="${r.ringColor || "#fcca59"}" data-bind="roue.ringColor" />
              </div>
              <div class="k-color-picker-box">
                <span>Couleur du curseur</span>
                <input type="color" value="${r.pointerColor || "#f5793b"}" data-bind="roue.pointerColor" />
              </div>
            </div>
          </div>
        `;
      } else if (r.gameType === "scratch") {
        specificField = `
          <div class="k-field-group">
            <label class="k-label">Finition de la carte à gratter digitale</label>
            <div class="k-choice-grid-4">
              ${[
                ["#fcca59", "Ticket Or"],
                ["#e2e8f0", "Argent Métal"],
                ["#22d3ee", "Néon Laser"],
                ["#181512", "Velours Sombre"],
              ].map(([col, lbl]) => `
                <button type="button" class="k-choice-tile ${(r.objectColor || "#fcca59") === col ? "active" : ""}" data-action="set-field" data-path="roue.objectColor" data-val="${col}">
                  <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${col};border:1.5px solid #181512;"></span>
                  <strong>${lbl}</strong>
                </button>
              `).join("")}
            </div>
          </div>
        `;
      } else if (r.gameType === "dice") {
        specificField = `
          <div class="k-field-group">
            <label class="k-label">Teinte & Ambiance du Dé</label>
            <div class="k-choice-grid-4">
              ${[
                ["#ffffff", "Ivoire Casino"],
                ["#dc2626", "Rouge Vegas"],
                ["#ffd700", "Or Royal"],
                ["#181512", "Noir Onyx"],
              ].map(([col, lbl]) => `
                <button type="button" class="k-choice-tile ${(r.objectColor || "#ffffff") === col ? "active" : ""}" data-action="set-field" data-path="roue.objectColor" data-val="${col}">
                  <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${col};border:1.5px solid #181512;"></span>
                  <strong>${lbl}</strong>
                </button>
              `).join("")}
            </div>
          </div>
        `;
      } else if (r.gameType === "cups") {
        specificField = `
          <div class="k-field-group">
            <label class="k-label">Style des Gobelets</label>
            <div class="k-choice-grid-3">
              ${[
                ["gold", "🏆 Gobelets d'Or"],
                ["wood", "🪵 Chopes en Bois"],
                ["kermesse", "🥤 Kermesse Festif"],
              ].map(([sk, lbl]) => `
                <button type="button" class="k-choice-tile ${(r.objectColor || "kermesse") === sk ? "active" : ""}" data-action="set-field" data-path="roue.objectColor" data-val="${sk}">
                  <strong>${lbl}</strong>
                </button>
              `).join("")}
            </div>
          </div>
        `;
      }

      return `
        <div class="k-field-group">
          <label class="k-label">Ambiance de fond du jeu</label>
          <div class="k-choice-grid-2">
            <button type="button" class="k-choice-tile ${r.pageTheme === "kermesse" ? "active" : ""}" data-action="set-surface-theme" data-val="kermesse">
              <strong>🎪 Kermesse (Crème festif + Bandeau rayé + Encre)</strong>
            </button>
            <button type="button" class="k-choice-tile ${r.pageTheme === "nuit" ? "active" : ""}" data-action="set-surface-theme" data-val="nuit">
              <strong>🌙 Nuit / Dégradé sombre sur mesure</strong>
            </button>
          </div>
        </div>

        <div class="k-field-group">
          <label class="k-label">Couleurs du bouton d'action & du fond radial</label>
          <div class="k-grid-2">
            <div class="k-color-picker-box">
              <span>Bouton (Début dégradé)</span>
              <input type="color" value="${r.buttonFrom}" data-bind="roue.buttonFrom" />
            </div>
            <div class="k-color-picker-box">
              <span>Bouton (Fin dégradé)</span>
              <input type="color" value="${r.buttonTo}" data-bind="roue.buttonTo" />
            </div>
          </div>
        </div>

        ${specificField}
      `;
    }

    if (cle === "apres") {
      return `
        <div class="k-field-group">
          <label class="k-label" for="r-ttl">Durée de validité du code gagnant en caisse</label>
          <input id="r-ttl" type="number" class="k-input" min="1" max="90" value="${r.codeTtlDays || 14}" data-bind="roue.codeTtlDays" />
          <small class="k-help">Nombre de jours pendant lesquels le gagnant peut présenter son code unique en caisse.</small>
        </div>
      `;
    }

    return renderVerificationStepSummary("roue", "Votre Jeu Instantané est prêt à être ouvert aux joueurs !");
  }

  /* ==========================================================================
     3. ÉTAPES DU STUDIO PRONOSTICS (src/components/pronos/contest-studio.tsx)
     ========================================================================== */
  function renderPronosticsStep(cle) {
    const p = drafts.pronostics;
    if (cle === "nom") {
      const kindsHtml = CB.EVENT_KINDS.map((ek) => `
        <button type="button" class="k-choice-tile ${p.eventKind === ek.key ? "active" : ""}" data-action="set-field" data-path="pronostics.eventKind" data-val="${ek.key}">
          <span style="font-size:1.35rem">${ek.icon}</span>
          <strong>${ek.label}</strong>
          <small>${ek.hint}</small>
        </button>
      `).join("");

      const compsHtml = CB.COMPETITIONS.map((c) => `
        <button type="button" class="k-choice-tile ${p.competition === c.key ? "active" : ""}" data-action="set-field" data-path="pronostics.competition" data-val="${c.key}">
          <span style="font-size:1.35rem">${c.icon}</span>
          <strong>${c.label}</strong>
          <small>${c.sport} · Score en ${c.scoreLabel}</small>
        </button>
      `).join("");

      return `
        <div class="k-field-group">
          <label class="k-label" for="p-title">Nom de votre championnat de pronostics</label>
          <input id="p-title" type="text" class="k-input" value="${escapeAttr(p.title)}" data-bind="pronostics.title" />
        </div>
        <div class="k-field-group">
          <label class="k-label">1. Type d'événement (11 sports & tournois disponibles)</label>
          <div class="k-choice-grid-2">${kindsHtml}</div>
        </div>
        ${
          p.eventKind === "football"
            ? `<div class="k-field-group">
                <label class="k-label">2. Compétition officielle synchronisée</label>
                <div class="k-choice-grid-3">${compsHtml}</div>
              </div>`
            : ""
        }
      `;
    }

    if (cle === "allure") {
      const themes = [
        ["neutre", "⚽ Carton standard (Kermesse #fdf6e3)"],
        ["football", "⚽ Football (Pelouse + Stade)"],
        ["festival", "🎪 Festival / Fête foraine"],
        ["restaurant", "🍽️ Restaurant / Gourmand"],
        ["musique", "🎵 Scène musicale"],
        ["noel", "🎄 Noël"],
        ["saint_valentin", "💘 Saint-Valentin"],
        ["anniversaire", "🎉 Anniversaire"],
        ["soldes", "💯 Soldes"],
        ["prairie", "🍀 Prairie"],
        ["espace", "🚀 Espace"],
      ];
      return `
        <div class="k-field-group">
          <label class="k-label">Thème saisonnier & Fond d'écran</label>
          <div class="k-choice-grid-3">
            ${themes.map(([tk, tlbl]) => `
              <button type="button" class="k-choice-tile ${p.theme === tk ? "active" : ""}" data-action="set-prono-theme" data-val="${tk}">
                ${tk !== "neutre" ? `<img src="fonds/${tk}-vignette.webp" alt="${tlbl}" class="k-fond-thumb" loading="lazy" />` : `<span style="font-size:1.4rem">🎫</span>`}
                <strong>${tlbl}</strong>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    if (cle === "matchs") {
      const ek = CB.EVENT_KINDS.find((e) => e.key === p.eventKind) || CB.EVENT_KINDS[0];
      if (p.eventKind === "football") {
        const comp = CB.COMPETITIONS.find((c) => c.key === p.competition) || CB.COMPETITIONS[0];
        return `
          <div class="k-field-group">
            <label class="k-label">Rencontres synchronisées (${escapeHtml(comp.label)})</label>
            <div style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:0.85rem;">
              ${comp.matches.map((m) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.45rem 0.7rem;background:#fff;border:1.5px solid var(--k-ink);border-radius:10px;font-size:0.82rem;">
                  <span>${m.flag1} <b>${escapeHtml(m.t1)}</b></span>
                  <span style="font-weight:800;color:#6b5f79;">vs</span>
                  <span><b>${escapeHtml(m.t2)}</b> ${m.flag2}</span>
                </div>
              `).join("")}
            </div>
          </div>
          <div class="k-field-group">
            <label class="k-label" for="p-sub">Question subsidiaire (départage les ex æquo)</label>
            <input id="p-sub" type="text" class="k-input" value="${escapeAttr(p.subsidiaryQuestion || ek.defaultSub || "")}" data-bind="pronostics.subsidiaryQuestion" />
          </div>
        `;
      }
      const qVal = p.customQuestion || ek.prompt || "Qui remporte l'événement ?";
      const choicesVal = p.customChoices || ek.defaultChoices || "Choix 1, Choix 2, Choix 3";
      const subVal = p.subsidiaryQuestion || ek.defaultSub || "";
      return `
        <div class="k-field-group">
          <label class="k-label" for="p-main-q">Question principale (${escapeHtml(ek.label)})</label>
          <input id="p-main-q" type="text" class="k-input" value="${escapeAttr(qVal)}" data-bind="pronostics.customQuestion" />
        </div>
        <div class="k-field-group">
          <label class="k-label" for="p-choices">Choix proposés (séparés par une virgule)</label>
          <input id="p-choices" type="text" class="k-input" value="${escapeAttr(choicesVal)}" data-bind="pronostics.customChoices" />
        </div>
        <div class="k-field-group">
          <label class="k-label" for="p-sub">Question subsidiaire (départage les ex æquo)</label>
          <input id="p-sub" type="text" class="k-input" value="${escapeAttr(subVal)}" data-bind="pronostics.subsidiaryQuestion" />
        </div>
      `;
    }

    if (cle === "bareme") {
      return `
        <div class="k-field-group">
          <div class="k-grid-2">
            <div>
              <label class="k-label">Points pour un score exact</label>
              <input type="number" class="k-input" value="${p.exactScorePts}" data-bind="pronostics.exactScorePts" />
            </div>
            <div>
              <label class="k-label">Points pour le bon vainqueur / issue</label>
              <input type="number" class="k-input" value="${p.winnerPts}" data-bind="pronostics.winnerPts" />
            </div>
          </div>
        </div>
      `;
    }

    if (cle === "lots") {
      const prizes = Array.isArray(p.rankPrizes) ? p.rankPrizes : [];
      const rows = prizes
        .map(
          (rp, idx) => `
          <div class="k-field-group">
            <label class="k-label" for="p-prize-${idx}">${escapeHtml(rp.rank || `Rang ${idx + 1}`)}</label>
            <input id="p-prize-${idx}" type="text" class="k-input" value="${escapeAttr(rp.reward || "")}" data-bind-prono-prize="${idx}" />
          </div>
        `,
        )
        .join("");
      return `
        <div class="k-field-group">
          <p class="k-help" style="margin-bottom:0.75rem;">Définissez les récompenses remportées par les meilleurs pronostiqueurs au classement final.</p>
          ${rows}
        </div>
      `;
    }

    return renderVerificationStepSummary("pronostics", "Votre Saison de Pronostics est prête à être publiée !");
  }

  /* ==========================================================================
     4. ÉTAPES DU STUDIO PASSEPORT FIDÉLITÉ, PARRAINAGE & JACKPOT
     ========================================================================== */
  function renderFideliteStep(cle) {
    const f = drafts.fidelite;
    if (cle === "nom") {
      return `
        <div class="k-field-group">
          <label class="k-label" for="f-name">Nom de votre Passeport de Fidélité (affiché sur la carte et dans Google Wallet)</label>
          <input id="f-name" type="text" class="k-input" value="${escapeAttr(f.name)}" data-bind="fidelite.name" />
        </div>
      `;
    }

    if (cle === "validation") {
      return `
        <div class="k-field-group">
          <label class="k-label">Mode de validation des visites</label>
          <div class="k-choice-grid-2">
            <button type="button" class="k-choice-tile ${f.validationMode === "rotating_code" ? "active" : ""}" data-action="set-field" data-path="fidelite.validationMode" data-val="rotating_code">
              <strong>🔢 Code tournant au comptoir (30s à 5 min)</strong>
              <small>Le client saisit le code affiché sur votre tablette/comptoir.</small>
            </button>
            <button type="button" class="k-choice-tile ${f.validationMode === "staff" ? "active" : ""}" data-action="set-field" data-path="fidelite.validationMode" data-val="staff">
              <strong>📷 Scan en caisse par l'équipe (Staff)</strong>
              <small>Requis lorsque vous reliez un Jackpot Collectif au passeport.</small>
            </button>
          </div>
        </div>

        <div class="k-field-group k-highlight-box">
          <label class="k-checkbox-row">
            <input type="checkbox" ${f.linkJackpot ? "checked" : ""} data-bind-bool="fidelite.linkJackpot" />
            <span><strong>🎰 Relier une Cagnotte / Jackpot Collectif à ce Passeport</strong></span>
          </label>
          <small class="k-help">Chaque passage validé sur le passeport fait automatiquement grimper la jauge commune du Jackpot Collectif de votre établissement !</small>
          <input type="text" class="k-input" style="margin-top:0.5rem;" value="${escapeAttr(f.jackpotName)}" data-bind="fidelite.jackpotName" />
        </div>
      `;
    }

    if (cle === "niveaux") {
      return `
        <div class="k-field-group">
          <p class="k-help" style="margin-bottom:0.75rem;">Règle simple de calcul : <b>1 visite validée = 100 points</b>.</p>
          <div class="k-grid-2">
            <div>
              <label class="k-label">Seuil Niveau Argent (en points)</label>
              <input type="number" step="100" min="200" class="k-input" value="${f.silverPoints}" data-bind="fidelite.silverPoints" />
              <small class="k-help">Soit ${Math.round(f.silverPoints / 100)} visites</small>
            </div>
            <div>
              <label class="k-label">Seuil Niveau Or VIP (en points)</label>
              <input type="number" step="100" min="300" class="k-input" value="${f.goldPoints}" data-bind="fidelite.goldPoints" />
              <small class="k-help">Soit ${Math.round(f.goldPoints / 100)} visites</small>
            </div>
          </div>
        </div>
      `;
    }

    if (cle === "cadeaux") {
      const mList = (f.milestones || []).map((m) => `
        <div class="k-item-editor-row">
          <div>
            <strong>${m.costPoints} pts (${Math.round(m.costPoints / 100)} visites)</strong> — ${escapeHtml(m.label)}
            <small style="display:block;">Stock disponible : ${m.stock} unités</small>
          </div>
        </div>
      `).join("");
      return `
        <div class="k-field-group">
          <label class="k-label">Vos paliers de cadeaux (Dès 200 points = 2 visites)</label>
          <div class="k-items-stack">${mList}</div>
        </div>
      `;
    }

    if (cle === "parrainage") {
      return `
        <div class="k-field-group k-highlight-box">
          <label class="k-checkbox-row">
            <input type="checkbox" ${f.enableReferral ? "checked" : ""} data-bind-bool="fidelite.enableReferral" />
            <span><strong>🤝 Activer le Parrainage directement depuis le Passeport Fidélité</strong></span>
          </label>
        </div>
        <div class="k-field-group">
          <label class="k-label">Avantage offert à l'ami invité (Filleul)</label>
          <input type="text" class="k-input" value="${escapeAttr(f.referralFriendReward)}" data-bind="fidelite.referralFriendReward" />
        </div>
        <div class="k-field-group">
          <label class="k-label">Récompense offerte au client ambassadeur (Parrain)</label>
          <input type="text" class="k-input" value="${escapeAttr(f.referralSponsorReward)}" data-bind="fidelite.referralSponsorReward" />
        </div>
      `;
    }

    const fondsHtml = ["aucun", ...CB.FOND_KEYS].map((fk) => `
      <button type="button" class="k-choice-tile ${(f.fond || "aucun") === fk ? "active" : ""}" data-action="set-field" data-path="fidelite.fond" data-val="${fk}">
        ${fk === "aucun" ? `<span style="font-size:1.3rem">🎫</span><strong>Crème Kermesse</strong>` : `<img src="fonds/${fk}-vignette.webp" alt="${CB.FOND_LABELS[fk]}" class="k-fond-thumb" loading="lazy" /><strong>${CB.FOND_LABELS[fk]}</strong>`}
      </button>
    `).join("");

    return `
      <div class="k-field-group">
        <label class="k-label">Fond d'écran thématique du Passeport</label>
        <div class="k-choice-grid-4">${fondsHtml}</div>
      </div>
      ${renderVerificationStepSummary("fidelite", "Votre écosystème Passeport Fidélité + Parrainage + Jackpot est prêt !")}
    `;
  }

  /* ==========================================================================
     5. ÉTAPES DU STUDIO CALENDRIER SURPRISE (Avent, Countdown, Mensuel)
     ========================================================================== */
  function renderCalendrierStep(cle) {
    const c = drafts.calendrier || (drafts.calendrier = { type: "avent", name: "Calendrier des Surprises", nbCases: 24, theme: "kermesse", surprises: [], qrDiffusion: "comptoir" });
    if (cle === "format") {
      return `
        <div class="k-field-group">
          <label class="k-label" for="cal-name">Nom de votre Calendrier des Surprises</label>
          <input id="cal-name" type="text" class="k-input" value="${escapeAttr(c.name)}" data-bind="calendrier.name" placeholder="Ex: L'Avent Gourmand, Compte à Rebours Festif…" />
          <small class="k-help">Affiché en en-tête sur le smartphone de vos clients et sur vos affiches comptoir.</small>
        </div>

        <div class="k-field-group">
          <label class="k-label">Format de votre calendrier</label>
          <div class="k-choice-grid-2">
            <button type="button" class="k-choice-tile ${c.type === "avent" ? "active" : ""}" data-action="set-cal-type" data-val="avent" data-cases="24">
              <strong>🎄 Calendrier de l'Avent (24 jours)</strong>
              <small>Idéal pour fidéliser tout le mois de décembre jusqu'à Noël.</small>
            </button>
            <button type="button" class="k-choice-tile ${c.type === "countdown" ? "active" : ""}" data-action="set-cal-type" data-val="countdown" data-cases="7">
              <strong>⏳ Compte à rebours 7 jours</strong>
              <small>Parfait avant une soirée événement, une inauguration ou une semaine promo.</small>
            </button>
            <button type="button" class="k-choice-tile ${c.type === "mensuel" ? "active" : ""}" data-action="set-cal-type" data-val="mensuel" data-cases="30">
              <strong>🗓️ Mois Anniversaire (30 jours)</strong>
              <small>Célébrez l'anniversaire de votre établissement pendant un mois complet.</small>
            </button>
            <button type="button" class="k-choice-tile ${c.type === "flash" ? "active" : ""}" data-action="set-cal-type" data-val="flash" data-cases="12">
              <strong>⚡ Sprint 12 Jours Magiques</strong>
              <small>12 jours de surprises intenses pour booster la fréquentation creuse.</small>
            </button>
          </div>
        </div>

        <div class="k-field-group">
          <label class="k-label">Nombre de cases actives : <b>${c.nbCases} cases</b></label>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <button type="button" class="k-choice-pill ${c.nbCases === 7 ? "active" : ""}" data-action="set-field" data-path="calendrier.nbCases" data-val="7">7 jours</button>
            <button type="button" class="k-choice-pill ${c.nbCases === 12 ? "active" : ""}" data-action="set-field" data-path="calendrier.nbCases" data-val="12">12 jours</button>
            <button type="button" class="k-choice-pill ${c.nbCases === 24 ? "active" : ""}" data-action="set-field" data-path="calendrier.nbCases" data-val="24">24 jours</button>
            <button type="button" class="k-choice-pill ${c.nbCases === 30 ? "active" : ""}" data-action="set-field" data-path="calendrier.nbCases" data-val="30">30 jours</button>
          </div>
        </div>
      `;
    }

    if (cle === "surprises") {
      const sList = (c.surprises || []).map((s, idx) => `
        <div class="k-item-editor-row" style="align-items:center;">
          <strong style="min-width:65px;">Jour ${s.jour} :</strong>
          <input type="text" class="k-input" style="flex:1;" value="${escapeAttr(s.gain)}" data-bind-surprise="${idx}" />
        </div>
      `).join("");

      return `
        <div class="k-field-group">
          <label class="k-label">Pépites &amp; Récompenses cachées dans les cases</label>
          <p class="k-help" style="margin-bottom:0.75rem;">Vos clients débloquent une nouvelle case par jour. Vous pouvez varier cafés offerts, pourcentages de remise, points fidélité ou douceurs maison :</p>
          <div class="k-items-stack" style="max-height:300px;overflow-y:auto;padding-right:0.35rem;">
            ${sList}
          </div>
          <div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="button" class="k-btn-secondary" data-action="reset-cal-surprises" style="font-size:0.78rem;">🔄 Réinitialiser les surprises par défaut</button>
          </div>
        </div>
      `;
    }

    if (cle === "allure") {
      const themes = [
        { key: "kermesse", label: "🎪 Kermesse Dorée", desc: "Couleurs festives et dorées, parfait toute l'année" },
        { key: "hiver", label: "❄️ Hiver & Neige", desc: "Bleu givré et blanc, esprit Noël et fêtes" },
        { key: "nuit", label: "✨ Nuit VIP & Or", desc: "Noir premium et étoiles dorées scintillantes" },
        { key: "bonbon", label: "🍬 Bonbon Pastel", desc: "Douceur rose et menthe gourmande" },
      ];
      const themesHtml = themes.map((t) => `
        <button type="button" class="k-choice-tile ${(c.theme || "kermesse") === t.key ? "active" : ""}" data-action="set-field" data-path="calendrier.theme" data-val="${t.key}">
          <strong>${t.label}</strong>
          <small>${t.desc}</small>
        </button>
      `).join("");

      const fondsHtml = ["aucun", ...CB.FOND_KEYS].map((fk) => `
        <button type="button" class="k-choice-tile ${(c.fond || "aucun") === fk ? "active" : ""}" data-action="set-field" data-path="calendrier.fond" data-val="${fk}">
          ${fk === "aucun" ? `<span style="font-size:1.3rem">🎨</span><strong>Fond Uni</strong>` : `<img src="fonds/${fk}-vignette.webp" alt="${CB.FOND_LABELS[fk]}" class="k-fond-thumb" loading="lazy" /><strong>${CB.FOND_LABELS[fk]}</strong>`}
        </button>
      `).join("");

      return `
        <div class="k-field-group">
          <label class="k-label">Ambiance graphique des cases</label>
          <div class="k-choice-grid-2">${themesHtml}</div>
        </div>
        <div class="k-field-group">
          <label class="k-label">Fond d'écran thématique</label>
          <div class="k-choice-grid-4">${fondsHtml}</div>
        </div>
      `;
    }

    if (cle === "diffusion") {
      return `
        <div class="k-field-group">
          <label class="k-label">Points de contact recommandés pour votre QR Code Calendrier</label>
          <div class="k-choice-grid-2">
            <button type="button" class="k-choice-tile ${(c.qrDiffusion || "comptoir") === "comptoir" ? "active" : ""}" data-action="set-field" data-path="calendrier.qrDiffusion" data-val="comptoir">
              <strong>🏪 Comptoir &amp; Tables</strong>
              <small>Chevalet de table, ardoise d'accueil, comptoir de commande.</small>
            </button>
            <button type="button" class="k-choice-tile ${(c.qrDiffusion || "comptoir") === "emport_livraison" ? "active" : ""}" data-action="set-field" data-path="calendrier.qrDiffusion" data-val="emport_livraison">
              <strong>🛵 Sacs VAE, Uber Eats &amp; Deliveroo</strong>
              <small>Flyer ou sticker sur le sac pour convertir vos clients distants en habitués.</small>
            </button>
          </div>
        </div>
        ${renderVerificationStepSummary("calendrier", "Votre Calendrier de Surprises interactif est prêt à émerveiller vos clients !")}
      `;
    }
    return "";
  }

  function renderVerificationStepSummary(modKey, heading) {
    return `
      <div class="k-verif-card">
        <span class="k-badge-yellow">✓ DERNIÈRE VÉRIFICATION</span>
        <h3>${heading}</h3>
        <p>
          Testez votre création dans l'aperçu à droite ou en plein écran. Vos réglages sont automatiquement gardés en mémoire. Pour obtenir votre <b>QR code officiel</b> et ouvrir la page à vos clients, cliquez sur <b>« Publier ma création »</b>.
        </p>
      </div>
    `;
  }

  /* ── LIAISON DES ÉVÉNEMENTS DU FORMULAIRE DE GAUCHE ── */
  function bindFormEvents(container) {
    $$("[data-bind-prono-prize]", container).forEach((inp) => {
      inp.addEventListener("input", () => {
        const idx = Number(inp.dataset.bindPronoPrize);
        if (Array.isArray(drafts.pronostics?.rankPrizes) && drafts.pronostics.rankPrizes[idx]) {
          drafts.pronostics.rankPrizes[idx].reward = inp.value;
          saveAndRefreshPreview();
        }
      });
    });
    $$("[data-bind-surprise]", container).forEach((inp) => {
      inp.addEventListener("input", () => {
        const idx = Number(inp.dataset.bindSurprise);
        if (drafts.calendrier && drafts.calendrier.surprises && drafts.calendrier.surprises[idx]) {
          drafts.calendrier.surprises[idx].gain = inp.value;
          triggerAutoSave();
          renderPreviewColumn();
        }
      });
    });

$$("[data-bind]", container).forEach((inp) => {
      inp.addEventListener("input", () => {
        const [mod, key] = inp.dataset.bind.split(".");
        drafts[mod][key] = inp.type === "number" ? Number(inp.value) : inp.value;
        triggerAutoSave();
        renderPreviewColumn();
      });
    });

    $$("[data-bind-bool]", container).forEach((chk) => {
      chk.addEventListener("change", () => {
        const [mod, key] = chk.dataset.bindBool.split(".");
        drafts[mod][key] = chk.checked;
        triggerAutoSave();
        renderFormColumn();
        renderPreviewColumn();
      });
    });

    $$("[data-action]", container).forEach((el) => {
      el.addEventListener("click", () => {
        const act = el.dataset.action;
        if (act === "set-vitrine-sector") {
          const secKey = el.dataset.val;
          const sec = CB.VITRINE_SECTEURS[secKey];
          if (sec) {
            const isNewSector = drafts.vitrine.secteur !== secKey;
            drafts.vitrine.secteur = secKey;
            drafts.vitrine.primary = sec.primary;
            drafts.vitrine.secondary = sec.secondary;
            drafts.vitrine.heading = sec.heading;
            drafts.vitrine.nom = sec.defaultNom;
            drafts.vitrine.accroche = sec.defaultAccroche;
            drafts.vitrine.histoire = sec.defaultHistoire;
            drafts.vitrine.badge = sec.defaultBadge;
            if (isNewSector) {
              // Réinitialise les fiches personnalisées pour afficher uniquement les prestations du secteur choisi
              drafts.vitrine.customFiches = [];
            }
          }
          triggerAutoSave();
          renderFormColumn();
          renderPreviewColumn();
        } else if (act === "set-cal-type") {
          drafts.calendrier.type = el.dataset.val;
          drafts.calendrier.nbCases = Number(el.dataset.cases) || 24;
          triggerAutoSave();
          renderFormColumn();
          renderPreviewColumn();
        } else if (act === "reset-cal-surprises") {
          drafts.calendrier.surprises = [
            { jour: 1, gain: "☕ 1 Boisson ou café offert" },
            { jour: 2, gain: "🎟️ +100 points fidélité bonus" },
            { jour: 3, gain: "🍪 1 Douceur maison offerte" },
            { jour: 4, gain: "🎁 -15% sur votre commande" },
            { jour: 5, gain: "🥤 1 Boisson fraîche au choix" },
            { jour: 6, gain: "🎲 1 Chance supplémentaire au jeu" },
            { jour: 7, gain: "🏆 Surprise spéciale de la maison" },
          ];
          triggerAutoSave();
          renderFormColumn();
          renderPreviewColumn();
        } else if (act === "set-field") {
          const [mod, key] = el.dataset.path.split(".");
          drafts[mod][key] = el.dataset.val;
          if (mod === "pronostics" && key === "eventKind") {
            const newEk = CB.EVENT_KINDS.find((e) => e.key === el.dataset.val) || CB.EVENT_KINDS[0];
            drafts.pronostics.customQuestion = newEk.prompt || "";
            drafts.pronostics.customChoices = newEk.defaultChoices || "Choix 1, Choix 2, Choix 3";
            drafts.pronostics.subsidiaryQuestion = newEk.defaultSub || "";
            if (el.dataset.val !== "football" && drafts.pronostics.theme === "football") {
              drafts.pronostics.theme = "neutre";
              drafts.pronostics.fond = "aucun";
            } else if (el.dataset.val === "football" && drafts.pronostics.theme === "neutre") {
              drafts.pronostics.theme = "football";
              drafts.pronostics.fond = "football";
            }
          }
          triggerAutoSave();
          renderFormColumn();
          renderPreviewColumn();
        } else if (act === "apply-wheel-preset") {
          const p = CB.WHEEL_PRESETS.find((x) => x.key === el.dataset.val);
          if (p) {
            drafts.roue.preset = p.key;
            Object.assign(drafts.roue, p.style);
            if (p.family === "ambiance") {
              drafts.roue.fond = "aucun";
              drafts.roue.pageTheme = p.style.pageTheme || "nuit";
              const pal = WHEEL_PALETTES[p.key];
              if (pal && Array.isArray(drafts.roue.lots)) {
                drafts.roue.lots.forEach((lot, i) => {
                  lot.color = pal[i % pal.length];
                });
              }
            } else if (p.family === "univers") {
              drafts.roue.fond = p.key;
              drafts.roue.pageTheme = "kermesse";
            }
          }
          triggerAutoSave();
          renderFormColumn();
          renderPreviewColumn();
        } else if (act === "set-surface-theme") {
          drafts.roue.pageTheme = el.dataset.val;
          drafts.roue.fond = "aucun";
          triggerAutoSave();
          renderFormColumn();
          renderPreviewColumn();
        } else if (act === "set-prono-theme") {
          const tk = el.dataset.val;
          drafts.pronostics.theme = tk;
          drafts.pronostics.fond = tk === "neutre" ? "aucun" : tk;
          triggerAutoSave();
          renderFormColumn();
          renderPreviewColumn();
        } else if (act === "del-vitrine-fiche") {
          const idx = Number(el.dataset.idx);
          drafts.vitrine.customFiches.splice(idx, 1);
          triggerAutoSave();
          renderFormColumn();
          renderPreviewColumn();
        } else if (act === "del-roue-lot") {
          const idx = Number(el.dataset.idx);
          if (drafts.roue.lots.length > 2) {
            drafts.roue.lots.splice(idx, 1);
            triggerAutoSave();
            renderFormColumn();
            renderPreviewColumn();
          }
        }
      });
    });

    $$("input[type='checkbox'][data-action='toggle-vitrine-bloc']", container).forEach((chk) => {
      chk.addEventListener("change", () => {
        const b = chk.dataset.val;
        const set = new Set(drafts.vitrine.blocs);
        if (chk.checked) set.add(b);
        else set.delete(b);
        drafts.vitrine.blocs = Array.from(set);
        triggerAutoSave();
        renderPreviewColumn();
      });
    });

    $$("input[type='checkbox'][data-action='toggle-vitrine-jeu']", container).forEach((chk) => {
      chk.addEventListener("change", () => {
        drafts.vitrine.jeux[chk.dataset.val] = chk.checked;
        triggerAutoSave();
        renderPreviewColumn();
      });
    });

    $$("input[type='color'][data-action='lot-color']", container).forEach((clr) => {
      clr.addEventListener("input", () => {
        const idx = Number(clr.dataset.idx);
        if (drafts.roue.lots[idx]) {
          drafts.roue.lots[idx].color = clr.value;
          triggerAutoSave();
          renderPreviewColumn();
        }
      });
    });

    const addFicheBtn = $("#btn-add-vitrine-fiche", container);
    if (addFicheBtn) {
      addFicheBtn.addEventListener("click", () => {
        const nom = ($("#new-fiche-nom", container)?.value || "").trim();
        const prix = ($("#new-fiche-prix", container)?.value || "15,00 €").trim();
        const description = ($("#new-fiche-desc", container)?.value || "").trim();
        const badge = $("#new-fiche-badge", container)?.value || "";
        const action = $("#new-fiche-action", container)?.value || "";
        if (!nom) return;
        drafts.vitrine.customFiches.unshift({ nom, prix, description, badge, action });
        triggerAutoSave();
        renderFormColumn();
        renderPreviewColumn();
      });
    }

    const addLotBtn = $("#btn-add-roue-lot", container);
    if (addLotBtn) {
      addLotBtn.addEventListener("click", () => {
        const label = ($("#new-lot-label", container)?.value || "").trim();
        const stock = Number($("#new-lot-stock", container)?.value || 50);
        if (!label) return;
        drafts.roue.lots.push({ label, weight: 20, stock, isWinning: true, color: "#98f5d4" });
        triggerAutoSave();
        renderFormColumn();
        renderPreviewColumn();
      });
    }
  }

  /* ==========================================================================
     RENDU DE LA COLONNE DE DROITE : APERÇU CLIENT FIDÈLE EN DIRECT
     ========================================================================== */
  function renderPreviewColumn() {
    const phone = $("#k-preview-phone");
    const urlPill = $("#k-preview-url-pill");
    const tools = $("#k-preview-tools");
    if (!phone) return;

    if (currentModule === "vitrine") {
      if (urlPill) urlPill.textContent = `simplecommeqr.fr/v/${drafts.vitrine.slug || "mon-commerce"}`;
      if (tools) {
        tools.innerHTML = `<span class="k-tool-pill">Aperçu en direct</span>`;
      }
      phone.innerHTML = buildVitrinePreviewHTML();
    } else if (currentModule === "roue") {
      if (urlPill) urlPill.textContent = `simplecommeqr.fr/play/mon-jeu`;
      if (tools) tools.innerHTML = `<span class="k-tool-pill">Thème : ${drafts.roue.preset}</span>`;
      phone.innerHTML = buildRouePreviewHTML();
      bindInteractivePlayInside(phone);
    } else if (currentModule === "pronostics") {
      if (urlPill) urlPill.textContent = `simplecommeqr.fr/pronos/mon-concours`;
      if (tools) tools.innerHTML = `<span class="k-tool-pill">Saison : ${drafts.pronostics.theme}</span>`;
      phone.innerHTML = buildPronosticsPreviewHTML();
    } else if (currentModule === "fidelite") {
      if (urlPill) urlPill.textContent = `simplecommeqr.fr/passeport/mon-programme`;
      if (tools) tools.innerHTML = `<span class="k-tool-pill">1 visite = 100 pts</span>`;
      phone.innerHTML = buildFidelitePreviewHTML();
    } else if (currentModule === "calendrier") {
      const cName = drafts.calendrier?.name || "mon-calendrier";
      const slug = encodeURIComponent(cName.toLowerCase().replace(/[^a-z0-9]+/g, "-")).slice(0, 24);
      if (urlPill) urlPill.textContent = `simplecommeqr.fr/calendar/${slug}`;
      if (tools) tools.innerHTML = `<span class="k-tool-pill">Cases : ${drafts.calendrier?.nbCases || 24}j · ${drafts.calendrier?.theme || "kermesse"}</span>`;
      phone.innerHTML = buildCalendrierPreviewHTML();
      bindCalendrierInteractive(phone);
    }
  }

  function buildVitrinePreviewHTML() {
    const v = drafts.vitrine;
    const sec = CB.VITRINE_SECTEURS[v.secteur] || CB.VITRINE_SECTEURS.commerce;

    let motifCss = "";
    if (v.motif === "diagonales") {
      motifCss = `background-image: repeating-linear-gradient(135deg, rgba(0,0,0,0.035) 0 12px, transparent 12px 24px);`;
    } else if (v.motif === "points") {
      motifCss = `background-image: radial-gradient(rgba(0,0,0,0.07) 1.5px, transparent 1.5px); background-size: 16px 16px;`;
    } else if (v.motif === "damier") {
      motifCss = `background-image: linear-gradient(45deg, rgba(0,0,0,0.03) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.03) 25%, transparent 25%); background-size: 20px 20px;`;
    }

    const customFichesHtml = (v.customFiches || []).map((f) => `
      <div class="kp-vitrine-fiche" style="border-radius:${v.rayon}px;">
        <div>
          <strong>${escapeHtml(f.nom)}</strong>
          ${f.description ? `<small>${escapeHtml(f.description)}</small>` : ""}
          ${f.badge && CB.VITRINE_BADGES_FR[f.badge] ? `<span class="kp-v-badge">${CB.VITRINE_BADGES_FR[f.badge]}</span>` : ""}
          ${f.action === "reserver" ? `<span class="kp-v-action" style="background:${v.primary};color:#fff;">📅 Réserver</span>` : ""}
        </div>
        <b class="kp-v-prix" style="background:${v.stylePrix === "pastille" ? v.primary : "transparent"};color:${v.stylePrix === "pastille" ? "#fff" : v.primary};">${escapeHtml(f.prix)}</b>
      </div>
    `).join("");

    const exempleFiches = v.exemplesActifs && sec.cartes[0]?.rubriques[0]?.fiches ? sec.cartes[0].rubriques[0].fiches : [];
    const exemplesHtml = exempleFiches.map((ef) => `
      <div class="kp-vitrine-fiche" style="border-radius:${v.rayon}px;">
        <div>
          <strong>${escapeHtml(ef.nom)}</strong>
          <small>${escapeHtml(ef.description)}</small>
          ${(ef.badges || []).map((b) => `<span class="kp-v-badge">${CB.VITRINE_BADGES_FR[b] || b}</span>`).join(" ")}
        </div>
        <b class="kp-v-prix" style="background:${v.stylePrix === "pastille" ? v.primary : "transparent"};color:${v.stylePrix === "pastille" ? "#fff" : v.primary};">${escapeHtml(ef.prix)}</b>
      </div>
    `).join("");

    const activeJeux = Object.entries(v.jeux || {}).filter(([, val]) => val).map(([k]) => {
      const map = { loyalty: "🎟️ Passeport Fidélité", pronostics: "🏆 Pronostics", quiz: "🧠 Quiz", calendars: "📅 Calendrier", duo: "🪞 Duo Miroir", bande: "🎉 Portrait de la Bande" };
      return `<span class="kp-v-game-pill">${map[k] || k}</span>`;
    }).join("");

    const headingFontClass = `kp-heading-${v.heading || "elegant"}`;

    return `
      <div class="kp-vitrine-surface ${headingFontClass}" style="background-color:${v.secondary};color:#211d16;${motifCss}">
        <div class="kp-vitrine-hero" style="background:${v.primary};color:#ffffff;">
          <span class="kp-vitrine-open-badge">${escapeHtml(v.badge)}</span>
          <h3 class="kp-v-title">${escapeHtml(v.nom)}</h3>
          ${v.blocs.includes("accroche") ? `<p>${escapeHtml(v.accroche)}</p>` : ""}
        </div>

        <div class="kp-vitrine-body">
          ${v.blocs.includes("histoire") && v.histoire ? `
            <div class="kp-v-section">
              <span class="kp-v-kicker" style="color:${v.primary}">NOTRE HISTOIRE</span>
              <p style="font-size:0.78rem;margin:0.2rem 0 0;">${escapeHtml(v.histoire)}</p>
            </div>
          ` : ""}

          ${v.blocs.includes("cartes") ? `
            <div class="kp-v-section">
              <span class="kp-v-kicker" style="color:${v.primary}">${sec.motCartes.toUpperCase()}</span>
              <div class="kp-v-fiches-grid kp-layout-${v.styleCartes}">
                ${customFichesHtml}
                ${exemplesHtml}
              </div>
            </div>
          ` : ""}

          ${v.blocs.includes("reserver") ? `
            <div class="kp-v-section kp-v-door" style="border-color:${v.primary}">
              <strong>📅 Prendre rendez-vous & Moments</strong>
              <small>Créneaux en direct · Ajout calendrier 1 clic</small>
            </div>
          ` : ""}

          ${v.blocs.includes("experiences") && activeJeux ? `
            <div class="kp-v-section">
              <span class="kp-v-kicker" style="color:${v.primary}">JEUX & EXPÉRIENCES DU LIEU</span>
              <div class="kp-v-games-wrap">${activeJeux}</div>
            </div>
          ` : ""}

          ${v.blocs.includes("horaires") ? `
            <div class="kp-v-section">
              <span class="kp-v-kicker" style="color:${v.primary}">HORAIRES</span>
              <small style="display:block;font-size:0.76rem;">${escapeHtml(v.horairesTexte)}</small>
            </div>
          ` : ""}
        </div>

        ${v.barreBasse !== "masquee" ? `
          <div class="kp-v-bottom-bar" style="background:${v.primary};color:#ffffff;">
            <span>📖 ${sec.motCartes}</span>
            <span>📅 Réserver</span>
            <span>🎰 Jouer</span>
          </div>
        ` : ""}
      </div>
    `;
  }

  function buildRouePreviewHTML() {
    const r = drafts.roue;
    const isNuit = r.pageTheme === "nuit";
    const hasFond = r.fond && r.fond !== "aucun" && !isNuit;

    let bgStyle = "";
    let isDark = false;

    if (hasFond) {
      bgStyle = `background-image: linear-gradient(180deg, rgba(253,246,227,0.78), rgba(253,246,227,0.88)), url('fonds/${r.fond}-640.webp'); background-size: cover; background-position: center;`;
      isDark = false;
    } else if (isNuit) {
      const from = r.bgFrom || "#2e1065";
      const to = r.bgTo || "#0b0814";
      bgStyle = `background: radial-gradient(circle at 50% -10%, ${from}, ${to} 75%);`;
      isDark = true;
    } else {
      bgStyle = `background-color: #fdf6e3;`;
      isDark = false;
    }

    const textColor = isDark ? "#ffffff" : "#211d16";
    const subColor = isDark ? "#d4d4d8" : "#3d382f";

    return `
      <div class="kp-play-surface ${isDark ? "is-dark-theme" : ""}" data-theme="${isDark ? "nuit" : "kermesse"}" style="${bgStyle};color:${textColor};">
        ${!isDark ? `<div class="k-stripe-bar" style="height:10px;"></div>` : ""}
        <div class="kp-play-inner">
          <span class="kp-play-kicker" style="color:${subColor}">${escapeHtml(auth.orgName || drafts.vitrine.nom || "VOTRE ÉTABLISSEMENT")}</span>
          <h3 class="kp-play-title" style="color:${textColor}">${escapeHtml(r.name)}</h3>

          <div class="kp-play-stage" id="kp-play-stage" style="width:100%;min-height:280px;display:flex;align-items:center;justify-content:center;">
            <!-- Rendu interactif réel animé par LC_GAMES_ENGINE -->
          </div>

          <div class="kp-play-win-banner" id="kp-play-win-banner" style="display:none;background:#e6f9ef;color:#161317;border:2.5px solid #161317;border-radius:14px;padding:0.55rem 0.8rem;text-align:center;font-size:0.8rem;font-weight:800;margin:0.5rem 0;box-shadow:3px 3px 0 #161317;"></div>

          <small class="kp-play-footer" style="color:${subColor}">
            Limite : ${r.playLimit === "once" ? "1 participation par navigateur" : r.playLimit === "daily" ? "1 participation / jour / navigateur" : "1 participation / semaine"} · Code valable ${r.codeTtlDays}j
          </small>
        </div>
      </div>
    `;
  }

  function bindInteractivePlayInside(root) {
    const stage = $("#kp-play-stage", root);
    if (!stage) return;
    const r = drafts.roue;
    const GE = window.LC_GAMES_ENGINE;
    if (GE && typeof GE.createSimulator === "function") {
      const winningLots = (r.lots || []).filter((l) => l.isWinning);
      const chosen = winningLots[0] || (r.lots && r.lots[0]) || { label: "-15 % sur l'addition ☕" };
      const isDark = (r.pageTheme === "nuit");

      GE.createSimulator(stage, {
        gameKey: r.gameType,
        lots: r.lots,
        prize: chosen.label,
        pageTheme: r.pageTheme,
        isDark: isDark,
        buttonFrom: r.buttonFrom,
        buttonTo: r.buttonTo,
        ringColor: r.ringColor,
        pointerColor: r.pointerColor,
        slotSymbols: r.slotSymbols,
        objectColor: r.objectColor,
        onWin: (res) => {
          const winBanner = $("#kp-play-win-banner", root);
          if (winBanner) {
            winBanner.style.display = "block";
            winBanner.innerHTML = `🎉 <b>Gain débloqué : ${escapeHtml(res.prize)}</b> · Code caisse : <code style="background:#ffd93d;padding:0.1rem 0.35rem;border-radius:5px;border:1.5px solid #161317;font-weight:900;">${escapeHtml(res.code)}</code>`;
            try { winBanner.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch {}
          }
        }
      });
    }
  }

  function buildPronosticsPreviewHTML() {
    const p = drafts.pronostics;
    const lavis = CB.LAVIS_SAISON[p.theme] || "#fdf6e3";
    const hasFond = p.fond && p.fond !== "aucun";
    const comp = CB.COMPETITIONS.find((c) => c.key === p.competition) || CB.COMPETITIONS[0];
    const ek = CB.EVENT_KINDS.find((e) => e.key === p.eventKind) || CB.EVENT_KINDS[0];

    const bgStyle = hasFond
      ? `background-image: linear-gradient(180deg, rgba(253,246,227,0.82), rgba(253,246,227,0.92)), url('fonds/${p.fond}-640.webp'); background-size: cover;`
      : `background-color: ${lavis};`;

    const choicesList = (p.customChoices || ek.defaultChoices || "Choix 1, Choix 2, Choix 3")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const matchesHtml = p.eventKind === "football"
      ? comp.matches.map((m) => `
          <div class="kp-prono-match">
            <span>${m.flag1} <b>${m.t1}</b></span>
            <strong class="kp-score-pill">${m.s1} - ${m.s2}</strong>
            <span><b>${m.t2}</b> ${m.flag2}</span>
          </div>
        `).join("")
      : `
        <div class="kp-prono-match" style="flex-direction:column;align-items:flex-start;gap:0.35rem;">
          <strong>${ek.icon} Question : ${escapeHtml(p.customQuestion || ek.prompt || "Qui remportera la finale ?")}</strong>
          <small>${escapeHtml(choicesList.join(" · "))}</small>
        </div>
      `;

    const subText = p.subsidiaryQuestion || ek.defaultSub || "";

    return `
      <div class="kp-play-surface" style="${bgStyle};color:#211d16;">
        <div class="k-stripe-bar" style="height:10px;"></div>
        <div class="kp-play-inner">
          <span class="kp-play-mech-badge">${ek.icon} ${ek.label}</span>
          <h3 class="kp-play-title" style="color:#211d16">${escapeHtml(p.title)}</h3>
          <div class="kp-prono-list">${matchesHtml}</div>
          ${subText ? `<div class="kp-prono-bareme" style="margin-top:0.35rem;">⚖️ <b>Question subsidiaire :</b> ${escapeHtml(subText)}</div>` : ""}
          <div class="kp-prono-bareme">
            🎯 Score exact : <b>+${p.exactScorePts} pts</b> · Bon résultat : <b>+${p.winnerPts} pts</b>
          </div>
          <div class="kp-prono-prizes">
            ${(p.rankPrizes || []).map((rp) => `<div><span>${rp.rank}</span> : <b>${escapeHtml(rp.reward)}</b></div>`).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function buildFidelitePreviewHTML() {
    const f = drafts.fidelite;
    const hasFond = f.fond && f.fond !== "aucun";
    const bgStyle = hasFond
      ? `background-image: linear-gradient(180deg, rgba(253,246,227,0.82), rgba(253,246,227,0.92)), url('fonds/${f.fond}-640.webp'); background-size: cover;`
      : `background-color: #fdf6e3;`;

    return `
      <div class="kp-play-surface" style="${bgStyle};color:#211d16;">
        <div class="k-stripe-bar" style="height:10px;"></div>
        <div class="kp-play-inner">
          <span class="kp-play-mech-badge">🎟️ Passeport &amp; Écran d'accueil</span>
          <h3 class="kp-play-title" style="color:#211d16">${escapeHtml(f.name)}</h3>

          <div class="kp-fid-box">
            <div style="display:flex;justify-content:space-between;font-weight:800;font-size:0.8rem;">
              <span>Solde : 300 pts (3 visites)</span>
              <span>Argent : ${f.silverPoints} pts · Or : ${f.goldPoints} pts</span>
            </div>
            <div class="fc-stamps-track" style="margin-top:0.45rem;">
              <span class="fc-stamp is-filled">★</span>
              <span class="fc-stamp is-filled">★</span>
              <span class="fc-stamp is-filled">★</span>
              <span class="fc-stamp">4</span>
              <span class="fc-stamp is-gift">🎁</span>
            </div>
          </div>

          ${f.enableReferral ? `
            <div class="kp-fid-box" style="background:#f3e8ff;">
              <strong>🤝 Parrainage actif</strong>
              <small style="display:block;">Ami invité : ${escapeHtml(f.referralFriendReward)}</small>
              <small style="display:block;">Parrain : ${escapeHtml(f.referralSponsorReward)}</small>
            </div>
          ` : ""}

          ${f.linkJackpot ? `
            <div class="kp-fid-box" style="background:#fff3cf;">
              <strong>🎰 ${escapeHtml(f.jackpotName)}</strong>
              <div class="fc-jackpot-bar-outer" style="margin-top:0.35rem;"><div class="fc-jackpot-bar-inner" style="width:88%;"></div></div>
              <small style="display:block;margin-top:0.25rem;">Chaque visite validée fait grimper la cagnotte commune !</small>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  
  function buildCalendrierPreviewHTML() {
    const c = drafts.calendrier || { type: "avent", name: "Calendrier des Surprises", nbCases: 24, theme: "kermesse", surprises: [] };
    const hasFond = c.fond && c.fond !== "aucun";
    const bgStyle = hasFond
      ? `background-image: linear-gradient(180deg, rgba(253,246,227,0.85), rgba(253,246,227,0.95)), url('fonds/${c.fond}-640.webp'); background-size: cover;`
      : (c.theme === "hiver" ? "background: linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 100%);"
        : c.theme === "nuit" ? "background: linear-gradient(180deg, #181824 0%, #2b2b3d 100%); color:#fff;"
        : c.theme === "bonbon" ? "background: linear-gradient(180deg, #fdf2f8 0%, #fce7f3 100%);"
        : "background: #fdf6e3;");

    const textColor = c.theme === "nuit" ? "#ffffff" : "#211d16";
    const boxBg = c.theme === "nuit" ? "background:#232136;border-color:#ffd93d;color:#fff;" : "background:#ffffff;";

    const nb = c.nbCases || 24;
    const defaultSurprises = [
      "☕ Boisson offerte", "🎟️ +100 pts fidélité", "🍪 Douceur maison", "🎁 -15% commande",
      "🥤 Boisson fraîche", "🎲 1 Chance au jeu", "🍰 Dessert offert", "🎉 Goodie surprise"
    ];

    let gridCards = "";
    for (let day = 1; day <= nb; day++) {
      const surpriseObj = (c.surprises || []).find((s) => s.jour === day);
      const gainText = surpriseObj ? surpriseObj.gain : defaultSurprises[(day - 1) % defaultSurprises.length];
      const isOpened = day < 3;
      const isToday = day === 3;

      let cardClass = "cs-mini-cal-card";
      if (isOpened) cardClass += " is-opened";
      else if (isToday) cardClass += " is-today";
      else cardClass += " is-locked";

      gridCards += `
        <div class="${cardClass}" data-cal-day="${day}" style="${boxBg}">
          <span class="cs-mini-day-badge">${day}</span>
          ${isOpened ? `<div class="cs-mini-gain-text">✅ ${escapeHtml(gainText)}</div>` : isToday ? `<div class="cs-mini-gain-pulse">🎁 Ouvrir !</div>` : `<div class="cs-mini-locked-icon">🔒</div>`}
        </div>
      `;
    }

    return `
      <div class="kp-play-surface" style="${bgStyle};color:${textColor};">
        <div class="k-stripe-bar" style="height:10px;"></div>
        <div class="kp-play-inner">
          <span class="kp-play-mech-badge">🗓️ Calendrier des Surprises · ${nb} jours</span>
          <h3 class="kp-play-title" style="color:${textColor};margin-bottom:0.35rem;">${escapeHtml(c.name)}</h3>
          <p style="font-size:0.74rem;margin:0 0 0.6rem;opacity:0.9;">
            ${c.qrDiffusion === "emport_livraison" ? "🛵 Disponible au comptoir &amp; dans vos sacs Uber Eats / Deliveroo" : "🏪 Scannez chaque jour au comptoir ou en entreprise pour révéler votre cadeau !"}
          </p>

          <div id="cs-today-reveal-banner" style="background:#e6f9ef;color:#161317;border:2px solid #161317;border-radius:12px;padding:0.45rem 0.65rem;text-align:center;font-size:0.75rem;font-weight:800;box-shadow:3px 3px 0 #161317;margin-bottom:0.7rem;">
            🎁 Case du jour n°3 débloquée : <b>🍪 Douceur maison offerte</b>
            <div style="font-size:0.68rem;font-weight:600;margin-top:0.15rem;">Code retrait : <code style="background:#ffd93d;padding:0.1rem 0.35rem;border-radius:4px;border:1px solid #161317;">CAL-3819</code></div>
          </div>

          <div class="cs-mini-cal-grid" style="display:grid;grid-template-columns:repeat(4, 1fr);gap:0.38rem;">
            ${gridCards}
          </div>
        </div>
      </div>
    `;
  }

  function bindCalendrierInteractive(root) {
    const todayCard = $(".cs-mini-cal-card.is-today", root);
    const banner = $("#cs-today-reveal-banner", root);
    if (!todayCard || !banner) return;
    todayCard.style.cursor = "pointer";
    todayCard.addEventListener("click", () => {
      todayCard.classList.remove("is-today");
      todayCard.classList.add("is-opened");
      todayCard.innerHTML = `<span class="cs-mini-day-badge">3</span><div class="cs-mini-gain-text">🍪 Douceur</div>`;
      banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  /* ==========================================================================
     MODALE DE PUBLICATION & TUNNEL DE CONVERSION (Guest -> Free Account -> Subscribed)
     ========================================================================== */
  function openPublishModal() {
    const modal = $("#k-modal-publish");
    const badge = $("#k-pub-badge");
    const title = $("#k-pub-title");
    const body = $("#k-pub-body");
    if (!modal || !body) return;

    // Sauvegarde immédiate de tous les réglages actuels
    CB.saveDrafts(drafts);
    try {
      localStorage.setItem("lc_studio_draft", JSON.stringify(drafts));
      localStorage.setItem("lc_active_module", currentModule);
    } catch {
      // Ignore quota errors
    }

    modal.hidden = false;

    const modNames = {
      vitrine: `Vitrine & Réservation « ${drafts.vitrine.nom} »`,
      roue: `Jeu Instantané « ${drafts.roue.name} »`,
      pronostics: `Championnat de Pronostics « ${drafts.pronostics.title} »`,
      fidelite: `Passeport de Fidélité « ${drafts.fidelite.name} »`,
      calendrier: `Calendrier Surprise « ${drafts.calendrier?.name || "Calendrier des Surprises"} »`,
    };
    const currentModTitle = modNames[currentModule];

    badge.textContent = "🔐 ÉTAPE DE PUBLICATION & QR CODE";
    title.textContent = "Votre configuration est prête !";
    body.innerHTML = `
      <div class="k-pub-onboarding-box">
        <p class="k-pub-lead">
          Vous venez de personnaliser votre <b>${escapeHtml(currentModTitle)}</b>. Pour débloquer votre QR code officiel haute définition et le déployer auprès de vos clients :
        </p>

        <div class="k-onboard-steps">
          <div class="k-onboard-step">
            <div class="k-onboard-num">1</div>
            <div class="k-onboard-body">
              <strong>Créez votre compte commerçant gratuit</strong>
              <p>Toutes vos personnalisations (textes, offres, couleurs, règles de jeu) sont mémorisées et seront importées directement dans votre espace.</p>
            </div>
          </div>

          <div class="k-onboard-step">
            <div class="k-onboard-num">2</div>
            <div class="k-onboard-body">
              <strong>Activez la formule adaptée à votre établissement</strong>
              <p>Créez votre compte gratuitement sans carte bancaire pour sauvegarder vos créations, générer vos planches de QR codes et publier dès que vous êtes prêt.</p>
            </div>
          </div>
        </div>

        <div class="k-modal-cta-stack" style="margin-top:1.2rem;display:flex;flex-direction:column;gap:0.65rem;">
          <button type="button" class="k-btn k-btn-orange k-btn-full" id="k-btn-to-signup" style="padding:0.75rem 1rem;font-size:0.95rem;">
            Créer mon compte pour publier →
          </button>
          <button type="button" class="k-btn k-btn-white k-btn-full" id="k-btn-keep-editing-modal">
            ← Continuer à personnaliser sans publier
          </button>
        </div>
      </div>
    `;

    $("#k-btn-to-signup", body)?.addEventListener("click", () => {
      try {
        localStorage.setItem("lc_studio_draft", JSON.stringify(drafts));
        localStorage.setItem("lc_active_module", currentModule);
      } catch {}
      window.location.href = `/signup?from=studio&module=${encodeURIComponent(currentModule)}`;
    });

    $("#k-btn-keep-editing-modal", body)?.addEventListener("click", () => {
      modal.hidden = true;
    });
  }

  /* ── UTILITAIRES D'ÉCHAPPEMENT HTML ── */
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  /* ── INITIALISATION GLOBALE DU STUDIO ── */
  $$("#k-module-switcher .k-mod-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentModule = btn.dataset.module;
      currentStepIndex = 0;
      drafts.lastModule = currentModule;
      triggerAutoSave();
      renderModuleTabs();
      renderStepsBar();
      renderFormColumn();
      renderPreviewColumn();
    });
  });

  $("#k-btn-preview-fullscreen")?.addEventListener("click", () => {
    const modal = $("#k-modal-preview");
    const phoneLarge = $("#k-modal-preview-phone");
    if (!modal || !phoneLarge) return;
    phoneLarge.innerHTML = $("#k-preview-phone")?.innerHTML || "";
    if (currentModule === "roue") bindInteractivePlayInside(phoneLarge);
    if (currentModule === "calendrier") bindCalendrierInteractive(phoneLarge);
    modal.hidden = false;
  });

  $("#k-close-preview-modal")?.addEventListener("click", () => {
    $("#k-modal-preview").hidden = true;
  });
  $("#k-modal-preview-continue")?.addEventListener("click", () => {
    $("#k-modal-preview").hidden = true;
  });
  $("#k-modal-preview-to-publish")?.addEventListener("click", () => {
    $("#k-modal-preview").hidden = true;
    openPublishModal();
  });

  $("#k-btn-publish")?.addEventListener("click", () => openPublishModal());
  $("#k-dock-btn-form")?.addEventListener("click", () => {
    setMobileStudioView("form", true);
  });
  $("#k-dock-btn-preview")?.addEventListener("click", () => {
    setMobileStudioView("preview", true);
  });
  $("#k-dock-btn-publish")?.addEventListener("click", () => openPublishModal());
  $("#k-account-btn")?.addEventListener("click", () => openPublishModal(true));
  $("#k-cap-save-account-btn")?.addEventListener("click", () => openPublishModal());
  $("#k-close-publish-modal")?.addEventListener("click", () => {
    $("#k-modal-publish").hidden = true;
  });
  $("#k-modal-preview")?.addEventListener("click", (e) => {
    if (e.target === $("#k-modal-preview")) $("#k-modal-preview").hidden = true;
  });
  $("#k-modal-publish")?.addEventListener("click", (e) => {
    if (e.target === $("#k-modal-publish")) $("#k-modal-publish").hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("#k-modal-preview") && !$("#k-modal-preview").hidden) $("#k-modal-preview").hidden = true;
    if ($("#k-modal-publish") && !$("#k-modal-publish").hidden) $("#k-modal-publish").hidden = true;
  });

  updateHeaderAuthUI();
  renderModuleTabs();
  renderStepsBar();
  renderFormColumn();
  renderPreviewColumn();
})();
