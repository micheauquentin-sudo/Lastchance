import React from "react";

interface ScallopedDividerProps {
  /** Couleur du remplissage de la vague (la section qui s'étend vers le bas si non inversé) */
  fillColor: string;
  /** Couleur d'arrière-plan visible au-dessus de la découpe (optionnel) */
  backgroundColor?: string;
  /** Inverser verticalement (pour les transitions de bas de section) */
  flip?: boolean;
  /** Hauteur en pixels sur desktop (par défaut: 64px) */
  height?: number;
  /** Variante de forme de vague */
  variant?: "clouds" | "scallops" | "smooth-wave";
  /** Classes CSS additionnelles */
  className?: string;
}

/**
 * Découpe festonnée organique continue (Inspiration Fields Good / Marmoris).
 * - Élimine les lignes droites horizontales rigides.
 * - Forme des festons ronds ultra-doux (nuages / dentelle de biscuit forain).
 * - 100% SVG vectoriel ultra-léger, anti-crénelé et responsive.
 */
export function ScallopedDivider({
  fillColor,
  backgroundColor = "transparent",
  flip = false,
  height = 56,
  variant = "scallops",
  className = "",
}: ScallopedDividerProps) {
  // Chemin de festons ronds parfaits (répétition de demi-cercles doux)
  const scallopsPath =
    "M0,32 Q37.5,64 75,32 Q112.5,0 150,32 Q187.5,64 225,32 Q262.5,0 300,32 Q337.5,64 375,32 Q412.5,0 450,32 Q487.5,64 525,32 Q562.5,0 600,32 Q637.5,64 675,32 Q712.5,0 750,32 Q787.5,64 825,32 Q862.5,0 900,32 Q937.5,64 975,32 Q1012.5,0 1050,32 Q1087.5,64 1125,32 Q1162.5,0 1200,32 L1200,64 L0,64 Z";

  // Chemin de nuages vallonnés asymétriques
  const cloudsPath =
    "M0,28 C100,56 160,8 240,32 C340,62 420,12 520,38 C620,64 710,14 800,36 C900,58 980,16 1080,40 C1140,54 1180,24 1200,30 L1200,64 L0,64 Z";

  // Chemin de vague douce cinétique
  const smoothWavePath =
    "M0,24 C200,60 400,-10 600,30 C800,70 1000,0 1200,36 L1200,64 L0,64 Z";

  const selectedPath =
    variant === "clouds"
      ? cloudsPath
      : variant === "smooth-wave"
        ? smoothWavePath
        : scallopsPath;

  return (
    <div
      aria-hidden="true"
      className={`relative w-full overflow-hidden leading-none select-none z-20 pointer-events-none ${
        flip ? "rotate-180 -mt-1" : "-mb-1"
      } ${className}`}
      style={{
        backgroundColor,
        height: `${height}px`,
      }}
    >
      <svg
        viewBox="0 0 1200 64"
        preserveAspectRatio="none"
        className="block w-full h-full"
      >
        <path d={selectedPath} fill={fillColor} />
      </svg>
    </div>
  );
}
