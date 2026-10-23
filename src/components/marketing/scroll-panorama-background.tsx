"use client";

import { useEffect, useRef } from "react";

interface ScrollPanoramaBackgroundProps {
  className?: string;
}

const PANORAMA_SRC = "/panorama/cartoon-3d-panorama-4k.webp";
const PANORAMA_FALLBACK = "/panorama/cartoon-3d-panorama-4k.jpg";
const ASPECT_RATIO = 2160 / 3840; // 0.5625 (ratio 9:16)

export function ScrollPanoramaBackground({
  className = "",
}: ScrollPanoramaBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    let hauteurBase = 0;
    let largeurBase = 0;
    let running = false;
    let rafId = 0;
    let lastProgress = -1;

    const layout = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // On s'assure que la largeur couvre l'écran et que la hauteur permet une belle traversée
      const hauteur = Math.max(vh * 2.2, vw / ASPECT_RATIO);
      hauteurBase = hauteur;
      largeurBase = hauteur * ASPECT_RATIO;

      img.style.width = `${largeurBase}px`;
      img.style.height = `${hauteurBase}px`;
      img.style.left = "0px";
      img.style.top = "0px";
      img.style.transformOrigin = "0 0";
    };

    const render = (progress: number) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Déplacement vertical : du haut de l'image (y=0) vers le bas de l'image
      const maxScrollY = hauteurBase - vh;
      const ty = -maxScrollY * Math.min(Math.max(progress, 0), 1);
      // Centrage horizontal parfait
      const tx = (vw - largeurBase) * 0.5;

      img.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    };

    const update = () => {
      const scrollMax = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollMax > 0 ? window.scrollY / scrollMax : 0;

      if (Math.abs(progress - lastProgress) > 0.0001) {
        lastProgress = progress;
        render(progress);
      }

      running = false;
    };

    const requestTick = () => {
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(update);
      }
    };

    layout();
    render(0);

    const onScroll = () => requestTick();
    const onResize = () => {
      layout();
      requestTick();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-0 select-none overflow-hidden ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={PANORAMA_SRC}
        onError={(e) => {
          if (e.currentTarget.src !== PANORAMA_FALLBACK) {
            e.currentTarget.src = PANORAMA_FALLBACK;
          }
        }}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="absolute top-0 left-0 max-w-none opacity-100 will-change-transform"
        style={{
          width: "100vw",
          minHeight: "220vh",
          objectFit: "cover",
          objectPosition: "center top",
        }}
      />

      {/* Léger voile d'éclaircissement très doux pour maximiser le contraste du texte */}
      <div className="absolute inset-0 bg-white/20 backdrop-blur-[0.5px]" />

      {/* Léger dégradé top pour la navbar */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/70 via-white/30 to-transparent" />
    </div>
  );
}
