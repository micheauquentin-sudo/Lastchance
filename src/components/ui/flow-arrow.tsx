"use client";

import { useEffect, useRef, useState } from "react";

interface FlowArrowProps {
  appearAfter?: number; // pixels scrolled before appearing
  className?: string;
}

/**
 * Animated guide arrow that follows scroll with inertia.
 * Appears after hero, points toward the content, then fades out.
 * Playful but not distracting — keeps UX focused.
 */
export function FlowArrow({ appearAfter = 200, className = "" }: FlowArrowProps) {
  const [isVisible, setIsVisible] = useState(false);
  const arrowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    let currentY = window.innerHeight * 0.4;
    let inertiaOffset = 0;
    let lastScrollY = window.scrollY;

    const tick = () => {
      const scrollY = window.scrollY;
      const delta = scrollY - lastScrollY;
      lastScrollY = scrollY;

      // Le scroll pousse la flèche, puis elle revient doucement à sa base
      inertiaOffset = Math.max(-100, Math.min(100, inertiaOffset + delta * 0.5));
      inertiaOffset *= 0.92;

      const targetY = window.innerHeight * 0.4 + inertiaOffset;
      currentY += (targetY - currentY) * 0.15;

      if (arrowRef.current) {
        arrowRef.current.style.top = `${currentY}px`;
      }

      setIsVisible(scrollY > appearAfter && scrollY < window.innerHeight * 1.8);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [appearAfter]);

  return (
    <div
      ref={arrowRef}
      className={`
        fixed left-1/2 -translate-x-1/2 pointer-events-none z-40
        transition-opacity duration-300
        ${isVisible ? "opacity-100" : "opacity-0"}
        ${className}
      `}
      style={{ top: "40vh" }}
    >
      <div className="arrow-guide flex flex-col items-center gap-2">
        {/* Cartoon Arrow */}
        <div className="relative w-8 h-12">
          {/* Arrow shaft */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1.5 h-8 bg-gradient-to-b from-[#E17A5F] to-[#FF6B35] rounded-full opacity-80" />
          </div>

          {/* Arrow head */}
          <svg
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-5"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ color: "#E17A5F" }}
          >
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </div>

        {/* Subtle text label */}
        <span className="text-xs font-medium text-primary-base opacity-70 whitespace-nowrap">
          Voir la magie
        </span>
      </div>
    </div>
  );
}
