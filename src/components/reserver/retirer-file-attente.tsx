"use client";

import { useCallback } from "react";
import { evictWaitlistEntry } from "@/actions/reserver";
import { FieldError } from "@/components/ui/input";
import type {
  EvictWaitlistEntryResult,
  EvictWaitlistEntryState,
} from "@/lib/reserver";
import { useActionForm } from "@/lib/use-action-form";
import type { ActionResult } from "@/lib/utils";

/**
 * « RETIRER » — le geste qui sort quelqu'un de la liste prioritaire.
 *
 * ── POURQUOI CE BOUTON EXISTE (revue de sécurité L5, E-1b) ──
 *
 * La file n'avait aucun geste commerçant, et la migration l'assumait : « une
 * offre meurt d'elle-même en deux heures au plus ». C'est vrai, et cela décrit
 * l'extinction NATURELLE d'une file — pas le retrait de QUELQU'UN : un doublon
 * manifeste, une inscription abusive, un désistement téléphonique de la part de
 * qui a perdu son lien. Les seules issues étaient d'attendre, ou de fermer le
 * créneau pour tout le monde.
 *
 * ── DISCRET, ET C'EST UN CHOIX D'ÉCRAN ──
 *
 * Le panneau de file CONSTATE : l'ordre est celui de l'inscription et rien ne
 * permet de le modifier — ni « proposer à », ni « faire passer devant ». Ce
 * bouton-ci n'est pas une exception à cette règle, il en est le complément
 * exact : il RETIRE, il ne réordonne pas, et la place repart au suivant du même
 * mouvement. Un commerçant ne peut donc pas s'en servir pour doubler sa propre
 * file — retirer la tête ne fait qu'avancer celle d'après.
 *
 * ── CONFIRMATION EN DEUX TEMPS, ET ELLE NOMME LA CONSÉQUENCE ──
 *
 * Deux conséquences, en fait, et le commerçant doit connaître les deux avant de
 * cliquer : AUCUN message ne part vers la personne retirée, et si elle tenait
 * une place, celle-ci part IMMÉDIATEMENT à la suivante — le geste n'est donc pas
 * rattrapable en re-cliquant.
 */
export function RetirerDeLaFile({
  entryId,
  position,
  tientUnePlace,
}: {
  entryId: string;
  /** Le rang affiché — il sert au nom accessible, pas à la décision. */
  position: number;
  /** `offerLive` : change le texte de confirmation, jamais l'autorisation. */
  tientUnePlace: boolean;
}) {
  /**
   * Adaptateur : la RPC rend un ÉTAT, pas un booléen. Sans ce pont,
   * `reloadOnSuccess` rechargerait la page sur `converted` comme sur `evicted`
   * — le commerçant verrait la ligne inchangée sans la moindre explication.
   */
  const action = useCallback(
    async (
      _prev: ActionResult<EvictWaitlistEntryResult> | null,
      formData: FormData,
    ): Promise<ActionResult<EvictWaitlistEntryResult>> => {
      const resultat = await evictWaitlistEntry(null, formData);
      if (!resultat.ok || resultat.data.state === "evicted") return resultat;
      return { ok: false, error: REFUS[resultat.data.state] };
    },
    [],
  );

  // `reloadOnSuccess` : le rang de chacun, l'état de l'offre et le compteur du
  // pli sont TOUS dérivés de props serveur, sans état local. Sans rechargement,
  // l'écran affiche encore l'entrée retirée — et la place qui vient de partir au
  // suivant ne se voit nulle part.
  const { state, pending, onSubmit } = useActionForm(action, {
    reloadOnSuccess: true,
    networkError:
      "Connexion perdue. Vérifiez votre réseau puis réessayez — personne n'a été retiré.",
  });

  return (
    <form
      onSubmit={(event) => {
        if (
          !confirm(
            tientUnePlace
              ? "Retirer cette personne de la liste ? La place qui lui était tenue repart IMMÉDIATEMENT à la suivante, et aucun message ne lui est envoyé : prévenez-la vous-même."
              : "Retirer cette personne de la liste d'attente ? Elle perd son rang, et aucun message ne lui est envoyé : prévenez-la vous-même.",
          )
        ) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="shrink-0"
    >
      <input type="hidden" name="entryId" value={entryId} />
      <button
        type="submit"
        disabled={pending}
        // Le créneau porte une LISTE de ces boutons, tous étiquetés pareil : à
        // la lecture d'écran, « Retirer » douze fois de suite ne dit pas
        // laquelle. Le nom accessible porte donc le rang, la surface visible
        // reste courte — même geste que « Annuler (staff) ».
        aria-label={`Retirer de la liste d'attente la personne au rang ${position}`}
        className="rounded-lg border-2 border-k-ink/25 bg-white px-2.5 py-1 text-xs font-bold text-k-body hover:border-k-ink hover:text-k-ink disabled:pointer-events-none disabled:opacity-60"
      >
        {pending ? "Retrait…" : "Retirer"}
      </button>
      <div aria-live="assertive">
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </div>
    </form>
  );
}

/**
 * Les trois états qui ne sont pas un retrait. `unknown` couvre l'entrée inconnue
 * ET celle d'une autre organisation — la RPC les rend indistinctes
 * volontairement, et ce message ne doit donc pas les distinguer non plus.
 */
const REFUS: Record<Exclude<EvictWaitlistEntryState, "evicted">, string> = {
  unknown: "Cette inscription est introuvable. Rechargez la page.",
  converted:
    "Cette personne a déjà pris sa place : ce n'est plus une inscription en attente mais une réservation, et c'est l'annulation qui la reprend.",
  expired:
    "Le délai de cette personne est déjà écoulé : elle n'occupe plus de rang, et sa place est repartie toute seule.",
};
