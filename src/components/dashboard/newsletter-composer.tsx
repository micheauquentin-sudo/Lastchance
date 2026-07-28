"use client";

import { useState } from "react";
import { sendNewsletterCampaign } from "@/actions/newsletter";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { cn } from "@/lib/utils";
import type { NewsletterSegment } from "@/types/database";

export interface SegmentCounts {
  all: number;
  loyal: number;
  new: number;
  inactive: number;
}

const SEGMENTS: Array<{
  value: NewsletterSegment;
  label: string;
  hint: string;
}> = [
  { value: "all", label: "Tous", hint: "Tous les abonnés actifs" },
  { value: "loyal", label: "Fidèles", hint: "3 gains ou plus" },
  { value: "new", label: "Nouveaux", hint: "Un seul gain" },
  { value: "inactive", label: "Inactifs", hint: "Aucun gain depuis 60 j" },
];

/**
 * `useActionForm` et non `useActionState` : c'est ce formulaire qui a servi à
 * établir puis à prouver le correctif du défaut de transition figée
 * (docs/bugs.md). Le commerçant voyait « Envoi en cours… » indéfiniment alors
 * que sa newsletter PARTAIT réellement — il en concluait un échec et
 * renvoyait. Mesure : 25 essais sans reproduction, contre environ un sur huit
 * auparavant.
 */
export function NewsletterComposer({ counts }: { counts: SegmentCounts }) {
  const [segment, setSegment] = useState<NewsletterSegment>("all");
  const { state, pending, onSubmit } = useActionForm(sendNewsletterCampaign, {
    resetOnSuccess: true,
    networkError: "Envoi impossible, réessayez.",
  });

  const targetCount = counts[segment];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="segment" value={segment} />

      <div>
        <Label>Segment</Label>
        <div className="grid grid-cols-2 gap-2">
          {SEGMENTS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSegment(s.value)}
              aria-pressed={segment === s.value}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                segment === s.value
                  ? "border-orange-400 bg-orange-50 text-orange-700"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-orange-300",
              )}
            >
              <span className="flex items-center justify-between font-semibold">
                {s.label}
                <span className="text-xs tabular-nums text-zinc-500">
                  {counts[s.value]}
                </span>
              </span>
              <span className="block text-xs text-zinc-500">{s.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="subject">Objet</Label>
        <input
          id="subject"
          name="subject"
          required
          maxLength={150}
          placeholder="Ex. : -20 % ce week-end chez nous !"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-shadow focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>
      <div>
        <Label htmlFor="body">Message</Label>
        <textarea
          id="body"
          name="body"
          required
          rows={7}
          maxLength={5000}
          placeholder="Écrivez votre message ici. Il sera envoyé tel quel, avec un lien de désinscription en bas d'email."
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-shadow focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {state && !state.ok && <FieldError message={state.error} />}
      {state && state.ok && (
        <p className="text-sm font-medium text-emerald-600">
          En file d&apos;attente : envoi à {state.data.recipientCount} abonné
          {state.data.recipientCount > 1 ? "s" : ""} dans les minutes qui
          viennent (suivi dans l&apos;historique).
        </p>
      )}

      <Button type="submit" disabled={pending || targetCount === 0} className="w-full sm:w-auto">
        {pending
          ? "Envoi en cours…"
          : `Envoyer à ${targetCount} abonné${targetCount > 1 ? "s" : ""}`}
      </Button>
    </form>
  );
}
