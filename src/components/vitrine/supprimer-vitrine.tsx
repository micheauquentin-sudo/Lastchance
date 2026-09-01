"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { deleteVitrine } from "@/actions/vitrine";
import type { ActionResult } from "@/lib/utils";

/**
 * SUPPRIMER LA VITRINE (VIT-14) — en pied d'écran, et en deux temps.
 *
 * ── LE MOTIF EST CELUI DES ÉDITEURS DE JEU, PAS CELUI DES CAMPAGNES ──
 *
 * Deux façons de demander confirmation coexistent dans ce tableau de bord. Les
 * campagnes ouvrent un `confirm()` du navigateur ; les jeux (soirée, jackpot)
 * révèlent une ligne DANS la page — la question, « Confirmer », « Annuler ».
 * C'est ce second motif qui est repris ici, parce que c'est celui que le
 * propriétaire a désigné, et parce qu'il est le meilleur des deux : un
 * `confirm()` n'est pas stylable, se lit hors contexte, et certains
 * navigateurs le suppriment après plusieurs déclenchements sur la même page.
 *
 * ── LA QUESTION NOMME CE QUI DISPARAÎT, ET CE QUI SE LIBÈRE ──
 *
 * « Supprimer la vitrine ? » ne dit rien. Ce qui compte, ce sont les deux
 * conséquences qu'un commerçant ne peut pas deviner : le catalogue entier part
 * avec, ET l'adresse redevient libre — donc les QR déjà imprimés tombent, et
 * un autre commerce peut prendre l'adresse. Le second point est le plus lourd
 * et le moins évident ; il est écrit en toutes lettres.
 *
 * ── PAS DE `Card` ──
 *
 * Un cadre l'aurait remise au rang des autres réglages. Un filet, un titre
 * rouge, la phrase, le bouton — la suppression reste à part, en bas, là où on
 * ne tombe pas dessus par hasard. Même arbitrage que `SupprimerCampagne`.
 *
 * ── `reloadOnSuccess` ──
 *
 * Après la suppression, tout l'écran est faux : l'adresse, le catalogue, les
 * mesures, la publication. Rafraîchir une prop ne suffirait pas — c'est la
 * page entière qui doit repartir de zéro, sur l'écran « aucune vitrine ».
 */

/**
 * `deleteVitrine` ne prend aucun paramètre — même famille que `publishVitrine`
 * et `unpublishVitrine` : il n'y a rien à saisir, donc rien à poster. Cet
 * adaptateur lui donne la signature qu'attend `useActionForm`, sans qu'un champ
 * ait à être inventé pour satisfaire une signature.
 */
const supprimerAction = (): Promise<ActionResult> => deleteVitrine();

export function SupprimerVitrine({
  peutSupprimer,
}: {
  /** `owner` SEUL : la RPC refuse un `editor`, et le bouton ne doit pas le
   * laisser découvrir ce refus après avoir confirmé. */
  peutSupprimer: boolean;
}) {
  const [confirme, setConfirme] = useState(false);
  const suppression = useActionForm(supprimerAction, {
    networkError: "Suppression impossible, réessayez.",
    reloadOnSuccess: true,
  });

  return (
    <div className="mt-10 border-t-2 border-red-200 pt-5">
      <h2 className="mb-1 font-black text-red-700">Supprimer la vitrine</h2>
      <p className="mb-4 max-w-prose text-sm text-zinc-500">
        Supprime l&apos;adresse publique, vos cartes, rubriques et fiches, les
        traductions, les liens mis en avant et les mesures d&apos;audience.{" "}
        <strong className="font-semibold text-zinc-700">
          Les QR codes déjà imprimés cesseront de fonctionner, et
          l&apos;adresse redeviendra disponible pour un autre commerce.
        </strong>{" "}
        Irréversible.
      </p>

      {confirme ? (
        <form
          onSubmit={suppression.onSubmit}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm font-semibold text-k-body">
            Supprimer la vitrine, son adresse et tout son catalogue ?
          </span>
          <Button type="submit" variant="danger" disabled={suppression.pending}>
            {suppression.pending ? "Suppression…" : "Confirmer"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirme(false)}
            disabled={suppression.pending}
          >
            Annuler
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="text-red-600 hover:bg-red-50"
          onClick={() => setConfirme(true)}
          // Un éditeur voit le bouton mais ne peut pas l'actionner : la RPC
          // exige `owner`. Le désactiver ici évite de lui faire découvrir le
          // refus après avoir confirmé une suppression.
          disabled={!peutSupprimer}
        >
          Supprimer la vitrine
        </Button>
      )}

      <FieldError
        message={
          suppression.state && !suppression.state.ok
            ? suppression.state.error
            : undefined
        }
      />
    </div>
  );
}
