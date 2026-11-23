/* ==========================================================================
   IMMERSION VISUELLE — SIMPLE COMME QR (Page d'accueil uniquement)
   1. Parallaxe de perspective fluide sur le sol damier du Hero au scroll.
   2. Bascule 3D élastique à chaque changement d'univers dans le Manège (#jb-visual).
   3. Reflet foil holographique / doré nettement lisible + micro-tilt 3D au
      pointeur sur #jb-visual, .plan-ticket (#formules) et .clog-stat-pill
      (calme au repos, vivant uniquement au geste du visiteur).
   ========================================================================== */
(function () {
  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const isCoarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  /* ── 1. PARALLAXE FLUIDE DU SOL DAMIER AU SCROLL ── */
  function initCheckerboardParallax() {
    if (reducedMotion) return;
    const hero = document.getElementById("top");
    const surface = document.querySelector(".checkerboard-surface");
    if (!hero || !surface) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = hero.getBoundingClientRect();
      if (rect.bottom < -60 || rect.top > window.innerHeight + 60) return;
      const progress = Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height)));
      const shiftY = (progress * 140).toFixed(1);
      const tiltDeg = (52 - progress * 15).toFixed(2);
      surface.style.setProperty("--checker-shift", `${shiftY}px`);
      surface.style.setProperty("--checker-tilt", `${tiltDeg}deg`);
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

  /* ── 2. REFLET FOIL COLLECTOR & MICRO-TILT 3D AU POINTEUR ── */
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
      const angle = (105 + (px - 0.5) * 50).toFixed(1);
      el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      el.style.setProperty("--foil-angle", `${angle}deg`);
      el.style.setProperty("--foil-pos", `${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%`);
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

  /* ── 3. BASCULE 3D ÉLASTIQUE SUR LE MANÈGE (#jb-visual) ── */
  function initJukebox3DFlip() {
    if (reducedMotion) return;
    const jbVisual = document.getElementById("jb-visual");
    if (!jbVisual) return;

    const mo = new MutationObserver(() => {
      jbVisual.classList.remove("is-jb-flipping");
      // Force reflow pour rejouer proprement la bascule 3D à chaque onglet
      void jbVisual.offsetWidth;
      jbVisual.classList.add("is-jb-flipping");
    });
    mo.observe(jbVisual, { childList: true });
  }

  function initFoilSurfaces() {
    if (reducedMotion || isCoarsePointer) return;

    const jbVisual = document.getElementById("jb-visual");
    if (jbVisual) {
      attachFoilInteractive(jbVisual, 7.5);
    }

    document.querySelectorAll(".clog-stat-pill").forEach((pill) => {
      attachFoilInteractive(pill, 4.5);
    });

    const plansDeck = document.getElementById("plans-deck");
    const bindPlans = () => {
      if (!plansDeck) return;
      plansDeck.querySelectorAll(".plan-ticket").forEach((card) => {
        attachFoilInteractive(card, 6.0);
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
    initJukebox3DFlip();
    initFoilSurfaces();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
