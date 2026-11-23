/* ==========================================================================
   IMMERSION VISUELLE — SIMPLE COMME QR (Page d'accueil uniquement)
   1. Parallaxe de profondeur doux sur le sol damier du Hero au scroll.
   2. Confettis physiques (gravité + rotation 3D simulée) sur l'étape 3
      gagnante de #motion-stage (zéro CPU au repos).
   3. Reflet métallique / foil directionnel + micro-tilt 3D au pointeur sur
      le Manège (#jb-visual) et les cartes #formules (.plan-ticket) — calme
      au repos, réactif uniquement au geste du visiteur.
   ========================================================================== */
(function () {
  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const isCoarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  /* ── 1. PARALLAXE DU SOL DAMIER AU SCROLL ── */
  function initCheckerboardParallax() {
    if (reducedMotion) return;
    const hero = document.getElementById("top");
    const surface = document.querySelector(".checkerboard-surface");
    if (!hero || !surface) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = hero.getBoundingClientRect();
      if (rect.bottom < -40 || rect.top > window.innerHeight + 40) return;
      const progress = Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height)));
      const shiftY = (progress * 34).toFixed(2);
      const tiltDelta = (52 - progress * 6).toFixed(2);
      surface.style.setProperty("--checker-shift", `${shiftY}px`);
      surface.style.setProperty("--checker-tilt", `${tiltDelta}deg`);
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    update();
  }

  /* ── 2. CONFETTIS PHYSIQUES SUR L'ÉTAPE 3 GAGNANTE (#m-scene-3) ── */
  function initMotionWinConfetti() {
    if (reducedMotion) return;
    const winScene = document.getElementById("m-scene-3");
    if (!winScene) return;

    const canvas = document.createElement("canvas");
    canvas.className = "motion-confetti-canvas";
    canvas.setAttribute("aria-hidden", "true");
    winScene.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const COLORS = ["#ffd93d", "#f296bd", "#80ed99", "#f58245", "#c4a3ff", "#fffdf5"];
    let particles = [];
    let rafId = 0;

    const resize = () => {
      const rect = winScene.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(200, Math.round(rect.width || 420));
      const h = Math.max(200, Math.round(rect.height || 340));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    const spawnBurst = () => {
      const { w, h } = resize();
      particles = [];
      const cx = w * 0.5;
      const cy = h * 0.34;
      for (let i = 0; i < 34; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
        const speed = 3.2 + Math.random() * 5.2;
        particles.push({
          x: cx + (Math.random() - 0.5) * 40,
          y: cy + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          w: 6 + Math.random() * 6,
          h: 3.5 + Math.random() * 4,
          color: COLORS[i % COLORS.length],
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.28,
          flip: Math.random() * Math.PI,
          vflip: 0.12 + Math.random() * 0.14,
          alpha: 1,
        });
      }
      if (!rafId) rafId = requestAnimationFrame(step);
    };

    const step = () => {
      const rect = winScene.getBoundingClientRect();
      const w = rect.width || 420;
      const h = rect.height || 340;
      ctx.clearRect(0, 0, w, h);

      let alive = 0;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.19;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        p.flip += p.vflip;
        if (p.y > h * 0.72) p.alpha -= 0.032;

        if (p.alpha > 0.02 && p.y < h + 20) {
          alive++;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.flip));
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      }

      if (alive > 0 && winScene.classList.contains("is-active")) {
        rafId = requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, w, h);
        rafId = 0;
      }
    };

    const observer = new MutationObserver(() => {
      if (winScene.classList.contains("is-active")) {
        spawnBurst();
      }
    });
    observer.observe(winScene, { attributes: true, attributeFilter: ["class"] });
  }

  /* ── 3. REFLET FOIL DIRECTIONNEL & MICRO-TILT 3D AU POINTEUR ── */
  function attachFoilInteractive(el, maxTiltDeg) {
    if (!el || el.dataset.foilBound === "1") return;
    el.dataset.foilBound = "1";
    el.classList.add("foil-interactive");

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const tiltY = ((px - 0.5) * 2 * maxTiltDeg).toFixed(2);
      const tiltX = ((0.5 - py) * 2 * maxTiltDeg).toFixed(2);
      el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      el.style.setProperty("--tilt-x", `${tiltX}deg`);
      el.style.setProperty("--tilt-y", `${tiltY}deg`);
      el.style.setProperty("--glare-opacity", "1");
    };

    const onLeave = () => {
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
      el.style.setProperty("--glare-opacity", "0");
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
  }

  function initFoilSurfaces() {
    if (reducedMotion || isCoarsePointer) return;

    const jbVisual = document.getElementById("jb-visual");
    if (jbVisual) {
      attachFoilInteractive(jbVisual, 5.5);
    }

    const plansDeck = document.getElementById("plans-deck");
    const bindPlans = () => {
      if (!plansDeck) return;
      plansDeck.querySelectorAll(".plan-ticket").forEach((card) => {
        attachFoilInteractive(card, 4.2);
      });
    };

    if (plansDeck) {
      bindPlans();
      const mo = new MutationObserver(bindPlans);
      mo.observe(plansDeck, { childList: true });
    }
  }

  const init = () => {
    initCheckerboardParallax();
    initMotionWinConfetti();
    initFoilSurfaces();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
