"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionResult } from "@/lib/utils";

/**
 * Soumission d'un formulaire à une Server Action, avec un état de chargement
 * QUI RETOMBE TOUJOURS.
 *
 * ─── Pourquoi ce hook existe (defaut mesuré le 2026-07-28, docs/bugs.md) ───
 *
 * `useActionState` — et `useTransition` — exposent un `pending` piloté par le
 * rendu. Quand une action serveur qui appelle `revalidatePath` se résout TRÈS
 * VITE, ce `pending` peut ne JAMAIS retomber : le réconciliateur marque la
 * frontière comme suspendue et ne rejoue pas la mise à jour, alors même que la
 * réponse est arrivée (POST 200) et que l'effet est appliqué en base.
 *
 * Conséquence pour l'utilisateur : un écran figé sur « … » après une action
 * qui a POURTANT réussi, sans message. Un commerçant renvoie sa newsletter ; un
 * caissier ne sait pas si le lot est remis, devant un client qui attend.
 * Reproduit environ une fois sur huit sur React 19.2.8 / Next 16.2.12 — les
 * dernières versions publiées. Défaut connu en amont (vercel/next.js
 * discussions #82289 et #88767, issue #58772) : **une montée de version ne le
 * réglera pas.**
 *
 * Ici, l'action est appelée comme une simple fonction asynchrone : sa promesse
 * se résout à la réponse HTTP, indépendamment du rendu, et `pending` retombe
 * dans un `finally`. `router.refresh()` rafraîchit l'écran sans que
 * l'affichage du résultat en dépende.
 *
 * Contrepartie assumée : le formulaire n'est plus soumissible sans JavaScript.
 * Sur les écrans concernés — back-office et caisse — il ne l'était déjà qu'à
 * moitié, les sélecteurs étant des états client.
 */
export function useActionForm<T = void>(
  action: (
    prev: ActionResult<T> | null,
    formData: FormData,
  ) => Promise<ActionResult<T>>,
  options: {
    /** Vide le formulaire après un succès. */
    resetOnSuccess?: boolean;
    /** Appelé après un succès, avant le rafraîchissement. */
    onSuccess?: (data: T) => void;
    /** Message affiché si l'appel lui-même échoue (réseau coupé). */
    networkError?: string;
  } = {},
) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult<T> | null>(null);
  const [pending, setPending] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setState(null);
    void (async () => {
      try {
        const result = await action(null, formData);
        setState(result);
        if (result.ok) {
          if (options.resetOnSuccess) form.reset();
          options.onSuccess?.(result.data);
          router.refresh();
        }
      } catch {
        // Réseau coupé ou action injoignable : on le DIT, plutôt que de
        // laisser le bouton tourner sans fin.
        setState({
          ok: false,
          error: options.networkError ?? "Action impossible, réessayez.",
        });
      } finally {
        setPending(false);
      }
    })();
  }

  return { state, pending, onSubmit };
}
