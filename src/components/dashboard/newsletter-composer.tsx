"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendNewsletterCampaign } from "@/actions/newsletter";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";
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

export function NewsletterComposer({ counts }: { counts: SegmentCounts }) {
  const [state, formAction, pending] = useActionState(sendNewsletterCampaign, null);
  const [segment, setSegment] = useState<NewsletterSegment>("all");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const targetCount = counts[segment];

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
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
          Envoyé à {state.data.recipientCount} abonné{state.data.recipientCount > 1 ? "s" : ""}.
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
