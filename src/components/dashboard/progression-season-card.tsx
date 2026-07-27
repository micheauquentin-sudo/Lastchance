"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  activateProgressionSeason,
  archiveProgressionSeason,
  createProgressionBadge,
  createProgressionChest,
  createProgressionCollection,
  createProgressionCollectionItem,
  createProgressionMission,
  deleteProgressionBadge,
  deleteProgressionChest,
  deleteProgressionCollection,
  deleteProgressionCollectionItem,
  deleteProgressionMission,
  deleteProgressionSeason,
  endProgressionSeason,
  setProgressionChestEnabled,
  setProgressionMissionEnabled,
  updateProgressionBadge,
  updateProgressionChest,
  updateProgressionCollection,
  updateProgressionCollectionItem,
  updateProgressionMission,
} from "@/actions/meta-progression";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  PROGRESSION_BADGE_GLYPHS,
  PROGRESSION_BADGE_ICON_LABELS,
  PROGRESSION_EVENT_LABELS,
  PROGRESSION_EXPERIENCE_LABELS,
  PROGRESSION_SEASON_STATUS_META,
  PROGRESSION_SOURCE_LABELS,
} from "@/components/progression/progression-labels";
import {
  PROGRESSION_BADGE_ICONS,
  PROGRESSION_BADGE_NAME_MAX,
  PROGRESSION_CHEST_ITEMS_MAX,
  PROGRESSION_CHEST_NAME_MAX,
  PROGRESSION_COLLECTION_NAME_MAX,
  PROGRESSION_DESCRIPTION_MAX,
  PROGRESSION_EVENT_NAMES,
  PROGRESSION_EXPERIENCE_KINDS,
  PROGRESSION_IMAGE_URL_MAX,
  PROGRESSION_ITEM_NAME_MAX,
  PROGRESSION_KEY_COST_MAX,
  PROGRESSION_KEY_COST_MIN,
  PROGRESSION_KEY_REWARD_MAX,
  PROGRESSION_MISSION_DESCRIPTION_MAX,
  PROGRESSION_MISSION_NAME_MAX,
  PROGRESSION_SOURCES,
  PROGRESSION_TARGET_MAX,
  PROGRESSION_TARGET_MIN,
  type OrgProgressionBadge,
  type OrgProgressionChest,
  type OrgProgressionCollection,
  type OrgProgressionItem,
  type OrgProgressionMission,
  type OrgProgressionSeason,
} from "@/lib/meta-progression";
import type { ActionResult } from "@/lib/utils";

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const checkboxClass = "h-4 w-4 shrink-0 accent-k-orange";
const rowClass =
  "flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-k-ink/20 bg-white px-3 py-2";

/**
 * Exécution d'une mutation de configuration. Les actions prennent un objet typé
 * (pas une FormData), d'où `useTransition` plutôt que `useActionState`. Le
 * `pending` sert de verrou : aucune double soumission ne part.
 *
 * AUCUN MESSAGE D'ERREUR N'EST ÉCRIT ICI. `result.error` arrive déjà traduit par
 * `progressionErrorMessage` (table ORDONNÉE de la lib, figée par des tests :
 * « draft badge not found » CONTIENT « badge not found »). Refaire une
 * correspondance côté écran réintroduirait exactement le bug qui vient d'être
 * corrigé — annoncer un badge introuvable alors que la cause est une saison
 * verrouillée.
 */
function useProgressionMutation() {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const run = <T,>(
    call: () => Promise<ActionResult<T>>,
    onSuccess?: (data: T) => void,
  ) => {
    if (pending) return;
    startTransition(async () => {
      const result = await call();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      onSuccess?.(result.data);
    });
  };

  return { error, pending, run };
}

function formatWindow(startsAt: string | null, endsAt: string | null): string {
  const format = (value: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleString("fr-FR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  };
  const from = format(startsAt);
  const to = format(endsAt);
  if (!from && !to) return "Fenêtre non définie";
  return `Du ${from ?? "?"} au ${to ?? "?"}`;
}

/**
 * Confirmation EN DEUX TEMPS, dans le flux du document (jamais `window.confirm`,
 * ni style ni navigation clavier maîtrisés). Le premier clic ouvre un panneau
 * qui ÉNONCE les conséquences : c'est là, et seulement là, que l'irréversibilité
 * d'une clôture ou d'une suppression est annoncée — avant le clic décisif, pas
 * après.
 *
 * Le panneau reçoit le focus à l'ouverture : sans cela, un lecteur d'écran
 * resterait posé sur un bouton qui vient de quitter le DOM.
 */
function ConfirmAction({
  triggerLabel,
  triggerAriaLabel,
  triggerVariant = "secondary",
  title,
  consequences,
  confirmLabel,
  pendingLabel = "Envoi…",
  confirmVariant = "primary",
  action,
}: {
  triggerLabel: string;
  triggerAriaLabel?: string;
  triggerVariant?: "primary" | "secondary" | "danger";
  title: string;
  /** Ce que l'acte produit, dit en clair — l'irréversibilité en premier. */
  consequences: string[];
  confirmLabel: string;
  pendingLabel?: string;
  confirmVariant?: "primary" | "danger";
  action: () => Promise<ActionResult<unknown>>;
}) {
  const [confirming, setConfirming] = useState(false);
  const { error, pending, run } = useProgressionMutation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirming) panelRef.current?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <Button
        variant={triggerVariant}
        aria-label={triggerAriaLabel}
        onClick={() => setConfirming(true)}
      >
        {triggerLabel}
      </Button>
    );
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-label={title}
      className="w-full rounded-xl border-2 border-k-ink bg-k-yellow/40 p-3 outline-none focus-visible:ring-2 focus-visible:ring-k-ink"
    >
      <p className="text-sm font-black text-k-ink">{title}</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm font-semibold text-k-ink">
        {consequences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant={confirmVariant}
          disabled={pending}
          onClick={() => run(action, () => setConfirming(false))}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Annuler
        </Button>
      </div>
      <FieldError message={error || undefined} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Interrupteur d'arrêt d'une mission ou d'un coffre
// ════════════════════════════════════════════════════════════

/**
 * État de service, DIT dans les deux sens. Une pastille affichée seulement quand
 * l'objet est coupé se lit mal : l'absence de pastille est ambiguë (rien à dire,
 * ou rien à savoir ?). Les deux états sont donc écrits, pour que le commerçant
 * sache d'un coup d'œil ce qui tourne réellement chez ses joueurs.
 */
function EnabledPill({
  enabled,
  activeLabel,
  pausedLabel,
}: {
  enabled: boolean;
  activeLabel: string;
  pausedLabel: string;
}) {
  return (
    <span
      className={`ml-2 shrink-0 rounded-full border-2 px-2 py-0.5 text-xs font-black ${
        enabled
          ? "border-k-ink bg-k-green/30 text-k-ink"
          : "border-zinc-700 bg-zinc-100 text-zinc-800"
      }`}
    >
      {enabled ? activeLabel : pausedLabel}
    </span>
  );
}

/**
 * INTERRUPTEUR D'ARRÊT d'une mission. C'est le SEUL geste d'édition offert sur
 * une saison LANCÉE : toutes les autres mutations sont bornées au brouillon.
 * Sans lui, une mission publiée trop généreuse (palier 1, 100 clés, sans
 * distinction d'expérience) ne pouvait être stoppée qu'en clôturant TOUTE la
 * saison, ce qui bascule chaque joueur sur son archive.
 *
 * Le vocabulaire est celui du refus de suppression traduit par
 * `progressionErrorMessage` (« Désactivez-la à la place. ») : le conseil que lit
 * le commerçant et le bouton qui l'exécute portent le même mot.
 *
 * Les conséquences énoncées décrivent L'EFFET (la mission cesse d'être servie),
 * pas seulement l'acte, et disent ce que couper NE fait pas — pour qu'on ne le
 * confonde jamais avec une suppression.
 */
function MissionEnabledAction({
  mission,
}: {
  mission: OrgProgressionMission;
}) {
  if (mission.enabled) {
    return (
      <ConfirmAction
        triggerLabel="Désactiver"
        triggerAriaLabel={`Désactiver la mission ${mission.name}`}
        title={`Désactiver la mission « ${mission.name} » ?`}
        consequences={[
          "Rien n'est effacé : la mission, son journal de règles et la progression déjà acquise restent en place.",
          "Dès l'événement suivant, elle cesse d'avancer et quitte l'écran de vos joueurs.",
          "Les badges, objets et clés déjà gagnés restent acquis : rien n'est repris.",
          "Réversible : vous pourrez la réactiver à tout moment, saison en cours.",
        ]}
        confirmLabel="Oui, désactiver la mission"
        pendingLabel="Désactivation…"
        action={() =>
          setProgressionMissionEnabled({
            missionId: mission.id,
            enabled: false,
          })
        }
      />
    );
  }

  return (
    <ConfirmAction
      triggerLabel="Réactiver"
      triggerAriaLabel={`Réactiver la mission ${mission.name}`}
      title={`Réactiver la mission « ${mission.name} » ?`}
      consequences={[
        "Elle reparaît chez vos joueurs et recommence à avancer dès l'événement suivant.",
        "Elle reprend exactement où elle s'était arrêtée : la règle et la progression déjà acquise sont inchangées.",
      ]}
      confirmLabel="Oui, réactiver la mission"
      pendingLabel="Réactivation…"
      action={() =>
        setProgressionMissionEnabled({ missionId: mission.id, enabled: true })
      }
    />
  );
}

/** Interrupteur d'arrêt d'un coffre, miroir exact du précédent. */
function ChestEnabledAction({ chest }: { chest: OrgProgressionChest }) {
  if (chest.enabled) {
    return (
      <ConfirmAction
        triggerLabel="Désactiver"
        triggerAriaLabel={`Désactiver le coffre ${chest.name}`}
        title={`Désactiver le coffre « ${chest.name} » ?`}
        consequences={[
          "Rien n'est effacé : le coffre, son contenu et les ouvertures déjà faites restent en place.",
          "Il quitte aussitôt l'écran de vos joueurs et ne peut plus être ouvert.",
          "Aucune clé n'est reprise : celles déjà gagnées restent au crédit de vos joueurs.",
          "Réversible : vous pourrez le réactiver à tout moment, saison en cours.",
        ]}
        confirmLabel="Oui, désactiver le coffre"
        pendingLabel="Désactivation…"
        action={() =>
          setProgressionChestEnabled({ chestId: chest.id, enabled: false })
        }
      />
    );
  }

  return (
    <ConfirmAction
      triggerLabel="Réactiver"
      triggerAriaLabel={`Réactiver le coffre ${chest.name}`}
      title={`Réactiver le coffre « ${chest.name} » ?`}
      consequences={[
        "Il reparaît chez vos joueurs et redevient ouvrable contre ses clés.",
        "Son coût et son contenu sont inchangés.",
      ]}
      confirmLabel="Oui, réactiver le coffre"
      pendingLabel="Réactivation…"
      action={() =>
        setProgressionChestEnabled({ chestId: chest.id, enabled: true })
      }
    />
  );
}

// ════════════════════════════════════════════════════════════
// Carte de saison
// ════════════════════════════════════════════════════════════

export function ProgressionSeasonCard({
  season,
  canEdit,
}: {
  season: OrgProgressionSeason;
  /** owner|editor : seuls rôles autorisés à muter (les RPC le revérifient). */
  canEdit: boolean;
}) {
  const meta = PROGRESSION_SEASON_STATUS_META[season.status];
  const itemCount = season.collections.reduce(
    (total, collection) => total + collection.items.length,
    0,
  );

  return (
    <section className="rounded-2xl border-2 border-k-ink bg-white p-5 shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-k-ink">{season.name}</h3>
          <p className="mt-0.5 text-sm font-semibold text-k-body">
            {formatWindow(season.startsAt, season.endsAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border-2 px-3 py-1 text-xs font-black ${meta.badgeClassName}`}
        >
          {meta.label}
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold text-k-body">{meta.hint}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SeasonCount label="Missions" value={season.missions.length} />
        <SeasonCount label="Badges" value={season.badges.length} />
        <SeasonCount label="Objets" value={itemCount} />
        <SeasonCount label="Coffres" value={season.chests.length} />
      </dl>

      <SeasonActions season={season} canEdit={canEdit} />

      {season.status === "draft" && canEdit ? (
        <DraftConfiguration season={season} />
      ) : (
        <SeasonContent season={season} canEdit={canEdit} />
      )}
    </section>
  );
}

function SeasonCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border-2 border-k-ink/15 bg-k-bg px-3 py-2">
      <dt className="text-xs font-bold text-k-body">{label}</dt>
      <dd className="text-xl font-black text-k-ink tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Zone d'actions, branchée sur le STATUT — un `switch` exhaustif sur les 4
 * états. Le cycle de vie est un ALLER SIMPLE : `draft → active → ended →
 * archived`. Aucune RPC ne relance une saison close ni ne désarchive : chaque
 * confirmation le dit en toutes lettres avant le clic décisif.
 */
function SeasonActions({
  season,
  canEdit,
}: {
  season: OrgProgressionSeason;
  canEdit: boolean;
}) {
  if (!canEdit) return null;

  switch (season.status) {
    case "draft":
      return (
        <div className="mt-4 flex flex-wrap items-start gap-2">
          <ActivateSeason season={season} />
          <ConfirmAction
            triggerLabel="Supprimer la saison"
            triggerAriaLabel={`Supprimer la saison ${season.name}`}
            triggerVariant="danger"
            confirmVariant="danger"
            title={`Supprimer définitivement « ${season.name} » ?`}
            consequences={[
              "La suppression est définitive : rien ne permet de restaurer une saison supprimée.",
              "Toute sa configuration part avec elle : missions, badges, collections, objets et coffres.",
              "Seul un brouillon peut être supprimé — une saison qui a tourné se clôt, elle ne s'efface pas.",
            ]}
            confirmLabel="Oui, supprimer définitivement"
            pendingLabel="Suppression…"
            action={() => deleteProgressionSeason({ seasonId: season.id })}
          />
        </div>
      );
    case "active":
      return (
        <div className="mt-4 flex flex-wrap items-start gap-2">
          <ConfirmAction
            triggerLabel="Clore la saison"
            triggerAriaLabel={`Clore la saison ${season.name}`}
            title={`Clore « ${season.name} » maintenant ?`}
            consequences={[
              "La clôture est DÉFINITIVE : une saison close ne peut plus être relancée, ni repassée en cours.",
              "Les missions cessent aussitôt d'avancer et les coffres ne s'ouvrent plus.",
              "Rien n'est perdu : badges, objets et clés gagnés restent visibles par vos joueurs, dans leurs saisons passées.",
              "Vous pourrez alors lancer une nouvelle saison.",
            ]}
            confirmLabel="Oui, clore définitivement"
            pendingLabel="Clôture…"
            action={() => endProgressionSeason({ seasonId: season.id })}
          />
        </div>
      );
    case "ended":
      return (
        <div className="mt-4 flex flex-wrap items-start gap-2">
          <ConfirmAction
            triggerLabel="Archiver la saison"
            triggerAriaLabel={`Archiver la saison ${season.name}`}
            title={`Archiver « ${season.name} » ?`}
            consequences={[
              "L'archivage est définitif : rien ne permet de ressortir une saison des archives.",
              "C'est un rangement, pas une destruction : les gains de vos joueurs restent intacts.",
              "La saison quitte simplement votre liste courante.",
            ]}
            confirmLabel="Oui, archiver"
            pendingLabel="Archivage…"
            action={() => archiveProgressionSeason({ seasonId: season.id })}
          />
        </div>
      );
    case "archived":
      return null;
  }
}

function ActivateSeason({ season }: { season: OrgProgressionSeason }) {
  const enabledMissions = season.missions.filter((mission) => mission.enabled);

  if (enabledMissions.length === 0) {
    return (
      <p className="w-full rounded-xl border-2 border-dashed border-k-ink/25 px-3 py-2 text-sm font-semibold text-k-body">
        Ajoutez au moins une mission activée pour pouvoir lancer cette saison.
      </p>
    );
  }

  return (
    <ConfirmAction
      triggerLabel="Lancer la saison"
      triggerAriaLabel={`Lancer la saison ${season.name}`}
      title={`Lancer « ${season.name} » ?`}
      consequences={[
        `La configuration sera définitivement figée : ${season.missions.length} mission${season.missions.length > 1 ? "s" : ""}, ${season.badges.length} badge${season.badges.length > 1 ? "s" : ""}, ${season.chests.length} coffre${season.chests.length > 1 ? "s" : ""}.`,
        "Aucune autre saison ne pourra être lancée tant que celle-ci court.",
        "Une fois lancée, la seule issue est la clôture — elle aussi définitive.",
        "Les missions progresseront ensuite toutes seules.",
      ]}
      confirmLabel="Oui, lancer la saison"
      pendingLabel="Lancement…"
      action={() => activateProgressionSeason({ seasonId: season.id })}
    />
  );
}

// ════════════════════════════════════════════════════════════
// Contenu d'une saison figée (lecture seule)
// ════════════════════════════════════════════════════════════

function SeasonContent({
  season,
  canEdit,
}: {
  season: OrgProgressionSeason;
  canEdit: boolean;
}) {
  /**
   * L'interrupteur d'arrêt n'a de sens que sur une saison EN COURS : sur une
   * saison close ou archivée, rien n'avance plus et aucun coffre ne s'ouvre —
   * proposer un bouton y serait une promesse creuse (les RPC le refusent).
   */
  const canSwitch = canEdit && season.status === "active";

  if (!season.missions.length && !season.chests.length) {
    return (
      <p className="mt-4 text-sm font-semibold text-k-body">
        Cette saison n&apos;a aucun contenu.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <h4 className="text-sm font-black text-k-ink">Missions</h4>
        {canSwitch && (
          <p className="mt-1 text-xs font-semibold text-k-body">
            La configuration est figée, mais une mission trop généreuse peut être
            désactivée ici — sans clore la saison, et sans rien effacer.
          </p>
        )}
        <ul className="mt-1.5 space-y-2">
          {season.missions.map((mission) => (
            <li key={mission.id} className={rowClass}>
              <div className="min-w-0">
                <p className="text-sm font-bold text-k-ink">
                  {mission.name}
                  <EnabledPill
                    enabled={mission.enabled}
                    activeLabel="Active"
                    pausedLabel="Désactivée"
                  />
                </p>
                <p className="text-xs font-semibold text-k-body">
                  {PROGRESSION_EVENT_LABELS[mission.rule.eventName]} ×
                  {mission.rule.target}
                  {mission.keyReward > 0 ? ` · ${mission.keyReward} 🔑` : ""} ·
                  règle v{mission.rule.version}
                </p>
              </div>
              {canSwitch && <MissionEnabledAction mission={mission} />}
            </li>
          ))}
          {!season.missions.length && (
            <li className="text-sm font-semibold text-k-body">
              Aucune mission.
            </li>
          )}
        </ul>
      </div>
      <div>
        <h4 className="text-sm font-black text-k-ink">Coffres</h4>
        {canSwitch && (
          <p className="mt-1 text-xs font-semibold text-k-body">
            Un coffre désactivé quitte l&apos;écran de vos joueurs et n&apos;est
            plus ouvrable ; leurs clés leur restent acquises.
          </p>
        )}
        <ul className="mt-1.5 space-y-2">
          {season.chests.map((chest) => (
            <li key={chest.id} className={rowClass}>
              <div className="min-w-0">
                <p className="text-sm font-bold text-k-ink">
                  {chest.name}
                  <EnabledPill
                    enabled={chest.enabled}
                    activeLabel="Actif"
                    pausedLabel="Désactivé"
                  />
                </p>
                <p className="text-xs font-semibold text-k-body">
                  {chest.keyCost} 🔑 · {chest.itemIds.length} objet
                  {chest.itemIds.length > 1 ? "s" : ""}
                </p>
              </div>
              {canSwitch && <ChestEnabledAction chest={chest} />}
            </li>
          ))}
          {!season.chests.length && (
            <li className="text-sm font-semibold text-k-body">Aucun coffre.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Configuration d'une saison en brouillon (le seul état modifiable)
// ════════════════════════════════════════════════════════════

interface OptionRef {
  id: string;
  label: string;
}

function DraftConfiguration({ season }: { season: OrgProgressionSeason }) {
  const items: OptionRef[] = season.collections.flatMap((collection) =>
    collection.items.map((item) => ({
      id: item.id,
      label: `${collection.name} · ${item.name}`,
    })),
  );
  const badges: OptionRef[] = season.badges.map((badge) => ({
    id: badge.id,
    label: badge.name,
  }));

  return (
    <div className="mt-5 border-t-2 border-k-ink/15 pt-5">
      <p
        role="note"
        className="rounded-xl border-2 border-dashed border-k-orange bg-k-yellow/40 px-3 py-2 text-sm font-bold text-k-ink"
      >
        Tant que la saison est en brouillon, tout reste corrigeable ici. Au
        lancement, la configuration est figée pour de bon.
      </p>

      <Step index={1} title="Badges" hint="Les distinctions à décrocher.">
        {season.badges.length > 0 && (
          <ul className="mb-3 space-y-2">
            {season.badges.map((badge) => (
              <BadgeRow key={badge.id} badge={badge} />
            ))}
          </ul>
        )}
        <BadgeForm mode="create" seasonId={season.id} />
      </Step>

      <Step
        index={2}
        title="Collections et objets"
        hint="L'album que le joueur remplit ; les coffres y puisent."
      >
        {season.collections.map((collection) => (
          <CollectionBlock key={collection.id} collection={collection} />
        ))}
        <CollectionForm mode="create" seasonId={season.id} />
      </Step>

      <Step
        index={3}
        title="Missions"
        hint="Elles avancent automatiquement : le joueur n'a rien à presser."
      >
        {season.missions.length > 0 && (
          <ul className="mb-3 space-y-2">
            {season.missions.map((mission) => (
              <MissionRow
                key={mission.id}
                mission={mission}
                badges={badges}
                items={items}
              />
            ))}
          </ul>
        )}
        <MissionForm
          mode="create"
          seasonId={season.id}
          badges={badges}
          items={items}
        />
      </Step>

      <Step
        index={4}
        title="Coffres"
        hint="Ils consomment des clés et débloquent un objet manquant."
      >
        {season.chests.length > 0 && (
          <ul className="mb-3 space-y-2">
            {season.chests.map((chest) => (
              <ChestRow key={chest.id} chest={chest} items={items} />
            ))}
          </ul>
        )}
        {items.length === 0 ? (
          <p className="text-sm font-semibold text-k-body">
            Créez d&apos;abord au moins un objet de collection.
          </p>
        ) : (
          <ChestForm mode="create" seasonId={season.id} items={items} />
        )}
      </Step>
    </div>
  );
}

function Step({
  index,
  title,
  hint,
  children,
}: {
  index: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h4 className="text-sm font-black text-k-ink">
        {index}. {title}
      </h4>
      <p className="mb-2.5 text-xs font-semibold text-k-body">{hint}</p>
      {children}
    </div>
  );
}

/** Enveloppe commune des formulaires de création et de correction. */
function EntityForm({
  legend,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  children,
}: {
  legend: string;
  submitLabel: string;
  pending: boolean;
  error: string;
  onSubmit: (data: FormData, form: HTMLFormElement) => void;
  /** Présent en correction seulement : refermer sans rien changer. */
  onCancel?: () => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        onSubmit(new FormData(form), form);
      }}
      className="rounded-xl border-2 border-k-ink/20 bg-k-bg p-3"
    >
      <fieldset disabled={pending} className="min-w-0">
        <legend className="px-1 text-xs font-black text-k-ink">{legend}</legend>
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : submitLabel}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onCancel}
            >
              Annuler
            </Button>
          )}
        </div>
      </fieldset>
      <FieldError message={error || undefined} />
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  wide = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs font-semibold text-k-body">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Un select de référence n'est neutralisé que s'il n'a AUCUN choix à offrir. */
function noChoiceAvailable(options: OptionRef[], current: string | null) {
  return options.length === 0 && !current;
}

// ── 1. Badge ──

function BadgeRow({ badge }: { badge: OrgProgressionBadge }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <BadgeForm mode="edit" badge={badge} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className={rowClass}>
      <span className="text-sm font-bold text-k-ink">
        <span aria-hidden>{PROGRESSION_BADGE_GLYPHS[badge.iconKey]}</span>{" "}
        {badge.name}
      </span>
      <div className="flex flex-wrap items-start gap-2">
        <Button
          variant="secondary"
          aria-label={`Modifier le badge ${badge.name}`}
          onClick={() => setEditing(true)}
        >
          Modifier
        </Button>
        <ConfirmAction
          triggerLabel="Supprimer"
          triggerAriaLabel={`Supprimer le badge ${badge.name}`}
          triggerVariant="danger"
          confirmVariant="danger"
          title={`Supprimer le badge « ${badge.name} » ?`}
          consequences={[
            "La suppression est définitive.",
            "Elle sera refusée si une mission le distribue encore : retirez-le d'abord de cette mission.",
          ]}
          confirmLabel="Oui, supprimer"
          pendingLabel="Suppression…"
          action={() => deleteProgressionBadge({ badgeId: badge.id })}
        />
      </div>
    </li>
  );
}

type BadgeFormProps =
  | { mode: "create"; seasonId: string }
  | { mode: "edit"; badge: OrgProgressionBadge; onDone: () => void };

function BadgeForm(props: BadgeFormProps) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();
  const initial = props.mode === "edit" ? props.badge : null;

  return (
    <EntityForm
      legend={initial ? `Modifier « ${initial.name} »` : "Nouveau badge"}
      submitLabel={initial ? "Enregistrer" : "Ajouter le badge"}
      pending={pending}
      error={error}
      onCancel={props.mode === "edit" ? props.onDone : undefined}
      onSubmit={(data, form) => {
        const payload = {
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? ""),
          iconKey: String(data.get("iconKey") ?? "star"),
        };
        if (props.mode === "edit") {
          run(
            () =>
              updateProgressionBadge({ badgeId: props.badge.id, ...payload }),
            props.onDone,
          );
          return;
        }
        run(
          () => createProgressionBadge({ seasonId: props.seasonId, ...payload }),
          () => form.reset(),
        );
      }}
    >
      <Field id={`${fieldId}-name`} label="Nom du badge">
        <Input
          id={`${fieldId}-name`}
          name="name"
          required
          maxLength={PROGRESSION_BADGE_NAME_MAX}
          defaultValue={initial?.name}
          placeholder="Ex : Habitué du comptoir"
        />
      </Field>
      <Field id={`${fieldId}-icon`} label="Pictogramme">
        <select
          id={`${fieldId}-icon`}
          name="iconKey"
          className={selectClass}
          defaultValue={initial?.iconKey ?? "star"}
        >
          {PROGRESSION_BADGE_ICONS.map((icon) => (
            <option key={icon} value={icon}>
              {PROGRESSION_BADGE_GLYPHS[icon]}{" "}
              {PROGRESSION_BADGE_ICON_LABELS[icon]}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${fieldId}-desc`} label="Description (facultatif)" wide>
        <Input
          id={`${fieldId}-desc`}
          name="description"
          maxLength={PROGRESSION_DESCRIPTION_MAX}
          defaultValue={initial?.description}
          placeholder="Ce que le badge récompense"
        />
      </Field>
    </EntityForm>
  );
}

// ── 2. Collection et objets ──

function CollectionBlock({
  collection,
}: {
  collection: OrgProgressionCollection;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="mb-3 rounded-xl border-2 border-k-ink/20 bg-white p-3">
      {editing ? (
        <CollectionForm
          mode="edit"
          collection={collection}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-black text-k-ink">{collection.name}</p>
          <div className="flex flex-wrap items-start gap-2">
            <Button
              variant="secondary"
              aria-label={`Modifier la collection ${collection.name}`}
              onClick={() => setEditing(true)}
            >
              Modifier
            </Button>
            <ConfirmAction
              triggerLabel="Supprimer"
              triggerAriaLabel={`Supprimer la collection ${collection.name}`}
              triggerVariant="danger"
              confirmVariant="danger"
              title={`Supprimer la collection « ${collection.name} » ?`}
              consequences={[
                "La suppression est définitive et emporte tous ses objets.",
                "Elle sera refusée si l'un de ses objets récompense une mission ou viderait un coffre.",
              ]}
              confirmLabel="Oui, supprimer"
              pendingLabel="Suppression…"
              action={() =>
                deleteProgressionCollection({ collectionId: collection.id })
              }
            />
          </div>
        </div>
      )}

      {collection.items.length > 0 && (
        <ul className="mt-2.5 mb-2.5 space-y-2">
          {collection.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      <CollectionItemForm
        mode="create"
        collectionId={collection.id}
        collectionName={collection.name}
      />
    </div>
  );
}

type CollectionFormProps =
  | { mode: "create"; seasonId: string }
  | { mode: "edit"; collection: OrgProgressionCollection; onDone: () => void };

function CollectionForm(props: CollectionFormProps) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();
  const initial = props.mode === "edit" ? props.collection : null;

  return (
    <EntityForm
      legend={initial ? `Modifier « ${initial.name} »` : "Nouvelle collection"}
      submitLabel={initial ? "Enregistrer" : "Ajouter la collection"}
      pending={pending}
      error={error}
      onCancel={props.mode === "edit" ? props.onDone : undefined}
      onSubmit={(data, form) => {
        const payload = {
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? ""),
        };
        if (props.mode === "edit") {
          run(
            () =>
              updateProgressionCollection({
                collectionId: props.collection.id,
                ...payload,
              }),
            props.onDone,
          );
          return;
        }
        run(
          () =>
            createProgressionCollection({
              seasonId: props.seasonId,
              ...payload,
            }),
          () => form.reset(),
        );
      }}
    >
      <Field id={`${fieldId}-name`} label="Nom de la collection">
        <Input
          id={`${fieldId}-name`}
          name="name"
          required
          maxLength={PROGRESSION_COLLECTION_NAME_MAX}
          defaultValue={initial?.name}
          placeholder="Ex : Les vignerons de la cave"
        />
      </Field>
      <Field id={`${fieldId}-desc`} label="Description (facultatif)">
        <Input
          id={`${fieldId}-desc`}
          name="description"
          maxLength={PROGRESSION_DESCRIPTION_MAX}
          defaultValue={initial?.description}
        />
      </Field>
    </EntityForm>
  );
}

function ItemRow({ item }: { item: OrgProgressionItem }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <CollectionItemForm
          mode="edit"
          item={item}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className={rowClass}>
      <span className="text-sm font-bold text-k-ink">{item.name}</span>
      <div className="flex flex-wrap items-start gap-2">
        <Button
          variant="secondary"
          aria-label={`Modifier l'objet ${item.name}`}
          onClick={() => setEditing(true)}
        >
          Modifier
        </Button>
        <ConfirmAction
          triggerLabel="Supprimer"
          triggerAriaLabel={`Supprimer l'objet ${item.name}`}
          triggerVariant="danger"
          confirmVariant="danger"
          title={`Supprimer l'objet « ${item.name} » ?`}
          consequences={[
            "La suppression est définitive.",
            "Elle sera refusée s'il récompense une mission, ou s'il est le dernier butin d'un coffre.",
          ]}
          confirmLabel="Oui, supprimer"
          pendingLabel="Suppression…"
          action={() => deleteProgressionCollectionItem({ itemId: item.id })}
        />
      </div>
    </li>
  );
}

type CollectionItemFormProps =
  | { mode: "create"; collectionId: string; collectionName: string }
  | { mode: "edit"; item: OrgProgressionItem; onDone: () => void };

function CollectionItemForm(props: CollectionItemFormProps) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();
  const initial = props.mode === "edit" ? props.item : null;

  return (
    <EntityForm
      legend={
        props.mode === "edit"
          ? `Modifier « ${props.item.name} »`
          : `Nouvel objet dans « ${props.collectionName} »`
      }
      submitLabel={initial ? "Enregistrer" : "Ajouter l'objet"}
      pending={pending}
      error={error}
      onCancel={props.mode === "edit" ? props.onDone : undefined}
      onSubmit={(data, form) => {
        const payload = {
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? ""),
          imageUrl: String(data.get("imageUrl") ?? ""),
        };
        if (props.mode === "edit") {
          run(
            () =>
              updateProgressionCollectionItem({
                itemId: props.item.id,
                ...payload,
                // Position omise ('' → null) : rééditer un libellé ne doit pas
                // réordonner l'album.
                position: "",
              }),
            props.onDone,
          );
          return;
        }
        run(
          () =>
            createProgressionCollectionItem({
              collectionId: props.collectionId,
              ...payload,
            }),
          () => form.reset(),
        );
      }}
    >
      <Field id={`${fieldId}-name`} label="Nom de l'objet">
        <Input
          id={`${fieldId}-name`}
          name="name"
          required
          maxLength={PROGRESSION_ITEM_NAME_MAX}
          defaultValue={initial?.name}
          placeholder="Ex : La carte du domaine"
        />
      </Field>
      <Field
        id={`${fieldId}-image`}
        label="Image (facultatif)"
        hint="URL en https:// uniquement."
      >
        <Input
          id={`${fieldId}-image`}
          name="imageUrl"
          type="url"
          inputMode="url"
          maxLength={PROGRESSION_IMAGE_URL_MAX}
          defaultValue={initial?.imageUrl ?? ""}
          placeholder="https://…"
          aria-describedby={`${fieldId}-image-hint`}
        />
      </Field>
      <Field id={`${fieldId}-desc`} label="Description (facultatif)" wide>
        <Input
          id={`${fieldId}-desc`}
          name="description"
          maxLength={PROGRESSION_DESCRIPTION_MAX}
          defaultValue={initial?.description}
        />
      </Field>
    </EntityForm>
  );
}

// ── 3. Mission ──

function MissionRow({
  mission,
  badges,
  items,
}: {
  mission: OrgProgressionMission;
  badges: OptionRef[];
  items: OptionRef[];
}) {
  const [editing, setEditing] = useState(false);
  /**
   * Numéro de la version de règle publiée par la dernière correction. La règle
   * n'est JAMAIS réécrite en place : chaque édition ajoute une révision au
   * journal immuable. Le commerçant doit le lire, sinon il croit avoir écrasé la
   * précédente. `null` = la RPC n'a pas rendu de numéro lisible : on n'affiche
   * alors rien plutôt qu'un numéro faux.
   */
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);

  if (editing) {
    return (
      <li>
        <MissionForm
          mode="edit"
          mission={mission}
          badges={badges}
          items={items}
          onDone={(version) => {
            setPublishedVersion(version);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className={rowClass}>
      <div className="min-w-0">
        <p className="text-sm font-bold text-k-ink">
          {mission.name}
          <EnabledPill
            enabled={mission.enabled}
            activeLabel="Active"
            pausedLabel="Désactivée"
          />
        </p>
        <p className="text-xs font-semibold text-k-body">
          {PROGRESSION_EVENT_LABELS[mission.rule.eventName]} ×
          {mission.rule.target}
          {mission.keyReward > 0 ? ` · ${mission.keyReward} 🔑` : ""} · règle v
          {mission.rule.version}
        </p>
        {publishedVersion !== null && (
          <p
            role="status"
            className="mt-1 rounded-lg border-2 border-k-ink bg-k-green/30 px-2 py-1 text-xs font-bold text-k-ink"
          >
            Nouvelle règle publiée en version {publishedVersion}. Les versions
            précédentes sont conservées : rien n&apos;a été écrasé.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Button
          variant="secondary"
          aria-label={`Modifier la mission ${mission.name}`}
          onClick={() => setEditing(true)}
        >
          Modifier
        </Button>
        <MissionEnabledAction mission={mission} />
        <ConfirmAction
          triggerLabel="Supprimer"
          triggerAriaLabel={`Supprimer la mission ${mission.name}`}
          triggerVariant="danger"
          confirmVariant="danger"
          title={`Supprimer la mission « ${mission.name} » ?`}
          consequences={[
            "La suppression est définitive, avec tout son journal de règles.",
            "Elle sera refusée dès qu'un joueur y a progressé : utilisez alors « Désactiver », juste à côté, pour l'arrêter sans l'effacer.",
          ]}
          confirmLabel="Oui, supprimer"
          pendingLabel="Suppression…"
          action={() => deleteProgressionMission({ missionId: mission.id })}
        />
      </div>
    </li>
  );
}

type MissionFormProps = { badges: OptionRef[]; items: OptionRef[] } & (
  | { mode: "create"; seasonId: string }
  | {
      mode: "edit";
      mission: OrgProgressionMission;
      onDone: (version: number | null) => void;
    }
);

function MissionForm(props: MissionFormProps) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();
  const initial = props.mode === "edit" ? props.mission : null;
  const [kinds, setKinds] = useState<string[]>(
    initial ? [...initial.rule.experienceKinds] : ["campaign"],
  );
  const [kindError, setKindError] = useState("");

  const toggleKind = (kind: string, checked: boolean) => {
    setKinds((current) =>
      checked
        ? current.includes(kind)
          ? current
          : [...current, kind]
        : current.filter((entry) => entry !== kind),
    );
  };

  return (
    <EntityForm
      legend={initial ? `Modifier « ${initial.name} »` : "Nouvelle mission"}
      submitLabel={initial ? "Publier une nouvelle règle" : "Ajouter la mission"}
      pending={pending}
      error={error || kindError}
      onCancel={props.mode === "edit" ? () => props.onDone(null) : undefined}
      onSubmit={(data, form) => {
        if (kinds.length === 0) {
          setKindError("Choisissez au moins un type d'expérience");
          return;
        }
        setKindError("");
        const payload = {
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? ""),
          eventName: String(data.get("eventName") ?? ""),
          target: String(data.get("target") ?? ""),
          experienceKinds: kinds,
          keyReward: String(data.get("keyReward") ?? "0"),
          source: String(data.get("source") ?? ""),
          distinctExperiences: data.get("distinctExperiences") === "on",
          badgeId: String(data.get("badgeId") ?? ""),
          collectionItemId: String(data.get("collectionItemId") ?? ""),
        };
        if (props.mode === "edit") {
          const done = props.onDone;
          run(
            () =>
              updateProgressionMission({
                missionId: props.mission.id,
                ...payload,
                enabled: data.get("enabled") === "on",
              }),
            (result) => done(result.version),
          );
          return;
        }
        run(
          () =>
            createProgressionMission({ seasonId: props.seasonId, ...payload }),
          () => {
            form.reset();
            setKinds(["campaign"]);
          },
        );
      }}
    >
      {initial && (
        <p className="rounded-lg border-2 border-dashed border-k-ink/30 px-3 py-2 text-xs font-semibold text-k-body sm:col-span-2">
          Cette mission suit la règle v{initial.rule.version}. Enregistrer
          publiera la version {initial.rule.version + 1} : la règle actuelle est
          conservée dans l&apos;historique, jamais écrasée.
        </p>
      )}

      <Field id={`${fieldId}-name`} label="Nom de la mission" wide>
        <Input
          id={`${fieldId}-name`}
          name="name"
          required
          maxLength={PROGRESSION_MISSION_NAME_MAX}
          defaultValue={initial?.name}
          placeholder="Ex : Jouer 3 fois dans la semaine"
        />
      </Field>

      <Field id={`${fieldId}-event`} label="Ce qui fait avancer la mission">
        <select
          id={`${fieldId}-event`}
          name="eventName"
          className={selectClass}
          defaultValue={initial?.rule.eventName ?? "experience_completed"}
        >
          {PROGRESSION_EVENT_NAMES.map((event) => (
            <option key={event} value={event}>
              {PROGRESSION_EVENT_LABELS[event]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id={`${fieldId}-target`}
        label="Palier à atteindre"
        hint={`De ${PROGRESSION_TARGET_MIN} à ${PROGRESSION_TARGET_MAX}.`}
      >
        <Input
          id={`${fieldId}-target`}
          name="target"
          type="number"
          inputMode="numeric"
          required
          min={PROGRESSION_TARGET_MIN}
          max={PROGRESSION_TARGET_MAX}
          defaultValue={initial?.rule.target ?? 3}
          aria-describedby={`${fieldId}-target-hint`}
        />
      </Field>

      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-bold text-k-ink">
          Expériences comptabilisées
        </legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {PROGRESSION_EXPERIENCE_KINDS.map((kind) => (
            <label
              key={kind}
              className="flex items-center gap-2 text-sm font-semibold text-k-ink"
            >
              <input
                type="checkbox"
                className={checkboxClass}
                checked={kinds.includes(kind)}
                onChange={(event) =>
                  toggleKind(kind, event.currentTarget.checked)
                }
              />
              {PROGRESSION_EXPERIENCE_LABELS[kind]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        id={`${fieldId}-keys`}
        label="Clés versées à l'achèvement"
        hint={`0 à ${PROGRESSION_KEY_REWARD_MAX}. Les clés ouvrent les coffres.`}
      >
        <Input
          id={`${fieldId}-keys`}
          name="keyReward"
          type="number"
          inputMode="numeric"
          min={0}
          max={PROGRESSION_KEY_REWARD_MAX}
          defaultValue={initial?.keyReward ?? 1}
          aria-describedby={`${fieldId}-keys-hint`}
        />
      </Field>

      <Field id={`${fieldId}-source`} label="Origine exigée (facultatif)">
        <select
          id={`${fieldId}-source`}
          name="source"
          className={selectClass}
          defaultValue={initial?.rule.source ?? ""}
        >
          <option value="">Toutes les origines</option>
          {PROGRESSION_SOURCES.map((source) => (
            <option key={source} value={source}>
              {PROGRESSION_SOURCE_LABELS[source]}
            </option>
          ))}
        </select>
      </Field>

      <Field id={`${fieldId}-badge`} label="Badge octroyé (facultatif)">
        <select
          id={`${fieldId}-badge`}
          name="badgeId"
          className={selectClass}
          defaultValue={initial?.badgeId ?? ""}
          disabled={noChoiceAvailable(props.badges, initial?.badgeId ?? null)}
        >
          <option value="">Aucun badge</option>
          {props.badges.map((badge) => (
            <option key={badge.id} value={badge.id}>
              {badge.label}
            </option>
          ))}
        </select>
      </Field>

      <Field id={`${fieldId}-item`} label="Objet octroyé (facultatif)">
        <select
          id={`${fieldId}-item`}
          name="collectionItemId"
          className={selectClass}
          defaultValue={initial?.collectionItemId ?? ""}
          disabled={noChoiceAvailable(
            props.items,
            initial?.collectionItemId ?? null,
          )}
        >
          <option value="">Aucun objet</option>
          {props.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id={`${fieldId}-desc`}
        label="Description montrée au joueur (facultatif)"
        wide
      >
        <textarea
          id={`${fieldId}-desc`}
          name="description"
          rows={2}
          maxLength={PROGRESSION_MISSION_DESCRIPTION_MAX}
          defaultValue={initial?.description}
          className={textareaClass}
        />
      </Field>

      <label className="flex items-start gap-2 text-sm font-semibold text-k-ink sm:col-span-2">
        <input
          type="checkbox"
          name="distinctExperiences"
          defaultChecked={initial?.rule.distinctExperiences ?? false}
          className={`${checkboxClass} mt-0.5`}
        />
        Ne compter qu&apos;une fois par expérience différente (anti-répétition).
      </label>

      {initial && (
        <label className="flex items-start gap-2 text-sm font-semibold text-k-ink sm:col-span-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={initial.enabled}
            className={`${checkboxClass} mt-0.5`}
          />
          Mission active (décochez pour l&apos;arrêter sans la supprimer).
        </label>
      )}
    </EntityForm>
  );
}

// ── 4. Coffre ──

function ChestRow({
  chest,
  items,
}: {
  chest: OrgProgressionChest;
  items: OptionRef[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <ChestForm
          mode="edit"
          chest={chest}
          items={items}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className={rowClass}>
      <div className="min-w-0">
        <p className="text-sm font-bold text-k-ink">
          {chest.name}
          <EnabledPill
            enabled={chest.enabled}
            activeLabel="Actif"
            pausedLabel="Désactivé"
          />
        </p>
        <p className="text-xs font-semibold text-k-body">
          {chest.keyCost} 🔑 · {chest.itemIds.length} objet
          {chest.itemIds.length > 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Button
          variant="secondary"
          aria-label={`Modifier le coffre ${chest.name}`}
          onClick={() => setEditing(true)}
        >
          Modifier
        </Button>
        <ChestEnabledAction chest={chest} />
        <ConfirmAction
          triggerLabel="Supprimer"
          triggerAriaLabel={`Supprimer le coffre ${chest.name}`}
          triggerVariant="danger"
          confirmVariant="danger"
          title={`Supprimer le coffre « ${chest.name} » ?`}
          consequences={[
            "La suppression est définitive.",
            "Elle sera refusée dès qu'un joueur l'a ouvert : utilisez alors « Désactiver », juste à côté, pour le fermer sans l'effacer.",
          ]}
          confirmLabel="Oui, supprimer"
          pendingLabel="Suppression…"
          action={() => deleteProgressionChest({ chestId: chest.id })}
        />
      </div>
    </li>
  );
}

type ChestFormProps = { items: OptionRef[] } & (
  | { mode: "create"; seasonId: string }
  | { mode: "edit"; chest: OrgProgressionChest; onDone: () => void }
);

function ChestForm(props: ChestFormProps) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();
  const initial = props.mode === "edit" ? props.chest : null;
  const knownIds = new Set(props.items.map((item) => item.id));
  const [selected, setSelected] = useState<string[]>(
    initial ? initial.itemIds.filter((id) => knownIds.has(id)) : [],
  );
  const [itemError, setItemError] = useState("");

  const toggleItem = (id: string, checked: boolean) => {
    setSelected((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((entry) => entry !== id),
    );
  };

  return (
    <EntityForm
      legend={initial ? `Modifier « ${initial.name} »` : "Nouveau coffre"}
      submitLabel={initial ? "Enregistrer" : "Ajouter le coffre"}
      pending={pending}
      error={error || itemError}
      onCancel={props.mode === "edit" ? props.onDone : undefined}
      onSubmit={(data, form) => {
        if (selected.length === 0) {
          setItemError("Ajoutez au moins un objet au coffre");
          return;
        }
        setItemError("");
        const payload = {
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? ""),
          keyCost: String(data.get("keyCost") ?? ""),
          // `itemIds` REMPLACE intégralement le contenu du coffre : on envoie
          // toujours la liste complète voulue, jamais un delta.
          itemIds: selected,
        };
        if (props.mode === "edit") {
          run(
            () =>
              updateProgressionChest({
                chestId: props.chest.id,
                ...payload,
                enabled: data.get("enabled") === "on",
              }),
            props.onDone,
          );
          return;
        }
        run(
          () => createProgressionChest({ seasonId: props.seasonId, ...payload }),
          () => {
            form.reset();
            setSelected([]);
          },
        );
      }}
    >
      <Field id={`${fieldId}-name`} label="Nom du coffre">
        <Input
          id={`${fieldId}-name`}
          name="name"
          required
          maxLength={PROGRESSION_CHEST_NAME_MAX}
          defaultValue={initial?.name}
          placeholder="Ex : Le coffre du cellier"
        />
      </Field>
      <Field
        id={`${fieldId}-cost`}
        label="Coût en clés"
        hint={`De ${PROGRESSION_KEY_COST_MIN} à ${PROGRESSION_KEY_COST_MAX} clés.`}
      >
        <Input
          id={`${fieldId}-cost`}
          name="keyCost"
          type="number"
          inputMode="numeric"
          required
          min={PROGRESSION_KEY_COST_MIN}
          max={PROGRESSION_KEY_COST_MAX}
          defaultValue={initial?.keyCost ?? 2}
          aria-describedby={`${fieldId}-cost-hint`}
        />
      </Field>
      <Field id={`${fieldId}-desc`} label="Description (facultatif)" wide>
        <Input
          id={`${fieldId}-desc`}
          name="description"
          maxLength={PROGRESSION_DESCRIPTION_MAX}
          defaultValue={initial?.description}
        />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-bold text-k-ink">
          Objets que ce coffre peut débloquer ({selected.length}/
          {PROGRESSION_CHEST_ITEMS_MAX})
        </legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {props.items.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 text-sm font-semibold text-k-ink"
            >
              <input
                type="checkbox"
                className={checkboxClass}
                checked={selected.includes(item.id)}
                onChange={(event) =>
                  toggleItem(item.id, event.currentTarget.checked)
                }
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>

      {initial && (
        <label className="flex items-start gap-2 text-sm font-semibold text-k-ink sm:col-span-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={initial.enabled}
            className={`${checkboxClass} mt-0.5`}
          />
          Coffre actif (décochez pour le fermer sans le supprimer).
        </label>
      )}
    </EntityForm>
  );
}
