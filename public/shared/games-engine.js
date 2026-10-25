/* ==========================================================================
   MOTEUR UNIFIÉ DES 15 JEUX INSTANTANÉS — LASTCHANCE (window.LC_GAMES_ENGINE)
   Reproduit à l'identique l'expérience tactile, réelle et animée des jeux
   du code source (src/components/wheel/games/*) :
   - 9 JEUX DE HASARD : Roue, Grattage, Machine à sous, 3 Gobelets (Bonneteau),
     Carte retournée, 3 Coffres, Lancer de dé, Memory, Tirage de carte
   - 6 JEUX D'ADRESSE : Pierre-Feuille-Ciseaux, Réflexe, Jauge à arrêter,
     Puzzle simple, Mot mystère, Juste nombre
   ========================================================================== */
(function (global) {
  "use strict";

  // Palette par défaut pour les confettis et animations
  const CONFETTI_COLORS = ["#ffd93d", "#ff6b6b", "#4dabf7", "#69db7c", "#ff922b", "#da77f2", "#20c997"];

  // Définition des 15 jeux avec métadonnées et lots par défaut
  const GAMES_META = {
    wheel: {
      key: "wheel",
      family: "hasard",
      emoji: "🎡",
      title: "Roue de la fortune",
      tagline: "Le grand classique festif : lancez la roue et découvrez votre lot.",
      actionLabel: "Tourner la roue !",
    },
    scratch: {
      key: "scratch",
      family: "hasard",
      emoji: "🎟️",
      title: "Carte à gratter",
      tagline: "Grattez l'écran du bout du doigt pour révéler votre cadeau.",
      actionLabel: "Grattez la surface métallisée",
    },
    slot: {
      key: "slot",
      family: "hasard",
      emoji: "🎰",
      title: "Machine à sous",
      tagline: "Actionnez les rouleaux et alignez 3 symboles identiques !",
      actionLabel: "Actionner les rouleaux !",
    },
    cups: {
      key: "cups",
      family: "hasard",
      emoji: "🥤",
      title: "Bonneteau (3 gobelets)",
      tagline: "Suivez la pièce d'or des yeux et désignez le bon gobelet.",
      actionLabel: "Touchez un gobelet",
    },
    flip_card: {
      key: "flip_card",
      family: "hasard",
      emoji: "🃏",
      title: "Carte retournée",
      tagline: "3 cartes mystères face cachée : écoutez votre intuition !",
      actionLabel: "Touchez une carte pour la retourner",
    },
    chest: {
      key: "chest",
      family: "hasard",
      emoji: "🧰",
      title: "Coffre à choisir",
      tagline: "3 coffres scellés : choisissez le coffre qui renferme le trésor.",
      actionLabel: "Touchez un coffre pour l'ouvrir",
    },
    dice: {
      key: "dice",
      family: "hasard",
      emoji: "🎲",
      title: "Lancer de dé",
      tagline: "Lancez le dé sur le tapis pour faire rouler le chiffre gagnant.",
      actionLabel: "Lancer le dé !",
    },
    memory: {
      key: "memory",
      family: "hasard",
      emoji: "🧩",
      title: "Memory",
      tagline: "Retournez les cartes et formez la paire gagnante.",
      actionLabel: "Retournez deux cartes",
    },
    draw_card: {
      key: "draw_card",
      family: "hasard",
      emoji: "🎴",
      title: "Tirage d'une carte",
      tagline: "Piochez la carte du dessus dans le paquet pour votre privilège.",
      actionLabel: "Piocher la carte du dessus",
    },
    rps: {
      key: "rps",
      family: "adresse",
      emoji: "✂️",
      title: "Pierre-feuille-ciseaux",
      tagline: "Défiez la machine en direct : gagnez pour décrocher votre dotation.",
      actionLabel: "Choisissez votre coup",
    },
    reflex: {
      key: "reflex",
      family: "adresse",
      emoji: "⚡",
      title: "Jeu de réflexe",
      tagline: "Attendez le signal vert et touchez l'écran le plus vite possible !",
      actionLabel: "Prêt ? Touchez pour armer le signal",
    },
    gauge: {
      key: "gauge",
      family: "adresse",
      emoji: "🎯",
      title: "Jauge à arrêter",
      tagline: "L'aiguille oscille : stoppez-la pile dans la zone verte centrale !",
      actionLabel: "STOP !",
    },
    puzzle: {
      key: "puzzle",
      family: "adresse",
      emoji: "🖼️",
      title: "Puzzle simple",
      tagline: "Touchez deux tuiles pour les intervertir et reformer l'image.",
      actionLabel: "Échanger 2 pièces",
    },
    mystery_word: {
      key: "mystery_word",
      family: "adresse",
      emoji: "🔤",
      title: "Mot mystère",
      tagline: "Trouvez la lettre manquante pour reconstituer le mot secret.",
      actionLabel: "Trouver la lettre finale",
    },
    estimate: {
      key: "estimate",
      family: "adresse",
      emoji: "🔢",
      title: "Estimation d'un nombre",
      tagline: "Ajustez la jauge et validez pour trouver le Juste Nombre.",
      actionLabel: "Valider mon estimation",
    },
  };

  // Normalisation des clés alternatives
  function normalizeGameKey(key) {
    if (!key) return "wheel";
    const k = String(key).toLowerCase().trim().replace(/-/g, "_");
    if (k === "slots") return "slot";
    if (k === "roue") return "wheel";
    if (k === "grattage") return "scratch";
    if (k === "cartes") return "flip_card";
    if (k === "gobelets" || k === "bonneteau") return "cups";
    if (k === "coffres") return "chest";
    if (k === "de" || k === "des") return "dice";
    if (k === "pioche") return "draw_card";
    if (k === "shifumi") return "rps";
    if (k === "reflexe") return "reflex";
    if (k === "mot" || k === "mot_mystere") return "mystery_word";
    if (k === "juste_nombre" || k === "nombre") return "estimate";
    return GAMES_META[k] ? k : "wheel";
  }

  // Génération d'un code de retrait réaliste
  function generateVoucherCode() {
    return "LC-" + Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  // Déclenchement d'une explosion de confettis DOM
  function burstConfetti(container) {
    if (!container) return;
    const count = 30;
    const wrap = document.createElement("div");
    wrap.className = "lc-confetti-wrap";
    wrap.setAttribute("aria-hidden", "true");

    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "lc-confetti-particle";
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const size = 6 + Math.random() * 8;
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 110;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 30;
      const rot = (Math.random() - 0.5) * 720;
      const dur = 0.8 + Math.random() * 0.5;

      p.style.backgroundColor = color;
      p.style.width = size + "px";
      p.style.height = (size * (Math.random() > 0.4 ? 1 : 1.6)) + "px";
      p.style.setProperty("--tx", tx + "px");
      p.style.setProperty("--ty", ty + "px");
      p.style.setProperty("--rot", rot + "deg");
      p.style.animationDuration = dur + "s";
      wrap.appendChild(p);
    }

    container.appendChild(wrap);
    setTimeout(() => {
      wrap.remove();
    }, 1500);
  }

  /* --------------------------------------------------------------------------
     SIMULATEUR DE CHAQUE MÉCANIQUE
     -------------------------------------------------------------------------- */
  class GameSimulator {
    constructor(container, options = {}) {
      this.container = container;
      this.gameKey = normalizeGameKey(options.gameKey || "wheel");
      this.options = options;
      this.meta = GAMES_META[this.gameKey] || GAMES_META.wheel;
      this.isPlaying = false;
      this.isWon = false;
      this.rafId = null;
      this.wheelRotation = 0;
      this.prize = options.prize || "Un café offert ☕";
      this.code = "";
      this.init();
    }

    destroy() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.container.innerHTML = "";
    }

    init() {
      this.render();
    }

    render() {
      this.container.innerHTML = "";
      this.container.classList.add("lc-sim-root");

      const shell = document.createElement("div");
      shell.className = `lc-game-shell lc-game-${this.gameKey}`;

      // En-tête informatif du mini-jeu
      const head = document.createElement("div");
      head.className = "lc-game-head";
      head.innerHTML = `
        <div class="lc-game-badge">
          <span>${this.meta.emoji}</span>
          <span>${this.meta.family === "adresse" ? "🎯 Défi d'adresse" : "🎲 Tirage de hasard"}</span>
        </div>
        <h4 class="lc-game-title">${this.meta.title}</h4>
        <p class="lc-game-tagline">${this.meta.tagline}</p>
      `;
      shell.appendChild(head);

      // Scène active du jeu
      const stage = document.createElement("div");
      stage.className = "lc-game-stage";
      this.stageElement = stage;
      shell.appendChild(stage);

      // Zone de victoire / coupon (masquée au départ)
      const winCard = document.createElement("div");
      winCard.className = "lc-game-win-card";
      winCard.hidden = true;
      this.winCardElement = winCard;
      shell.appendChild(winCard);

      this.container.appendChild(shell);
      this.mountMechanic();
    }

    triggerWin(customPrize) {
      this.isPlaying = false;
      this.isWon = true;
      this.code = generateVoucherCode();
      const prizeLabel = customPrize || this.prize;

      burstConfetti(this.stageElement);

      if (this.winCardElement) {
        this.winCardElement.hidden = false;
        this.winCardElement.innerHTML = `
          <div class="lc-win-badge">🎉 BRAVO, LOT REMPORTÉ !</div>
          <div class="lc-win-prize">🎁 ${prizeLabel}</div>
          <div class="lc-win-code-box">
            <span>Code caisse :</span>
            <code>${this.code}</code>
          </div>
          <button type="button" class="lc-win-replay-btn" id="lc-replay-btn">
            🔄 Rejouer une partie test
          </button>
        `;

        const replayBtn = this.winCardElement.querySelector("#lc-replay-btn");
        if (replayBtn) {
          replayBtn.addEventListener("click", () => {
            this.isWon = false;
            this.winCardElement.hidden = true;
            this.mountMechanic();
          });
        }
      }

      if (typeof this.options.onWin === "function") {
        this.options.onWin({ prize: prizeLabel, code: this.code, gameKey: this.gameKey });
      }
    }

    mountMechanic() {
      this.stageElement.innerHTML = "";
      switch (this.gameKey) {
        case "wheel":
          this.mountWheel();
          break;
        case "scratch":
          this.mountScratch();
          break;
        case "slot":
          this.mountSlot();
          break;
        case "cups":
          this.mountCups();
          break;
        case "flip_card":
          this.mountFlipCard();
          break;
        case "chest":
          this.mountChest();
          break;
        case "dice":
          this.mountDice();
          break;
        case "memory":
          this.mountMemory();
          break;
        case "draw_card":
          this.mountDrawCard();
          break;
        case "rps":
          this.mountRps();
          break;
        case "reflex":
          this.mountReflex();
          break;
        case "gauge":
          this.mountGauge();
          break;
        case "puzzle":
          this.mountPuzzle();
          break;
        case "mystery_word":
          this.mountMysteryWord();
          break;
        case "estimate":
          this.mountEstimate();
          break;
        default:
          this.mountWheel();
      }
    }

    /* ── 1. ROUE DE LA FORTUNE ── */
    mountWheel() {
      const lots = (this.options.lots && this.options.lots.length >= 4)
        ? this.options.lots
        : [
            { label: "-15 % sur l'addition", color: "#fcca59" },
            { label: "Café gourmand offert", color: "#ff8fa3" },
            { label: "1 Boisson au choix", color: "#6ec1e4" },
            { label: "Dessert maison", color: "#80ed99" },
            { label: "-20 % sur la visite", color: "#ffd166" },
            { label: "Ticket Or VIP", color: "#c77dff" },
          ];

      const n = lots.length;
      const span = 360 / n;
      const radius = 100;
      const center = 110;

      let paths = "";
      for (let i = 0; i < n; i++) {
        const start = i * span;
        const end = start + span;
        const rad1 = (start * Math.PI) / 180;
        const rad2 = (end * Math.PI) / 180;
        const x1 = center + radius * Math.sin(rad1);
        const y1 = center - radius * Math.cos(rad1);
        const x2 = center + radius * Math.sin(rad2);
        const y2 = center - radius * Math.cos(rad2);
        const midRad = ((start + end) / 2 * Math.PI) / 180;
        const tx = center + (radius * 0.62) * Math.sin(midRad);
        const ty = center - (radius * 0.62) * Math.cos(midRad);
        const rot = (start + end) / 2;

        paths += `
          <g>
            <path d="M${center} ${center} L${x1.toFixed(1)} ${y1.toFixed(1)} A${radius} ${radius} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${lots[i].color || "#ffd93d"}" stroke="#211d16" stroke-width="2.5" />
            <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#211d16" font-size="9" font-weight="900" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})">
              ${lots[i].label.length > 12 ? lots[i].label.slice(0, 11) + "…" : lots[i].label}
            </text>
          </g>
        `;
      }

      this.stageElement.innerHTML = `
        <div class="lc-wheel-arena">
          <div class="lc-wheel-pointer" style="border-top-color:#e63946"></div>
          <svg viewBox="0 0 220 220" class="lc-wheel-svg" id="lc-live-wheel-svg">
            <circle cx="110" cy="110" r="106" fill="none" stroke="#211d16" stroke-width="6" />
            <g id="lc-wheel-disc">
              ${paths}
              <circle cx="110" cy="110" r="18" fill="#fdf6e3" stroke="#211d16" stroke-width="3" />
              <circle cx="110" cy="110" r="6" fill="#e63946" />
            </g>
          </svg>
        </div>
        <button type="button" class="lc-action-btn pop-btn-yellow" id="lc-spin-btn">
          🎡 Lancer la roue de la fortune !
        </button>
      `;

      const disc = this.stageElement.querySelector("#lc-wheel-disc");
      const btn = this.stageElement.querySelector("#lc-spin-btn");

      const spin = () => {
        if (this.isPlaying || this.isWon) return;
        this.isPlaying = true;
        btn.disabled = true;
        btn.textContent = "⏳ La roue tourne...";

        const addDeg = 1440 + Math.floor(Math.random() * 360);
        this.wheelRotation += addDeg;

        disc.style.transition = "transform 3.2s cubic-bezier(0.15, 0.85, 0.25, 1)";
        disc.style.transformOrigin = "110px 110px";
        disc.style.transform = `rotate(${this.wheelRotation}deg)`;

        setTimeout(() => {
          const finalAngle = (360 - (this.wheelRotation % 360)) % 360;
          const winningIdx = Math.floor(finalAngle / span) % n;
          const chosenLot = lots[winningIdx] || lots[0];
          this.triggerWin(chosenLot.label);
        }, 3300);
      };

      btn.addEventListener("click", spin);
      disc.addEventListener("click", spin);
    }

    /* ── 2. CARTE À GRATTER ── */
    mountScratch() {
      const prizeLabel = this.prize || "Un Menu Gourmand Offert 🍽️";
      this.stageElement.innerHTML = `
        <div class="lc-scratch-wrap" id="lc-scratch-container">
          <div class="lc-scratch-underlay">
            <span class="lc-scratch-icon">🎁</span>
            <strong>${prizeLabel}</strong>
            <small>Félicitations pour votre découverte !</small>
          </div>
          <canvas class="lc-scratch-canvas" id="lc-scratch-canvas"></canvas>
        </div>
        <p class="lc-hint-text">👆 Grattez l'écran avec votre doigt ou votre souris</p>
        <button type="button" class="lc-action-btn pop-btn-white" id="lc-scratch-reveal-btn">
          ✨ Révéler le ticket d'un coup
        </button>
      `;

      const canvas = this.stageElement.querySelector("#lc-scratch-canvas");
      const wrap = this.stageElement.querySelector("#lc-scratch-container");
      const revealBtn = this.stageElement.querySelector("#lc-scratch-reveal-btn");
      if (!canvas || !wrap) return;

      const rect = wrap.getBoundingClientRect();
      const w = rect.width || 280;
      const h = 130;
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#d4af37");
      grad.addColorStop(0.3, "#fff2a1");
      grad.addColorStop(0.7, "#c59b27");
      grad.addColorStop(1, "#f3e08a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Motif de grille scintillante
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("★ GRATTEZ ICI POUR DÉCOUVRIR LE LOT ★", w / 2, h / 2 + 5);

      let isScratching = false;
      let scratchedCount = 0;

      const scratchPoint = (x, y) => {
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fill();
        scratchedCount++;

        if (scratchedCount > 35 && !this.isWon) {
          canvas.style.transition = "opacity 0.6s ease";
          canvas.style.opacity = "0";
          setTimeout(() => {
            canvas.remove();
            this.triggerWin(prizeLabel);
          }, 400);
        }
      };

      const handleMove = (e) => {
        if (!isScratching) return;
        const box = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        scratchPoint(clientX - box.left, clientY - box.top);
      };

      canvas.addEventListener("mousedown", (e) => { isScratching = true; handleMove(e); });
      window.addEventListener("mouseup", () => { isScratching = false; });
      canvas.addEventListener("mousemove", handleMove);

      canvas.addEventListener("touchstart", (e) => { isScratching = true; handleMove(e); e.preventDefault(); }, { passive: false });
      window.addEventListener("touchend", () => { isScratching = false; });
      canvas.addEventListener("touchmove", (e) => { handleMove(e); e.preventDefault(); }, { passive: false });

      revealBtn.addEventListener("click", () => {
        canvas.style.transition = "opacity 0.5s ease";
        canvas.style.opacity = "0";
        setTimeout(() => {
          canvas.remove();
          this.triggerWin(prizeLabel);
        }, 350);
      });
    }

    /* ── 3. MACHINE À SOUS ── */
    mountSlot() {
      const symbols = ["🍒", "🍋", "⭐", "🔔", "7️⃣", "💎", "🎁"];
      this.stageElement.innerHTML = `
        <div class="lc-slot-machine">
          <div class="lc-slot-reels-box">
            <div class="lc-slot-reel" id="lc-reel-0"><span>🍒</span></div>
            <div class="lc-slot-reel" id="lc-reel-1"><span>🍋</span></div>
            <div class="lc-slot-reel" id="lc-reel-2"><span>⭐</span></div>
          </div>
          <div class="lc-slot-arm" id="lc-slot-arm">
            <div class="lc-slot-arm-ball"></div>
          </div>
        </div>
        <button type="button" class="lc-action-btn pop-btn-yellow" id="lc-slot-btn">
          🎰 Actionner la machine à sous !
        </button>
      `;

      const reels = [
        this.stageElement.querySelector("#lc-reel-0 span"),
        this.stageElement.querySelector("#lc-reel-1 span"),
        this.stageElement.querySelector("#lc-reel-2 span"),
      ];
      const btn = this.stageElement.querySelector("#lc-slot-btn");
      const arm = this.stageElement.querySelector("#lc-slot-arm");

      const spin = () => {
        if (this.isPlaying || this.isWon) return;
        this.isPlaying = true;
        btn.disabled = true;
        btn.textContent = "🎰 Les rouleaux tournent...";

        if (arm) {
          arm.classList.add("pulled");
          setTimeout(() => arm.classList.remove("pulled"), 600);
        }

        reels.forEach((r) => r.parentElement.classList.add("spinning"));

        const intervals = reels.map((reel) => {
          return setInterval(() => {
            reel.textContent = symbols[Math.floor(Math.random() * symbols.length)];
          }, 70);
        });

        // Arrêt échelonné des rouleaux
        const stops = [900, 1400, 1900];
        const winningSym = "💎";

        stops.forEach((ms, i) => {
          setTimeout(() => {
            clearInterval(intervals[i]);
            reels[i].parentElement.classList.remove("spinning");
            reels[i].parentElement.classList.add("locked");
            reels[i].textContent = winningSym;

            if (i === 2) {
              setTimeout(() => {
                this.triggerWin("TRIPLE JACKPOT 💎💎💎");
              }, 500);
            }
          }, ms);
        });
      };

      btn.addEventListener("click", spin);
    }

    /* ── 4. BONNETEAU (3 GOBELETS) ── */
    mountCups() {
      this.stageElement.innerHTML = `
        <div class="lc-cups-arena" id="lc-cups-arena">
          <button type="button" class="lc-cup-item" data-cup="0">
            <span class="lc-cup-visual">🥤</span>
            <span class="lc-cup-ball" id="lc-ball-0">🪙</span>
          </button>
          <button type="button" class="lc-cup-item" data-cup="1">
            <span class="lc-cup-visual">🥤</span>
            <span class="lc-cup-ball" id="lc-ball-1">🪙</span>
          </button>
          <button type="button" class="lc-cup-item" data-cup="2">
            <span class="lc-cup-visual">🥤</span>
            <span class="lc-cup-ball" id="lc-ball-2">🪙</span>
          </button>
        </div>
        <p class="lc-hint-text" id="lc-cups-status">👀 Suivez la pièce d'or des yeux...</p>
      `;

      const cups = this.stageElement.querySelectorAll(".lc-cup-item");
      const status = this.stageElement.querySelector("#lc-cups-status");
      const arena = this.stageElement.querySelector("#lc-cups-arena");

      // Étape 1 : Révélation initiale
      setTimeout(() => {
        cups[1].classList.add("lifted");
        setTimeout(() => {
          cups[1].classList.remove("lifted");
          status.textContent = "🌪️ Les gobelets se mélangent à toute allure...";
          arena.classList.add("shuffling");

          setTimeout(() => {
            arena.classList.remove("shuffling");
            status.textContent = "👇 Où est la pièce ? Touchez un gobelet !";
            this.canPickCup = true;
          }, 1400);
        }, 900);
      }, 500);

      cups.forEach((c) => {
        c.addEventListener("click", () => {
          if (!this.canPickCup || this.isWon) return;
          this.canPickCup = false;
          c.classList.add("lifted");
          status.textContent = "🎉 TROUVÉ ! La pièce d'or était bien là !";
          setTimeout(() => {
            this.triggerWin("Bonneteau Gagné · Pièce d'Or");
          }, 600);
        });
      });
    }

    /* ── 5. CARTE RETOURNÉE ── */
    mountFlipCard() {
      this.stageElement.innerHTML = `
        <div class="lc-cards-3d-arena">
          <div class="lc-card-3d" data-card="0">
            <div class="lc-card-face lc-card-back">🃏</div>
            <div class="lc-card-face lc-card-front">🎁</div>
          </div>
          <div class="lc-card-3d" data-card="1">
            <div class="lc-card-face lc-card-back">🃏</div>
            <div class="lc-card-face lc-card-front">⭐</div>
          </div>
          <div class="lc-card-3d" data-card="2">
            <div class="lc-card-face lc-card-back">🃏</div>
            <div class="lc-card-face lc-card-front">👑</div>
          </div>
        </div>
        <p class="lc-hint-text">✨ Touchez une carte mystère pour la retourner en 3D</p>
      `;

      const cards = this.stageElement.querySelectorAll(".lc-card-3d");
      cards.forEach((c) => {
        c.addEventListener("click", () => {
          if (this.isPlaying || this.isWon) return;
          this.isPlaying = true;
          c.classList.add("flipped");
          cards.forEach((other) => {
            if (other !== c) other.style.opacity = "0.4";
          });
          setTimeout(() => {
            this.triggerWin("Carte Mystère Gagnante");
          }, 700);
        });
      });
    }

    /* ── 6. COFFRE À CHOISIR ── */
    mountChest() {
      this.stageElement.innerHTML = `
        <div class="lc-chests-arena">
          <div class="lc-chest-item" data-chest="0">
            <span class="lc-chest-icon">🧰</span>
            <small>Coffre Rubis</small>
          </div>
          <div class="lc-chest-item" data-chest="1">
            <span class="lc-chest-icon">🧰</span>
            <small>Coffre Saphir</small>
          </div>
          <div class="lc-chest-item" data-chest="2">
            <span class="lc-chest-icon">🧰</span>
            <small>Coffre Diamant</small>
          </div>
        </div>
        <p class="lc-hint-text">🔑 Choisissez votre coffre pour libérer le trésor</p>
      `;

      const chests = this.stageElement.querySelectorAll(".lc-chest-item");
      chests.forEach((ch) => {
        ch.addEventListener("click", () => {
          if (this.isPlaying || this.isWon) return;
          this.isPlaying = true;
          ch.classList.add("opening");
          const icon = ch.querySelector(".lc-chest-icon");
          if (icon) icon.textContent = "✨ 🎁 ✨";

          chests.forEach((other) => {
            if (other !== ch) other.style.opacity = "0.35";
          });

          setTimeout(() => {
            this.triggerWin("Trésor du Coffre Ouvert");
          }, 700);
        });
      });
    }

    /* ── 7. LANCER DE DÉ ── */
    mountDice() {
      const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
      this.stageElement.innerHTML = `
        <div class="lc-dice-arena">
          <div class="lc-dice-cube" id="lc-dice-cube">
            <span>⚅</span>
          </div>
        </div>
        <button type="button" class="lc-action-btn pop-btn-yellow" id="lc-dice-btn">
          🎲 Lancer le dé sur le tapis !
        </button>
      `;

      const dice = this.stageElement.querySelector("#lc-dice-cube");
      const span = dice.querySelector("span");
      const btn = this.stageElement.querySelector("#lc-dice-btn");

      const roll = () => {
        if (this.isPlaying || this.isWon) return;
        this.isPlaying = true;
        btn.disabled = true;
        btn.textContent = "🎲 Le dé roule...";

        dice.classList.add("rolling");

        let ticks = 0;
        const interval = setInterval(() => {
          span.textContent = faces[Math.floor(Math.random() * faces.length)];
          ticks++;
          if (ticks > 14) {
            clearInterval(interval);
            dice.classList.remove("rolling");
            dice.classList.add("bounced");
            span.textContent = "⚅";
            setTimeout(() => {
              this.triggerWin("Score Parfait 6 au Dé !");
            }, 600);
          }
        }, 75);
      };

      btn.addEventListener("click", roll);
      dice.addEventListener("click", roll);
    }

    /* ── 8. MEMORY ── */
    mountMemory() {
      const pairs = ["☕", "☕", "🍰", "🍰", "🎁", "🎁"];
      this.stageElement.innerHTML = `
        <div class="lc-memory-grid">
          ${pairs.map((sym, i) => `
            <div class="lc-memory-tile" data-idx="${i}" data-sym="${sym}">
              <div class="lc-mem-face lc-mem-back">❓</div>
              <div class="lc-mem-face lc-mem-front">${sym}</div>
            </div>
          `).join("")}
        </div>
        <p class="lc-hint-text" id="lc-mem-hint">🧠 Associez 2 cartes identiques</p>
      `;

      const tiles = this.stageElement.querySelectorAll(".lc-memory-tile");
      const hint = this.stageElement.querySelector("#lc-mem-hint");
      let active = [];

      tiles.forEach((t) => {
        t.addEventListener("click", () => {
          if (this.isWon || active.length >= 2 || t.classList.contains("flipped")) return;
          t.classList.add("flipped");
          active.push(t);

          if (active.length === 2) {
            const [a, b] = active;
            if (a.dataset.sym === b.dataset.sym) {
              hint.textContent = "🎉 Paire trouvée !";
              a.classList.add("matched");
              b.classList.add("matched");
              setTimeout(() => {
                this.triggerWin(`Paire Memory Gagnée (${a.dataset.sym})`);
              }, 600);
            } else {
              hint.textContent = "Pas de chance... Nouvelle paire !";
              setTimeout(() => {
                a.classList.remove("flipped");
                b.classList.remove("flipped");
                active = [];
              }, 900);
            }
          }
        });
      });
    }

    /* ── 9. TIRAGE D'UNE CARTE ── */
    mountDrawCard() {
      this.stageElement.innerHTML = `
        <div class="lc-deck-arena">
          <div class="lc-deck-stack">
            <div class="lc-deck-card-base lc-deck-3"></div>
            <div class="lc-deck-card-base lc-deck-2"></div>
            <div class="lc-deck-card-base lc-deck-1"></div>
            <div class="lc-drawn-card" id="lc-drawn-card">
              <div class="lc-card-face lc-card-back">🎴</div>
              <div class="lc-card-face lc-card-front">
                <span style="font-size:2.2rem">👑</span>
                <strong style="font-size:0.88rem;color:#211d16">AS VIP</strong>
              </div>
            </div>
          </div>
        </div>
        <button type="button" class="lc-action-btn pop-btn-yellow" id="lc-draw-btn">
          🎴 Piocher la carte du dessus !
        </button>
      `;

      const btn = this.stageElement.querySelector("#lc-draw-btn");
      const drawnCard = this.stageElement.querySelector("#lc-drawn-card");

      const draw = () => {
        if (this.isPlaying || this.isWon) return;
        this.isPlaying = true;
        btn.disabled = true;
        btn.textContent = "⏳ Pioche en cours...";

        drawnCard.classList.add("drawn");
        setTimeout(() => {
          drawnCard.classList.add("flipped");
          setTimeout(() => {
            this.triggerWin("Carte As VIP Tirée");
          }, 700);
        }, 500);
      };

      btn.addEventListener("click", draw);
    }

    /* ── 10. PIERRE-FEUILLE-CISEAUX ── */
    mountRps() {
      this.stageElement.innerHTML = `
        <div class="lc-rps-duel-box">
          <div class="lc-rps-avatar">
            <span id="lc-bot-hand" class="lc-rps-hand-display">🤖</span>
            <small>Machine</small>
          </div>
          <span class="lc-rps-vs">VS</span>
          <div class="lc-rps-avatar">
            <span id="lc-user-hand" class="lc-rps-hand-display">❓</span>
            <small>Vous</small>
          </div>
        </div>
        <div class="lc-rps-choices">
          <button type="button" class="lc-rps-btn" data-move="rock">🪨 Pierre</button>
          <button type="button" class="lc-rps-btn" data-move="paper">📄 Feuille</button>
          <button type="button" class="lc-rps-btn" data-move="scissors">✂️ Ciseaux</button>
        </div>
        <p class="lc-hint-text" id="lc-rps-status">⚔️ Choisissez votre coup pour battre la machine</p>
      `;

      const botHand = this.stageElement.querySelector("#lc-bot-hand");
      const userHand = this.stageElement.querySelector("#lc-user-hand");
      const status = this.stageElement.querySelector("#lc-rps-status");
      const btns = this.stageElement.querySelectorAll(".lc-rps-btn");

      const moveIcons = { rock: "🪨", paper: "📄", scissors: "✂️" };
      const botCounter = { rock: "scissors", paper: "rock", scissors: "paper" }; // la machine perd pour offrir l'expérience victorieuse

      btns.forEach((b) => {
        b.addEventListener("click", () => {
          if (this.isPlaying || this.isWon) return;
          this.isPlaying = true;
          const userMove = b.dataset.move;
          userHand.textContent = moveIcons[userMove];
          status.textContent = "1... 2... 3... Pierre, Feuille, Ciseaux !";

          botHand.classList.add("shaking");
          userHand.classList.add("shaking");

          setTimeout(() => {
            botHand.classList.remove("shaking");
            userHand.classList.remove("shaking");
            const botMove = botCounter[userMove];
            botHand.textContent = moveIcons[botMove];
            status.textContent = "🎉 VICTOIRE ! Vous battez la machine !";
            setTimeout(() => {
              this.triggerWin("Duel Remporté · Pierre-Feuille-Ciseaux");
            }, 600);
          }, 900);
        });
      });
    }

    /* ── 11. JEU DE RÉFLEXE ── */
    mountReflex() {
      this.stageElement.innerHTML = `
        <div class="lc-reflex-pad" id="lc-reflex-pad">
          <div class="lc-reflex-light" id="lc-reflex-light">🔴</div>
          <strong id="lc-reflex-text">Appuyez pour armer le signal</strong>
          <small id="lc-reflex-sub">Préparez-vous à toucher dès le passage au vert</small>
        </div>
      `;

      const pad = this.stageElement.querySelector("#lc-reflex-pad");
      const light = this.stageElement.querySelector("#lc-reflex-light");
      const text = this.stageElement.querySelector("#lc-reflex-text");
      const sub = this.stageElement.querySelector("#lc-reflex-sub");

      let state = "idle";
      let startTime = 0;
      let timerId = null;

      pad.addEventListener("click", () => {
        if (this.isWon) return;

        if (state === "idle") {
          state = "waiting";
          pad.classList.add("armed");
          light.textContent = "🔴";
          text.textContent = "ATTENDEZ LE SIGNAL VERT...";
          sub.textContent = "Ne touchez pas avant le vert sous peine de faux départ !";

          const delay = 1200 + Math.random() * 1600;
          timerId = setTimeout(() => {
            state = "ready";
            pad.classList.remove("armed");
            pad.classList.add("green");
            light.textContent = "🟢";
            text.textContent = "🔥 TOUCHEZ MAINTENANT !";
            sub.textContent = "VITE !";
            startTime = performance.now();
          }, delay);
        } else if (state === "waiting") {
          clearTimeout(timerId);
          state = "idle";
          pad.classList.remove("armed");
          text.textContent = "⚠️ Faux départ ! Réessayez.";
          sub.textContent = "Touchez à nouveau pour réarmer.";
        } else if (state === "ready") {
          const elapsed = Math.round(performance.now() - startTime);
          state = "done";
          light.textContent = "⚡";
          text.textContent = `⚡ ${elapsed} ms ! Réflexe d'éclair !`;
          sub.textContent = "Défi d'adresse validé avec succès.";
          setTimeout(() => {
            this.triggerWin(`Réflexe Record : ${elapsed} ms`);
          }, 600);
        }
      });
    }

    /* ── 12. JAUGE À ARRÊTER ── */
    mountGauge() {
      this.stageElement.innerHTML = `
        <div class="lc-gauge-arena">
          <div class="lc-gauge-track">
            <div class="lc-gauge-target"></div>
            <div class="lc-gauge-needle" id="lc-gauge-needle"></div>
          </div>
        </div>
        <p class="lc-hint-text">🎯 Bloquez l'aiguille pile dans la zone verte centrale !</p>
        <button type="button" class="lc-action-btn pop-btn-yellow" id="lc-gauge-stop-btn">
          ⏹️ STOP ! Arrêter la jauge
        </button>
      `;

      const needle = this.stageElement.querySelector("#lc-gauge-needle");
      const btn = this.stageElement.querySelector("#lc-gauge-stop-btn");

      let pos = 0;
      let dir = 1;
      const speed = 2.4;
      let active = true;

      const loop = () => {
        if (!active) return;
        pos += dir * speed;
        if (pos >= 96) { pos = 96; dir = -1; }
        if (pos <= 2) { pos = 2; dir = 1; }
        needle.style.left = pos + "%";
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);

      const stop = () => {
        if (!active || this.isWon) return;
        active = false;
        cancelAnimationFrame(this.rafId);
        btn.disabled = true;

        // Zone cible centrale : entre 38% et 62%
        const inTarget = pos >= 36 && pos <= 64;
        if (inTarget) {
          needle.style.backgroundColor = "#10b981";
          btn.textContent = "🎯 EN PLEIN DANS LE MILLE !";
          setTimeout(() => {
            this.triggerWin("Précision Jauge 100%");
          }, 600);
        } else {
          // Tolérance de rattrapage
          needle.style.backgroundColor = "#f59e0b";
          btn.textContent = "✨ Très proche ! Défi validé !";
          setTimeout(() => {
            this.triggerWin("Défi Jauge Réussi");
          }, 600);
        }
      };

      btn.addEventListener("click", stop);
    }

    /* ── 13. PUZZLE SIMPLE ── */
    mountPuzzle() {
      const tiles = [
        { id: 0, sym: "☕", label: "Café" },
        { id: 1, sym: "🥐", label: "Croissant" },
        { id: 2, sym: "🧁", label: "Gâteau" },
        { id: 3, sym: "🍓", label: "Fraise" },
      ];

      // Ordre mélangé de départ
      let currentOrder = [2, 0, 3, 1];
      let selectedIdx = null;

      const renderGrid = () => {
        return currentOrder.map((tileId, pos) => {
          const t = tiles[tileId];
          const isSelected = selectedIdx === pos;
          return `
            <button type="button" class="lc-puzzle-tile ${isSelected ? "selected" : ""}" data-pos="${pos}">
              <span>${t.sym}</span>
              <small>${t.label}</small>
            </button>
          `;
        }).join("");
      };

      this.stageElement.innerHTML = `
        <div class="lc-puzzle-grid" id="lc-puzzle-grid">
          ${renderGrid()}
        </div>
        <p class="lc-hint-text" id="lc-puzzle-hint">🧩 Touchez 2 pièces pour les échanger et résoudre le puzzle</p>
      `;

      const grid = this.stageElement.querySelector("#lc-puzzle-grid");
      const hint = this.stageElement.querySelector("#lc-puzzle-hint");

      const attachTileEvents = () => {
        grid.querySelectorAll(".lc-puzzle-tile").forEach((btn) => {
          btn.addEventListener("click", () => {
            if (this.isWon) return;
            const pos = Number(btn.dataset.pos);
            if (selectedIdx === null) {
              selectedIdx = pos;
              grid.innerHTML = renderGrid();
              attachTileEvents();
            } else if (selectedIdx === pos) {
              selectedIdx = null;
              grid.innerHTML = renderGrid();
              attachTileEvents();
            } else {
              // Échange des 2 pièces
              const temp = currentOrder[selectedIdx];
              currentOrder[selectedIdx] = currentOrder[pos];
              currentOrder[pos] = temp;
              selectedIdx = null;
              grid.innerHTML = renderGrid();
              attachTileEvents();

              // Vérification victoire (0, 1, 2, 3)
              const solved = currentOrder.every((v, idx) => v === idx);
              if (solved) {
                hint.textContent = "✨ PUZZLE RÉSOLU ! Bravo !";
                grid.classList.add("solved");
                setTimeout(() => {
                  this.triggerWin("Puzzle Reconstitué");
                }, 600);
              }
            }
          });
        });
      };

      attachTileEvents();
    }

    /* ── 14. MOT MYSTÈRE ── */
    mountMysteryWord() {
      this.stageElement.innerHTML = `
        <div class="lc-word-clue">
          <span>💡 Indice :</span>
          <strong>« La douceur offerte de la maison »</strong>
        </div>
        <div class="lc-word-slots">
          <span class="lc-word-letter filled">C</span>
          <span class="lc-word-letter filled">A</span>
          <span class="lc-word-letter filled">D</span>
          <span class="lc-word-letter filled">E</span>
          <span class="lc-word-letter filled">A</span>
          <span class="lc-word-letter mystery" id="lc-mystery-slot">?</span>
        </div>
        <p class="lc-hint-text">Quelle est la dernière lettre du mot C A D E A _ ?</p>
        <div class="lc-word-choices">
          <button type="button" class="lc-letter-btn" data-letter="X">X</button>
          <button type="button" class="lc-letter-btn" data-letter="R">R</button>
          <button type="button" class="lc-letter-btn" data-letter="U">U</button>
        </div>
      `;

      const mysterySlot = this.stageElement.querySelector("#lc-mystery-slot");
      const buttons = this.stageElement.querySelectorAll(".lc-letter-btn");

      buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
          if (this.isWon) return;
          const letter = btn.dataset.letter;
          if (letter === "U") {
            mysterySlot.textContent = "U";
            mysterySlot.classList.remove("mystery");
            mysterySlot.classList.add("solved");
            setTimeout(() => {
              this.triggerWin("Mot Mystère Trouvé : CADEAU");
            }, 600);
          } else {
            btn.style.opacity = "0.3";
            btn.disabled = true;
          }
        });
      });
    }

    /* ── 15. ESTIMATION DU NOMBRE ── */
    mountEstimate() {
      this.stageElement.innerHTML = `
        <div class="lc-estimate-card">
          <div class="lc-estimate-badge">⚖️ LE JUSTE NOMBRE</div>
          <p>Trouvez le chiffre secret du jour (entre 1 et 100) :</p>
          <div class="lc-estimate-dial">
            <button type="button" class="lc-est-step" id="lc-est-minus">-</button>
            <input type="range" min="1" max="100" value="42" class="lc-est-range" id="lc-est-range" />
            <button type="button" class="lc-est-step" id="lc-est-plus">+</button>
          </div>
          <div class="lc-est-val" id="lc-est-val">42</div>
        </div>
        <button type="button" class="lc-action-btn pop-btn-yellow" id="lc-estimate-btn">
          🎯 Valider mon estimation (42) !
        </button>
      `;

      const range = this.stageElement.querySelector("#lc-est-range");
      const val = this.stageElement.querySelector("#lc-est-val");
      const btn = this.stageElement.querySelector("#lc-estimate-btn");
      const minus = this.stageElement.querySelector("#lc-est-minus");
      const plus = this.stageElement.querySelector("#lc-est-plus");

      const update = () => {
        val.textContent = range.value;
        btn.textContent = `🎯 Valider mon estimation (${range.value}) !`;
      };

      range.addEventListener("input", update);
      minus.addEventListener("click", () => { range.value = Math.max(1, Number(range.value) - 1); update(); });
      plus.addEventListener("click", () => { range.value = Math.min(100, Number(range.value) + 1); update(); });

      btn.addEventListener("click", () => {
        if (this.isWon) return;
        btn.disabled = true;
        btn.textContent = "🎯 C'est le JUSTE NOMBRE EXACT !";
        setTimeout(() => {
          this.triggerWin(`Juste Nombre Trouvé (${range.value})`);
        }, 600);
      });
    }
  }

  /* --------------------------------------------------------------------------
     MODALE PLEIN ÉCRAN D'APERÇU INTERACTIF (CATALOGUE & PARCOURS JOUEUR)
     -------------------------------------------------------------------------- */
  function openGameModal(gameKey, customOptions = {}) {
    const k = normalizeGameKey(gameKey);
    const meta = GAMES_META[k] || GAMES_META.wheel;

    let overlay = document.getElementById("lc-game-modal-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "lc-game-modal-overlay";
      overlay.className = "lc-game-modal-overlay";
      document.body.appendChild(overlay);
    }

    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="lc-game-modal-backdrop" id="lc-modal-close-backdrop"></div>
      <div class="lc-game-modal-window" role="dialog" aria-modal="true" aria-labelledby="lc-modal-title">
        <button type="button" class="lc-modal-close-btn" id="lc-modal-close-btn" aria-label="Fermer l'aperçu du jeu">✕</button>

        <div class="lc-modal-phone-frame">
          <div class="lc-modal-phone-notch"></div>
          <div class="lc-modal-phone-screen" id="lc-modal-phone-screen"></div>
        </div>

        <div class="lc-modal-aside">
          <span class="lc-modal-kicker">✦ SIMULATEUR CLIENT EN DIRECT</span>
          <h3 id="lc-modal-title">${meta.emoji} ${meta.title}</h3>
          <p class="lc-modal-desc">${meta.tagline}</p>

          <div class="lc-modal-perks">
            <div>⚡ <b>Zéro application</b> : se lance instantanément au scan du QR code.</div>
            <div>🎁 <b>Gain garanti ou pondéré</b> : vous réglez les probabilités et stocks en 1 clic.</div>
            <div>🔒 <b>Sécurité anti-fraude</b> : jetons cryptés HMAC & limitation 1 essai par jour.</div>
          </div>

          <div class="lc-modal-actions">
            <a href="studio.html?module=roue&mech=${k}" class="ticket-btn pop-btn-yellow ticket-btn-large">
              🛠️ Personnaliser ce jeu dans le Studio →
            </a>
          </div>
        </div>
      </div>
    `;

    const phoneScreen = overlay.querySelector("#lc-modal-phone-screen");
    const closeBtn = overlay.querySelector("#lc-modal-close-btn");
    const backdrop = overlay.querySelector("#lc-modal-close-backdrop");

    let sim = new GameSimulator(phoneScreen, {
      gameKey: k,
      prize: customOptions.prize || "Café gourmand offert ☕",
      lots: customOptions.lots,
    });

    const close = () => {
      if (sim) {
        sim.destroy();
        sim = null;
      }
      overlay.hidden = true;
      overlay.innerHTML = "";
      document.removeEventListener("keydown", onEsc);
    };

    const onEsc = (e) => {
      if (e.key === "Escape") close();
    };

    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", onEsc);
  }

  // Export sur window
  global.LC_GAMES_ENGINE = {
    GAMES_META,
    normalizeGameKey,
    burstConfetti,
    createSimulator: (container, options) => new GameSimulator(container, options),
    openGameModal,
  };

})(typeof window !== "undefined" ? window : global);
