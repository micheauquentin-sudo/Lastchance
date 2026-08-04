"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createHuntStep,
  deleteHunt,
  deleteHuntStep,
  reorderHuntSteps,
  setHuntStatus,
  updateHunt,
  updateHuntStep,
} from "@/actions/hunts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CodeTtlDaysField,
  codeTtlDaysInitial,
} from "@/components/dashboard/code-ttl-days-field";
import { FieldError, Input, Label } from "@/components/ui/input";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import { cleOrdre, ordreAffiche, type OrdreLocal } from "@/lib/ordre-optimiste";
import { useActionForm } from "@/lib/use-action-form";
import {
  HUNT_DELETE_LOSS_HINT,
  HUNT_STEP_LOSS_HINT,
} from "@/lib/validations/hunts";
import type { Hunt, HuntStep } from "@/types/database";

// useActionForm et non useActionState : l'état de chargement doit retomber même
// quand le rendu ne rejoue pas la revalidation — docs/bugs.md.

/** Nombre d'étapes autorisé (miroir des bornes SQL / validations). */
const MIN_STEPS = 2;
const MAX_STEPS = 10;

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

// ────────────────────────────────────────────────────────────
// Réglages de la chasse
// ────────────────────────────────────────────────────────────

export function HuntSettings({
  hunt,
  timeZone,
}: {
  hunt: Hunt;
  timeZone: string;
}) {
  // Pas de `resetOnSuccess` : les deux datetime-local sont contrôlés par l'état
  // `dates` ci-dessous, qu'un reset ne remettrait pas dans l'état serveur.
  const { state, pending, onSubmit } = useActionForm(updateHunt, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const [dates, setDates] = useState(() => ({
    starts: isoToZonedDateTimeInput(hunt.starts_at, timeZone),
    ends: isoToZonedDateTimeInput(hunt.ends_at, timeZone),
  }));
  const [codeTtlDays, setCodeTtlDays] = useState(() =>
    codeTtlDaysInitial(hunt.code_ttl_days),
  );

  return (
    <Card>
      <h2 className="font-semibold mb-1">Réglages</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Nom, ordre des étapes, fenêtre de jeu et lot final remis en caisse.
      </p>

      <form onSubmit={onSubmit} className="space-y-6">
        <input type="hidden" name="id" value={hunt.id} />

        <div className="max-w-sm">
          <Label htmlFor="hunt-name">Nom de la chasse</Label>
          <Input
            id="hunt-name"
            name="name"
            defaultValue={hunt.name}
            required
            maxLength={80}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-k-ink mb-1">
            Ordre des étapes
          </legend>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="radio"
              name="order_mode"
              value="free"
              defaultChecked={hunt.order_mode === "free"}
              className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
            />
            <span>
              <span className="font-bold text-k-ink">Libre</span>
              <span className="block text-xs text-zinc-500">
                Les étapes peuvent être tamponnées dans n&apos;importe quel
                ordre.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="radio"
              name="order_mode"
              value="ordered"
              defaultChecked={hunt.order_mode === "ordered"}
              className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
            />
            <span>
              <span className="font-bold text-k-ink">Imposé</span>
              <span className="block text-xs text-zinc-500">
                Les joueurs doivent suivre l&apos;ordre des étapes (1, puis 2,
                puis 3…).
              </span>
            </span>
          </label>
        </fieldset>

        <div>
          <Label htmlFor="hunt-interval">
            Délai minimal entre deux tampons (secondes)
          </Label>
          <Input
            id="hunt-interval"
            name="min_scan_interval_seconds"
            type="number"
            min={0}
            max={86400}
            defaultValue={hunt.min_scan_interval_seconds}
            className="w-40"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            Anti-partage de photos du QR : empêche de tamponner plusieurs
            étapes trop vite depuis un même téléphone. 0 = désactivé.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">
            Fenêtre de jeu (optionnelle)
          </legend>
          <div className="flex flex-wrap gap-4">
            <div>
              <Label htmlFor="hunt-starts-at">Début</Label>
              <Input
                id="hunt-starts-at"
                name="starts_at"
                type="datetime-local"
                value={dates.starts}
                onChange={(e) =>
                  setDates((prev) => ({ ...prev, starts: e.target.value }))
                }
                className="w-56"
              />
            </div>
            <div>
              <Label htmlFor="hunt-ends-at">Fin</Label>
              <Input
                id="hunt-ends-at"
                name="ends_at"
                type="datetime-local"
                value={dates.ends}
                onChange={(e) =>
                  setDates((prev) => ({ ...prev, ends: e.target.value }))
                }
                className="w-56"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Vide = sans borne. Hors fenêtre, les pages d&apos;étapes deviennent
            indisponibles pour les joueurs. Heures de l&apos;établissement (
            {timeZone}).
          </p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">Lot final</legend>
          <div>
            <Label htmlFor="hunt-reward-label">Lot (requis pour activer)</Label>
            <Input
              id="hunt-reward-label"
              name="reward_label"
              defaultValue={hunt.reward_label}
              maxLength={80}
              placeholder="Ex : Un dessert offert"
              className="max-w-sm"
            />
          </div>
          <div>
            <Label htmlFor="hunt-reward-details">Détails (optionnel)</Label>
            <textarea
              id="hunt-reward-details"
              name="reward_details"
              defaultValue={hunt.reward_details ?? ""}
              maxLength={2000}
              rows={3}
              placeholder="Conditions, durée de validité, modalités de retrait…"
              className={textareaClass}
            />
          </div>
          <div>
            <Label htmlFor="hunt-reward-stock">Stock (optionnel)</Label>
            <Input
              id="hunt-reward-stock"
              name="reward_stock"
              type="number"
              min={0}
              max={1000000}
              defaultValue={hunt.reward_stock ?? ""}
              placeholder="Illimité"
              className="w-40"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Nombre de lots disponibles. Vide = illimité. Une fois épuisé, les
              joueurs qui terminent sont informés qu&apos;il n&apos;y a plus de
              lot.
            </p>
          </div>
          <CodeTtlDaysField
            idPrefix="hunt"
            value={codeTtlDays}
            onChange={setCodeTtlDays}
            emissionHint="Délai laissé au joueur pour présenter son code CHASSE- en caisse, à partir du moment où il TERMINE la chasse."
          />
        </fieldset>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
          {state?.ok && (
            <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
          )}
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Étapes (une étape = un QR code)
// ────────────────────────────────────────────────────────────

export function HuntStepsEditor({
  huntId,
  steps,
}: {
  huntId: string;
  /** Étapes triées par position croissante. */
  steps: HuntStep[];
}) {
  const router = useRouter();
  const [reorderError, setReorderError] = useState<string | null>(null);
  // Pas de `useTransition` : son `pending` est piloté par le rendu et peut ne
  // jamais retomber (docs/bugs.md). Ici il retombe dans un `finally`.
  const [pending, setPending] = useState(false);
  /**
   * ÉCRASEMENT LOCAL DE L'ORDRE, avec l'ordre serveur comme date de péremption.
   *
   * Le commentaire qui vivait ici disait « Pas d'optimisme : le
   * rafraîchissement re-trie par position dès le succès ». C'est exactement
   * l'hypothèse que la mesure du 2026-07-30 a invalidée — `router.refresh()`
   * ne s'applique pas 5 à 32 % du temps (docs/bugs.md).
   *
   * Et son échec ne se contentait pas de figer l'écran : il CORROMPAIT la
   * donnée au clic suivant. L'ordre complet part au serveur, et il était
   * recalculé depuis la liste AFFICHÉE, donc périmée. Deux flèches d'affilée
   * après un rafraîchissement raté écrivaient en base un ordre que le
   * commerçant n'avait jamais demandé — et sur une chasse, l'ordre des étapes
   * est le parcours lui-même.
   *
   * Pas de rechargement franc ici (le correctif retenu ailleurs) : on clique ↑
   * et ↓ des dizaines de fois, chaque rechargement remettrait la page en haut.
   * C'est aussi le seul geste dont on connaît le résultat sans demander au
   * serveur : on vient de calculer l'ordre.
   *
   * Péremption sans effet ni nettoyage, comme `applied` dans
   * progression-season-card.tsx : dès que l'ordre serveur bouge, la
   * correspondance échoue et l'écrasement cesse de s'appliquer de lui-même.
   */
  const [ordreLocal, setOrdreLocal] = useState<OrdreLocal | null>(null);

  const cleServeur = cleOrdre(steps);
  const affichees = ordreAffiche(steps, ordreLocal);
  const full = affichees.length >= MAX_STEPS;

  // Réordonnancement : on envoie l'ordre complet des identifiants au serveur
  // (planReorder réattribue les positions une par une).
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= affichees.length) return;
    if (pending) return;
    const ids = affichees.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setReorderError(null);
    setPending(true);
    // Appliqué AVANT l'aller-retour : c'est ce qui rend le clic suivant juste,
    // même si le rafraîchissement ne revient jamais.
    setOrdreLocal({ depuis: cleServeur, vers: ids });
    void (async () => {
      try {
        const fd = new FormData();
        fd.set("hunt_id", huntId);
        fd.set("order", JSON.stringify(ids));
        const result = await reorderHuntSteps(null, fd);
        if (!result.ok) {
          // Refus serveur : revenir à la vérité serveur, sinon on afficherait
          // un ordre qui n'existe nulle part.
          setOrdreLocal(null);
          setReorderError(result.error);
          return;
        }
        router.refresh();
      } catch {
        // Réseau coupé : le dire, plutôt que de laisser les flèches inertes.
        setOrdreLocal(null);
        setReorderError("Réorganisation impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <Card>
      <h2 className="font-semibold mb-1">Étapes</h2>
      <p className="text-sm text-zinc-500 mb-4">
        De {MIN_STEPS} à {MAX_STEPS} étapes. Chaque étape a son propre QR code à
        imprimer et poser sur place. L&apos;indice s&apos;affiche au joueur une
        fois l&apos;étape tamponnée — pour l&apos;orienter vers la suivante.
      </p>

      {affichees.length === 0 ? (
        <p className="mb-4 text-sm text-zinc-500">
          Aucune étape pour l&apos;instant — ajoutez la première ci-dessous.
        </p>
      ) : (
        <ol className="mb-4 space-y-2.5">
          {affichees.map((step, index) => (
            <HuntStepRow
              key={step.id}
              step={step}
              index={index}
              count={affichees.length}
              reorderPending={pending}
              onMove={move}
            />
          ))}
        </ol>
      )}

      {reorderError && (
        <p role="alert" className="mb-3 text-sm font-semibold text-red-600">
          {reorderError}
        </p>
      )}
      {full && (
        <p className="mb-4 text-xs text-zinc-500">
          Chasse pleine ({MAX_STEPS} étapes). Pour réorganiser une chasse
          pleine, retirez une étape, réordonnez, puis rajoutez-la.
        </p>
      )}

      {!full && <AddStepForm huntId={huntId} />}
    </Card>
  );
}

function HuntStepRow({
  step,
  index,
  count,
  reorderPending,
  onMove,
}: {
  step: HuntStep;
  index: number;
  count: number;
  reorderPending: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const {
    state: updateState,
    pending: updatePending,
    onSubmit: updateSubmit,
  } = useActionForm(updateHuntStep, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const {
    state: deleteState,
    pending: deletePending,
    onSubmit: deleteSubmit,
  } = useActionForm(deleteHuntStep, {
    networkError: "Suppression impossible, réessayez.",
  });

  return (
    <li className="rounded-xl border-2 border-k-ink/15 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 pt-1">
          <span className="text-xs font-black tabular-nums text-zinc-400">
            {step.position}
          </span>
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0 || reorderPending}
            aria-label={`Monter l'étape ${step.position}`}
            className="rounded-md border border-zinc-200 px-1.5 text-k-ink hover:bg-zinc-50 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === count - 1 || reorderPending}
            aria-label={`Descendre l'étape ${step.position}`}
            className="rounded-md border border-zinc-200 px-1.5 text-k-ink hover:bg-zinc-50 disabled:opacity-30"
          >
            ↓
          </button>
        </div>

        <form onSubmit={updateSubmit} className="min-w-0 flex-1 space-y-2">
          <input type="hidden" name="id" value={step.id} />
          <div>
            <Label htmlFor={`step-label-${step.id}`}>Libellé de l&apos;étape</Label>
            <Input
              id={`step-label-${step.id}`}
              name="label"
              defaultValue={step.label}
              required
              maxLength={60}
              placeholder="Ex : Le comptoir"
            />
          </div>
          <div>
            <Label htmlFor={`step-hint-${step.id}`}>
              Indice vers l&apos;étape suivante (optionnel)
            </Label>
            <Input
              id={`step-hint-${step.id}`}
              name="hint"
              defaultValue={step.hint_text ?? ""}
              maxLength={200}
              placeholder="Ex : Cherche près de la vitrine…"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary" disabled={updatePending}>
              {updatePending ? "…" : "Enregistrer"}
            </Button>
            {updateState?.ok && (
              <span className="text-sm font-medium text-emerald-600">✓</span>
            )}
          </div>
          <FieldError
            message={updateState && !updateState.ok ? updateState.error : undefined}
          />
        </form>

        <form
          onSubmit={(event) => {
            // Confirmer d'abord ; le hook n'est saisi que sur oui.
            if (!confirm(`Supprimer l'étape « ${step.label} » ?`)) {
              event.preventDefault();
              return;
            }
            deleteSubmit(event);
          }}
        >
          <input type="hidden" name="id" value={step.id} />
          {/* La case n'apparaît qu'APRÈS le refus de l'action, qui NOMME le
              nombre de joueurs en cours. Avant ce refus, le commerçant ne
              saurait pas ce qu'il confirme ; l'autre refus de cette action
              (« une chasse active garde 2 étapes ») ne se coche pas. */}
          {deleteState &&
            !deleteState.ok &&
            deleteState.error.includes(HUNT_STEP_LOSS_HINT) && (
              <label className="mb-1 flex max-w-56 items-start gap-1.5 text-xs font-semibold text-red-700">
                <input
                  type="checkbox"
                  name="confirm_players"
                  value="1"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                Je comprends que les chasses en cours seront raccourcies.
              </label>
            )}
          <Button
            type="submit"
            variant="ghost"
            disabled={deletePending}
            aria-label={`Supprimer l'étape ${step.position}`}
          >
            ✕
          </Button>
        </form>
      </div>
      <FieldError
        message={deleteState && !deleteState.ok ? deleteState.error : undefined}
      />
    </li>
  );
}

function AddStepForm({ huntId }: { huntId: string }) {
  // `resetOnSuccess` : les deux champs sont non contrôlés et SANS defaultValue —
  // c'est ce vidage qui permet d'enchaîner l'étape suivante. Il ne vide plus
  // qu'en cas de succès : une erreur de validation ne perd plus la saisie.
  // `reloadOnSuccess` : les champs se vident, et c'est le seul signal reçu. Ni
  // la liste, ni le compteur d'étapes, ni l'affiche QR n'ont d'état local, et
  // ce formulaire — seul des trois du fichier — n'a pas d'accusé de succès.
  // Le commerçant retape, et une SECONDE étape est insérée avec son propre
  // jeton. Sur une chasse en cours, plus personne ne peut la terminer : la RPC
  // de scan compte les étapes en base, donc une étape dont le QR n'a jamais été
  // imprimé relève le seuil de complétion hors d'atteinte.
  const { state, pending, onSubmit } = useActionForm(createHuntStep, {
    resetOnSuccess: true,
    reloadOnSuccess: true,
    networkError: "Ajout impossible, réessayez.",
  });

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border-2 border-dashed border-k-ink/20 p-3"
    >
      <input type="hidden" name="hunt_id" value={huntId} />
      <p className="mb-2 text-sm font-bold text-k-ink">Ajouter une étape</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="new-step-label">Libellé</Label>
          <Input
            id="new-step-label"
            name="label"
            required
            maxLength={60}
            placeholder="Ex : La caisse"
          />
        </div>
        <div>
          <Label htmlFor="new-step-hint">Indice (optionnel)</Label>
          <Input
            id="new-step-hint"
            name="hint"
            maxLength={200}
            placeholder="Ex : Là où l'on paie…"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "+ Ajouter l'étape"}
        </Button>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Statut (activer / archiver) + suppression
// ────────────────────────────────────────────────────────────

export function HuntStatusControls({ hunt, stepCount }: { hunt: Hunt; stepCount: number }) {
  const {
    state: statusState,
    pending: statusPending,
    onSubmit: statusSubmit,
  } = useActionForm(setHuntStatus, {
    // `reloadOnSuccess` : le badge d'état et la carte « Page publique »
    // suivent la prop serveur, donc le rafraîchissement — mesuré défaillant
    // (docs/bugs.md). Le geste est idempotent, mais l'écran affirmerait le
    // CONTRAIRE de l'état réel d'une page ouverte aux clients.
    reloadOnSuccess: true,
    networkError: "Changement de statut impossible, réessayez.",
  });
  // `deleteHunt` reste sur `useActionState` : elle se termine par un `redirect()`
  // dont le NEXT_REDIRECT serait pris pour une panne par le catch du hook.
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteHunt,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Mêmes garde-fous que le serveur : au moins 2 étapes et un lot renseigné.
  const missing: string[] = [];
  if (stepCount < MIN_STEPS) missing.push(`au moins ${MIN_STEPS} étapes`);
  if (!hunt.reward_label.trim()) missing.push("un lot final");
  const canActivate = missing.length === 0;

  return (
    <Card>
      <h2 className="font-semibold mb-4">Statut de la chasse</h2>

      <div className="flex flex-wrap items-center gap-3">
        {hunt.status !== "active" ? (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={hunt.id} />
            <input type="hidden" name="status" value="active" />
            <Button type="submit" disabled={statusPending || !canActivate}>
              {statusPending ? "…" : "Activer la chasse"}
            </Button>
          </form>
        ) : (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={hunt.id} />
            <input type="hidden" name="status" value="archived" />
            <Button type="submit" variant="secondary" disabled={statusPending}>
              {statusPending ? "…" : "Archiver"}
            </Button>
          </form>
        )}

        {hunt.status === "active" && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            En ligne — les QR codes sont actifs
          </span>
        )}
      </div>

      {hunt.status !== "active" && !canActivate && (
        <p className="mt-3 text-sm text-amber-700">
          Pour activer, il vous faut encore : {missing.join(" et ")}.
        </p>
      )}
      <FieldError
        message={statusState && !statusState.ok ? statusState.error : undefined}
      />

      <div className="mt-5 border-t border-zinc-100 pt-4">
        {confirmDelete ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={hunt.id} />
            <span className="text-sm text-k-body">
              Supprimer cette chasse, ses étapes et toute la progression ?
            </span>
            {/* La case n'apparaît qu'APRÈS le refus qui NOMME le nombre de
                codes CHASSE- encore à retirer. La phrase ci-dessus énumère ce
                que le commerçant accepte de perdre ; elle ne parlait pas de ce
                qui lui coûte un client. */}
            {deleteState &&
              !deleteState.ok &&
              deleteState.error.includes(HUNT_DELETE_LOSS_HINT) && (
                <label className="flex w-full max-w-md items-start gap-1.5 text-xs font-semibold text-red-700">
                  <input
                    type="checkbox"
                    name="confirm_outstanding"
                    value="1"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  Je comprends que les codes non retirés deviendront
                  introuvables en caisse.
                </label>
              )}
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
            Supprimer la chasse
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </Card>
  );
}
