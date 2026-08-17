"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  resumeCampaignAfterBudget,
  updateCampaignAutomation,
} from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { CampaignWindowState } from "@/lib/campaign-window";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
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

/**
 * Carte campagne : programmation automatique (activation / mise en pause
 * selon les dates, suivies par le cron côté base) et budget de gains
 * (plafond de dépense imputé à chaque gain réclamé).
 *
 * `useActionForm` et non `useActionState` : l'état de chargement doit
 * retomber même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function CampaignAutomationSettings({
  campaign,
  timeZone,
}: {
  campaign: Campaign;
  timeZone: string;
}) {
  // ENREGISTREMENT AUTOMATIQUE. `useAutoSave` s'ajoute À CÔTÉ de
  // `useActionForm` — jamais autour : deux gardes mécaniques du dépôt cherchent
  // l'appel littéral. Il ne couvre QUE cette carte de réglages ; la bannière
  // ci-dessous (`resumeCampaignAfterBudget`) rouvre le jeu aux clients et
  // restera toujours un geste cliqué.
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useActionForm(updateCampaignAutomation, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);
  const [dates, setDates] = useState(() => ({
    starts: isoToZonedDateTimeInput(campaign.starts_at, timeZone),
    ends: isoToZonedDateTimeInput(campaign.ends_at, timeZone),
  }));

  const spent = campaign.budget_spent_cents;
  const budget = campaign.budget_cents;
  const pct =
    budget != null && budget > 0
      ? Math.min(100, Math.round((spent / budget) * 100))
      : 0;

  return (
    <Card>
      <h2 className="font-semibold mb-1">Programmation et budget</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Laissez la campagne se piloter toute seule : dates de début et de
        fin, et plafond de dépense en gains.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
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
            moins une des deux dates. Heures de l&apos;établissement ({timeZone}).
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
          {enAttente && !pending && (
            <p className="text-sm font-semibold text-k-body">
              Modification en attente d&apos;enregistrement…
            </p>
          )}
        </div>
        {/* Un enregistrement automatique silencieusement inopérant est pire que
            pas d'enregistrement du tout. */}
        {bloqueParValidation && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            Non enregistré : un champ requis est vide ou invalide.
          </p>
        )}
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

/**
 * Bannière d'état d'une campagne mise en pause automatiquement (budget
 * atteint, fin de programmation, ou droit expiré). `interactive` ajoute le bouton
 * « Reprendre la campagne » (page détail) — la variante liste reste purement textuelle
 * (elle vit dans un lien).
 *
 * `useActionForm` et non `useActionState` : l'état de chargement doit
 * retomber même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function CampaignStateBanner({
  campaign,
  windowState = "open",
  interactive = false,
}: {
  campaign: Pick<
    Campaign,
    | "id"
    | "status"
    | "paused_reason"
    | "budget_cents"
    | "budget_spent_cents"
    | "starts_at"
    | "ends_at"
  >;
  /**
   * Calculé côté serveur par la page (`campaignWindowState`) : cette
   * bannière est un composant client, lire l'horloge ici ferait diverger le
   * rendu serveur de l'hydratation.
   */
  windowState?: CampaignWindowState;
  interactive?: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(resumeCampaignAfterBudget, {
    // `reloadOnSuccess` : la pastille de statut, la liste des transitions
    // offertes et la bannière sont TOUTES des props serveur. Le commerçant
    // ouvrait son jeu au public — l'ISR de /play est purgé dans la foulée — et
    // son écran continuait d'afficher « brouillon ». Les formulaires ne
    // portent que des champs cachés : le rechargement ne coûte rien.
    reloadOnSuccess: true,
    networkError: "Relance impossible, réessayez.",
  });
  const [open, setOpen] = useState(false);

  // Campagne ACTIVE mais hors de sa fenêtre : le joueur qui scanne est
  // refusé alors que le dashboard affichait « Active » en vert et que rien
  // n'expliquait le gel des compteurs. Sans programmation automatique
  // (`auto_schedule`), aucun cron ne viendra jamais changer ce statut : le
  // commerçant doit agir lui-même, on lui donne les deux issues.
  if (campaign.status === "active" && windowState !== "open") {
    return windowState === "ended" ? (
      <div className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <p className="font-medium">
          Campagne terminée
          {campaign.ends_at ? ` le ${formatDate(campaign.ends_at)}` : ""} : plus
          aucun client ne peut jouer.
        </p>
        <p className="mt-1">
          Repoussez la date de fin dans « Programmation » pour la rouvrir, ou
          clôturez-la si elle est bien finie.
        </p>
      </div>
    ) : (
      <div className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <p className="font-medium">
          Campagne programmée : elle n&apos;ouvrira au public
          {campaign.starts_at ? ` que le ${formatDate(campaign.starts_at)}` : " qu'à sa date de début"}.
        </p>
        <p className="mt-1">
          D&apos;ici là, un client qui scanne le QR code ne peut pas jouer.
          Avancez la date de début dans « Programmation » pour ouvrir tout de
          suite.
        </p>
      </div>
    );
  }

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

  // LE DROIT QUI OUVRE LA ROUE EST TERMINÉ (pass expiré, abonnement clos).
  //
  // Cette branche précède le repli budget, et ce n'est pas un détail d'ordre :
  // sans elle, une pause `droit_expire` tombait sur la bannière budget et
  // annonçait « budget de gains atteint (0,00 €) » à un commerçant dont le
  // budget n'y était pour rien. Il cherchait un plafond introuvable au lieu de
  // renouveler son option.
  //
  // Aucun bouton « Reprendre » ici : le cron réactive la campagne de lui-même
  // dès qu'une offre redevient active — proposer un geste manuel qui échouera
  // en base (`assert_module_publish_allowed`) serait pire que ne rien proposer.
  // Aucune date non plus : la fin du droit se lit dans le bandeau de capacités,
  // seul endroit qui connaisse l'octroi.
  if (campaign.paused_reason === "droit_expire") {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">
          Campagne en pause : l&apos;option qui ouvre la roue est terminée.
        </p>
        <p className="mt-1">
          Dès qu&apos;une offre est active, la programmation rouvre la campagne
          d&apos;elle-même — vous n&apos;avez rien à relancer à la main.
        </p>
        <Link
          href="/dashboard/settings/modules"
          className="mt-2 inline-block rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100"
        >
          Voir les offres
        </Link>
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
          Reprendre la campagne
        </button>
      )}
      {interactive && open && (
        <form onSubmit={onSubmit} className="mt-3 space-y-2">
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
              {pending ? "…" : "Reprendre la campagne"}
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
