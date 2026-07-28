"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { sendNewsletterCampaign } from "@/actions/newsletter";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";
import { cn, type ActionResult } from "@/lib/utils";
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
 * État de chargement tenu par le composant, PAS par `useActionState`.
 *
 * Motif (mesuré, docs/bugs.md) : quand une action serveur qui appelle
 * `revalidatePath` se résout très vite, le `pending` de `useActionState` peut
 * ne JAMAIS retomber — le réconciliateur marque la frontière suspendue et ne
 * rejoue pas la mise à jour, alors que la réponse est bien arrivée (POST 200,
 * effet appliqué en base). Reproduit environ une fois sur huit sur React
 * 19.2.8 / Next 16.2.12, les dernières publiées ; défaut connu en amont
 * (vercel/next.js #82289, #88767, #58772), donc pas réparable par une montée
 * de version.
 *
 * Conséquence pour le commerçant : sa newsletter PARTAIT réellement, mais son
 * écran restait figé sur « Envoi en cours… », sans message — il en concluait
 * un échec et renvoyait.
 *
 * Ici, l'action est appelée comme une simple fonction asynchrone et l'état
 * retombe dans un `finally` : la promesse de l'action se résout à la réponse
 * HTTP, indépendamment du rendu. Le commerçant est donc toujours informé.
 * `router.refresh()` rafraîchit l'historique sans que l'affichage en dépende.
 *
 * Contrepartie assumée : le formulaire n'est plus soumissible sans
 * JavaScript. Il ne l'était déjà qu'à moitié — le choix du segment est un état
 * client.
 */
export function NewsletterComposer({ counts }: { counts: SegmentCounts }) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult<{ recipientCount: number }> | null>(null);
  const [pending, setPending] = useState(false);
  const [segment, setSegment] = useState<NewsletterSegment>("all");
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setState(null);
    try {
      const result = await sendNewsletterCampaign(null, formData);
      setState(result);
      if (result.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    } catch {
      // Coupure réseau ou action indisponible : on le DIT, plutôt que de
      // laisser le bouton tourner indéfiniment.
      setState({ ok: false, error: "Envoi impossible, réessayez." });
    } finally {
      setPending(false);
    }
  }

  const targetCount = counts[segment];

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
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
