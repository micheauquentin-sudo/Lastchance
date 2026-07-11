"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Révèle son contenu quand il entre dans le viewport (fondu + translation).
 * Purement décoratif : le contenu est présent dans le HTML initial et
 * visible sans JavaScript grâce au repli `prefers-reduced-motion` — on
 * force aussi la visibilité si IntersectionObserver n'existe pas.
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
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
