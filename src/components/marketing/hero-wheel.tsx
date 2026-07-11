import { ScrollWheel } from "@/components/marketing/scroll-wheel";
import { WheelPointer, WheelSvg } from "@/components/wheel/wheel-svg";

/**
 * Visuel signature du hero : la roue du produit en finition « Luxe »
 * (or / noir / crème), posée comme un horizon en bas de l'écran et
 * pilotée par le scroll via <ScrollWheel>. Purement décoratif —
 * masqué des lecteurs d'écran.
 */

const DEMO_SEGMENTS = [
  { id: "s1", label: "Café offert", color: "#1c1917" },
  { id: "s2", label: "-10 %", color: "#ca8a04" },
  { id: "s3", label: "Surprise", color: "#f5e6c4" },
  { id: "s4", label: "Retentez !", color: "#1c1917" },
  { id: "s5", label: "Dessert offert", color: "#ca8a04" },
  { id: "s6", label: "-20 %", color: "#f5e6c4" },
  { id: "s7", label: "Apéro offert", color: "#1c1917" },
  { id: "s8", label: "Mystère", color: "#ca8a04" },
];

const LUXE_STYLE = {
  ring: "gold",
  segmentBorderColor: "#ca8a04",
  segmentBorderWidth: 1,
  labelColor: "#f5e6c4",
  labelOutline: true,
  hub: "disc",
  hubColor: "#ca8a04",
  font: "elegant",
} as const;

export function HeroWheel() {
  return (
    <div aria-hidden className="pointer-events-none relative mx-auto w-full select-none">
      {/* La roue-horizon : seule la moitié haute dépasse du bas du hero. */}
      <div className="relative mx-auto aspect-square w-[min(88vw,780px)]">
        {/* Halo doré derrière la roue */}
        <div className="absolute inset-[-12%] rounded-full bg-[radial-gradient(circle,rgba(202,138,4,0.28)_0%,rgba(202,138,4,0.08)_45%,transparent_68%)] blur-2xl" />

        <div className="absolute inset-x-0 top-0 z-10 flex justify-center">
          <WheelPointer color="#ca8a04" variant="pin" />
        </div>

        <ScrollWheel>
          <WheelSvg segments={DEMO_SEGMENTS} style={LUXE_STYLE} />
        </ScrollWheel>
      </div>
    </div>
  );
}
