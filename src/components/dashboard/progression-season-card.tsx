"use client";

import { useId, useState, useTransition } from "react";
import {
  activateProgressionSeason,
  createProgressionBadge,
  createProgressionChest,
  createProgressionCollection,
  createProgressionCollectionItem,
  createProgressionMission,
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
  type OrgProgressionCollection,
  type OrgProgressionSeason,
} from "@/lib/meta-progression";
import type { ActionResult } from "@/lib/utils";

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const checkboxClass = "h-4 w-4 shrink-0 accent-k-orange";

/**
 * Exécution d'une des 6 mutations `create_*` / `activate`. Les actions prennent
 * un objet typé (pas une FormData), d'où `useTransition` plutôt que
 * `useActionState`. Le `pending` sert de verrou : aucune double soumission ne
 * part, et une création — irréversible — ne peut pas être jouée deux fois par un
 * double-clic.
 */
function useProgressionMutation() {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (
    call: () => Promise<ActionResult<unknown>>,
    onSuccess?: () => void,
  ) => {
    if (pending) return;
    startTransition(async () => {
      const result = await call();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      onSuccess?.();
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
        <SeasonContent season={season} />
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
 * Zone d'actions de la carte, branchée sur le STATUT — un `switch` exhaustif sur
 * les 4 états. Ajouter une action « clore la saison » quand la RPC existera se
 * fait en complétant la seule branche `active` : ni la carte ni ses props n'ont
 * à bouger.
 */
function SeasonActions({
  season,
  canEdit,
}: {
  season: OrgProgressionSeason;
  canEdit: boolean;
}) {
  switch (season.status) {
    case "draft":
      return canEdit ? <ActivateSeason season={season} /> : null;
    case "active":
      // Emplacement de l'action « clore la saison » : la RPC correspondante
      // n'existe pas encore en base, aucun bouton n'est donc proposé.
      return (
        <p className="mt-4 rounded-xl border-2 border-dashed border-k-ink/25 px-3 py-2 text-sm font-semibold text-k-body">
          Cette saison court jusqu&apos;à son échéance. Pour en lancer une
          autre, attendez qu&apos;elle se termine.
        </p>
      );
    case "ended":
    case "archived":
      return null;
  }
}

/**
 * Lancement d'une saison, en DEUX temps : le premier clic ouvre une
 * confirmation qui énonce ce que l'activation fige et le fait qu'une seule
 * saison peut courir. Aucune confirmation native (`window.confirm`) : le
 * panneau reste dans le flux du document, donc lisible par un lecteur d'écran.
 */
function ActivateSeason({ season }: { season: OrgProgressionSeason }) {
  const [confirming, setConfirming] = useState(false);
  const { error, pending, run } = useProgressionMutation();
  const enabledMissions = season.missions.filter((mission) => mission.enabled);
  const blocked = enabledMissions.length === 0;

  if (blocked) {
    return (
      <p className="mt-4 rounded-xl border-2 border-dashed border-k-ink/25 px-3 py-2 text-sm font-semibold text-k-body">
        Ajoutez au moins une mission pour pouvoir lancer cette saison.
      </p>
    );
  }

  if (!confirming) {
    return (
      <div className="mt-4">
        <Button onClick={() => setConfirming(true)}>Lancer la saison</Button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border-2 border-k-ink bg-k-yellow/40 p-3">
      <p className="text-sm font-black text-k-ink">
        Lancer « {season.name} » ?
      </p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm font-semibold text-k-ink">
        <li>
          La configuration sera <strong>définitivement figée</strong> :
          {" "}
          {season.missions.length} mission
          {season.missions.length > 1 ? "s" : ""}, {season.badges.length} badge
          {season.badges.length > 1 ? "s" : ""}, {season.chests.length} coffre
          {season.chests.length > 1 ? "s" : ""}.
        </li>
        <li>
          Aucune autre saison ne pourra être lancée tant que celle-ci court.
        </li>
        <li>Les missions progresseront ensuite toutes seules.</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            run(
              () => activateProgressionSeason({ seasonId: season.id }),
              () => setConfirming(false),
            )
          }
        >
          {pending ? "Lancement…" : "Oui, lancer la saison"}
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
// Contenu d'une saison figée (lecture seule)
// ════════════════════════════════════════════════════════════

function SeasonContent({ season }: { season: OrgProgressionSeason }) {
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
        <ul className="mt-1.5 space-y-1 text-sm font-semibold text-k-body">
          {season.missions.map((mission) => (
            <li key={mission.id}>
              {mission.name} — {PROGRESSION_EVENT_LABELS[mission.rule.eventName]}{" "}
              ×{mission.rule.target}
              {mission.keyReward > 0 ? ` · ${mission.keyReward} 🔑` : ""}
            </li>
          ))}
          {!season.missions.length && <li>Aucune mission.</li>}
        </ul>
      </div>
      <div>
        <h4 className="text-sm font-black text-k-ink">Coffres</h4>
        <ul className="mt-1.5 space-y-1 text-sm font-semibold text-k-body">
          {season.chests.map((chest) => (
            <li key={chest.id}>
              {chest.name} — {chest.keyCost} 🔑 · {chest.itemIds.length} objet
              {chest.itemIds.length > 1 ? "s" : ""}
            </li>
          ))}
          {!season.chests.length && <li>Aucun coffre.</li>}
        </ul>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Configuration d'une saison en brouillon (le seul état modifiable)
// ════════════════════════════════════════════════════════════

function DraftConfiguration({ season }: { season: OrgProgressionSeason }) {
  const items = season.collections.flatMap((collection) =>
    collection.items.map((item) => ({
      id: item.id,
      label: `${collection.name} · ${item.name}`,
    })),
  );

  return (
    <div className="mt-5 border-t-2 border-k-ink/15 pt-5">
      <p
        role="note"
        className="rounded-xl border-2 border-dashed border-k-orange bg-k-yellow/40 px-3 py-2 text-sm font-bold text-k-ink"
      >
        Tout ce que vous ajoutez ci-dessous est définitif : ni modification ni
        suppression après création. Relisez avant de valider.
      </p>

      <Step index={1} title="Badges" hint="Les distinctions à décrocher.">
        {season.badges.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {season.badges.map((badge) => (
              <li
                key={badge.id}
                className="rounded-full border-2 border-k-ink bg-k-bg px-3 py-1 text-sm font-bold text-k-ink"
              >
                <span aria-hidden>{PROGRESSION_BADGE_GLYPHS[badge.iconKey]}</span>{" "}
                {badge.name}
              </li>
            ))}
          </ul>
        )}
        <BadgeForm seasonId={season.id} />
      </Step>

      <Step
        index={2}
        title="Collections et objets"
        hint="L'album que le joueur remplit ; les coffres y puisent."
      >
        {season.collections.map((collection) => (
          <CollectionBlock key={collection.id} collection={collection} />
        ))}
        <CollectionForm seasonId={season.id} />
      </Step>

      <Step
        index={3}
        title="Missions"
        hint="Elles avancent automatiquement : le joueur n'a rien à presser."
      >
        {season.missions.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm font-semibold text-k-body">
            {season.missions.map((mission) => (
              <li key={mission.id}>
                {mission.name} —{" "}
                {PROGRESSION_EVENT_LABELS[mission.rule.eventName]} ×
                {mission.rule.target}
                {mission.keyReward > 0 ? ` · ${mission.keyReward} 🔑` : ""}
              </li>
            ))}
          </ul>
        )}
        <MissionForm
          seasonId={season.id}
          badges={season.badges.map((badge) => ({
            id: badge.id,
            label: badge.name,
          }))}
          items={items}
        />
      </Step>

      <Step
        index={4}
        title="Coffres"
        hint="Ils consomment des clés et débloquent un objet manquant."
      >
        {season.chests.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm font-semibold text-k-body">
            {season.chests.map((chest) => (
              <li key={chest.id}>
                {chest.name} — {chest.keyCost} 🔑 · {chest.itemIds.length} objet
                {chest.itemIds.length > 1 ? "s" : ""}
              </li>
            ))}
          </ul>
        )}
        {items.length === 0 ? (
          <p className="text-sm font-semibold text-k-body">
            Créez d&apos;abord au moins un objet de collection.
          </p>
        ) : (
          <ChestForm seasonId={season.id} items={items} />
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

/** Enveloppe commune des formulaires de création : cadre, bouton, erreur. */
function CreateForm({
  legend,
  submitLabel,
  pending,
  error,
  onSubmit,
  children,
}: {
  legend: string;
  submitLabel: string;
  pending: boolean;
  error: string;
  onSubmit: (data: FormData, form: HTMLFormElement) => void;
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
        <div className="mt-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Ajout…" : submitLabel}
          </Button>
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

// ── 1. Badge ──

function BadgeForm({ seasonId }: { seasonId: string }) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();

  return (
    <CreateForm
      legend="Nouveau badge"
      submitLabel="Ajouter le badge"
      pending={pending}
      error={error}
      onSubmit={(data, form) =>
        run(
          () =>
            createProgressionBadge({
              seasonId,
              name: String(data.get("name") ?? ""),
              description: String(data.get("description") ?? ""),
              iconKey: String(data.get("iconKey") ?? "star"),
            }),
          () => form.reset(),
        )
      }
    >
      <Field id={`${fieldId}-name`} label="Nom du badge">
        <Input
          id={`${fieldId}-name`}
          name="name"
          required
          maxLength={PROGRESSION_BADGE_NAME_MAX}
          placeholder="Ex : Habitué du comptoir"
        />
      </Field>
      <Field id={`${fieldId}-icon`} label="Pictogramme">
        <select id={`${fieldId}-icon`} name="iconKey" className={selectClass}>
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
          placeholder="Ce que le badge récompense"
        />
      </Field>
    </CreateForm>
  );
}

// ── 2. Collection et objets ──

function CollectionBlock({
  collection,
}: {
  collection: OrgProgressionCollection;
}) {
  return (
    <div className="mb-3 rounded-xl border-2 border-k-ink/20 bg-white p-3">
      <p className="text-sm font-black text-k-ink">{collection.name}</p>
      {collection.items.length > 0 && (
        <ul className="mt-1.5 mb-2.5 flex flex-wrap gap-2">
          {collection.items.map((item) => (
            <li
              key={item.id}
              className="rounded-full border-2 border-k-ink/30 bg-k-bg px-2.5 py-0.5 text-xs font-bold text-k-ink"
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
      <CollectionItemForm
        collectionId={collection.id}
        collectionName={collection.name}
      />
    </div>
  );
}

function CollectionForm({ seasonId }: { seasonId: string }) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();

  return (
    <CreateForm
      legend="Nouvelle collection"
      submitLabel="Ajouter la collection"
      pending={pending}
      error={error}
      onSubmit={(data, form) =>
        run(
          () =>
            createProgressionCollection({
              seasonId,
              name: String(data.get("name") ?? ""),
              description: String(data.get("description") ?? ""),
            }),
          () => form.reset(),
        )
      }
    >
      <Field id={`${fieldId}-name`} label="Nom de la collection">
        <Input
          id={`${fieldId}-name`}
          name="name"
          required
          maxLength={PROGRESSION_COLLECTION_NAME_MAX}
          placeholder="Ex : Les vignerons de la cave"
        />
      </Field>
      <Field id={`${fieldId}-desc`} label="Description (facultatif)">
        <Input
          id={`${fieldId}-desc`}
          name="description"
          maxLength={PROGRESSION_DESCRIPTION_MAX}
        />
      </Field>
    </CreateForm>
  );
}

function CollectionItemForm({
  collectionId,
  collectionName,
}: {
  collectionId: string;
  collectionName: string;
}) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();

  return (
    <CreateForm
      legend={`Nouvel objet dans « ${collectionName} »`}
      submitLabel="Ajouter l'objet"
      pending={pending}
      error={error}
      onSubmit={(data, form) =>
        run(
          () =>
            createProgressionCollectionItem({
              collectionId,
              name: String(data.get("name") ?? ""),
              description: String(data.get("description") ?? ""),
              imageUrl: String(data.get("imageUrl") ?? ""),
            }),
          () => form.reset(),
        )
      }
    >
      <Field id={`${fieldId}-name`} label="Nom de l'objet">
        <Input
          id={`${fieldId}-name`}
          name="name"
          required
          maxLength={PROGRESSION_ITEM_NAME_MAX}
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
          placeholder="https://…"
          aria-describedby={`${fieldId}-image-hint`}
        />
      </Field>
      <Field id={`${fieldId}-desc`} label="Description (facultatif)" wide>
        <Input
          id={`${fieldId}-desc`}
          name="description"
          maxLength={PROGRESSION_DESCRIPTION_MAX}
        />
      </Field>
    </CreateForm>
  );
}

// ── 3. Mission ──

interface OptionRef {
  id: string;
  label: string;
}

function MissionForm({
  seasonId,
  badges,
  items,
}: {
  seasonId: string;
  badges: OptionRef[];
  items: OptionRef[];
}) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();
  const [kinds, setKinds] = useState<string[]>(["campaign"]);
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
    <CreateForm
      legend="Nouvelle mission"
      submitLabel="Ajouter la mission"
      pending={pending}
      error={error || kindError}
      onSubmit={(data, form) => {
        if (kinds.length === 0) {
          setKindError("Choisissez au moins un type d'expérience");
          return;
        }
        setKindError("");
        run(
          () =>
            createProgressionMission({
              seasonId,
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
            }),
          () => {
            form.reset();
            setKinds(["campaign"]);
          },
        );
      }}
    >
      <Field id={`${fieldId}-name`} label="Nom de la mission" wide>
        <Input
          id={`${fieldId}-name`}
          name="name"
          required
          maxLength={PROGRESSION_MISSION_NAME_MAX}
          placeholder="Ex : Jouer 3 fois dans la semaine"
        />
      </Field>

      <Field id={`${fieldId}-event`} label="Ce qui fait avancer la mission">
        <select id={`${fieldId}-event`} name="eventName" className={selectClass}>
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
          defaultValue={3}
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
                onChange={(event) => toggleKind(kind, event.currentTarget.checked)}
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
          defaultValue={1}
          aria-describedby={`${fieldId}-keys-hint`}
        />
      </Field>

      <Field id={`${fieldId}-source`} label="Origine exigée (facultatif)">
        <select id={`${fieldId}-source`} name="source" className={selectClass}>
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
          disabled={badges.length === 0}
        >
          <option value="">Aucun badge</option>
          {badges.map((badge) => (
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
          disabled={items.length === 0}
        >
          <option value="">Aucun objet</option>
          {items.map((item) => (
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
          className={textareaClass}
        />
      </Field>

      <label className="flex items-start gap-2 text-sm font-semibold text-k-ink sm:col-span-2">
        <input
          type="checkbox"
          name="distinctExperiences"
          className={`${checkboxClass} mt-0.5`}
        />
        Ne compter qu&apos;une fois par expérience différente (anti-répétition).
      </label>
    </CreateForm>
  );
}

// ── 4. Coffre ──

function ChestForm({
  seasonId,
  items,
}: {
  seasonId: string;
  items: OptionRef[];
}) {
  const fieldId = useId();
  const { error, pending, run } = useProgressionMutation();
  const [selected, setSelected] = useState<string[]>([]);
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
    <CreateForm
      legend="Nouveau coffre"
      submitLabel="Ajouter le coffre"
      pending={pending}
      error={error || itemError}
      onSubmit={(data, form) => {
        if (selected.length === 0) {
          setItemError("Ajoutez au moins un objet au coffre");
          return;
        }
        setItemError("");
        run(
          () =>
            createProgressionChest({
              seasonId,
              name: String(data.get("name") ?? ""),
              description: String(data.get("description") ?? ""),
              keyCost: String(data.get("keyCost") ?? ""),
              itemIds: selected,
            }),
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
          defaultValue={2}
          aria-describedby={`${fieldId}-cost-hint`}
        />
      </Field>
      <Field id={`${fieldId}-desc`} label="Description (facultatif)" wide>
        <Input
          id={`${fieldId}-desc`}
          name="description"
          maxLength={PROGRESSION_DESCRIPTION_MAX}
        />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-bold text-k-ink">
          Objets que ce coffre peut débloquer ({selected.length}/
          {PROGRESSION_CHEST_ITEMS_MAX})
        </legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {items.map((item) => (
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
    </CreateForm>
  );
}
