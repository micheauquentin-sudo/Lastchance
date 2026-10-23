import React from "react";

export type KermessePatternVariant =
  | "polka-dots-pink"
  | "stars-yellow"
  | "clouds-blue"
  | "stripes-orange"
  | "gingham-purple"
  | "mint-lagoon"
  | "confetti-multi";

interface KermessePatternProps {
  variant: KermessePatternVariant;
  className?: string;
  children?: React.ReactNode;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * Motifs vectoriels kermesse vibrants, festifs et nets :
 * - Étoiles cartoon scintillantes 4 branches sur jaune solaire
 * - Carreaux vichy kermesse sur lilas fête foraine
 * - Petits nuages cartoon sur ciel azur
 * - Menthe lagon fraîche avec confettis
 * - Pêche corail festif avec rayures chapiteau
 */
export function KermessePatternSection({
  variant,
  className = "",
  children,
  id,
  style = {},
}: KermessePatternProps) {
  let bgStyle: React.CSSProperties = {};

  switch (variant) {
    case "polka-dots-pink":
      bgStyle = {
        backgroundColor: "#FECDD3",
        backgroundImage:
          "radial-gradient(#E11D48 2px, transparent 2px), radial-gradient(#FF6B35 1.5px, #FECDD3 1.5px)",
        backgroundSize: "28px 28px",
        backgroundPosition: "0 0, 14px 14px",
      };
      break;

    case "stars-yellow":
      // Étoiles à 4 branches cartoon dorées et confettis sur fond jaune solaire festif
      bgStyle = {
        backgroundColor: "#FFF385",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Cpath d='M32 12 C32 22 22 32 12 32 C22 32 32 42 32 52 C32 42 42 32 52 32 C42 32 32 22 32 12 Z' fill='%23F59E0B' fill-opacity='0.28' stroke='%23181512' stroke-opacity='0.2' stroke-width='1.5'/%3E%3Ccircle cx='54' cy='12' r='2.5' fill='%23FF6B35' fill-opacity='0.3'/%3E%3Ccircle cx='10' cy='52' r='2.5' fill='%23FF5C93' fill-opacity='0.3'/%3E%3C/svg%3E")`,
        backgroundSize: "64px 64px",
      };
      break;

    case "clouds-blue":
      // Petits nuages cartoon blancs et azur sur ciel d'été festif
      bgStyle = {
        backgroundColor: "#BAE6FD",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='72' viewBox='0 0 96 72'%3E%3Cpath d='M26 48 C18 48 14 42 14 36 C14 30 20 28 24 28 C26 20 34 16 42 16 C50 16 56 21 58 26 C62 24 68 26 70 31 C74 33 76 38 76 42 C76 48 70 48 64 48 Z' fill='white' fill-opacity='0.65' stroke='%230284C7' stroke-opacity='0.28' stroke-width='1.5' stroke-linejoin='round'/%3E%3Ccircle cx='86' cy='20' r='2' fill='%230284C7' fill-opacity='0.25'/%3E%3C/svg%3E")`,
        backgroundSize: "96px 72px",
      };
      break;

    case "gingham-purple":
      // Carreaux vichy / damier kermesse lilas vibrant
      bgStyle = {
        backgroundColor: "#EBDCFF",
        backgroundImage:
          "linear-gradient(90deg, rgba(147, 51, 234, 0.14) 50%, transparent 50%), linear-gradient(rgba(147, 51, 234, 0.14) 50%, transparent 50%)",
        backgroundSize: "36px 36px",
      };
      break;

    case "mint-lagoon":
      // Menthe lagon fraîche avec micro-pois pétillants
      bgStyle = {
        backgroundColor: "#BFF0D4",
        backgroundImage:
          "radial-gradient(#059669 2px, transparent 2px), radial-gradient(#10B981 1.5px, #BFF0D4 1.5px)",
        backgroundSize: "32px 32px",
        backgroundPosition: "0 0, 16px 16px",
      };
      break;

    case "stripes-orange":
      bgStyle = {
        backgroundColor: "#FED7AA",
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(234, 88, 12, 0.12) 0px, rgba(234, 88, 12, 0.12) 28px, transparent 28px, transparent 56px)",
      };
      break;

    case "confetti-multi":
      bgStyle = {
        backgroundColor: "#FEF08A",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect x='16' y='18' width='7' height='4' rx='1' transform='rotate(25 19 19)' fill='%23FF5C93' fill-opacity='0.4'/%3E%3Crect x='54' y='22' width='7' height='4' rx='1' transform='rotate(-35 57 23)' fill='%230284C7' fill-opacity='0.4'/%3E%3Crect x='34' y='52' width='7' height='4' rx='1' transform='rotate(45 37 53)' fill='%23EA580C' fill-opacity='0.4'/%3E%3Ccircle cx='68' cy='62' r='3' fill='%23FF6B35' fill-opacity='0.4'/%3E%3Ccircle cx='18' cy='68' r='2.5' fill='%23059669' fill-opacity='0.4'/%3E%3C/svg%3E")`,
        backgroundSize: "80px 80px",
      };
      break;
  }

  return (
    <section id={id} className={`relative z-10 ${className}`} style={{ ...bgStyle, ...style }}>
      {children}
    </section>
  );
}
