"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
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
import { FieldError, Input, Label } from "@/components/ui/input";
import type { Hunt, HuntStep } from "@/types/database";

/** Nombre d'étapes autorisé (miroir des bornes SQL / validations). */
const MIN_STEPS = 2;
const MAX_STEPS = 10;

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

/** ISO → valeur datetime-local dans le fuseau du navigateur. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur datetime-local (fuseau navigateur) → ISO UTC pour le serveur. */
function localInputToIso(local: string): string {
  if (!local) return "";
  const time = Date.parse(local);
  return Number.isNaN(time) ? local : new Date(time).toISOString();
}

// ────────────────────────────────────────────────────────────
// Réglages de la chasse
// ────────────────────────────────────────────────────────────

export function HuntSettings({ hunt }: { hunt: Hunt }) {
  const [state, formAction, pending] = useActionState(updateHunt, null);
  // Dates converties dans le fuseau du navigateur APRÈS montage (le serveur,
  // souvent en UTC, rendrait d'autres valeurs → écart d'hydratation).
  const [dates, setDates] = useState({ starts: "", ends: "" });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- conversion unique post-montage dans le fuseau du navigateur, évite tout écart d'hydratation SSR/CSR.
    setDates({
      starts: isoToLocalInput(hunt.starts_at),
      ends: isoToLocalInput(hunt.ends_at),
    });
  }, [hunt.starts_at, hunt.ends_at]);

  // Les datetime-local sont convertis en ISO (UTC) avant l'envoi.
  function submit(formData: FormData) {
    formData.set("starts_at", localInputToIso(String(formData.get("starts_at") ?? "")));
    formData.set("ends_at", localInputToIso(String(formData.get("ends_at") ?? "")));
    formAction(formData);
  }

  return (
    <Card>
      <h2 className="font-semibold mb-1">Réglages</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Nom, ordre des étapes, fenêtre de jeu et lot final remis en caisse.
      </p>

      <form action={submit} className="space-y-6">
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
            indisponibles pour les joueurs.
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
  const [pending, startTransition] = useTransition();
  const full = steps.length >= MAX_STEPS;

  // Réordonnancement : on envoie l'ordre complet des identifiants au serveur
  // (planReorder réattribue les positions une par une). Pas d'optimisme : le
  // rafraîchissement re-trie par position dès le succès.
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const ids = steps.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setReorderError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("hunt_id", huntId);
      fd.set("order", JSON.stringify(ids));
      const result = await reorderHuntSteps(null, fd);
      if (!result.ok) {
        setReorderError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <h2 className="font-semibold mb-1">Étapes</h2>
      <p className="text-sm text-zinc-500 mb-4">
        De {MIN_STEPS} à {MAX_STEPS} étapes. Chaque étape a son propre QR code à
        imprimer et poser sur place. L&apos;indice s&apos;affiche au joueur une
        fois l&apos;étape tamponnée — pour l&apos;orienter vers la suivante.
      </p>

      {steps.length === 0 ? (
        <p className="mb-4 text-sm text-zinc-500">
          Aucune étape pour l&apos;instant — ajoutez la première ci-dessous.
        </p>
      ) : (
        <ol className="mb-4 space-y-2.5">
          {steps.map((step, index) => (
            <HuntStepRow
              key={step.id}
              step={step}
              index={index}
              count={steps.length}
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
  const [updateState, updateAction, updatePending] = useActionState(
    updateHuntStep,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteHuntStep,
    null,
  );

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

        <form action={updateAction} className="min-w-0 flex-1 space-y-2">
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
          action={deleteAction}
          onSubmit={(event) => {
            if (!confirm(`Supprimer l'étape « ${step.label} » ?`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={step.id} />
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
  const [state, formAction, pending] = useActionState(createHuntStep, null);

  return (
    <form
      action={formAction}
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
  const [statusState, statusAction, statusPending] = useActionState(
    setHuntStatus,
    null,
  );
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
          <form action={statusAction}>
            <input type="hidden" name="id" value={hunt.id} />
            <input type="hidden" name="status" value="active" />
            <Button type="submit" disabled={statusPending || !canActivate}>
              {statusPending ? "…" : "Activer la chasse"}
            </Button>
          </form>
        ) : (
          <form action={statusAction}>
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
