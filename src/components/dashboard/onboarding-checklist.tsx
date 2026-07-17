import Link from "next/link";
import { Card } from "@/components/ui/card";

export interface OnboardingStep {
  key: string;
  label: string;
  href: string;
  done: boolean;
}

/**
 * Checklist de démarrage : guide le commerçant vers les étapes clés
 * (campagne, lot, QR, affiche, logo, activation). Disparaît d'elle-même
 * une fois toutes les étapes complétées — pas de bouton "masquer" à
 * gérer, la checklist s'efface naturellement à mesure que l'app est
 * réellement configurée.
 */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

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
