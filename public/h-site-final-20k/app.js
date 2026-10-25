/* ============================================================
   SITE FINAL 20K (H) — LASTCHANCE
   Accueille l'interactivité de index.html ET de vitrine-reservation.html
   Source unique des prix et formules : ../shared/offre.js (window.LC_OFFRE)
   ============================================================ */
(function () {
  const O = window.LC_OFFRE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, attrs = {}, html = "") => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.innerHTML = html;
    return n;
  };

  /* ── 1. BULLES ROSES FLOTTANTES SUR FOND BEIGE ── */
  const bubblesBox = $("#bubbles");
  if (bubblesBox) {
    for (let i = 0; i < 16; i++) {
      const b = el("span", { class: "b-bubble" });
      const size = 18 + Math.random() * 38;
      b.style.width = `${size}px`;
      b.style.height = `${size}px`;
      b.style.left = `${Math.random() * 100}%`;
      b.style.animationDuration = `${14 + Math.random() * 16}s`;
      b.style.animationDelay = `${Math.random() * 10}s`;
      b.style.setProperty("--drift", `${(Math.random() - 0.5) * 80}px`);
      bubblesBox.appendChild(b);
    }
  }

  /* ── 2. STORYBOARD INTERACTIF 3 ÉCRANS (« 1. ILS SCANNENT · 2. ILS JOUENT · 3. ILS GAGNENT ») ── */
  const storyContainer = $("#storyboard-demo");
  const storyTrigger = $("#demo-story-trigger");
  const storyPrizeLabel = $("#story-prize-label");
  const storyPrizeCode = $("#story-prize-code");

  const STORY_PRIZES = [
    "-20% sur votre visite",
    "Cadeau Surprise Offert",
    "Soin / Produit Découverte",
    "Bon d'achat de 10 €",
  ];

  if (storyContainer) {
    const cards = $$(".story-phone-card", storyContainer);
    const sgsCards = $$(".sgs-card", storyContainer);
    const activateStep = (stepNum) => {
      cards.forEach((c) => c.classList.toggle("is-active", Number(c.dataset.step) === stepNum));
      if (stepNum === 2 && sgsCards.length) {
        sgsCards.forEach((c) => c.classList.remove("is-spotlight"));
        const randomCard = sgsCards[Math.floor(Math.random() * sgsCards.length)];
        randomCard?.classList.add("is-spotlight");
      }
      if (stepNum === 3 && storyPrizeCode && storyPrizeLabel) {
        storyPrizeLabel.textContent = STORY_PRIZES[Math.floor(Math.random() * STORY_PRIZES.length)];
        storyPrizeCode.textContent = "LC-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      }
    };

    cards.forEach((card) => {
      card.addEventListener("click", () => activateStep(Number(card.dataset.step)));
    });

    if (storyTrigger) {
      storyTrigger.addEventListener("click", () => {
        activateStep(1);
        setTimeout(() => activateStep(2), 900);
        setTimeout(() => activateStep(3), 2400);
      });
    }
  }

  /* ── 3. LE MANÈGE INTERACTIF DES 10 MÉCANIQUES DE JEU (Sans doublons Vitrine/RDV) ── */
  const S = 'stroke="#161317" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';
  const JUKEBOX_GAMES = [
    {
      id: "core",
      emoji: "🎰",
      short: "15 Jeux Instantanés",
      title: "15 Jeux Instantanés Personnalisables (9 Hasard + 6 Adresse)",
      cat: "Varier les plaisirs toute l'année",
      color: "#c4a3ff",
      desc: "Machine à sous, coffre mystère, carte à gratter, bonneteau, lancer de dé, jauge de réflexe, mot mystère ou roue : alternez entre 15 mécaniques ludiques aux couleurs de votre établissement.",
      usage: "🎰 9 jeux de hasard + 6 défis d'adresse inclus dès 29 €/mois",
      visual: `
        <div class="jb-anim-scene">
          <div style="display:flex;gap:0.45rem;align-items:center;justify-content:center;flex-wrap:wrap;">
            <span class="jb-stamp-dot stamped" style="width:46px;height:46px;background:#ffd93d;">🎰</span>
            <span class="jb-stamp-dot stamped" style="width:46px;height:46px;background:#98f5d4;">🧰</span>
            <span class="jb-stamp-dot stamped" style="width:46px;height:46px;background:#ffb8d9;">🎟️</span>
            <span class="jb-stamp-dot stamped" style="width:46px;height:46px;background:#e3cfff;">⚡</span>
          </div>
          <a href="jeux-pronostics.html" class="jb-live-pill" style="text-decoration:none;color:#161317;">✨ Explorer les 15 mécaniques en détail →</a>
        </div>
      `,
    },
    {
      id: "loyalty",
      emoji: "🛂",
      short: "Passeport Fidélité",
      title: "Passeport Fidélité 100% Mobile",
      cat: "Fidéliser sans carte papier",
      color: "#5de4b3",
      desc: "Fini les cartes en carton oubliées ou perdues : à chaque passage, votre client collectionne ses tampons directement sur son téléphone jusqu'à débloquer sa récompense.",
      usage: "🎁 Idéal pour fidéliser vos habitués semaine après semaine",
      visual: `
        <div class="jb-anim-scene">
          <div class="jb-stamps-row">
            <span class="jb-stamp-dot stamped">★</span>
            <span class="jb-stamp-dot stamped" style="animation-delay:0.2s">★</span>
            <span class="jb-stamp-dot stamped" style="animation-delay:0.4s">★</span>
            <span class="jb-stamp-dot stamped" style="animation-delay:0.6s">★</span>
            <span class="jb-stamp-dot" style="background:#ff4fa3;color:#fff">🎁</span>
          </div>
          <span class="jb-live-pill">✓ 4/5 visites validées · Cadeau au prochain scan !</span>
        </div>
      `,
    },
    {
      id: "calendar",
      emoji: "📅",
      short: "Calendrier Surprise",
      title: "Calendrier à Surprises & Temps Forts",
      cat: "Créer un rendez-vous quotidien",
      color: "#ffd93d",
      desc: "Avent, été, anniversaire de votre boutique ou lancement de collection : chaque jour, une nouvelle case s'ouvre sur le téléphone de vos clients avec une surprise à découvrir.",
      usage: "📅 Parfait pour animer une période de fête ou un lancement",
      visual: `
        <div class="jb-anim-scene">
          <div class="jb-doors-row">
            <div class="jb-cal-door"><span>Jour 1</span><small>🔒</small></div>
            <div class="jb-cal-door open"><span>Jour 2</span><b>🎁 -15%</b></div>
            <div class="jb-cal-door"><span>Jour 3</span><small>🔒</small></div>
          </div>
          <span class="jb-live-pill">✨ Une case à ouvrir chaque jour</span>
        </div>
      `,
    },
    {
      id: "referral",
      emoji: "🤝",
      short: "Parrainage",
      title: "Bouche-à-Oreille & Parrainage à Paliers",
      cat: "Transformer vos clients en ambassadeurs",
      color: "#ff8b3d",
      desc: "Vos clients partagent leur lien à leurs proches en un clic sur WhatsApp ou SMS : dès qu'un ami vient chez vous, le parrain et le filleul débloquent leur avantage.",
      usage: "🤝 Acquisition naturelle grâce à vos meilleurs clients",
      visual: `
        <div class="jb-anim-scene">
          <div class="jb-stamps-row" style="align-items:center">
            <span class="jb-stamp-dot stamped" style="width:48px;height:48px">😊</span>
            <b style="font-size:1.2rem">➔</b>
            <span class="jb-stamp-dot stamped" style="width:48px;height:48px;background:#5de4b3">🙋‍♀️</span>
            <b style="font-size:1.2rem">➔</b>
            <span class="jb-stamp-dot stamped" style="width:48px;height:48px;background:#ff4fa3;color:#fff">🎁</span>
          </div>
          <span class="jb-live-pill">🚀 1 ami invité = 2 récompenses débloquées</span>
        </div>
      `,
    },
    {
      id: "quiz",
      emoji: "🧠",
      short: "Quiz Interactif",
      title: "Quiz Ludique & Parcours de Questions",
      cat: "Engager & Divertir",
      color: "#ff7eb6",
      desc: "Testez les connaissances de vos visiteurs autour de votre univers, de vos produits ou de la culture générale avec un classement instantané à la clé.",
      usage: "🧠 Jouable en autonomie sur mobile ou lors d'un événement",
      visual: `
        <div class="jb-anim-scene">
          <div style="background:#fcf7eb;border:2px solid #161317;border-radius:14px;padding:0.55rem 1rem;font-weight:800;font-size:0.84rem;box-shadow:3px 3px 0 #161317;">
            ❓ Question 3/5 · Réponse B validée !
          </div>
          <span class="jb-live-pill" style="background:#5de4b3">✓ +150 points · Nouveau record !</span>
        </div>
      `,
    },
    {
      id: "events",
      emoji: "📺",
      short: "Événements sur Écran",
      title: "Animation en Direct sur Grand Écran",
      cat: "Animer tout un public simultanément",
      color: "#84c4ff",
      desc: "Projetez la partie sur un écran TV ou vidéoprojecteur : tous les présents dans votre lieu ou sur votre stand répondent en direct depuis leur téléphone !",
      usage: "📺 Jusqu'à 250 participants connectés en même temps",
      visual: `
        <div class="jb-anim-scene">
          <div style="display:flex;gap:0.7rem;align-items:center;">
            <div style="background:#dcecff;border:2.5px solid #161317;border-radius:12px;padding:0.5rem 0.9rem;font-weight:800;font-size:0.82rem;box-shadow:3px 3px 0 #161317;">
              📺 ÉCRAN PRINCIPAL · Top 1 : Léa (980 pts)
            </div>
            <span style="font-size:1.5rem">📱⚡</span>
          </div>
          <span class="jb-live-pill">🔥 Classement en temps réel</span>
        </div>
      `,
    },
    {
      id: "jackpot",
      emoji: "💰",
      short: "Jackpot Collectif",
      title: "Cagnotte Commune & Tirage Collectif",
      cat: "Fédérer votre communauté",
      color: "#5de4b3",
      desc: "Chaque scan fait grimper une jauge commune ! Dès qu'elle atteint 100%, le grand tirage au sort se déclenche parmi tous les participants.",
      usage: "🎉 Crée une excitation collective autour d'un gros lot",
      visual: `
        <div class="jb-anim-scene">
          <div class="jb-jackpot-bar"><div class="jb-jackpot-fill"></div></div>
          <span class="jb-live-pill">💥 Jauge collective : 92% · Tirage imminent !</span>
        </div>
      `,
    },
    {
      id: "pronostics",
      emoji: "⚽",
      short: "Pronostics",
      title: "Concours de Pronostics Sportifs",
      cat: "Faire vibrer vos habitués toute la saison",
      color: "#ffd93d",
      desc: "Avant chaque grand match ou compétition, vos clients déposent leur pronostic sur votre QR code et grimpent au classement général de votre établissement.",
      usage: "🏆 Parfait pour les grands événements sportifs de l'année",
      visual: `
        <div class="jb-anim-scene">
          <div style="display:flex;gap:0.6rem;align-items:center;font-weight:900;font-size:1rem;">
            <span style="background:#fff;border:2px solid #161317;padding:0.35rem 0.75rem;border-radius:12px">Équipe A : 2</span>
            <span>⚡</span>
            <span style="background:#ffd93d;border:2px solid #161317;padding:0.35rem 0.75rem;border-radius:12px">Équipe B : 1</span>
          </div>
          <span class="jb-live-pill">⚽ Pronostic exact = +300 points</span>
        </div>
      `,
    },
    {
      id: "hunts",
      emoji: "🔍",
      short: "Chasse au QR",
      title: "Chasse aux QR Codes & Parcours Ludique",
      cat: "Créer du trafic dans vos espaces",
      color: "#c4a3ff",
      desc: "Disséminez plusieurs QR codes dans votre boutique, votre salon, votre événement ou entre commerçants partenaires : chaque code trouvé rapproche du trésor final.",
      usage: "🗺️ Fait circuler les visiteurs dans tous vos rayons ou stands",
      visual: `
        <div class="jb-anim-scene">
          <div class="jb-stamps-row" style="align-items:center">
            <span class="jb-stamp-dot stamped">📍1</span>
            <b>⋯➔</b>
            <span class="jb-stamp-dot stamped">📍2</span>
            <b>⋯➔</b>
            <span class="jb-stamp-dot" style="background:#ff4fa3;color:#fff">🏆</span>
          </div>
          <span class="jb-live-pill">🔍 Indice 2/3 scanné · Plus qu'un QR à trouver !</span>
        </div>
      `,
    },
    {
      id: "duo_bande",
      emoji: "🥳",
      short: "Duo Miroir & Bande",
      title: "Duo Miroir (à 2) & Portrait de la Bande (en groupe)",
      cat: "Briser la glace & faire rire ensemble",
      color: "#ff7eb6",
      desc: "Inclus dans toutes nos formules : des questions complices et décalées où l'on vote sur son téléphone pour deviner ce que pense son binôme ou son groupe d'amis !",
      usage: "💬 Inclus d'office dans les 5 formules Lastchance",
      visual: `
        <div class="jb-anim-scene">
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <span class="jb-cal-door open" style="width:72px;height:56px;transform:rotate(-6deg)">📱 Toi</span>
            <b style="font-size:1.3rem">⚡</b>
            <span class="jb-cal-door" style="width:72px;height:56px;background:#5de4b3;transform:rotate(6deg)">📱 Ami(e)</span>
          </div>
          <span class="jb-live-pill">🥂 85% de complicité · Fous rires garantis !</span>
        </div>
      `,
    },
  ];

  const jbTokensBox = $("#jukebox-tokens");
  const jbStage = $("#jukebox-stage");
  const jbCat = $("#jb-cat");
  const jbCounter = $("#jb-counter");
  const jbVisual = $("#jb-visual");
  const jbTitle = $("#jb-title");
  const jbDesc = $("#jb-desc");
  const jbUsage = $("#jb-usage");
  const jbPrev = $("#jb-prev");
  const jbNext = $("#jb-next");
  const carnivalRibbon = $("#carnival-ribbon");

  let activeGameIdx = 0;

  const selectJukeboxGame = (idx) => {
    activeGameIdx = (idx + JUKEBOX_GAMES.length) % JUKEBOX_GAMES.length;
    const g = JUKEBOX_GAMES[activeGameIdx];
    if (jbStage) jbStage.style.background = g.color;
    if (jbCat) jbCat.textContent = g.cat;
    if (jbCounter) jbCounter.textContent = `Expérience ${activeGameIdx + 1} / ${JUKEBOX_GAMES.length}`;
    if (jbVisual) jbVisual.innerHTML = g.visual;
    if (jbTitle) jbTitle.textContent = g.title;
    if (jbDesc) jbDesc.textContent = g.desc;
    if (jbUsage) jbUsage.textContent = g.usage;

    if (jbTokensBox) {
      $$(".jb-token-pill", jbTokensBox).forEach((btn, i) => {
        btn.classList.toggle("is-active", i === activeGameIdx);
        btn.setAttribute("aria-selected", String(i === activeGameIdx));
      });
    }
  };

  if (jbTokensBox) {
    JUKEBOX_GAMES.forEach((g, idx) => {
      const btn = el("button", {
        type: "button",
        role: "tab",
        class: "jb-token-pill" + (idx === 0 ? " is-active" : ""),
        "aria-selected": String(idx === 0),
      }, `<span class="jb-token-emoji">${g.emoji}</span><span>${g.short}</span>`);
      btn.addEventListener("click", () => selectJukeboxGame(idx));
      jbTokensBox.appendChild(btn);
    });
    selectJukeboxGame(0);
  }

  if (jbPrev) jbPrev.addEventListener("click", () => selectJukeboxGame(activeGameIdx - 1));
  if (jbNext) jbNext.addEventListener("click", () => selectJukeboxGame(activeGameIdx + 1));

  if (carnivalRibbon) {
    // Dupliquer la liste pour un défilement continu infini sans coupure
    const ribbonItems = [...JUKEBOX_GAMES, ...JUKEBOX_GAMES];
    ribbonItems.forEach((g, i) => {
      const realIdx = i % JUKEBOX_GAMES.length;
      const ticket = el("div", {
        class: "ribbon-ticket-card",
        style: `background:${g.color}`,
      }, `
        <span class="ribbon-ticket-icon">${g.emoji}</span>
        <div>
          <strong>${g.short}</strong>
          <small>${g.cat}</small>
        </div>
      `);
      ticket.addEventListener("click", () => {
        selectJukeboxGame(realIdx);
        if (jbStage) jbStage.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      carnivalRibbon.appendChild(ticket);
    });
  }

  /* ── 4. LES 5 FORMULES & LE SIMULATEUR SUR-MESURE ── */
  const cfgPlansBox = $("#f-config-plans");
  const cfgAddonsBox = $("#f-config-addons");
  const cfgTotal = $("#f-config-total");
  const cfgSummaryTotal = $("#f-config-summary-total");
  const cfgPlanName = $("#f-config-plan-name");
  const cfgPlanTagline = $("#f-config-plan-tagline");
  const cfgJauge = $("#f-config-jauge");
  const cfgChips = $("#f-config-chips");
  const cfgCtaSignup = $("#f-config-cta-signup");
  const cfgSummaryCta = $("#f-config-summary-cta");

  let selectedPlanIdx = 1; // Le Club (59 €) par défaut
  const selectedAddons = new Set();

  const saveCheckoutDraftAndRedirect = (plan, addonsList, total) => {
    try {
      const draft = {
        planId: plan.id,
        planNom: plan.nom,
        prix: plan.prix,
        jauge: plan.jauge,
        addons: addonsList,
        totalMensuel: total,
        interval: "monthly",
        createdAt: new Date().toISOString()
      };
      localStorage.setItem("lc_checkout_draft", JSON.stringify(draft));
      localStorage.setItem("lc_selected_plan", plan.id);
      if (addonsList && addonsList.length) {
        localStorage.setItem("lc_selected_addons", JSON.stringify(addonsList));
      } else {
        localStorage.removeItem("lc_selected_addons");
      }
    } catch {
      // Ignore localStorage errors
    }
    const addonsParam = addonsList && addonsList.length ? `&addons=${encodeURIComponent(addonsList.join(","))}` : "";
    window.location.href = `/signup?plan=${encodeURIComponent(plan.id)}${addonsParam}`;
  };

  const updateConfigurator = () => {
    if (!O) return;
    const plan = O.FORMULES[selectedPlanIdx];
    let sum = plan.prix;
    const allRights = new Set(plan.droits);

    O.OPTIONS.ligneAbonnement.forEach((a) => {
      const cb = $(`input[data-addon="${a.id}"]`, cfgAddonsBox);
      const alreadyInPlan = plan.droits.includes(a.id);
      if (cb) {
        cb.disabled = alreadyInPlan;
        if (alreadyInPlan) {
          cb.checked = true;
        } else {
          cb.checked = selectedAddons.has(a.id);
          if (cb.checked) {
            sum += a.prix;
            allRights.add(a.id);
          }
        }
      }
    });

    if (cfgTotal) cfgTotal.textContent = `${sum} € / mois`;
    if (cfgSummaryTotal) cfgSummaryTotal.textContent = `${sum} € / mois`;
    if (cfgPlanName) cfgPlanName.textContent = `Formule ${plan.nom} (${plan.prix} €)`;
    if (cfgPlanTagline) cfgPlanTagline.textContent = plan.tagline;
    if (cfgJauge) cfgJauge.textContent = `👥 Jusqu'à ${plan.jauge} participants en simultané · 7 jours d'essai gratuit`;
    if (cfgChips) {
      cfgChips.innerHTML = [...allRights].map((d) => `<span>✓ ${O.label(d)}</span>`).join("");
    }
    if (cfgPlansBox) {
      $$(".cfg-plan-btn", cfgPlansBox).forEach((b, idx) => {
        b.classList.toggle("active", idx === selectedPlanIdx);
      });
    }
  };

  const handleConfiguratorSignup = () => {
    if (!O) return;
    const plan = O.FORMULES[selectedPlanIdx];
    let sum = plan.prix;
    const addonsList = [];
    O.OPTIONS.ligneAbonnement.forEach((a) => {
      if (!plan.droits.includes(a.id) && selectedAddons.has(a.id)) {
        sum += a.prix;
        addonsList.push(a.id);
      }
    });
    saveCheckoutDraftAndRedirect(plan, addonsList, sum);
  };

  if (cfgCtaSignup) cfgCtaSignup.addEventListener("click", handleConfiguratorSignup);
  if (cfgSummaryCta) cfgSummaryCta.addEventListener("click", handleConfiguratorSignup);

  const PASS_COLORS = ["#FFF0BD", "#CFBCFF", "#84C4FF", "#9EF0C7", "#FFD54F"];
  const deck = $("#plans-deck");

  if (deck && O) {
    const club = O.FORMULES.find((f) => f.id === "engagement");
    const live = O.FORMULES.find((f) => f.id === "live");
    O.FORMULES.forEach((f, i) => {
      let topBadge = "";
      if (f.id === "full" && f.prix < club.prix + live.prix) {
        topBadge = `<span class="plan-tag-top">★ Formule Intégrale (-19 €)</span>`;
      }
      const chips = [...new Set(f.droits)].map((d) => `<span>${O.label(d)}</span>`).join("");
      const card = el("article", { class: "plan-ticket", style: `background:${PASS_COLORS[i]}` }, `
        ${topBadge}
        <span class="plan-purpose">${f.promesse}</span>
        <h3>${f.nom}</h3>
        <div class="plan-amount">${f.prix}<small> €/mois</small></div>
        <p class="plan-summary-text">${f.tagline.split(":").slice(1).join(":").trim()}</p>
        <ul>${f.points.map((p) => `<li>${p}</li>`).join("")}</ul>
        <div style="margin-top:auto;display:grid;gap:0.65rem">
          <small style="font-weight:700">Jusqu'à ${f.jauge} participants · Essai 7 jours</small>
          <div class="plan-chips">${chips}</div>
          <button type="button" class="ticket-btn pop-btn-ink choose-plan-signup-btn" style="text-align:center;width:100%;cursor:pointer;">
            Choisir ${f.nom} (Essai 7j) →
          </button>
          <a class="plan-custom-link" style="text-align:center;font-size:0.8rem;font-weight:700;color:var(--ink);text-decoration:underline;cursor:pointer;" href="#configurateur">
            Personnaliser dans le simulateur ↓
          </a>
        </div>
      `);
      const signupBtn = $(".choose-plan-signup-btn", card);
      if (signupBtn) {
        signupBtn.addEventListener("click", () => {
          saveCheckoutDraftAndRedirect(f, [], f.prix);
        });
      }
      const customLink = $(".plan-custom-link", card);
      if (customLink) {
        customLink.addEventListener("click", () => {
          selectedPlanIdx = i;
          updateConfigurator();
        });
      }
      deck.appendChild(card);
    });
  }

  if (cfgPlansBox && cfgAddonsBox && O) {
    O.FORMULES.forEach((f, idx) => {
      const btn = el("button", { type: "button", class: "cfg-plan-btn" }, `${f.nom}<b>${f.prix} €</b>`);
      btn.addEventListener("click", () => {
        selectedPlanIdx = idx;
        updateConfigurator();
      });
      cfgPlansBox.appendChild(btn);
    });

    O.OPTIONS.ligneAbonnement.forEach((a) => {
      const lbl = el("label", { class: "cfg-addon-label" }, `
        <input type="checkbox" data-addon="${a.id}" />
        <span>${a.nom} (+${a.prix} €)</span>
      `);
      const input = $("input", lbl);
      input.addEventListener("change", () => {
        if (input.checked) selectedAddons.add(a.id);
        else selectedAddons.delete(a.id);
        updateConfigurator();
      });
      cfgAddonsBox.appendChild(lbl);
    });
    updateConfigurator();
  }

  const C = window.LC_CODEBASE;

  /* ── 4B. MODALE EXPÉRIENCE JOUEUR /PLAY AU CLIC SUR LE QR CODE DU HÉRO (18 THÈMES DU CODE SOURCE) ── */
  const heroQrBtn = $("#hero-qr-play-btn");
  const heroOpenPlayCta = $("#hero-open-play-cta");
  const modalHeroPlay = $("#modal-hero-play");
  const hpModalClose = $("#hp-modal-close");
  const hpPresetsGrid = $("#hp-presets-grid");
  const hpMechanicsStrip = $("#hp-mechanics-strip");
  const hpPhoneScreen = $("#hp-phone-screen");
  const hpOpenStudioBtn = $("#hp-open-studio-btn");
  const hpSpinTriggerLeft = $("#hp-spin-trigger-left");

  if (modalHeroPlay && C) {
    let drafts = C.loadDrafts();
    let hpTab = "ambiances";
    let hpPresetKey = drafts.roue.preset || "kermesse";
    let hpMechanic = drafts.roue.gameType || "wheel";
    let hpWheelDeg = 0;
    let hpLastWin = null;

    const getPresetByKey = (key) => {
      return (
        C.WHEEL_PRESETS.find((p) => p.key === key) ||
        C.WHEEL_PRESETS_AMBIANCE[0]
      );
    };

    const renderHpPresets = () => {
      if (!hpPresetsGrid) return;
      const list = hpTab === "ambiances" ? C.WHEEL_PRESETS_AMBIANCE : C.WHEEL_PRESETS_UNIVERS;
      hpPresetsGrid.innerHTML = list
        .map((p) => {
          const isAct = p.key === hpPresetKey;
          const fondKey = p.style && p.style.fond;
          const thumbHtml = fondKey
            ? `<div class="k-preset-thumb" style="height:36px;background-image:url('fonds/${fondKey}-vignette.webp')"></div>`
            : `<div class="k-preset-swatches">${(p.swatch || [])
                .map((c) => `<i style="background:${c}"></i>`)
                .join("")}</div>`;
          return `
            <button type="button" class="k-preset-tile ${isAct ? "active" : ""}" data-hp-preset="${p.key}" style="padding:0.45rem 0.55rem;">
              <div class="k-preset-tile-head" style="font-size:0.75rem;">
                <span>${p.label}</span>
              </div>
              ${thumbHtml}
            </button>
          `;
        })
        .join("");

      $$("[data-hp-preset]", hpPresetsGrid).forEach((btn) => {
        btn.addEventListener("click", () => {
          hpPresetKey = btn.dataset.hpPreset;
          hpLastWin = null;
          renderHpPresets();
          renderHpPhone();
        });
      });
    };

    const renderHpMechanics = () => {
      if (!hpMechanicsStrip) return;
      hpMechanicsStrip.innerHTML = C.INSTANT_MECHANICS.map((m) => {
        const isAct = m.key === hpMechanic;
        return `
          <button type="button" class="hp-mech-chip ${isAct ? "active" : ""}" data-hp-mech="${m.key}">
            ${m.emoji} ${m.label}
          </button>
        `;
      }).join("");

      $$("[data-hp-mech]", hpMechanicsStrip).forEach((btn) => {
        btn.addEventListener("click", () => {
          hpMechanic = btn.dataset.hpMech;
          hpLastWin = null;
          renderHpMechanics();
          renderHpPhone();
        });
      });
    };

    const triggerHpPlayRound = () => {
      const lots = drafts.roue.lots && drafts.roue.lots.length
        ? drafts.roue.lots.filter((l) => l.isWinning)
        : [
            { label: "-15 % sur votre visite" },
            { label: "Café ou Douceur offerte" },
            { label: "Cadeau Découverte VIP" },
          ];
      const won = lots[Math.floor(Math.random() * lots.length)] || { label: "Cadeau surprise" };
      const code = "LC-" + Math.random().toString(36).substring(2, 6).toUpperCase();
      hpWheelDeg += 1080 + Math.floor(Math.random() * 360);
      hpLastWin = { label: won.label, code };
      renderHpPhone(true);
    };

    const renderHpPhone = () => {
      if (!hpPhoneScreen) return;
      const p = getPresetByKey(hpPresetKey);
      const st = p.style || {};
      const mech = C.INSTANT_MECHANICS.find((m) => m.key === hpMechanic) || C.INSTANT_MECHANICS[0];
      const isDark = st.pageTheme === "nuit" && !st.fond;

      if (st.fond) {
        hpPhoneScreen.style.backgroundImage = `linear-gradient(180deg, rgba(253,246,227,0.78), rgba(253,246,227,0.88)), url('fonds/${st.fond}-640.webp')`;
        hpPhoneScreen.style.backgroundColor = "#fdf6e3";
      } else if (st.pageTheme === "kermesse") {
        hpPhoneScreen.style.backgroundImage = "none";
        hpPhoneScreen.style.backgroundColor = "#fdf6e3";
      } else {
        hpPhoneScreen.style.backgroundImage = `radial-gradient(circle at 50% -10%, ${st.bgFrom || "#2e1065"}, ${st.bgTo || "#09090b"} 78%)`;
        hpPhoneScreen.style.backgroundColor = st.bgTo || "#09090b";
      }
      hpPhoneScreen.style.color = isDark ? "#ffffff" : "#211d16";

      const cols = p.swatch && p.swatch.length >= 3
        ? [p.swatch[0], p.swatch[1], p.swatch[2], "#99b7f5"]
        : ["#fcca59", "#f296bd", "#99b7f5", "#267f53"];
      const conic = cols
        .map((c, i) => `${c} ${(i * 100) / cols.length}% ${((i + 1) * 100) / cols.length}%`)
        .join(", ");

      let stageVisual = "";
      if (mech.key === "wheel") {
        stageVisual = `
          <div style="position:relative;width:190px;height:190px;margin:0.35rem auto;">
            <div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);z-index:3;font-size:1.45rem;filter:drop-shadow(0 2px 0 #211d16);">🔻</div>
            <div id="hp-wheel-disc" style="width:100%;height:100%;border-radius:50%;background:conic-gradient(${conic});border:5px solid ${st.ringColor || "#211d16"};box-shadow:0 6px 0 rgba(0,0,0,0.35);transition:transform 0.9s cubic-bezier(0.2,0.9,0.25,1);transform:rotate(${hpWheelDeg}deg);display:grid;place-items:center;">
              <div style="width:42px;height:42px;border-radius:50%;background:#fdf6e3;border:3px solid #211d16;display:grid;place-items:center;font-size:1rem;">🎡</div>
            </div>
          </div>
        `;
      } else if (mech.key === "slot") {
        const syms = (C.SLOT_SYMBOL_SETS.fete || { symbols: ["🎪", "🎟️", "🍭"] }).symbols;
        stageVisual = `
          <div style="display:flex;gap:0.45rem;justify-content:center;margin:0.8rem 0;">
            <div style="width:58px;height:66px;border-radius:14px;background:#fff;border:3px solid #211d16;box-shadow:3px 3px 0 #211d16;display:grid;place-items:center;font-size:1.85rem;">${syms[0]}</div>
            <div style="width:58px;height:66px;border-radius:14px;background:${cols[0]};border:3px solid #211d16;box-shadow:3px 3px 0 #211d16;display:grid;place-items:center;font-size:1.85rem;">${hpLastWin ? syms[0] : syms[1]}</div>
            <div style="width:58px;height:66px;border-radius:14px;background:#fff;border:3px solid #211d16;box-shadow:3px 3px 0 #211d16;display:grid;place-items:center;font-size:1.85rem;">${hpLastWin ? syms[0] : syms[2]}</div>
          </div>
        `;
      } else {
        stageVisual = `
          <div style="background:rgba(255,255,255,0.94);color:#211d16;border:3px solid #211d16;border-radius:18px;padding:1rem;margin:0.5rem 0;text-align:center;box-shadow:4px 4px 0 #211d16;">
            <div style="font-size:2.4rem;line-height:1;">${mech.emoji}</div>
            <strong style="display:block;font:900 0.95rem var(--display);margin-top:0.3rem;">${mech.label}</strong>
            <small style="font-size:0.75rem;font-weight:700;color:#4f4739;">${mech.desc}</small>
          </div>
        `;
      }

      hpPhoneScreen.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.92);color:#211d16;padding:0.45rem 0.7rem;border-radius:12px;border:2px solid #211d16;font-size:0.74rem;font-weight:800;">
          <span>Thème : ${p.label}</span>
          <span style="background:${cols[0]};color:#211d16;padding:0.12rem 0.45rem;border-radius:999px;border:1.5px solid #211d16;">/play</span>
        </div>

        <div style="text-align:center;background:rgba(255,255,255,0.9);color:#211d16;padding:0.6rem 0.75rem;border-radius:14px;border:2px solid #211d16;">
          <small style="font:800 0.66rem var(--body);text-transform:uppercase;color:#267f53;">${mech.family === "adresse" ? "🎯 Défi d'adresse + Tirage" : "🎲 Jeu de hasard instantané"}</small>
          <strong style="display:block;font:900 1.02rem var(--display);">${drafts.vitrine.nom || "Votre Établissement"}</strong>
          <span style="font-size:0.76rem;font-weight:700;">${drafts.roue.name || "Tentez votre chance !"}</span>
        </div>

        ${stageVisual}

        <button type="button" class="k-btn k-btn-yellow k-btn-full" id="hp-phone-spin-btn" style="margin-top:auto;background:linear-gradient(135deg, ${st.buttonFrom || "#f5793b"}, ${st.buttonTo || "#fcca59"});color:#ffffff;">
          ▶ ${hpLastWin ? "Rejouer un tour !" : `Jouer (${mech.label})`}
        </button>

        ${
          hpLastWin
            ? `
          <div style="background:#e6f9ef;color:#211d16;border:2px solid #211d16;border-radius:12px;padding:0.55rem 0.7rem;text-align:center;font-size:0.76rem;font-weight:800;box-shadow:2px 2px 0 #211d16;">
            🎉 Gain : <b>${hpLastWin.label}</b> · Code caisse : <code style="background:#fcca59;padding:0.1rem 0.35rem;border-radius:5px;border:1px solid #211d16;">${hpLastWin.code}</code>
          </div>
        `
            : `
          <div style="background:rgba(255,255,255,0.88);color:#211d16;border:1.5px solid #211d16;border-radius:10px;padding:0.4rem 0.6rem;text-align:center;font-size:0.71rem;font-weight:700;">
            💡 Cliquez sur les 18 thèmes à gauche pendant que vous jouez !
          </div>
        `
        }
      `;

      const spinBtn = $("#hp-phone-spin-btn", hpPhoneScreen);
      if (spinBtn) spinBtn.addEventListener("click", triggerHpPlayRound);
    };

    const openHeroPlayModal = () => {
      drafts = C.loadDrafts();
      modalHeroPlay.hidden = false;
      renderHpPresets();
      renderHpMechanics();
      renderHpPhone();
    };

    if (heroQrBtn) heroQrBtn.addEventListener("click", openHeroPlayModal);
    if (heroOpenPlayCta) heroOpenPlayCta.addEventListener("click", openHeroPlayModal);
    if (hpModalClose) hpModalClose.addEventListener("click", () => (modalHeroPlay.hidden = true));
    modalHeroPlay.addEventListener("click", (e) => {
      if (e.target === modalHeroPlay) modalHeroPlay.hidden = true;
    });

    $$("[data-hp-tab]", modalHeroPlay).forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        hpTab = tabBtn.dataset.hpTab;
        $$("[data-hp-tab]", modalHeroPlay).forEach((b) => b.classList.toggle("active", b === tabBtn));
        renderHpPresets();
      });
    });

    if (hpSpinTriggerLeft) {
      hpSpinTriggerLeft.addEventListener("click", triggerHpPlayRound);
    }

    if (hpOpenStudioBtn) {
      hpOpenStudioBtn.addEventListener("click", () => {
        const p = getPresetByKey(hpPresetKey);
        drafts = C.loadDrafts();
        drafts.roue.preset = p.key;
        drafts.roue.gameType = hpMechanic;
        Object.assign(drafts.roue, p.style || {});
        if (!(p.style && p.style.fond) && p.family === "ambiance") {
          drafts.roue.fond = "aucun";
        }
        drafts.lastModule = "roue";
        C.saveDrafts(drafts);
        window.location.href = `studio.html?module=roue&preset=${encodeURIComponent(p.key)}&mech=${encodeURIComponent(hpMechanic)}`;
      });
    }
  }

  /* ── 4C. GESTION DES QR CODES IMMERSIFS & PILULES DE MODES DES PAGES ANNEXES ── */
  const qrModeBtns = $$(".qr-mode-btn");
  if (qrModeBtns.length) {
    qrModeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const parent = btn.closest(".qr-floating-unit");
        if (!parent) return;
        $$(".qr-mode-btn", parent).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const qrImg = parent.querySelector(".qr-bleed-img");
        const qrBadge = parent.querySelector(".qr-center-wheel-badge");
        const qrBubble = parent.querySelector(".qr-call-bubble");
        const qrBlock = parent.querySelector(".qr-cartoon-3d-block");

        if (btn.dataset.qrSrc && qrImg) qrImg.src = btn.dataset.qrSrc;
        if (btn.dataset.qrBadge && qrBadge) qrBadge.textContent = btn.dataset.qrBadge;
        if (btn.dataset.qrBubble && qrBubble) qrBubble.textContent = btn.dataset.qrBubble;
        if (btn.dataset.target && qrBlock) qrBlock.dataset.target = btn.dataset.target;
      });
    });
  }

  const pageHeroQrBtn = $("#page-hero-qr-btn");
  if (pageHeroQrBtn) {
    pageHeroQrBtn.addEventListener("click", () => {
      const parent = pageHeroQrBtn.closest(".qr-floating-unit");
      const activeBtn = parent ? parent.querySelector(".qr-mode-btn.active") : null;
      const targetSel = (activeBtn && activeBtn.dataset.target) || pageHeroQrBtn.dataset.target;
      if (targetSel) {
        const el = $(targetSel);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("highlight-pulse");
          setTimeout(() => el.classList.remove("highlight-pulse"), 1600);
        }
      }
    });
  }

  // Boutons CTA du Héro qui scrollent vers le démonstrateur
  ["#hero-scroll-games-btn", "#hero-scroll-fidelite-btn", "#hero-scroll-vitrine-btn"].forEach((id) => {
    const b = $(id);
    if (b) {
      b.addEventListener("click", () => {
        const target = b.dataset.target || (id.includes("games") ? "#catalogue-15-jeux" : id.includes("fidelite") ? "#simulateur-trio" : "#simulateur-live");
        const el = $(target);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("highlight-pulse");
          setTimeout(() => el.classList.remove("highlight-pulse"), 1600);
        }
      });
    }
  });

  /* ── 5. DÉMONSTRATEUR INTERACTIF DE LA PAGE VITRINE & RÉSERVATION (7 SECTEURS DU CODE SOURCE) ── */
  const vrSectorBtns = $$(".vr-sector-btn");
  const vrTabBtns = $$(".vr-tab-btn");
  const vrLangBtn = $("#vr-lang-btn");
  const vrDemoTitle = $("#vr-demo-title");
  const vrPaletteBadge = $("#vr-demo-palette-badge");
  const vrPhoneShell = $("#vr-phone-shell");
  const vrVitrineList = $("#vr-vitrine-list");
  const vrMomentBox = $("#vr-moment-box");
  const vrSectorTip = $("#vr-sector-tip");
  const vrSlotChoices = $$(".vr-slot-choice");
  const vrConfirmBtn = $("#vr-confirm-rdv-btn");
  const vrRdvFeedback = $("#vr-rdv-feedback");
  const vrOpenStudioBtn = $("#vr-open-studio-with-sector");

  let currentSector = "coiffeur";
  let currentLang = "fr";

  const renderVrSimulator = () => {
    if (!vrVitrineList || !C) return;
    const sec = C.VITRINE_SECTEURS[currentSector] || C.VITRINE_SECTEURS.coiffeur;
    const fiches =
      sec.cartes &&
      sec.cartes[0] &&
      sec.cartes[0].rubriques &&
      sec.cartes[0].rubriques[0] &&
      sec.cartes[0].rubriques[0].fiches
        ? sec.cartes[0].rubriques[0].fiches
        : [];

    if (vrDemoTitle) {
      vrDemoTitle.textContent = `${sec.icon} ${sec.defaultNom}`;
    }
    if (vrPaletteBadge) {
      vrPaletteBadge.textContent = `Palette officielle : Accent ${sec.primary} · Fond ${sec.secondary}`;
    }
    if (vrPhoneShell) {
      vrPhoneShell.style.background = sec.secondary;
      vrPhoneShell.style.color = "#211d16";
    }
    if (vrSectorTip) {
      vrSectorTip.innerHTML = `💡 <b>Secteur ${sec.label} :</b> ${sec.defaultAccroche} — Palette officielle <code>${sec.primary}</code> / <code>${sec.secondary}</code> issue de <code>src/components/vitrine/theme.ts</code>.`;
    }

    vrVitrineList.innerHTML = fiches
      .map(
        (it) => `
      <div class="vr-item-row" style="background:#ffffff;color:#211d16;border-color:#211d16;">
        <div>
          <strong>${currentLang === "fr" ? it.nom : it.nom + " (EN)"}</strong>
          <small style="color:#3d382f;">${it.description} ${
          it.badges && it.badges.length
            ? `· ${it.badges.map((b) => C.VITRINE_BADGES_FR[b] || b).join(" ")}`
            : ""
        }</small>
        </div>
        <b style="background:${sec.primary};color:#fff;">${it.prix}</b>
      </div>
    `
      )
      .join("");

    if (vrMomentBox) {
      vrMomentBox.innerHTML = `
        <span class="mini-pill" style="background:${sec.primary};color:#fff">🎟️ Moment VIP · ${sec.defaultBadge}</span>
        <h4 style="margin:0;font-size:1.1rem;color:#211d16;">Événement &amp; Créneaux Privilèges — ${sec.defaultNom}</h4>
        <p style="margin:0;font-size:0.84rem;font-weight:600;color:#211d16;">Inscrivez-vous directement depuis le QR code de ${sec.defaultNom} (0 % de commission).</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.4rem;flex-wrap:wrap;gap:0.5rem;">
          <strong style="font-size:0.8rem;color:#c91c66;">🔥 Places limitées</strong>
          <button type="button" class="ticket-btn pop-btn-ink" id="vr-book-moment-btn" style="padding:0.5em 1em;font-size:0.78rem;">Réserver ma place →</button>
        </div>
      `;
      const bookBtn = $("#vr-book-moment-btn", vrMomentBox);
      if (bookBtn) {
        bookBtn.addEventListener("click", () => {
          bookBtn.textContent = "✓ Place réservée !";
          bookBtn.style.background = "#5de4b3";
          bookBtn.style.color = "#161317";
        });
      }
    }
  };

  if (vrSectorBtns.length) {
    vrSectorBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        currentSector = btn.dataset.sector;
        vrSectorBtns.forEach((b) => b.classList.toggle("active", b === btn));
        renderVrSimulator();
      });
    });
    renderVrSimulator();
  }

  if (vrOpenStudioBtn && C) {
    vrOpenStudioBtn.addEventListener("click", () => {
      const sec = C.VITRINE_SECTEURS[currentSector] || C.VITRINE_SECTEURS.coiffeur;
      const drafts = C.loadDrafts();
      drafts.vitrine.secteur = sec.key;
      drafts.vitrine.primary = sec.primary;
      drafts.vitrine.secondary = sec.secondary;
      drafts.vitrine.heading = sec.heading;
      drafts.vitrine.nom = sec.defaultNom;
      drafts.vitrine.accroche = sec.defaultAccroche;
      drafts.vitrine.histoire = sec.defaultHistoire;
      drafts.vitrine.badge = sec.defaultBadge;
      drafts.lastModule = "vitrine";
      C.saveDrafts(drafts);
      window.location.href = `studio.html?module=vitrine&sector=${encodeURIComponent(sec.key)}`;
    });
  }

  if (vrLangBtn) {
    vrLangBtn.addEventListener("click", () => {
      currentLang = currentLang === "fr" ? "en" : "fr";
      vrLangBtn.textContent = currentLang === "fr" ? "🇫🇷 FR ⇄ 🇬🇧 EN" : "🇬🇧 EN ⇄ 🇫🇷 FR";
      renderVrSimulator();
    });
  }

  if (vrTabBtns.length) {
    vrTabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        vrTabBtns.forEach((b) => b.classList.toggle("active", b === btn));
        $$(".vr-tab-panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
      });
    });
  }

  if (vrSlotChoices.length) {
    vrSlotChoices.forEach((btn) => {
      btn.addEventListener("click", () => {
        vrSlotChoices.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (vrRdvFeedback) {
          vrRdvFeedback.innerHTML = `📅 Créneau sélectionné : <b>${btn.dataset.slot}</b> (Prêt à ajouter au calendrier du téléphone).`;
        }
      });
    });
  }

  if (vrConfirmBtn) {
    vrConfirmBtn.addEventListener("click", () => {
      const activeSlot = $(".vr-slot-choice.active");
      const slotName = activeSlot ? activeSlot.dataset.slot : "Demain à 14h30";
      if (vrRdvFeedback) {
        vrRdvFeedback.innerHTML = `✅ <b>Rendez-vous confirmé pour ${slotName} !</b> L'invitation a été ajoutée au calendrier du client.`;
        vrRdvFeedback.style.background = "#ffd93d";
      }
    });
  }

  /* ── 6. INTERACTIVITÉ DE LA PAGE JEUX INSTANTANÉS & PRONOSTICS (jeux-pronostics.html) ── */
  const jpFilterBar = $("#jp-filter-bar");
  const jpCards = $$("#jp-15-grid .jp-game-card");
  if (jpFilterBar && jpCards.length) {
    const filterBtns = $$(".jp-filter-btn", jpFilterBar);
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = btn.dataset.filter;
        filterBtns.forEach((b) => b.classList.toggle("active", b === btn));
        jpCards.forEach((card) => {
          const match = f === "all" || card.dataset.cat === f;
          card.hidden = !match;
        });
      });
    });
  }

  // Testeur des 18 thèmes officiels en direct sur jeux-pronostics.html
  const jpPhone = $("#jp-custom-phone");
  const jpPhoneStage = $("#jp-phone-stage");
  // const jpPhoneSub = $("#jp-phone-sub");
  const jpPhoneThemeName = $("#jp-phone-theme-name");
  const jpPrizeText = $("#jp-phone-prize-text");
  const jpPlayBtn = $("#jp-play-test-btn");
  const jpPlayFeedback = $("#jp-play-feedback");
  const jpSimThemeBox = $("#jp-sim-theme");
  const jpOpenStudioRoue = $("#jp-open-studio-roue");

  let currentJpMech = "wheel";
  let currentJpGroup = "ambiances";
  let currentJpPresetKey = "kermesse";

  const getJpPreset = () => {
    if (!C) return null;
    return (
      C.WHEEL_PRESETS.find((p) => p.key === currentJpPresetKey) ||
      C.WHEEL_PRESETS_AMBIANCE[0]
    );
  };

  const renderJpThemeButtons = () => {
    if (!jpSimThemeBox || !C) return;
    const list = currentJpGroup === "ambiances" ? C.WHEEL_PRESETS_AMBIANCE : C.WHEEL_PRESETS_UNIVERS;
    jpSimThemeBox.innerHTML = list
      .map(
        (p) => `
      <button type="button" class="jp-choice-btn ${p.key === currentJpPresetKey ? "active" : ""}" data-jp-preset="${p.key}">
        ${p.label}
      </button>
    `
      )
      .join("");

    $$("[data-jp-preset]", jpSimThemeBox).forEach((btn) => {
      btn.addEventListener("click", () => {
        currentJpPresetKey = btn.dataset.jpPreset;
        renderJpThemeButtons();
        renderJpStage(false);
      });
    });
  };

  let jpSim = null;

  const renderJpStage = () => {
    if (!jpPhoneStage || !jpPhone) return;
    const p = getJpPreset();
    const st = p ? p.style || {} : {};
    if (p) {
      if (jpPhoneThemeName) jpPhoneThemeName.textContent = p.label;
      if (st.fond) {
        jpPhone.style.backgroundImage = `linear-gradient(180deg, rgba(15,15,24,0.28), rgba(15,15,24,0.58)), url('fonds/${st.fond}-640.webp')`;
        jpPhone.style.backgroundColor = "#fdf6e3";
      } else if (st.pageTheme === "kermesse") {
        jpPhone.style.backgroundImage = "none";
        jpPhone.style.backgroundColor = "#fdf6e3";
      } else {
        jpPhone.style.backgroundImage = `radial-gradient(circle at 50% 0%, ${st.bgFrom || "#2e1065"}, ${st.bgTo || "#09090b"} 80%)`;
        jpPhone.style.backgroundColor = st.bgTo || "#09090b";
      }
    }

    if (jpSim) {
      jpSim.destroy();
      jpSim = null;
    }

    const GE = window.LC_GAMES_ENGINE;
    if (GE && typeof GE.createSimulator === "function") {
      const prize = jpPrizeText ? jpPrizeText.textContent : "Café offert ☕";
      jpSim = GE.createSimulator(jpPhoneStage, {
        gameKey: currentJpMech,
        prize: prize,
        onWin: (res) => {
          if (jpPlayFeedback) {
            jpPlayFeedback.hidden = false;
            jpPlayFeedback.innerHTML = `🎉 <b>Gain débloqué : ${res.prize}</b> · Code caisse : <b>${res.code}</b>`;
          }
        },
      });
    }
  };

  if (jpPhone) {
    renderJpThemeButtons();
    renderJpStage();

    $$("[data-jp-group]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentJpGroup = btn.dataset.jpGroup;
        $$("[data-jp-group]").forEach((b) => b.classList.toggle("active", b === btn));
        renderJpThemeButtons();
      });
    });

    $$("#jp-sim-mechanic .jp-choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentJpMech = btn.dataset.mech;
        $$("#jp-sim-mechanic .jp-choice-btn").forEach((b) => b.classList.toggle("active", b === btn));
        if (jpPlayFeedback) jpPlayFeedback.hidden = true;
        renderJpStage();
      });
    });

    $$("#jp-sim-prize .jp-choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (jpPrizeText) jpPrizeText.textContent = btn.dataset.prize;
        $$("#jp-sim-prize .jp-choice-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderJpStage();
      });
    });

    if (jpPlayBtn) {
      jpPlayBtn.addEventListener("click", () => {
        const actionBtn = jpPhoneStage ? jpPhoneStage.querySelector(".lc-action-btn, .lc-cup-item, .lc-card-3d, .lc-chest-item, .lc-reflex-pad, .lc-dice-cube") : null;
        if (actionBtn) {
          actionBtn.click();
        } else if (jpSim) {
          jpSim.triggerWin();
        }
      });
    }

    if (jpOpenStudioRoue && C) {
      jpOpenStudioRoue.addEventListener("click", () => {
        const p = getJpPreset();
        const drafts = C.loadDrafts();
        const mechKey = currentJpMech === "slots" ? "slot" : currentJpMech;
        if (p) {
          drafts.roue.preset = p.key;
          drafts.roue.gameType = mechKey;
          Object.assign(drafts.roue, p.style || {});
          if (!(p.style && p.style.fond) && p.family === "ambiance") {
            drafts.roue.fond = "aucun";
          }
        }
        drafts.lastModule = "roue";
        C.saveDrafts(drafts);
        window.location.href = `studio.html?module=roue&preset=${encodeURIComponent(currentJpPresetKey)}&mech=${encodeURIComponent(mechKey)}`;
      });
    }
  }

  // Catalogue interactif des 15 mini-jeux : ouverture de la modale en direct
  $$(".jp-game-card").forEach((card) => {
    card.addEventListener("click", () => {
      const gameKey = card.dataset.gameKey || "wheel";
      const GE = window.LC_GAMES_ENGINE;
      if (GE && typeof GE.openGameModal === "function") {
        GE.openGameModal(gameKey);
      }
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
  });


  // Simulateur de Pronostics & 11 Thèmes Saisonniers (CONTEST_THEME_ORDER)
  const pronoThemeSwitcher = $("#prono-theme-switcher");
  const pronoLiveWidget = $("#prono-live-widget");
  const pronoOpenStudioBtn = $("#prono-open-studio-btn");
  let currentPronoTheme = "football";

  if (pronoThemeSwitcher && C) {
    const CONTEST_THEMES_LIST = [
      { key: "neutre", label: "🎪 Kermesse (Crème)" },
      ...C.FOND_KEYS.map((fk) => ({ key: fk, label: `🖼️ ${C.FOND_LABELS[fk] || fk}` })),
    ];

    const renderPronoThemes = () => {
      pronoThemeSwitcher.innerHTML = CONTEST_THEMES_LIST.map(
        (t) => `
        <button type="button" class="k-choice-pill ${t.key === currentPronoTheme ? "active" : ""}" data-prono-theme="${t.key}">
          ${t.label}
        </button>
      `
      ).join("");

      $$("[data-prono-theme]", pronoThemeSwitcher).forEach((btn) => {
        btn.addEventListener("click", () => {
          currentPronoTheme = btn.dataset.pronoTheme;
          renderPronoThemes();
          if (pronoLiveWidget) {
            if (currentPronoTheme === "neutre") {
              pronoLiveWidget.style.backgroundImage = "none";
              pronoLiveWidget.style.backgroundColor = "#fdf6e3";
            } else {
              const lavis = C.LAVIS_SAISON[currentPronoTheme] || "#f3ead3";
              pronoLiveWidget.style.backgroundImage = `linear-gradient(180deg, ${lavis}cc, rgba(25,20,34,0.65)), url('fonds/${currentPronoTheme}-640.webp')`;
            }
          }
        });
      });
    };
    renderPronoThemes();
    if (pronoLiveWidget) {
      const lavis = C.LAVIS_SAISON[currentPronoTheme] || "#e4f2d8";
      pronoLiveWidget.style.backgroundImage = `linear-gradient(180deg, ${lavis}cc, rgba(25,20,34,0.65)), url('fonds/${currentPronoTheme}-640.webp')`;
    }

    if (pronoOpenStudioBtn) {
      pronoOpenStudioBtn.addEventListener("click", () => {
        const drafts = C.loadDrafts();
        drafts.pronostics.theme = currentPronoTheme;
        drafts.pronostics.fond = currentPronoTheme === "neutre" ? "aucun" : currentPronoTheme;
        drafts.lastModule = "pronostics";
        C.saveDrafts(drafts);
        window.location.href = "studio.html?module=pronostics";
      });
    }
  }

  const PRONO_CHAMPS = {
    foot: {
      badge: "⚽ GRANDS RENDEZ-VOUS FOOTBALL",
      title: "Ligue des Champions, Ligue 1 ou Coupe du Monde : créez votre ligue privée clients",
      desc: "Chaque semaine de match, vos clients scannent votre QR code pour pronostiquer le score des grandes affiches (ex : Paris SG – Real Madrid ou Marseille – Lyon). Dès le coup de sifflet final, les points sont calculés automatiquement : <b>+10 pts</b> pour le score exact, <b>+5 pts</b> pour le bon vainqueur !",
      why: "Ils reviennent consulter leur rang au classement général après chaque journée de championnat et comparent leur score entre amis ou collègues.",
      rewards: "1er du classement mensuel : Bon d'achat 50 € ou Table VIP · Top 3 : Cadeau exclusif · Chaque participant : Petit lot de consolation.",
      comp: "LIGUE DES CHAMPIONS · SOIRÉE DE GALA",
      t1Icon: "🔵🔴",
      t1Name: "Paris SG",
      t1Score: 2,
      t2Icon: "👑⚪",
      t2Name: "Real Madrid",
      t2Score: 1,
    },
    rugby: {
      badge: "🏉 RUGBY : TOP 14 & TOURNOI DES 6 NATIONS",
      title: "Faites vibrer votre établissement à chaque journée de Top 14 ou du XV de France",
      desc: "Du Crunch France – Angleterre aux phases finales du Top 14 (Stade Toulousain – UBB, La Rochelle – Racing 92), vos clients pronostiquent les vainqueurs et l'écart de points directement sur leur téléphone.",
      why: "Crée une ambiance conviviale incomparable les soirs et week-ends de match, et incite les groupes d'amis à revenir à chaque journée.",
      rewards: "1er du tournoi : Maillot officiel ou Maxi Planche & Tournée offerte · Top 5 : Avantage exclusif lors de la finale.",
      comp: "TOP 14 · GRANDE AFFICHE DU WEEK-END",
      t1Icon: "🔴⚫",
      t1Name: "Stade Toulousain",
      t1Score: 28,
      t2Icon: "🍷⚪",
      t2Name: "Bordeaux-Bègles",
      t2Score: 22,
    },
    tennis: {
      badge: "🎾 ROLAND-GARROS, NBA & JEUX OLYMPIQUES",
      title: "Animez une quinzaine entière autour des grands tournois internationaux",
      desc: "Qui soulèvera la coupe à Roland-Garros ? Qui remportera les finales NBA ou combien de médailles d'or la France décrochera-t-elle aux JO ? Vos clients valident leurs pronostics tour après tour.",
      why: "Fédère un public très large (familles, bureaux, commerces de centre-ville) pendant 2 à 3 semaines consécutives.",
      rewards: "Vainqueur de la quinzaine : Coffret Prestige · Podium : Bon cadeau de 25 €.",
      comp: "ROLAND-GARROS · FINALE INTERNATIONALE",
      t1Icon: "🎾🇪🇸",
      t1Name: "C. Alcaraz",
      t1Score: 3,
      t2Icon: "🎾🇮🇹",
      t2Name: "J. Sinner",
      t2Score: 2,
    },
    culture: {
      badge: "🎤 HORS-SPORT : EUROVISION, TOP CHEF, CÉSARS, E-SPORT…",
      title: "Pas besoin d'aimer le sport : 11 types d'événements culturels, TV & locaux !",
      desc: "Idéal pour les salons de coiffure, instituts, boutiques, pâtisseries ou cafés : lancez vos pronostics sur le gagnant de <b>Top Chef</b>, le podium de <b>l'Eurovision</b>, le Meilleur Film aux <b>César / Oscars</b> ou une finale <b>E-sport (League of Legends)</b> !",
      why: "Tout le monde a un favori dans son émission ou concours préféré : vos clients s'amusent à deviner le vainqueur pendant leur rendez-vous ou passage en caisse.",
      rewards: "Tous ceux qui ont trouvé le grand gagnant reçoivent un privilège VIP sur leur prochaine visite !",
      comp: "CONCOURS TV & CULTURE · GRANDE FINALE",
      t1Icon: "👨‍🍳⭐",
      t1Name: "Candidat Brigade A",
      t1Score: 1,
      t2Icon: "👨‍🍳🔥",
      t2Name: "Candidat Brigade B",
      t2Score: 0,
    },
  };

  const pronoChampTabs = $$("#prono-champ-tabs .prono-champ-tab");
  const pronoScore1 = $("#prono-score-1");
  const pronoScore2 = $("#prono-score-2");
  const pronoSubmitBtn = $("#prono-submit-btn");
  const pronoFeedback = $("#prono-feedback");
  const pronoYouPts = $("#prono-you-pts");
  const pronoLbRows = $("#prono-lb-rows");
  let userPronoPts = 130;

  if (pronoChampTabs.length) {
    pronoChampTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const key = tab.dataset.champ;
        const d = PRONO_CHAMPS[key];
        if (!d) return;
        pronoChampTabs.forEach((t) => t.classList.toggle("active", t === tab));
        $("#prono-sc-badge").textContent = d.badge;
        $("#prono-sc-title").textContent = d.title;
        $("#prono-sc-desc").innerHTML = d.desc;
        $("#prono-sc-why").textContent = d.why;
        $("#prono-sc-rewards").textContent = d.rewards;
        $("#prono-match-competition").textContent = d.comp;
        $("#prono-team1-icon").textContent = d.t1Icon;
        $("#prono-team1-name").textContent = d.t1Name;
        $("#prono-team2-icon").textContent = d.t2Icon;
        $("#prono-team2-name").textContent = d.t2Name;
        if (pronoScore1) pronoScore1.textContent = String(d.t1Score);
        if (pronoScore2) pronoScore2.textContent = String(d.t2Score);
        if (pronoFeedback) pronoFeedback.hidden = true;
      });
    });

    $$(".prono-step-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.team === "1" ? pronoScore1 : pronoScore2;
        if (!target) return;
        const nextVal = Math.max(0, Number(target.textContent) + Number(btn.dataset.dir));
        target.textContent = String(nextVal);
      });
    });

    if (pronoSubmitBtn) {
      pronoSubmitBtn.addEventListener("click", () => {
        userPronoPts += 10;
        if (pronoYouPts) pronoYouPts.textContent = `${userPronoPts} pts`;
        const t1 = $("#prono-team1-name") ? $("#prono-team1-name").textContent : "Équipe 1";
        const t2 = $("#prono-team2-name") ? $("#prono-team2-name").textContent : "Équipe 2";
        const s1 = pronoScore1 ? pronoScore1.textContent : "2";
        const s2 = pronoScore2 ? pronoScore2.textContent : "1";
        if (pronoFeedback) {
          pronoFeedback.hidden = false;
          pronoFeedback.innerHTML = `✅ <b>Pronostic enregistré (${t1} ${s1} - ${s2} ${t2}) !</b> Vous gagnez +10 pts et grimpez au classement.`;
        }
        if (pronoLbRows && userPronoPts >= 140) {
          pronoLbRows.innerHTML = `
            <div class="prono-lb-row is-you">
              <span>🥇 1. Vous (Visiteur Test) 🔥</span>
              <b>${userPronoPts} pts</b>
            </div>
            <div class="prono-lb-row">
              <span>🥈 2. Maxime D.</span>
              <b>145 pts</b>
            </div>
            <div class="prono-lb-row">
              <span>🥉 3. Sarah L.</span>
              <b>138 pts</b>
            </div>
            <div class="prono-lb-row">
              <span>4. Thomas B.</span>
              <b>120 pts</b>
            </div>
          `;
        }
      });
    }
  }

  /* ── 7. INTERACTIVITÉ DE LA PAGE FIDÉLITÉ, PARRAINAGE & JACKPOT + 10 FONDS FOND_KEYS ── */
  const fcBtnVisit = $("#fc-btn-visit");
  const fcBtnRefer = $("#fc-btn-refer");
  const fcBtnReset = $("#fc-btn-reset");
  const fcLiveLog = $("#fc-live-log");
  const fcFondSwitcher = $("#fc-fond-switcher");
  const fcTrioPhone = $("#fc-trio-phone");
  const fcOpenStudioBtn = $("#fc-open-studio-btn");
  let currentFcFond = "restaurant";

  if (fcFondSwitcher && C) {
    const renderFcFonds = () => {
      fcFondSwitcher.innerHTML = C.FOND_KEYS.map(
        (fk) => `
        <button type="button" class="k-choice-pill ${fk === currentFcFond ? "active" : ""}" data-fc-fond="${fk}">
          🖼️ ${C.FOND_LABELS[fk] || fk}
        </button>
      `
      ).join("");

      $$("[data-fc-fond]", fcFondSwitcher).forEach((btn) => {
        btn.addEventListener("click", () => {
          currentFcFond = btn.dataset.fcFond;
          renderFcFonds();
          if (fcTrioPhone) {
            const lavis = C.LAVIS_SAISON[currentFcFond] || "#f5e1d0";
            fcTrioPhone.style.backgroundImage = `linear-gradient(180deg, ${lavis}cc, rgba(25,20,34,0.6)), url('fonds/${currentFcFond}-640.webp')`;
          }
        });
      });
    };
    renderFcFonds();
    if (fcTrioPhone) {
      const lavis = C.LAVIS_SAISON[currentFcFond] || "#f5e1d0";
      fcTrioPhone.style.backgroundImage = `linear-gradient(180deg, ${lavis}cc, rgba(25,20,34,0.6)), url('fonds/${currentFcFond}-640.webp')`;
    }

    if (fcOpenStudioBtn) {
      fcOpenStudioBtn.addEventListener("click", () => {
        const drafts = C.loadDrafts();
        drafts.fidelite.fond = currentFcFond;
        drafts.lastModule = "fidelite";
        C.saveDrafts(drafts);
        window.location.href = "studio.html?module=fidelite";
      });
    }
  }

  if (fcBtnVisit && fcBtnRefer) {
    let fcStamps = 3;
    let fcRefs = 1;
    let fcJackpot = 88;

    const updateFcTrioUI = (logHtml) => {
      const stampsCountEl = $("#fc-stamps-count");
      const stampsTrackEl = $("#fc-stamps-track");
      const loyaltyMsgEl = $("#fc-loyalty-msg");
      const refCountEl = $("#fc-ref-count");
      const tier2El = $("#fc-tier-2");
      const tier3El = $("#fc-tier-3");
      const jackpotPctEl = $("#fc-jackpot-pct");
      const jackpotBarEl = $("#fc-jackpot-bar");
      const jackpotMsgEl = $("#fc-jackpot-msg");
      const memberStatusEl = $("#fc-member-status");

      if (stampsCountEl) stampsCountEl.textContent = `${fcStamps * 100} / 500 pts`;
      if (stampsTrackEl) {
        stampsTrackEl.innerHTML = [1, 2, 3, 4, 5]
          .map((num) => {
            if (num <= fcStamps) {
              return `<span class="fc-stamp is-filled">${num === 5 ? "🎁" : "★"}</span>`;
            }
            return `<span class="fc-stamp ${num === 5 ? "is-gift" : ""}">${num === 5 ? "🎁" : num}</span>`;
          })
          .join("");
      }
      if (loyaltyMsgEl) {
        loyaltyMsgEl.innerHTML =
          fcStamps >= 5
            ? `🎉 <b>500 points atteints (5 visites) !</b> Récompense débloquée sur Google Wallet / Écran d'accueil !`
            : `Plus que ${(5 - fcStamps) * 100} pts (${5 - fcStamps} visite(s)) avant votre récompense !`;
      }

      if (refCountEl) refCountEl.textContent = `${fcRefs} / 3 amis (Palier Or)`;
      if (tier2El) tier2El.classList.toggle("is-reached", fcRefs >= 2);
      if (tier2El) tier2El.textContent = fcRefs >= 2 ? "✓ 2 amis (Cadeau)" : "2 amis (Cadeau)";
      if (tier3El) tier3El.classList.toggle("is-reached", fcRefs >= 3);
      if (tier3El) tier3El.textContent = fcRefs >= 3 ? "✓ 3 amis (VIP Or)" : "3 amis (VIP Or)";

      if (memberStatusEl) {
        memberStatusEl.textContent = `Solde : ${fcStamps * 100} pts (${fcStamps} visites) · ${
          fcRefs >= 3 || fcStamps >= 5 ? "Ambassadeur Or 🏆" : "Membre Habitué"
        }`;
      }

      if (jackpotPctEl) jackpotPctEl.textContent = `${fcJackpot} %`;
      if (jackpotBarEl) jackpotBarEl.style.width = `${fcJackpot}%`;
      if (jackpotMsgEl) {
        jackpotMsgEl.innerHTML =
          fcJackpot >= 100
            ? `🎆 <b>100 % ATTEINT !</b> Le grand tirage du Jackpot Collectif est déclenché pour toute la communauté !`
            : `Chaque visite et parrainage rapproche toute la communauté du tirage à 100 % !`;
      }

      if (fcLiveLog && logHtml) {
        fcLiveLog.innerHTML = logHtml;
      }
    };

    fcBtnVisit.addEventListener("click", () => {
      fcStamps = Math.min(5, fcStamps + 1);
      fcJackpot = Math.min(100, fcJackpot + 4);
      updateFcTrioUI(
        `🛂 <b>Passage client validé (+100 pts) :</b> Solde porté à <b>${fcStamps * 100} pts</b> sur Google Wallet / Écran d'accueil <b>ET +4 % ajoutés au Jackpot Collectif (${fcJackpot} %)</b> !`
      );
    });

    fcBtnRefer.addEventListener("click", () => {
      fcRefs = Math.min(3, fcRefs + 1);
      fcJackpot = Math.min(100, fcJackpot + 6);
      updateFcTrioUI(
        `🤝 <b>Nouvel ami parrainé validé :</b> Le parrain passe à ${fcRefs} ami(s) invité(s) <b>ET fait bondir le Jackpot Collectif de +6 % (${fcJackpot} %)</b> !`
      );
    });

    if (fcBtnReset) {
      fcBtnReset.addEventListener("click", () => {
        fcStamps = 3;
        fcRefs = 1;
        fcJackpot = 88;
        updateFcTrioUI(
          `↺ <b>Démonstration réinitialisée :</b> Cliquez sur l'un des boutons ci-dessus pour observer la réaction en chaîne des 3 briques.`
        );
      });
    }
  }

  /* ── 8. BARRE FLOTTANTE DE REPRISE DE BROUILLON EN CACHE (LOCALSTORAGE) ── */
  const floatingDraftBar = $("#lc-floating-draft-bar");
  if (floatingDraftBar && C && C.hasCustomDraft()) {
    const acc = C.loadAuth();
    const d = C.loadDrafts();
    const statusText =
      acc.status === "subscribed"
        ? `Abonnement actif (${acc.orgName || "Pro"}) · QR prêt`
        : acc.status === "free_account"
        ? `Compte gratuit (${acc.orgName || acc.email}) · Brouillon sauvegardé`
        : `Brouillon en cache mémoire`;
    floatingDraftBar.hidden = false;
    floatingDraftBar.innerHTML = `
      <div>
        <strong style="display:block;font:800 0.8rem var(--display);">💾 ${statusText}</strong>
        <small style="font-size:0.74rem;font-weight:700;">Reprenez votre configuration là où vous l'avez laissée.</small>
      </div>
      <a class="k-btn k-btn-yellow k-btn-sm" href="studio.html?module=${d.lastModule || "vitrine"}">
        Reprendre dans le Studio →
      </a>
    `;
  }

  /* ── 9. REVEAL FLUIDE AU SCROLL ── */
  const revealElements = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08 });
    revealElements.forEach((node) => io.observe(node));
  }
  setTimeout(() => {
    revealElements.forEach((node) => node.classList.add("is-in"));
  }, 220);
})();
