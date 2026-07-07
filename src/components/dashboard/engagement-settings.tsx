"use client";

import { useActionState, useState } from "react";
import { updateEngagement } from "@/actions/organization";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { EngagementAction, EngagementConfig } from "@/types/database";

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
 * Configuration des actions proposées au joueur AVANT de lancer la roue.
 * Si au moins une action est activée, le joueur doit en choisir une
 * pour débloquer la roue.
 */
export function EngagementSettings({ config }: { config: EngagementConfig }) {
  const [state, formAction, pending] = useActionState(updateEngagement, null);
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
