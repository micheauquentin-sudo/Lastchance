"use client";

import { setVitrineIndexation } from "@/actions/vitrine";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";
import type { EtatIndexation } from "@/lib/vitrine-indexation";

/**
 * VIT-12 — ÊTRE TROUVÉ SUR GOOGLE, OU NON.
 *
 * ── L'ÉCRAN DIT CE QUI MANQUE, IL NE REFUSE PAS LE GESTE ──
 *
 * Le bouton reste actif même sur une vitrine incomplète : l'accord est
 * enregistrable à tout moment, et c'est la PAGE qui exige en plus la
 * publication et une carte étoffée. Griser le bouton aurait obligé le
 * commerçant à deviner l'ordre des gestes ; la phrase le lui dit.
 *
 * ── CE QUE LE RETRAIT PROMET, EXACTEMENT ──
 *
 * « Immédiat sur votre page » et rien de plus. Promettre un effacement de
 * Google serait promettre ce que personne ici ne contrôle : les moteurs
 * repassent quand ils veulent. Dire la vérité coûte une phrase et évite un
 * appel au support un mois plus tard.
 */
export function IndexationVitrine({
  indexable,
  etat,
  peutEditer,
}: {
  indexable: boolean;
  etat: EtatIndexation;
  peutEditer: boolean;
}) {
  const { state, pending, onSubmit } = useActionForm(setVitrineIndexation, {
    networkError: "Enregistrement impossible, réessayez.",
  });

  return (
    <Card>
      <h2>Être trouvé sur Google</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Par défaut, votre Vitrine n&apos;est atteignable que par son QR code ou
        son lien. Vous pouvez autoriser les moteurs de recherche à la référencer
        — c&apos;est votre décision, et elle se retire.
      </p>

      <p
        className={`mb-4 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${
          etat.indexee
            ? "border-green-700/30 bg-green-50 text-green-700"
            : "border-k-ink/15 bg-white text-k-body"
        }`}
      >
        {etat.indexee
          ? "Votre Vitrine est référençable : les moteurs peuvent l’indexer."
          : etat.manque}
      </p>

      {peutEditer ? (
        <form onSubmit={onSubmit} className="space-y-3">
          {/* UN ÉTAT VOULU DANS UN CHAMP CACHÉ, pas une case : un navigateur
              n'envoie pas une case décochée, et « je retire mon accord »
              n'aurait jamais atteint le serveur. */}
          <input
            type="hidden"
            name="indexable"
            value={indexable ? "false" : "true"}
          />

          {state && !state.ok ? <FieldError message={state.error} /> : null}
          {state?.ok ? (
            <p className="text-sm font-semibold text-green-700">Enregistré.</p>
          ) : null}

          <Button
            type="submit"
            variant={indexable ? "secondary" : "primary"}
            disabled={pending}
          >
            {pending
              ? "Enregistrement…"
              : indexable
                ? "Retirer de l’indexation"
                : "Autoriser l’indexation"}
          </Button>

          <p className="text-xs text-zinc-500">
            {indexable
              ? "Le retrait est immédiat sur votre page. Les moteurs, eux, repassent quand ils veulent : l’oubli peut prendre quelques jours, et personne ne peut le commander."
              : "Aucune note, aucun avis, aucun prix et aucune disponibilité ne sont transmis aux moteurs — seulement le nom du lieu, votre accroche et l’adresse de votre carte."}
          </p>
        </form>
      ) : null}
    </Card>
  );
}
