import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { MemberRole } from "@/types/database";

export interface OnboardingStep {
  key: string;
  label: string;
  href: string;
  done: boolean;
  /** Étape que seul le propriétaire peut accomplir (page owner-only). */
  ownerOnly?: boolean;
}

/**
 * On ne montre une étape qu'à qui peut s'en servir — même principe que les
 * bandeaux d'abonnement du layout : « Ajouter votre logo » pointait sur
 * `/dashboard/settings`, owner-only, qui renvoie tout autre rôle sur
 * `/dashboard`. Un éditeur cliquait et revenait exactement là d'où il
 * venait, sans un mot, la checklist figée à 5/6 pour toujours.
 *
 * Choix du RETRAIT plutôt que d'une étape grisée : le dénominateur suit,
 * donc la checklist peut atteindre 100 % et disparaître d'elle-même comme
 * elle le promet. Une étape grisée aurait remplacé « bloqué à 5/6 » par
 * « bloqué à 5/6 » sous un autre nom. Le logo ne bloque par ailleurs aucun
 * travail de l'éditeur (à la différence de l'abonnement, où il faut lui
 * dire d'alerter le propriétaire), et le propriétaire, lui, garde l'étape.
 */
export function visibleOnboardingSteps(
  steps: OnboardingStep[],
  role: MemberRole | null,
): OnboardingStep[] {
  return steps.filter((s) => !s.ownerOnly || role === "owner");
}

/**
 * Checklist de démarrage : guide le commerçant vers les étapes clés
 * (campagne, lot, QR, affiche, logo, activation). Disparaît d'elle-même
 * une fois toutes les étapes complétées — pas de bouton "masquer" à
 * gérer, la checklist s'efface naturellement à mesure que l'app est
 * réellement configurée.
 */
export function OnboardingChecklist({
  steps: allSteps,
  role,
}: {
  steps: OnboardingStep[];
  role: MemberRole | null;
}) {
  const steps = visibleOnboardingSteps(allSteps, role);
  const doneCount = steps.filter((s) => s.done).length;
  if (!steps.length || doneCount === steps.length) return null;

  return (
    <Card className="mb-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-black text-k-ink">
          Pour bien démarrer
        </h2>
        <span className="rounded-full border-2 border-k-ink bg-k-yellow px-2 py-0.5 text-xs font-black text-k-ink">
          {doneCount}/{steps.length}
        </span>
      </div>

      <div className="mb-5 h-2.5 overflow-hidden rounded-full border-2 border-k-ink bg-white">
        <div
          className="h-full rounded-full bg-k-green transition-[width] duration-500"
          style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
        />
      </div>

      <ul className="space-y-2.5">
        {steps.map((step) => (
          <li key={step.key}>
            {step.done ? (
              <span className="flex items-center gap-2.5 text-sm text-zinc-400 line-through decoration-zinc-300">
                <CheckDot done />
                {step.label}
              </span>
            ) : (
              <Link
                href={step.href}
                className="group flex items-center gap-2.5 text-sm font-bold text-k-body hover:text-k-orange"
              >
                <CheckDot done={false} />
                {step.label}
                <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-k-orange">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CheckDot({ done }: { done: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
        done ? "border-2 border-k-ink bg-k-green text-k-bg" : "border-2 border-k-ink bg-white"
      }`}
    >
      {done && (
        <svg aria-hidden width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
