"use client";

import { useEffect, useRef } from "react";

/**
 * Flèche-guide cartoon : apparaît quand on commence à descendre, suit le
 * scroll avec un peu d'inertie, pointe la roue du hero (elle réagit d'un
 * petit « bump »), puis s'efface quand la roue sort de l'écran.
 *
 * Purement décorative : pointer-events désactivés, invisible sous lg,
 * inerte avec `prefers-reduced-motion`. Elle se cale sur l'élément
 * portant `data-wheel-anchor` (la roue du HeroShowcase).
 */
export function ScrollArrow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1024px)");
    if (reduced.matches) return;

    const wheel = document.querySelector<HTMLElement>("[data-wheel-anchor]");
    if (!wheel) return;

    let raf = 0;
    let y = 0;
    let opacity = 0;
    let drift = 0;
    let lastScroll = window.scrollY;
    let bumped = false;
    let started = false;

    const requestUpdate = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    const update = () => {
      raf = 0;
      if (reduced.matches || !desktop.matches || document.hidden) {
        el.style.opacity = "0";
        lastScroll = window.scrollY;
        return;
      }

      const rect = wheel.getBoundingClientRect();
      const scrollY = window.scrollY;
      const delta = scrollY - lastScroll;
      lastScroll = scrollY;

      // Inertie : le scroll entraîne la flèche, qui revient doucement.
      drift = Math.max(-56, Math.min(56, drift + delta * 0.45));
      drift *= 0.9;

      const active =
        scrollY > 48 && rect.bottom > 220 && rect.top < window.innerHeight;
      const targetOpacity = active ? 1 : 0;
      opacity += (targetOpacity - opacity) * 0.12;

      const targetY = rect.top + rect.height * 0.3 + drift;
      if (!started) {
        y = targetY - 40; // première apparition : léger glissement
        started = true;
      }
      y += (targetY - y) * 0.14;

      const x = Math.max(10, rect.left - 148);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = opacity.toFixed(3);

      // Petite réaction de la roue quand la flèche arrive sur elle.
      if (active && !bumped && opacity > 0.55) {
        bumped = true;
        wheel.classList.remove("wheel-bump");
        wheel.classList.add("wheel-bump");
      }
      if (!active && opacity < 0.05) {
        bumped = false;
      }

      // Continuer uniquement le temps de résorber l'inertie / le fondu.
      if (
        Math.abs(drift) > 0.1 ||
        Math.abs(targetY - y) > 0.1 ||
        Math.abs(targetOpacity - opacity) > 0.01
      ) {
        requestUpdate();
      }
    };

    const clearBump = () => wheel.classList.remove("wheel-bump");
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    document.addEventListener("visibilitychange", requestUpdate);
    reduced.addEventListener("change", requestUpdate);
    desktop.addEventListener("change", requestUpdate);
    wheel.addEventListener("animationend", clearBump);
    requestUpdate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      document.removeEventListener("visibilitychange", requestUpdate);
      reduced.removeEventListener("change", requestUpdate);
      desktop.removeEventListener("change", requestUpdate);
      wheel.removeEventListener("animationend", clearBump);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-40 hidden opacity-0 lg:block"
    >
      <div className="arrow-wag">
        {/* Flèche cartoon « tracée à la main », contour encre + orange kermesse */}
        <svg width="132" height="96" viewBox="0 0 132 96" fill="none">
          <path
            d="M10 16 C 34 72, 76 80, 112 52"
            stroke="#211d16"
            strokeWidth="11"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M120 46 100 44 108 64 Z"
            fill="#211d16"
            stroke="#211d16"
            strokeWidth="8"
            strokeLinejoin="round"
          />
          <path
            d="M10 16 C 34 72, 76 80, 112 52"
            stroke="#f5793b"
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M120 46 100 44 108 64 Z"
            fill="#f5793b"
            stroke="#f5793b"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
