"use client";

import { useActionState, useEffect, useState } from "react";
import {
  resumeCampaignAfterBudget,
  updateCampaignAutomation,
} from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import type { Campaign } from "@/types/database";

/** Centimes → euros affichables (« 250 € », « 99,90 € »). Déterministe (pas d'Intl). */
function euros(cents: number): string {
  const value = cents / 100;
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(".", ",");
  return `${text} €`;
}

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

/**
 * Carte campagne : programmation automatique (activation / mise en pause
 * selon les dates, suivies par le cron côté base) et budget de gains
 * (plafond de dépense imputé à chaque gain réclamé).
 */
export function CampaignAutomationSettings({ campaign }: { campaign: Campaign }) {
  const [state, formAction, pending] = useActionState(
    updateCampaignAutomation,
    null,
  );
  // Les dates sont converties dans le fuseau du navigateur APRÈS le
  // montage : le serveur (souvent en UTC) rendrait d'autres valeurs.
  const [dates, setDates] = useState({ starts: "", ends: "" });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- conversion unique post-montage dans le fuseau du navigateur, évite tout écart d'hydratation SSR/CSR.
    setDates({
      starts: isoToLocalInput(campaign.starts_at),
      ends: isoToLocalInput(campaign.ends_at),
    });
  }, [campaign.starts_at, campaign.ends_at]);

  const spent = campaign.budget_spent_cents;
  const budget = campaign.budget_cents;
  const pct =
    budget != null && budget > 0
      ? Math.min(100, Math.round((spent / budget) * 100))
      : 0;

  // Les datetime-local sont convertis en ISO (UTC) avant l'envoi : le
  // serveur interpréterait sinon l'heure « nue » dans son propre fuseau.
  function submit(formData: FormData) {
    formData.set("starts_at", localInputToIso(String(formData.get("starts_at") ?? "")));
    formData.set("ends_at", localInputToIso(String(formData.get("ends_at") ?? "")));
    formAction(formData);
  }

  return (
    <Card>
      <h2 className="font-semibold mb-1">Programmation et budget</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Laissez la campagne se piloter toute seule : dates de début et de
        fin, et plafond de dépense en gains.
      </p>

      <form action={submit} className="space-y-6">
        <input type="hidden" name="id" value={campaign.id} />

        <fieldset className="space-y-4">
          <legend className="text-sm font-bold text-k-ink">Programmation</legend>

          <label className="flex items-start gap-3 cursor-pointer text-sm">
            <input
              type="checkbox"
              name="auto_schedule"
              defaultChecked={campaign.auto_schedule}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-orange-600"
            />
            <span>
              <span className="font-medium text-zinc-900">
                Activer/mettre en pause automatiquement selon les dates
              </span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                La campagne s&apos;active au début et se met en pause à la
                fin, sans intervention (vérifié toutes les 10 minutes).
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-4">
            <div>
              <Label htmlFor="campaign-starts-at">Début</Label>
              <Input
                id="campaign-starts-at"
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
              <Label htmlFor="campaign-ends-at">Fin</Label>
              <Input
                id="campaign-ends-at"
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
            Vide = sans borne. Avec la programmation activée, renseignez au
            moins une des deux dates.
          </p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold text-k-ink">Budget de gains</legend>

          <div>
            <Label htmlFor="campaign-budget">Plafond de dépense (€)</Label>
            <Input
              id="campaign-budget"
              name="budget"
              inputMode="decimal"
              placeholder="Ex : 250 — vide = sans plafond"
              defaultValue={
                budget != null
                  ? (budget / 100).toString().replace(".", ",")
                  : ""
              }
              className="w-56"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Chaque gain réclamé consomme le coût réel de son lot. Plafond
              atteint = campagne mise en pause automatiquement.
            </p>
          </div>

          {budget != null ? (
            <div>
              <div
                aria-hidden
                className="h-2 w-full max-w-md overflow-hidden rounded-full bg-zinc-100"
              >
                <div
                  className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-orange-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1.5 text-sm text-zinc-600">
                <span className="font-semibold text-zinc-900">
                  {euros(spent)}
                </span>{" "}
                dépensés sur {euros(budget)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">
              Sans plafond —{" "}
              <span className="font-semibold text-zinc-900">{euros(spent)}</span>{" "}
              distribués
            </p>
          )}
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

/**
 * Bannière d'état d'une campagne mise en pause automatiquement (budget
 * atteint ou fin de programmation). `interactive` ajoute le bouton
 * « Relancer » (page détail) — la variante liste reste purement textuelle
 * (elle vit dans un lien).
 */
export function CampaignStateBanner({
  campaign,
  interactive = false,
}: {
  campaign: Pick<
    Campaign,
    "id" | "status" | "paused_reason" | "budget_cents" | "budget_spent_cents" | "ends_at"
  >;
  interactive?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    resumeCampaignAfterBudget,
    null,
  );
  const [open, setOpen] = useState(false);

  if (campaign.status !== "paused" || !campaign.paused_reason) return null;

  if (campaign.paused_reason === "schedule_end") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        Campagne terminée
        {campaign.ends_at ? ` le ${formatDate(campaign.ends_at)}` : ""} (programmation
        automatique).
      </div>
    );
  }

  // budget_reached
  const amounts =
    campaign.budget_cents != null
      ? `${euros(campaign.budget_spent_cents)} / ${euros(campaign.budget_cents)}`
      : euros(campaign.budget_spent_cents);

  return (
    <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
      <p className="font-medium">
        Campagne en pause : budget de gains atteint ({amounts})
      </p>
      {interactive && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-sm font-semibold text-orange-800 hover:bg-orange-100 transition-colors"
        >
          Relancer
        </button>
      )}
      {interactive && open && (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={campaign.id} />
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="resume-budget" className="text-orange-900">
                Nouveau budget (€, facultatif)
              </Label>
              <Input
                id="resume-budget"
                name="budget"
                inputMode="decimal"
                placeholder="Vide = budget inchangé"
                className="w-52"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "…" : "Relancer la campagne"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
          <p className="text-xs text-orange-700">
            Le compteur de dépenses n&apos;est jamais remis à zéro : sans
            budget plus élevé, la campagne se remettra en pause au prochain
            gain réclamé.
          </p>
          <FieldError message={state && !state.ok ? state.error : undefined} />
        </form>
      )}
    </div>
  );
}
