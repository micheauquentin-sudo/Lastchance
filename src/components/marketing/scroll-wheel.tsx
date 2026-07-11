"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fait tourner son contenu (la roue du hero) au rythme du scroll de la
 * page : le site « bouge » quand le visiteur se déplace. La rotation est
 * appliquée directement sur le style via requestAnimationFrame — aucun
 * re-render React — et désactivée si `prefers-reduced-motion`.
 */
export function ScrollWheel({
  children,
  degreesPerPixel = 0.14,
}: {
  children: ReactNode;
  degreesPerPixel?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let current = -1;

    const update = () => {
      frame = 0;
      const next = window.scrollY * degreesPerPixel;
      if (next !== current) {
        current = next;
        el.style.transform = `rotate(${next.toFixed(2)}deg)`;
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [degreesPerPixel]);

  return (
    <div ref={ref} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
