import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  getTeamActionBoardSnapshot,
  isNavigableAction,
  roleLabel,
  type TeamAction,
} from "@/components/dashboard/team-action-board-state";
import type { MemberRole } from "@/types/database";

type TeamActionBoardProps = {
  actions: TeamAction[];
  /** Rôle lu côté serveur ; il ne remplace pas la garde de la destination. */
  actorRole: MemberRole | null;
  title?: string;
};

/**
 * Tableau d'équipe : il rend les responsabilités visibles sans charger de
 * membres et sans modifier aucun rôle. Les routes gardent leurs propres
 * contrôles de rôle et d'organisation.
 *
 * Un tableau vide n'est PAS une section qui disparaît : sans rien à afficher,
 * le commerçant ne saurait pas s'il n'a rien à faire ou si l'écran a échoué.
 * Il lit donc une phrase calme, qui répond à la question.
 */
export function TeamActionBoard({
  actions,
  actorRole,
  title = "Qui fait quoi ?",
}: TeamActionBoardProps) {
  const snapshot = getTeamActionBoardSnapshot(actions, actorRole);

  return (
    <Card className="space-y-4 bg-k-bg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-k-orange">
            Tableau d&apos;équipe
          </p>
          <h2 className="mt-1 text-xl font-black text-k-ink">{title}</h2>
          <p className="mt-1 text-sm font-bold text-k-body">
            Chacun voit clairement la prochaine main à donner.
          </p>
        </div>
        {snapshot.total > 0 && (
          <span className="rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1 text-sm font-black text-k-ink">
            {snapshot.done}/{snapshot.total} fait
          </span>
        )}
      </div>

      {snapshot.total === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-k-ink/25 bg-white px-4 py-3 text-sm font-bold text-k-body">
          Rien à répartir pour le moment : aucune animation n&apos;attend un coup
          de main de votre équipe.
        </p>
      ) : (
        <ol className="space-y-3">
          {actions.map((action) => {
            const isNext = snapshot.nextAction?.key === action.key;
            // Une seule vérité sur « ceci devient-il un lien ? » : le module
            // d'état. Le prédicat était recopié ici, mot pour mot.
            const canNavigate = isNavigableAction(action, actorRole);
            const content = (
              <>
                <RoleBadge role={action.assigneeRole} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black">{action.label}</span>
                  <span className="mt-1 block text-xs font-bold leading-5">
                    {action.description}
                  </span>
                  {action.status === "blocked" && action.blockedReason && (
                    <span className="mt-2 block text-xs font-black text-red-700">
                      {action.blockedReason}
                    </span>
                  )}
                  {isNext && (
                    <span className="mt-2 block text-xs font-black text-k-orange">
                      Action disponible →
                    </span>
                  )}
                </span>
                <ActionMarker status={action.status} />
              </>
            );
            const className = `flex items-start gap-3 rounded-2xl border-2 p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
              action.status === "done"
                ? "border-k-ink/30 bg-white/70 text-zinc-500"
                : action.status === "blocked"
                  ? "border-red-700/50 bg-red-50 text-k-body"
                  : isNext
                    ? "border-k-ink bg-k-yellow text-k-ink shadow-[3px_3px_0_rgba(33,29,22,0.9)]"
                    : "border-k-ink/30 bg-white text-k-body"
            }`;

            return (
              <li key={action.key}>
                {canNavigate ? (
                  <Link
                    href={action.href}
                    aria-current={isNext ? "step" : undefined}
                    className={className}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={className}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function RoleBadge({ role }: { role: TeamAction["assigneeRole"] }) {
  const tone =
    role === "owner" ? "bg-k-yellow" : role === "editor" ? "bg-k-green/50" : "bg-white";

  return (
    <span
      className={`shrink-0 rounded-full border-2 border-k-ink px-2 py-1 text-xs font-black text-k-ink ${tone}`}
    >
      {roleLabel(role)}
    </span>
  );
}

function ActionMarker({ status }: { status: TeamAction["status"] }) {
  const label = status === "done" ? "Fait" : status === "blocked" ? "Bloqué" : "À faire";

  return <span className="shrink-0 text-xs font-black text-k-body">{label}</span>;
}
