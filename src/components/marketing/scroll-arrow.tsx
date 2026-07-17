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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const wheel = document.querySelector<HTMLElement>("[data-wheel-anchor]");
    if (!wheel) return;

    let raf = 0;
    let y = 0;
    let opacity = 0;
    let drift = 0;
    let lastScroll = window.scrollY;
    let bumped = false;
    let started = false;

    const tick = () => {
      raf = requestAnimationFrame(tick);

      // Visible seulement sur desktop (la roue occupe la colonne droite).
      if (window.innerWidth < 1024) {
        el.style.opacity = "0";
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
      opacity += ((active ? 1 : 0) - opacity) * 0.12;

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
        void wheel.offsetWidth;
        wheel.classList.add("wheel-bump");
      }
      if (!active && opacity < 0.05) {
        bumped = false;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
