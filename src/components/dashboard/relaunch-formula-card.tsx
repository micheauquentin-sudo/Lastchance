import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  getRelaunchFormulaState,
  type RelaunchFormulaInput,
} from "@/components/dashboard/relaunch-formula-state";

type RelaunchFormulaCardProps = RelaunchFormulaInput & {
  /** Nom de l'animation déjà réussie que le commerçant reconnaît. */
  sourceName: string;
  /** Occasion suggérée : Noël, les soldes, le prochain match… */
  occasionLabel?: string;
  /**
   * Le bouton de création, fourni par l'intégration (formulaire d'action
   * serveur). Il n'est rendu QU'À l'état « eligible » : la carte ne sait pas
   * décider d'un droit, mais elle sait ne pas afficher une action que son
   * propre état vient de déclarer impossible.
   */
  action?: ReactNode;
};

/**
 * Carte « Relancer une formule ».
 *
 * Elle explique ce qu'une relance reprendrait — et surtout ce qu'elle ne
 * reprendrait pas. Rien n'est dupliqué ici : la copie réelle appartient à
 * l'action serveur passée en `action`, qui porte ses propres gardes de rôle,
 * d'organisation et d'animation terminée.
 */
export function RelaunchFormulaCard({
  sourceName,
  occasionLabel,
  sourceState,
  canCreateDraft,
  isSupported,
  action,
}: RelaunchFormulaCardProps) {
  const state = getRelaunchFormulaState({
    sourceState,
    canCreateDraft,
    isSupported,
  });

  return (
    <Card className="space-y-4 bg-k-bg">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-k-ink bg-k-yellow text-xl"
        >
          ↻
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-k-orange">
            Relancer une formule
          </p>
          <h2 className="mt-1 text-xl font-black text-k-ink">
            Repartir de «&nbsp;{sourceName}&nbsp;»
          </h2>
        </div>
      </div>

      <p className="text-sm font-bold text-k-body">
        {occasionLabel ? `Pour ${occasionLabel}, vous` : "Vous"} repartirez sur un
        nouveau brouillon. L&apos;animation précédente reste intacte, avec ses
        participants et son historique.
      </p>

      {state.kind === "blocked" ? (
        <p className="rounded-xl border-2 border-dashed border-k-ink/25 bg-white px-3 py-2 text-sm font-bold text-k-body">
          {state.reason}
        </p>
      ) : (
        <>
          <div className="grid gap-3 text-sm font-bold text-k-body sm:grid-cols-3">
            <RelaunchList title="Repris" items={state.copiedItems} tone="green" />
            <RelaunchList title="À revérifier" items={state.reviewItems} tone="yellow" />
            <RelaunchList title="Jamais repris" items={state.notCopiedItems} tone="white" />
          </div>
          {action}
        </>
      )}
    </Card>
  );
}

function RelaunchList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "green" | "yellow" | "white";
}) {
  const background =
    tone === "green" ? "bg-k-green/30" : tone === "yellow" ? "bg-k-yellow/30" : "bg-white";

  return (
    <section className={`rounded-xl border-2 border-k-ink/20 p-3 ${background}`}>
      <h3 className="text-xs font-black uppercase tracking-wide text-k-ink">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
