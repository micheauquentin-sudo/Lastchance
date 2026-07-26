import type { Metadata } from "next";
import { getOrgProgression } from "@/actions/meta-progression";
import { getUserAndOrg } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { ProgressionNewSeasonForm } from "@/components/dashboard/progression-new-season";
import { ProgressionSeasonCard } from "@/components/dashboard/progression-season-card";

export const metadata: Metadata = { title: "Progression" };

/**
 * Éditeur de méta-progression. Route figée à `/dashboard/progression` : c'est le
 * chemin que les 7 mutations purgent via `revalidatePath`.
 *
 * Le module n'est adossé à AUCUN addon (il n'existe pas de drapeau
 * `addon_progression` en base) : la page n'affiche donc pas d'écran d'offre,
 * contrairement au Quiz ou au Calendrier. Seul le lancement d'une saison exige
 * un accès actif, et c'est la server action qui le tranche.
 */
export default async function ProgressionPage() {
  const { role } = await getUserAndOrg();
  const snapshot = await getOrgProgression();
  /**
   * L'autorité est `canConfigure`, rendu par la RPC : elle est aussi ce qui
   * décide de servir ou non la branche `seasons`. Se fier au rôle local
   * afficherait des boutons d'édition sur une liste que la RPC a refusé de
   * remplir.
   */
  const canEdit = snapshot.canConfigure;
  /**
   * Le rôle ne sert plus qu'à NOMMER la cause d'une liste vide : un caissier ou
   * un `viewer` n'a pas le droit de voir les saisons (il en existe peut-être) ;
   * un propriétaire qui n'a pourtant rien reçu est face à un agrégat illisible,
   * pas à une restriction.
   */
  const isEditorRole = role === "owner" || role === "editor";
  const hasActiveSeason = snapshot.seasons.some(
    (season) => season.status === "active",
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Progression</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Une saison, des missions qui avancent toutes seules au fil des parties,
          et des clés qui ouvrent des coffres. Vos joueurs n&apos;ont rien à
          presser : tout se déclenche depuis les expériences déjà en place.
        </p>
      </div>

      <dl className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Joueurs suivis" value={snapshot.summary.players} />
        <SummaryTile
          label="Missions accomplies"
          value={snapshot.summary.missionsCompleted}
        />
        <SummaryTile label="Clés gagnées" value={snapshot.summary.keysEarned} />
        <SummaryTile
          label="Coffres ouverts"
          value={snapshot.summary.chestsOpened}
        />
      </dl>

      {canEdit && (
        <div className="mb-6">
          <ProgressionNewSeasonForm hasActiveSeason={hasActiveSeason} />
        </div>
      )}

      {!canEdit ? (
        /**
         * ÉCRAN HONNÊTE : une liste vide et un « aucune saison » seraient un
         * mensonge — la RPC a peut-être des saisons, elle a simplement refusé de
         * les montrer. Les compteurs ci-dessus, eux, restent lisibles par toute
         * l'équipe et demeurent affichés.
         */
        <Card className="py-12 text-center">
          <div aria-hidden className="mb-4 text-5xl">
            🔒
          </div>
          <h2 className="mb-2 text-lg font-bold text-k-ink">
            {isEditorRole
              ? "Configuration momentanément illisible"
              : "Les saisons ne vous sont pas montrées"}
          </h2>
          <p className="mx-auto max-w-lg text-zinc-500">
            {isEditorRole
              ? "Les compteurs ci-dessus sont à jour, mais la configuration des saisons n'a pas pu être chargée. Rechargez la page dans un instant."
              : "Votre établissement a peut-être une saison en cours : le détail de sa configuration — missions, paliers, dotations, coffres — est réservé aux comptes propriétaire et éditeur. Les compteurs ci-dessus vous restent accessibles."}
          </p>
        </Card>
      ) : !snapshot.seasons.length ? (
        <Card className="py-12 text-center">
          <div aria-hidden className="mb-4 text-5xl">
            🗝️
          </div>
          <h2 className="mb-2 text-lg font-bold text-k-ink">
            Aucune saison pour l&apos;instant
          </h2>
          <p className="mx-auto max-w-lg text-zinc-500">
            Créez une première saison, préparez-la entièrement en brouillon, puis
            lancez-la.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {snapshot.seasons.map((season) => (
            <ProgressionSeasonCard
              key={season.id}
              season={season}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
      <dt className="text-xs font-bold text-k-body">{label}</dt>
      <dd className="mt-1 text-2xl font-black text-k-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}
