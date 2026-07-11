"use client";

import { useRef, type ReactNode } from "react";

/**
 * Carte dont un halo doré suit le curseur (variables CSS --mx / --my
 * consommées par un dégradé radial). Décoratif : sans souris le halo
 * reste simplement centré.
 */
export function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${(((e.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(((e.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
  };

  return (
    <div ref={ref} className={className} onMouseMove={onMove}>
      {children}
    </div>
  );
}
