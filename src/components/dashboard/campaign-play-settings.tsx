"use client";

import { useActionState, useState } from "react";
import {
  updateCampaignClaim,
  updateCampaignEngagement,
} from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { Campaign, EngagementAction } from "@/types/database";

const ACTIONS: Array<{
  action: EngagementAction;
  label: string;
  hint: string;
  urlLabel?: string;
  urlPlaceholder?: string;
}> = [
  {
    action: "newsletter",
    label: "Inscription à votre newsletter",
    hint: "Le client laisse son email avant de jouer — récupérable dans Participations.",
  },
  {
    action: "instagram",
    label: "S'abonner à votre Instagram",
    hint: "Le client ouvre votre profil avant de jouer.",
    urlLabel: "Lien de votre profil Instagram",
    urlPlaceholder: "https://instagram.com/votre-compte",
  },
  {
    action: "tiktok",
    label: "S'abonner à votre TikTok",
    hint: "Le client ouvre votre profil avant de jouer.",
    urlLabel: "Lien de votre profil TikTok",
    urlPlaceholder: "https://tiktok.com/@votre-compte",
  },
  {
    action: "google_review",
    label: "Laisser un avis Google",
    hint: "Le client ouvre votre page d'avis avant de jouer.",
    urlLabel: "Lien de votre page d'avis Google",
    urlPlaceholder: "https://g.page/r/…/review",
  },
];

/**
 * Carte campagne : actions proposées au joueur AVANT de lancer la roue.
 * Si au moins une action est cochée, le joueur doit en choisir une pour
 * débloquer la roue.
 */
export function CampaignEngagementSettings({
  campaign,
}: {
  campaign: Campaign;
}) {
  const [state, formAction, pending] = useActionState(
    updateCampaignEngagement,
    null,
  );
  const config = campaign.engagement ?? {};
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      ACTIONS.map((a) => [a.action, config[a.action]?.enabled ?? false]),
    ),
  );

  return (
    <Card>
      <h2 className="font-semibold mb-1">Actions avant de jouer</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Proposez à vos clients une action au choix pour débloquer la roue.
        Aucune action cochée = la roue est jouable directement.
      </p>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="id" value={campaign.id} />
        {ACTIONS.map((a) => (
          <div key={a.action}>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name={a.action}
                checked={enabled[a.action]}
                onChange={(e) =>
                  setEnabled((prev) => ({
                    ...prev,
                    [a.action]: e.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
              />
              <span>
                <span className="font-medium text-zinc-900">{a.label}</span>
                <span className="block text-xs text-zinc-500 mt-0.5">
                  {a.hint}
                </span>
              </span>
            </label>
            {a.urlLabel &&
              (enabled[a.action] ? (
                <div className="mt-2 ml-7">
                  <Label htmlFor={`${a.action}_url`}>{a.urlLabel}</Label>
                  <Input
                    id={`${a.action}_url`}
                    name={`${a.action}_url`}
                    type="url"
                    defaultValue={config[a.action]?.url ?? ""}
                    placeholder={a.urlPlaceholder}
                    required
                  />
                </div>
              ) : (
                // Conserve l'URL déjà saisie quand l'action est décochée.
                <input
                  type="hidden"
                  name={`${a.action}_url`}
                  value={config[a.action]?.url ?? ""}
                />
              ))}
          </div>
        ))}

        <p className="text-xs text-zinc-400">
          Le suivi et l&apos;avis sont déclaratifs (non vérifiables
          techniquement). Attention : Google déconseille les avis obtenus
          contre récompense — l&apos;action reste un choix parmi d&apos;autres,
          jamais une obligation.
        </p>

        <FieldError message={state && !state.ok ? state.error : undefined} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "…" : "Enregistrer"}
        </Button>
        {state?.ok && (
          <p className="text-sm text-emerald-600 text-center">
            Configuration enregistrée.
          </p>
        )}
      </form>
    </Card>
  );
}

/**
 * Carte campagne : ce qui est demandé au gagnant avant d'afficher le
 * code (email, téléphone, ou rien) + compte à rebours avant masquage
 * de l'écran du code.
 */
export function CampaignClaimSettings({ campaign }: { campaign: Campaign }) {
  const [state, formAction, pending] = useActionState(
    updateCampaignClaim,
    null,
  );

  return (
    <Card>
      <h2 className="font-semibold mb-1">Après le gain</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Choisissez ce qui est demandé au gagnant avant d&apos;afficher son
        code. Rien de coché = le code s&apos;affiche directement.
      </p>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="id" value={campaign.id} />

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="collect_email"
            defaultChecked={campaign.collect_email}
            className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
          />
          <span>
            <span className="font-medium text-zinc-900">
              Demander l&apos;email
            </span>
            <span className="block text-xs text-zinc-500 mt-0.5">
              Le gagnant reçoit aussi son code par email.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="collect_phone"
            defaultChecked={campaign.collect_phone}
            className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
          />
          <span>
            <span className="font-medium text-zinc-900">
              Demander le téléphone
            </span>
            <span className="block text-xs text-zinc-500 mt-0.5">
              Numéro visible dans Participations et l&apos;export CSV.
            </span>
          </span>
        </label>

        <div>
          <Label htmlFor="code_ttl_seconds">
            Compte à rebours avant masquage du code (secondes)
          </Label>
          <Input
            id="code_ttl_seconds"
            name="code_ttl_seconds"
            type="number"
            min={10}
            max={600}
            defaultValue={campaign.code_ttl_seconds ?? ""}
            placeholder="Vide = le code reste affiché"
          />
          <p className="text-xs text-zinc-500 mt-1.5">
            Ex : 60 — le gagnant a 60 secondes pour présenter son code au
            staff avant qu&apos;il disparaisse de l&apos;écran (10 à 600 s).
          </p>
        </div>

        <FieldError message={state && !state.ok ? state.error : undefined} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "…" : "Enregistrer"}
        </Button>
        {state?.ok && (
          <p className="text-sm text-emerald-600 text-center">
            Configuration enregistrée.
          </p>
        )}
      </form>
    </Card>
  );
}
