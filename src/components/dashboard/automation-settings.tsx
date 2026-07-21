"use client";

import { useActionState } from "react";
import {
  updateAutomationSettings,
  type AutomationSettingView,
} from "@/actions/automations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { AutomationScenario } from "@/types/database";

/** Textes d'une carte scénario (titre, nature, description). */
const SCENARIOS: Record<
  AutomationScenario,
  { title: string; kind: "service" | "marketing"; description: string }
> = {
  won_not_redeemed: {
    title: "Gain non retiré",
    kind: "service",
    description:
      "Rappelle au joueur que son code de gain n'a pas encore été utilisé. C'est un rappel de service lié à son gain — pas un message marketing.",
  },
  inactive: {
    title: "Clients inactifs",
    kind: "marketing",
    description:
      "Relance marketing des clients qui n'ont pas rejoué depuis un moment. Seuls les contacts ayant accepté vos communications la reçoivent.",
  },
  post_redemption: {
    title: "Après retrait",
    kind: "marketing",
    description:
      "Message de remerciement et de fidélisation envoyé quelques heures après l'utilisation d'un gain en caisse (marketing — contacts ayant accepté vos communications).",
  },
  birthday: {
    title: "Anniversaire",
    kind: "marketing",
    description:
      "Vœux envoyés le jour J aux clients ayant donné leur date de naissance. Seuls les contacts ayant coché la case anniversaire (consentement explicite) la reçoivent.",
  },
};

const KIND_BADGE: Record<"service" | "marketing", { label: string; className: string }> = {
  service: { label: "Rappel de service", className: "bg-sky-100 text-sky-700" },
  marketing: { label: "Marketing", className: "bg-violet-100 text-violet-700" },
};

/**
 * Carte de réglage d'UN scénario d'email automatique : interrupteur
 * d'activation + réglages propres au scénario, enregistrés ensemble.
 * Le cron quotidien ne traite que les scénarios activés.
 */
export function AutomationScenarioCard({
  setting,
  autoReengage = false,
}: {
  setting: AutomationSettingView;
  /** organizations.auto_reengage — avertit d'un possible doublon de relances. */
  autoReengage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateAutomationSettings,
    null,
  );
  const { scenario, enabled, config } = setting;
  const texts = SCENARIOS[scenario];
  const badge = KIND_BADGE[texts.kind];

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-semibold">{texts.title}</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      <p className="text-sm text-zinc-500 mb-4">{texts.description}</p>

      {scenario === "inactive" && autoReengage && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Le réengagement automatique est aussi activé : un même contact
          peut recevoir deux relances proches.
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="scenario" value={scenario} />

        <label className="flex items-start gap-3 cursor-pointer text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-orange-600"
          />
          <span className="font-medium text-zinc-900">Activer ce scénario</span>
        </label>

        {scenario === "won_not_redeemed" && (
          <div>
            <Label htmlFor="automation-min-age-hours">
              Délai avant relance (heures)
            </Label>
            <Input
              id="automation-min-age-hours"
              name="min_age_hours"
              type="number"
              min={1}
              max={720}
              defaultValue={config.minAgeHours ?? 48}
              required
              className="w-32"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Le rappel part une fois ce délai écoulé, si le code n&apos;a
              toujours pas été utilisé (1 à 720 heures).
            </p>
          </div>
        )}

        {scenario === "inactive" && (
          <div>
            <Label htmlFor="automation-tiers">
              Paliers d&apos;inactivité (jours)
            </Label>
            <Input
              id="automation-tiers"
              name="tiers"
              defaultValue={(config.tiers ?? [30, 60]).join(", ")}
              placeholder="Ex : 30, 60"
              required
              className="w-48"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              De 7 à 365 jours, jusqu&apos;à 4 paliers séparés par des
              virgules — un email de relance par palier atteint.
            </p>
          </div>
        )}

        {scenario === "post_redemption" && (
          <div>
            <Label htmlFor="automation-delay-hours">
              Délai après le retrait (heures)
            </Label>
            <Input
              id="automation-delay-hours"
              name="delay_hours"
              type="number"
              min={1}
              max={720}
              defaultValue={config.delayHours ?? 24}
              required
              className="w-32"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Le message de remerciement part ce délai après le passage en
              caisse (1 à 720 heures).
            </p>
          </div>
        )}

        {scenario === "birthday" && (
          <p className="text-xs text-zinc-500">
            Aucun réglage : l&apos;email part le jour de l&apos;anniversaire.
            La date de naissance n&apos;est collectée qu&apos;avec une case de
            consentement dédiée, après le gain.
          </p>
        )}

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
