"use client";

import { useState } from "react";
import { addPrize, deletePrize, updatePrize } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import type { Prize } from "@/types/database";

// useActionForm et non useActionState : l'état de chargement doit retomber même
// quand le rendu ne rejoue pas la revalidation — docs/bugs.md.

export function PrizeEditor({
  wheelId,
  prizes,
  totalWeight,
}: {
  wheelId: string;
  prizes: Prize[];
  totalWeight: number;
}) {
  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">Lots ({prizes.length})</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Le poids détermine la probabilité relative de chaque lot.
          </p>
        </div>
        <span className="shrink-0 text-sm font-mono text-zinc-500">
          Poids total : {totalWeight}
        </span>
      </Card>

      {prizes.map((prize) => (
        <PrizeRow key={prize.id} prize={prize} totalWeight={totalWeight} />
      ))}

      <AddPrizeForm wheelId={wheelId} />
    </div>
  );
}

function PrizeRow({
  prize,
  totalWeight,
}: {
  prize: Prize;
  totalWeight: number;
}) {
  // PAS de `resetOnSuccess` ici : form.reset() rétablirait les `defaultValue`
  // du rendu COURANT — donc les valeurs d'AVANT l'édition — bien avant que
  // router.refresh() n'ait livré celles du serveur. Contrepartie assumée : les
  // valeurs normalisées (coût et valeur reformatés, stock vidé) ne se
  // réaffichent plus qu'au prochain rendu serveur.
  const {
    state: updateState,
    pending: updatePending,
    onSubmit: updateSubmit,
  } = useActionForm(updatePrize, {
    networkError: "Mise à jour impossible, réessayez.",
  });
  // L'état de la suppression reste ignoré, comme avant la migration : une
  // erreur de suppression n'a jamais eu d'emplacement d'affichage sur la ligne.
  const { pending: deletePending, onSubmit: deleteSubmit } = useActionForm(
    deletePrize,
    { networkError: "Suppression impossible, réessayez." },
  );
  // Le bouton « Supprimer » reste à sa place dans la mise en page du
  // formulaire de mise à jour, mais appartient au formulaire frère ci-dessous
  // via son attribut `form` : `formAction` n'a pas d'équivalent avec `onSubmit`,
  // et le HTML interdit d'imbriquer deux formulaires.
  const deleteFormId = `delete-prize-${prize.id}`;
  // Le seuil d'alerte n'a de sens qu'avec un stock fini : le champ suit
  // la saisie du stock (masqué et non envoyé quand le stock est illimité).
  const [hasStock, setHasStock] = useState(prize.stock !== null);
  const lowStock =
    prize.stock !== null &&
    prize.low_stock_threshold !== null &&
    prize.stock <= prize.low_stock_threshold;

  // Tirable au sens du MOTEUR (`perform_atomic_spin`) : un lot gagnant à
  // stock zéro en est exclu, et afficher sa part d'antan est un mensonge sur
  // lequel le commerçant recalibre ses poids.
  const tirable = prize.is_losing || prize.stock === null || prize.stock > 0;
  const pct =
    totalWeight > 0 && prize.is_active && tirable
      ? Math.round((prize.weight / totalWeight) * 100)
      : 0;

  return (
    <Card>
      <form onSubmit={updateSubmit} className="space-y-3">
        <input type="hidden" name="id" value={prize.id} />
        <div className="flex items-center gap-3">
          <input
            type="color"
            name="color"
            defaultValue={prize.color}
            aria-label="Couleur du segment"
            className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
          />
          <Input
            name="label"
            defaultValue={prize.label}
            required
            maxLength={80}
            className="font-semibold"
          />
          {lowStock && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
              Stock faible
            </span>
          )}
          <span className="shrink-0 text-xs font-mono text-zinc-400 w-12 text-right">
            {prize.is_active && !tirable ? "épuisé" : `~${pct}%`}
          </span>
        </div>

        <Input
          name="description"
          defaultValue={prize.description}
          maxLength={300}
          placeholder="Description affichée au gagnant…"
        />

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor={`weight-${prize.id}`}>Poids</Label>
            <Input
              id={`weight-${prize.id}`}
              name="weight"
              type="number"
              min={0}
              max={10000}
              defaultValue={prize.weight}
              required
              className="w-24"
            />
          </div>
          <div>
            <Label htmlFor={`stock-${prize.id}`}>Stock (vide = illimité)</Label>
            <Input
              id={`stock-${prize.id}`}
              name="stock"
              type="number"
              min={0}
              defaultValue={prize.stock ?? ""}
              onChange={(e) => setHasStock(e.target.value.trim() !== "")}
              className="w-32"
            />
          </div>
          {hasStock && (
            <div className="max-w-40">
              <Label htmlFor={`low-stock-${prize.id}`}>
                Seuil d&apos;alerte stock
              </Label>
              <Input
                id={`low-stock-${prize.id}`}
                name="low_stock_threshold"
                type="number"
                min={0}
                defaultValue={prize.low_stock_threshold ?? ""}
                placeholder="Vide = pas d'alerte"
                aria-describedby={`low-stock-help-${prize.id}`}
                className="w-40"
              />
              <p
                id={`low-stock-help-${prize.id}`}
                className="mt-1 text-[11px] leading-snug text-zinc-500"
              >
                Vous recevrez un email quand le stock passe sous ce seuil.
              </p>
            </div>
          )}
          <div>
            <Label htmlFor={`cost-${prize.id}`}>Coût réel (€)</Label>
            <Input
              id={`cost-${prize.id}`}
              name="cost"
              inputMode="decimal"
              placeholder="Ex : 1,50"
              defaultValue={
                prize.cost_cents !== null ? (prize.cost_cents / 100).toString().replace(".", ",") : ""
              }
              className="w-28"
              title="Coût du lot pour vous — alimente le ROI"
            />
          </div>
          <div>
            <Label htmlFor={`value-${prize.id}`}>Valeur affichée (€)</Label>
            <Input
              id={`value-${prize.id}`}
              name="value"
              inputMode="decimal"
              placeholder="Ex : 3,00"
              defaultValue={
                prize.value_cents !== null ? (prize.value_cents / 100).toString().replace(".", ",") : ""
              }
              className="w-28"
              title="Valeur commerciale du lot"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 pb-2.5">
            <input
              type="checkbox"
              name="is_losing"
              defaultChecked={prize.is_losing}
              className="h-4 w-4 rounded accent-orange-600"
            />
            Segment perdant
          </label>
          <div className="ml-auto flex gap-2">
            <Button type="submit" variant="secondary" disabled={updatePending}>
              {updatePending ? "…" : "Enregistrer"}
            </Button>
            <Button
              type="submit"
              variant="danger"
              form={deleteFormId}
              disabled={deletePending}
            >
              {deletePending ? "…" : "Supprimer"}
            </Button>
          </div>
        </div>
        <FieldError
          message={updateState && !updateState.ok ? updateState.error : undefined}
        />
      </form>

      {/* Formulaire frère, sans rendu propre : il ne porte que l'identifiant du
          lot à supprimer, que le bouton ci-dessus lui adresse par `form=`. */}
      <form
        id={deleteFormId}
        onSubmit={(event) => {
          // Confirmer d'abord ; le hook n'est saisi que sur oui.
          if (!confirm(`Supprimer le lot « ${prize.label} » ?`)) {
            event.preventDefault();
            return;
          }
          deleteSubmit(event);
        }}
      >
        <input type="hidden" name="id" value={prize.id} />
      </form>
    </Card>
  );
}

function AddPrizeForm({ wheelId }: { wheelId: string }) {
  // Les champs sont non contrôlés : `resetOnSuccess` reproduit le vidage
  // automatique que React appliquait après une soumission via `action=`. Sans
  // lui, le libellé du lot précédent resterait en place et inviterait au
  // doublon ; form.reset() restitue aussi le poids 10 et la couleur par défaut.
  // `reloadOnSuccess` : ici le rafraîchissement est le SEUL moyen de voir le
  // lot ajouté — ni la liste, ni « Lots (N) », ni le poids total, ni l'aperçu
  // de roue n'ont d'état local, et ce formulaire n'a pas de message de succès.
  // Le commerçant qui ne voit rien retape et re-clique : le segment est
  // DUPLIQUÉ, son poids compte deux fois dans le tirage, et `revalidatePlaySlugs`
  // purge l'ISR de /play dans la foulée — le doublon part aux joueurs pendant
  // qu'il reste caché au seul homme qui pourrait le supprimer.
  const { state, pending, onSubmit } = useActionForm(addPrize, {
    resetOnSuccess: true,
    reloadOnSuccess: true,
    networkError: "Ajout impossible, réessayez.",
  });

  return (
    <Card className="border-dashed">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="wheel_id" value={wheelId} />
        <input type="hidden" name="description" value="" />
        <div>
          <Label htmlFor="new-label">Nouveau lot</Label>
          <Input
            id="new-label"
            name="label"
            required
            maxLength={80}
            placeholder="Ex : Boisson offerte"
            className="w-48"
          />
        </div>
        <div>
          <Label htmlFor="new-weight">Poids</Label>
          <Input
            id="new-weight"
            name="weight"
            type="number"
            min={0}
            max={10000}
            defaultValue={10}
            required
            className="w-24"
          />
        </div>
        <div>
          <Label htmlFor="new-color">Couleur</Label>
          <input
            id="new-color"
            type="color"
            name="color"
            defaultValue="#f5793b"
            list="kermesse-palette"
            className="h-10 w-14 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
          />
          {/* Palette suggérée : les couleurs bonbon de la DA du site */}
          <datalist id="kermesse-palette">
            <option value="#f5793b" />
            <option value="#fcca59" />
            <option value="#f296bd" />
            <option value="#99b7f5" />
            <option value="#267f53" />
            <option value="#fdf6e3" />
            <option value="#8b5cf6" />
            <option value="#ef4444" />
          </datalist>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "+ Ajouter"}
        </Button>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}
