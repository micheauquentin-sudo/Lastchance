/* eslint-disable @next/next/no-location-assign-relative-destination */
/* ============================================================
   SITE FINAL 20K (H) — SIMPLE COMME QR
   Accueille l'interactivité de index.html ET de vitrine-reservation.html
   Source unique des prix et formules : ../shared/offre.js (window.LC_OFFRE)
   ============================================================ */
(function () {
  const O = window.LC_OFFRE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  /* ── 2. DÉMONSTRATION DU PARCOURS (« 1. ILS SCANNENT · 2. ILS JOUENT · 3. ILS GAGNENT ») ── */
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
        if (isPlaying && isInViewport) {
          nextMotionStep();
        }
      }, 4500);
    };

    const stopMotionLoop = () => {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    let isInViewport = false;
    let hasEnteredOnce = false;

    stepBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const step = Number(b.dataset.step);
        isInViewport = true;
        hasEnteredOnce = true;
        setMotionStep(step);
        startMotionLoop();
      });
    });

    if (mPlayPauseBtn) {
      mPlayPauseBtn.addEventListener("click", () => {
        isPlaying = !isPlaying;
        mPlayPauseBtn.textContent = isPlaying ? "⏸️ Pause" : "▶ Lecture";
        if (isPlaying && !timerId) startMotionLoop();
      });
    }

    if (storyTrigger) {
      storyTrigger.addEventListener("click", () => {
        isInViewport = true;
        hasEnteredOnce = true;
        setMotionStep(1);
        isPlaying = true;
        if (mPlayPauseBtn) mPlayPauseBtn.textContent = "⏸️ Pause";
        startMotionLoop();
      });
    }

    // Ne démarre l'animation qu'au moment où le visiteur arrive sur #parcours
    setMotionStep(1);
    if (typeof IntersectionObserver === "function") {
      const motionIo = new IntersectionObserver(
        (entries) => {
          const visible = Boolean(entries[0]?.isIntersecting);
          isInViewport = visible;
          if (visible) {
            if (!hasEnteredOnce) {
              hasEnteredOnce = true;
              setMotionStep(1);
            }
            if (isPlaying && !timerId) startMotionLoop();
          } else {
            stopMotionLoop();
          }
        },
        { threshold: 0.32 },
      );
      motionIo.observe(motionStage);
    } else {
      isInViewport = true;
      startMotionLoop();
    }
  }

  /* ── 3. LE MANÈGE INTERACTIF DES 10 MÉCANIQUES DE JEU (Sans doublons Vitrine/RDV) ── */
  const JUKEBOX_GAMES = [
    {
      id: "core",
      emoji: "🎰",
      short: "15 Jeux Instantanés",
      title: "15 Jeux Instantanés (9 Hasard + 6 Défis d'Adresse)",
      cat: "Déclencher un vrai sourire en 5 secondes",
      color: "#c4a3ff",
      desc: "Un coupon « -10 % » laisse indifférent. Une roue qui tourne, un coffre qui s'ouvre ou un défi de réflexe crée un petit frisson de plaisir que le client associe aussitôt à votre commerce — avec vos lots, quotas et stocks maîtrisés à l'euro près.",
      usage: "🎰 9 tirages hasard + 6 défis d'adresse · Dès Coup d'envoi (29 €/mois)",
      visual: `
        <div class="jb-anim-scene">
          <div style="display:flex;gap:0.45rem;align-items:center;justify-content:center;flex-wrap:wrap;">
            <span class="jb-stamp-dot stamped" style="width:46px;height:46px;background:#ffd93d;">🎰</span>
            <span class="jb-stamp-dot stamped" style="width:46px;height:46px;background:#98f5d4;">🧰</span>
            <span class="jb-stamp-dot stamped" style="width:46px;height:46px;background:#ffb8d9;">🎟️</span>
            <span class="jb-stamp-dot stamped" style="width:46px;height:46px;background:#e3cfff;">⚡</span>
          </div>
          <a href="/jeux-pronostics" class="jb-live-pill" style="text-decoration:none;color:#161317;">✨ Explorer les 15 mécaniques en détail →</a>
        </div>
      `,
    },
    {
      id: "loyalty",
      emoji: "🎟️",
      short: "Passeport Fidélité",
      title: "Passeport Fidélité sur Téléphone (Écran d'accueil & Wallet)",
      cat: "Ne plus jamais perdre vos habitués",
      color: "#5de4b3",
      desc: "Fini la carte en carton oubliée dans un manteau. Dès que votre client voit « Plus que 2 visites avant votre cadeau ! » sur son téléphone, il choisit votre adresse plutôt que celle d'à côté — et son statut Bronze, Argent ou Or ne redescend jamais.",
      usage: "🎁 Au comptoir ou glissé dans vos sacs Uber Eats / Deliveroo",
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
      title: "Calendrier à Surprises & Rituel Quotidien",
      cat: "Revenir dans leur tête chaque matin",
      color: "#ffd93d",
      desc: "Avent, anniversaire de votre commerce, soldes ou animation interne : chaque matin, une nouvelle case s'illumine sur le téléphone de vos clients (ou de vos salariés pour une entreprise ou un CE). Disponible à l'unité sans abonnement.",
      usage: "📅 Jusqu'à 31 jours de surprises · Horloge serveur anti-triche",
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
      title: "Parrainage Ambassadeurs (Validé à la 1re Visite)",
      cat: "Vos meilleurs clients recrutent pour vous",
      color: "#ff8b3d",
      desc: "Vos habitués vous aiment déjà : donnez-leur un lien à partager en 1 clic sur WhatsApp. Votre budget reste 100 % protégé : les points ne sont crédités que le jour où l'ami franchit réellement votre porte.",
      usage: "🤝 Bouche-à-oreille local sans budget publicitaire perdu",
      visual: `
        <div class="jb-anim-scene">
          <div class="jb-stamps-row" style="align-items:center">
            <span class="jb-stamp-dot stamped" style="width:48px;height:48px">😊</span>
            <b style="font-size:1.2rem">➔</b>
            <span class="jb-stamp-dot stamped" style="width:48px;height:48px;background:#5de4b3">🙋‍♀️</span>
            <b style="font-size:1.2rem">➔</b>
            <span class="jb-stamp-dot stamped" style="width:48px;height:48px;background:#ff4fa3;color:#fff">🎁</span>
          </div>
          <span class="jb-live-pill">🚀 1 ami venu = 2 récompenses débloquées</span>
        </div>
      `,
    },
    {
      id: "quiz",
      emoji: "🧠",
      short: "Quiz Interactif",
      title: "Quiz Savoir-Faire & Culture Maison",
      cat: "Transformer l'attente en découverte complice",
      color: "#ff7eb6",
      desc: "Faites découvrir vos secrets de fabrication, vos produits phares ou l'histoire de votre quartier en 5 questions rapides. Le client s'amuse, apprend des anecdotes valorisantes et repart avec un lot mérité en caisse.",
      usage: "🧠 Jouable seul en autonomie ou animé sur écran géant",
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
      short: "Événements Live",
      title: "Soirées & Quiz en Direct sur Grand Écran",
      cat: "Remplir votre salle les soirs calmes",
      color: "#84c4ff",
      desc: "Branchez votre TV : chaque table buzze en temps réel depuis son téléphone pendant que le classement s'enflamme sur grand écran. Vos clients restent plus longtemps, commandent une tournée de plus et réservent déjà le jeudi suivant.",
      usage: "📺 Jusqu'à 250 joueurs simultanés · Piloté depuis votre téléphone",
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
      cat: "Créer l'esprit de bande autour de votre lieu",
      color: "#5de4b3",
      desc: "« Plus que 4 visites avant le tirage ! » Quand vos clients voient la barre commune approcher des 100 %, ils reviennent ensemble et embarquent leurs amis pour faire sauter la cagnotte — un seul gros lot maîtrisé, un buzz de quartier.",
      usage: "🎉 Jauge partagée en temps réel · Tirage automatique à 100 %",
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
      title: "Saisons de Pronostics Sportifs & Culturels",
      cat: "Devenir le QG officiel des grands matchs",
      color: "#ffd93d",
      desc: "Ligue des champions, Top 14, Coupe du monde, Eurovision ou challenge interne : vos habitués — ou vos salariés en entreprise / CE — déposent leurs pronostics avant le coup d'envoi et se chambrent autour du classement. Disponible à l'unité.",
      usage: "🏆 Verrouillage auto au coup d'envoi · Affichage TV en salle",
      visual: `
        <div class="jb-anim-scene">
          <div style="display:flex;gap:0.6rem;align-items:center;font-weight:900;font-size:1rem;">
            <span style="background:#fff;border:2px solid #161317;padding:0.35rem 0.75rem;border-radius:12px">Équipe A : 2</span>
            <span>⚡</span>
            <span style="background:#ffd93d;border:2px solid #161317;padding:0.35rem 0.75rem;border-radius:12px">Équipe B : 1</span>
          </div>
          <span class="jb-live-pill">⚽ Pronostic exact = +10 points</span>
        </div>
      `,
    },
    {
      id: "hunts",
      emoji: "🔍",
      short: "Chasse au QR",
      title: "Chasse au QR (2 à 10 Étapes Physiques)",
      cat: "Faire découvrir chaque recoin de votre espace",
      color: "#c4a3ff",
      desc: "Un rayon peu visité, un étage méconnu ou une rue commerçante à animer ensemble ? Placez 2 à 10 QR codes : chaque balise scannée allume un indice et guide naturellement vos visiteurs jusqu'au trésor final en caisse.",
      usage: "🗺️ Oriente le flux physique & met en lumière vos nouveautés",
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
      title: "Duo Miroir (à 2) & Portrait de la Bande (2 à 12 joueurs)",
      cat: "Zéro lot coûteux · 100 % fous rires pendant l'attente",
      color: "#ff7eb6",
      desc: "10 minutes d'attente entre deux plats peuvent vite paraître longues. Inclus dans toutes nos formules : vos couples et grandes tablées votent en secret sur leurs téléphones, éclatent de rire à la révélation et repartent avec un souvenir chaleureux.",
      usage: "💬 Inclus d'office dans les 5 formules Simple comme QR",
      visual: `
        <div class="jb-anim-scene">
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <span class="jb-cal-door open" style="width:72px;height:56px;transform:rotate(-6deg)">📱 Toi</span>
            <b style="font-size:1.3rem">⚡</b>
            <span class="jb-cal-door" style="width:72px;height:56px;background:#5de4b3;transform:rotate(6deg)">📱 Ami(e)</span>
          </div>
          <span class="jb-live-pill">🥂 85% de complicité · L'attente disparaît !</span>
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
  const jbModuleLink = $("#jb-module-link");
  const jbPrev = $("#jb-prev");
  const jbNext = $("#jb-next");
  const carnivalRibbon = $("#carnival-ribbon");

  const JUKEBOX_MODULE_LINKS = {
    core: { href: "/modules?m=jeux-instantanes", label: "Voir le module 15 Jeux →" },
    loyalty: { href: "/modules?m=passeport-fidelite", label: "Voir le module Fidélité →" },
    calendar: { href: "/modules?m=calendrier", label: "Voir le module Calendrier →" },
    referral: { href: "/fidelite-communaute#simulateur-trio", label: "Tester le Parrainage →" },
    quiz: { href: "/modules?m=quiz", label: "Voir le module Quiz →" },
    events: { href: "/modules?m=evenements-live", label: "Voir le module Événements →" },
    jackpot: { href: "/modules?m=jackpot-collectif", label: "Voir le module Jackpot →" },
    pronostics: { href: "/modules?m=pronostics", label: "Voir le module Pronostics →" },
    hunts: { href: "/modules?m=chasse-au-qr", label: "Voir le module Chasse au QR →" },
    duo_bande: { href: "/modules?m=duo-miroir", label: "Voir le module Duo & Bande →" },
  };

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
    if (jbModuleLink) {
      const modLink = JUKEBOX_MODULE_LINKS[g.id] || { href: "/modules", label: "Voir les modules →" };
      jbModuleLink.setAttribute("href", modLink.href);
      jbModuleLink.textContent = modLink.label;
    }

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
    window.location.href = "/signup";
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
      cfgJauge.innerHTML = `<strong>${jDetails.full}</strong> · <em>Compte gratuit, payez pour publier</em>`;
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

    const FORMULE_MODULES = {
      core: [
        { emoji: "🎡", name: "Jeux instantanés (15 jeux)" },
        {
          emojiHtml: `<span class="plan-social-mini-logos" aria-hidden="true"><img src="img/logo-google-cartoon.svg" alt="" width="14" height="14" /><img src="img/logo-tripadvisor-cartoon.svg" alt="" width="14" height="14" /><img src="img/logo-instagram-cartoon.svg" alt="" width="14" height="14" /><img src="img/logo-facebook-cartoon.svg" alt="" width="14" height="14" /><img src="img/logo-tiktok-cartoon.svg" alt="" width="14" height="14" /></span>`,
          name: "Avis Google, Tripadvisor & Réseaux",
        },
        { emoji: "🪞", name: "Duo Miroir & 👥 Portrait" },
        { emoji: "🎟️", name: "Ticket d’Or & 🗝️ Missions" },
        { emoji: "📧", name: "Scans illimités & 4 emails auto" },
      ],
      engagement: [
        { emoji: "🎡", name: "Tout Coup d'envoi inclus" },
        { emoji: "📔", name: "Passeport fidélité & 🤝 Parrainage" },
        { emoji: "🗓️", name: "Calendrier surprise quotidien" },
        { emoji: "❓", name: "Quiz interactifs en autonomie" },
        { emoji: "🗺️", name: "Chasse au QR multi-étapes" },
      ],
      place: [
        { emoji: "🎡", name: "Tout Coup d'envoi inclus" },
        { emoji: "📖", name: "Vitrine & Tarifs au QR" },
        { emoji: "📅", name: "Prise de RDV à 0 % commission" },
        { emoji: "⚡", name: "Moments, File d'accueil & Invendus" },
        { emoji: "❓", name: "Quiz interactifs à table" },
      ],
      live: [
        { emoji: "🎡", name: "Tout Coup d'envoi inclus" },
        { emoji: "🎤", name: "Événements live (écran géant)" },
        { emoji: "🏆", name: "Pronostics sportifs & culturels" },
        { emoji: "🎰", name: "Jackpot collectif & ❓ Quiz" },
        { emoji: "👥", name: "Jusqu'à 250 joueurs simultanés" },
      ],
      full: [
        { emoji: "👑", name: "Les 12 modules d'animation" },
        { emoji: "📔", name: "Fidélité, Parrainage & Calendrier" },
        { emoji: "📖", name: "Vitrine & carte digitale au QR" },
        { emoji: "📅", name: "Agenda RDV (0% com) & Moments" },
        { emoji: "🎤", name: "Écran géant live (250 pers.) & Jackpot" },
      ],
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
          <span class="plan-comp-kicker">Modules inclus dans cette formule</span>
          ${meta.base ? `<div class="plan-included-banner">${meta.base}</div>` : ""}
          <ul class="plan-modules-list" style="list-style:none;padding:0;margin:0 0 0.6rem;display:grid;gap:0.35rem;">
            ${(FORMULE_MODULES[f.id] || []).map((m) => `
              <li style="display:flex;flex-wrap:wrap;align-items:center;gap:0.35rem 0.45rem;font-size:0.83rem;font-weight:700;color:var(--ink);">
                ${m.emojiHtml || `<span aria-hidden="true" style="font-size:1.05rem;flex-shrink:0;">${m.emoji}</span>`}
                <span style="min-width:0;">${m.name}</span>
              </li>
            `).join("")}
          </ul>
          <a href="/abonnements#grand-comparatif" class="plan-compare-link" style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.75rem;font-weight:800;color:#800038;text-decoration:underline;">
            <span>Comparer les modules en détail</span>
            <span aria-hidden="true">→</span>
          </a>
        </div>
        <div style="margin-top:auto;display:grid;gap:0.55rem">
          <div class="plan-capacity-pill">${meta.cap}</div>
          <button type="button" class="ticket-btn pop-btn-ink choose-plan-signup-btn" style="text-align:center;width:100%;cursor:pointer;">
            Créer un compte gratuit →
          </button>
          <a href="/abonnements#grand-comparatif" style="text-align:center;font-size:0.78rem;font-weight:800;color:#161317;text-decoration:underline;">
            📊 Voir sur la page Abonnements →
          </a>
        </div>
      `);
      const signupBtn = $(".choose-plan-signup-btn", card);
      if (signupBtn) {
        signupBtn.addEventListener("click", () => {
          saveCheckoutDraftAndRedirect(f, [], f.prix);
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
        const actionBtn = hpPhoneScreen ? hpPhoneScreen.querySelector(".lc-action-btn, .lc-cup-item, .lc-card-3d, .lc-chest-item, .lc-reflex-pad, .lc-dice-cube, .lc-rps-btn, .lc-memory-tile") : null;
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
          <strong style="display:block;font:900 0.98rem var(--display);line-height:1.2;">${escapeHtml(drafts.vitrine.nom || "Votre Établissement")}</strong>
          <span style="font-size:0.74rem;font-weight:700;">${escapeHtml(drafts.roue.name || "Tentez votre chance !")}</span>
        </div>

        <div id="hp-live-stage" style="width:100%;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:260px;"></div>

        <div id="hp-win-banner" style="${hpLastWin ? "" : "display:none;"}background:#e6f9ef;color:#211d16;border:2px solid #211d16;border-radius:12px;padding:0.45rem 0.65rem;text-align:center;font-size:0.75rem;font-weight:800;box-shadow:2px 2px 0 #211d16;margin-top:0.4rem;">
          ${hpLastWin ? `🎉 Gain : <b>${escapeHtml(hpLastWin.label)}</b> · Code caisse : <code style="background:#fcca59;padding:0.1rem 0.35rem;border-radius:5px;border:1px solid #211d16;">${escapeHtml(hpLastWin.code)}</code>` : ""}
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
          pageTheme: st.pageTheme || (isDark ? "nuit" : "kermesse"),
          isDark: isDark || (!st.fond && st.pageTheme !== "kermesse"),
          slotSymbols: st.slotSymbols || drafts.roue.slotSymbols,
          ringColor: st.ringColor || "#211d16",
          pointerColor: st.pointerColor || "#f5793b",
          buttonFrom: st.buttonFrom || "#f5793b",
          buttonTo: st.buttonTo || "#fcca59",
          onWin: (res) => {
            hpLastWin = { label: res.prize, code: res.code };
            if (winBanner) {
              winBanner.style.display = "block";
              winBanner.innerHTML = `🎉 Gain : <b>${escapeHtml(res.prize)}</b> · Code caisse : <code style="background:#fcca59;padding:0.1rem 0.35rem;border-radius:5px;border:1px solid #211d16;">${escapeHtml(res.code)}</code>`;
              try { winBanner.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch {}
            }
          }
        });
      }
    };

    const closeHeroPlayModal = () => {
      modalHeroPlay.hidden = true;
      if (hpSim) {
        hpSim.destroy();
        hpSim = null;
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
    if (hpModalClose) hpModalClose.addEventListener("click", closeHeroPlayModal);
    modalHeroPlay.addEventListener("click", (e) => {
      if (e.target === modalHeroPlay) closeHeroPlayModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modalHeroPlay.hidden) closeHeroPlayModal();
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
        window.location.href = `/studio?module=roue&preset=${encodeURIComponent(p.key)}&mech=${encodeURIComponent(hpMechanic)}`;
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

  // Aperçus live cliquables dans le bloc #piliers
  $$("[data-pillar-emulate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.pillarEmulate;
      if (mode && typeof window.LC_OPEN_EMULATOR === "function") {
        window.LC_OPEN_EMULATOR(mode);
      }
    });
  });

  /* ── 5. DÉMONSTRATEUR INTERACTIF DE LA PAGE VITRINE & RÉSERVATION (7 SECTEURS DU CODE SOURCE) ── */
  const vrSectorBtns = $$(".vr-sector-btn");
  const vrTabBtns = $$(".vr-tab-btn");
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
          <strong>${it.nom}</strong>
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
      window.location.href = `/studio?module=vitrine&sector=${encodeURIComponent(sec.key)}`;
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
          vrRdvFeedback.innerHTML = `📅 Créneau sélectionné : <b>${escapeHtml(btn.dataset.slot || "")}</b> (Prêt à ajouter au calendrier du téléphone).`;
        }
      });
    });
  }

  if (vrConfirmBtn) {
    vrConfirmBtn.addEventListener("click", () => {
      const activeSlot = $(".vr-slot-choice.active");
      const slotName = activeSlot ? activeSlot.dataset.slot : "Demain à 14h30";
      if (vrRdvFeedback) {
        vrRdvFeedback.innerHTML = `✅ <b>Rendez-vous confirmé pour ${escapeHtml(slotName || "")} !</b> L'invitation a été ajoutée au calendrier du client.`;
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
      const jpIsDark = Boolean(st.fond || st.pageTheme !== "kermesse");
      jpSim = GE.createSimulator(jpPhoneStage, {
        gameKey: currentJpMech,
        prize: prize,
        pageTheme: st.pageTheme || (jpIsDark ? "nuit" : "kermesse"),
        isDark: jpIsDark,
        ringColor: st.ringColor || "#211d16",
        pointerColor: st.pointerColor || "#f5793b",
        buttonFrom: st.buttonFrom || "#f5793b",
        buttonTo: st.buttonTo || "#fcca59",
        slotSymbols: st.slotSymbols,
        onWin: (res) => {
          if (jpPlayFeedback) {
            jpPlayFeedback.hidden = false;
            jpPlayFeedback.innerHTML = `🎉 <b>Gain débloqué : ${escapeHtml(res.prize)}</b> · Code caisse : <b>${escapeHtml(res.code)}</b>`;
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
        const actionBtn = jpPhoneStage ? jpPhoneStage.querySelector(".lc-action-btn, .lc-cup-item, .lc-card-3d, .lc-chest-item, .lc-reflex-pad, .lc-dice-cube, .lc-rps-btn, .lc-memory-tile") : null;
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
        window.location.href = `/studio?module=roue&preset=${encodeURIComponent(currentJpPresetKey)}&mech=${encodeURIComponent(mechKey)}`;
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
        window.location.href = "/studio?module=pronostics";
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
          pronoFeedback.textContent = "";
          const bEl = document.createElement("b");
          bEl.textContent = `Pronostic enregistré (${t1} ${s1} - ${s2} ${t2}) !`;
          pronoFeedback.append("✅ ", bEl, " Vous gagnez +10 pts et grimpez au classement.");
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
        actionPill.outerHTML = `<span class="cs-day-status" style="color:#1b7a43;font-weight:800;">✓ Réclamé (Code : QR-CAL7)</span>`;
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
        window.location.href = "/studio?module=fidelite";
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
          fcLiveLog.innerHTML = `<strong>▶ Démonstration animée relancée :</strong> Suivez les 4 étapes du Passeport côté client sur le téléphone !`;
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
          navigator.clipboard.writeText("https://simplecommeqr.fr/passeport/bistrot?parrain=PASS-LISA");
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
        <strong style="display:block;font:800 0.8rem var(--display);color:var(--k-ink);">✨ ${escapeHtml(statusText)}</strong>
        <small style="font-size:0.74rem;font-weight:700;color:var(--k-muted);">Reprenez votre modification là où vous vous étiez arrêté.</small>
      </div>
      <a class="k-btn k-btn-yellow k-btn-sm" href="/studio?module=${encodeURIComponent(d.lastModule || "vitrine")}">
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

  /* ── 8B. HUB FAQ ANIMÉ 2 COLONNES + FILTRES + TOUT DÉPLIER (Kermesse Hub) ── */
  $$(".lc-faq-hub").forEach((hub) => {
    const filterPills = $$(".faq-filter-pill", hub);
    const items = $$(".faq-item-pop", hub);
    const toggleAllBtn = $("[data-faq-toggle-all]", hub);
    if (!items.length) return;

    const getVisibleItems = () => items.filter((item) => !item.classList.contains("is-hidden"));

    const setItemOpen = (item, open) => {
      item.classList.toggle("is-open", open);
      const btn = $(".faq-trigger", item);
      if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    };

    const syncToggleAllBtn = () => {
      if (!toggleAllBtn) return;
      const visible = getVisibleItems();
      const allOpen = visible.length > 0 && visible.every((item) => item.classList.contains("is-open"));
      toggleAllBtn.setAttribute("aria-pressed", allOpen ? "true" : "false");
      toggleAllBtn.textContent = allOpen ? "📁 Tout replier" : "📂 Tout déplier";
    };

    const syncGridSpan = () => {
      const visible = getVisibleItems();
      items.forEach((item) => item.classList.remove("is-span-full"));
      if (visible.length % 2 === 1 && visible[0]) {
        visible[0].classList.add("is-span-full");
      }
    };

    items.forEach((item) => {
      const trigger = $(".faq-trigger", item);
      if (!trigger) return;
      trigger.addEventListener("click", () => {
        setItemOpen(item, !item.classList.contains("is-open"));
        syncToggleAllBtn();
      });
    });

    filterPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const cat = pill.dataset.faqCat || "all";
        filterPills.forEach((p) => {
          const isActive = p === pill;
          p.classList.toggle("active", isActive);
          p.setAttribute("aria-pressed", isActive ? "true" : "false");
        });

        let visibleIdx = 0;
        items.forEach((item) => {
          const match = cat === "all" || item.dataset.faqCat === cat;
          item.classList.toggle("is-hidden", !match);
          item.classList.remove("is-entering");
          if (match) {
            item.style.setProperty("--faq-i", String(visibleIdx));
            setItemOpen(item, visibleIdx === 0);
            visibleIdx += 1;
          } else {
            setItemOpen(item, false);
          }
        });

        syncGridSpan();
        syncToggleAllBtn();
        requestAnimationFrame(() => {
          getVisibleItems().forEach((item) => item.classList.add("is-entering"));
        });
      });
    });

    if (toggleAllBtn) {
      toggleAllBtn.addEventListener("click", () => {
        const visible = getVisibleItems();
        const shouldOpenAll = !visible.every((item) => item.classList.contains("is-open"));
        visible.forEach((item) => setItemOpen(item, shouldOpenAll));
        syncToggleAllBtn();
      });
    }

    syncGridSpan();
    syncToggleAllBtn();
  });

  /* ── 8C. SÉLECTEUR MÉTIER INTERACTIF (#cas-concrets) ── */
  const scenariosSection = $("#cas-concrets");
  if (scenariosSection) {
    const scTabs = $$("[data-sc-tab]", scenariosSection);
    const scPanels = $$("[data-sc-panel]", scenariosSection);
    const scNavBtns = $$("[data-sc-nav]", scenariosSection);
    const scKeys = scTabs.map((t) => t.dataset.scTab).filter(Boolean);

    const activateScenario = (key) => {
      if (!key) return;
      scTabs.forEach((t) => {
        const active = t.dataset.scTab === key;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      scPanels.forEach((p) => {
        const active = p.dataset.scPanel === key;
        p.classList.toggle("is-active", active);
        if (active) {
          p.style.animation = "none";
          void p.offsetWidth;
          p.style.animation = "";
        }
      });
    };

    scTabs.forEach((tab) => {
      tab.addEventListener("click", () => activateScenario(tab.dataset.scTab));
      tab.addEventListener("keydown", (ev) => {
        const idx = scKeys.indexOf(tab.dataset.scTab);
        if (ev.key === "ArrowRight") {
          ev.preventDefault();
          const next = scTabs[(idx + 1) % scTabs.length];
          if (next) { activateScenario(next.dataset.scTab); next.focus(); }
        } else if (ev.key === "ArrowLeft") {
          ev.preventDefault();
          const prev = scTabs[(idx - 1 + scTabs.length) % scTabs.length];
          if (prev) { activateScenario(prev.dataset.scTab); prev.focus(); }
        }
      });
    });

    scNavBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const currentKey = $(".lc-sc-tab-btn.is-active", scenariosSection)?.dataset.scTab || scKeys[0];
        const idx = Math.max(0, scKeys.indexOf(currentKey));
        const delta = btn.dataset.scNav === "prev" ? -1 : 1;
        const targetKey = scKeys[(idx + delta + scKeys.length) % scKeys.length];
        activateScenario(targetKey);
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
          history.pushState(null, "", "/abonnements" + hash);
        } catch {}
      }
    });

    const PLAN_DATA = {
      none: { nom: "100% À la carte", prix: 0, rights: [] },
      core: { nom: "Coup d'envoi", prix: 29, rights: ["games", "duo", "bande"] },
      engagement: { nom: "Le Club", prix: 59, rights: ["games", "duo", "bande", "passport", "referral", "pass_hunt", "pass_advent", "pass_quiz"] },
      place: { nom: "Sur Place", prix: 79, rights: ["games", "duo", "bande", "vitrine", "rdv", "moments", "pass_quiz"] },
      live: { nom: "Le Grand Jeu", prix: 89, rights: ["games", "duo", "bande", "pass_screen", "pass_prono", "pass_quiz", "pass_pot"] },
      full: { nom: "La Totale", prix: 129, rights: ["games", "duo", "bande", "passport", "referral", "vitrine", "rdv", "moments", "pass_hunt", "pass_advent", "pass_quiz", "pass_pot", "pass_prono", "pass_screen"] },
    };

    const ADDON_DATA = {
      // Options en ligne d'abonnement (nécessitent une formule dès Coup d'envoi)
      vitrine: { nom: "Vitrine & Tarifs QR", prix: 20, type: "recurring", unit: "/mois", requiresPlan: true },
      rdv: { nom: "Réservation Directe 0%", prix: 20, type: "recurring", unit: "/mois", requiresPlan: true },
      moments: { nom: "Moments, File & Invendus", prix: 20, type: "recurring", unit: "/mois", requiresPlan: true },
      // Modules mensuels autonomes (avec formule ou à la carte dès 0 €)
      passport: { nom: "Passeport Fidélité & Lots", prix: 19, type: "recurring", unit: "/mois" },
      referral: { nom: "Parrainage Ambassadeurs", prix: 12, type: "recurring", unit: "/mois" },
      duo: { nom: "Duo Miroir", prix: 12, type: "recurring", unit: "/mois" },
      bande: { nom: "Portrait de la Bande", prix: 12, type: "recurring", unit: "/mois" },
      // Pass événementiels ponctuels
      pass_hunt: { nom: "Pass Chasse au Trésor", prix: 29, type: "onetime", unit: "unique" },
      pass_advent: { nom: "Pass Calendrier Surprises", prix: 29, type: "onetime", unit: "unique" },
      pass_quiz: { nom: "Pass Quiz Express", prix: 15, type: "onetime", unit: "unique" },
      pass_pot: { nom: "Pass Cagnotte & Jackpot", prix: 29, type: "onetime", unit: "unique" },
      pass_prono: { nom: "Pass Saison Pronostics", prix: 39, type: "onetime", unit: "unique" },
      pass_screen: { nom: "Pass Soirée Live (10 joueurs)", prix: 9, type: "onetime", unit: "unique" },
    };

    const userCheckedAddons = new Set();

    // Calculateur de budget sur-mesure (aligné 100 % sur les tarifs mensuels et add-ons)
    function updateCalculator() {
      if (!abCalcWrapper) return;

      const selectedPlanInput = $('input[name="calc-plan"]:checked');
      const selectedPlanKey = selectedPlanInput ? selectedPlanInput.value : "engagement";
      const planInfo = PLAN_DATA[selectedPlanKey] || PLAN_DATA.engagement;

      // Met à jour l'affichage de la formule choisie
      const sumPlanName = $("#calc-summary-plan-name");
      const sumPlanPrice = $("#calc-summary-plan-price");
      const planCost = planInfo.prix;

      if (sumPlanName) sumPlanName.textContent = `Formule « ${planInfo.nom} »`;
      if (sumPlanPrice) sumPlanPrice.textContent = `${planCost},00 €`;

      // Gestion des add-ons inclus automatiquement vs nécessitant une formule vs à la carte
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
        const needsPlan = Boolean(data.requiresPlan && selectedPlanKey === "none");
        const badge = card.querySelector(".calc-card-status-badge");

        if (isIncluded) {
          card.classList.add("is-included-in-plan");
          card.classList.remove("is-selected", "is-requires-plan");
          input.checked = true;
          input.disabled = true;
          if (badge) {
            badge.className = "calc-card-status-badge included";
            badge.textContent = "✓ Inclus sans surcoût";
          }
        } else if (needsPlan) {
          userCheckedAddons.delete(key);
          card.classList.remove("is-included-in-plan", "is-selected");
          card.classList.add("is-requires-plan");
          input.checked = false;
          input.disabled = true;
          if (badge) {
            badge.className = "calc-card-status-badge requires-plan";
            badge.textContent = "Nécessite une formule (dès 29 €)";
          }
        } else {
          card.classList.remove("is-included-in-plan", "is-requires-plan");
          input.disabled = false;
          input.checked = userCheckedAddons.has(key);
          card.classList.toggle("is-selected", input.checked);

          if (badge) {
            badge.className = "calc-card-status-badge optional";
            badge.textContent = data.type === "recurring" ? "Option mensuelle" : "Pass ponctuel";
          }

          if (input.checked) {
            if (data.type === "recurring") {
              recurringAddonsCost += data.prix;
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
            return `
              <div class="calc-sum-addon-item">
                <span>+ ${add.nom}</span>
                <span>+${add.prix},00 € <small>${add.unit}</small></span>
              </div>
            `;
          }).join("");
        }
      }

      // Calcul total récurrent et affichage
      const totalMonthly = planCost + recurringAddonsCost;
      const totalDisplay = $("#calc-total-display");
      const periodCaption = $("#calc-period-caption");
      const checkoutBtn = $("#calc-checkout-btn");
      const onetimeBox = $("#calc-onetime-total-box");
      const onetimeAmount = $("#calc-onetime-amount");

      if (periodCaption) periodCaption.textContent = "par mois sans engagement";
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

      // Mise à jour du CTA d'inscription
      if (checkoutBtn) {
        checkoutBtn.setAttribute("href", "/signup");
        checkoutBtn.textContent = "Créer mon compte gratuit →";
      }

      // Sauvegarde du brouillon de commande en mémoire
      try {
        localStorage.setItem("lc_checkout_draft", JSON.stringify({
          plan: selectedPlanKey,
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

    // Sélecteur de paliers Soirée en jeu (10 / 30 / 50 joueurs -> 9 / 19 / 29 €)
    $$(".soiree-tier-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tier = btn.dataset.tier || "10";
        const price = Number(btn.dataset.price || 9);
        $$(".soiree-tier-btn").forEach((b) => {
          const isCurrent = b === btn;
          b.classList.toggle("active", isCurrent);
          b.setAttribute("aria-pressed", String(isCurrent));
        });
        ADDON_DATA.pass_screen.prix = price;
        ADDON_DATA.pass_screen.nom = `Pass Soirée Live (${tier} joueurs)`;
        const pricePill = $("#pass-screen-price-pill");
        if (pricePill) pricePill.innerHTML = `+${price} €<small> · 24h</small>`;
        const chk = $('input[name="calc-addon"][value="pass_screen"]');
        if (chk) {
          chk.dataset.price = String(price);
          if (!chk.disabled && !chk.checked) {
            chk.checked = true;
            userCheckedAddons.add("pass_screen");
          }
        }
        updateCalculator();
      });
    });

    // Initialisation
    updateCalculator();
  }

  /* ── 13. ÉMULATEUR CLIENT UNIVERSEL (HÉROS QR CODES & PAGES MODULES) ── */
  const GE = window.LC_GAMES_ENGINE;
  const EMU_META = {
    passeport: {
      kicker: "PASS TEST CLIENT · /passeport",
      title: "Passeport Fidélité Client (Vue Smartphone)",
      desc: "Votre client garde sa carte sur son téléphone sans installer d’application : il cumule ses points, voit sa jauge de paliers évoluer et débloque ses cadeaux au comptoir.",
      group: ["passeport", "jackpot", "parrainage"],
      studioHref: "/studio?module=fidelite",
      moduleHref: "/modules?m=passeport-fidelite",
    },
    jackpot: {
      kicker: "CAGNOTTE COLLECTIVE · /jackpot",
      title: "Jackpot Collectif de la Communauté",
      desc: "Chaque passage de vos clients remplit une cagnotte commune. Dès que l’objectif est atteint, un tirage collectif automatique récompense un membre parmi les participants.",
      group: ["passeport", "jackpot", "parrainage"],
      studioHref: "/studio?module=fidelite",
      moduleHref: "/modules?m=jackpot-collectif",
    },
    parrainage: {
      kicker: "PARRAINAGE · /v/...?parrain=",
      title: "Bouche-à-oreille Traçable (Parrain & Filleul)",
      desc: "Vos habitués partagent leur lien personnel à leurs proches. À la première visite validée du filleul en caisse, les deux reçoivent instantanément leur récompense.",
      group: ["passeport", "jackpot", "parrainage"],
      studioHref: "/studio?module=fidelite",
      moduleHref: "/modules?m=passeport-fidelite",
    },
    jeux: {
      kicker: "EXPERIENCE JOUEUR · /play",
      title: "Les 15 Jeux Instantanés (Vue Client)",
      desc: "Votre client scanne, participe en 15 secondes sur votre thème graphique et repart avec son code gain à présenter en caisse.",
      group: ["jeux", "pronostics"],
      studioHref: "/studio?module=roue",
      moduleHref: "/modules?m=jeux-instantanes",
    },
    pronostics: {
      kicker: "CONCOURS DE PRONOSTICS · /pronos",
      title: "Grille & Classement de Saison",
      desc: "Vos clients saisissent leurs scores journée après journée sur leur téléphone, suivent leur classement en direct et jouent pour les dotations finales.",
      group: ["jeux", "pronostics"],
      studioHref: "/studio?module=pronostics",
      moduleHref: "/modules?m=pronostics",
    },
    vitrine: {
      kicker: "CARTE & TARIFS · /v/commerce",
      title: "Vitrine Interactive Multi-Métiers",
      desc: "Menu, prestations, tarifs, histoire et boutons d’action vers votre jeu, votre prise de rendez-vous ou votre carte de fidélité sur une seule page rapide.",
      group: ["vitrine", "rdv", "moments"],
      studioHref: "/studio?module=vitrine",
      moduleHref: "/vitrine-reservation",
    },
    rdv: {
      kicker: "RÉSERVATION DIRECTE 0 % · /reserver",
      title: "Prise de Rendez-vous & Réservation de Table",
      desc: "Vos clients réservent un créneau en 3 gestes sans intermédiaire ni commission, reçoivent leur pass et l’ajoutent à leur agenda.",
      group: ["vitrine", "rdv", "moments"],
      studioHref: "/studio?module=vitrine",
      moduleHref: "/vitrine-reservation",
    },
    moments: {
      kicker: "ÉVÉNEMENTS & FILE D'ATTENTE · /reserver",
      title: "Moments VIP & File d’Attente en Direct",
      desc: "Ventes privées, ateliers à jauge limitée ou file d’attente numérique : vos clients réservent les dernières places ou suivent leur tour sur mobile.",
      group: ["vitrine", "rdv", "moments"],
      studioHref: "/studio?module=vitrine",
      moduleHref: "/vitrine-reservation",
    },
    calendrier: {
      kicker: "CALENDRIER QUOTIDIEN · /calendar",
      title: "Calendrier Interactif (Cases du Jour)",
      desc: "Chaque matin dévoile une nouvelle case : bonus fidélité, surprise comptoir ou tour de roue quotidien installable sur l’écran d’accueil.",
      group: ["calendrier"],
      studioHref: "/studio?module=calendrier",
      moduleHref: "/modules?m=calendrier",
    },
    "evenements-live": {
      kicker: "SOIRÉE ANIMÉE · /event + /screen",
      title: "Événements Live sur Écran Géant",
      desc: "Animez vos soirées au bar, en restaurant ou en boutique : les clients répondent ensemble sur téléphone pendant que l’écran géant affiche le live.",
      group: ["evenements-live"],
      studioHref: "/signup",
      moduleHref: "/modules?m=evenements-live",
    },
    quiz: {
      kicker: "QUIZ INTERACTIF · /quiz",
      title: "Quiz Libre-Service avec Correction Immédiate",
      desc: "Éduquez et divertissez vos visiteurs autour de votre savoir-faire, affichez le score en direct et offrez une récompense aux meilleurs.",
      group: ["quiz"],
      studioHref: "/signup",
      moduleHref: "/modules?m=quiz",
    },
    "chasse-au-qr": {
      kicker: "PARCOURS PHYSIQUE · /hunt",
      title: "Chasse au QR (2 à 10 Étapes)",
      desc: "Faites circuler vos visiteurs dans votre établissement, entre vos rayons ou avec des commerçants voisins jusqu’au coffre final.",
      group: ["chasse-au-qr"],
      studioHref: "/signup",
      moduleHref: "/modules?m=chasse-au-qr",
    },
    "duo-miroir": {
      kicker: "JEU DE TABLE À 2 · /lobby",
      title: "Duo Miroir (Révélation Complice)",
      desc: "Un brise-glace fun pour deux personnes à table ou en salle d’attente : chacun répond secrètement puis découvre votre score de complicité.",
      group: ["duo-miroir"],
      studioHref: "/signup",
      moduleHref: "/modules?m=duo-miroir",
    },
    "portrait-de-la-bande": {
      kicker: "JEU DE GROUPE 2-12 JOUEURS · /lobby",
      title: "Portrait de la Bande (Vote Secret)",
      desc: "Fous rires garantis pour vos grandes tablées : chacun vote discrètement pour le rôle de ses amis, révélation dès 3 votes reçus.",
      group: ["portrait-de-la-bande"],
      studioHref: "/signup",
      moduleHref: "/modules?m=portrait-de-la-bande",
    },
    "ticket-dor": {
      kicker: "PROCHAINE VISITE · /ticket",
      title: "Ticket d’Or (QR Code de Retour)",
      desc: "Remis au comptoir ou glissé dans vos sacs à emporter et livraisons (Uber Eats, Deliveroo) : le client le scanne sur son téléphone pour révéler un code privilège unique valable sur sa prochaine visite en direct.",
      group: ["ticket-dor"],
      studioHref: "/signup",
      moduleHref: "/modules?m=ticket-dor",
    },
    "missions-coffres": {
      kicker: "PROGRESSION AUTOMATIQUE · /progression",
      title: "Missions, Clés & Coffres à Débloquer",
      desc: "Transformez toutes les actions clients (jeu, avis, fidélité, parrainage) en missions récompensées par des clés ouvrant des coffres cadeaux.",
      group: ["missions-coffres"],
      studioHref: "/signup",
      moduleHref: "/modules?m=missions-coffres",
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
              <a href="/studio" class="ticket-btn pop-btn-yellow" id="lc-emu-studio-link">🛠️ Personnaliser le mien →</a>
              <a href="/modules" class="ticket-btn pop-btn-white" id="lc-emu-module-link">📖 Fiche complète du module</a>
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
          ${mechs.map((mc) => `<button type="button" class="lc-emu-chip ${emuState.gameMechKey === mc.key ? "active" : ""}" data-emu-mech="${mc.key}">${mc.emoji || mc.icon || "🎮"} ${mc.label}</button>`).join("")}
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
              <input type="text" id="emu-nick-input" aria-label="Modifier votre surnom sur le passeport" style="display:block;width:100%;margin-top:0.2rem;border:1.5px solid #211d16;border-radius:8px;padding:0.24rem 0.45rem;font:800 0.84rem var(--body);background:#faf6ec;color:#211d16;" />
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
      if (nickInput) {
        nickInput.value = emuState.nickname;
        nickInput.addEventListener("change", (e) => (emuState.nickname = e.target.value || "Lisa M."));
      }
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
                ? `<div class="lc-emu-feedback">🎉 <b>Tirage collectif déclenché !</b><br/>Gagnante : <b class="js-emu-winner"></b> · Code <span class="lc-emu-code-pill">JACKPOT-WIN</span></div>
                   <button type="button" class="lc-emu-chip" id="emu-jackpot-reset" style="margin-top:0.55rem;width:100%;">↻ Réinitialiser la démo à 47/50</button>`
                : `<button type="button" class="lc-emu-primary-btn" id="emu-jackpot-inc">+ Valider 1 participation (${emuState.jackpotCount}/50)</button>`
            }
          </div>
        </div>
      `;
      const winnerEl = $(".js-emu-winner", screenEl);
      if (winnerEl) winnerEl.textContent = emuState.jackpotWinner;
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
              <strong style="font:800 0.84rem var(--display);">Lien personnel de <span class="js-emu-nick"></span></strong>
              <code style="display:block;margin:0.4rem 0;background:#fff;padding:0.4rem;border-radius:8px;border:1.5px solid #211d16;font-size:0.72rem;word-break:break-all;">
                simplecommeqr.fr/passeport/bistrot?parrain=PASS-LISA
              </code>
              <span style="font-size:0.76rem;font-weight:700;">Chaque ami qui vient pour la 1re fois vous rapporte <b>+150 pts</b> !</span>
            </div>
            <button type="button" class="lc-emu-primary-btn" id="emu-parrain-switch">Simuler l’arrivée de mon ami Tom →</button>
          `
              : `
            <div class="lc-emu-white-box">
              <span class="lc-emu-code-pill" style="margin-bottom:0.4rem;">Invitation de <span class="js-emu-nick"></span></span>
              <h3 style="margin:0.2rem 0 0.4rem;font:900 1rem var(--display);">Bienvenue Tom ! 🎁 -20 % offerts sur votre 1re visite</h3>
              <p style="margin:0 0 0.7rem;font-size:0.79rem;font-weight:600;">Présentez votre téléphone en caisse pour activer votre offre de bienvenue et récompenser votre parrain.</p>
              ${
                emuState.parrainFriendDone
                  ? `<div class="lc-emu-feedback">🎉 1re visite validée ! Tom profite de <b>-20 %</b> et <span class="js-emu-nick"></span> vient de recevoir <b>+150 pts</b>.</div>`
                  : `<button type="button" class="lc-emu-primary-btn" id="emu-friend-validate">✅ Valider la 1re visite de Tom</button>`
              }
            </div>
          `
          }
        </div>
      `;
      $$(".js-emu-nick", screenEl).forEach((elNick) => (elNick.textContent = emuState.nickname));
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
          buttonFrom: st.buttonFrom || "#f5793b",
          buttonTo: st.buttonTo || "#ffd93d",
          onWin: (res) => {
            if (winEl) {
              winEl.hidden = false;
              winEl.innerHTML = `🎉 Gagné : <b>${escapeHtml(res.prize)}</b> · Présentez le code <span class="lc-emu-code-pill">${escapeHtml(res.code)}</span> en caisse !`;
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
              <div style="display:flex;justify-content:space-between;font:800 0.8rem var(--body);background:#fde9ba;padding:0.25rem 0.4rem;border-radius:8px;"><span>🥈 ${emuState.pronoSubmitted ? "2" : "3"}. Vous (<span class="js-emu-nick"></span>)</span><span>${emuState.pronoSubmitted ? "46" : "41"} pts</span></div>
              <div style="display:flex;justify-content:space-between;font:800 0.8rem var(--body);"><span>🥉 3. Sarah K.</span><span>39 pts</span></div>
              <div style="border-top:1px dashed rgba(33,29,22,0.2);padding-top:0.4rem;font-size:0.74rem;font-weight:700;">
                🎁 1er prix saison : Maillot officiel + 100 € offerts
              </div>
            </div>
          `
          }
        </div>
      `;
      $$(".js-emu-nick", screenEl).forEach((elNick) => (elNick.textContent = emuState.nickname));

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
      const days = ["Aujourd’hui", "Demain", "Samedi"];
      const slots = ["12h15", "14h30", "19h30", "20h00"];
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
              ${services.map((sv, idx) => `<button type="button" class="lc-emu-chip ${emuState.rdvService === sv ? "active" : ""}" data-rsvc-idx="${idx}">${sv}</button>`).join("")}
            </div>
            <strong style="font:800 0.76rem var(--body);display:block;margin:0.55rem 0 0.35rem;">2. Jour &amp; horaire disponible :</strong>
            <div class="lc-emu-theme-grid" style="margin-bottom:0.35rem;">
              ${days.map((d, idx) => `<button type="button" class="lc-emu-chip ${emuState.rdvDay === d ? "active" : ""}" data-rday-idx="${idx}">${d}</button>`).join("")}
            </div>
            <div class="lc-emu-theme-grid">
              ${slots.map((sl, idx) => `<button type="button" class="lc-emu-chip ${emuState.rdvSlot === sl ? "active" : ""}" data-rslot-idx="${idx}">${sl}</button>`).join("")}
            </div>
          </div>

          ${
            emuState.rdvConfirmed
              ? `<div class="lc-emu-feedback">✅ <b>Confirmé !</b> <span class="js-rdv-svc"></span> · <b class="js-rdv-when"></b><br/>Pass <span class="lc-emu-code-pill">RES-492</span> ajouté à l’agenda client.</div>
                 <button type="button" class="lc-emu-chip" id="emu-rdv-reset">Modifier mon créneau</button>`
              : `<button type="button" class="lc-emu-primary-btn" id="emu-rdv-confirm">Confirmer le créneau (<span class="js-rdv-slot"></span>) →</button>`
          }
        </div>
      `;
      if ($(".js-rdv-svc", screenEl)) $(".js-rdv-svc", screenEl).textContent = emuState.rdvService;
      if ($(".js-rdv-when", screenEl)) $(".js-rdv-when", screenEl).textContent = `${emuState.rdvDay} à ${emuState.rdvSlot}`;
      if ($(".js-rdv-slot", screenEl)) $(".js-rdv-slot", screenEl).textContent = emuState.rdvSlot;
      $$("[data-rsvc-idx]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.rdvService = services[Number(b.dataset.rsvcIdx)] || services[0]; emuState.rdvConfirmed = false; renderEmulatorPhone(screenEl); }));
      $$("[data-rday-idx]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.rdvDay = days[Number(b.dataset.rdayIdx)] || days[0]; emuState.rdvConfirmed = false; renderEmulatorPhone(screenEl); }));
      $$("[data-rslot-idx]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.rdvSlot = slots[Number(b.dataset.rslotIdx)] || slots[0]; emuState.rdvConfirmed = false; renderEmulatorPhone(screenEl); }));
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
              <div class="lc-emu-feedback">📲 Notification prête pour <span class="js-emu-nick"></span></div>
            </div>
          `
          }
        </div>
      `;
      $$(".js-emu-nick", screenEl).forEach((elNick) => (elNick.textContent = emuState.nickname));
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
      const players = ["Tom", "Lisa", "Sarah", "Max"];
      screenEl.innerHTML = `
        <div class="lc-emu-app-pad">
          <div class="lc-emu-app-header">
            <strong>👥 Portrait de la Bande</strong>
            <span class="lc-emu-code-pill">4 joueurs à table</span>
          </div>
          <div class="lc-emu-white-box">
            <strong style="font:900 0.9rem var(--display);display:block;margin-bottom:0.45rem;">Qui met toujours 20 min à choisir sa commande ?</strong>
            <div class="lc-emu-theme-grid">
              ${players.map((n, idx) => `<button type="button" class="lc-emu-chip ${emuState.bandeVote === n ? "active" : ""}" data-bv-idx="${idx}">${n}</button>`).join("")}
            </div>
          </div>
          ${
            emuState.bandeVote
              ? `<div class="lc-emu-feedback">🗳️ 3 votes reçus ! <b class="js-bande-vote"></b> remporte haut la main le titre de <b>« Décideur Éternel »</b> 🏆</div>`
              : `<p style="font-size:0.78rem;font-weight:700;margin:0;text-align:center;">Votez secrètement : le verdict tombe dès que 3 personnes à table ont voté.</p>`
          }
        </div>
      `;
      if ($(".js-bande-vote", screenEl)) $(".js-bande-vote", screenEl).textContent = emuState.bandeVote;
      $$("[data-bv-idx]", screenEl).forEach((b) => b.addEventListener("click", () => { emuState.bandeVote = players[Number(b.dataset.bvIdx)] || players[0]; renderEmulatorPhone(screenEl); }));
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
            <span style="font:800 0.72rem var(--body);text-transform:uppercase;">Remis en caisse ou livraison Uber Eats / Deliveroo</span>
            <h3 style="margin:0.3rem 0;font:900 1.1rem var(--display);">Votre Privilège Prochaine Visite</h3>
          </div>
          ${
            emuState.ticketScratched
              ? `<div class="lc-emu-feedback" style="text-align:center;">📱 <b>Ticket scanné avec succès !</b><br/>☕ <b>2e Boisson ou Dessert Offert dès votre prochain passage</b><br/>Code caisse ou commande en ligne : <span class="lc-emu-code-pill">TICKET-842</span></div>`
              : `<button type="button" class="lc-emu-primary-btn" id="emu-ticket-open">📱 Scanner / Ouvrir mon Ticket d’Or →</button>`
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
        accent: "#ff4fa3",
        accentSoft: "#ffe4f2",
        showSocialLogos: true,
        emoji: "🎡",
        title: "Jeux instantanés",
        surtitre: "MODULE 01 · SIMPLE COMME JEUX & AVIS 5★",
        subtitle: "Un simple « -10 % » ne fait vibrer personne. 15 mini-jeux (hasard ou adresse) qui déclenchent un vrai sourire en 15 secondes, proposent l’avis Google / Tripadvisor ou vos réseaux (Instagram, Facebook, TikTok) et créent une raison joyeuse de revenir.",
        offerBadge: "✓ Inclus dès Coup d’envoi (29 €/mois)",
        pitchLead: "Samedi matin, un client attend son tour au comptoir ou paie son addition. En scannant votre QR, une carte discrète lui propose d’abord de vous laisser un avis Google / Tripadvisor ou de vous suivre sur Instagram, Facebook ou TikTok — avant même de lancer sa roue ou d’ouvrir son coffre (toujours libre d’accès). Une douceur ou un café à quelques centimes déclenche l’émotion de la surprise et ancre votre adresse.",
        kpis: [
          { val: "15 mécaniques", lbl: "9 tirages hasard + 6 défis d’adresse" },
          { val: "Avis & Réseaux", lbl: "Google, Tripadvisor, Insta, FB & TikTok" },
          { val: "Budget protégé", lbl: "Stock, quotas & probabilités réglés" },
        ],
        emulateMode: "jeux",
        studioHref: "/studio?module=roue",
        detailHref: "/jeux-pronostics",
        detailLabel: "📖 Explorer les 15 jeux",
        steps: [
          { t: "1 · Posez votre QR partout", d: "En vitrine, sur le comptoir, sur table ou imprimé dans notre éditeur d’affiche A4 intégré." },
          { t: "2 · Invitation avis & réseaux + 15 s d’émotion", d: "Un écran optionnel propose Google, Tripadvisor, Instagram, Facebook ou TikTok sans bloquer, puis place au jeu." },
          { t: "3 · Validation en 1 clic en caisse", d: "Le code unique est validé sur votre écran Caisse Simple comme QR — zéro fraude, zéro matériel." },
        ],
        psyLever: "Récompense variable, réciprocité & temps d’attente inversé",
        psyText: "Trois minutes d’attente semblent longues quand on ne fait rien ; avec une roue ou un défi, elles passent sans friction. En recevant une attention gratuite avant même d’avoir donné son avis ou de revenir, le client ressent naturellement l’envie de rendre la pareille.",
        cases: [
          { biz: "☕ Boulangerie · Samedi 10 h 15", setup: "Posez le chevalet A4 au comptoir, activez l’invitation Google / Insta / Facebook libre d’accès et réglez 1 chouquette ou -10 % avec un stock journalier plafond.", outcome: "Le client sourit au lieu de s’impatienter dans la file, découvre vos réseaux naturellement et revient valider son code en caisse sous 15 jours." },
          { biz: "💇 Salon & Institut · Fin de soin", setup: "Collez le QR devant le miroir ou le comptoir d’encaissement avec une roue ou un coffre aux couleurs exactes de votre institut.", outcome: "Moment d’enthousiasme juste après la coupe ou le soin : le client pense naturellement à vous noter sur Google ou Tripadvisor et repart avec un privilège pour son prochain rendez-vous." },
        ],
        synergies: [
          { target: "ticket-dor", emoji: "🎟️", name: "Avec Ticket d’Or", why: "Après une première partie en salle, glissez un Ticket d’Or dans son sac pour sécuriser sa prochaine visite." },
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Transformez un joueur d’un jour en habitué qui suit ses points et ses paliers sur téléphone." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Le Déclic & Avis", icon: "📷", title: "Scan au comptoir + invitation avis & réseaux", text: "Posé au comptoir, votre QR invite librement sur Google, Tripadvisor, Instagram, Facebook ou TikTok sans bloquer, puis lance votre jeu.", chips: ["0 téléchargement", "5 plateformes intégrées"] },
          { tag: "Scène 2 · Le Frisson", icon: "🎡", title: "5 secondes de suspense joyeux", text: "La récompense variable marque bien plus la mémoire qu’une remise banale.", chips: ["Café offert", "-15 % prochain achat"] },
          { tag: "Scène 3 · En Caisse", icon: "🧾", title: "Le client revient consommer son lot", text: "Code unique validé en 1 seconde sur votre écran caisse, souvent accompagné d’un achat.", chips: ["Stock maîtrisé", "Anti-fraude serveur"] },
        ],
      },
      {
        id: "passeport-fidelite",
        accent: "#5de4b3",
        accentSoft: "#e2fbf0",
        showSocialLogos: true,
        emoji: "📔",
        title: "Passeport fidélité",
        surtitre: "MODULE 02 · SIMPLE COMME PASSEPORT FIDÉLITÉ",
        subtitle: "Une carte en carton finit oubliée dans un manteau. Le Passeport sur téléphone garde votre commerce sous les yeux du client et le pousse à revenir.",
        offerBadge: "✓ Inclus Le Club (59 €) & La Totale · Option 19 €/mois",
        pitchLead: "Pourquoi tant de clients ravis ne reviennent-ils jamais ? Parce qu’ils n’ont rien qui les rattache à vous. Quand votre client voit sur son écran « Plus que 2 visites avant votre dessert offert » — et sait que son statut Bronze, Argent ou Or ne redescend jamais même quand il dépense ses points — il choisit naturellement votre porte plutôt que celle du voisin.",
        kpis: [
          { val: "100 pts / visite", lbl: "Scan caisse ou code tournant comptoir" },
          { val: "Bronze · Argent · Or", lbl: "Statut acquis à vie même points dépensés" },
          { val: "Écran & Wallet", lbl: "Écran d’accueil & compatible Google Wallet" },
        ],
        emulateMode: "passeport",
        studioHref: "/studio?module=fidelite",
        detailHref: "/fidelite-communaute",
        detailLabel: "📖 Voir Fidélité & Jackpot",
        steps: [
          { t: "1 · Comptoir ou sac livraison", d: "Tamponnez en 2 secondes sur l’écran Caisse, via le code tournant comptoir ou un QR en sac à emporter." },
          { t: "2 · L’objectif reste visible", d: "Le client voit ses points grimper et son prochain cadeau approcher : il ne veut pas le laisser dormir." },
          { t: "3 · Il parraine ses proches", d: "D’un clic sur WhatsApp, il invite ses amis — les points ne tombent qu’à la vraie 1re visite." },
        ],
        psyLever: "Effet palier (Goal-Gradient) & statut acquis à vie",
        psyText: "Plus un client se sent proche d’une récompense visible (« 400 / 500 pts »), plus il accélère sa prochaine visite pour ne pas « perdre » son effort. En dissociant les points dépensés du rang Bronze / Argent / Or acquis à vie, vous éliminez la déception de repartir à zéro.",
        cases: [
          { biz: "🍝 Bistro & Burger · Habitués du midi", setup: "Activez 100 pts par visite et un palier dessert ou menu à 500 pts (le rang Bronze, Argent ou Or reste acquis à vie même points dépensés).", outcome: "À 300 pts, le salarié choisit votre terrasse plutôt que le voisin pour boucler ses 2 derniers passages — sans jamais chercher de carte en carton oubliée." },
          { biz: "🛍️ Boutique locale · Comptoir & à emporter", setup: "Tamponnez en 2 sec depuis votre écran Caisse (ou laissez le code tournant comptoir affiché sous plexi).", outcome: "Chaque passage rapproche d’une récompense concrète : le client épingle votre carte sur son écran d’accueil ou Google Wallet et partage son lien à ses proches." },
        ],
        synergies: [
          { target: "jackpot-collectif", emoji: "🎰", name: "Avec Jackpot collectif", why: "Chaque passage de fidélité fait aussi grimper la cagnotte commune de votre établissement." },
          { target: "calendrier", emoji: "🗓️", name: "Avec Calendrier", why: "Ajoutez des surprises saisonnières pour rappeler votre commerce chaque matin aux habitués." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Zéro carte perdue", icon: "📔", title: "Toujours dans sa poche", text: "En 1 geste, le client épingle votre Passeport sur son écran d’accueil ou Google Wallet.", chips: ["Écran d’accueil", "Google Wallet"] },
          { tag: "Scène 2 · Effet palier", icon: "🥇", title: "« Plus que 2 visites ! »", text: "Plus le cadeau approche, plus le client accélère son retour chez vous.", chips: ["300 pts -> 500 pts", "Statut Or à vie"] },
          { tag: "Scène 3 · Ambassadeur", icon: "🤝", title: "Il amène ses amis en direct", text: "Son lien personnel est validé uniquement quand son ami vient réellement consommer.", chips: ["Budget protégé", "Bouche-à-oreille"] },
        ],
      },
      {
        id: "calendrier",
        accent: "#ffd93d",
        accentSoft: "#fff4cc",
        emoji: "🗓️",
        title: "Calendrier",
        surtitre: "MODULE 03 · SIMPLE COMME CALENDRIER SURPRISE",
        subtitle: "Restez dans la tête de vos clients tous les matins sans jamais les harceler de pubs : une case mystère à ouvrir chaque jour (Avent, anniversaire, soldes).",
        offerBadge: "✓ Inclus Le Club (59 €) & La Totale · Pass 29 € / 31j",
        pitchLead: "Comment faire penser à votre commerce — ou animer vos équipes en entreprise / CE — sans jamais harceler ? En créant un petit rituel qu’ils attendent eux-mêmes. Pendant 7, 14 ou 31 jours, vos clients ou salariés ouvrent leur case du jour sur leur téléphone. Vous choisissez librement chaque surprise (disponible à l'unité à 29 €).",
        kpis: [
          { val: "1 à 31 jours", lbl: "Avent, mois anniversaire, soldes, rentrée" },
          { val: "Horloge serveur", lbl: "1 ouverture par jour, anti-triche garanti" },
          { val: "Tour de roue lié", lbl: "Chaque case peut offrir un lot ou une partie" },
        ],
        emulateMode: "calendrier",
        studioHref: "/studio?module=calendrier",
        detailHref: "/jeux-pronostics#calendrier-surprise",
        detailLabel: "📖 Voir le Calendrier",
        steps: [
          { t: "1 · Choisissez vos dates & lots", d: "7, 12, 24 ou 31 jours : glissez vos petites attentions sur les jours calmes de la semaine." },
          { t: "2 · Un réflexe chaque matin", d: "Vos clients ouvrent la case du jour directement depuis l’icône sur leur écran d’accueil." },
          { t: "3 · Retour en boutique", d: "Leur surprise du jour s’utilise chez vous en caisse et déclenche une visite qu’ils n’avaient pas prévue." },
        ],
        psyLever: "Habitude quotidienne volontaire & curiosité matinale",
        psyText: "Recevoir un SMS promotionnel non sollicité agace ; ouvrir soi-même sa case mystère du matin déclenche une micro-sécrétion de curiosité. Votre enseigne devient le petit rituel plaisir du café matinal — zéro harcèlement, mémorisation maximale.",
        cases: [
          { biz: "🍫 Chocolatier / Épicerie · 1er au 24 décembre", setup: "Remplissez 24 cases en 5 min : douceurs maison et tours de roue les jours creux (mardi/mercredi), super-lot d’assiduité le 24.", outcome: "Vos clients ouvrent eux-mêmes votre enseigne chaque matin au café (horloge serveur anti-triche) et viennent retirer leurs surprises en boutique." },
          { biz: "👕 Prêt-à-porter · Mois anniversaire ou avant-soldes", setup: "Choisissez 7 ou 14 jours au Studio Calendrier et programmez des attentions progressives valables sur vos jours calmes.", outcome: "Zéro SMS intrusif : c’est la curiosité matinale du client qui le ramène spontanément essayer la nouvelle collection." },
        ],
        synergies: [
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Reliez le calendrier à vos habitués pour multiplier les passages sur tout le mois." },
          { target: "ticket-dor", emoji: "🎟️", name: "Avec Ticket d’Or", why: "Remettez un Ticket d’Or en caisse pour prolonger l’élan dès le mois suivant." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Le Rituel", icon: "🗓️", title: "Votre enseigne sur son écran", text: "Le client retrouve votre calendrier chaque matin d’un simple geste, sans appli.", chips: ["Habitude douce", "Thème saisonnier"] },
          { tag: "Scène 2 · Case du Jour", icon: "🎁", title: "La case du matin s’illumine", text: "Un tap dévoile la surprise du jour — ou un lancer offert sur votre Roue !", chips: ["1 ouverture/jour", "Anti-triche serveur"] },
          { tag: "Scène 3 · Jours Calmes Remplis", icon: "🛍️", title: "Du trafic quand vous en avez besoin", text: "Programmez vos meilleures petites attentions le mardi ou mercredi pour lisser vos ventes.", chips: ["Heures creuses", "Assiduité récompensée"] },
        ],
      },
      {
        id: "evenements-live",
        accent: "#c4a3ff",
        accentSoft: "#f1e9ff",
        emoji: "🎤",
        title: "Événements live",
        surtitre: "MODULE 04 · SIMPLE COMME SOIRÉE LIVE",
        subtitle: "Votre mardi ou jeudi soir mérite mieux qu’une salle à moitié vide : transformez votre TV en vrai plateau télé où toute la salle joue ensemble.",
        offerBadge: "✓ Inclus Le Grand Jeu (89 €) & La Totale · Pass dès 9 €",
        pitchLead: "Organiser une soirée quiz avec papier, stylos et micro demande des heures et tourne vite au chaos. Avec Événements live, vous branchez votre TV, vous pilotez depuis votre téléphone et jusqu’à 250 personnes buzzent en direct. Les tables s’enflamment autour du classement, commandent une tournée de plus pour la manche suivante et réservent déjà pour la semaine d’après.",
        kpis: [
          { val: "Jusqu’à 250", lbl: "Joueurs simultanés mesurés et garantis" },
          { val: "Régie mobile", lbl: "Télécommande animateur sur votre téléphone" },
          { val: "Pass dès 9 €", lbl: "10, 30 ou 50 joueurs en achat ponctuel" },
        ],
        emulateMode: "evenements-live",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Affichez l’écran géant", d: "Ouvrez la vue TV sur votre téléviseur ou vidéoprojecteur en 1 clic." },
          { t: "2 · Toute la salle rejoint en 5 s", d: "Chaque client scanne le QR projeté, choisit son pseudo et voit son nom apparaître à l’écran." },
          { t: "3 · Vous lancez le rythme", d: "Depuis votre télécommande mobile, vous enchaînez les questions jusqu’au podium final !" },
        ],
        psyLever: "Effervescence collective & compétition bienveillante",
        psyText: "Voir son propre pseudo grimper sur l’écran TV devant toute la salle crée une tension joyeuse : aucune table ne quitte son siège avant la dernière question. Plus le groupe reste tard pour défendre sa place sur le podium, plus les consommations s’enchaînent.",
        cases: [
          { biz: "🍻 Bar & Brasserie · Mardi soir 20 h", setup: "Affichez la vue TV du lieu sur votre téléviseur, lancez un quiz ou blind test déjà prêt et pilotez depuis votre téléphone.", outcome: "En 30 s, toutes les tables scannent le QR projeté : l’ambiance plateau télé dure 45 min, personne ne part avant le podium et les tournées suivent." },
          { biz: "🎳 Bowling / Club / Séminaire · Soirée groupe", setup: "Ouvrez une salle jusqu’à 250 joueurs simultanés sans micro ni feuille papier, et annoncez le Top 3 depuis votre régie mobile.", outcome: "Animation fluide de bout en bout pour vos soirées d’entreprise ou anniversaires, avec souvenir mémorable associé à votre adresse." },
        ],
        synergies: [
          { target: "quiz", emoji: "❓", name: "Avec Quiz", why: "Réutilisez vos questionnaires maison en autonomie la semaine et en grand show le soir." },
          { target: "pronostics", emoji: "🏆", name: "Avec Pronostics", why: "Animez l’avant-match ou la mi-temps sur grand écran pour garder toute la salle captivée." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Projection TV", icon: "📺", title: "La salle se connecte ensemble", text: "Les pseudos de chaque table apparaissent sur votre écran : l’ambiance monte déjà.", chips: ["Bar · Resto · Salle", "Mode Écran Géant"] },
          { tag: "Scène 2 · Buzzer en Direct", icon: "🎤", title: "Tout le monde répond en rythme", text: "Chrono partagé : les plus vifs prennent la tête sous les acclamations des tables.", chips: ["Jusqu’à 250 joueurs", "Télécommande mobile"] },
          { tag: "Scène 3 · Soirée Prolongée", icon: "🍻", title: "Vos clients restent jusqu’au podium", text: "Les groupes prolongent autour d’un verre et font de votre lieu leur rendez-vous hebdo.", chips: ["Podium Top 3", "Ambiance mémorable"] },
        ],
      },
      {
        id: "pronostics",
        accent: "#5eb0ff",
        accentSoft: "#e2f1ff",
        emoji: "🏆",
        title: "Pronostics",
        surtitre: "MODULE 05 · SIMPLE COMME PRONOSTICS",
        subtitle: "Devenez le QG officiel des grands matchs : vos clients pronostiquent sur votre ligue privée, se chambrent au classement et reviennent toute la saison.",
        offerBadge: "✓ Inclus Le Grand Jeu (89 €) & La Totale · Pass 39 € / compétition",
        pitchLead: "Pendant la Ligue des champions, le Top 14, la Coupe du monde, Top Chef ou l’Eurovision, vos clients ou collaborateurs parlent déjà des résultats. En créant votre ligue privée maison (disponible à l'unité pour commerces, entreprises et CE pour leurs salariés), vous leur donnez une raison concrète de revenir chaque semaine vérifier leur place au classement.",
        kpis: [
          { val: "Pass 39 € unique", lbl: "Couvre toute une compétition (jusqu’à 12 mois)" },
          { val: "Verrouillage auto", lbl: "Scores figés à la seconde du coup d’envoi" },
          { val: "Vue TV incluse", lbl: "Classement général projetable en salle" },
        ],
        emulateMode: "pronostics",
        studioHref: "/studio?module=pronostics",
        detailHref: "/jeux-pronostics#pronostics-championnats",
        detailLabel: "📖 Voir les compétitions",
        steps: [
          { t: "1 · Créez votre saison en 2 min", d: "Football, rugby, tennis, basket ou hors-sport : ajoutez les affiches et vos lots de podium." },
          { t: "2 · Pronostics avant le coup d’envoi", d: "Vos clients saisissent leurs scores sur téléphone ; tout se verrouille automatiquement au début du match." },
          { t: "3 · Classement & retours chaque semaine", d: "Les points tombent tout seuls et vos habitués reviennent vibrer ensemble à la journée suivante." },
        ],
        psyLever: "Rivalité amicale & effet rendez-vous hebdomadaire",
        psyText: "Un client seul regarde le match chez lui ; un client inscrit dans la ligue privée de son bar ou pizzeria vient vérifier son classement entre amis et défendre son honneur chaque semaine.",
        cases: [
          { biz: "🍕 Pizzeria & Bar de quartier · Ligue des Champions", setup: "Créez votre ligue privée maison en 2 min avec vos affiches et vos lots de podium — scores figés automatiquement au coup d’envoi.", outcome: "Vos clients se chambrent sur le classement projeté sur votre TV et reviennent chaque soir de match chez vous défendre leur podium." },
          { biz: "🎬 Café / Pub · Compétitions hors-sport (Eurovision, Top Chef)", setup: "Choisissez parmi nos 11 univers sportifs ou culturels (TV, cinéma, e-sport…) pour réunir toute votre clientèle.", outcome: "Même ceux qui ne suivent pas le foot rejoignent la compétition amicale et prennent l’habitude de revenir entre collègues." },
        ],
        synergies: [
          { target: "jackpot-collectif", emoji: "🎰", name: "Avec Jackpot collectif", why: "Faites monter la cagnotte commune à chaque soirée de match pour doubler l’enjeu." },
          { target: "evenements-live", emoji: "🎤", name: "Avec Événements live", why: "Lancez un quiz rapide à la mi-temps sur l’écran TV entre deux matchs." },
        ],
        motionScenes: [
          { tag: "Scène 1 · La Grille", icon: "⚽", title: "Chacun mise son score avant le match", text: "Score exact ou bon vainqueur : saisie en 10 secondes, verrouillée automatiquement au coup d’envoi.", chips: ["LDC · Ligue 1 · Top 14", "11 univers"] },
          { tag: "Scène 2 · La Rivalité Amicale", icon: "🏆", title: "Le classement crée le rendez-vous", text: "Entre amis ou collègues, personne ne veut perdre sa place sur le podium de votre commerce.", chips: ["Podium auto", "Vue TV en salle"] },
          { tag: "Scène 3 · Soirs de Match Pleins", icon: "🍕", title: "Votre salle devient leur QG", text: "Ils reviennent fêter leurs points ensemble et récupérer leurs récompenses en caisse.", chips: ["Visites récurrentes", "Ambiance stade"] },
        ],
      },
      {
        id: "jackpot-collectif",
        accent: "#ff9f43",
        accentSoft: "#fff0dd",
        emoji: "🎰",
        title: "Jackpot collectif",
        surtitre: "MODULE 06 · SIMPLE COMME JACKPOT COLLECTIF",
        subtitle: "Un seul gros lot maîtrisé, mais toute votre clientèle unie pour le faire tomber : quand la jauge atteint 100 %, le tirage au sort déclenche la fête !",
        offerBadge: "✓ Inclus Le Grand Jeu (89 €) & La Totale · Pass 29 € / 30j",
        pitchLead: "Dans une loterie classique, chacun joue dans son coin. Avec le Jackpot collectif, vos clients découvrent une jauge partagée (« 44 / 50 visites — plus que 6 passages avant le tirage ! »). Effet immédiat sur le comportement humain : ils veulent voir la barre franchir les 100 %, en parlent à leurs amis et les entraînent chez vous pour faire sauter la cagnotte.",
        kpis: [
          { val: "Jauge partagée", lbl: "Progression visible en direct par tous" },
          { val: "1 seul gros lot", lbl: "Coût connu d’avance, impact viral maximal" },
          { val: "Pass 29 € / 30j", lbl: "Ou illimité dès Le Grand Jeu (89 €)" },
        ],
        emulateMode: "jackpot",
        studioHref: "/studio?module=fidelite",
        detailHref: "/fidelite-communaute",
        detailLabel: "📖 Voir Fidélité & Jackpot",
        steps: [
          { t: "1 · Fixez votre lot & votre objectif", d: "Ex. 50 passages pour déclencher un dîner pour deux, un panier gourmand ou un bon d’achat." },
          { t: "2 · Chaque visite fait grimper la barre", d: "Au comptoir ou via le Passeport fidélité, chaque client ajoute sa pierre à la cagnotte commune." },
          { t: "3 · Tirage transparent à 100 %", d: "Dès l’objectif atteint, un gagnant est tiré au sort parmi tous les participants — et la fête recommence !" },
        ],
        psyLever: "Objectif partagé & preuve sociale en temps réel",
        psyText: "Voir une barre commune à 88 % réveille l’instinct d’équipe : chacun veut être celui qui pousse la jauge vers les 100 % et entraîne ses amis chez vous pour multiplier ses chances tout en faisant exploser votre fréquentation.",
        cases: [
          { biz: "🥐 Boulangerie / Café · Mois calme de février", setup: "Fixez 1 seul gros lot (brunch pour 4 ou panier gourmand) et un objectif de 50 ou 100 passages validés en caisse.", outcome: "Quand la jauge commune affiche 88 %, vos habitués entraînent leurs amis chez vous pour faire sauter la barre — coût maîtrisé, effet viral maximal." },
          { biz: "🛍️ Concept store · Week-end anniversaire", setup: "Affichez la jauge cagnotte en vitrine et au comptoir ; chaque passage ajoute sa pierre jusqu’au tirage automatique à 100 %.", outcome: "Moment de fête de quartier autour de votre enseigne : les clients de passage reviennent voir la cagnotte tomber." },
        ],
        synergies: [
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Chaque passage de fidélité nourrit deux jauges à la fois : sa carte perso et la cagnotte collective." },
          { target: "jeux-instantanes", emoji: "🎡", name: "Avec Jeux instantanés", why: "Combinez petits gains immédiats au quotidien et grand tirage collectif qui fait rêver." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Jauge à 88 %", icon: "📊", title: "Toute votre communauté regarde la barre", text: "« Plus que 6 visites avant le tirage ! » La tension positive monte dans tout le quartier.", chips: ["44 / 50 passages", "Lot phare en vue"] },
          { tag: "Scène 2 · Déblocage 100 %", icon: "🎰", title: "Le dernier passage fait sauter la cagnotte !", text: "Confettis et tirage au sort équitable parmi tous ceux qui ont participé.", chips: ["100 % atteint !", "Tirage automatique"] },
          { tag: "Scène 3 · Nouveau Cycle", icon: "🚀", title: "Tout le monde en parle & revient", text: "Un seul beau lot offert qui crée un vrai moment de fierté communautaire autour de votre lieu.", chips: ["Esprit de bande", "Budget maîtrisé"] },
        ],
      },
      {
        id: "quiz",
        accent: "#84c4ff",
        accentSoft: "#e6f3ff",
        emoji: "❓",
        title: "Quiz",
        surtitre: "MODULE 07 · SIMPLE COMME QUIZ",
        subtitle: "Faites aimer votre métier en 5 questions rapides : vos clients jouent en autonomie pendant l’attente, découvrent vos coulisses et remportent leur récompense.",
        offerBadge: "✓ Inclus Le Club, Sur Place, Le Grand Jeu & La Totale · Pass 15 € / 7j",
        pitchLead: "Vos clients connaissent rarement toute l’histoire derrière votre savoir-faire, vos producteurs ou vos nouveautés. Un quiz court de 3 à 5 questions transforme 2 minutes d’attente en découverte ludique : chaque bonne réponse apporte une anecdote valorisante qui justifie vos prix et donne envie de goûter ou d’essayer votre produit phare.",
        kpis: [
          { val: "100 % autonome", lbl: "Correction instantanée sur le téléphone" },
          { val: "Valorise votre métier", lbl: "Racontez vos coulisses & produits phares" },
          { val: "Pass 15 € / 7j", lbl: "Ou inclus dans 4 de nos 5 formules" },
        ],
        emulateMode: "quiz",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Écrivez 3 à 10 questions", d: "Sur votre carte, vos terroirs, vos soins, votre quartier ou un thème de saison." },
          { t: "2 · Vos clients jouent en attendant", d: "Correction directe avec une petite anecdote après chaque clic : on sourit et on apprend." },
          { t: "3 · Code gain en caisse", d: "Les meilleurs scores (ou tous les participants selon votre règle) débloquent un code à retirer chez vous." },
        ],
        psyLever: "Fierté de réussir & valorisation de la valeur perçue",
        psyText: "Quand un client découvre l’origine de votre farine, de votre torréfaction ou de votre savoir-faire à travers une anecdote ludique, votre produit cesse d’être banalisé par le prix : il ressent de la fierté à le choisir et savoure davantage son cadeau mérité.",
        cases: [
          { biz: "🍷 Caviste & Fromager · Pendant la mise en panier", setup: "Écrivez 4 questions rapides sur vos terroirs et producteurs avec une petite anecdote valorisante à chaque bonne réponse.", outcome: "Les 2 min d’attente instruisent et amusent : le client comprend pourquoi votre sélection vaut son prix et repart souvent avec la cuvée évoquée." },
          { biz: "🧁 Artisan glacier / Pâtissier · Lancement carte d’été", setup: "Laissez le quiz accessible sur table en autonomie avec un mini-topping ou café offert en code caisse dès 3/4.", outcome: "Le client savoure d’autant plus son lot qu’il l’a gagné par sa curiosité — forte progression de la mémorisation de vos spécialités." },
        ],
        synergies: [
          { target: "jeux-instantanes", emoji: "🎡", name: "Avec Jeux instantanés", why: "Offrez un lancer de roue en récompense à ceux qui réussissent votre quiz." },
          { target: "evenements-live", emoji: "🎤", name: "Avec Événements live", why: "Passez votre quiz sur grand écran le vendredi soir pour en faire un tournoi en salle !" },
        ],
        motionScenes: [
          { tag: "Scène 1 · La Question", icon: "❓", title: "2 minutes d’attente qui passent vite", text: "Interface claire sur mobile : le client se prend immédiatement au jeu.", chips: ["Votre savoir-faire", "30s à 1 min"] },
          { tag: "Scène 2 · L’Anecdote", icon: "💡", title: "Il découvre la qualité de vos produits", text: "Une petite explication fun donne envie de commander votre spécialité maison.", chips: ["Valeur perçue +", "Pédagogie douce"] },
          { tag: "Scène 3 · La Fierté", icon: "🎁", title: "Un lot qu’il a mérité", text: "Réussir le quiz rend le cadeau encore plus précieux et encourage le retrait en caisse.", chips: ["Code caisse unique", "Podium clients"] },
        ],
      },
      {
        id: "chasse-au-qr",
        accent: "#5de4b3",
        accentSoft: "#e2fbf0",
        emoji: "🗺️",
        title: "Chasse au QR",
        surtitre: "MODULE 08 · SIMPLE COMME CHASSE AU QR",
        subtitle: "Un rayon peu visité, un étage méconnu ou plusieurs commerces partenaires ? Faites circuler vos visiteurs de QR en QR jusqu’au trésor final.",
        offerBadge: "✓ Inclus Le Club (59 €) & La Totale (129 €) · Pass 29 € / 30j",
        pitchLead: "Dans toute boutique ou salon, 80 % des clients suivent toujours le même trajet et passent à côté de vos nouveautés ou du fond du magasin. Placez 2 à 10 QR codes aux endroits stratégiques (ou entre voisins d’une même rue commerçante) : l’instinct d’exploration pousse vos visiteurs à tout parcourir pour compléter leur carte et ouvrir le coffre final en caisse.",
        kpis: [
          { val: "2 à 10 étapes", lbl: "Parcours libre ou dans l’ordre d’indices" },
          { val: "Multi-lieux possible", lbl: "Idéal boutiques, domaines ou rues commerçantes" },
          { val: "Pass 29 € / 30j", lbl: "Parfait pour vacances, braderies ou salons" },
        ],
        emulateMode: "chasse-au-qr",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Imprimez & placez vos balises", d: "Près de vos nouveautés, en terrasse, à l’étage ou chez des commerçants partenaires." },
          { t: "2 · Le client tamponne chaque étape", d: "Chaque scan allume une case sur sa carte de jeu et révèle l’indice du point suivant." },
          { t: "3 · Le trésor s’ouvre en caisse", d: "Une fois toutes les balises trouvées, le code récompense unique se déverrouille." },
        ],
        psyLever: "Curiosité spatiale & effet d’achèvement (Zeigarnik)",
        psyText: "Un parcours incomplet (« 3 / 5 balises validées ») crée une démangeaison positive d’aller chercher la suite. En guidant le pied du visiteur jusqu’à votre étage ou vos rayons moins exposés, vous augmentez mécaniquement le temps passé sur place et les achats coups de cœur.",
        cases: [
          { biz: "🏺 Déco, Librairie & Magasin à étage", setup: "Imprimez 4 balises QR (entrée, coin lecture, étage, comptoir) avec un indice amusant reliant chaque recoin.", outcome: "Portés par l’envie de boucler les 4 étapes, vos visiteurs explorent le fond du magasin et montent à l’étage où ils repèrent vos coups de cœur." },
          { biz: "🏘️ Association de rue commerçante · Salon ou braderie", setup: "Placez 1 balise par boutique partenaire ; le coffre final se débloque une fois toutes les étapes validées.", outcome: "Flux croisés mesurés d’une vitrine à l’autre : chaque commerçant bénéficie des visites générées par le parcours commun." },
        ],
        synergies: [
          { target: "missions-coffres", emoji: "🗝️", name: "Avec Missions & coffres", why: "Boucler la Chasse au QR fait avancer les missions et rapporte des clés de coffre." },
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Transformez les explorateurs d’un jour en membres réguliers de votre club fidélité." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Départ", icon: "🗺️", title: "L’envie de tout trouver s’enclenche", text: "Le visiteur scanne la balise #1 et voit sa carte de parcours prête à être complétée.", chips: ["Zéro appli", "Parcours balisé"] },
          { tag: "Scène 2 · Exploration", icon: "📍", title: "Il découvre chaque zone clé", text: "En cherchant la balise suivante, il remarque vos nouveautés et rayons méconnus.", chips: ["Tous vos espaces", "Indices ludiques"] },
          { tag: "Scène 3 · Coffre Final", icon: "🏆", title: "Dernière balise scannée → Trésor !", text: "Il repart fier de son parcours avec un code cadeau validé en caisse.", chips: ["Découverte complète", "Souvenir mémorable"] },
        ],
      },
      {
        id: "duo-miroir",
        accent: "#ff7eb6",
        accentSoft: "#ffe8f3",
        emoji: "🪞",
        title: "Duo Miroir",
        surtitre: "MODULE 09 · SIMPLE COMME DUO MIROIR",
        subtitle: "10 minutes d’attente à table peuvent vite paraître longues. Transformez-les en éclats de rire complices pour vos couples, amis ou collègues — sans offrir un seul lot.",
        offerBadge: "✓ Inclus dans les 5 formules (ou 12 €/mois seul)",
        pitchLead: "En restauration, en café ou en salle d’attente, l’ennui pendant l’attente abîme l’impression générale — même si le plat est délicieux. Posez simplement votre QR code sur la table : deux convives ouvrent un salon privé, répondent chacun en secret et éclatent de rire quand leurs réponses se révèlent en même temps. Zéro budget cadeau, 100 % bonne humeur associée à votre adresse.",
        kpis: [
          { val: "2 joueurs", lbl: "Salon privé relié en 5 secondes" },
          { val: "Réponses scellées", lbl: "Révélation simultanée des deux avis" },
          { val: "0 € de budget lot", lbl: "Inclus d’office dans les 5 formules" },
        ],
        emulateMode: "duo-miroir",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Un petit QR sur vos tables", d: "Joueur 1 scanne et ouvre le salon ; Joueur 2 le rejoint aussitôt depuis son téléphone." },
          { t: "2 · Chacun répond en secret", d: "Impossible de tricher : les choix restent scellés jusqu’à ce que les deux aient voté." },
          { t: "3 · Révélation & fous rires", d: "L’écran dévoile leur complicité : l’attente disparaît et l’ambiance de la table décolle !" },
        ],
        psyLever: "Complicité émotionnelle & effacement du temps d’attente",
        psyText: "Quand deux personnes rient ensemble devant une révélation complice, l’attente n’existe plus : ce ressenti positif se transfère directement sur l’accueil, l’assiette et le souvenir de votre établissement.",
        cases: [
          { biz: "🍽️ Restaurant · Table de 2 à 20 h 30", setup: "Posez simplement le chevalet QR Duo Miroir sur table — inclus d’office dans les 5 formules avec 0 € de lot à financer.", outcome: "Entre l’entrée et le plat, les 2 convives rejoignent le même salon en 5 s, votent en secret et éclatent de rire : l’attente disparaît totalement." },
          { biz: "💇 Salon / Lounge · Client(e) & accompagnant", setup: "Posez le QR au coin café d’attente ; aucune création de compte ni validation en caisse nécessaire.", outcome: "L’accompagnant ne regarde plus sa montre, l’accueil paraît plus chaleureux et le souvenir positif rejaillit sur la note Google." },
        ],
        synergies: [
          { target: "portrait-de-la-bande", emoji: "👥", name: "Avec Portrait de la Bande", why: "Duo Miroir pour vos tables de 2, Portrait de la Bande pour vos grandes tablées d’amis." },
          { target: "ticket-dor", emoji: "🎟️", name: "Avec Ticket d’Or", why: "Glissez un Ticket d’Or avec l’addition pour les faire revenir dès la semaine suivante." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Le Salon à 2", icon: "📱", title: "Deux téléphones reliés en 5 secondes", text: "Posé sur table ou au comptoir, le QR lance une partie privée sans création de compte.", chips: ["Zéro appli", "Zéro lot à payer"] },
          { tag: "Scène 2 · Choix Scellés", icon: "🪞", title: "Chacun répond de son côté", text: "Le suspense monte entre les deux convives pendant que les plats arrivent.", chips: ["Questions complices", "L’attente s’efface"] },
          { tag: "Scène 3 · Révélation", icon: "🎭", title: "Éclat de rire à table !", text: "Ils associent ce super moment à votre établissement — et en parlent sur Google.", chips: ["88 % Raccord", "Accueil mémorable"] },
        ],
      },
      {
        id: "portrait-de-la-bande",
        accent: "#c4a3ff",
        accentSoft: "#f1e9ff",
        emoji: "👥",
        title: "Portrait de la Bande",
        surtitre: "MODULE 10 · SIMPLE COMME PORTRAIT DE LA BANDE",
        subtitle: "Le jeu d’ambiance qui enflamme vos afterworks et dîners entre amis : chacun vote en secret, la réponse ne se révèle qu’à partir de 3 voix !",
        offerBadge: "✓ Inclus dans les 5 formules (ou 12 €/mois seul)",
        pitchLead: "Vos grandes tables d’amis, familles ou collègues sont vos meilleurs clients — plus l’ambiance est chaleureuse, plus ils restent et commandent un dessert ou une tournée de plus. Portrait de la Bande fait voter tout le monde en secret sur des questions décalées (« Qui met 20 minutes à choisir la carte ? ») : débats amicaux, rires garantis et zéro coût matière pour vous.",
        kpis: [
          { val: "2 à 12 joueurs", lbl: "Parfait grandes tables, familles & afterworks" },
          { val: "Seuil 3 voix", lbl: "Révélation secrète dès 3 votes enregistrés" },
          { val: "0 € de coût", lbl: "Inclus d’office dans les 5 formules" },
        ],
        emulateMode: "portrait-de-la-bande",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Un convive ouvre la salle", d: "Un scan sur table crée la partie de 2 à 12 joueurs en 5 secondes, sans rien télécharger." },
          { t: "2 · Tout le monde vote sous la table", d: "Chacun désigne secrètement qui dans la bande correspond le mieux à chaque portrait." },
          { t: "3 · Révélation & débats complices", d: "Dès 3 votes, le résultat tombe et la tablée éclate de rire autour de son verre !" },
        ],
        psyLever: "Dynamique de groupe & prolongation spontanée des tournées",
        psyText: "Dans une bande d’amis, personne ne veut couper l’ambiance au milieu d’un fou rire collectif : on commande encore une tournée ou un dessert partagé pour commenter les votes secrets. Votre lieu devient leur « adresse signature ».",
        cases: [
          { biz: "🍹 Bar / Tapas · Vendredi apéro (6 à 12 collègues)", setup: "Posez le QR sur vos grandes tablées : dès que 3 amis ont voté secrètement sur la question du tour, le résultat se révèle.", outcome: "Les fous rires enchaînent les débats bienveillants — la bande venue « juste prendre un verre » reste dîner et prolonge sa soirée." },
          { biz: "🎂 Brasserie / Bowling · Dîners d’anniversaire", setup: "Aucune gestion serveur ni coût matière : 2 à 12 joueurs lancent leur salon privé depuis leur propre smartphone.", outcome: "Votre lieu s’impose comme leur QG festif naturel sans jamais monopoliser votre équipe pendant le coup de feu." },
        ],
        synergies: [
          { target: "duo-miroir", emoji: "🪞", name: "Avec Duo Miroir", why: "Toutes vos tailles de tables sont animées : à 2 comme à 12, sans rien acheter en plus." },
          { target: "evenements-live", emoji: "🎤", name: "Avec Événements live", why: "Lancez Portrait de la Bande à l’apéro pour chauffer les tables avant le grand quiz TV !" },
        ],
        motionScenes: [
          { tag: "Scène 1 · Grande Tablée", icon: "👥", title: "Jusqu’à 12 amis sur le même salon", text: "Aucun matériel à prêter ni à ranger : tout le monde joue depuis son smartphone.", chips: ["2 à 12 joueurs", "5s pour rejoindre"] },
          { tag: "Scène 2 · Votes Secrets", icon: "🗳️", title: "Chacun vote discrètement", text: "« Qui oublie toujours sa veste ? » Personne ne sait qui a voté pour qui avant la révélation.", chips: ["Seuil 3 votes", "Fous rires"] },
          { tag: "Scène 3 · Couronnement", icon: "🏆", title: "Votre lieu devient leur QG", text: "Une soirée réussie qui donne envie de prolonger et de revenir pour le prochain anniversaire.", chips: ["Tournée en plus", "Souvenir de bande"] },
        ],
      },
      {
        id: "ticket-dor",
        accent: "#ffd93d",
        accentSoft: "#fff4cc",
        emoji: "🎟️",
        title: "Ticket d’Or",
        surtitre: "MODULE 11 · SIMPLE COMME TICKET D’OR",
        subtitle: "Sur Uber Eats ou Deliveroo, vous payez jusqu’à 30 % de commission et le client appartient à la plateforme. Glissez un Ticket d’Or QR dans le sac pour le faire revenir chez vous en direct !",
        offerBadge: "✓ Inclus dans les 5 formules (socle commercial)",
        pitchLead: "Vendredi 20 h 15 : une commande à emporter ou Uber Eats / Deliveroo quitte votre commerce. Sans accroche dans le sac, ce client reste prisonnier de la plateforme. Avec le Ticket d’Or, vous imprimez vos tickets QR uniques et en glissez un dans le sac (ou avec l’addition). Chez lui, le client scanne le QR, découvre un privilège valable 30 jours (réglable de 1 à 180 jours) mémorisé sur son téléphone — et pour ne pas « perdre » son cadeau, il revient commander directement chez vous !",
        kpis: [
          { val: "100 % au scan QR", lbl: "Usage unique sécurisé serveur, jamais à gratter" },
          { val: "Uber & Deliveroo", lbl: "Convertit vos livraisons en clients directs" },
          { val: "Durée réglable", lbl: "Validité de 1 à 180 jours (défaut 30 j)" },
        ],
        emulateMode: "ticket-dor",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Réglez vos lots & imprimez vos QR", d: "Fixez chaque lot (poids, stock limité ou illimité, durée de validité) et imprimez vos tickets QR." },
          { t: "2 · Glissez-le dans le sac ou l’addition", d: "En caisse, en Click & Collect ou dans un sachet Uber Eats / Deliveroo : le client le scanne chez lui." },
          { t: "3 · Il revient le présenter en caisse", d: "Son code de retrait reste mémorisé sur son téléphone et vous le validez en 1 clic sur votre écran Caisse !" },
        ],
        psyLever: "Effet dotation & aversion à laisser expirer son privilège",
        psyText: "Dès que le client scanne son Ticket d’Or chez lui, son gain devient « le sien ». La peur humaine de laisser périmer un privilège acquis (avant 30 jours) le pousse à pousser votre porte ou vous appeler en direct — sans repasser par Uber Eats / Deliveroo.",
        cases: [
          { biz: "🍔 Burger, Sushi & À emporter · Soirées Uber Eats / Deliveroo", setup: "Fixez vos lots (poids, stock, durée réglable de 1 à 180 j, défaut 30 j), imprimez vos tickets QR uniques et glissez-en 1 dans chaque sac.", outcome: "Chez lui, le client scanne le QR (zéro grattage, code unique mémorisé sur téléphone) et revient commander chez vous en direct à 0 % de commission pour ne pas perdre son privilège." },
          { biz: "✂️ Boutique & Commerce local · Avec le ticket de caisse", setup: "Remettez 1 Ticket d’Or imprimé avec le sac d’achat, puis validez son code en 1 clic quand il revient en boutique.", outcome: "Vous transformez un acheteur occasionnel en deuxième visite rapprochée au lieu d’attendre les prochaines soldes." },
        ],
        synergies: [
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Quand votre ancien client Uber Eats revient retirer son Ticket d’Or, créez son Passeport en 2 secondes !" },
          { target: "missions-coffres", emoji: "🗝️", name: "Avec Missions & coffres", why: "Chaque retrait alimente naturellement l’habitude de revenir en direct." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Sac livraison ou caisse", icon: "📦", title: "Glissé dans un sac Uber Eats / Deliveroo", text: "Votre client ouvre sa commande chez lui et découvre un mystérieux Ticket d’Or QR.", chips: ["QR unique", "Comptoir & livraison"] },
          { tag: "Scène 2 · Scan à la maison", icon: "📱", title: "Il scanne & découvre son privilège", text: "Dessert maison, boisson ou remise : le tirage unique s’affiche et reste mémorisé sur son mobile.", chips: ["Code retrait unique", "Valable 30 jours"] },
          { tag: "Scène 3 · Retour en direct (0 % com)", icon: "🔁", title: "Il revient chez vous pour ne pas le perdre", text: "Il présente son code en caisse : un client plateforme vient de devenir un habitué direct !", chips: ["0 % commission", "Usage unique vérifié"] },
        ],
      },
      {
        id: "missions-coffres",
        accent: "#65e6b5",
        accentSoft: "#e4fbf2",
        emoji: "🗝️",
        title: "Missions & coffres",
        surtitre: "MODULE 12 · SIMPLE COMME MISSIONS & COFFRES",
        subtitle: "Le lien secret qui multiplie l’effet de tous vos modules : chaque partie ou visite fait avancer des missions toutes seules et donne des clés ouvrant de vrais coffres.",
        offerBadge: "✓ Inclus automatiquement dans les 5 formules",
        pitchLead: "Les grandes applications comme Duolingo ou Starbucks gardent leurs utilisateurs grâce à un ressort humain universel : quand une barre de progression est déjà à 2 sur 3, on a irrésistiblement envie de la terminer. Missions & coffres applique ce mécanisme automatiquement sur vos modules — vos clients jouent, cumulent des clés dorées et reviennent ouvrir leurs coffres cadeaux sans aucun travail supplémentaire pour vous.",
        kpis: [
          { val: "100 % automatique", lbl: "Avance tout seul au fil des parties" },
          { val: "Clés & Coffres", lbl: "Effet « plus qu’une clé avant le coffre ! »" },
          { val: "Inclus sans surcoût", lbl: "Relie automatiquement vos modules actifs" },
        ],
        emulateMode: "missions-coffres",
        studioHref: "/signup",
        detailHref: "",
        detailLabel: "",
        steps: [
          { t: "1 · Vous ne gérez rien au quotidien", d: "Vos clients jouent à vos jeux, ouvrent votre calendrier, font un quiz ou une chasse au QR." },
          { t: "2 · Leurs missions avancent seules", d: "Chaque action validée leur rapporte des clés qui s’accumulent sur leur profil." },
          { t: "3 · Le coffre s’ouvre en récompense", d: "Une fois les clés réunies, le client déverrouille son coffre et vient profiter de son lot chez vous !" },
        ],
        psyLever: "Progression en fil rouge & gratification cumulative",
        psyText: "Au lieu d’un jeu isolé vite oublié, chaque visite laisse une trace concrète (« 2 clés sur 3 ! »). Ce sentiment d’avancer transforme plusieurs petits interactions en une véritable quête agréable auprès de votre enseigne.",
        cases: [
          { biz: "☕ Tout commerce · Client multi-modules", setup: "Rien à gérer au quotidien : dès qu’un module est actif, les quêtes attribuent automatiquement des clés sur le profil joueur.", outcome: "Lundi un quiz, jeudi une roue : le client voit « Plus qu’une clé avant mon coffre ! » et revient boucler sa saison chez vous." },
          { biz: "🛍️ Boulangerie / Retail · Habitués de la semaine", setup: "Réglez simplement le coffre récompense final (validable en caisse) ; le moteur relie vos jeux, calendrier et fidélité tout seul.", outcome: "Crée un fil rouge engageant façon grande enseigne (fidélité + quêtes + récompense) sans une seule minute de gestion en plus." },
        ],
        synergies: [
          { target: "chasse-au-qr", emoji: "🗺️", name: "Avec Chasse au QR", why: "Boucler un parcours valide une mission clé vers le coffre supérieur." },
          { target: "passeport-fidelite", emoji: "📔", name: "Avec Passeport fidélité", why: "Double motivation : les points du Passeport + les clés de saison qui donnent envie d’explorer." },
        ],
        motionScenes: [
          { tag: "Scène 1 · Les Quêtes", icon: "📋", title: "« Plus qu’une clé avant mon coffre ! »", text: "Une progression visuelle limpide qui donne envie de revenir finir la saison.", chips: ["2 / 3 clés", "Effet progression"] },
          { tag: "Scène 2 · Clé Obtenue", icon: "🗝️", title: "Un passage valide la dernière clé", text: "Satisfaction immédiate : le client ressent qu’il a accompli un vrai défi chez vous.", chips: ["3 clés réunies !", "100 % automatique"] },
          { tag: "Scène 3 · Coffre Ouvert", icon: "🧰", title: "Le coffre libère son privilège", text: "Le client vient retirer sa récompense en caisse avec un vrai sentiment d’attachement.", chips: ["Code caisse unique", "Fidélité renforcée"] },
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

      modulesShowcaseEl.style.setProperty("--mod-accent", mod.accent || "#ffd93d");
      modulesShowcaseEl.style.setProperty("--mod-accent-soft", mod.accentSoft || "#fff4cc");

      const socialLogosBar = $("#mod-social-logos", modulesShowcaseEl);
      if (socialLogosBar) {
        socialLogosBar.hidden = !mod.showSocialLogos;
      }

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
      const psyLever = $("#mod-psy-lever", modulesShowcaseEl);
      const psyText = $("#mod-psy-text", modulesShowcaseEl);
      const casesGrid = $("#mod-cases-grid", modulesShowcaseEl);
      const synGrid = $("#mod-synergies-grid", modulesShowcaseEl);

      if (surtitre) surtitre.textContent = mod.surtitre;
      if (title) title.textContent = `${mod.emoji} ${mod.title}`;
      if (subtitle) subtitle.textContent = mod.subtitle;
      if (badge) badge.textContent = mod.offerBadge;
      if (pitchLead) pitchLead.textContent = mod.pitchLead;
      if (studioLink) studioLink.setAttribute("href", mod.studioHref);
      if (psyLever) psyLever.textContent = mod.psyLever || "Engagement client";
      if (psyText) psyText.textContent = mod.psyText || "";

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
          .map((k) => `<div class="k-mod-metric-item"><strong class="k-mod-metric-val">${k.val}</strong><span class="k-mod-metric-lbl">${k.lbl}</span></div>`)
          .join("");
      }

      if (stepsGrid) {
        stepsGrid.innerHTML = mod.steps
          .map((s, idx) => `<div class="k-mod-step-item"><span class="k-mod-step-dot">${idx + 1}</span><div><h3>${s.t.replace(/^\d+\s*·\s*/, "")}</h3><p>${s.d}</p></div></div>`)
          .join("");
      }

      if (casesGrid) {
        casesGrid.innerHTML = (mod.cases || [])
          .map((c) => `
            <div class="k-mod-case-item">
              <span class="lc-mod-case-biz">${c.biz}</span>
              <p class="k-mod-case-setup"><b>En pratique :</b> ${c.setup}</p>
              <p class="k-mod-case-outcome"><b>✅ Résultat :</b> ${c.outcome}</p>
            </div>
          `)
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

    const modTabBtns = $$("[data-mod-tab]", modulesShowcaseEl);
    const modTabPanels = {
      steps: $("#mod-panel-steps", modulesShowcaseEl),
      cases: $("#mod-panel-cases", modulesShowcaseEl),
      synergies: $("#mod-panel-synergies", modulesShowcaseEl),
    };
    const setActiveModTab = (tabKey) => {
      const targetKey = modTabPanels[tabKey] ? tabKey : "steps";
      modTabBtns.forEach((tb) => {
        const isOn = tb.dataset.modTab === targetKey;
        tb.classList.toggle("active", isOn);
        tb.setAttribute("aria-selected", String(isOn));
      });
      Object.entries(modTabPanels).forEach(([k, panel]) => {
        if (!panel) return;
        const isOn = k === targetKey;
        panel.hidden = !isOn;
        panel.classList.toggle("active", isOn);
      });
    };
    modTabBtns.forEach((tb) => {
      tb.addEventListener("click", () => setActiveModTab(tb.dataset.modTab));
    });

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

  /* ── 15. ANIMATION LUDIQUE & RÉACTIONS CARTOON AVIS & RÉSEAUX (5 PLATEFORMES) ── */
  const SOCIAL_REACTIONS = {
    google: {
      particles: ["⭐", "★", "✨", "💛"],
      msg: "⭐ +1 Avis Google 5★ déposé en 1 tap !",
      jpMsg: "⭐ +1 Avis Google 5★ — déclenché juste au bon moment !",
    },
    tripadvisor: {
      particles: ["🦉", "🟢", "⭐", "✨"],
      msg: "🦉 +1 Avis Tripadvisor publié après le passage !",
      jpMsg: "🦉 +1 Avis Tripadvisor booste votre classement local !",
    },
    instagram: {
      particles: ["❤️", "📸", "✨", "💜"],
      msg: "📸 +1 Nouvel abonné Instagram conquis !",
      jpMsg: "📸 +1 Abonné Instagram conquis autour de votre jeu !",
    },
    facebook: {
      particles: ["👍", "💙", "✨", "🎉"],
      msg: "👍 +1 Nouveau fan sur votre page Facebook !",
      jpMsg: "👍 +1 Fan conquis sur votre page Facebook !",
    },
    tiktok: {
      particles: ["🎵", "🔥", "⚡", "✨"],
      msg: "🎵 +1 Nouveau follower TikTok engagé !",
      jpMsg: "🎵 +1 Follower TikTok embarqué dans votre communauté !",
    },
  };

  const spawnSocialBurst = (layer, type) => {
    if (!layer) return;
    const cfg = SOCIAL_REACTIONS[type] || SOCIAL_REACTIONS.google;
    for (let i = 0; i < 8; i++) {
      const p = document.createElement("span");
      p.className = "lc-social-burst-particle";
      p.textContent = cfg.particles[i % cfg.particles.length];
      p.style.left = `${14 + Math.random() * 72}%`;
      p.style.top = `${36 + Math.random() * 34}%`;
      p.style.setProperty("--bx", `${(Math.random() - 0.5) * 90}px`);
      p.style.setProperty("--by", `${-48 - Math.random() * 64}px`);
      p.style.setProperty("--br", `${(Math.random() - 0.5) * 44}deg`);
      p.style.animationDelay = `${i * 0.04}s`;
      layer.appendChild(p);
      setTimeout(() => p.remove(), 950);
    }
  };

  const socialStage = $("#lc-social-stage");
  if (socialStage) {
    const socialSection = $("#avis-reseaux") || socialStage;
    const phaseBtns = $$("[data-social-phase]", socialStage);
    const phaseBefore = $("#lc-social-phase-before", socialStage);
    const phaseAfter = $("#lc-social-phase-after", socialStage);
    const pauseBtn = $("#lc-social-pause-btn", socialStage);
    const continueBtn = $("#lc-social-continue-btn", socialStage);
    const burstLayer = $("#lc-social-burst-layer", socialStage);
    const statusPill = $("#lc-social-status-pill", socialStage);
    const counts = { google: 128, tripadvisor: 84, instagram: 142, facebook: 165, tiktok: 98 };
    let currentPhase = "before";
    let isPlaying = true;
    let autoStep = 0;
    let socialTimer = null;

    const setSocialPhase = (phase) => {
      currentPhase = phase === "after" ? "after" : "before";
      phaseBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.socialPhase === currentPhase));
      if (phaseBefore) phaseBefore.classList.toggle("is-active", currentPhase === "before");
      if (phaseAfter) phaseAfter.classList.toggle("is-active", currentPhase === "after");
    };

    const triggerSocialReaction = (type, increment = true) => {
      const key = SOCIAL_REACTIONS[type] ? type : "google";
      const cfg = SOCIAL_REACTIONS[key];

      $$("[data-social-action]", socialStage).forEach((elItem) => {
        elItem.classList.toggle("is-spotlight", elItem.dataset.socialAction === key);
      });
      $$("[data-social-trigger]", socialSection).forEach((elBadge) => {
        elBadge.classList.toggle("is-spotlight", elBadge.dataset.socialTrigger === key);
      });

      if (increment) {
        counts[key] += 1;
        const countEl = $(`#lc-count-${key}`, socialStage);
        if (countEl) countEl.textContent = String(counts[key]);
        const counterPill = $(`.lc-counter-pill[data-counter="${key}"]`, socialStage);
        if (counterPill) {
          counterPill.classList.remove("is-bumped");
          void counterPill.offsetWidth;
          counterPill.classList.add("is-bumped");
        }
      }

      if (statusPill) statusPill.textContent = cfg.msg;
      spawnSocialBurst(burstLayer, key);
    };

    $$("[data-social-action]", socialStage).forEach((btn) => {
      btn.addEventListener("click", () => {
        triggerSocialReaction(btn.dataset.socialAction, true);
      });
    });

    $$("[data-social-trigger]", socialSection).forEach((badge) => {
      badge.addEventListener("click", () => {
        triggerSocialReaction(badge.dataset.socialTrigger, true);
      });
    });

    phaseBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        setSocialPhase(btn.dataset.socialPhase);
      });
    });

    if (continueBtn) {
      continueBtn.addEventListener("click", () => {
        setSocialPhase("after");
        if (statusPill) statusPill.textContent = "🎁 Partie gagnée ! Rappel doux affiché au meilleur moment.";
      });
    }

    const startSocialAutoLoop = () => {
      if (socialTimer) clearInterval(socialTimer);
      if (!isPlaying) return;
      const sequence = [
        { phase: "before", action: "google" },
        { phase: "before", action: "tripadvisor" },
        { phase: "before", action: "instagram" },
        { phase: "after", action: "facebook" },
        { phase: "after", action: "tiktok" },
        { phase: "after", action: "google" },
      ];
      socialTimer = setInterval(() => {
        autoStep = (autoStep + 1) % sequence.length;
        const item = sequence[autoStep];
        setSocialPhase(item.phase);
        triggerSocialReaction(item.action, false);
      }, 3200);
    };

    if (pauseBtn) {
      pauseBtn.addEventListener("click", () => {
        isPlaying = !isPlaying;
        pauseBtn.textContent = isPlaying ? "⏸️" : "▶️";
        pauseBtn.setAttribute("aria-label", isPlaying ? "Mettre en pause l'animation réseaux" : "Relancer l'animation réseaux");
        startSocialAutoLoop();
      });
    }

    startSocialAutoLoop();
  }

  const jpSocialStage = $("#lc-jp-social-stage");
  if (jpSocialStage) {
    const jpBurst = $("#lc-jp-burst-layer", jpSocialStage);
    const jpFeedback = $("#lc-jp-social-feedback", jpSocialStage);
    const jpModePill = $("#lc-jp-mini-mode-pill", jpSocialStage);
    const jpModes = ["Avant le jeu", "Après le gain"];
    const keys = ["google", "tripadvisor", "instagram", "facebook", "tiktok"];
    let jpStep = 0;

    $$("[data-jp-social]", jpSocialStage).forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.jpSocial;
        const cfg = SOCIAL_REACTIONS[key] || SOCIAL_REACTIONS.google;
        $$("[data-jp-social]", jpSocialStage).forEach((b) => b.classList.toggle("is-spotlight", b === btn));
        if (jpFeedback) jpFeedback.textContent = cfg.jpMsg;
        spawnSocialBurst(jpBurst, key);
      });
    });

    setInterval(() => {
      jpStep = (jpStep + 1) % keys.length;
      const activeKey = keys[jpStep];
      $$("[data-jp-social]", jpSocialStage).forEach((b) => b.classList.toggle("is-spotlight", b.dataset.jpSocial === activeKey));
      if (jpModePill) jpModePill.textContent = jpModes[jpStep % 2];
    }, 3200);
  }
})();
