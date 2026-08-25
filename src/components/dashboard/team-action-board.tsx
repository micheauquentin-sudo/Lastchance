import Link from "next/link";
import { useId } from "react";
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
 * « LES PROCHAINS COUPS DE MAIN » — la fin du second tableau de bord.
 *
 * Ce bloc vivait dans sa PROPRE carte, juste sous le Centre d'animation, avec
 * son propre score de progression (« 3/6 fait ») qui contredisait celui de la
 * checklist voisine (« 0/6 ») sur le même commerce. Il est désormais rendu DANS
 * la carte « Où en sont vos animations » : une section, un titre, un landmark.
 *
 * Trois retraits, tous pour la même raison — ne montrer que ce qui appelle un
 * geste :
 *   1. les six lignes permanentes deviennent les seules lignes `ready` ; ce qui
 *      est fait se replie en « N déjà faites ✓ » ;
 *   2. une action que ce rôle ne peut pas accomplir ne s'affiche plus en rouge
 *      avec sa phrase d'excuse : elle compte dans une ligne neutre. Un employé
 *      lisait des alertes rouges qu'il n'avait aucun moyen de résoudre ;
 *   3. plus de pastille de score — la liste reste centrée sur les gestes
 *      réellement disponibles à l'équipe.
 *
 * Une liste vide n'est PAS un bloc qui disparaît : sans rien à afficher, le
 * commerçant ne saurait pas s'il n'a rien à faire ou si l'écran a échoué.
 */
export function TeamActionBoard({
  actions,
  actorRole,
  title = "Les prochains coups de main",
}: TeamActionBoardProps) {
  const snapshot = getTeamActionBoardSnapshot(
    actions,
    actorRole,
  );
  const titleId = useId();

  return (
    <div className="space-y-3 border-t-2 border-k-ink/15 pt-5">
      <h3 id={titleId} className="text-base font-black text-k-ink">
        {title}
      </h3>

      {snapshot.aFaire.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-k-ink/25 bg-white px-4 py-3 text-sm font-bold text-k-body">
          Rien à répartir pour le moment : aucune animation n&apos;attend un coup
          de main de votre équipe.
        </p>
      ) : (
        <ol className="space-y-3" aria-labelledby={titleId}>
          {snapshot.aFaire.map((action) => {
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
                  {isNext && (
                    // Sur la ligne surlignée (bg-k-yellow), l'orange texte ne
                    // tient pas le 4.5:1 — l'encre, si.
                    <span className="mt-2 block text-xs font-black text-k-ink">
                      Action disponible →
                    </span>
                  )}
                </span>
              </>
            );
            const className = `flex items-start gap-3 rounded-2xl border-2 p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${
              isNext
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

      {(snapshot.done > 0 || snapshot.blocked > 0) && (
        <p className="text-xs font-bold text-k-body">
          {snapshot.done > 0 && (
            <span>
              {snapshot.done} déjà faite{snapshot.done > 1 ? "s" : ""} ✓
            </span>
          )}
          {snapshot.done > 0 && snapshot.blocked > 0 && <span> · </span>}
          {snapshot.blocked > 0 && (
            <span>
              {snapshot.blocked} action{snapshot.blocked > 1 ? "s" : ""} réservée
              {snapshot.blocked > 1 ? "s" : ""} au propriétaire
            </span>
          )}
        </p>
      )}
    </div>
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
