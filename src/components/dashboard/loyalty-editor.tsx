"use client";

import { useActionState, useState } from "react";
import {
  createLoyaltyMilestone,
  deleteLoyaltyMilestone,
  deleteLoyaltyProgram,
  setLoyaltyProgramStatus,
  updateLoyaltyMilestone,
  updateLoyaltyProgram,
} from "@/actions/loyalty";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import type {
  LoyaltyMilestone,
  LoyaltyProgram,
  LoyaltyRewardType,
  LoyaltyValidationMode,
} from "@/types/database";
import {
  clampLoyaltyPeriod,
  formatDurationLabel,
  loyaltyPeriodOptions,
  resolveLoyaltyCooldown,
} from "./loyalty-settings-presets";

/** Roue de l'organisation, pour cibler un tour offert. */
export interface WheelOption {
  id: string;
  name: string;
}

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

// ────────────────────────────────────────────────────────────
// Réglages du programme
// ────────────────────────────────────────────────────────────

export function LoyaltySettings({ program }: { program: LoyaltyProgram }) {
  const [state, formAction, pending] = useActionState(updateLoyaltyProgram, null);

  // Mode, rotation et fréquence sont liés : en « Code au comptoir » la base
  // impose un intervalle d'au moins max(rotation, 5 min). On garde donc ces
  // trois champs contrôlés pour n'offrir que des combinaisons acceptées, et
  // corriger d'office une valeur devenue invalide au changement de mode.
  const [mode, setMode] = useState<LoyaltyValidationMode>(program.validation_mode);
  // Un programme enregistré avant le durcissement des bornes peut porter une
  // rotation hors 15..300 s : on la ramène dans la plage proposée.
  const [periodSeconds, setPeriodSeconds] = useState(() =>
    clampLoyaltyPeriod(program.rotating_period_seconds),
  );
  const [cooldownSeconds, setCooldownSeconds] = useState(
    program.min_stamp_interval_seconds,
  );

  const periodOptions = loyaltyPeriodOptions(periodSeconds);
  const cooldown = resolveLoyaltyCooldown({ mode, periodSeconds, cooldownSeconds });

  return (
    <Card>
      <h2 className="font-semibold mb-1">Réglages</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Nom, façon de valider une visite, niveaux et fréquence des visites.
      </p>

      <form action={formAction} className="space-y-6">
        <input type="hidden" name="id" value={program.id} />

        <div className="max-w-sm">
          <Label htmlFor="loyalty-name">Nom du programme</Label>
          <Input
            id="loyalty-name"
            name="name"
            defaultValue={program.name}
            required
            maxLength={80}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-k-ink mb-1">
            Comment valider une visite ?
          </legend>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="radio"
              name="validation_mode"
              value="rotating_code"
              checked={mode === "rotating_code"}
              onChange={() => setMode("rotating_code")}
              className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
            />
            <span>
              <span className="font-bold text-k-ink">Code au comptoir</span>
              <span className="block text-xs text-zinc-500">
                Un code à 6 chiffres s&apos;affiche sur un écran au comptoir et
                change régulièrement. Le client le saisit sur son passeport.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="radio"
              name="validation_mode"
              value="staff"
              checked={mode === "staff"}
              onChange={() => setMode("staff")}
              className="mt-0.5 h-4 w-4 shrink-0 accent-k-ink"
            />
            <span>
              <span className="font-bold text-k-ink">Validation en caisse</span>
              <span className="block text-xs text-zinc-500">
                Le client présente le QR de son passeport ; vous le scannez en
                caisse pour valider la visite.
              </span>
            </span>
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">Niveaux</legend>
          <p className="text-xs text-zinc-500">
            Le passeport passe bronze → argent → or selon le nombre de visites.
          </p>
          <div className="flex flex-wrap gap-4">
            <div>
              <Label htmlFor="loyalty-silver">Seuil argent 🥈 (visites)</Label>
              <Input
                id="loyalty-silver"
                name="silver_threshold"
                type="number"
                min={1}
                max={1000}
                defaultValue={program.silver_threshold}
                className="w-40"
                required
              />
            </div>
            <div>
              <Label htmlFor="loyalty-gold">Seuil or 🥇 (visites)</Label>
              <Input
                id="loyalty-gold"
                name="gold_threshold"
                type="number"
                min={2}
                max={1000}
                defaultValue={program.gold_threshold}
                className="w-40"
                required
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Le seuil or doit être supérieur au seuil argent.
          </p>
        </fieldset>

        <div>
          <Label htmlFor="loyalty-period">Rotation du code au comptoir</Label>
          <select
            id="loyalty-period"
            name="rotating_period_seconds"
            value={periodSeconds}
            onChange={(e) => setPeriodSeconds(Number(e.target.value))}
            className={`${selectClass} max-w-sm`}
          >
            {periodOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-500">
            Utilisé uniquement en mode « Code au comptoir » : plus la rotation
            est courte, plus il est difficile de tricher à distance (5 minutes
            au maximum).
          </p>
        </div>

        <div>
          <Label htmlFor="loyalty-cooldown">Fréquence des visites</Label>
          <select
            id="loyalty-cooldown"
            name="min_stamp_interval_seconds"
            value={cooldown.value}
            onChange={(e) => setCooldownSeconds(Number(e.target.value))}
            aria-describedby="loyalty-cooldown-help"
            className={`${selectClass} max-w-sm`}
          >
            {cooldown.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div id="loyalty-cooldown-help" className="mt-1.5 space-y-1">
            <p className="text-xs text-zinc-500">
              Anti-abus : empêche de compter plusieurs visites trop rapprochées
              depuis un même passeport.
            </p>
            {cooldown.floorSeconds > 0 && (
              <p className="text-xs text-zinc-500">
                {mode === "rotating_code" ? (
                  <>
                    Le mode « Code au comptoir » impose au moins{" "}
                    {formatDurationLabel(cooldown.floorSeconds)} entre deux
                    visites (le double de la rotation, 5 min minimum) : un code
                    reste valable le temps de deux rotations, sans ce délai il
                    vaudrait deux tampons.
                  </>
                ) : (
                  <>
                    Le mode « Validation en caisse » impose au moins{" "}
                    {formatDurationLabel(cooldown.floorSeconds)} entre deux
                    visites : le QR présenté reste scannable quelques minutes,
                    sans ce délai il vaudrait plusieurs tampons.
                  </>
                )}
              </p>
            )}
            {cooldown.adjusted && (
              <p role="status" className="text-xs font-semibold text-amber-700">
                Réglage ajusté sur {formatDurationLabel(cooldown.value)} pour
                rester compatible avec le mode choisi.
              </p>
            )}
          </div>
        </div>

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
// Paliers
// ────────────────────────────────────────────────────────────

export function LoyaltyMilestonesEditor({
  programId,
  milestones,
  wheels,
}: {
  programId: string;
  milestones: LoyaltyMilestone[];
  wheels: WheelOption[];
}) {
  const ordered = [...milestones].sort((a, b) => a.visit_count - b.visit_count);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Paliers</h2>
      <p className="text-sm text-zinc-500 mb-4">
        À un nombre de visites donné, le client débloque un lot (retiré en
        caisse avec un code) ou un tour de roue offert. Il faut au moins un
        palier pour activer le programme.
      </p>

      {ordered.length === 0 ? (
        <p className="mb-4 text-sm text-zinc-500">
          Aucun palier pour l&apos;instant — ajoutez le premier ci-dessous.
        </p>
      ) : (
        <ul className="mb-4 space-y-2.5">
          {ordered.map((m) => (
            <MilestoneRow key={m.id} milestone={m} wheels={wheels} />
          ))}
        </ul>
      )}

      <AddMilestoneForm programId={programId} wheels={wheels} />
    </Card>
  );
}

/** Champs de récompense (lot ou spin) partagés entre édition et ajout. */
function RewardFields({
  idPrefix,
  defaultType,
  defaultLabel = "",
  defaultDetails = "",
  defaultStock = null,
  defaultWheelId = null,
  wheels,
}: {
  idPrefix: string;
  defaultType: LoyaltyRewardType;
  defaultLabel?: string;
  defaultDetails?: string;
  defaultStock?: number | null;
  defaultWheelId?: string | null;
  wheels: WheelOption[];
}) {
  const [type, setType] = useState<LoyaltyRewardType>(defaultType);
  // Roue ciblée supprimée : le select ne la contient plus, on le signale.
  const missingWheel =
    defaultType === "spin" &&
    defaultWheelId !== null &&
    !wheels.some((w) => w.id === defaultWheelId);

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
          Type de récompense
        </legend>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="reward_type"
            value="lot"
            checked={type === "lot"}
            onChange={() => setType("lot")}
            className="h-4 w-4 accent-k-ink"
          />
          🎁 Lot
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="reward_type"
            value="spin"
            checked={type === "spin"}
            onChange={() => setType("spin")}
            className="h-4 w-4 accent-k-ink"
          />
          🎡 Tour de roue offert
        </label>
      </fieldset>

      {type === "lot" ? (
        <div className="space-y-2">
          <div>
            <Label htmlFor={`${idPrefix}-label`}>Lot</Label>
            <Input
              id={`${idPrefix}-label`}
              name="reward_label"
              defaultValue={defaultLabel}
              maxLength={120}
              placeholder="Ex : Un café offert"
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-details`}>Détails (optionnel)</Label>
            <textarea
              id={`${idPrefix}-details`}
              name="reward_details"
              defaultValue={defaultDetails}
              maxLength={2000}
              rows={2}
              placeholder="Conditions, validité, modalités de retrait…"
              className={textareaClass}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-stock`}>Stock (optionnel)</Label>
            <Input
              id={`${idPrefix}-stock`}
              name="reward_stock"
              type="number"
              min={0}
              max={1000000}
              defaultValue={defaultStock ?? ""}
              placeholder="Illimité"
              className="w-40"
            />
          </div>
        </div>
      ) : (
        <div>
          <Label htmlFor={`${idPrefix}-wheel`}>Roue du tour offert</Label>
          {wheels.length === 0 ? (
            <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              Aucune roue disponible — créez d&apos;abord une roue dans vos
              campagnes.
            </p>
          ) : (
            <select
              id={`${idPrefix}-wheel`}
              name="target_wheel_id"
              defaultValue={missingWheel ? "" : defaultWheelId ?? ""}
              className={`${selectClass} max-w-sm`}
            >
              <option value="">— Choisir une roue —</option>
              {wheels.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          {missingWheel && (
            <p className="mt-1.5 text-xs font-semibold text-amber-700">
              La roue ciblée a été supprimée — choisissez-en une autre.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MilestoneRow({
  milestone,
  wheels,
}: {
  milestone: LoyaltyMilestone;
  wheels: WheelOption[];
}) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateLoyaltyMilestone,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteLoyaltyMilestone,
    null,
  );

  return (
    <li className="rounded-xl border-2 border-k-ink/15 bg-white p-3">
      <div className="flex items-start gap-3">
        <form action={updateAction} className="min-w-0 flex-1 space-y-3">
          <input type="hidden" name="id" value={milestone.id} />
          <div>
            <Label htmlFor={`ms-visits-${milestone.id}`}>
              Se déclenche à (visites)
            </Label>
            <Input
              id={`ms-visits-${milestone.id}`}
              name="visit_count"
              type="number"
              min={1}
              max={1000}
              defaultValue={milestone.visit_count}
              required
              className="w-40"
            />
          </div>

          <RewardFields
            idPrefix={`ms-${milestone.id}`}
            defaultType={milestone.reward_type}
            defaultLabel={milestone.reward_label}
            defaultDetails={milestone.reward_details ?? ""}
            defaultStock={milestone.reward_stock}
            defaultWheelId={milestone.target_wheel_id}
            wheels={wheels}
          />

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
            if (!confirm("Supprimer ce palier ?")) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={milestone.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={deletePending}
            aria-label={`Supprimer le palier à ${milestone.visit_count} visites`}
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

function AddMilestoneForm({
  programId,
  wheels,
}: {
  programId: string;
  wheels: WheelOption[];
}) {
  const [state, formAction, pending] = useActionState(createLoyaltyMilestone, null);

  return (
    <form
      action={formAction}
      className="rounded-xl border-2 border-dashed border-k-ink/20 p-3 space-y-3"
    >
      <input type="hidden" name="program_id" value={programId} />
      <p className="text-sm font-bold text-k-ink">Ajouter un palier</p>
      <div>
        <Label htmlFor="new-ms-visits">Se déclenche à (visites)</Label>
        <Input
          id="new-ms-visits"
          name="visit_count"
          type="number"
          min={1}
          max={1000}
          required
          placeholder="Ex : 10"
          className="w-40"
        />
      </div>
      <RewardFields idPrefix="new-ms" defaultType="lot" wheels={wheels} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "+ Ajouter le palier"}
        </Button>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Statut (activer / archiver) + suppression
// ────────────────────────────────────────────────────────────

export function LoyaltyStatusControls({
  program,
  milestoneCount,
}: {
  program: LoyaltyProgram;
  milestoneCount: number;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    setLoyaltyProgramStatus,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteLoyaltyProgram,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Même garde-fou que le serveur : au moins un palier pour activer.
  const canActivate = milestoneCount >= 1;

  return (
    <Card>
      <h2 className="font-semibold mb-4">Statut du programme</h2>

      <div className="flex flex-wrap items-center gap-3">
        {program.status !== "active" ? (
          <form action={statusAction}>
            <input type="hidden" name="id" value={program.id} />
            <input type="hidden" name="status" value="active" />
            <Button type="submit" disabled={statusPending || !canActivate}>
              {statusPending ? "…" : "Activer le programme"}
            </Button>
          </form>
        ) : (
          <form action={statusAction}>
            <input type="hidden" name="id" value={program.id} />
            <input type="hidden" name="status" value="archived" />
            <Button type="submit" variant="secondary" disabled={statusPending}>
              {statusPending ? "…" : "Archiver"}
            </Button>
          </form>
        )}

        {program.status === "active" && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            En ligne — le passeport est accessible aux clients
          </span>
        )}
      </div>

      {program.status !== "active" && !canActivate && (
        <p className="mt-3 text-sm text-amber-700">
          Pour activer, ajoutez au moins un palier.
        </p>
      )}
      <FieldError
        message={statusState && !statusState.ok ? statusState.error : undefined}
      />

      <div className="mt-5 border-t border-zinc-100 pt-4">
        {confirmDelete ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={program.id} />
            <span className="text-sm text-k-body">
              Supprimer ce programme, ses paliers et tous les passeports ?
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
            Supprimer le programme
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </Card>
  );
}
