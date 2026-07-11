import { WheelPointer, WheelSvg } from "@/components/wheel/wheel-svg";

/**
 * Visuel du hero : la vraie roue du produit (composant partagé avec /play),
 * en rotation lente, entourée de cartes flottantes qui racontent le
 * parcours joueur. Purement décoratif — masqué des lecteurs d'écran.
 */

const DEMO_SEGMENTS = [
  { id: "s1", label: "-10 %", color: "#7c3aed" },
  { id: "s2", label: "Café offert", color: "#d946ef" },
  { id: "s3", label: "Surprise", color: "#ffd34d" },
  { id: "s4", label: "Dessert offert", color: "#7c3aed" },
  { id: "s5", label: "-20 %", color: "#d946ef" },
  { id: "s6", label: "Retentez !", color: "#ffd34d" },
];

function FloatingCard({
  className,
  delay,
  children,
}: {
  className: string;
  delay: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`play-float absolute z-10 flex items-center gap-2.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3.5 py-2.5 text-sm font-medium text-zinc-100 shadow-xl shadow-black/40 backdrop-blur-md ${className}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

export function HeroWheel() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[420px] select-none">
      {/* Halo lumineux derrière la roue */}
      <div className="absolute inset-0 scale-125 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.35)_0%,rgba(217,70,239,0.12)_45%,transparent_70%)] blur-2xl" />

      <div className="relative px-6 py-8">
        <div className="relative">
          <WheelPointer color="#a78bfa" />
          <div className="spin-slow">
            <WheelSvg segments={DEMO_SEGMENTS} style={{ ring: "gold", hub: "target" }} />
          </div>
        </div>
      </div>

      <FloatingCard className="-left-2 top-6 sm:-left-8" delay="0s">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 2h4v4H2V2Zm8 0h4v4h-4V2ZM2 10h4v4H2v-4Zm8 0h2v2h-2v-2Zm2 2h2v2h-2v-2Z"
              fill="currentColor"
            />
          </svg>
        </span>
        QR scanné
      </FloatingCard>

      <FloatingCard className="-right-2 top-1/3 sm:-right-10" delay="1.6s">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-300">
          🎉
        </span>
        <span>
          Café offert&nbsp;!
          <span className="block font-mono text-xs text-zinc-400">GAIN-7F3K</span>
        </span>
      </FloatingCard>

      <FloatingCard className="bottom-4 left-4 sm:bottom-8 sm:left-0" delay="3.2s">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path
              d="M2.5 8l3.5 3.5L12.5 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        Gain validé en caisse
      </FloatingCard>
    </div>
  );
}
