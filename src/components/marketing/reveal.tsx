"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Révèle son contenu quand il entre dans le viewport (fondu + translation).
 * Purement décoratif : le contenu est présent dans le HTML initial et
 * visible sans JavaScript. La classe qui masque l'élément n'est ajoutée
 * qu'après hydratation et seulement pour un élément encore sous le viewport.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Décalage (ms) pour cascader plusieurs éléments d'une même section. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const rect = el.getBoundingClientRect();
    el.classList.add("reveal-enabled");
    if (rect.top <= window.innerHeight * 0.92 && rect.bottom >= 0) {
      el.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          el.classList.add("is-visible");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
