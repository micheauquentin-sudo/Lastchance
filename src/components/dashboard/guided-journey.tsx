import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  getGuidedJourneySnapshot,
  type GuidedJourneyStep,
} from "@/components/dashboard/guided-journey-state";

type GuidedJourneyProps = {
  /** Étapes déjà filtrées par rôle, droit effectif et statut de l'expérience. */
  steps: GuidedJourneyStep[];
  title?: string;
};

/**
 * Carte de l'Aventure : un repère visuel commun aux éditeurs, de l'idée à
 * l'animation clôturée.
 *
 * Le domaine appelant reste responsable de calculer les étapes atteignables et
 * de garder les actions serveur comme source de vérité. Une étape « blocked »
 * ne reçoit jamais de lien : elle affiche sa raison, plutôt qu'un bouton qui
 * mènerait à un refus.
 */
export function GuidedJourney({
  steps,
  title = "Votre aventure",
}: GuidedJourneyProps) {
  const snapshot = getGuidedJourneySnapshot(steps);

  if (snapshot.total === 0) return null;

  return (
    <Card className="space-y-5 overflow-hidden bg-k-bg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-k-orange">
            Parcours guidé
          </p>
          <h2 className="mt-1 text-xl font-black text-k-ink">{title}</h2>
          <p className="mt-1 text-sm font-bold text-k-body">
            Une étape à la fois, jusqu&apos;au QR prêt à partager.
          </p>
        </div>
        <span className="rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1 text-sm font-black text-k-ink">
          {snapshot.completed}/{snapshot.total}
        </span>
      </div>

      <div
        className="h-3 overflow-hidden rounded-full border-2 border-k-ink bg-white"
        role="progressbar"
        aria-label="Progression de votre aventure"
        aria-valuemin={0}
        aria-valuemax={snapshot.total}
        aria-valuenow={snapshot.completed}
        aria-valuetext={`${snapshot.percentage} % terminé`}
      >
        <div
          className="h-full rounded-full bg-k-green transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${snapshot.percentage}%` }}
        />
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step, index) => {
          const isNext = snapshot.nextStep?.key === step.key;
          const canNavigate = Boolean(step.href) && step.status !== "blocked";
          const content = (
            <>
              <JourneyMarker done={step.status === "complete"} number={index + 1} />
              <span className="min-w-0">
                <span className="block text-sm font-black">{step.label}</span>
                <span className="mt-1 block text-xs font-bold leading-5">{step.description}</span>
                {step.status === "blocked" && step.blockedReason && (
                  <span className="mt-2 block text-xs font-black text-red-700">
                    {step.blockedReason}
                  </span>
                )}
                {isNext && (
                  <span className="mt-2 block text-xs font-black text-k-orange">
                    Prochaine étape →
                  </span>
                )}
              </span>
            </>
          );
          const className = `group flex h-full gap-3 rounded-2xl border-2 p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
            step.status === "complete"
              ? "border-k-ink/30 bg-white/70 text-zinc-500"
              : step.status === "blocked"
                ? "border-red-700/50 bg-red-50 text-k-body"
                : isNext
                  ? "border-k-ink bg-k-yellow text-k-ink shadow-[3px_3px_0_rgba(33,29,22,0.9)]"
                  : "border-k-ink/40 bg-white text-k-body hover:border-k-ink hover:bg-k-yellow/30"
          }`;

          return (
            <li key={step.key}>
              {canNavigate && step.href ? (
                <Link href={step.href} aria-current={isNext ? "step" : undefined} className={className}>
                  {content}
                </Link>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>

      {snapshot.nextStep ? (
        <Link
          href={snapshot.nextStep.href}
          className="k-btn-sm inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
        >
          Continuer : {snapshot.nextStep.label}
        </Link>
      ) : (
        <p className="rounded-xl border-2 border-k-ink bg-k-green/30 px-4 py-3 text-sm font-black text-k-ink">
          Bravo, votre animation est prête à être partagée !
        </p>
      )}
    </Card>
  );
}

function JourneyMarker({ done, number }: { done: boolean; number: number }) {
  return (
    <span
      aria-hidden
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-k-ink text-sm font-black ${
        done ? "bg-k-green text-k-bg" : "bg-white text-k-ink"
      }`}
    >
      {done ? "✓" : number}
    </span>
  );
}
