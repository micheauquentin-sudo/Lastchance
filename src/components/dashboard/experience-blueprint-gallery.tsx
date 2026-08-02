import Link from "next/link";
import {
  applyExperienceBlueprintVersionForm,
  createStarterExperienceBlueprintForm,
  publishExperienceBlueprintVersionForm,
  restoreExperienceBlueprintVersionForm,
  type listExperienceBlueprints,
} from "@/actions/experience-blueprints";
import {
  decideBlueprintActions,
  kindLabel,
  restorableVersions,
  starterKinds,
} from "@/components/dashboard/experience-blueprint-state";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { lienSelonRole } from "@/lib/liens-proprietaire";
import type { ExperienceKind } from "@/platform/experiences/contract";
import type { MemberRole } from "@/types/database";

/**
 * Modèles d'expérience universels — GALERIE (composant serveur).
 *
 * Contrepartie visible des RPC `experience_blueprints` : sans elle, le moteur
 * existait mais restait injoignable. Trois invariants sont portés jusqu'à
 * l'écran, parce qu'ils changent ce que le commerçant peut espérer :
 *
 *  • une version PUBLIÉE est immuable — publier n'est donc pas « enregistrer »,
 *    c'est figer ; le bouton le dit ;
 *  • appliquer crée une instance en BROUILLON, rien n'est publié ni envoyé —
 *    même promesse que la place de marché de campagnes ;
 *  • une version écrite par un schéma plus ancien peut devenir illisible : le
 *    moteur refuse alors de l'appliquer, et on l'affiche au lieu de laisser
 *    découvrir l'échec au clic.
 *
 * Le blueprint lui-même ne quitte pas le serveur : seul son aperçu est rendu.
 */

export type ExperienceBlueprintRow = Awaited<
  ReturnType<typeof listExperienceBlueprints>
>[number];

const APPLY_PROMISE =
  "Appliquer une version crée une expérience en brouillon, déjà configurée. Rien n'est publié, aucun QR n'est diffusé, aucun email n'est envoyé : vous relisez, puis vous activez vous-même.";

const BUTTON =
  "inline-flex items-center rounded-xl border-2 border-k-ink px-3 py-1.5 text-sm font-black text-k-ink transition hover:bg-k-orange/30";

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span
      className={
        published
          ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800"
          : "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800"
      }
    >
      {published ? "Publié" : "Brouillon"}
    </span>
  );
}

function BlueprintCard({
  blueprint,
  active,
  role,
}: {
  blueprint: ExperienceBlueprintRow;
  active: boolean;
  /** Les liens vers les réglages ne mènent nulle part hors propriétaire. */
  role: MemberRole | null;
}) {
  const hrefOffres = lienSelonRole("/dashboard/settings#subscription", role);
  const decision = decideBlueprintActions({
    latestVersion: blueprint.latestVersion,
    latestStatus: blueprint.latestStatus,
    publishedVersion: blueprint.published_version,
    compatibilityError: blueprint.compatibilityError,
    moduleActive: active,
  });
  const restorable = restorableVersions(blueprint.latestVersion);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-k-orange">
            {kindLabel(blueprint.kind)}
          </p>
          <h3 className="truncate text-lg font-black text-k-ink">{blueprint.name}</h3>
          {blueprint.description ? (
            <p className="mt-1 text-sm font-semibold text-k-body">
              {blueprint.description}
            </p>
          ) : null}
        </div>
        <StatusBadge published={blueprint.published_version !== null} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-semibold text-k-body">
        <dt className="text-zinc-500">Dernière version</dt>
        <dd className="text-k-ink">
          v{blueprint.latestVersion}
          {blueprint.latestStatus === "draft" ? " (brouillon)" : ""}
        </dd>
        <dt className="text-zinc-500">Version publiée</dt>
        <dd className="text-k-ink">
          {blueprint.published_version ? `v${blueprint.published_version}` : "aucune"}
        </dd>
        <dt className="text-zinc-500">Créé le</dt>
        <dd className="text-k-ink">{formatDate(blueprint.created_at)}</dd>
      </dl>

      {blueprint.compatibilityError ? (
        <p
          role="alert"
          className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900"
        >
          Version illisible par le moteur actuel : {blueprint.compatibilityError}.
          L&apos;application est bloquée tant que le contenu n&apos;a pas été
          réécrit dans le schéma courant.
        </p>
      ) : blueprint.preview ? (
        <div className="rounded-xl border-2 border-k-ink/15 bg-k-stripe/50 p-3">
          <p className="text-sm font-black text-k-ink">{blueprint.preview.title}</p>
          <p className="text-sm font-semibold text-k-body">
            {blueprint.preview.summary}
          </p>
          <p className="mt-1 text-xs font-bold text-zinc-500">
            {blueprint.preview.itemCount} élément(s) · {blueprint.preview.assetCount}{" "}
            visuel(s) · {blueprint.preview.rewardCount} dotation(s)
          </p>
          {blueprint.preview.warnings.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs font-bold text-amber-800">
              {blueprint.preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-semibold text-k-body">
          Aucune version enregistrée pour ce modèle.
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {decision.canPublish ? (
          <form action={publishExperienceBlueprintVersionForm}>
            <input type="hidden" name="blueprint_id" value={blueprint.id} />
            <input type="hidden" name="version" value={blueprint.latestVersion} />
            <button type="submit" className={`${BUTTON} bg-white`}>
              Figer et publier v{blueprint.latestVersion}
            </button>
          </form>
        ) : null}

        {decision.canApply ? (
          <form action={applyExperienceBlueprintVersionForm}>
            <input type="hidden" name="blueprint_id" value={blueprint.id} />
            <input type="hidden" name="version" value={decision.applicableVersion} />
            <button type="submit" className={`${BUTTON} bg-k-yellow`}>
              Appliquer v{decision.applicableVersion} en brouillon
            </button>
          </form>
        ) : decision.blockedReason === "module_inactive" ? (
          hrefOffres ? (
            <Link href={hrefOffres} className={`${BUTTON} bg-white`}>
              Module inactif — voir les offres
            </Link>
          ) : (
            <p className="text-xs font-bold text-k-body/80">
              Module inactif — demandez au propriétaire du compte de l&apos;activer.
            </p>
          )
        ) : (
          /*
           * Les trois autres motifs ne rendaient RIEN : le commerçant voyait
           * une carte sans action et sans raison. Le pire des deux mondes —
           * avant, un bouton « Appliquer » l'envoyait vers une erreur
           * incompréhensible ; le réparer en silence l'aurait laissé sans
           * explication. Chaque motif dit maintenant ce qui manque.
           */
          <p className="text-xs font-bold text-k-body/80">
            {decision.blockedReason === "not_published"
              ? "Publiez une version pour pouvoir l’appliquer : seules les versions figées sont applicables."
              : decision.blockedReason === "incompatible"
                ? "Ce modèle n’est pas compatible avec la version actuelle du moteur — son contenu doit être repris."
                : "Aucune version enregistrée : créez-en une avant d’appliquer ce modèle."}
          </p>
        )}
      </div>

      {restorable.length > 0 ? (
        <form
          action={restoreExperienceBlueprintVersionForm}
          className="flex flex-wrap items-center gap-2 border-t-2 border-k-ink/10 pt-3"
        >
          <input type="hidden" name="blueprint_id" value={blueprint.id} />
          <input type="hidden" name="latest_version" value={blueprint.latestVersion} />
          <label
            htmlFor={`restore-${blueprint.id}`}
            className="text-sm font-bold text-k-body"
          >
            Revenir à
          </label>
          <select
            id={`restore-${blueprint.id}`}
            name="source_version"
            defaultValue={restorable[0]}
            className="rounded-xl border-2 border-k-ink bg-white px-2 py-1.5 text-sm font-bold text-k-ink"
          >
            {restorable.map((version) => (
              <option key={version} value={version}>
                v{version}
              </option>
            ))}
          </select>
          <button type="submit" className={`${BUTTON} bg-white`}>
            Restaurer
          </button>
          <span className="w-full text-xs font-semibold text-zinc-500">
            La restauration n&apos;écrase rien : elle crée une version v
            {blueprint.latestVersion + 1} recopiée depuis l&apos;ancienne.
          </span>
        </form>
      ) : null}
    </Card>
  );
}

export function ExperienceBlueprintGallery({
  blueprints,
  activeKinds,
  role,
}: {
  blueprints: ExperienceBlueprintRow[];
  activeKinds: ExperienceKind[];
  /** Rôle du membre : décide si un lien vers les réglages a un sens. */
  role: MemberRole | null;
}) {
  const hrefOffres = lienSelonRole("/dashboard/settings#subscription", role);
  const starters = starterKinds();

  return (
    <section aria-labelledby="blueprints-title" className="space-y-4">
      <div className="max-w-3xl">
        <h2 id="blueprints-title" className="text-xl font-black text-k-ink">
          Mes modèles d&apos;expérience
        </h2>
        <p className="mt-2 text-sm font-semibold text-k-body">{APPLY_PROMISE}</p>
      </div>

      <Card className="space-y-3">
        <p className="text-sm font-black text-k-ink">Partir d&apos;un modèle prêt</p>
        <div className="flex flex-wrap gap-2">
          {starters.map((kind) => {
            const active = activeKinds.includes(kind);
            return active ? (
              <form key={kind} action={createStarterExperienceBlueprintForm}>
                <input type="hidden" name="kind" value={kind} />
                <button type="submit" className={`${BUTTON} bg-white`}>
                  {kindLabel(kind)}
                </button>
              </form>
            ) : hrefOffres ? (
              <Link
                key={kind}
                href={hrefOffres}
                className={`${BUTTON} bg-zinc-100 text-zinc-500`}
                title="Module inactif dans votre abonnement"
              >
                {kindLabel(kind)}
              </Link>
            ) : (
              <span
                key={kind}
                className={`${BUTTON} cursor-default bg-zinc-100 text-zinc-500`}
                title="Module inactif — seul le propriétaire du compte peut l'activer"
              >
                {kindLabel(kind)}
              </span>
            );
          })}
        </div>
        <p className="text-xs font-semibold text-zinc-500">
          Trois modules — jeux instantanés, jackpot et parrainage — n&apos;ont pas
          encore d&apos;adaptateur : leurs réglages ne sont pas portables d&apos;une
          organisation à l&apos;autre en V1.
        </p>
      </Card>

      {blueprints.length === 0 ? (
        <Card>
          <p className="text-sm font-semibold text-k-body">
            Aucun modèle pour l&apos;instant. Créez-en un ci-dessus : il restera
            strictement privé à votre organisation.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {blueprints.map((blueprint) => (
            <BlueprintCard
              key={blueprint.id}
              blueprint={blueprint}
              active={activeKinds.includes(blueprint.kind)}
              role={role}
            />
          ))}
        </div>
      )}
    </section>
  );
}
