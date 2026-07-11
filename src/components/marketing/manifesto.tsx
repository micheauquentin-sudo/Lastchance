"use client";

import { useEffect, useRef } from "react";

/**
 * Phrase manifeste dont les mots « s'allument » un à un pendant le
 * scroll — l'avancée dans la page pilote l'avancée dans la phrase.
 * Sans JavaScript ou avec `prefers-reduced-motion`, le texte reste
 * simplement lisible (les mots démarrent visibles et le script ne
 * s'installe pas).
 */
export function Manifesto({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const spans = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-word]"));
    // Le script est actif : on éteint les mots avant de les rallumer au scroll.
    spans.forEach((s) => {
      s.style.opacity = "0.18";
      s.style.transition = "opacity 0.35s ease";
    });

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 quand le bloc entre en bas de l'écran, 1 quand il approche du haut.
      const progress = Math.min(
        1,
        Math.max(0, (vh * 0.8 - rect.top) / (vh * 0.55 + rect.height * 0.4)),
      );
      const lit = Math.round(progress * spans.length);
      spans.forEach((s, i) => {
        s.style.opacity = i < lit ? "1" : "0.18";
      });
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
  }, []);

  return (
    <p ref={ref} className="text-balance">
      {words.map((word, i) => (
        <span key={i} data-word>
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
