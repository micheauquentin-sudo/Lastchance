interface CheckerboardSeparatorProps {
  /** Variante prédéfinie de couleur */
  variant?: "pink" | "rose" | "orange" | "amber" | "yellow" | "blue" | "pink-yellow" | "amber-orange" | "blue-orange" | string;
  /** Couleur des cases colorées (alternées avec du blanc : ex. #FF5C93 pour rose et blanc, #EF4444 pour rouge et blanc) */
  color?: string;
  /** Hauteur totale des cases en pixels (défaut : 48px pour 2 rangées de grandes cases 24x24px) */
  height?: number;
  /** Couleur des bordures supérieure et inférieure, défaut #181512 */
  borderColor?: string;
  /** Classes CSS supplémentaires */
  className?: string;
}

const VARIANT_COLORS: Record<string, string> = {
  rose: "#FF5C93",
  pink: "#FF5C93",
  "pink-yellow": "#FF5C93",
  orange: "#FF6B35",
  "amber-orange": "#FF6B35",
  amber: "#FFB238",
  yellow: "#FFB238",
  blue: "#4A90E2",
  "blue-orange": "#4A90E2",
  lilas: "#A78BFA",
};

/**
 * Séparateur ruban damier grand format à cases bicolores (style racing / Holy.com).
 * - Cases nettement plus grandes (24px x 24px par défaut)
 * - Alternance de couleur vive et blanc (rose & blanc, rouge & blanc, etc.)
 * - 2 rangées parfaites sans déformation grâce à box-sizing: content-box
 * - Bordures supérieure et inférieure noires nettes (3px)
 */
export function CheckerboardSeparator({
  variant,
  color,
  height = 48,
  borderColor = "#181512",
  className = "",
}: CheckerboardSeparatorProps) {
  const resolvedColor = color ?? (variant ? VARIANT_COLORS[variant] ?? "#FF6B35" : "#FF5C93");
  const squareSize = Math.round(height / 2);

  return (
    <div
      role="separator"
      aria-hidden="true"
      className={`relative w-full overflow-hidden select-none z-20 border-y-[3px] ${className}`}
      style={{
        boxSizing: "content-box",
        height: `${squareSize * 2}px`,
        borderColor: borderColor,
        backgroundColor: "#FFFFFF",
        backgroundImage: `conic-gradient(${resolvedColor} 90deg, #FFFFFF 90deg 180deg, ${resolvedColor} 180deg 270deg, #FFFFFF 270deg)`,
        backgroundSize: `${squareSize * 2}px ${squareSize * 2}px`,
        backgroundRepeat: "repeat-x",
      }}
    />
  );
}
