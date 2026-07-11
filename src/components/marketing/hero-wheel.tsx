import { ScrollWheel } from "@/components/marketing/scroll-wheel";
import { WheelPointer, WheelSvg } from "@/components/wheel/wheel-svg";

/**
 * Visuel signature du hero : la roue du produit dans une finition
 * épurée (violet / noir profond / fuchsia), posée comme un horizon en
 * bas de l'écran et pilotée par le scroll via <ScrollWheel>. Purement
 * décoratif — masqué des lecteurs d'écran.
 */

const DEMO_SEGMENTS = [
  { id: "s1", label: "Café offert", color: "#18181b" },
  { id: "s2", label: "-10 %", color: "#7c3aed" },
  { id: "s3", label: "Surprise", color: "#18181b" },
  { id: "s4", label: "Retentez !", color: "#d946ef" },
  { id: "s5", label: "Dessert offert", color: "#18181b" },
  { id: "s6", label: "-20 %", color: "#7c3aed" },
  { id: "s7", label: "Apéro offert", color: "#18181b" },
  { id: "s8", label: "Mystère", color: "#d946ef" },
];

const WHEEL_STYLE = {
  ring: "minimal",
  ringColor: "#3f3f46",
  lights: false,
  segmentBorderColor: "#09090b",
  segmentBorderWidth: 2,
  labelColor: "#fafafa",
  labelOutline: false,
  hub: "disc",
  hubColor: "#09090b",
  font: "sans",
} as const;

export function HeroWheel() {
  return (
    <div aria-hidden className="pointer-events-none relative mx-auto w-full select-none">
      {/* La roue-horizon : seule la moitié haute dépasse du bas du hero. */}
      <div className="relative mx-auto aspect-square w-[min(88vw,780px)]">
        {/* Halo violet derrière la roue */}
        <div className="absolute inset-[-12%] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.3)_0%,rgba(217,70,239,0.1)_45%,transparent_68%)] blur-2xl" />

        <div className="absolute inset-x-0 top-0 z-10 flex justify-center">
          <WheelPointer color="#a78bfa" variant="triangle" />
        </div>

        <ScrollWheel>
          <WheelSvg segments={DEMO_SEGMENTS} style={WHEEL_STYLE} />
        </ScrollWheel>
      </div>
    </div>
  );
}
