/* eslint-disable @next/next/no-location-assign-relative-destination */
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

  /* ── 0. CENTRAGE HORIZONTAL DU LIEN ACTIF DANS LA BARRE MOBILE ── */
  const headerNavLinks = $(".header-nav nav");
  if (headerNavLinks) {
    const activeNav = $(".nav-active", headerNavLinks);
    if (activeNav && headerNavLinks.scrollWidth > headerNavLinks.clientWidth) {
      const leftOffset = activeNav.offsetLeft - (headerNavLinks.clientWidth - activeNav.offsetWidth) / 2;
      headerNavLinks.scrollLeft = Math.max(0, leftOffset);
    }
  }

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

  /* ── 2. MOTION DESIGN DU PARCOURS (« 1. ILS SCANNENT · 2. ILS JOUENT · 3. ILS GAGNENT ») ── */
  const motionStage = $("#motion-stage");
  const storyTrigger = $("#demo-story-trigger");

  const MOTION_PRIZES = [
    "-20% SUR VOTRE ADDITION",
    "UN DESSERT MAISON OFFERT",
    "UNE BOISSON OU CAFÉ OFFERT",
    "BON D'ACHAT DE 10 € COMPTOIR",
  ];

  if (motionStage) {
    const mProgressBar = $("#motion-progress-bar");
    const mPlayPauseBtn = $("#motion-play-pause");
    const mRewardTitle = $("#m-reward-title");
    const mTicketCode = $("#m-ticket-code");
    const mSlotStatus = $("#m-slot-status");
    const mSlotCabinet = $(".m-slot-cabinet", motionStage);
    const scenes = $$(".motion-scene", motionStage);
    const stepBtns = $$(".m-step-btn", motionStage);
    let currentStep = 1;
    let isPlaying = true;
    let timerId = null;

    const setMotionStep = (stepNum) => {
      currentStep = stepNum;
      scenes.forEach((s) => s.classList.toggle("is-active", Number(s.dataset.step) === stepNum));
      stepBtns.forEach((b) => b.classList.toggle("active", Number(b.dataset.step) === stepNum));

      if (mProgressBar) {
        mProgressBar.style.width = `${(stepNum / 3) * 100}%`;
      }

      if (stepNum === 2) {
        if (mSlotCabinet) mSlotCabinet.classList.remove("is-won");
        if (mSlotStatus) mSlotStatus.innerHTML = `<span class="m-status-star">⭐</span><strong>LES ROULEAUX TOURNENT !</strong>`;
        setTimeout(() => {
          if (currentStep === 2) {
            if (mSlotCabinet) mSlotCabinet.classList.add("is-won");
            if (mSlotStatus) mSlotStatus.innerHTML = `<span class="m-status-star">💎</span><strong>3 DIAMANTS ALIGNÉS !</strong>`;
          }
        }, 1600);
      }

      if (stepNum === 3) {
        if (mRewardTitle) {
          mRewardTitle.textContent = MOTION_PRIZES[Math.floor(Math.random() * MOTION_PRIZES.length)];
        }
        if (mTicketCode) {
          mTicketCode.textContent = "LC-" + Math.random().toString(36).substring(2, 6).toUpperCase();
        }
      }
    };

    const nextMotionStep = () => {
      const next = currentStep >= 3 ? 1 : currentStep + 1;
      setMotionStep(next);
    };

    const startMotionLoop = () => {
      stopMotionLoop();
      timerId = setInterval(() => {
        if (isPlaying) {
          nextMotionStep();
        }
      }, 3400);
    };

    const stopMotionLoop = () => {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    stepBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const step = Number(b.dataset.step);
        setMotionStep(step);
        startMotionLoop();
      });
    });

    if (mPlayPauseBtn) {
      mPlayPauseBtn.addEventListener("click", () => {
        isPlaying = !isPlaying;
        mPlayPauseBtn.textContent = isPlaying ? "⏸️ Pause" : "▶ Lecture";
      });
    }

    if (storyTrigger) {
      storyTrigger.addEventListener("click", () => {
        setMotionStep(1);
        isPlaying = true;
        if (mPlayPauseBtn) mPlayPauseBtn.textContent = "⏸️ Pause";
        startMotionLoop();
      });
    }

    // Démarrage initial
    setMotionStep(1);
    startMotionLoop();
  }

  /* ── 3. LE MANÈGE INTERACTIF DES 10 MÉCANIQUES DE JEU (Sans doublons Vitrine/RDV) ── */
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
      emoji: "🎟️",
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
      let activeBtn = null;
      $$(".jb-token-pill", jbTokensBox).forEach((btn, i) => {
        const isCurrent = i === activeGameIdx;
        btn.classList.toggle("is-active", isCurrent);
        btn.setAttribute("aria-selected", String(isCurrent));
        if (isCurrent) activeBtn = btn;
      });
      if (activeBtn && jbTokensBox.scrollWidth > jbTokensBox.clientWidth) {
        const left = activeBtn.offsetLeft - (jbTokensBox.clientWidth - activeBtn.offsetWidth) / 2;
        try {
          jbTokensBox.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
        } catch {
          jbTokensBox.scrollLeft = Math.max(0, left);
        }
      }
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

  const getPlanJaugeDetails = (f) => {
    switch (f.id) {
      case "core":
        return {
          badge: "🎯 15 mini-jeux & scans QR illimités · Libre-service en caisse",
          full: "🎯 15 mini-jeux instantanés · Scans QR, clients et remises de lots 100% illimités au comptoir",
        };
      case "engagement":
        return {
          badge: "💎 Fidélité, Parrainage & Calendrier surprise · Clients illimités",
          full: "💎 Passeport fidélité, parrainage ambassadeurs & calendrier surprise · Membres et scans 100% illimités",
        };
      case "place":
        return {
          badge: "📅 Agenda, Prise de RDV & Vitrine QR · Sans commission",
          full: "📅 Prise de rendez-vous en ligne, moments & vitrine QR code · Sans commission, scans illimités",
        };
      case "live":
        return {
          badge: "📺 Écran géant live : 250 participants simultanés · Mode soirée",
          full: "📺 Grand écran live : jusqu'à 250 participants connectés en direct pour vos soirées, quiz & pronostics",
        };
      case "full":
        return {
          badge: "🚀 Toute la plateforme réunie · Grand écran live 250 pers. inclus",
          full: "🚀 Toute la plateforme en illimité : fidélité, réservations, écran géant 250 pers., pronostics & scans",
        };
      default:
        return {
          badge: "✨ Scans QR & animations illimités",
          full: "✨ Scans et animations 100% illimités au quotidien",
        };
    }
  };

  const updateConfigurator = () => {
    if (!O) return;
    const plan = O.FORMULES[selectedPlanIdx];
    let sumMonthly = plan.prix;
    let sumOneOff = 0;
    const allRights = new Set(plan.droits);

    // Parcourt tous les add-ons
    const allAddonsList = [
      ...O.OPTIONS.ligneAbonnement,
      ...(O.OPTIONS.mensuelles.filter((m) => m.id === "loyalty" || m.id === "referral")),
      ...O.OPTIONS.ponctuelles,
    ];

    allAddonsList.forEach((a) => {
      const cb = $(`input[data-addon="${a.id}"]`, cfgAddonsBox);
      const badge = $(`span[data-badge="${a.id}"]`, cfgAddonsBox);
      const isAlreadyInPlan = plan.droits.includes(a.id);

      if (cb) {
        cb.disabled = isAlreadyInPlan;
        if (isAlreadyInPlan) {
          cb.checked = true;
          if (badge) {
            badge.textContent = "✓ Inclus dans l'offre";
            badge.className = "cfg-addon-status-pill in-plan";
          }
        } else {
          cb.checked = selectedAddons.has(a.id);
          if (badge) {
            badge.textContent = a.duree ? `Pass ${a.duree}` : "Option mensuelle";
            badge.className = "cfg-addon-status-pill optional";
          }
          if (cb.checked) {
            if (a.duree) {
              sumOneOff += a.prix;
            } else {
              sumMonthly += a.prix;
            }
            allRights.add(a.id);
          }
        }
      }
    });

    const totalText = sumOneOff > 0 ? `${sumMonthly} €/mois + ${sumOneOff} € (pass)` : `${sumMonthly} € / mois`;
    if (cfgTotal) cfgTotal.textContent = totalText;
    if (cfgSummaryTotal) cfgSummaryTotal.textContent = totalText;
    if (cfgPlanName) cfgPlanName.textContent = `Formule ${plan.nom} (${plan.prix} €)`;
    if (cfgPlanTagline) cfgPlanTagline.textContent = plan.tagline;
    if (cfgJauge) {
      const jDetails = getPlanJaugeDetails(plan);
      cfgJauge.innerHTML = `<strong>${jDetails.full}</strong> · <em>7 jours d'essai gratuit</em>`;
    }
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
    const allAddonsList = [
      ...O.OPTIONS.ligneAbonnement,
      ...(O.OPTIONS.mensuelles.filter((m) => m.id === "loyalty" || m.id === "referral")),
      ...O.OPTIONS.ponctuelles,
    ];
    allAddonsList.forEach((a) => {
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
    const switcher = el("div", {
      class: "plans-mobile-switcher",
      role: "tablist",
      "aria-label": "Accès rapide aux 5 formules",
    });
    if (deck.parentNode) {
      deck.parentNode.insertBefore(switcher, deck);
    }

    const planCards = [];
    const switcherBtns = [];

    const setActivePlanPill = (activeIdx) => {
      switcherBtns.forEach((b, idx) => {
        const isCurrent = idx === activeIdx;
        b.classList.toggle("is-active", isCurrent);
        b.setAttribute("aria-selected", String(isCurrent));
      });
      const activePill = switcherBtns[activeIdx];
      if (activePill && switcher.scrollWidth > switcher.clientWidth) {
        const left = activePill.offsetLeft - (switcher.clientWidth - activePill.offsetWidth) / 2;
        switcher.scrollLeft = Math.max(0, left);
      }
    };

    const ROLE_META = {
      core: { pill: "🎯 L'essentiel comptoir", base: "", cap: "♾️ Scans QR illimités · Libre-service" },
      engagement: { pill: "⭐ Le plus choisi · Fidélité", base: "✓ Socle Coup d'envoi (15 jeux) inclus +", cap: "♾️ Scans &amp; membres 100% illimités" },
      place: { pill: "📅 Vitrine &amp; Réservations", base: "✓ Socle Coup d'envoi (15 jeux) inclus +", cap: "♾️ 0 % commission sur vos réservations" },
      live: { pill: "📺 Soirées &amp; Salle live", base: "✓ Socle Coup d'envoi (15 jeux) inclus +", cap: "📺 Écran géant live 250 joueurs inclus" },
      full: { pill: "👑 L'intégrale (-19 €)", base: "✓ Le Club + Sur Place + Le Grand Jeu", cap: "🚀 Toute la plateforme · Salle 250 pers." },
    };
    O.FORMULES.forEach((f, i) => {
      const pill = el("button", {
        type: "button",
        role: "tab",
        class: "plans-mobile-pill" + (i === 0 ? " is-active" : ""),
        "aria-selected": String(i === 0),
        "data-plan-idx": String(i),
      }, `${f.nom} · ${f.prix} €`);
      pill.addEventListener("click", () => {
        const targetCard = planCards[i];
        setActivePlanPill(i);
        if (targetCard) {
          const left = targetCard.offsetLeft - (deck.clientWidth - targetCard.offsetWidth) / 2;
          try {
            deck.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
          } catch {
            deck.scrollLeft = Math.max(0, left);
          }
        }
      });
      switcher.appendChild(pill);
      switcherBtns.push(pill);

      const meta = ROLE_META[f.id] || ROLE_META.core;
      const visiblePoints = meta.base
        ? f.points.filter((p) => !p.startsWith("Tout Coup d'envoi") && !p.startsWith("Le Club + Sur Place"))
        : f.points;
      const card = el("article", {
        class: `plan-ticket${f.id === "engagement" ? " is-popular-plan" : ""}`,
        style: `background:${PASS_COLORS[i]}`,
      }, `
        <span class="plan-role-pill${f.id === "full" ? " is-top-deal" : ""}">${meta.pill}</span>
        <div>
          <span class="plan-purpose">${f.promesse}</span>
          <h3>${f.nom}</h3>
        </div>
        <div class="plan-amount">
          <span class="plan-price-main">${f.prix}&nbsp;€</span>
          <small>/mois · sans engagement</small>
        </div>
        <p class="plan-summary-text">${f.tagline.split(":").slice(1).join(":").trim()}</p>
        <div class="plan-composition-box">
          <span class="plan-comp-kicker">Composition de la formule</span>
          ${meta.base ? `<div class="plan-included-banner">${meta.base}</div>` : ""}
          <ul>${visiblePoints.map((p) => `<li><span class="plan-chk-badge" aria-hidden="true">✓</span><span>${p}</span></li>`).join("")}</ul>
        </div>
        <div style="margin-top:auto;display:grid;gap:0.55rem">
          <div class="plan-capacity-pill">${meta.cap}</div>
          <button type="button" class="ticket-btn pop-btn-ink choose-plan-signup-btn" style="text-align:center;width:100%;cursor:pointer;">
            Choisir ${f.nom} (7j offerts) →
          </button>
          <a class="plan-custom-link" style="text-align:center;font-size:0.78rem;font-weight:700;color:var(--ink);text-decoration:underline;cursor:pointer;" href="#configurateur">
            Personnaliser avec des options ↓
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
        customLink.addEventListener("click", (e) => {
          e.preventDefault();
          selectedPlanIdx = i;
          updateConfigurator();
          const target = document.getElementById("configurateur");
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }
      deck.appendChild(card);
      planCards.push(card);
    });

    let planScrollRaf = null;
    deck.addEventListener("scroll", () => {
      if (planScrollRaf) return;
      planScrollRaf = requestAnimationFrame(() => {
        planScrollRaf = null;
        if (!planCards.length) return;
        const center = deck.scrollLeft + deck.clientWidth / 2;
        let closestIdx = 0;
        let closestDist = Infinity;
        planCards.forEach((c, idx) => {
          const cCenter = c.offsetLeft + c.offsetWidth / 2;
          const dist = Math.abs(cCenter - center);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = idx;
          }
        });
        setActivePlanPill(closestIdx);
      });
    }, { passive: true });
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

    // 1. Groupe des options mensuelles sans engagement
    const monthlyHeader = el("div", { class: "cfg-addon-group-title" }, "📅 Options mensuelles sans engagement :");
    cfgAddonsBox.appendChild(monthlyHeader);

    const monthlyList = [
      ...O.OPTIONS.ligneAbonnement,
      ...(O.OPTIONS.mensuelles.filter((m) => m.id === "loyalty" || m.id === "referral")),
    ];

    monthlyList.forEach((a) => {
      const lbl = el("label", { class: "cfg-addon-label" }, `
        <div class="cfg-addon-row">
          <input type="checkbox" data-addon="${a.id}" />
          <div class="cfg-addon-texts">
            <strong>${a.nom} <span class="cfg-addon-price">+${a.prix} €/mois</span></strong>
            <small>${a.desc || a.regle}</small>
          </div>
          <span class="cfg-addon-status-pill" data-badge="${a.id}">Option</span>
        </div>
      `);
      const input = $("input", lbl);
      input.addEventListener("change", () => {
        if (input.checked) selectedAddons.add(a.id);
        else selectedAddons.delete(a.id);
        updateConfigurator();
      });
      cfgAddonsBox.appendChild(lbl);
    });

    // 2. Groupe des pass événementiels & campagnes ponctuelles
    const oneOffHeader = el("div", { class: "cfg-addon-group-title", style: "margin-top:0.75rem;" }, "⚡ Pass événements & campagnes à l'unité (sans abonnement) :");
    cfgAddonsBox.appendChild(oneOffHeader);

    O.OPTIONS.ponctuelles.forEach((a) => {
      const lbl = el("label", { class: "cfg-addon-label" }, `
        <div class="cfg-addon-row">
          <input type="checkbox" data-addon="${a.id}" />
          <div class="cfg-addon-texts">
            <strong>${a.nom} <span class="cfg-addon-price">+${a.prix} € unique</span></strong>
            <small>${a.desc || a.duree} · ${a.regle}</small>
          </div>
          <span class="cfg-addon-status-pill optional" data-badge="${a.id}">Pass</span>
        </div>
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
  const heroTrialCta = $("#hero-trial-cta");
  if (heroTrialCta) {
    heroTrialCta.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.getElementById("formules") || document.getElementById("configurateur");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

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
    let hpLastWin = null;
    let hpSim = null;

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
      if (hpSim) {
        const actionBtn = hpPhoneScreen ? hpPhoneScreen.querySelector(".lc-action-btn, .lc-cup-item, .lc-card-3d, .lc-chest-item, .lc-reflex-pad, .lc-dice-cube, .lc-rps-btn, .lc-memory-card") : null;
        if (actionBtn) {
          actionBtn.click();
        } else if (typeof hpSim.triggerWin === "function") {
          hpSim.triggerWin();
        }
      }
    };

    const renderHpPhone = () => {
      if (!hpPhoneScreen) return;
      const p = getPresetByKey(hpPresetKey);
      const st = p ? (p.style || {}) : {};
      const mech = (C.INSTANT_MECHANICS && C.INSTANT_MECHANICS.find((m) => m.key === hpMechanic)) || {
        key: "wheel",
        label: "Roue de la fortune",
        emoji: "🎡",
        family: "hasard"
      };
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

      const themeBadgeColor = (p && p.swatch && p.swatch[0]) || "#fcca59";

      hpPhoneScreen.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.92);color:#211d16;padding:0.4rem 0.65rem;border-radius:12px;border:2px solid #211d16;font-size:0.72rem;font-weight:800;margin-bottom:0.35rem;">
          <span>Thème : ${p ? p.label : "Kermesse"}</span>
          <span style="background:${themeBadgeColor};color:#211d16;padding:0.1rem 0.45rem;border-radius:999px;border:1.5px solid #211d16;font-size:0.68rem;">/play direct</span>
        </div>

        <div style="text-align:center;background:rgba(255,255,255,0.92);color:#211d16;padding:0.45rem 0.65rem;border-radius:14px;border:2px solid #211d16;margin-bottom:0.45rem;">
          <small style="font:800 0.64rem var(--body);text-transform:uppercase;color:#267f53;">${mech.family === "adresse" ? "🎯 Défi d'adresse + Tirage" : "🎲 Jeu de hasard instantané"}</small>
          <strong style="display:block;font:900 0.98rem var(--display);line-height:1.2;">${drafts.vitrine.nom || "Votre Établissement"}</strong>
          <span style="font-size:0.74rem;font-weight:700;">${drafts.roue.name || "Tentez votre chance !"}</span>
        </div>

        <div id="hp-live-stage" style="width:100%;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:260px;"></div>

        <div id="hp-win-banner" style="${hpLastWin ? "" : "display:none;"}background:#e6f9ef;color:#211d16;border:2px solid #211d16;border-radius:12px;padding:0.45rem 0.65rem;text-align:center;font-size:0.75rem;font-weight:800;box-shadow:2px 2px 0 #211d16;margin-top:0.4rem;">
          ${hpLastWin ? `🎉 Gain : <b>${hpLastWin.label}</b> · Code caisse : <code style="background:#fcca59;padding:0.1rem 0.35rem;border-radius:5px;border:1px solid #211d16;">${hpLastWin.code}</code>` : ""}
        </div>
      `;

      if (hpSim) {
        hpSim.destroy();
        hpSim = null;
      }

      const stageEl = $("#hp-live-stage", hpPhoneScreen);
      const winBanner = $("#hp-win-banner", hpPhoneScreen);
      const GE = window.LC_GAMES_ENGINE;

      if (stageEl && GE && typeof GE.createSimulator === "function") {
        const prizeLabel = (drafts.roue.lots && drafts.roue.lots[0] && drafts.roue.lots[0].label) || "-15 % sur votre visite 🎁";
        const lots = (drafts.roue.lots && drafts.roue.lots.length >= 4)
          ? drafts.roue.lots
          : [
              { label: "-15 % sur votre visite", color: "#fcca59" },
              { label: "Café gourmand offert", color: "#ff8fa3" },
              { label: "1 Boisson au choix", color: "#6ec1e4" },
              { label: "Dessert maison", color: "#80ed99" },
              { label: "Cadeau Découverte VIP", color: "#ffd166" },
              { label: "Ticket Or VIP", color: "#c77dff" },
            ];

        hpSim = GE.createSimulator(stageEl, {
          gameKey: hpMechanic,
          prize: prizeLabel,
          lots: lots,
          ringColor: st.ringColor || "#211d16",
          pointerColor: st.pointerColor || "#f5793b",
          buttonStyle: {
            background: `linear-gradient(135deg, ${st.buttonFrom || "#f5793b"}, ${st.buttonTo || "#fcca59"})`,
            color: "#ffffff"
          },
          onWin: (res) => {
            hpLastWin = { label: res.prize, code: res.code };
            if (winBanner) {
              winBanner.style.display = "block";
              winBanner.innerHTML = `🎉 Gain : <b>${res.prize}</b> · Code caisse : <code style="background:#fcca59;padding:0.1rem 0.35rem;border-radius:5px;border:1px solid #211d16;">${res.code}</code>`;
              try { winBanner.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch {}
            }
          }
        });
      }
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

  /* ── 4C. MENU DÉROULANT HEADER "🧩 MODULES" + QR CODES HÉRO & ÉMULATEUR CLIENT ── */
  const navDropdownWrap = $(".nav-dropdown-wrap");
  if (navDropdownWrap) {
    const dropBtn = $(".nav-dropdown-btn", navDropdownWrap);
    const dropPanel = $(".nav-dropdown-panel", navDropdownWrap);
    if (dropBtn && dropPanel) {
      let portaledOnMobile = false;

      const positionMobilePanel = () => {
        const header = dropBtn.closest(".header-nav");
        const rect = header ? header.getBoundingClientRect() : dropBtn.getBoundingClientRect();
        dropPanel.style.top = `${Math.round(rect.bottom + 8)}px`;
      };

      const closeModulesMenu = () => {
        dropBtn.setAttribute("aria-expanded", "false");
        navDropdownWrap.classList.remove("is-open");
        dropPanel.classList.remove("is-open", "is-mobile-sheet");
        dropPanel.hidden = true;
        if (portaledOnMobile && dropPanel.parentElement !== navDropdownWrap) {
          dropPanel.style.top = "";
          navDropdownWrap.appendChild(dropPanel);
          portaledOnMobile = false;
        }
      };

      const openModulesMenu = () => {
        const isMobile = window.innerWidth <= 960;
        if (isMobile) {
          dropPanel.classList.add("is-mobile-sheet");
          if (dropPanel.parentElement !== document.body) {
            document.body.appendChild(dropPanel);
            portaledOnMobile = true;
          }
          positionMobilePanel();
        } else {
          dropPanel.classList.remove("is-mobile-sheet");
        }
        dropPanel.hidden = false;
        navDropdownWrap.classList.add("is-open");
        dropPanel.classList.add("is-open");
        dropBtn.setAttribute("aria-expanded", "true");
      };

      dropBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dropPanel.hidden) openModulesMenu();
        else closeModulesMenu();
      });

      document.addEventListener("click", (e) => {
        if (!dropPanel.hidden && !navDropdownWrap.contains(e.target) && !dropPanel.contains(e.target)) {
          closeModulesMenu();
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !dropPanel.hidden) {
          closeModulesMenu();
          dropBtn.focus();
        }
      });

      window.addEventListener("resize", () => {
        if (!dropPanel.hidden) {
          if (window.innerWidth <= 960) {
            positionMobilePanel();
          } else if (portaledOnMobile) {
            closeModulesMenu();
          }
        }
      });
    }
  }

  const qrModeBtns = $$(".qr-mode-btn");
  if (qrModeBtns.length) {
    qrModeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const parent = btn.closest(".qr-floating-unit, .annex-device-card");
        if (!parent) return;
        $$(".qr-mode-btn", parent).forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const qrImg = parent.querySelector(".qr-bleed-img");
        const qrBadge = parent.querySelector(".qr-center-wheel-badge");
        const qrBubble = parent.querySelector(".qr-call-bubble, #qr-bubble-text, .device-callout");
        const qrBlock = parent.querySelector(".qr-cartoon-3d-block, #page-hero-qr-btn");

        if (btn.dataset.qrSrc && qrImg) qrImg.src = btn.dataset.qrSrc;
        if (btn.dataset.qrBadge && qrBadge) qrBadge.textContent = btn.dataset.qrBadge;
        if (btn.dataset.qrBubble && qrBubble) qrBubble.textContent = btn.dataset.qrBubble;
        if (qrBlock) {
          if (btn.dataset.target) qrBlock.dataset.target = btn.dataset.target;
          if (btn.dataset.emulate) qrBlock.dataset.emulate = btn.dataset.emulate;
        }
      });
    });
  }

  const getHeroActiveEmulateMode = () => {
    const pageHeroQrBtnEl = $("#page-hero-qr-btn");
    const parent = pageHeroQrBtnEl ? pageHeroQrBtnEl.closest(".qr-floating-unit, .annex-device-card") : null;
    const activeBtn = parent ? parent.querySelector(".qr-mode-btn.active") : null;
    if (activeBtn && activeBtn.dataset.emulate) return activeBtn.dataset.emulate;
    if (pageHeroQrBtnEl && pageHeroQrBtnEl.dataset.emulate) return pageHeroQrBtnEl.dataset.emulate;
    const path = (window.location.pathname || "").toLowerCase();
    if (path.includes("fidelite")) return "passeport";
    if (path.includes("vitrine")) return "vitrine";
    return "jeux";
  };

  const pageHeroQrBtn = $("#page-hero-qr-btn");
  const pageHeroEmulateCta = $("#page-hero-emulate-cta");
  [pageHeroQrBtn, pageHeroEmulateCta].forEach((triggerEl) => {
    if (!triggerEl) return;
    triggerEl.addEventListener("click", () => {
      const mode = getHeroActiveEmulateMode();
      if (typeof window.LC_OPEN_EMULATOR === "function") {
        window.LC_OPEN_EMULATOR(mode);
      }
    });
  });

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
      vrSectorTip.innerHTML = `💡 <b>Secteur ${sec.label} :</b> ${sec.defaultAccroche} — Palette harmonieuse ${sec.primary} / ${sec.secondary}.`;
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
        const actionBtn = jpPhoneStage ? jpPhoneStage.querySelector(".lc-action-btn, .lc-cup-item, .lc-card-3d, .lc-chest-item, .lc-reflex-pad, .lc-dice-cube, .lc-rps-btn, .lc-memory-card") : null;
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


  /* ── 6B. INTERACTIVITÉ DU CALENDRIER SURPRISE (jeux-pronostics.html) ── */
  const csTodayBtn = $("#cs-today-btn");
  if (csTodayBtn) {
    let csOpened = false;
    csTodayBtn.addEventListener("click", () => {
      if (csOpened) return;
      csOpened = true;
      csTodayBtn.classList.remove("is-today");
      csTodayBtn.classList.add("is-opened");
      csTodayBtn.disabled = true;

      const inner = $("#cs-today-inner", csTodayBtn);
      const actionPill = csTodayBtn.querySelector(".cs-day-action-pill");
      if (inner) {
        inner.innerHTML = `
          <span class="cs-day-icon">🎡</span>
          <span class="cs-day-label" style="font-weight:900;color:#1b7a43;">Tour de Roue VIP offert !</span>
        `;
      }
      if (actionPill) {
        actionPill.outerHTML = `<span class="cs-day-status" style="color:#1b7a43;font-weight:800;">✓ Réclamé (Code : LC-CAL7)</span>`;
      }

      const progressText = $("#cs-progress-text");
      const progressPct = $("#cs-progress-pct");
      const progressBar = $("#cs-progress-bar");

      if (progressText) progressText.innerHTML = `<b>Jauge d'assiduité :</b> 3 / 6 cases ouvertes (50 % - Bravo !)`;
      if (progressPct) progressPct.textContent = "50 %";
      if (progressBar) progressBar.style.width = "50%";

      const GE = window.LC_GAMES_ENGINE;
      if (GE && typeof GE.burstConfetti === "function") {
        GE.burstConfetti(csTodayBtn);
      }
    });
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
    const applyFcBackground = () => {
      if (!fcTrioPhone) return;
      fcTrioPhone.style.backgroundImage = `url('fonds/${currentFcFond}-640.webp')`;
      const veil = $("#fc-phone-lavis-veil");
      const lavis = C.LAVIS_SAISON[currentFcFond] || "#FAF6EC";
      if (veil) {
        veil.style.background = `linear-gradient(180deg, rgba(250, 246, 236, 0.92) 0%, ${lavis}dd 55%, rgba(250, 246, 236, 0.95) 100%)`;
      }
    };

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
          applyFcBackground();
        });
      });
    };
    renderFcFonds();
    applyFcBackground();

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

  const fcPhoneStage = $("#fc-motion-phone-stage");
  if (fcPhoneStage || (fcBtnVisit && fcBtnRefer)) {
    let fcPoints = 300;
    let fcEarnedTotal = 500;
    let fcVisits = 3;
    let fcRefs = 2;
    let fcJackpotCount = 44; // sur 50 (88 %)
    let fcRedeemedCafe = false;

    const FC_STEPS = [
      { key: "passeport", caption: "1/4 · Le client valide son passage (+100 pts)" },
      { key: "cadeaux", caption: "2/4 · Il choisit et débloque ses cadeaux" },
      { key: "parrainage", caption: "3/4 · Parrainage validé à la 1re visite" },
      { key: "jackpot", caption: "4/4 · Jackpot collectif, Wallet & Commerce" },
    ];
    let fcStepIdx = 0;
    let fcMotionPlaying = true;
    let fcMotionTimer = null;
    let fcStepActionTimer = null;

    const fcTabs = $$(".fc-tab-btn");
    const fcPanels = {
      passeport: $("#fc-panel-passeport"),
      cadeaux: $("#fc-panel-cadeaux"),
      parrainage: $("#fc-panel-parrainage"),
      jackpot: $("#fc-panel-jackpot"),
    };
    const fcSegs = $$(".fc-motion-seg");
    const fcCaptionEl = $("#fc-motion-caption");
    const fcPauseBtn = $("#fc-motion-play-pause");
    const fcBtnRedeem = $("#fc-btn-redeem");
    const fcBtnReplay = $("#fc-btn-replay");

    const updateFcTrioUI = (logHtml, animatePoints = false) => {
      const pointsValEl = $("#fc-points-val");
      const visitesCountEl = $("#fc-visites-count");
      const pointsBarEl = $("#fc-points-bar");
      const pointsMissingEl = $("#fc-points-missing");
      const loyaltyMsgEl = $("#fc-loyalty-msg");
      const headerTierPillEl = $("#fc-header-tier-pill");
      const tierBadgeEl = $("#fc-tier-badge");
      const cumulValEl = $("#fc-cumul-val");
      const tierProgressTextEl = $("#fc-tier-progress-text");
      const tierBarEl = $("#fc-tier-bar");
      const friezeOrEl = $("#fc-frieze-or");
      const boutiqueSoldeEl = $("#fc-boutique-solde");
      const rewardTicketEl = $("#fc-reward-ticket");
      const palierCafeBtnEl = $("#fc-btn-exchange-cafe");
      const palierDessertBadgeEl = $("#fc-palier-dessert-badge");
      const dessertStatusEl = $("#fc-dessert-status");
      const costDessertEl = $("#fc-cost-dessert");
      const refCountEl = $("#fc-ref-count");
      const jackpotCounterEl = $("#fc-jackpot-counter");
      const jackpotPctPillEl = $("#fc-jackpot-pct-pill");
      const jackpotBarEl = $("#fc-jackpot-bar");
      const jackpotMsgEl = $("#fc-jackpot-msg");

      if (pointsValEl) {
        pointsValEl.textContent = `${fcPoints}`;
        if (animatePoints) {
          pointsValEl.classList.remove("is-popping");
          void pointsValEl.offsetWidth;
          pointsValEl.classList.add("is-popping");
        }
      }
      if (visitesCountEl) {
        visitesCountEl.textContent = `${fcVisits} visite${fcVisits > 1 ? "s" : ""} validée${fcVisits > 1 ? "s" : ""}`;
      }

      const nextGoal = fcPoints >= 500 ? 1000 : 500;
      const missingPts = Math.max(0, nextGoal - fcPoints);
      const pctGoal = Math.min(100, Math.round((fcPoints / nextGoal) * 100));
      if (pointsBarEl) pointsBarEl.style.width = `${pctGoal}%`;
      if (pointsMissingEl) {
        pointsMissingEl.textContent = missingPts === 0 ? "Palier atteint !" : `Encore ${missingPts} points`;
      }
      if (loyaltyMsgEl) {
        if (fcPoints >= 500) {
          loyaltyMsgEl.innerHTML = `🎉 <b>Cadeau déblocable !</b> Vous pouvez échanger vos points dans l'onglet Cadeaux.`;
        } else {
          loyaltyMsgEl.innerHTML = `Plus que <b>${500 - fcPoints} pts</b> avant votre <b>Dessert du Chef offert !</b>`;
        }
      }

      // Niveau sur le CUMUL total gagné (jamais réduit quand on dépense !)
      const isGold = fcEarnedTotal >= 800;
      const tierLabel = isGold ? "🥇 Or" : "🥈 Argent";
      if (headerTierPillEl) headerTierPillEl.textContent = tierLabel;
      if (tierBadgeEl) {
        tierBadgeEl.textContent = tierLabel;
        tierBadgeEl.classList.toggle("is-gold", isGold);
      }
      if (cumulValEl) cumulValEl.textContent = `${fcEarnedTotal}`;
      if (friezeOrEl) {
        friezeOrEl.className = isGold ? "is-current" : "";
      }
      if (tierProgressTextEl) {
        tierProgressTextEl.textContent = isGold
          ? "Niveau maximum atteint · Merci !"
          : `Encore ${800 - fcEarnedTotal} points`;
      }
      if (tierBarEl) {
        tierBarEl.style.width = `${Math.min(100, Math.round((fcEarnedTotal / 800) * 100))}%`;
      }

      if (boutiqueSoldeEl) boutiqueSoldeEl.textContent = `Solde : ${fcPoints} pts`;
      if (rewardTicketEl) rewardTicketEl.hidden = !fcRedeemedCafe;
      if (palierCafeBtnEl) {
        if (fcRedeemedCafe) {
          palierCafeBtnEl.textContent = "✓ Échangé";
          palierCafeBtnEl.disabled = true;
        } else if (fcPoints >= 200) {
          palierCafeBtnEl.textContent = "Échanger";
          palierCafeBtnEl.disabled = false;
        } else {
          palierCafeBtnEl.textContent = `200 pts`;
          palierCafeBtnEl.disabled = true;
        }
      }

      if (palierDessertBadgeEl && dessertStatusEl && costDessertEl) {
        if (fcPoints >= 500) {
          costDessertEl.classList.add("is-ready");
          palierDessertBadgeEl.className = "fc-palier-badge unlocked";
          palierDessertBadgeEl.textContent = "✓ À portée";
          dessertStatusEl.textContent = "🎁 Disponible dès maintenant (500 pts)";
        } else {
          costDessertEl.classList.remove("is-ready");
          palierDessertBadgeEl.className = "fc-palier-badge progress";
          palierDessertBadgeEl.textContent = `${fcPoints}/500`;
          dessertStatusEl.textContent = `Encore ${500 - fcPoints} points pour ce cadeau`;
        }
      }

      if (refCountEl) {
        const restants = Math.max(0, 5 - fcRefs);
        refCountEl.innerHTML = `${fcRefs} sur 5 <small>(${restants > 0 ? `Encore ${restants}` : "Complet"})</small>`;
      }

      const jackpotPct = Math.min(100, Math.round((fcJackpotCount / 50) * 100));
      if (jackpotCounterEl) jackpotCounterEl.textContent = `${fcJackpotCount} / 50 visites`;
      if (jackpotPctPillEl) jackpotPctPillEl.textContent = `${jackpotPct} % atteint`;
      if (jackpotBarEl) jackpotBarEl.style.width = `${jackpotPct}%`;
      if (jackpotMsgEl) {
        jackpotMsgEl.innerHTML =
          fcJackpotCount >= 50
            ? `🎆 <b>100 % ATTEINT !</b> Le grand tirage collectif est déclenché pour tous les participants !`
            : `Votre dernière visite a rejoint la cagnotte : plus que <b>${50 - fcJackpotCount} visites</b> avant le tirage !`;
      }

      if (fcLiveLog && logHtml) {
        fcLiveLog.innerHTML = logHtml;
      }
    };

    const renderMotionStep = (idx, runMicroDemo = false) => {
      fcStepIdx = ((idx % FC_STEPS.length) + FC_STEPS.length) % FC_STEPS.length;
      const step = FC_STEPS[fcStepIdx];

      fcTabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.fcTab === step.key));
      Object.entries(fcPanels).forEach(([name, panel]) => {
        if (panel) panel.classList.toggle("active", name === step.key);
      });

      fcSegs.forEach((seg, sIdx) => {
        seg.classList.remove("is-done", "is-active");
        if (sIdx < fcStepIdx) seg.classList.add("is-done");
        else if (sIdx === fcStepIdx) {
          void seg.offsetWidth; // reset animation
          seg.classList.add("is-active");
        }
      });

      if (fcCaptionEl) fcCaptionEl.textContent = step.caption;

      clearTimeout(fcStepActionTimer);
      if (runMicroDemo && fcMotionPlaying) {
        if (step.key === "passeport") {
          fcStepActionTimer = setTimeout(() => {
            if (!fcMotionPlaying) return;
            const qrView = $("#fc-view-qr");
            const codeView = $("#fc-view-code");
            const qrTab = $("#fc-val-tab-qr");
            const codeTab = $("#fc-val-tab-code");
            if (qrView && codeView && qrTab && codeTab) {
              qrTab.classList.remove("active");
              codeTab.classList.add("active");
              qrView.classList.remove("active");
              codeView.classList.add("active");
              setTimeout(() => {
                if (fcMotionPlaying) {
                  qrTab.classList.add("active");
                  codeTab.classList.remove("active");
                  qrView.classList.add("active");
                  codeView.classList.remove("active");
                }
              }, 1700);
            }
          }, 1500);
        } else if (step.key === "cadeaux" && !fcRedeemedCafe && fcPoints >= 200) {
          fcStepActionTimer = setTimeout(() => {
            if (!fcMotionPlaying || fcRedeemedCafe) return;
            fcRedeemedCafe = true;
            fcPoints = Math.max(0, fcPoints - 200);
            updateFcTrioUI(null, true);
          }, 1400);
        }
      }
    };

    const stopFcMotion = () => {
      fcMotionPlaying = false;
      clearInterval(fcMotionTimer);
      clearTimeout(fcStepActionTimer);
      fcMotionTimer = null;
      if (fcPhoneStage) fcPhoneStage.classList.add("fc-motion-paused");
      if (fcPauseBtn) fcPauseBtn.textContent = "▶️ Lire";
    };

    const startFcMotion = (fromStart = false) => {
      clearInterval(fcMotionTimer);
      fcMotionPlaying = true;
      if (fcPhoneStage) fcPhoneStage.classList.remove("fc-motion-paused");
      if (fcPauseBtn) fcPauseBtn.textContent = "⏸️ Pause";
      if (fromStart) {
        fcPoints = 300;
        fcEarnedTotal = 500;
        fcVisits = 3;
        fcRefs = 2;
        fcJackpotCount = 44;
        fcRedeemedCafe = false;
        updateFcTrioUI();
        renderMotionStep(0, true);
      } else {
        renderMotionStep(fcStepIdx, true);
      }
      fcMotionTimer = setInterval(() => {
        if (fcMotionPlaying) {
          renderMotionStep((fcStepIdx + 1) % FC_STEPS.length, true);
        }
      }, 4600);
    };

    fcTabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        stopFcMotion();
        const targetIdx = FC_STEPS.findIndex((s) => s.key === btn.dataset.fcTab);
        renderMotionStep(targetIdx >= 0 ? targetIdx : 0, false);
      });
    });

    if (fcPauseBtn) {
      fcPauseBtn.addEventListener("click", () => {
        if (fcMotionPlaying) stopFcMotion();
        else startFcMotion(false);
      });
    }

    if (fcBtnReplay) {
      fcBtnReplay.addEventListener("click", () => {
        startFcMotion(true);
        if (fcLiveLog) {
          fcLiveLog.innerHTML = `<strong>▶ Motion Design relancé :</strong> Suivez les 4 étapes du Passeport côté client sur le téléphone !`;
        }
      });
    }

    /* Bascule mode validation : Carte à présenter (QR) vs Code du comptoir */
    const fcValTabQr = $("#fc-val-tab-qr");
    const fcValTabCode = $("#fc-val-tab-code");
    const fcViewQr = $("#fc-view-qr");
    const fcViewCode = $("#fc-view-code");
    if (fcValTabQr && fcValTabCode && fcViewQr && fcViewCode) {
      fcValTabQr.addEventListener("click", () => {
        stopFcMotion();
        fcValTabQr.classList.add("active");
        fcValTabCode.classList.remove("active");
        fcViewQr.classList.add("active");
        fcViewCode.classList.remove("active");
      });
      fcValTabCode.addEventListener("click", () => {
        stopFcMotion();
        fcValTabCode.classList.add("active");
        fcValTabQr.classList.remove("active");
        fcViewCode.classList.add("active");
        fcViewQr.classList.remove("active");
      });
    }

    /* Décompte vivant du jeton QR Code + Horloge Commerce en direct */
    let qrSeconds = 252;
    const qrTimerEl = $("#fc-qr-timer");
    const clockEl = $("#fc-commerce-clock");
    const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const refreshLiveClocks = () => {
      if (qrTimerEl) {
        qrSeconds = qrSeconds > 1 ? qrSeconds - 1 : 300;
        const m = Math.floor(qrSeconds / 60);
        const s = qrSeconds % 60;
        qrTimerEl.textContent = `${m}:${s < 10 ? "0" : ""}${s}`;
      }
      if (clockEl) {
        clockEl.textContent = `🕒 Il est ${timeFormatter.format(new Date())} chez Bistrot L'Étoile`;
      }
    };
    refreshLiveClocks();
    setInterval(refreshLiveClocks, 1000);

    const triggerStampPop = () => {
      const feedback = $("#fc-stamp-feedback");
      if (!feedback) return;
      feedback.classList.add("is-visible");
      const GE = window.LC_GAMES_ENGINE;
      if (GE && typeof GE.burstConfetti === "function") {
        GE.burstConfetti(feedback);
      }
      setTimeout(() => {
        feedback.classList.remove("is-visible");
      }, 1350);
    };

    const fcCopyCodeBtn = $("#fc-copy-code-btn");
    if (fcCopyCodeBtn) {
      fcCopyCodeBtn.addEventListener("click", () => {
        stopFcMotion();
        try {
          navigator.clipboard.writeText("https://lastchance.app/passeport/bistrot?parrain=PASS-LISA");
        } catch {}
        fcCopyCodeBtn.textContent = "✓ Lien copié !";
        setTimeout(() => {
          fcCopyCodeBtn.textContent = "Copier le lien";
        }, 1800);
      });
    }

    const handleVisitAction = () => {
      stopFcMotion();
      fcVisits += 1;
      fcPoints += 100;
      fcEarnedTotal += 100;
      fcJackpotCount = Math.min(50, fcJackpotCount + 2);
      renderMotionStep(0, false);
      triggerStampPop();
      updateFcTrioUI(
        `🎟️ <b>Passage validé (+100 pts) :</b> Solde de Lisa à <b>${fcPoints} pts</b> (${fcEarnedTotal} pts cumulés) et Cagnotte à <b>${fcJackpotCount}/50 visites</b> !`,
        true
      );
    };

    const handleRedeemAction = () => {
      stopFcMotion();
      renderMotionStep(1, false);
      if (fcPoints < 200) {
        fcPoints += 200;
        fcEarnedTotal += 200;
      }
      fcRedeemedCafe = true;
      fcPoints = Math.max(0, fcPoints - 200);
      updateFcTrioUI(
        `🎁 <b>Cadeau débloqué (FIDELITE-8K4P) :</b> 200 pts utilisés, mais le cumul total reste à <b>${fcEarnedTotal} pts</b> — le niveau ne baisse jamais !`,
        true
      );
    };

    const handleReferAction = () => {
      stopFcMotion();
      fcRefs = Math.min(5, fcRefs + 1);
      fcPoints += 150;
      fcEarnedTotal += 150;
      fcJackpotCount = Math.min(50, fcJackpotCount + 3);
      renderMotionStep(2, false);
      updateFcTrioUI(
        `🤝 <b>1re visite d'un ami validée (+150 pts) :</b> Filleul validé en caisse → +150 pts pour le parrain et cagnotte à <b>${fcJackpotCount}/50 visites</b> !`,
        true
      );
    };

    if (fcBtnVisit) fcBtnVisit.addEventListener("click", handleVisitAction);
    if (fcBtnRedeem) fcBtnRedeem.addEventListener("click", handleRedeemAction);
    if (fcBtnRefer) fcBtnRefer.addEventListener("click", handleReferAction);

    const fcBtnTriggerScan = $("#fc-btn-trigger-scan");
    const fcBtnTriggerCode = $("#fc-btn-trigger-code");
    const fcBtnExchangeCafe = $("#fc-btn-exchange-cafe");
    const fcScreenBtnRefer = $("#fc-screen-btn-refer");
    const fcScreenBtnJackpot = $("#fc-screen-btn-jackpot");
    const fcBtnSimInstall = $("#fc-btn-sim-install");

    if (fcBtnTriggerScan) fcBtnTriggerScan.addEventListener("click", handleVisitAction);
    if (fcBtnTriggerCode) fcBtnTriggerCode.addEventListener("click", handleVisitAction);
    if (fcBtnExchangeCafe) fcBtnExchangeCafe.addEventListener("click", handleRedeemAction);
    if (fcScreenBtnRefer) fcScreenBtnRefer.addEventListener("click", handleReferAction);
    if (fcBtnSimInstall) {
      fcBtnSimInstall.addEventListener("click", () => {
        stopFcMotion();
        fcBtnSimInstall.textContent = "✓ Ajoutée sur l'écran d'accueil !";
        if (fcLiveLog) {
          fcLiveLog.innerHTML = `📲 <b>Carte installée :</b> L'icône du passeport apparaît sur l'écran d'accueil du téléphone comme une vraie application.`;
        }
      });
    }
    if (fcScreenBtnJackpot) {
      fcScreenBtnJackpot.addEventListener("click", () => {
        stopFcMotion();
        fcJackpotCount = 50;
        renderMotionStep(3, false);
        updateFcTrioUI(
          `🎉 <b>50/50 VISITES ATTEINTES (100 %) !</b> Le tirage au sort du Menu Dégustation Duo est déclenché pour tous les habitués !`
        );
        const GE = window.LC_GAMES_ENGINE;
        if (GE && typeof GE.burstConfetti === "function") {
          GE.burstConfetti(fcScreenBtnJackpot);
        }
      });
    }

    if (fcBtnReset) {
      fcBtnReset.addEventListener("click", () => {
        startFcMotion(true);
        if (fcBtnSimInstall) fcBtnSimInstall.textContent = "📲 Écran d'accueil";
        if (fcLiveLog) {
          fcLiveLog.innerHTML = `↺ <b>Démonstration réinitialisée :</b> Suivez les 4 étapes automatiques ou cliquez sur les boutons pour tester chaque action.`;
        }
      });
    }

    updateFcTrioUI();
    startFcMotion(false);
  }

  /* ── 8. BARRE FLOTTANTE DE REPRISE DE CRÉATION EN COURS ── */
  const floatingDraftBar = $("#lc-floating-draft-bar");
  let isDraftDismissed = false;
  try {
    isDraftDismissed = sessionStorage.getItem("lc_draft_dismissed") === "1";
  } catch {
    // Ignore storage errors
  }
  if (floatingDraftBar && C && C.hasCustomDraft() && !isDraftDismissed) {
    const acc = C.loadAuth();
    const d = C.loadDrafts();
    const statusText =
      acc.status === "subscribed"
        ? `Votre compte actif (${acc.orgName || "Pro"})`
        : acc.status === "free_account"
        ? `Votre compte gratuit (${acc.orgName || acc.email})`
        : `Votre création en cours`;
    floatingDraftBar.hidden = false;
    floatingDraftBar.innerHTML = `
      <div style="flex:1;min-width:0;">
        <strong style="display:block;font:800 0.8rem var(--display);color:var(--k-ink);">✨ ${statusText}</strong>
        <small style="font-size:0.74rem;font-weight:700;color:var(--k-muted);">Reprenez votre modification là où vous vous étiez arrêté.</small>
      </div>
      <a class="k-btn k-btn-yellow k-btn-sm" href="studio.html?module=${d.lastModule || "vitrine"}">
        Reprendre ma création →
      </a>
      <button type="button" class="lc-draft-close" id="lc-draft-close" aria-label="Fermer cette notification" title="Fermer">✕</button>
    `;
    const closeBtn = $("#lc-draft-close", floatingDraftBar);
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        floatingDraftBar.hidden = true;
        try {
          sessionStorage.setItem("lc_draft_dismissed", "1");
        } catch {
          // Ignore
        }
      });
    }
  }

  /* ── 8B. FILTRAGE THÉMATIQUE DE LA FAQ (Kermesse Hub) ── */
  const faqFilterPills = $$(".faq-filter-pill");
  const faqItems = $$(".faq-item-pop");
  if (faqFilterPills.length && faqItems.length) {
    faqFilterPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const cat = pill.dataset.faqCat;
        faqFilterPills.forEach((p) => {
          const isActive = p === pill;
          p.classList.toggle("active", isActive);
          p.setAttribute("aria-pressed", isActive ? "true" : "false");
        });

        let firstOpened = false;
        faqItems.forEach((item) => {
          const itemCat = item.dataset.faqCat;
          const match = cat === "all" || itemCat === cat;
          item.classList.toggle("is-hidden", !match);
          if (match && !firstOpened) {
            item.setAttribute("open", "");
            firstOpened = true;
          } else {
            item.removeAttribute("open");
          }
        });
      });
    });
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

  /* ── 10. PAGE DÉDIÉE ABONNEMENTS & FORMULES (abonnements.html) ── */
  const abCompareTable = $(".ab-compare-table");
  const abCalcWrapper = $(".ab-calc-wrapper");

  if (abCompareTable || abCalcWrapper) {
    let isAnnual = false;

    // Smooth scroll universel pour les ancres internes #... (contourne la redirection de <base href>)
    document.addEventListener("click", (e) => {
      const anchor = e.target.closest('a[href*="#"]');
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;
      const hashIndex = href.indexOf("#");
      if (hashIndex === -1) return;
      const hash = href.slice(hashIndex);
      if (hash === "#top") {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const targetEl = document.querySelector(hash);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        targetEl.classList.add("highlight-pulse");
        setTimeout(() => targetEl.classList.remove("highlight-pulse"), 1600);
        try {
          history.pushState(null, "", "abonnements.html" + hash);
        } catch {}
      }
    });

    const PLAN_DATA = {
      none: { nom: "100% À la carte", prix: 0, annual: 0, rights: [] },
      core: { nom: "Coup d'envoi", prix: 29, annual: 23, rights: ["games"] },
      engagement: { nom: "Le Club", prix: 59, annual: 47, rights: ["games", "passport", "referral", "pass_hunt", "pass_advent"] },
      place: { nom: "Sur Place", prix: 79, annual: 63, rights: ["games", "vitrine", "rdv", "moments"] },
      live: { nom: "Le Grand Jeu", prix: 89, annual: 71, rights: ["games", "pass_screen", "pass_prono", "pass_quiz", "pass_pot"] },
      full: { nom: "La Totale", prix: 129, annual: 103, rights: ["games", "passport", "referral", "vitrine", "rdv", "moments", "pass_hunt", "pass_advent", "pass_quiz", "pass_pot", "pass_prono", "pass_screen"] },
    };

    const ADDON_DATA = {
      // Options mensuelles récurrentes
      vitrine: { nom: "Vitrine & Tarifs QR", prix: 20, type: "recurring", unit: "/mois" },
      rdv: { nom: "Réservation Directe 0%", prix: 20, type: "recurring", unit: "/mois" },
      moments: { nom: "Moments VIP & Ateliers", prix: 20, type: "recurring", unit: "/mois" },
      passport: { nom: "Passeport Fidélité & Lots", prix: 19, type: "recurring", unit: "/mois" },
      referral: { nom: "Parrainage Ambassadeurs", prix: 12, type: "recurring", unit: "/mois" },
      // Pass événementiels ponctuels
      pass_hunt: { nom: "Pass Chasse au Trésor", prix: 29, type: "onetime", unit: "unique" },
      pass_advent: { nom: "Pass Calendrier Surprises", prix: 29, type: "onetime", unit: "unique" },
      pass_quiz: { nom: "Pass Soirée Quiz & Blind Test", prix: 15, type: "onetime", unit: "unique" },
      pass_pot: { nom: "Pass Cagnotte & Jackpot", prix: 29, type: "onetime", unit: "unique" },
      pass_prono: { nom: "Pass Saison Pronostics", prix: 39, type: "onetime", unit: "unique" },
      pass_screen: { nom: "Pass Grand Écran TV", prix: 9, type: "onetime", unit: "unique" },
    };

    // Toggle de facturation synchronisé (Hero + En-tête de tableau + Calculateur)
    const setBillingPeriod = (annual) => {
      isAnnual = Boolean(annual);

      // Met à jour les boutons du hero
      const heroMonthly = $("#btn-billing-monthly");
      const heroAnnual = $("#btn-billing-annual");
      if (heroMonthly && heroAnnual) {
        heroMonthly.classList.toggle("active", !isAnnual);
        heroMonthly.setAttribute("aria-pressed", String(!isAnnual));
        heroAnnual.classList.toggle("active", isAnnual);
        heroAnnual.setAttribute("aria-pressed", String(isAnnual));
      }

      // Met à jour la carte récapitulative du Hero
      const heroSavingIndicator = $("#hero-saving-indicator");
      const heroSavingText = $("#hero-saving-text");
      if (heroSavingIndicator && heroSavingText) {
        if (isAnnual) {
          heroSavingIndicator.innerHTML = 'Dès 23 €<small>/mois</small> <span class="hero-save-badge">-20%</span>';
          heroSavingText.textContent = "Facturation annuelle · 2 mois offerts chaque année";
        } else {
          heroSavingIndicator.innerHTML = 'Dès 29 €<small>/mois</small>';
          heroSavingText.textContent = "Paiement mensuel sans engagement de durée";
        }
        heroSavingIndicator.classList.add("highlight-pulse");
        setTimeout(() => heroSavingIndicator.classList.remove("highlight-pulse"), 1000);
      }

      // Met à jour les boutons du tableau comparatif
      const tblMonthly = $("#btn-tbl-monthly");
      const tblAnnual = $("#btn-tbl-annual");
      if (tblMonthly && tblAnnual) {
        tblMonthly.classList.toggle("active", !isAnnual);
        tblMonthly.setAttribute("aria-pressed", String(!isAnnual));
        tblAnnual.classList.toggle("active", isAnnual);
        tblAnnual.setAttribute("aria-pressed", String(isAnnual));
      }

      // Met à jour les prix du tableau comparatif
      $$(".th-plan-price").forEach((el) => {
        const monthly = el.dataset.monthly;
        const annualPrice = el.dataset.annual;
        const price = isAnnual ? annualPrice : monthly;
        el.innerHTML = `${price} €<small>/mois</small>`;
      });

      // Met à jour les prix du pied de tableau
      $$(".tfoot-price").forEach((el) => {
        const planKey = el.dataset.plan;
        const info = PLAN_DATA[planKey];
        if (info) {
          const price = isAnnual ? info.annual : info.prix;
          el.innerHTML = `${price} €<small>/mois</small>`;
        }
      });

      // Met à jour les liens des boutons du tableau
      $$(".tbl-cta-btn").forEach((btn) => {
        const baseHref = btn.dataset.baseHref || btn.getAttribute("href").split("&billing=")[0];
        btn.setAttribute("href", `${baseHref}&billing=${isAnnual ? "annual" : "monthly"}`);
      });

      // Synchronise les boutons de période dans le calculateur
      const calcPeriodMonthly = $("#calc-period-monthly");
      const calcPeriodAnnual = $("#calc-period-annual");
      if (calcPeriodMonthly && calcPeriodAnnual) {
        calcPeriodMonthly.classList.toggle("active", !isAnnual);
        calcPeriodAnnual.classList.toggle("active", isAnnual);
      }

      updateCalculator();
    };

    // Attache les événements sur les boutons du hero et du tableau
    const bindTogglePair = (btnMId, btnAId) => {
      const btnM = $(btnMId);
      const btnA = $(btnAId);
      if (btnM) btnM.addEventListener("click", () => setBillingPeriod(false));
      if (btnA) btnA.addEventListener("click", () => setBillingPeriod(true));
    };

    bindTogglePair("#btn-billing-monthly", "#btn-billing-annual");
    bindTogglePair("#btn-tbl-monthly", "#btn-tbl-annual");

    // Boutons de période dans le calculateur
    const calcPeriodMonthly = $("#calc-period-monthly");
    const calcPeriodAnnual = $("#calc-period-annual");
    if (calcPeriodMonthly) calcPeriodMonthly.addEventListener("click", () => setBillingPeriod(false));
    if (calcPeriodAnnual) calcPeriodAnnual.addEventListener("click", () => setBillingPeriod(true));

    const userCheckedAddons = new Set();

    // Calculateur de budget sur-mesure & Add-ons Stripe
    function updateCalculator() {
      if (!abCalcWrapper) return;

      const selectedPlanInput = $('input[name="calc-plan"]:checked');
      const selectedPlanKey = selectedPlanInput ? selectedPlanInput.value : "engagement";
      const planInfo = PLAN_DATA[selectedPlanKey] || PLAN_DATA.engagement;

      // Met à jour l'affichage de la formule choisie
      const sumPlanName = $("#calc-summary-plan-name");
      const sumPlanPrice = $("#calc-summary-plan-price");
      const planCost = isAnnual ? planInfo.annual : planInfo.prix;

      if (sumPlanName) sumPlanName.textContent = `Formule « ${planInfo.nom} »`;
      if (sumPlanPrice) sumPlanPrice.textContent = `${planCost},00 €`;

      // Gestion des add-ons inclus automatiquement vs à la carte
      let recurringAddonsCost = 0;
      let onetimeAddonsCost = 0;
      const selectedRecurringKeys = [];
      const selectedOnetimeKeys = [];

      const addonCards = $$(".calc-interactive-addon-card");

      addonCards.forEach((card) => {
        const input = card.querySelector('input[type="checkbox"]');
        if (!input) return;
        const key = input.value;
        const data = ADDON_DATA[key];
        if (!data) return;

        const isIncluded = planInfo.rights.includes(key);
        const badge = card.querySelector(".calc-card-status-badge");

        if (isIncluded) {
          card.classList.add("is-included-in-plan");
          card.classList.remove("is-selected");
          input.checked = true;
          input.disabled = true;
          if (badge) {
            badge.className = "calc-card-status-badge included";
            badge.textContent = "✓ Inclus sans surcoût";
          }
        } else {
          card.classList.remove("is-included-in-plan");
          input.disabled = false;
          input.checked = userCheckedAddons.has(key);
          card.classList.toggle("is-selected", input.checked);

          if (badge) {
            badge.className = "calc-card-status-badge optional";
            badge.textContent = data.type === "recurring" ? "Option mensuelle" : "Pass ponctuel";
          }

          if (input.checked) {
            if (data.type === "recurring") {
              const itemPrice = isAnnual ? Math.round(data.prix * 0.8) : data.prix;
              recurringAddonsCost += itemPrice;
              selectedRecurringKeys.push(key);
            } else {
              onetimeAddonsCost += data.prix;
              selectedOnetimeKeys.push(key);
            }
          }
        }
      });

      // Remplissage de la liste des add-ons dans le récapitulatif
      const addonsList = $("#calc-summary-addons-list");
      if (addonsList) {
        const totalCheckedKeys = [...selectedRecurringKeys, ...selectedOnetimeKeys];
        if (totalCheckedKeys.length === 0) {
          addonsList.innerHTML = '<span style="font-size:0.75rem;color:#6b5f79;font-style:italic;">Aucun add-on payant supplémentaire coché</span>';
        } else {
          addonsList.innerHTML = totalCheckedKeys.map((key) => {
            const add = ADDON_DATA[key];
            const displayPrice = (add.type === "recurring" && isAnnual) ? Math.round(add.prix * 0.8) : add.prix;
            return `
              <div class="calc-sum-addon-item">
                <span>+ ${add.nom}</span>
                <span>+${displayPrice},00 € <small>${add.unit}</small></span>
              </div>
            `;
          }).join("");
        }
      }

      // Calcul total récurrent et affichage
      const totalMonthly = planCost + recurringAddonsCost;
      const totalDisplay = $("#calc-total-display");
      const discountLine = $("#calc-discount-line");
      const periodCaption = $("#calc-period-caption");
      const checkoutBtn = $("#calc-checkout-btn");
      const onetimeBox = $("#calc-onetime-total-box");
      const onetimeAmount = $("#calc-onetime-amount");

      if (isAnnual) {
        if (discountLine) discountLine.hidden = false;
        if (periodCaption) periodCaption.textContent = "par mois (facturé annuellement · 2 mois offerts)";
      } else {
        if (discountLine) discountLine.hidden = true;
        if (periodCaption) periodCaption.textContent = "par mois sans engagement";
      }

      if (totalDisplay) totalDisplay.textContent = `${totalMonthly} €`;

      const mobileTotalPill = $("#mobile-calc-total-pill");
      if (mobileTotalPill) {
        mobileTotalPill.textContent = onetimeAddonsCost > 0
          ? `${totalMonthly} €/m (+ ${onetimeAddonsCost} €)`
          : `${totalMonthly} €/mois`;
      }

      // Affichage du sous-total ponctuel si des pass sont cochés
      if (onetimeBox && onetimeAmount) {
        if (onetimeAddonsCost > 0) {
          onetimeBox.style.display = "block";
          onetimeAmount.textContent = `${onetimeAddonsCost} €`;
        } else {
          onetimeBox.style.display = "none";
        }
      }

      // Mise à jour du CTA Stripe Checkout
      if (checkoutBtn) {
        const checkoutPlan = selectedPlanKey !== "none" ? selectedPlanKey : "addon_custom";
        const allSelectedAddons = [...selectedRecurringKeys, ...selectedOnetimeKeys];
        const urlParams = new URLSearchParams({
          plan: checkoutPlan,
          billing: isAnnual ? "annual" : "monthly",
          addons: allSelectedAddons.join(","),
        });
        checkoutBtn.setAttribute("href", `/signup?${urlParams.toString()}`);
        checkoutBtn.textContent = selectedPlanKey !== "none"
          ? `Démarrer mon essai gratuit de 7 jours (${planInfo.nom}) →`
          : `Activer mes options sur-mesure (${totalMonthly} €/m) →`;
      }

      // Sauvegarde du brouillon de commande en mémoire
      try {
        localStorage.setItem("lc_checkout_draft", JSON.stringify({
          plan: selectedPlanKey,
          isAnnual,
          recurringAddons: selectedRecurringKeys,
          onetimeAddons: selectedOnetimeKeys,
          totalMonthly,
          onetimeAddonsCost,
          updatedAt: new Date().toISOString(),
        }));
      } catch {
        // Ignoré si indisponible
      }
    }

    // Écouteurs sur les sélections du calculateur
    $$('input[name="calc-plan"]').forEach((radio) => {
      radio.addEventListener("change", updateCalculator);
    });

    $$('input[name="calc-addon"]').forEach((chk) => {
      chk.addEventListener("change", () => {
        if (chk.checked) {
          userCheckedAddons.add(chk.value);
        } else {
          userCheckedAddons.delete(chk.value);
        }
        updateCalculator();
      });
    });

    // Initialisation
    setBillingPeriod(false);
  }

  /* ── 13. ÉMULATEUR CLIENT UNIVERSEL (HÉROS QR CODES & PAGES MODULES) ── */
  const GE = window.LC_GAMES_ENGINE;
  const EMU_META = {
    passeport: {
      kicker: "PASS TEST CLIENT · /passeport",
      title: "Passeport Fidélité Client (Vue Smartphone)",
      desc: "Votre client garde sa carte sur son téléphone sans installer d’application : il cumule ses points, voit sa jauge de paliers évoluer et débloque ses cadeaux au comptoir.",
      group: ["passeport", "jackpot", "parrainage"],
      studioHref: "studio.html?module=fidelite",
      moduleHref: "modules.html?m=passeport-fidelite",
    },
    jackpot: {
      kicker: "CAGNOTTE COLLECTIVE · /jackpot",
      title: "Jackpot Collectif de la Communauté",
      desc: "Chaque passage de vos clients remplit une cagnotte commune. Dès que l’objectif est atteint, un tirage collectif automatique récompense un membre parmi les participants.",
      group: ["passeport", "jackpot", "parrainage"],
      studioHref: "studio.html?module=fidelite",
      moduleHref: "modules.html?m=jackpot-collectif",
    },
    parrainage: {
      kicker: "PARRAINAGE · /v/...?parrain=",
      title: "Bouche-à-oreille Traçable (Parrain & Filleul)",
      desc: "Vos habitués partagent leur lien personnel à leurs proches. À la première visite validée du filleul en caisse, les deux reçoivent instantanément leur récompense.",
      group: ["passeport", "jackpot", "parrainage"],
      studioHref: "studio.html?module=fidelite",
      moduleHref: "modules.html?m=passeport-fidelite",
    },
    jeux: {
      kicker: "EXPERIENCE JOUEUR · /play",
      title: "Les 15 Jeux Instantanés (Vue Client)",
      desc: "Votre client scanne, participe en 15 secondes sur votre thème graphique et repart avec son code gain à présenter en caisse.",
      group: ["jeux", "pronostics"],
      studioHref: "studio.html?module=roue",
      moduleHref: "modules.html?m=jeux-instantanes",
    },
    pronostics: {
      kicker: "CONCOURS DE PRONOSTICS · /pronos",
      title: "Grille & Classement de Saison",
      desc: "Vos clients saisissent leurs scores journée après journée sur leur téléphone, suivent leur classement en direct et jouent pour les dotations finales.",
      group: ["jeux", "pronostics"],
      studioHref: "studio.html?module=pronostics",
      moduleHref: "modules.html?m=pronostics",
    },
    vitrine: {
      kicker: "CARTE & TARIFS · /v/commerce",
      title: "Vitrine Interactive Multi-Métiers",
      desc: "Menu, prestations, tarifs, histoire et boutons d’action vers votre jeu, votre prise de rendez-vous ou votre carte de fidélité sur une seule page rapide.",
      group: ["vitrine", "rdv", "moments"],
      studioHref: "studio.html?module=vitrine",
      moduleHref: "vitrine-reservation.html",
    },
    rdv: {
      kicker: "RÉSERVATION DIRECTE 0 % · /reserver",
      title: "Prise de Rendez-vous & Réservation de Table",
      desc: "Vos clients réservent un créneau en 3 gestes sans intermédiaire ni commission, reçoivent leur pass et l’ajoutent à leur agenda.",
      group: ["vitrine", "rdv", "moments"],
      studioHref: "studio.html?module=vitrine",
      moduleHref: "vitrine-reservation.html",
    },
    moments: {
      kicker: "ÉVÉNEMENTS & FILE D'ATTENTE · /reserver",
      title: "Moments VIP & File d’Attente en Direct",
      desc: "Ventes privées, ateliers à jauge limitée ou file d’attente numérique : vos clients réservent les dernières places ou suivent leur tour sur mobile.",
      group: ["vitrine", "rdv", "moments"],
      studioHref: "studio.html?module=vitrine",
      moduleHref: "vitrine-reservation.html",
    },
    calendrier: {
      kicker: "CALENDRIER QUOTIDIEN · /calendar",
      title: "Calendrier Interactif (Cases du Jour)",
      desc: "Chaque jour dévoile une nouvelle case : bonus fidélité, surprise comptoir ou tour de roue quotidien installable sur l’écran d’accueil.",
      group: ["calendrier"],
      studioHref: "studio.html?module=roue",
      moduleHref: "modules.html?m=calendrier",
    },
    "evenements-live": {
      kicker: "SOIRÉE ANIMÉE · /event + /screen",
      title: "Événements Live sur Écran Géant",
      desc: "Animez vos soirées au bar, en restaurant ou en boutique : les clients répondent ensemble sur téléphone pendant que l’écran géant affiche le live.",
      group: ["evenements-live"],
      studioHref: "/signup",
      moduleHref: "modules.html?m=evenements-live",
    },
    quiz: {
      kicker: "QUIZ INTERACTIF · /quiz",
      title: "Quiz Libre-Service avec Correction Immédiate",
      desc: "Éduquez et divertissez vos visiteurs autour de votre savoir-faire, affichez le score en direct et offrez une récompense aux meilleurs.",
      group: ["quiz"],
      studioHref: "/signup",
      moduleHref: "modules.html?m=quiz",
    },
    "chasse-au-qr": {
      kicker: "PARCOURS PHYSIQUE · /hunt",
      title: "Chasse au QR (2 à 10 Étapes)",
      desc: "Faites circuler vos visiteurs dans votre établissement, entre vos rayons ou avec des commerçants voisins jusqu’au coffre final.",
      group: ["chasse-au-qr"],
      studioHref: "/signup",
      moduleHref: "modules.html?m=chasse-au-qr",
    },
    "duo-miroir": {
      kicker: "JEU DE TABLE À 2 · /lobby",
      title: "Duo Miroir (Révélation Complice)",
      desc: "Un brise-glace fun pour deux personnes à table ou en salle d’attente : chacun répond secrètement puis découvre votre score de complicité.",
      group: ["duo-miroir"],
      studioHref: "/signup",
      moduleHref: "modules.html?m=duo-miroir",
    },
    "portrait-de-la-bande": {
      kicker: "JEU DE GROUPE 2-12 JOUEURS · /lobby",
      title: "Portrait de la Bande (Vote Secret)",
      desc: "Fous rires garantis pour vos grandes tablées : chacun vote discrètement pour le rôle de ses amis, révélation dès 3 votes reçus.",
      group: ["portrait-de-la-bande"],
      studioHref: "/signup",
      moduleHref: "modules.html?m=portrait-de-la-bande",
    },
    "ticket-dor": {
      kicker: "PROCHAINE VISITE · /ticket",
      title: "Ticket d’Or (Carte à Gratter de Retour)",
      desc: "Remis en caisse après l’achat, le Ticket d’Or assure le retour du client dès la semaine suivante avec un privilège unique à découvrir.",
      group: ["ticket-dor"],
      studioHref: "/signup",
      moduleHref: "modules.html?m=ticket-dor",
    },
    "missions-coffres": {
      kicker: "PROGRESSION AUTOMATIQUE · /progression",
      title: "Missions, Clés & Coffres à Débloquer",
      desc: "Transformez toutes les actions clients (jeu, avis, fidélité, parrainage) en missions récompensées par des clés ouvrant des coffres cadeaux.",
      group: ["missions-coffres"],
      studioHref: "/signup",
      moduleHref: "modules.html?m=missions-coffres",
    },
  };

  const GROUP_PILL_LABELS = {
    passeport: "🎟️ Passeport",
    jackpot: "🎰 Jackpot",
    parrainage: "🤝 Parrainage",
    jeux: "🎲 15 Jeux",
    pronostics: "🏆 Pronostics",
    vitrine: "📖 Vitrine",
    rdv: "📅 Rendez-vous",
    moments: "⚡ Moments VIP",
  };

  const emuState = {
    mode: "passeport",
    // Passeport / Parrainage / Jackpot
    pts: 300,
    cumul: 500,
    visits: 3,
    fond: "restaurant",
    nickname: "Lisa M.",
    passTab: "carte",
    redeemedCode: "",
    walletSaved: false,
    jackpotCount: 47,
    jackpotWinner: "",
    parrainView: "parrain",
    parrainRefs: 2,
    parrainFriendDone: false,
    // Jeux
    gamePresetKey: "kermesse",
    gameMechKey: "wheel",
    // Pronostics
    pronoCompIdx: 0,
    pronoTab: "grille",
    pronoScores: [[2, 1], [1, 1], [3, 1]],
    pronoSubmitted: false,
    // Vitrine / RDV / Moments
    sector: "restaurant",
    vitrineTab: "carte",
    rdvService: "Table pour 2 personnes",
    rdvDay: "Demain",
    rdvSlot: "20h00",
    rdvConfirmed: false,
    momentView: "atelier",
    momentSpots: 3,
    momentBooked: false,
    // Autres modules
    calDayOpened: false,
    liveChoice: -1,
    quizStep: 0,
    quizScore: 0,
    quizAnswered: -1,
    huntStep: 2,
    duoDone: false,
    bandeVote: "",
    ticketScratched: false,
    missionsDone: 2,
  };

  let emuSimInstance = null;

  const ensureEmulatorModal = () => {
    let modal = $("#lc-universal-emulator-modal");
    if (modal) return modal;

    modal = el("div", {
      class: "k-modal-backdrop",
      id: "lc-universal-emulator-modal",
      hidden: "",
    });
    modal.innerHTML = `
      <div class="lc-emu-card" role="dialog" aria-modal="true" aria-labelledby="lc-emu-title">
        <div class="k-stripe-bar" aria-hidden="true"></div>
        <button type="button" class="k-modal-close" id="lc-emu-close" aria-label="Fermer l’émulateur client">✕</button>
        <div class="lc-emu-body">
          <div class="lc-emu-left">
            <span class="lc-emu-kicker" id="lc-emu-kicker"></span>
            <h2 class="lc-emu-title" id="lc-emu-title"></h2>
            <p class="lc-emu-desc" id="lc-emu-desc"></p>
            <div class="lc-emu-mode-pills" id="lc-emu-mode-pills"></div>
            <div class="lc-emu-context-box" id="lc-emu-context-box"></div>
            <div class="lc-emu-cta-row">
              <a href="studio.html" class="ticket-btn pop-btn-yellow" id="lc-emu-studio-link">🛠️ Personnaliser le mien →</a>
              <a href="modules.html" class="ticket-btn pop-btn-white" id="lc-emu-module-link">📖 Fiche complète du module</a>
            </div>
          </div>
          <div class="lc-emu-right">
            <div class="lc-emu-phone">
              <div class="lc-emu-phone-bar">
                <span>09:41</span>
                <div class="lc-emu-phone-notch" aria-hidden="true"></div>
                <span>5G 100%</span>
              </div>
              <div class="lc-emu-phone-screen" id="lc-emu-phone-screen"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = $("#lc-emu-close", modal);
    if (closeBtn) closeBtn.addEventListener("click", () => (modal.hidden = true));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.hidden = true;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) modal.hidden = true;
    });
    return modal;
  };

  const renderEmulatorContextBox = (ctxEl) => {
    const m = emuState.mode;
    if (m === "passeport" || m === "jackpot" || m === "parrainage") {
      const fonds = (C && C.FOND_KEYS ? C.FOND_KEYS : ["restaurant", "prairie", "noel", "festival", "soldes"]).slice(0, 6);
      ctxEl.innerHTML = `
        <strong style="font:800 0.82rem var(--display);">🎨 Changez le fond du Passeport en direct :</strong>
        <div class="lc-emu-theme-grid">
          ${fonds.map((fk) => `<button type="button" class="lc-emu-chip ${emuState.fond === fk ? "active" : ""}" data-emu-fond="${fk}">${(C && C.FOND_LABELS && C.FOND_LABELS[fk]) || fk}</button>`).join("")}
        </div>
        <p style="margin:0;font-size:0.78rem;font-weight:600;color:#4a4033;">
          💡 Cliquez directement dans le téléphone à droite : ajoutez <b>+100 pts</b>, échangez un cadeau ou déclenchez le tirage du Jackpot à <b>50/50</b> !
        </p>
      `;
      $$("[data-emu-fond]", ctxEl).forEach((b) => {
        b.addEventListener("click", () => {
          emuState.fond = b.dataset.emuFond;
          renderEmulator();
        });
      });
      return;
    }

    if (m === "jeux") {
      const presets = (C && C.WHEEL_PRESETS ? C.WHEEL_PRESETS : []).slice(0, 8);
      const mechs = C && C.INSTANT_MECHANICS ? C.INSTANT_MECHANICS : [];
      ctxEl.innerHTML = `
        <strong style="font:800 0.82rem var(--display);">1. Thème de votre établissement :</strong>
        <div class="lc-emu-theme-grid">
          ${presets.map((p) => `<button type="button" class="lc-emu-chip ${emuState.gamePresetKey === p.key ? "active" : ""}" data-emu-preset="${p.key}">${p.label}</button>`).join("")}
        </div>
        <strong style="font:800 0.82rem var(--display);margin-top:0.25rem;">2. Mécanique (${mechs.length || 15} disponibles) :</strong>
        <div class="lc-emu-theme-grid">
          ${mechs.map((mc) => `<button type="button" class="lc-emu-chip ${emuState.gameMechKey === mc.key ? "active" : ""}" data-emu-mech="${mc.key}">${mc.icon} ${mc.label}</button>`).join("")}
        </div>
      `;
      $$("[data-emu-preset]", ctxEl).forEach((b) => {
        b.addEventListener("click", () => {
          emuState.gamePresetKey = b.dataset.emuPreset;
          renderEmulator();
        });
      });
      $$("[data-emu-mech]", ctxEl).forEach((b) => {
        b.addEventListener("click", () => {
          emuState.gameMechKey = b.dataset.emuMech;
          renderEmulator();
        });
      });
      return;
    }

    if (m === "pronostics") {
      const comps = C && C.COMPETITIONS ? C.COMPETITIONS : [{ key: "ldc", label: "Ligue des champions", icon: "⭐" }];
      ctxEl.innerHTML = `
        <strong style="font:800 0.82rem var(--display);">🏆 Compétition &amp; grille en cours :</strong>
        <div class="lc-emu-theme-grid">
          ${comps.slice(0, 5).map((cp, idx) => `<button type="button" class="lc-emu-chip ${emuState.pronoCompIdx === idx ? "active" : ""}" data-emu-comp="${idx}">${cp.icon || "⚽"} ${cp.label}</button>`).join("")}
        </div>
        <p style="margin:0;font-size:0.78rem;font-weight:600;color:#4a4033;">
          💡 Modifiez les scores des matchs dans le téléphone, validez la grille et observez le classement se mettre à jour en temps réel.
        </p>
      `;
      $$("[data-emu-comp]", ctxEl).forEach((b) => {
        b.addEventListener("click", () => {
          emuState.pronoCompIdx = Number(b.dataset.emuComp) || 0;
          emuState.pronoSubmitted = false;
          renderEmulator();
        });
      });
      return;
    }

    if (m === "vitrine" || m === "rdv" || m === "moments") {
      const sectors = C && C.VITRINE_SECTEURS ? Object.values(C.VITRINE_SECTEURS) : [];
      ctxEl.innerHTML = `
        <strong style="font:800 0.82rem var(--display);">🏪 Choisissez votre secteur d’activité :</strong>
        <div class="lc-emu-theme-grid">
          ${sectors.map((s) => `<button type="button" class="lc-emu-chip ${emuState.sector === s.key ? "active" : ""}" data-emu-sec="${s.key}">${s.icon} ${s.label}</button>`).join("")}
        </div>
        <p style="margin:0;font-size:0.78rem;font-weight:600;color:#4a4033;">
          💡 Zéro commission sur chaque rendez-vous ou inscription VIP : la relation reste 100 % entre votre commerce et votre client.
        </p>
      `;
      $$("[data-emu-sec]", ctxEl).forEach((b) => {
        b.addEventListener("click", () => {
          emuState.sector = b.dataset.emuSec;
          emuState.rdvConfirmed = false;
          renderEmulator();
        });
      });
      return;
    }

    ctxEl.innerHTML = `
      <strong style="font:800 0.82rem var(--display);">🎮 Mode test interactif actif :</strong>
      <p style="margin:0;font-size:0.8rem;font-weight:600;color:#4a4033;">
        Appuyez directement dans l’écran du téléphone à droite pour manipuler cette expérience exactement comme vos clients après un scan de QR code.
      </p>
    `;
  };

  const renderEmulatorPhone = (screenEl) => {
    const m = emuState.mode;
    if (emuSimInstance && typeof emuSimInstance.destroy === "function") {
      try { emuSimInstance.destroy(); } catch {}
      emuSimInstance = null;
    }
    screenEl.style.backgroundImage = "";
    screenEl.style.background = "#faf6ec";

    if (m === "passeport") {
      const lavis = (C && C.LAVIS_SAISON && C.LAVIS_SAISON[emuState.fond]) || "#fbecd4";
      const tier = emuState.cumul >= 800 ? "🥇 Niveau Or" : emuState.cumul >= 250 ? "🥈 Niveau Argent" : "🥉 Niveau Bronze";
      const nextGoal = emuState.pts >= 500 ? 800 : 500;
      const pct = Math.min(100, Math.round((emuState.pts / nextGoal) * 100));
      screenEl.style.background = `linear-gradient(180deg, rgba(250,246,236,0.92) 0%, ${lavis} 100%)`;

      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <div>
              <span style="display:block;font:800 0.68rem var(--body);color:#7a6a53;">BISTROT L’ÉTOILE · OUVERT</span>
              <strong style="font:900 0.94rem var(--display);">📔 Passeport Fidélité</strong>
            </div>
            <span class="lc-emu-code-pill">${tier}</span>
          </div>

          <div class="lc-emu-white-box" style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
            <div>
              <span style="font:800 0.72rem var(--body);color:#6b5e4b;">Mon surnom client</span>
              <input type="text" id="emu-nick-input" value="${emuState.nickname}" aria-label="Modifier votre surnom sur le passeport" style="display:block;width:100%;margin-top:0.2rem;border:1.5px solid #211d16;border-radius:8px;padding:0.24rem 0.45rem;font:800 0.84rem var(--body);background:#faf6ec;color:#211d16;" />
            </div>
            <span style="font:800 0.75rem var(--body);color:#047857;white-space:nowrap;">Cumul : ${emuState.cumul} pts</span>
          </div>

          <div class="lc-emu-solde-panel">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <strong style="font:900 1.45rem var(--display);">${emuState.pts} pts</strong>
              <span style="font:800 0.76rem var(--body);">${emuState.visits} passage${emuState.visits > 1 ? "s" : ""} validés</span>
            </div>
            <div class="lc-emu-progress-track"><div class="lc-emu-progress-fill" style="width:${pct}%"></div></div>
            <div style="font:700 0.74rem var(--body);">
              ${emuState.pts >= 500 ? "🎉 Palier 500 pts atteint ! Dessert du Chef déblocable." : `Plus que ${500 - emuState.pts} pts avant votre Dessert du Chef offert`}
            </div>
          </div>

          <div class="lc-emu-tab-row">
            <button type="button" class="lc-emu-tab-btn ${emuState.passTab === "carte" ? "active" : ""}" data-pass-tab="carte">📱 Ma Carte QR</button>
            <button type="button" class="lc-emu-tab-btn ${emuState.passTab === "cadeaux" ? "active" : ""}" data-pass-tab="cadeaux">🎁 Boutique cadeaux</button>
          </div>

          ${
            emuState.passTab === "carte"
              ? `
            <div class="lc-emu-white-box" style="text-align:center;">
              <div style="display:flex;align-items:center;gap:0.75rem;justify-content:center;margin-bottom:0.55rem;">
                <img src="img/qr-passeport.svg" alt="Votre QR passeport" width="74" height="74" style="border:2px solid #211d16;border-radius:10px;background:#fff;padding:3px;" />
                <div style="text-align:left;font-size:0.75rem;font-weight:700;">
                  Présentez ce QR en caisse<br />ou saisissez le code du jour.<br />
                  <span style="color:#8f3107;">1 passage = +100 points</span>
                </div>
              </div>
              <button type="button" class="lc-emu-primary-btn" id="emu-add-visit-btn">✅ Simuler mon scan en caisse (+100 pts)</button>
            </div>
            <button type="button" class="lc-emu-chip" id="emu-wallet-btn" style="width:100%;padding:0.48rem;">
              ${emuState.walletSaved ? "✓ Ajouté à Google Wallet &amp; Écran d’accueil" : "📲 Ajouter à Google Wallet / Écran d’accueil"}
            </button>
          `
              : `
            <div class="lc-emu-white-box" style="display:flex;flex-direction:column;gap:0.45rem;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;">
                <div><strong style="font:800 0.82rem var(--body);">☕ Café / Espresso offert</strong><div style="font-size:0.72rem;">Coût : 200 pts</div></div>
                <button type="button" class="lc-emu-chip active" id="emu-buy-cafe" ${emuState.pts < 200 ? "disabled" : ""}>Échanger</button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;border-top:1px dashed rgba(33,29,22,0.2);padding-top:0.45rem;">
                <div><strong style="font:800 0.82rem var(--body);">🍰 Dessert du Chef</strong><div style="font-size:0.72rem;">Coût : 500 pts</div></div>
                <button type="button" class="lc-emu-chip active" id="emu-buy-dessert" ${emuState.pts < 500 ? "disabled" : ""}>Échanger</button>
              </div>
              ${
                emuState.redeemedCode
                  ? `<div class="lc-emu-feedback">🎉 Bon débloqué : <span class="lc-emu-code-pill">${emuState.redeemedCode}</span><br/><small>Votre cumul (${emuState.cumul} pts) ne baisse jamais !</small></div>`
                  : ""
              }
            </div>
          `
          }
        </div>
      `;

      const nickInput = $("#emu-nick-input", screenEl);
      if (nickInput) nickInput.addEventListener("change", (e) => (emuState.nickname = e.target.value || "Lisa M."));
      $$("[data-pass-tab]", screenEl).forEach((tb) => {
        tb.addEventListener("click", () => {
          emuState.passTab = tb.dataset.passTab;
          renderEmulatorPhone(screenEl);
        });
      });
      const visitBtn = $("#emu-add-visit-btn", screenEl);
      if (visitBtn) {
        visitBtn.addEventListener("click", () => {
          emuState.pts += 100;
          emuState.cumul += 100;
          emuState.visits += 1;
          renderEmulatorPhone(screenEl);
        });
      }
      const walletBtn = $("#emu-wallet-btn", screenEl);
      if (walletBtn) {
        walletBtn.addEventListener("click", () => {
          emuState.walletSaved = true;
          renderEmulatorPhone(screenEl);
        });
      }
      const buyCafe = $("#emu-buy-cafe", screenEl);
      if (buyCafe) {
        buyCafe.addEventListener("click", () => {
          if (emuState.pts >= 200) {
            emuState.pts -= 200;
            emuState.redeemedCode = "FIDELITE-8K4P";
            renderEmulatorPhone(screenEl);
          }
        });
      }
      const buyDessert = $("#emu-buy-dessert", screenEl);
      if (buyDessert) {
        buyDessert.addEventListener("click", () => {
          if (emuState.pts >= 500) {
            emuState.pts -= 500;
            emuState.redeemedCode = "DESSERT-500G";
            renderEmulatorPhone(screenEl);
          }
        });
      }
      return;
    }

    if (m === "jackpot") {
      const pct = Math.min(100, Math.round((emuState.jackpotCount / 50) * 100));
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <div>
              <span style="display:block;font:800 0.68rem var(--body);color:#7a6a53;">CAGNOTTE DU QUARTIER</span>
              <strong style="font:900 0.94rem var(--display);">🎰 Jackpot Collectif</strong>
            </div>
            <span class="lc-emu-code-pill">${emuState.jackpotCount} / 50</span>
          </div>

          <div class="lc-emu-solde-panel">
            <strong style="font:900 1rem var(--display);display:block;">🏆 Lot commun à gagner :</strong>
            <span style="font:800 0.88rem var(--body);">Un Dîner Gastronomique pour 2 + Boissons</span>
            <div class="lc-emu-progress-track"><div class="lc-emu-progress-fill" style="width:${pct}%"></div></div>
            <span style="font:700 0.76rem var(--body);">${emuState.jackpotCount >= 50 ? "🚀 Objectif atteint à 100 % !" : `Encore ${50 - emuState.jackpotCount} participations avant le tirage collectif !`}</span>
          </div>

          <div class="lc-emu-white-box">
            <p style="margin:0 0 0.65rem;font-size:0.79rem;font-weight:600;">
              Plus la communauté scanne, plus vite le palier atteint <b>50 / 50</b> et déclenche un gagnant tiré au sort parmi les participants.
            </p>
            ${
              emuState.jackpotWinner
                ? `<div class="lc-emu-feedback">🎉 <b>Tirage collectif déclenché !</b><br/>Gagnante : <b>${emuState.jackpotWinner}</b> · Code <span class="lc-emu-code-pill">JACKPOT-WIN</span></div>
                   <button type="button" class="lc-emu-chip" id="emu-jackpot-reset" style="margin-top:0.55rem;width:100%;">↻ Réinitialiser la démo à 47/50</button>`
                : `<button type="button" class="lc-emu-primary-btn" id="emu-jackpot-inc">+ Valider 1 participation (${emuState.jackpotCount}/50)</button>`
            }
          </div>
        </div>
      `;
      const incBtn = $("#emu-jackpot-inc", screenEl);
      if (incBtn) {
        incBtn.addEventListener("click", () => {
          emuState.jackpotCount = Math.min(50, emuState.jackpotCount + 1);
          if (emuState.jackpotCount >= 50) {
            emuState.jackpotWinner = emuState.nickname || "Lisa M.";
            if (GE && typeof GE.burstConfetti === "function") GE.burstConfetti(screenEl);
          }
          renderEmulatorPhone(screenEl);
        });
      }
      const rstBtn = $("#emu-jackpot-reset", screenEl);
      if (rstBtn) {
        rstBtn.addEventListener("click", () => {
          emuState.jackpotCount = 47;
          emuState.jackpotWinner = "";
          renderEmulatorPhone(screenEl);
        });
      }
      return;
    }

    if (m === "parrainage") {
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <strong>🤝 Parrainage Client</strong>
            <span class="lc-emu-code-pill">${emuState.parrainRefs} filleuls venus</span>
          </div>
          <div class="lc-emu-tab-row">
            <button type="button" class="lc-emu-tab-btn ${emuState.parrainView === "parrain" ? "active" : ""}" data-pv="parrain">👑 Côté Parrain</button>
            <button type="button" class="lc-emu-tab-btn ${emuState.parrainView === "filleul" ? "active" : ""}" data-pv="filleul">🎁 Côté Ami invité</button>
          </div>
          ${
            emuState.parrainView === "parrain"
              ? `
            <div class="lc-emu-solde-panel">
              <strong style="font:800 0.84rem var(--display);">Lien personnel de ${emuState.nickname}</strong>
              <code style="display:block;margin:0.4rem 0;background:#fff;padding:0.4rem;border-radius:8px;border:1.5px solid #211d16;font-size:0.72rem;word-break:break-all;">
                lastchance.app/passeport/bistrot?parrain=PASS-LISA
              </code>
              <span style="font-size:0.76rem;font-weight:700;">Chaque ami qui vient pour la 1re fois vous rapporte <b>+150 pts</b> !</span>
            </div>
            <button type="button" class="lc-emu-primary-btn" id="emu-parrain-switch">Simuler l’arrivée de mon ami Tom →</button>
          `
              : `
            <div class="lc-emu-white-box">
              <span class="lc-emu-code-pill" style="margin-bottom:0.4rem;">Invitation de ${emuState.nickname}</span>
              <h3 style="margin:0.2rem 0 0.4rem;font:900 1rem var(--display);">Bienvenue Tom ! 🎁 -20 % offerts sur votre 1re visite</h3>
              <p style="margin:0 0 0.7rem;font-size:0.79rem;font-weight:600;">Présentez votre téléphone en caisse pour activer votre offre de bienvenue et récompenser votre parrain.</p>
              ${
                emuState.parrainFriendDone
                  ? `<div class="lc-emu-feedback">🎉 1re visite validée ! Tom profite de <b>-20 %</b> et ${emuState.nickname} vient de recevoir <b>+150 pts</b>.</div>`
                  : `<button type="button" class="lc-emu-primary-btn" id="emu-friend-validate">✅ Valider la 1re visite de Tom</button>`
              }
            </div>
          `
          }
        </div>
      `;
      $$("[data-pv]", screenEl).forEach((b) => {
        b.addEventListener("click", () => {
          emuState.parrainView = b.dataset.pv;
          renderEmulatorPhone(screenEl);
        });
      });
      const sw = $("#emu-parrain-switch", screenEl);
      if (sw) sw.addEventListener("click", () => { emuState.parrainView = "filleul"; renderEmulatorPhone(screenEl); });
      const fv = $("#emu-friend-validate", screenEl);
      if (fv) {
        fv.addEventListener("click", () => {
          emuState.parrainFriendDone = true;
          emuState.parrainRefs += 1;
          emuState.pts += 150;
          emuState.cumul += 150;
          renderEmulatorPhone(screenEl);
        });
      }
      return;
    }

    if (m === "jeux") {
      const presets = C && C.WHEEL_PRESETS ? C.WHEEL_PRESETS : [{ key: "kermesse", label: "Kermesse", style: {} }];
      const p = presets.find((x) => x.key === emuState.gamePresetKey) || presets[0];
      const st = p.style || {};
      screenEl.style.background = `linear-gradient(165deg, ${st.bgFrom || "#4a4238"} 0%, ${st.bgTo || "#211d16"} 100%)`;
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad" style="color:#fff;">
          <div style="text-align:center;">
            <span style="display:inline-block;background:rgba(255,255,255,0.16);border:1.5px solid rgba(255,255,255,0.4);border-radius:999px;padding:0.18rem 0.65rem;font:800 0.68rem var(--body);">${p.label}</span>
            <h3 style="margin:0.25rem 0 0;font:900 1.08rem var(--display);color:#fff;">Tentez votre chance !</h3>
          </div>
          <div id="emu-game-stage" style="background:rgba(255,255,255,0.96);color:#211d16;border:2px solid #211d16;border-radius:18px;padding:0.65rem;box-shadow:3px 3px 0 #211d16;"></div>
          <div id="emu-game-win" class="lc-emu-feedback" hidden></div>
        </div>
      `;
      const stage = $("#emu-game-stage", screenEl);
      const winEl = $("#emu-game-win", screenEl);
      if (stage && GE && typeof GE.createSimulator === "function") {
        emuSimInstance = GE.createSimulator(stage, {
          gameKey: emuState.gameMechKey,
          prize: "Café & Douceur offerts",
          lots: [
            { label: "Café offert", color: "#ffd93d" },
            { label: "-15 %", color: "#5de4b3" },
            { label: "Dessert", color: "#ff7eb6" },
            { label: "Ticket Or", color: "#c4a3ff" },
          ],
          ringColor: st.ringColor || "#211d16",
          pointerColor: st.pointerColor || "#f5793b",
          buttonStyle: {
            background: `linear-gradient(135deg, ${st.buttonFrom || "#f5793b"}, ${st.buttonTo || "#ffd93d"})`,
            color: "#ffffff",
          },
          onWin: (res) => {
            if (winEl) {
              winEl.hidden = false;
              winEl.innerHTML = `🎉 Gagné : <b>${res.prize}</b> · Présentez le code <span class="lc-emu-code-pill">${res.code}</span> en caisse !`;
            }
          },
        });
      }
      return;
    }

    if (m === "pronostics") {
      const comps = C && C.COMPETITIONS ? C.COMPETITIONS : [];
      const comp = comps[emuState.pronoCompIdx] || {
        label: "Ligue des champions",
        icon: "⭐",
        matches: [
          { t1: "Paris SG", flag1: "🔵🔴", s1: 2, t2: "Real Madrid", flag2: "👑⚪", s2: 1 },
          { t1: "Barcelone", flag1: "🔵🔴", s1: 1, t2: "Bayern", flag2: "🔴⚪", s2: 1 },
        ],
      };
      const matches = (comp.matches || []).slice(0, 3);
      while (emuState.pronoScores.length < matches.length) emuState.pronoScores.push([1, 1]);

      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <div>
              <span style="font:800 0.66rem var(--body);color:#8f3107;display:block;">SAISON EN COURS</span>
              <strong style="font:900 0.92rem var(--display);">${comp.icon || "⚽"} ${comp.label}</strong>
            </div>
            <span class="lc-emu-code-pill">#4 ce soir</span>
          </div>

          <div class="lc-emu-tab-row">
            <button type="button" class="lc-emu-tab-btn ${emuState.pronoTab === "grille" ? "active" : ""}" data-ptab="grille">⚽ Grille</button>
            <button type="button" class="lc-emu-tab-btn ${emuState.pronoTab === "classement" ? "active" : ""}" data-ptab="classement">🏆 Classement</button>
          </div>

          ${
            emuState.pronoTab === "grille"
              ? `
            <div style="display:flex;flex-direction:column;gap:0.48rem;">
              ${matches
                .map((mt, idx) => {
                  const sc = emuState.pronoScores[idx] || [mt.s1, mt.s2];
                  return `
                  <div class="lc-emu-white-box" style="padding:0.55rem 0.65rem;">
                    <div style="font:800 0.72rem var(--body);color:#6b5e4b;margin-bottom:0.35rem;">Journée en cours · Coup d’envoi 21h00</div>
                    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:0.4rem;font:800 0.78rem var(--body);">
                      <span>${mt.flag1 || ""} ${mt.t1}</span>
                      <div class="lc-emu-score-step">
                        <button type="button" class="lc-emu-step-btn" data-sc-idx="${idx}" data-sc-side="0" data-sc-delta="-1" aria-label="Baisser score domicile">−</button>
                        <span class="lc-emu-step-val">${sc[0]}</span>
                        <button type="button" class="lc-emu-step-btn" data-sc-idx="${idx}" data-sc-side="0" data-sc-delta="1" aria-label="Monter score domicile">+</button>
                        <span style="font-weight:900;">-</span>
                        <button type="button" class="lc-emu-step-btn" data-sc-idx="${idx}" data-sc-side="1" data-sc-delta="-1" aria-label="Baisser score extérieur">−</button>
                        <span class="lc-emu-step-val">${sc[1]}</span>
                        <button type="button" class="lc-emu-step-btn" data-sc-idx="${idx}" data-sc-side="1" data-sc-delta="1" aria-label="Monter score extérieur">+</button>
                      </div>
                      <span style="text-align:right;">${mt.t2} ${mt.flag2 || ""}</span>
                    </div>
                  </div>`;
                })
                .join("")}
            </div>
            ${
              emuState.pronoSubmitted
                ? `<div class="lc-emu-feedback">✅ Grille validée ! Score exact = +5 pts · Bon vainqueur = +2 pts.<br/>Prochain rappel automatique avant le coup d’envoi.</div>`
                : `<button type="button" class="lc-emu-primary-btn" id="emu-prono-submit">Valider mes pronostics →</button>`
            }
          `
              : `
            <div class="lc-emu-white-box" style="display:flex;flex-direction:column;gap:0.45rem;">
              <div style="display:flex;justify-content:space-between;font:800 0.8rem var(--body);"><span>🥇 1. Tom B.</span><span>48 pts</span></div>
              <div style="display:flex;justify-content:space-between;font:800 0.8rem var(--body);background:#fde9ba;padding:0.25rem 0.4rem;border-radius:8px;"><span>🥈 ${emuState.pronoSubmitted ? "2" : "3"}. Vous (${emuState.nickname})</span><span>${emuState.pronoSubmitted ? "46" : "41"} pts</span></div>
              <div style="display:flex;justify-content:space-between;font:800 0.8rem var(--body);"><span>🥉 3. Sarah K.</span><span>39 pts</span></div>
              <div style="border-top:1px dashed rgba(33,29,22,0.2);padding-top:0.4rem;font-size:0.74rem;font-weight:700;">
                🎁 1er prix saison : Maillot officiel + 100 € offerts
              </div>
            </div>
          `
          }
        </div>
      `;

      $$("[data-ptab]", screenEl).forEach((b) => {
        b.addEventListener("click", () => {
          emuState.pronoTab = b.dataset.ptab;
          renderEmulatorPhone(screenEl);
        });
      });
      $$("[data-sc-idx]", screenEl).forEach((b) => {
        b.addEventListener("click", () => {
          const i = Number(b.dataset.scIdx);
          const s = Number(b.dataset.scSide);
          const d = Number(b.dataset.scDelta);
          emuState.pronoScores[i][s] = Math.max(0, Math.min(9, emuState.pronoScores[i][s] + d));
          renderEmulatorPhone(screenEl);
        });
      });
      const subBtn = $("#emu-prono-submit", screenEl);
      if (subBtn) {
        subBtn.addEventListener("click", () => {
          emuState.pronoSubmitted = true;
          renderEmulatorPhone(screenEl);
        });
      }
      return;
    }

    if (m === "vitrine") {
      const sectors = (C && C.VITRINE_SECTEURS) || {};
      const sec = sectors[emuState.sector] || Object.values(sectors)[0];
      const carte = (sec && sec.cartes && sec.cartes[0]) || { nom: "Notre Carte", rubriques: [] };
      const fiches = (carte.rubriques || []).flatMap((r) => r.fiches || []).slice(0, 3);
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad" style="padding:0;overflow:hidden;">
          <div style="background:${(sec && sec.primary) || "#5C2E14"};color:#fff;padding:0.95rem 0.9rem;">
            <span style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:999px;padding:0.15rem 0.55rem;font:700 0.68rem var(--body);">${(sec && sec.defaultBadge) || "Ouvert aujourd’hui"}</span>
            <h3 style="margin:0.35rem 0 0.15rem;font:900 1.15rem var(--display);color:#fff;">${(sec && sec.icon) || "🍽️"} ${(sec && sec.defaultNom) || "Bistrot L’Étoile"}</h3>
            <p style="margin:0;font-size:0.75rem;opacity:0.95;">${(sec && sec.defaultAccroche) || ""}</p>
          </div>
          <div style="padding:0.78rem;display:flex;flex-direction:column;gap:0.55rem;">
            <strong style="font:800 0.78rem var(--display);text-transform:uppercase;letter-spacing:0.06em;">${(sec && sec.motCartes) || "Nos offres"} · ${carte.nom}</strong>
            ${fiches
              .map(
                (f) => `
              <div class="lc-emu-white-box" style="padding:0.55rem 0.7rem;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.4rem;">
                  <strong style="font:800 0.84rem var(--body);">${f.nom}</strong>
                  <span style="font:900 0.84rem var(--display);color:${(sec && sec.primary) || "#211d16"};">${f.prix}</span>
                </div>
                <p style="margin:0.15rem 0 0;font-size:0.72rem;color:#5a4f40;">${f.description || ""}</p>
              </div>`
              )
              .join("")}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.45rem;margin-top:0.2rem;">
              <button type="button" class="lc-emu-primary-btn" id="emu-v-go-rdv">📅 Réserver 0 %</button>
              <button type="button" class="lc-emu-chip active" id="emu-v-go-jeu" style="padding:0.5rem;">🎡 Jouer au jeu</button>
            </div>
          </div>
        </div>
      `;
      const goRdv = $("#emu-v-go-rdv", screenEl);
      if (goRdv) goRdv.addEventListener("click", () => { emuState.mode = "rdv"; renderEmulator(); });
      const goJeu = $("#emu-v-go-jeu", screenEl);
      if (goJeu) goJeu.addEventListener("click", () => { emuState.mode = "jeux"; renderEmulator(); });
      return;
    }

    if (m === "rdv") {
      const sectors = (C && C.VITRINE_SECTEURS) || {};
      const sec = sectors[emuState.sector] || Object.values(sectors)[0];
      const services = emuState.sector === "coiffeur" || emuState.sector === "spa"
        ? ["Coupe & Coiffage (45 €)", "Soin Détente (58 €)", "Forfait Complet"]
        : ["Table pour 2 personnes", "Table pour 4 personnes", "Table en Terrasse"];
      if (!services.includes(emuState.rdvService)) emuState.rdvService = services[0];

      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <div>
              <span style="font:800 0.66rem var(--body);color:#047857;display:block;">ZÉRO COMMISSION</span>
              <strong style="font:900 0.9rem var(--display);">📅 ${(sec && sec.defaultNom) || "Prendre rendez-vous"}</strong>
            </div>
          </div>

          <div class="lc-emu-white-box">
            <strong style="font:800 0.76rem var(--body);display:block;margin-bottom:0.35rem;">1. Prestation ou table :</strong>
            <div class="lc-emu-theme-grid">
              ${services.map((sv) => `<button type="button" class="lc-emu-chip ${emuState.rdvService === sv ? "active" : ""}" data-rsvc="${sv}">${sv}</button>`).join("")}
            </div>
            <strong style="font:800 0.76rem var(--body);display:block;margin:0.55rem 0 0.35rem;">2. Jour &amp; horaire disponible :</strong>
            <div class="lc-emu-theme-grid" style="margin-bottom:0.35rem;">
              ${["Aujourd’hui", "Demain", "Samedi"].map((d) => `<button type="button" class="lc-emu-chip ${emuState.rdvDay === d ? "active" : ""}" data-rday="${d}">${d}</button>`).join("")}
            </div>
            <div class="lc-emu-theme-grid">
              ${["12h15", "14h30", "19h30", "20h00"].map((sl) => `<button type="button" class="lc-emu-chip ${emuState.rdvSlot === sl ? "active" : ""}" data-rslot="${sl}">${sl}</button>`).join("")}
            </div>
          </div>

          ${
            emuState.rdvConfirmed
              ? `<div class="lc-emu-feedback">✅ <b>Confirmé !</b> ${emuState.rdvService} · <b>${emuState.rdvDay} à ${emuState.rdvSlot}</b><br/>Pass <span class="lc-emu-code-pill">RES-492</span> ajouté à l’agenda client.</div>
                 <button type="button" class="lc-emu-chip" id="emu-rdv-reset">Modifier mon créneau</button>`
              : `<button type="button" class="lc-emu-primary-btn" id="emu-rdv-confirm">Confirmer le créneau (${emuState.rdvSlot}) →</button>`
          }
        </div>
      `;
      $$("[data-rsvc]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.rdvService = b.dataset.rsvc; emuState.rdvConfirmed = false; renderEmulatorPhone(screenEl); }));
      $$("[data-rday]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.rdvDay = b.dataset.rday; emuState.rdvConfirmed = false; renderEmulatorPhone(screenEl); }));
      $$("[data-rslot]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.rdvSlot = b.dataset.rslot; emuState.rdvConfirmed = false; renderEmulatorPhone(screenEl); }));
      const cf = $("#emu-rdv-confirm", screenEl);
      if (cf) cf.addEventListener("click", () => { emuState.rdvConfirmed = true; renderEmulatorPhone(screenEl); });
      const rs = $("#emu-rdv-reset", screenEl);
      if (rs) rs.addEventListener("click", () => { emuState.rdvConfirmed = false; renderEmulatorPhone(screenEl); });
      return;
    }

    if (m === "moments") {
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <strong>⚡ Moments VIP &amp; File</strong>
            <span class="lc-emu-code-pill">${emuState.momentSpots} places</span>
          </div>
          <div class="lc-emu-tab-row">
            <button type="button" class="lc-emu-tab-btn ${emuState.momentView === "atelier" ? "active" : ""}" data-mv="atelier">🥂 Soirée limitée</button>
            <button type="button" class="lc-emu-tab-btn ${emuState.momentView === "file" ? "active" : ""}" data-mv="file">⏳ File d’attente</button>
          </div>
          ${
            emuState.momentView === "atelier"
              ? `
            <div class="lc-emu-solde-panel">
              <strong style="font:900 0.96rem var(--display);">Dégustation Privée de Saison</strong>
              <p style="margin:0.25rem 0;font-size:0.78rem;font-weight:700;">Jeudi · 19h30 · Il reste ${emuState.momentSpots} places sur 12</p>
              <div class="lc-emu-progress-track"><div class="lc-emu-progress-fill" style="width:${Math.round(((12 - emuState.momentSpots) / 12) * 100)}%"></div></div>
            </div>
            ${
              emuState.momentBooked
                ? `<div class="lc-emu-feedback">🎟️ Place VIP réservée ! Code d’entrée : <span class="lc-emu-code-pill">VIP-204</span></div>`
                : `<button type="button" class="lc-emu-primary-btn" id="emu-moment-book">Réserver ma place VIP →</button>`
            }
          `
              : `
            <div class="lc-emu-white-box">
              <strong style="font:900 0.95rem var(--display);">Position en direct : #2 sur la liste</strong>
              <p style="margin:0.35rem 0;font-size:0.78rem;font-weight:600;">Attente estimée : ~8 min · Continuez votre balade, votre téléphone bipe dès que votre table est prête.</p>
              <div class="lc-emu-feedback">📲 Notification prête pour ${emuState.nickname}</div>
            </div>
          `
          }
        </div>
      `;
      $$("[data-mv]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.momentView = b.dataset.mv; renderEmulatorPhone(screenEl); }));
      const bk = $("#emu-moment-book", screenEl);
      if (bk) {
        bk.addEventListener("click", () => {
          if (!emuState.momentBooked) {
            emuState.momentBooked = true;
            emuState.momentSpots = Math.max(1, emuState.momentSpots - 1);
            renderEmulatorPhone(screenEl);
          }
        });
      }
      return;
    }

    if (m === "calendrier") {
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <strong>🗓️ Calendrier Gourmand</strong>
            <span class="lc-emu-code-pill">Jour 4 ouvert</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.45rem;">
            ${[1, 2, 3, 4, 5, 6]
              .map((d) => {
                const isToday = d === 4;
                const done = d < 4 || (isToday && emuState.calDayOpened);
                return `<button type="button" ${isToday ? 'id="emu-cal-today"' : ""} style="border:2px solid #211d16;border-radius:14px;padding:0.65rem 0.3rem;background:${done ? "#5de4b3" : isToday ? "#ffd93d" : "#fff"};font:900 0.85rem var(--display);color:#211d16;cursor:${isToday ? "pointer" : "default"};">
                  Jour ${d}<br/><span style="font-size:1.1rem;">${done ? "✅" : isToday ? "🎁" : "🔒"}</span>
                </button>`;
              })
              .join("")}
          </div>
          ${
            emuState.calDayOpened
              ? `<div class="lc-emu-feedback">🎉 Case du Jour 4 ouverte : <b>+50 pts fidélité + 1 essai bonus</b> ajoutés ! Revenez demain pour le Jour 5.</div>`
              : `<button type="button" class="lc-emu-primary-btn" id="emu-cal-open-btn">🎁 Ouvrir ma case du jour (#4)</button>`
          }
        </div>
      `;
      const openCal = () => { emuState.calDayOpened = true; renderEmulatorPhone(screenEl); };
      if ($("#emu-cal-today", screenEl)) $("#emu-cal-today", screenEl).addEventListener("click", openCal);
      if ($("#emu-cal-open-btn", screenEl)) $("#emu-cal-open-btn", screenEl).addEventListener("click", openCal);
      return;
    }

    if (m === "evenements-live") {
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div style="background:#211d16;color:#ffd93d;border:2px solid #211d16;border-radius:14px;padding:0.6rem 0.75rem;text-align:center;">
            <span style="font:800 0.65rem var(--body);color:#fff;display:block;">📺 DIFFUSÉ SUR ÉCRAN GÉANT EN SALLE</span>
            <strong style="font:900 0.92rem var(--display);">Question 3/10 · 42 joueurs connectés</strong>
          </div>
          <div class="lc-emu-white-box">
            <strong style="font:900 0.9rem var(--display);display:block;margin-bottom:0.5rem;">Quel cocktail maison a fêté ses 10 ans cette semaine ?</strong>
            <div style="display:flex;flex-direction:column;gap:0.4rem;">
              ${["🍹 Le Spritz du Quartier", "🍓 La Menthe Frappée", "🍋 Le Tonic d’Or"].map((opt, idx) => `<button type="button" class="lc-emu-chip ${emuState.liveChoice === idx ? "active" : ""}" data-lch="${idx}" style="text-align:left;padding:0.48rem 0.7rem;">${opt}</button>`).join("")}
            </div>
          </div>
          ${
            emuState.liveChoice >= 0
              ? `<div class="lc-emu-feedback">⚡ Réponse envoyée sur l’écran géant ! Classement de la salle mis à jour.</div>`
              : ""
          }
        </div>
      `;
      $$("[data-lch]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.liveChoice = Number(b.dataset.lch); renderEmulatorPhone(screenEl); }));
      return;
    }

    if (m === "quiz") {
      const qs = [
        { q: "D’où proviennent nos cafés torréfiés chaque matin ?", a: ["Torréfaction locale du quartier", "Importation industrielle"], ok: 0 },
        { q: "Combien de points donne chaque passage au Passeport ?", a: ["100 points automatiques", "10 points seulement"], ok: 0 },
      ];
      const q = qs[emuState.quizStep] || qs[0];
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <strong>❓ Quiz Libre-Service</strong>
            <span class="lc-emu-code-pill">Score ${emuState.quizScore}/2</span>
          </div>
          <div class="lc-emu-white-box">
            <span style="font:800 0.7rem var(--body);color:#8f3107;">Question ${emuState.quizStep + 1} sur 2</span>
            <h3 style="margin:0.25rem 0 0.65rem;font:900 0.95rem var(--display);">${q.q}</h3>
            <div style="display:flex;flex-direction:column;gap:0.42rem;">
              ${q.a.map((txt, i) => `<button type="button" class="lc-emu-chip ${emuState.quizAnswered === i ? "active" : ""}" data-qa="${i}" style="text-align:left;padding:0.5rem 0.7rem;">${txt}</button>`).join("")}
            </div>
          </div>
          ${
            emuState.quizAnswered >= 0
              ? `<div class="lc-emu-feedback">
                  ${emuState.quizAnswered === q.ok ? "✅ Bonne réponse ! +1 point" : "ℹ️ Astuce : la bonne réponse était la 1re !"}
                </div>
                ${emuState.quizStep === 0 ? `<button type="button" class="lc-emu-primary-btn" id="emu-quiz-next">Question suivante →</button>` : `<button type="button" class="lc-emu-primary-btn" id="emu-quiz-reset">↻ Rejouer au Quiz</button>`}`
              : ""
          }
        </div>
      `;
      $$("[data-qa]", screenEl).forEach((b) => {
        b.addEventListener("click", () => {
          if (emuState.quizAnswered >= 0) return;
          const pick = Number(b.dataset.qa);
          emuState.quizAnswered = pick;
          if (pick === q.ok) emuState.quizScore += 1;
          renderEmulatorPhone(screenEl);
        });
      });
      if ($("#emu-quiz-next", screenEl)) $("#emu-quiz-next", screenEl).addEventListener("click", () => { emuState.quizStep = 1; emuState.quizAnswered = -1; renderEmulatorPhone(screenEl); });
      if ($("#emu-quiz-reset", screenEl)) $("#emu-quiz-reset", screenEl).addEventListener("click", () => { emuState.quizStep = 0; emuState.quizAnswered = -1; emuState.quizScore = 0; renderEmulatorPhone(screenEl); });
      return;
    }

    if (m === "chasse-au-qr") {
      const steps = ["1. Vitrine d’entrée", "2. Comptoir principal", "3. Terrasse / Rayon", "4. Coffre Final"];
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <strong>🗺️ Chasse au QR</strong>
            <span class="lc-emu-code-pill">${emuState.huntStep} / 4 étapes</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.45rem;">
            ${steps
              .map((label, i) => {
                const done = i < emuState.huntStep;
                const cur = i === emuState.huntStep;
                return `<div class="lc-emu-white-box" style="display:flex;justify-content:space-between;align-items:center;padding:0.55rem 0.7rem;background:${done ? "#d1fae5" : cur ? "#ffd93d" : "#fff"};">
                  <strong style="font:800 0.82rem var(--body);">${label}</strong>
                  <span>${done ? "✅ Scanné" : cur ? "📍 À scanner" : "🔒"}</span>
                </div>`;
              })
              .join("")}
          </div>
          ${
            emuState.huntStep >= 4
              ? `<div class="lc-emu-feedback">🏆 Parcours bouclé ! Trésor débloqué : <span class="lc-emu-code-pill">TRESOR-QR4</span></div>`
              : `<button type="button" class="lc-emu-primary-btn" id="emu-hunt-scan">📷 Simuler le scan de l’étape ${emuState.huntStep + 1}</button>`
          }
        </div>
      `;
      if ($("#emu-hunt-scan", screenEl)) $("#emu-hunt-scan", screenEl).addEventListener("click", () => { emuState.huntStep = Math.min(4, emuState.huntStep + 1); renderEmulatorPhone(screenEl); });
      return;
    }

    if (m === "duo-miroir") {
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <strong>🪞 Duo Miroir · Salon #DM24</strong>
            <span class="lc-emu-code-pill">2 joueurs</span>
          </div>
          <div class="lc-emu-white-box">
            <strong style="font:900 0.9rem var(--display);display:block;margin-bottom:0.45rem;">Samedi soir chez vous, c’est plutôt…</strong>
            <div style="display:flex;flex-direction:column;gap:0.4rem;">
              <button type="button" class="lc-emu-chip active" id="emu-duo-pick">🥂 Apéro prolongé entre amis</button>
              <button type="button" class="lc-emu-chip" id="emu-duo-pick2">🎬 Soirée tranquille &amp; dessert</button>
            </div>
          </div>
          ${
            emuState.duoDone
              ? `<div class="lc-emu-feedback">🎭 <b>Révélation simultanée : 88 % Raccord !</b><br/>Vous avez tous les deux voté pour l’apéro entre amis !</div>`
              : `<p style="font-size:0.78rem;font-weight:700;margin:0;text-align:center;">Choisissez secrètement puis révélez vos réponses ensemble.</p>`
          }
        </div>
      `;
      [$("#emu-duo-pick", screenEl), $("#emu-duo-pick2", screenEl)].forEach((b) => {
        if (b) b.addEventListener("click", () => { emuState.duoDone = true; renderEmulatorPhone(screenEl); });
      });
      return;
    }

    if (m === "portrait-de-la-bande") {
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <strong>👥 Portrait de la Bande</strong>
            <span class="lc-emu-code-pill">4 joueurs à table</span>
          </div>
          <div class="lc-emu-white-box">
            <strong style="font:900 0.9rem var(--display);display:block;margin-bottom:0.45rem;">Qui met toujours 20 min à choisir sa commande ?</strong>
            <div class="lc-emu-theme-grid">
              ${["Tom", "Lisa", "Sarah", "Max"].map((n) => `<button type="button" class="lc-emu-chip ${emuState.bandeVote === n ? "active" : ""}" data-bv="${n}">${n}</button>`).join("")}
            </div>
          </div>
          ${
            emuState.bandeVote
              ? `<div class="lc-emu-feedback">🗳️ 3 votes reçus ! <b>${emuState.bandeVote}</b> remporte haut la main le titre de <b>« Décideur Éternel »</b> 🏆</div>`
              : `<p style="font-size:0.78rem;font-weight:700;margin:0;text-align:center;">Votez secrètement : le verdict tombe dès que 3 personnes à table ont voté.</p>`
          }
        </div>
      `;
      $$("[data-bv]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.bandeVote = b.dataset.bv; renderEmulatorPhone(screenEl); }));
      return;
    }

    if (m === "ticket-dor") {
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <strong>🎟️ Ticket d’Or</strong>
            <span class="lc-emu-code-pill">Usage unique</span>
          </div>
          <div class="lc-emu-solde-panel" style="text-align:center;">
            <span style="font:800 0.72rem var(--body);text-transform:uppercase;">Une visite d’hier, une bonne raison de revenir</span>
            <h3 style="margin:0.3rem 0;font:900 1.1rem var(--display);">Votre Privilège Prochaine Visite</h3>
          </div>
          ${
            emuState.ticketScratched
              ? `<div class="lc-emu-feedback" style="text-align:center;">✨ <b>Ticket révélé !</b><br/>☕ <b>2e Boisson Offerte dès demain</b><br/>Code caisse unique : <span class="lc-emu-code-pill">TICKET-842</span></div>`
              : `<button type="button" class="lc-emu-primary-btn" id="emu-ticket-open">✨ Gratter / Révéler mon Ticket d’Or →</button>`
          }
        </div>
      `;
      if ($("#emu-ticket-open", screenEl)) $("#emu-ticket-open", screenEl).addEventListener("click", () => { emuState.ticketScratched = true; renderEmulatorPhone(screenEl); });
      return;
    }

    // missions-coffres
    screenEl.innerHTML = `
      <div class="lc-emu-app-pad">
        <div class="lc-emu-app-header">
          <strong>🗝️ Missions &amp; Coffres</strong>
          <span class="lc-emu-code-pill">🔑 ${emuState.missionsDone} / 3 clés</span>
        </div>
        <div class="lc-emu-white-box" style="display:flex;flex-direction:column;gap:0.4rem;">
          <div>✅ 1. Jouer une fois à la roue (Clé obtenue)</div>
          <div>✅ 2. Cumuler 300 pts fidélité (Clé obtenue)</div>
          <div>${emuState.missionsDone >= 3 ? "✅" : "⏳"} 3. Inviter 1 ami au commerce</div>
        </div>
        ${
          emuState.missionsDone >= 3
            ? `<div class="lc-emu-feedback">🎉 <b>3 clés réunies · Coffre Or Ouvert !</b><br/>Privilège débloqué : <span class="lc-emu-code-pill">COFFRE-OR25</span></div>`
            : `<button type="button" class="lc-emu-primary-btn" id="emu-mission-complete">🔑 Valider la 3e mission &amp; Ouvrir le Coffre →</button>`
        }
      </div>
    `;
    if ($("#emu-mission-complete", screenEl)) $("#emu-mission-complete", screenEl).addEventListener("click", () => { emuState.missionsDone = 3; renderEmulatorPhone(screenEl); });
  };

  const renderEmulator = () => {
    const modal = ensureEmulatorModal();
    const meta = EMU_META[emuState.mode] || EMU_META.passeport;

    const kickerEl = $("#lc-emu-kicker", modal);
    const titleEl = $("#lc-emu-title", modal);
    const descEl = $("#lc-emu-desc", modal);
    const pillsEl = $("#lc-emu-mode-pills", modal);
    const ctxEl = $("#lc-emu-context-box", modal);
    const studioLink = $("#lc-emu-studio-link", modal);
    const moduleLink = $("#lc-emu-module-link", modal);
    const phoneScreen = $("#lc-emu-phone-screen", modal);

    if (kickerEl) kickerEl.textContent = meta.kicker;
    if (titleEl) titleEl.textContent = meta.title;
    if (descEl) descEl.textContent = meta.desc;
    if (studioLink) studioLink.setAttribute("href", meta.studioHref);
    if (moduleLink) moduleLink.setAttribute("href", meta.moduleHref);

    if (pillsEl) {
      if (meta.group.length > 1) {
        pillsEl.hidden = false;
        pillsEl.innerHTML = meta.group
          .map((gKey) => `<button type="button" class="lc-emu-mode-pill ${emuState.mode === gKey ? "active" : ""}" data-emu-switch="${gKey}">${GROUP_PILL_LABELS[gKey] || gKey}</button>`)
          .join("");
        $$("[data-emu-switch]", pillsEl).forEach((b) => {
          b.addEventListener("click", () => {
            emuState.mode = b.dataset.emuSwitch;
            renderEmulator();
          });
        });
      } else {
        pillsEl.hidden = true;
        pillsEl.innerHTML = "";
      }
    }

    if (ctxEl) renderEmulatorContextBox(ctxEl);
    if (phoneScreen) renderEmulatorPhone(phoneScreen);
  };

  window.LC_OPEN_EMULATOR = (modeKey) => {
    emuState.mode = EMU_META[modeKey] ? modeKey : "passeport";
    const modal = ensureEmulatorModal();
    modal.hidden = false;
    renderEmulator();
  };

  // Ouverture automatique si l'utilisateur scanne un QR code (?emulate=...)
  try {
    const emuParam = new URLSearchParams(window.location.search).get("emulate");
    if (emuParam && EMU_META[emuParam]) {
      window.LC_OPEN_EMULATOR(emuParam);
    }
  } catch {
    // Ignoré
  }

  /* ── 14. PAGE DÉDIÉE MODULES.HTML — DA DASHBOARD KERMESSE (12 MODULES + MOTION + SYNERGIES) ── */
  const modulesShowcaseEl = $("#k-modules-showcase");
  if (modulesShowcaseEl) {
    const MODULES_CATALOG_12 = [
      {
        id: "jeux-instantanes",
        emoji: "🎡",
        title: "Jeux instantanés",
        surtitre: "MODULE 01 · ACQUISITION & PASSAGE EN CAISSE",
        subtitle: "Attirez les passants, récoltez des avis ou contacts et distribuez vos lots en moins de 15 secondes sur 15 mécaniques ludiques.",
        offerBadge: "✓ Inclus dès Coup d’envoi (29 €/mois)",
        pitchLead: "Transformez n’importe quel moment d’attente ou passage en caisse en un souvenir joyeux. Vous réglez précisément vos lots, leurs quantités et vos probabilités pour maîtriser votre budget au centime près.",
        kpis: [
          { val: "15 mécaniques", lbl: "9 tirages hasard + 6 défis d’adresse" },
          { val: "18 thèmes", lbl: "Kermesse, Bistro, Néon, Noël…" },
          { val: "Zéro appli", lbl: "Ouverture en 1 scan de QR code" },
        ],
        emulateMode: "jeux",
        studioHref: "studio.html?module=roue",
        detailHref: "jeux-pronostics.html",
        detailLabel: "📖 Explorer les 15 jeux",
        steps: [
          { t: "1 · Affichez votre QR code", d: "En vitrine, sur le comptoir, sur vos tickets de caisse ou en terrasse." },
          { t: "2 · Vos clients jouent en 15s", d: "Roue, grattage, machine à sous, réflexe ou coffre aux couleurs de votre enseigne." },
          { t: "3 · Gain affiché en caisse", d: "Le joueur présente son code gain unique pour consommer son lot chez vous." },
        ],
        synergies: [
          { target: "ticket-dor", emoji: "🎟️", name: "Avec Ticket d’Or", why: "Remettez un Ticket d’Or après la partie pour garantir que le client revienne la semaine suivante." },
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Proposez au joueur de sauvegarder son gain directement dans sa carte fidélité mobile." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Le Scan", icon: "📷", title: "Le client scanne sur votre comptoir", text: "Votre chevalet ou affiche QR lance votre univers Kermesse en plein écran.", chips: ["0 téléchargement", "Votre logo & couleurs"] },
          { tag: "Scène 2 · La Partie", icon: "🎡", title: "La roue tourne & fait vibrer l’attente", text: "Hasard ou adresse : suspense maximal avec confettis et lots maîtrisés.", chips: ["Café offert", "-15 % prochain achat"] },
          { tag: "Scène 3 · En Caisse", icon: "🧾", title: "Un nouveau client converti en caisse", text: "Le code gain est validé au comptoir et déclenche un achat supplémentaire.", chips: ["Avis Google +", "Contact vérifié"] },
        ],
      },
      {
        id: "passeport-fidelite",
        emoji: "📔",
        title: "Passeport fidélité",
        surtitre: "MODULE 02 · RÉTENTION & BOUCHE-À-OREILLE",
        subtitle: "La carte de fidélité 100 % sur téléphone : points automatiques, niveaux Bronze/Argent/Or, boutique cadeaux et lien de parrainage.",
        offerBadge: "✓ Inclus dès Le Club (59 €) · Option 19 €/mois",
        pitchLead: "Fini les cartes cartonnées oubliées ou perdues au fond du sac. Vos clients gardent leur Passeport dans Google Wallet ou sur leur écran d’accueil, suivent leurs paliers et reviennent naturellement dépenser leurs points.",
        kpis: [
          { val: "100 pts / visite", lbl: "Validation QR client ou code du jour" },
          { val: "3 niveaux", lbl: "Bronze · Argent · Or sur cumul" },
          { val: "Parrainage inclus", lbl: "+150 pts offerts quand un ami vient" },
        ],
        emulateMode: "passeport",
        studioHref: "studio.html?module=fidelite",
        detailHref: "fidelite-communaute.html",
        detailLabel: "📖 Voir Fidélité & Jackpot",
        steps: [
          { t: "1 · Passage en caisse", d: "Scannez le QR personnel du client ou dictez-lui le code du comptoir." },
          { t: "2 · Solde & niveau montent", d: "Il voit immédiatement ses points grimper sans jamais baisser de statut même en dépensant." },
          { t: "3 · Il parraine ses proches", d: "Son lien personnel invite ses amis pour leur offrir un cadeau de bienvenue chez vous." },
        ],
        synergies: [
          { target: "jackpot-collectif", emoji: "🎰", name: "Avec Jackpot collectif", why: "Chaque passage de fidélité nourrit automatiquement la jauge commune de votre établissement." },
          { target: "calendrier", emoji: "🗓️", name: "Avec Calendrier", why: "Distribuez des points bonus quotidiens dans vos cases pour créer un réflexe hebdomadaire." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Création en 10s", icon: "📔", title: "Un Passeport à vos couleurs", text: "Le client choisit son surnom et enregistre sa carte sur son téléphone.", chips: ["Google Wallet", "Écran d’accueil"] },
          { tag: "Scène 2 · Cumul & Niveaux", icon: "🥇", title: "Il débloque ses paliers cadeaux", text: "200 pts = Café · 500 pts = Dessert : il reste motivé pour revenir.", chips: ["300 pts -> 500 pts", "Statut Or conservé"] },
          { tag: "Scène 3 · Bouche-à-oreille", icon: "🤝", title: "Il invite ses amis dans votre commerce", text: "Dès la 1re visite de son filleul, le parrain reçoit ses points bonus.", chips: ["1 client = 2 clients", "Coût nul"] },
        ],
      },
      {
        id: "calendrier",
        emoji: "🗓️",
        title: "Calendrier",
        surtitre: "MODULE 03 · RENDEZ-VOUS QUOTIDIEN",
        subtitle: "Un calendrier de l’Avent ou des saisons toute l’année : une nouvelle case à ouvrir chaque jour pour faire revenir vos habitués.",
        offerBadge: "✓ Inclus Le Club (59 €) & La Totale (129 €) · Pass 29 €",
        pitchLead: "Créez une attente quotidienne autour de votre enseigne : Noël, soldes d’été, rentrée ou anniversaire. Vos clients installent le calendrier sur leur écran d’accueil et viennent ouvrir la surprise du jour.",
        kpis: [
          { val: "1 à 31 jours", lbl: "Calendrier de saison ou événementiel" },
          { val: "5 ambiances", lbl: "Noël, Printemps, Soldes, Fête…" },
          { val: "Mini-roue intégrée", lbl: "Chaque case peut lancer un tirage" },
        ],
        emulateMode: "calendrier",
        studioHref: "studio.html?module=roue",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Choisissez la durée", d: "7 jours, 14 jours ou un mois complet avec vos récompenses par case." },
          { t: "2 · Un rituel chaque matin", d: "Vos clients ouvrent la case du jour depuis leur écran d’accueil." },
          { t: "3 · Passage régulier", d: "La surprise du jour s’utilise directement chez vous avant minuit ou dans la semaine." },
        ],
        synergies: [
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Offrez +25 ou +50 pts dans certaines cases pour booster la fidélisation." },
          { target: "ticket-dor", emoji: "🎟️", name: "Avec Ticket d’Or", why: "Glissez un Ticket d’Or secret dans la dernière case du mois pour un final mémorable." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Le Rendez-vous", icon: "🗓️", title: "Installé sur l’écran d’accueil", text: "Votre client garde votre icône de calendrier directement sur son téléphone.", chips: ["Rappel doux", "Thème saisonnier"] },
          { tag: "Scène 2 · Case du Jour", icon: "🎁", title: "La case du jour s’illumine", text: "Un tap déverrouille la surprise du matin : gain immédiat ou tour de roue.", chips: ["Case verrouillée", "1 ouverture/jour"] },
          { tag: "Scène 3 · Trafic en Semaine", icon: "🛍️", title: "Des visites même les jours calmes", text: "Faites venir vos clients le mardi ou mercredi avec des lots ciblés.", chips: ["Mardis boostés", "Fidélité active"] },
        ],
      },
      {
        id: "evenements-live",
        emoji: "🎤",
        title: "Événements live",
        surtitre: "MODULE 04 · SOIRÉES & ÉCRAN GÉANT",
        subtitle: "Transformez votre salle, bar ou événement en plateau télé : les questions s’affichent en grand et toute la salle joue en direct sur son téléphone.",
        offerBadge: "✓ Inclus Le Grand Jeu (89 €) & La Totale · Pass Soirée 19 €",
        pitchLead: "Idéal pour animer une soirée à thème, un afterwork, un match ou une inauguration. Pendant que vous projetez l’écran géant (TV ou vidéoprojecteur), chaque table répond en même temps sur son téléphone avec classement en direct.",
        kpis: [
          { val: "Jusqu’à 250", lbl: "Joueurs simultanés dans la salle" },
          { val: "Écran Géant", lbl: "Vue animateur & tableau des scores live" },
          { val: "Zéro micro requis", lbl: "Tout se pilote depuis votre tablette" },
        ],
        emulateMode: "evenements-live",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Branchez votre TV", d: "Ouvrez le mode Écran Géant sur la télévision de votre établissement." },
          { t: "2 · Tout le monde scanne", d: "Vos tables rejoignent la partie avec le QR code projeté en 5 secondes." },
          { t: "3 · Ambiance & podium", d: "Révélations animées question après question et remise des prix au podium !" },
        ],
        synergies: [
          { target: "quiz", emoji: "❓", name: "Avec Quiz", why: "Préparez vos questionnaires maison puis jouez-les soit au calme, soit en version grand show live." },
          { target: "pronostics", emoji: "🏆", name: "Avec Pronostics", why: "Animez la mi-temps des soirs de match sur votre écran entre deux pronostics." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Projection TV", icon: "📺", title: "L’écran géant s’allume en salle", text: "Le code de la soirée et la liste des pseudos apparaissent en direct.", chips: ["Bar · Resto · Salle", "Mode TV Kermesse"] },
          { tag: "Scène 2 · Buzzer Téléphone", icon: "🎤", title: "Toute la salle répond en rythme", text: "Chronomètre partagé : les plus rapides marquent le maximum de points.", chips: ["42 joueurs en direct", "Effets confettis"] },
          { tag: "Scène 3 · Consommation", icon: "🍻", title: "Des soirées remplies qui restent tard", text: "Vos groupes prolongent la soirée autour du classement de fin de manche.", chips: ["Podium Top 3", "Ticket moyen +"] },
        ],
      },
      {
        id: "pronostics",
        emoji: "🏆",
        title: "Pronostics",
        surtitre: "MODULE 05 · SAISONS SPORTIVES & MATCHS",
        subtitle: "Faites pronostiquer les grandes compétitions et championnats toute l’année avec classement, rappels et lots par journée ou fin de saison.",
        offerBadge: "✓ Inclus Le Grand Jeu (89 €) & La Totale · Option 39 €/mois",
        pitchLead: "Ligue des champions, Ligue 1, Top 14, Coupe du monde ou tournoi local : vos clients remplissent leur grille avant les matchs et reviennent regarder le classement dans votre établissement à chaque journée.",
        kpis: [
          { val: "Grille hebdo", lbl: "Verrouillage automatique au coup d’envoi" },
          { val: "Classement live", lbl: "Podium par journée et sur la saison" },
          { val: "TV dédiée", lbl: "Affichage grand écran dans votre salle" },
        ],
        emulateMode: "pronostics",
        studioHref: "studio.html?module=pronostics",
        detailHref: "jeux-pronostics.html#pronostics-championnats",
        detailLabel: "📖 Voir les compétitions",
        steps: [
          { t: "1 · Sélectionnez vos matchs", d: "Choisissez le championnat prêt à l’emploi ou ajoutez vos propres affiches." },
          { t: "2 · Scores avant le coup d’envoi", d: "Dès qu’un match démarre, le score est figé automatiquement pour éviter toute triche." },
          { t: "3 · Podium & retours", d: "Les meilleurs pronostiqueurs viennent chercher leurs lots pendant la saison." },
        ],
        synergies: [
          { target: "jackpot-collectif", emoji: "🎰", name: "Avec Jackpot collectif", why: "Faites grossir la cagnotte commune à chaque journée pronostiquée par vos supporters." },
          { target: "evenements-live", emoji: "🎤", name: "Avec Événements live", why: "Faites un mini-quiz avant-match pendant que les derniers joueurs remplissent leur grille." },
        ],
        motionScenes: [
          { tag: "Scène 1 · La Grille", icon: "⚽", title: "Le client saisit ses scores du week-end", text: "Score exact ou bon vainqueur : saisie ultra-rapide sur mobile avant le coup d’envoi.", chips: ["LDC · Ligue 1 · Top 14", "Verrou auto"] },
          { tag: "Scène 2 · Classement", icon: "🏆", title: "Il suit sa place dans le classement", text: "Motivation durable sur toute la saison entre collègues et habitués.", chips: ["Top 3 récompensé", "Vue TV en salle"] },
          { tag: "Scène 3 · Soir de Match", icon: "🍕", title: "Votre salle se remplit pour les affiches", text: "Les participants viennent suivre les matchs ensemble pour fêter leurs points.", chips: ["Tables réservées", "Clients réguliers"] },
        ],
      },
      {
        id: "jackpot-collectif",
        emoji: "🎰",
        title: "Jackpot collectif",
        surtitre: "MODULE 06 · OBJECTIF COMMUNAUTAIRE",
        subtitle: "Un objectif partagé par toute votre clientèle : quand la jauge commune atteint 100 %, un tirage au sort désigne le grand gagnant !",
        offerBadge: "✓ Inclus Le Grand Jeu (89 €) & La Totale · Option 29 €/mois",
        pitchLead: "Contrairement à une loterie individuelle, le Jackpot Collectif unit vos clients autour d’un but commun : « Plus nous sommes nombreux à venir, plus vite le gros lot tombe ». L’effet d’entraînement viral est immédiat.",
        kpis: [
          { val: "Jauge commune", lbl: "Visible par tous en temps réel (ex: 47/50)" },
          { val: "Tirage juste", lbl: "Déclenchement automatique à 100 %" },
          { val: "Effet viral", lbl: "Vos clients motivent leurs amis à scanner" },
        ],
        emulateMode: "jackpot",
        studioHref: "studio.html?module=fidelite",
        detailHref: "fidelite-communaute.html",
        detailLabel: "📖 Voir Fidélité & Jackpot",
        steps: [
          { t: "1 · Fixez le palier & le lot", d: "Par exemple 50 participations pour gagner un bon d’achat ou un dîner pour deux." },
          { t: "2 · La jauge grimpe ensemble", d: "Chaque scan ajoute +1 à la jauge visible dans votre vitrine et sur mobile." },
          { t: "3 · Le tirage déclenche la fête", d: "À 50/50, l’heureux gagnant est tiré au sort parmi tous les participants !" },
        ],
        synergies: [
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Reliez le Jackpot directement aux cartes fidélité : chaque passage fait avancer deux compteurs d’un coup." },
          { target: "jeux-instantanes", emoji: "🎡", name: "Avec Jeux instantanés", why: "Chaque partie de roue contribue au compteur collectif de la semaine." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Jauge à 88 %", icon: "📊", title: "Toute votre communauté suit la barre", text: "Plus que quelques passages : vos clients regardent la jauge sur leur téléphone.", chips: ["47 / 50 passages", "Lot phare en vue"] },
          { tag: "Scène 2 · Déblocage 50/50", icon: "🎰", title: "Le 50e client déclenche le tirage !", text: "Explosion de confettis et sélection transparente parmi les participants.", chips: ["100 % atteint !", "Tirage automatique"] },
          { tag: "Scène 3 · Nouveau Cycle", icon: "🚀", title: "La cagnotte repart immédiatement", text: "Tout le quartier en parle et revient lancer le cycle suivant.", chips: ["Buzz local", "Rétention continue"] },
        ],
      },
      {
        id: "quiz",
        emoji: "❓",
        title: "Quiz",
        surtitre: "MODULE 07 · CULTURE & SAVOIR-FAIRE",
        subtitle: "Un quiz libre-service aux couleurs de votre métier avec correction instantanée, classement et lot de récompense.",
        offerBadge: "✓ Inclus Le Club (59 €) & La Totale (129 €) · Option 15 €/mois",
        pitchLead: "Faites découvrir vos coulisses, vos terroirs, l’histoire de votre salon ou vos nouveautés produits de façon ludique. Le client joue seul en autonomie, apprend des anecdotes et repart avec un code privilège.",
        kpis: [
          { val: "6 ambiances", lbl: "Resto, Cave, Musée, Boutique, Sport…" },
          { val: "Correction instant", lbl: "Explication fun après chaque question" },
          { val: "3 modes de gain", lbl: "Lot immédiat, classement ou tirage" },
        ],
        emulateMode: "quiz",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · 3 à 10 questions rapides", d: "Parlez de vos produits phares, de votre quartier ou de thèmes fun." },
          { t: "2 · Vos clients jouent à table", d: "Correction directe après chaque clic : on apprend en s’amusant." },
          { t: "3 · Tour de roue bonus", d: "Selon votre choix, un bon score débloque un cadeau ou inscrit au tirage." },
        ],
        synergies: [
          { target: "jeux-instantanes", emoji: "🎡", name: "Avec Jeux instantanés", why: "Faites tourner la roue de récompense uniquement aux joueurs qui réussissent votre quiz." },
          { target: "evenements-live", emoji: "🎤", name: "Avec Événements live", why: "Passez votre quiz sur grand écran le vendredi soir pour en faire un tournoi en salle !" },
        ],
        motionScenes: [
          { tag: "Scène 1 · La Question", icon: "❓", title: "Le client découvre votre savoir-faire", text: "Interface carton fluide avec timer optionnel et choix multiples clairs.", chips: ["Votre marque", "30s à 1 min"] },
          { tag: "Scène 2 · L’Anecdote", icon: "💡", title: "Correction fun & valorisante", text: "Révélez un secret de fabrication qui donne envie de commander votre produit phare.", chips: ["Pédagogie douce", "+ de valeur perçue"] },
          { tag: "Scène 3 · La Récompense", icon: "🎁", title: "Score enregistré & lot débloqué", text: "Accès direct au classement ou tour de roue en caisse.", chips: ["Code cadeau", "Podium clients"] },
        ],
      },
      {
        id: "chasse-au-qr",
        emoji: "🗺️",
        title: "Chasse au QR",
        surtitre: "MODULE 08 · PARCOURS PHYSIQUE MULTI-ÉTAPES",
        subtitle: "Faites parcourir votre boutique, terrasse, domaine ou rue commerçante étape par étape grâce à plusieurs QR codes jusqu’au trésor final.",
        offerBadge: "✓ Inclus dès Sur Place (79 €) & La Totale · Option 29 €/mois",
        pitchLead: "Parfait pour orienter le flux vers un recoin peu fréquenté, faire découvrir toute votre carte ou animer une rue commerçante entre plusieurs boutiques partenaires. Le client collecte 2 à 10 étapes pour ouvrir son trésor.",
        kpis: [
          { val: "2 à 10 étapes", lbl: "Parcours libre ou dans l’ordre strict" },
          { val: "Indices visuels", lbl: "Guide ludique de l’étape suivante" },
          { val: "Trésor final", lbl: "Code unique validé en caisse au bout" },
        ],
        emulateMode: "chasse-au-qr",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Placez 2 à 10 QR codes", d: "À l’entrée, près de vos nouveautés, en terrasse ou chez des voisins partenaires." },
          { t: "2 · Le client coche sa carte", d: "Chaque scan allume une étape réussie et dévoile l’indice du point suivant." },
          { t: "3 · Le coffre final s’ouvre", d: "Une fois toutes les balises trouvées, le code trésor se déverrouille." },
        ],
        synergies: [
          { target: "missions-coffres", emoji: "🗝️", name: "Avec Missions & coffres", why: "Transformez la Chasse au QR réussie en clé d’or vers les coffres cadeaux du commerce." },
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Chaque participant obtient sa carte fidélité à la fin du parcours." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Départ", icon: "🗺️", title: "Carte interactive avec étapes numérotées", text: "Le visiteur scanne la balise #1 et lance son carnet de route.", chips: ["Zéro appli", "Parcours balisé"] },
          { tag: "Scène 2 · Exploration", icon: "📍", title: "Il parcourt tout votre espace", text: "Découverte naturelle de vos zones clés et produits méconnus.", chips: ["Rayons mis en avant", "Indices fun"] },
          { tag: "Scène 3 · Coffre au Trésor", icon: "🏆", title: "Dernière balise scannée -> Cadeau !", text: "Code trésor présenté au comptoir avec sourire garanti.", chips: ["Trafic rayon +40%", "Souvenir mémorable"] },
        ],
      },
      {
        id: "duo-miroir",
        emoji: "🪞",
        title: "Duo Miroir",
        surtitre: "MODULE 09 · JEU COMPLICE À 2 JOUEURS",
        subtitle: "Brise-glace fun pour deux personnes (couple, amis, collègues) : chacun répond en secret et la carte révèle votre compatibilité à table.",
        offerBadge: "✓ Inclus dans les 5 formules (ou 12 €/mois seul)",
        pitchLead: "Occupe agréablement l’attente entre deux plats ou pendant un soin. Pas de lots coûteux nécessaires : vous animez naturellement vos tables pour deux et créez des éclats de rire et de belles photos partagées.",
        kpis: [
          { val: "2 joueurs", lbl: "Chacun sur son téléphone en 10 sec" },
          { val: "Réponses scellées", lbl: "Révélation simultanée des deux avis" },
          { val: "0 budget lot", lbl: "100 % convivialité incluse dans le socle" },
        ],
        emulateMode: "duo-miroir",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Un code salle partagé", d: "Joueur 1 scanne, Joueur 2 rejoint la même partie avec le petit code à 4 lettres." },
          { t: "2 · Votes en secret", d: "Ils répondent discrètement aux questions complices sur leurs habitudes." },
          { t: "3 · Verdict & fou rire", d: "L’écran affiche votre niveau de raccord et un surnom humoristique de duo !" },
        ],
        synergies: [
          { target: "portrait-de-la-bande", emoji: "👥", name: "Avec Portrait de la Bande", why: "Si un groupe s’agrandit de 2 à 6 personnes, ils passent sur la version tablée !" },
          { target: "ticket-dor", emoji: "🎟️", name: "Avec Ticket d’Or", why: "Récompensez les meilleurs duos à l’addition avec une invitation pour revenir ensemble." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Le Salon à 2", icon: "📱", title: "Deux téléphones reliés en 3 secondes", text: "Posez un petit chevalet sur les tables de deux personnes.", chips: ["Salon #DM24", "Sans inscription"] },
          { tag: "Scène 2 · Choix Caché", icon: "🪞", title: "Chacun répond de son côté", text: "Personne ne peut copier : les réponses restent masquées jusqu’au bout.", chips: ["Questions décalées", "Attente enchantée"] },
          { tag: "Scène 3 · Révélation", icon: "🎭", title: "Score de complicité dévoilé", text: "Des conversations animées et des avis 5 étoiles sur l’accueil !", chips: ["88 % Raccord", "Moment partagé"] },
        ],
      },
      {
        id: "portrait-de-la-bande",
        emoji: "👥",
        title: "Portrait de la Bande",
        surtitre: "MODULE 10 · TABLES & GROUPES (2 À 12 JOUEURS)",
        subtitle: "Le jeu d’ambiance qui fait voter toute la tablée sur des titres décalés : dès 3 votes sur une question, les portraits s’affichent !",
        offerBadge: "✓ Inclus dans les 5 formules (ou 12 €/mois seul)",
        pitchLead: "Conçu pour vos grandes tablées entre amis, familles ou collègues d’afterwork. Chacun nomme secrètement qui dans le groupe correspond le mieux à chaque portrait, déclenchant débats amicaux et commandes tournées.",
        kpis: [
          { val: "2 à 12 joueurs", lbl: "Idéal grandes tables & afterworks" },
          { val: "Seuil 3 votes", lbl: "Révélation fluide dès que 3 ont voté" },
          { val: "0 coût matière", lbl: "Animation pure sans pression sur vos marges" },
        ],
        emulateMode: "portrait-de-la-bande",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · La table rejoint le salon", d: "Un premier client ouvre la salle et partage le lien aux convives." },
          { t: "2 · Tout le monde vote", d: "« Qui choisit toujours le plus long ? », « Qui oublie toujours sa veste ? »" },
          { t: "3 · Trophées de la bande", d: "La table découvre les gagnants et immortalise la soirée !" },
        ],
        synergies: [
          { target: "duo-miroir", emoji: "🪞", name: "Avec Duo Miroir", why: "Complément parfait : Duo pour les couples, Bande pour les grandes tables d’amis." },
          { target: "evenements-live", emoji: "🎤", name: "Avec Événements live", why: "Lancez Portrait de la Bande en apéritif avant le grand quiz sur écran géant !" },
        ],
        motionScenes: [
          { tag: "Scène 1 · Grande Tablée", icon: "👥", title: "De 3 à 12 amis sur le même salon", text: "Tout le groupe joue autour d’un apéritif sans matériel à distribuer.", chips: ["6 prénoms", "3s pour rejoindre"] },
          { tag: "Scène 2 · Votes Secrets", icon: "🗳️", title: "Chacun désigne secrètement le champion", text: "Les scrutins se remplissent discrètement sous la table.", chips: ["Fous rires", "Questions variées"] },
          { tag: "Scène 3 · Couronnement", icon: "🏆", title: "Le titre est attribué en direct", text: "Votre établissement devient le QG officiel de leurs soirées.", chips: ["Souvenir groupe", "Nouvelles visites"] },
        ],
      },
      {
        id: "ticket-dor",
        emoji: "🎟️",
        title: "Ticket d’Or",
        surtitre: "MODULE 11 · GARANTIR LA PROCHAINE VISITE",
        subtitle: "« Une visite d’hier, une bonne raison de revenir » : le ticket doré à gratter remis après encaissement, valable uniquement dès la visite suivante.",
        offerBadge: "✓ Inclus dans les 5 formules (socle commercial)",
        pitchLead: "Beaucoup de commerces donnent une remise sur place… sans revoir le client ensuite. Le Ticket d’Or se remet quand le client règle son addition pour verrouiller son passage suivant avec un privilège à usage unique.",
        kpis: [
          { val: "Prochaine visite", lbl: "Conçu pour déclencher le 2e passage" },
          { val: "1 usage strict", lbl: "Code serveur unique impossible à copier" },
          { val: "Gros lots malins", lbl: "Recommandé pour cadeaux > 20 €" },
        ],
        emulateMode: "ticket-dor",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Remettez le lien / QR", d: "Imprimez le QR au comptoir ou remettez le ticket numérique au départ du client." },
          { t: "2 · Il gratte chez lui ou demain", d: "Suspense excitant qui révèle son cadeau réservé à sa prochaine venue." },
          { t: "3 · Il revient l’utiliser", d: "Il présente son code TICKET unique lors d’une nouvelle commande payante." },
        ],
        synergies: [
          { target: "jeux-instantanes", emoji: "🎡", name: "Avec Jeux instantanés", why: "Après une première partie en salle, donnez-lui un Ticket d’Or pour activer son prochain retour." },
          { target: "missions-coffres", emoji: "🗝️", name: "Avec Missions & coffres", why: "Utiliser son Ticket d’Or complète une mission fidélité ! " },
        ],
        motionScenes: [
          { tag: "Scène 1 · Départ Caisse", icon: "🎟️", title: "Remis avec le sourire à l’addition", text: "Un petit geste VIP qui distingue tout de suite votre établissement.", chips: ["Lien unique", "Prêt en 2 clics"] },
          { tag: "Scène 2 · La Découverte", icon: "✨", title: "Le film doré se révèle sur mobile", text: "Boisson, entrée ou -20 % : le cadeau attend déjà la prochaine visite.", chips: ["TICKET-842", "Usage unique"] },
          { tag: "Scène 3 · Le Retour", icon: "🔁", title: "Le client revient consommer", text: "Il ne perd pas son cadeau et ramène souvent quelqu’un avec lui.", chips: ["Visite #2 assurée", "Panier rentabilisé"] },
        ],
      },
      {
        id: "missions-coffres",
        emoji: "🗝️",
        title: "Missions & coffres",
        surtitre: "MODULE 12 · PROGRESSION & QUÊTES AUTOMATIQUES",
        subtitle: "Relie tous vos modules entre eux : vos clients accomplissent des missions naturelles, gagnent des clés dorées et ouvrent de vrais coffres.",
        offerBadge: "✓ Inclus automatiquement (aucun supplément requis)",
        pitchLead: "Pas besoin de paramétrer une usine à gaz : chaque fois qu’un client utilise vos jeux, votre passeport, vos pronostics ou vos quiz, ses quêtes avancent toutes seules jusqu’aux clés ouvrant des coffres privilèges.",
        kpis: [
          { val: "100 % auto", lbl: "Avance tout seul selon vos expériences" },
          { val: "Clés & Coffres", lbl: "Des paliers motivants façon jeu vidéo" },
          { val: "Zéro surcoût", lbl: "Active automatiquement ce que vous avez" },
        ],
        emulateMode: "missions-coffres",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Vos modules tournent", d: "Vos clients jouent à la roue, complètent une chasse ou cumulent des points." },
          { t: "2 · Les clés se gagnent", d: "Chaque action validée rapproche du nombre de clés requis." },
          { t: "3 · Ouverture du Coffre", d: "Le client déverrouille son coffre cadeau et en profite chez vous !" },
        ],
        synergies: [
          { target: "chasse-au-qr", emoji: "🗺️", name: "Avec Chasse au QR", why: "Boucler un parcours donne automatiquement une clé précieuse." },
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Les deux fonctionnent main dans la main pour garder vos meilleurs clients engagés." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Les Quêtes", icon: "📋", title: "Tableau de bord clair pour le client", text: "Il voit immédiatement ce qui lui reste à faire pour obtenir la clé suivante.", chips: ["2 / 3 clés", "Barre claire"] },
          { tag: "Scène 2 · Clé Obtenue", icon: "🗝️", title: "Un passage ou jeu valide la 3e clé", text: "Effet satisfaisant qui récompense sa fidélité multi-activités.", chips: ["3 clés réunies !", "Progression cross-jeu"] },
          { tag: "Scène 3 · Coffre Ouvert", icon: "🧰", title: "Le coffre Or libère son privilège", text: "Votre client profite d’un lot mémorable qui le rattache à votre enseigne.", chips: ["COFFRE-OR25", "Engagement record"] },
        ],
      },
    ];

    const navButtons = $$(".k-dash-nav-item", modulesShowcaseEl);
    const mobileGrid = $("#k-dash-mobile-grid", modulesShowcaseEl);
    const mobileNavDetails = $("#k-dash-mobile-nav", modulesShowcaseEl);
    const mobileLabel = $("#k-dash-mobile-label", modulesShowcaseEl);

    if (mobileGrid) {
      mobileGrid.innerHTML = MODULES_CATALOG_12.map(
        (mod) => `<button type="button" class="k-dash-nav-item" data-mobile-mod="${mod.id}"><span class="k-dash-nav-emoji" aria-hidden="true">${mod.emoji}</span><span>${mod.title}</span></button>`
      ).join("");
    }

    let currentModId = "jeux-instantanes";
    let motionStepIdx = 0;
    let motionPlaying = true;
    let motionTimer = null;

    const getModById = (id) => MODULES_CATALOG_12.find((x) => x.id === id) || MODULES_CATALOG_12[0];

    const renderMotionScene = (mod) => {
      const stage = $("#mod-motion-stage", modulesShowcaseEl);
      if (!stage) return;
      const scenes = mod.motionScenes || [];
      const sc = scenes[motionStepIdx] || scenes[0];
      stage.innerHTML = `
        <div class="k-motion-scene-visual">
          <div class="k-motion-icon-orb" aria-hidden="true">${sc.icon}</div>
          <div class="k-motion-scene-body">
            <span class="k-motion-scene-tag">${sc.tag}</span>
            <h3 class="k-motion-scene-title">${sc.title}</h3>
            <p class="k-motion-scene-text">${sc.text}</p>
          </div>
        </div>
        <div class="k-motion-preview-chip-row">
          ${(sc.chips || []).map((c) => `<span class="k-motion-preview-chip">✓ ${c}</span>`).join("")}
        </div>
        <div class="k-motion-progress-dots" aria-hidden="true">
          ${[0, 1, 2].map((i) => `<span class="k-motion-dot-bar ${i === motionStepIdx ? "active" : ""}"></span>`).join("")}
        </div>
      `;
      $$("[data-motion-step]", modulesShowcaseEl).forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.motionStep) === motionStepIdx);
      });
    };

    const restartMotionLoop = () => {
      if (motionTimer) clearInterval(motionTimer);
      if (!motionPlaying) return;
      motionTimer = setInterval(() => {
        motionStepIdx = (motionStepIdx + 1) % 3;
        renderMotionScene(getModById(currentModId));
      }, 4200);
    };

    const renderModulePage = (modId, pushUrl = false) => {
      const mod = getModById(modId);
      currentModId = mod.id;
      motionStepIdx = 0;

      navButtons.forEach((b) => b.classList.toggle("active", b.dataset.moduleId === mod.id));
      if (mobileGrid) {
        $$("[data-mobile-mod]", mobileGrid).forEach((b) => b.classList.toggle("active", b.dataset.mobileMod === mod.id));
      }
      if (mobileLabel) mobileLabel.textContent = `${mod.emoji} ${mod.title}`;
      if (mobileNavDetails) mobileNavDetails.open = false;

      const surtitre = $("#mod-surtitre", modulesShowcaseEl);
      const title = $("#mod-title", modulesShowcaseEl);
      const subtitle = $("#mod-subtitle", modulesShowcaseEl);
      const badge = $("#mod-offer-badge", modulesShowcaseEl);
      const pitchLead = $("#mod-pitch-lead", modulesShowcaseEl);
      const kpisRow = $("#mod-kpis-row", modulesShowcaseEl);
      const emulateBtn = $("#mod-emulate-btn", modulesShowcaseEl);
      const studioLink = $("#mod-studio-link", modulesShowcaseEl);
      const detailLink = $("#mod-detail-link", modulesShowcaseEl);
      const stepsGrid = $("#mod-steps-grid", modulesShowcaseEl);
      const synGrid = $("#mod-synergies-grid", modulesShowcaseEl);

      if (surtitre) surtitre.textContent = mod.surtitre;
      if (title) title.textContent = `${mod.emoji} ${mod.title}`;
      if (subtitle) subtitle.textContent = mod.subtitle;
      if (badge) badge.textContent = mod.offerBadge;
      if (pitchLead) pitchLead.textContent = mod.pitchLead;
      if (studioLink) studioLink.setAttribute("href", mod.studioHref);

      if (detailLink) {
        if (mod.detailHref) {
          detailLink.hidden = false;
          detailLink.setAttribute("href", mod.detailHref);
          detailLink.textContent = mod.detailLabel || "📖 En savoir plus";
        } else {
          detailLink.hidden = true;
        }
      }

      if (emulateBtn) {
        emulateBtn.dataset.emulateTarget = mod.emulateMode;
      }

      if (kpisRow) {
        kpisRow.innerHTML = mod.kpis
          .map((k) => `<div class="k-dash-kpi-tile"><span class="k-dash-kpi-val">${k.val}</span><span class="k-dash-kpi-lbl">${k.lbl}</span></div>`)
          .join("");
      }

      if (stepsGrid) {
        stepsGrid.innerHTML = mod.steps
          .map((s, idx) => `<div class="k-dash-step-box"><span class="k-dash-step-num">ÉTAPE 0${idx + 1}</span><h3>${s.t}</h3><p>${s.d}</p></div>`)
          .join("");
      }

      if (synGrid) {
        synGrid.innerHTML = mod.synergies
          .map(
            (syn) => `
          <button type="button" class="k-dash-synergy-btn" data-jump-mod="${syn.target}">
            <span class="k-dash-synergy-head"><span>${syn.emoji} ${syn.name}</span><span aria-hidden="true">Explorer →</span></span>
            <span class="k-dash-synergy-why">${syn.why}</span>
          </button>`
          )
          .join("");
        $$("[data-jump-mod]", synGrid).forEach((jb) => {
          jb.addEventListener("click", () => {
            renderModulePage(jb.dataset.jumpMod, true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
        });
      }

      renderMotionScene(mod);
      restartMotionLoop();

      if (pushUrl) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("m", mod.id);
          window.history.pushState({ m: mod.id }, "", url.toString());
        } catch {
          // Ignoré
        }
      }
    };

    navButtons.forEach((b) => {
      b.addEventListener("click", () => renderModulePage(b.dataset.moduleId, true));
    });
    if (mobileGrid) {
      $$("[data-mobile-mod]", mobileGrid).forEach((b) => {
        b.addEventListener("click", () => renderModulePage(b.dataset.mobileMod, true));
      });
    }

    const modEmulateBtn = $("#mod-emulate-btn", modulesShowcaseEl);
    if (modEmulateBtn) {
      modEmulateBtn.addEventListener("click", () => {
        const mod = getModById(currentModId);
        if (typeof window.LC_OPEN_EMULATOR === "function") {
          window.LC_OPEN_EMULATOR(mod.emulateMode);
        }
      });
    }

    $$("[data-motion-step]", modulesShowcaseEl).forEach((b) => {
      b.addEventListener("click", () => {
        motionStepIdx = Number(b.dataset.motionStep) || 0;
        renderMotionScene(getModById(currentModId));
        restartMotionLoop();
      });
    });

    const toggleMotionBtn = $("#mod-motion-toggle", modulesShowcaseEl);
    if (toggleMotionBtn) {
      toggleMotionBtn.addEventListener("click", () => {
        motionPlaying = !motionPlaying;
        toggleMotionBtn.textContent = motionPlaying ? "⏸️" : "▶️";
        toggleMotionBtn.setAttribute("aria-label", motionPlaying ? "Mettre en pause l’animation" : "Relancer l’animation");
        restartMotionLoop();
      });
    }

    window.addEventListener("popstate", () => {
      try {
        const m = new URLSearchParams(window.location.search).get("m");
        if (m) renderModulePage(m, false);
      } catch {
        // Ignoré
      }
    });

    try {
      const initialMod = new URLSearchParams(window.location.search).get("m") || "jeux-instantanes";
      renderModulePage(initialMod, false);
    } catch {
      renderModulePage("jeux-instantanes", false);
    }
  }
})();
