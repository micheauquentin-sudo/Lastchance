"use client";

import { useActionState, useState } from "react";
import {
  deleteContest,
  finalizeContest,
  setContestAwardStatus,
  updateContest,
  updateContestEventSettings,
  updateContestGenericScoring,
  updateContestRewards,
  updateContestScoring,
  updateContestTiebreaker,
} from "@/actions/pronostics";
import type {
  ContestQuestionType,
  ContestReward,
  ContestScoring,
} from "@/lib/pronostics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  EVENT_KINDS,
  eventKindLabel,
  getEventKind,
} from "@/components/dashboard/contest-event-kinds";
import type { Contest, ContestAward, ContestStatus } from "@/types/database";

const STATUS_ACTIONS: Array<{
  from: ContestStatus[];
  to: ContestStatus;
  label: string;
  /** La RPC exige un motif journalisé pour cette transition. */
  needsReason?: boolean;
}> = [
  { from: ["draft"], to: "active", label: "Ouvrir le championnat" },
  { from: ["active"], to: "finished", label: "Marquer terminé" },
  { from: ["finished"], to: "active", label: "Rouvrir", needsReason: true },
];

/** Bandeau commun : règlement verrouillé → toute correction est motivée. */
function LockedNotice({ finalized }: { finalized: boolean }) {
  if (finalized) {
    return (
      <p className="mb-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
        🔒 Championnat clôturé : règlement et classement sont définitifs.
      </p>
    );
  }
  return (
    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
      🔒 Le jeu a commencé : toute modification exige un motif, journalisé et
      visible dans l&apos;audit.
    </p>
  );
}

/** Champ motif (min. 10 caractères — même règle que la base). */
function ReasonInput({ id }: { id: string }) {
  return (
    <div>
      <Label htmlFor={id}>Motif de la correction (journalisé)</Label>
      <Input
        id={id}
        name="reason"
        required
        minLength={10}
        maxLength={300}
        placeholder="Ex : erreur de saisie signalée par les joueurs"
      />
    </div>
  );
}

export function ContestSettings({
  contest,
  locked = false,
  timeZone = "Europe/Paris",
}: {
  contest: Contest;
  /** Premier pronostic déposé ou coup d'envoi passé : règlement gelé. */
  locked?: boolean;
  /** Fuseau de l'établissement (affichage des dates). */
  timeZone?: string;
}) {
  const [renameState, renameAction, renamePending] = useActionState(
    updateContest,
    null,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    updateContest,
    null,
  );
  const [collectState, collectAction, collectPending] = useActionState(
    updateContest,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteContest,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const finalized = contest.finalized_at !== null;
  // Un championnat clôturé ne change plus de statut (la RPC le refuse
  // aussi — ceci évite juste de proposer un bouton voué à l'échec).
  const transitions = finalized
    ? []
    : STATUS_ACTIONS.filter((a) => a.from.includes(contest.status));

  return (
    <Card>
      <h2 className="font-semibold mb-4">Réglages</h2>

      <form action={renameAction} className="flex items-end gap-2">
        <input type="hidden" name="id" value={contest.id} />
        <div className="flex-1 max-w-xs">
          <Label htmlFor="contest-name">Nom du championnat</Label>
          <Input
            id="contest-name"
            name="name"
            defaultValue={contest.name}
            required
            maxLength={120}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={renamePending}>
          {renamePending ? "…" : "Renommer"}
        </Button>
      </form>
      <FieldError
        message={renameState && !renameState.ok ? renameState.error : undefined}
      />

      <div className="mt-5 space-y-2">
        {finalized && (
          <p className="text-sm text-zinc-500">
            🔒 Championnat clôturé le{" "}
            {new Date(contest.finalized_at!).toLocaleDateString("fr-FR")} —
            statut définitif.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          {transitions.map((t) => (
            <form key={t.to} action={statusAction} className="flex items-end gap-2">
              <input type="hidden" name="id" value={contest.id} />
              <input type="hidden" name="status" value={t.to} />
              {t.needsReason && (
                <div className="max-w-xs">
                  <ReasonInput id={`status-reason-${t.to}`} />
                </div>
              )}
              <Button
                type="submit"
                variant={t.to === "active" ? "primary" : "secondary"}
                disabled={statusPending}
              >
                {t.label}
              </Button>
            </form>
          ))}
        </div>
      </div>
      <FieldError
        message={statusState && !statusState.ok ? statusState.error : undefined}
      />

      <form action={collectAction} className="mt-5 border-t border-zinc-100 pt-4">
        <input type="hidden" name="id" value={contest.id} />
        <input type="hidden" name="collection_settings" value="1" />
        <p className="text-sm font-bold text-k-ink mb-2">
          Données demandées à l&apos;inscription
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-k-body">
            <input
              type="checkbox"
              name="collect_email"
              defaultChecked={contest.collect_email}
              className="h-4 w-4 accent-k-ink"
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm text-k-body">
            <input
              type="checkbox"
              name="collect_phone"
              defaultChecked={contest.collect_phone}
              className="h-4 w-4 accent-k-ink"
            />
            Téléphone
          </label>
          <Button type="submit" variant="secondary" disabled={collectPending}>
            {collectPending ? "…" : "Enregistrer"}
          </Button>
        </div>
        <FieldError
          message={collectState && !collectState.ok ? collectState.error : undefined}
        />
      </form>

      <EventSection
        contest={contest}
        locked={locked}
        finalized={finalized}
        timeZone={timeZone}
      />

      <TiebreakerSection contest={contest} locked={locked} finalized={finalized} />

      <div className="mt-5 border-t border-zinc-100 pt-4">
        {confirmDelete ? (
          <form action={deleteAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={contest.id} />
            <span className="text-sm text-k-body">
              Supprimer ce championnat, ses matchs et tous les pronostics ?
            </span>
            <Button type="submit" variant="danger" disabled={deletePending}>
              {deletePending ? "Suppression…" : "Confirmer"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={deletePending}
            >
              Annuler
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer le championnat
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </Card>
  );
}

/**
 * Réglages de l'événement : modèle (`event_kind`) et verrouillage par
 * défaut appliqué aux questions GÉNÉRIQUES sans échéance propre — les
 * matchs importés (type `score`) l'ignorent, voir `effectiveLocksAt`.
 *
 * Le MODÈLE se fige dès le premier pronostic/coup d'envoi (les joueurs
 * ont déjà vu l'habillage) : le sélecteur est alors désactivé — et un
 * champ désactivé n'est pas soumis, ce qui vaut « ne change pas » pour la
 * RPC. La DATE reste ajustable (événement reporté) avec motif journalisé.
 *
 * L'effacement de la date est explicite (case à cocher) : un champ vide
 * vaut « efface » côté serveur, jamais par accident depuis l'UI.
 */
function EventSection({
  contest,
  locked,
  finalized,
  timeZone,
}: {
  contest: Contest;
  locked: boolean;
  finalized: boolean;
  timeZone: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateContestEventSettings,
    null,
  );
  const [locksIso, setLocksIso] = useState("");
  const [clearLocks, setClearLocks] = useState(false);
  const kindFrozen = locked || finalized;
  const current = contest.default_locks_at;
  // Le football est le seul modèle à porter des matchs importés (questions
  // de type `score`) : leur échéance reste le coup d'envoi, JAMAIS le
  // verrouillage par défaut — sans quoi un report de calendrier fermerait
  // les pronostics trop tôt. Le champ garde du sens sur ce modèle (les
  // questions ajoutées à la main s'y appuient), mais il est accompagné de
  // sa limite explicite plutôt que de laisser croire à un effet global.
  const usesCompetition = getEventKind(contest.event_kind)?.usesCompetition ?? false;

  // Rien à envoyer : ni nouvelle date, ni effacement demandé.
  const dateUnchanged = locksIso === "" && !clearLocks;

  return (
    <form action={formAction} className="mt-5 border-t border-zinc-100 pt-4">
      <input type="hidden" name="id" value={contest.id} />
      <input
        type="hidden"
        name="default_locks_at"
        value={clearLocks ? "" : locksIso}
      />
      <p className="text-sm font-bold text-k-ink mb-1">Événement</p>
      <p className="text-xs text-zinc-500 mb-3">
        {usesCompetition
          ? "Le modèle pilote l'habillage du parcours joueur. Le verrouillage par défaut ne concerne que les questions ajoutées à la main, sans échéance propre."
          : "Le modèle pilote l'habillage du parcours joueur. Le verrouillage par défaut s'applique aux questions qui n'ont pas leur propre échéance."}
      </p>
      <div className="space-y-3">
        <div>
          <Label htmlFor="event-kind">Type d&apos;événement</Label>
          {kindFrozen ? (
            <>
              <p className="rounded-xl border-2 border-zinc-300 bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-600">
                {eventKindLabel(contest.event_kind)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                🔒 Figé — {finalized ? "championnat clôturé." : "le jeu a commencé."}
              </p>
            </>
          ) : (
            <select
              id="event-kind"
              name="event_kind"
              defaultValue={contest.event_kind}
              className="w-full max-w-xs rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
            >
              {/* Un modèle posé hors catalogue reste sélectionnable. */}
              {!EVENT_KINDS.some((k) => k.key === contest.event_kind) && (
                <option value={contest.event_kind}>{contest.event_kind}</option>
              )}
              {EVENT_KINDS.map((kind) => (
                <option key={kind.key} value={kind.key}>
                  {kind.icon} {kind.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <Label htmlFor="event-default-locks">
            Verrouillage par défaut
          </Label>
          {usesCompetition && (
            <p
              id="event-default-locks-scope"
              className="mb-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              ⚠️ Ne s&apos;applique pas aux matchs : chacun ferme à son coup
              d&apos;envoi, reports de calendrier compris. Cette date ne vaut
              que pour les questions ajoutées à la main.
            </p>
          )}
          <p className="mb-1.5 text-xs text-zinc-500">
            Actuel :{" "}
            {current
              ? new Intl.DateTimeFormat("fr-FR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone,
                }).format(new Date(current))
              : "aucun"}
          </p>
          <Input
            id="event-default-locks"
            type="datetime-local"
            className="max-w-xs"
            aria-describedby={
              usesCompetition ? "event-default-locks-scope" : undefined
            }
            disabled={finalized || clearLocks}
            onChange={(e) => {
              const value = e.target.value;
              setLocksIso(value ? new Date(value).toISOString() : "");
            }}
          />
          {current && !finalized && (
            <label className="mt-2 flex items-center gap-2 text-sm text-k-body">
              <input
                type="checkbox"
                checked={clearLocks}
                onChange={(e) => setClearLocks(e.target.checked)}
                className="h-4 w-4 accent-k-ink"
              />
              Supprimer la date de verrouillage par défaut
            </label>
          )}
        </div>

        {locked && !finalized && <ReasonInput id="event-reason" />}
        {!finalized && (
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || (kindFrozen && dateUnchanged)}
          >
            {pending ? "…" : "Enregistrer l'événement"}
          </Button>
        )}
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

/**
 * Question subsidiaire : départage les ex æquo (écart absolu à la
 * réponse officielle). La question se fige au premier pronostic ; la
 * réponse reste saisissable jusqu'à la clôture.
 */
function TiebreakerSection({
  contest,
  locked,
  finalized,
}: {
  contest: Contest;
  locked: boolean;
  finalized: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateContestTiebreaker, null);
  const questionFrozen = locked || finalized;

  return (
    <form action={formAction} className="mt-5 border-t border-zinc-100 pt-4">
      <input type="hidden" name="id" value={contest.id} />
      <p className="text-sm font-bold text-k-ink mb-1">Question subsidiaire</p>
      <p className="text-xs text-zinc-500 mb-3">
        Départage les ex æquo : le joueur le plus proche de la réponse
        officielle passe devant. Posée à l&apos;inscription, figée dès le
        premier pronostic.
      </p>
      <div className="space-y-3">
        <div>
          <Label htmlFor="tiebreaker-question">Question (nombre attendu)</Label>
          <Input
            id="tiebreaker-question"
            name="question"
            defaultValue={contest.tiebreaker_question ?? ""}
            maxLength={160}
            placeholder="Ex : Combien de buts au total dans la compétition ?"
            disabled={questionFrozen}
          />
          {questionFrozen && !finalized && (
            <p className="mt-1 text-xs text-zinc-500">
              🔒 Figée — le jeu a commencé.
            </p>
          )}
          {/* La question figée doit repartir telle quelle avec la réponse. */}
          {questionFrozen && (
            <input
              type="hidden"
              name="question"
              value={contest.tiebreaker_question ?? ""}
            />
          )}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="tiebreaker-answer">Réponse officielle</Label>
            <Input
              id="tiebreaker-answer"
              name="answer"
              type="number"
              min={0}
              max={1000000}
              defaultValue={contest.tiebreaker_answer ?? ""}
              placeholder="À saisir en fin de saison"
              className="w-40"
              disabled={finalized}
            />
          </div>
          {!finalized && (
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "…" : "Enregistrer"}
            </Button>
          )}
        </div>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

/**
 * Paliers génériques par type de question — clés miroir de la colonne
 * `contests.scoring` (voir DEFAULT_GENERIC_SCORING). Seuls les blocs des
 * types RÉELLEMENT présents dans l'événement sont affichés.
 */
const GENERIC_TIERS: Array<{
  type: Exclude<ContestQuestionType, "score">;
  title: string;
  fields: Array<{
    key: "choice" | "ranking_exact" | "ranking_partial" | "number_exact" | "number_close" | "number_tolerance";
    label: string;
    hint: string;
    fallback: number;
  }>;
}> = [
  {
    type: "choice",
    title: "🎯 Choix unique",
    fields: [
      {
        key: "choice",
        label: "Bonne réponse",
        hint: "Points quand l'option choisie est la bonne",
        fallback: 3,
      },
    ],
  },
  {
    type: "ranking",
    title: "🥇 Classement",
    fields: [
      {
        key: "ranking_exact",
        label: "Ordre complet juste",
        hint: "Toutes les places dans le bon ordre",
        fallback: 5,
      },
      {
        key: "ranking_partial",
        label: "Par place bien placée",
        hint: "Quand l'ordre n'est pas complètement juste",
        fallback: 1,
      },
    ],
  },
  {
    type: "number",
    title: "🔢 Estimation chiffrée",
    fields: [
      {
        key: "number_exact",
        label: "Valeur exacte",
        hint: "Points quand le nombre tombe pile",
        fallback: 5,
      },
      {
        key: "number_close",
        label: "Valeur proche",
        hint: "Points quand l'écart tient dans la tolérance",
        fallback: 2,
      },
      {
        key: "number_tolerance",
        label: "Tolérance",
        hint: "Écart accepté pour « valeur proche » (0 = palier inactif)",
        fallback: 0,
      },
    ],
  },
];

export function ContestScoringForm({
  contestId,
  scoring,
  questionTypes = ["score"],
  eventKind,
  locked = false,
  finalized = false,
}: {
  contestId: string;
  scoring: ContestScoring;
  /** Types de questions présents dans l'événement (pilote les blocs
   *  affichés). Défaut : le football seul — comportement d'origine. */
  questionTypes?: ContestQuestionType[];
  /** Modèle de l'événement : fournit le barème conseillé (pré-remplissage
   *  des seuls paliers JAMAIS enregistrés — voir GenericScoringForm). */
  eventKind?: string;
  locked?: boolean;
  finalized?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateContestScoring, null);
  const [genericState, genericAction, genericPending] = useActionState(
    updateContestGenericScoring,
    null,
  );

  const fields: Array<{ name: "exact" | "diff" | "winner"; label: string; hint: string }> = [
    { name: "exact", label: "Score exact", hint: "Ex : prono 2-1, résultat 2-1" },
    { name: "diff", label: "Bonne différence", hint: "Ex : prono 2-1, résultat 3-2" },
    { name: "winner", label: "Bon vainqueur", hint: "Ex : prono 1-0, résultat 4-0" },
  ];

  // Un événement sans aucune question affiche le barème des scores :
  // c'est le cas d'un championnat football qui n'a pas encore de match.
  const showScore =
    questionTypes.length === 0 || questionTypes.includes("score");
  const genericBlocks = GENERIC_TIERS.filter((tier) =>
    questionTypes.includes(tier.type),
  );

  return (
    <Card>
      <h2 className="font-semibold mb-1">Barème de points</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Un pronostic rapporte le palier le plus haut atteint. Toute modification
        recalcule immédiatement les points des questions déjà résolues.
      </p>
      {(locked || finalized) && <LockedNotice finalized={finalized} />}

      {showScore && (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={contestId} />
          {fields.map((f) => (
            <div key={f.name} className="flex items-center gap-3">
              <Input
                name={f.name}
                type="number"
                min={0}
                max={100}
                defaultValue={scoring[f.name]}
                required
                className="w-20 text-center"
                aria-label={f.label}
                disabled={finalized}
              />
              <div>
                <p className="text-sm font-bold text-k-ink">{f.label}</p>
                <p className="text-xs text-zinc-500">{f.hint}</p>
              </div>
            </div>
          ))}
          {locked && !finalized && <ReasonInput id="scoring-reason" />}
          {!finalized && (
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "…" : "Enregistrer le barème"}
            </Button>
          )}
          <FieldError message={state && !state.ok ? state.error : undefined} />
        </form>
      )}

      {genericBlocks.length > 0 && (
        <GenericScoringForm
          contestId={contestId}
          scoring={scoring}
          suggested={eventKind ? getEventKind(eventKind)?.suggestedScoring : undefined}
          blocks={genericBlocks}
          locked={locked}
          finalized={finalized}
          pending={genericPending}
          formAction={genericAction}
          error={
            genericState && !genericState.ok ? genericState.error : undefined
          }
          separated={showScore}
        />
      )}
    </Card>
  );
}

function GenericScoringForm({
  contestId,
  scoring,
  suggested,
  blocks,
  locked,
  finalized,
  pending,
  formAction,
  error,
  separated,
}: {
  contestId: string;
  scoring: ContestScoring;
  /** Barème conseillé par le modèle d'événement (jamais enregistré seul). */
  suggested?: Partial<ContestScoring>;
  blocks: typeof GENERIC_TIERS;
  locked: boolean;
  finalized: boolean;
  pending: boolean;
  formAction: (formData: FormData) => void;
  error?: string;
  /** Un trait sépare les paliers génériques du barème des scores. */
  separated: boolean;
}) {
  // `parseScoring` n'expose un palier générique QUE s'il a été enregistré :
  // « valeur absente » vaut donc « jamais réglé ». Le conseil du modèle ne
  // s'applique qu'à ces paliers-là — un barème déjà réglé n'est jamais
  // écrasé — et il n'est ÉCRIT en base que si le commerçant enregistre.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const block of blocks) {
      for (const field of block.fields) {
        const stored = scoring[field.key];
        initial[field.key] = String(
          typeof stored === "number"
            ? stored
            : (suggested?.[field.key] ?? field.fallback),
        );
      }
    }
    return initial;
  });

  const prefilled = blocks.some((block) =>
    block.fields.some(
      (field) =>
        typeof scoring[field.key] !== "number" &&
        typeof suggested?.[field.key] === "number",
    ),
  );

  // Seules les clés affichées partent au serveur : la RPC fusionne, les
  // paliers d'un type absent de l'événement restent intacts.
  const payload = JSON.stringify(
    Object.fromEntries(
      blocks.flatMap((block) =>
        block.fields.map((field) => [field.key, Number(values[field.key] ?? 0)]),
      ),
    ),
  );

  return (
    <form
      action={formAction}
      className={separated ? "mt-5 space-y-3 border-t border-zinc-100 pt-4" : "space-y-3"}
    >
      <input type="hidden" name="id" value={contestId} />
      <input type="hidden" name="values" value={payload} />
      {prefilled && (
        <p className="rounded-lg bg-k-yellow/20 px-3 py-2 text-xs text-k-ink">
          ✨ Valeurs conseillées pour ce type d&apos;événement — ajustez-les
          puis enregistrez.
        </p>
      )}
      {blocks.map((block) => (
        <fieldset key={block.type} className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">{block.title}</legend>
          {block.fields.map((field) => (
            <div key={field.key} className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={1000000}
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  setValues((current) => ({
                    ...current,
                    [field.key]: e.target.value,
                  }))
                }
                required
                className="w-20 text-center"
                aria-label={`${block.title} — ${field.label}`}
                disabled={finalized}
              />
              <div>
                <p className="text-sm font-bold text-k-ink">{field.label}</p>
                <p className="text-xs text-zinc-500">{field.hint}</p>
              </div>
            </div>
          ))}
        </fieldset>
      ))}
      {locked && !finalized && <ReasonInput id="generic-scoring-reason" />}
      {!finalized && (
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Enregistrer les paliers"}
        </Button>
      )}
      <FieldError message={error} />
    </form>
  );
}

export function ContestRewardsEditor({
  contestId,
  rewards,
  locked = false,
  finalized = false,
}: {
  contestId: string;
  rewards: ContestReward[];
  locked?: boolean;
  finalized?: boolean;
}) {
  const [rows, setRows] = useState<ContestReward[]>(
    rewards.length > 0 ? rewards : [{ from: 1, to: 1, label: "" }],
  );
  const [state, formAction, pending] = useActionState(updateContestRewards, null);

  const update = (i: number, patch: Partial<ContestReward>) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  // Seuls les paliers avec libellé partent au serveur (lignes vides ignorées).
  const payload = JSON.stringify(rows.filter((r) => r.label.trim() !== ""));

  return (
    <Card>
      <h2 className="font-semibold mb-1">Récompenses</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Ce que gagnent vos clients selon leur rang au classement final.
      </p>
      {(locked || finalized) && <LockedNotice finalized={finalized} />}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={contestId} />
        <input type="hidden" name="rewards" value={payload} />
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-k-body">Du rang</span>
            <Input
              type="number"
              min={1}
              max={999}
              value={r.from}
              onChange={(e) => update(i, { from: Number(e.target.value) })}
              className="w-16 text-center"
              aria-label={`Rang de début du palier ${i + 1}`}
            />
            <span className="text-sm text-k-body">au</span>
            <Input
              type="number"
              min={1}
              max={999}
              value={r.to}
              onChange={(e) => update(i, { to: Number(e.target.value) })}
              className="w-16 text-center"
              aria-label={`Rang de fin du palier ${i + 1}`}
            />
            <Input
              value={r.label}
              onChange={(e) => update(i, { label: e.target.value })}
              maxLength={120}
              placeholder="Ex : Repas offert pour deux"
              className="flex-1 min-w-40"
              aria-label={`Récompense du palier ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              aria-label={`Supprimer le palier ${i + 1}`}
            >
              ✕
            </Button>
          </div>
        ))}
        {locked && !finalized && <ReasonInput id="rewards-reason" />}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={rows.length >= 20 || finalized}
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  from: (prev[prev.length - 1]?.to ?? 0) + 1,
                  to: (prev[prev.length - 1]?.to ?? 0) + 1,
                  label: "",
                },
              ])
            }
          >
            + Ajouter un palier
          </Button>
          {!finalized && (
            <Button type="submit" disabled={pending}>
              {pending ? "…" : "Enregistrer les récompenses"}
            </Button>
          )}
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Clôture des récompenses + palmarès
// ────────────────────────────────────────────────────────────

/**
 * Clôture : photographie le classement (politique d'ex æquo complète,
 * tirage auditable en dernier recours) et attribue un lot par rang.
 * Action définitive, réservée au propriétaire.
 */
export function ContestFinalizeCard({
  contest,
}: {
  contest: Contest;
}) {
  const [state, formAction, pending] = useActionState(finalizeContest, null);
  const [confirm, setConfirm] = useState(false);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Clôture des récompenses</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Fige le classement final (ex æquo départagés : points, scores
        exacts, bons écarts, question subsidiaire, puis tirage auditable),
        attribue les lots et génère les codes de retrait.{" "}
        <strong>Action définitive</strong> — plus aucune modification ensuite.
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={contest.id} />
        {contest.tiebreaker_question && (
          <div>
            <Label htmlFor="finalize-answer">
              Réponse officielle — « {contest.tiebreaker_question} »
            </Label>
            <Input
              id="finalize-answer"
              name="tiebreaker_answer"
              type="number"
              min={0}
              max={1000000}
              defaultValue={contest.tiebreaker_answer ?? ""}
              className="w-40"
            />
          </div>
        )}
        {confirm ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-k-body">
              Clôturer définitivement et attribuer les lots ?
            </span>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Clôture…" : "Confirmer la clôture"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirm(false)}
              disabled={pending}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={() => setConfirm(true)}>
            Clôturer et attribuer les récompenses
          </Button>
        )}
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

const AWARD_STATUS_LABELS: Record<ContestAward["status"], string> = {
  pending: "À remettre",
  delivered: "Remis",
  cancelled: "Annulé",
};

/** Palmarès : lots attribués à la clôture, remise en caisse contre code. */
export function ContestAwardsList({
  contestId,
  awards,
}: {
  contestId: string;
  awards: Array<ContestAward & { playerName: string }>;
}) {
  const [state, formAction, pending] = useActionState(setContestAwardStatus, null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  return (
    <Card>
      <h2 className="font-semibold mb-1">🏅 Récompenses attribuées</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Le gagnant présente son code en caisse ; marquez le lot « remis »
        à la remise. Chaque mouvement est journalisé.
      </p>
      <ul className="space-y-2">
        {awards.map((award) => (
          <li
            key={award.id}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2"
          >
            <span className="w-8 text-center font-black tabular-nums text-k-ink">
              {award.rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
              {award.playerName}
              <span className="ml-2 font-normal text-zinc-500">
                {award.reward_label}
              </span>
            </span>
            <code className="rounded bg-white px-2 py-0.5 text-xs font-mono font-bold text-k-ink border border-zinc-200">
              {award.code}
            </code>
            <span
              className={
                award.status === "delivered"
                  ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700"
                  : award.status === "cancelled"
                    ? "rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-bold text-zinc-600"
                    : "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700"
              }
            >
              {AWARD_STATUS_LABELS[award.status]}
            </span>
            {award.status === "pending" && (
              <span className="flex items-center gap-1.5">
                <form action={formAction}>
                  <input type="hidden" name="id" value={award.id} />
                  <input type="hidden" name="contest_id" value={contestId} />
                  <input type="hidden" name="status" value="delivered" />
                  <Button type="submit" variant="secondary" disabled={pending}>
                    Marquer remis
                  </Button>
                </form>
                {cancelId === award.id ? (
                  <form action={formAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={award.id} />
                    <input type="hidden" name="contest_id" value={contestId} />
                    <input type="hidden" name="status" value="cancelled" />
                    <Input
                      name="reason"
                      required
                      minLength={10}
                      maxLength={300}
                      placeholder="Motif d'annulation (journalisé)"
                      className="w-56"
                      aria-label="Motif d'annulation"
                    />
                    <Button type="submit" variant="danger" disabled={pending}>
                      Annuler le lot
                    </Button>
                  </form>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setCancelId(award.id)}
                  >
                    Annuler…
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </Card>
  );
}
