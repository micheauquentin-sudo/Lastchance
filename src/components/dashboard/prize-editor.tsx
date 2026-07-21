"use client";

import { useActionState, useState } from "react";
import { addPrize, deletePrize, updatePrize } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { Prize } from "@/types/database";

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
  const [updateState, updateAction, updatePending] = useActionState(
    updatePrize,
    null,
  );
  const [, deleteAction, deletePending] = useActionState(deletePrize, null);
  // Le seuil d'alerte n'a de sens qu'avec un stock fini : le champ suit
  // la saisie du stock (masqué et non envoyé quand le stock est illimité).
  const [hasStock, setHasStock] = useState(prize.stock !== null);
  const lowStock =
    prize.stock !== null &&
    prize.low_stock_threshold !== null &&
    prize.stock <= prize.low_stock_threshold;

  const pct =
    totalWeight > 0 && prize.is_active
      ? Math.round((prize.weight / totalWeight) * 100)
      : 0;

  return (
    <Card>
      <form action={updateAction} className="space-y-3">
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
            ~{pct}%
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
              formAction={deleteAction}
              disabled={deletePending}
              onClick={(e) => {
                if (!confirm(`Supprimer le lot « ${prize.label} » ?`)) {
                  e.preventDefault();
                }
              }}
            >
              {deletePending ? "…" : "Supprimer"}
            </Button>
          </div>
        </div>
        <FieldError
          message={updateState && !updateState.ok ? updateState.error : undefined}
        />
      </form>
    </Card>
  );
}

function AddPrizeForm({ wheelId }: { wheelId: string }) {
  const [state, formAction, pending] = useActionState(addPrize, null);

  return (
    <Card className="border-dashed">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
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
