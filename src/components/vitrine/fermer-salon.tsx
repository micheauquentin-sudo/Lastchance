"use client";

import { closeOrgLobby } from "@/actions/lobby";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";

/**
 * LE BOUTON QUI REND LE DÉNI RÉVERSIBLE — un salon, un formulaire.
 *
 * ── UN `<form>` PAR LIGNE, ET NON UN SEUL POUR LA LISTE ──
 *
 * Chaque ligne poste son propre `lobby_id` : fermer le troisième salon n'envoie
 * pas les deux autres au serveur, et l'état de chargement reste sur la ligne
 * cliquée. C'est le motif de `ContenusEditeur`, pour la même raison.
 *
 * ── PAS DE `reloadOnSuccess`, ET C'EST UN ARBITRAGE, PAS UN OUBLI ──
 *
 * Le critère écrit dans `use-action-form.ts` demande DEUX conditions : que le
 * rafraîchissement soit le seul moyen de voir le résultat, ET que refaire le
 * geste crée un doublon. La première est vraie ici — la liste est rendue par le
 * serveur. La seconde ne l'est pas : `close_player_lobby_as_org` est
 * idempotente, un second clic rend `deja-ferme` sans rien écrire ni rien
 * journaliser. Le rechargement franc coûterait une seconde et la position de
 * défilement à tout le monde pour fermer une fenêtre qui ne coûte rien à
 * personne. Le `router.refresh()` du hook suffit, et la phrase ci-dessous dit ce
 * qui s'est passé même le jour où il ne s'applique pas.
 *
 * ── AUCUNE CONFIRMATION, ET LA RAISON TIENT AU REGISTRE DESTRUCTIF ──
 *
 * Les cases « je comprends que… » du dépôt protègent des CODES DÉJÀ EN MAIN
 * d'un client — un lot gagné qui deviendrait introuvable. Fermer un salon ne
 * détruit aucun code : un salon ne distribue rien, il n'émet aucun code de
 * retrait. Ajouter une case ici entraînerait le commerçant à cocher une
 * confirmation destructive là où elle ne veut rien dire, puis à la cocher par
 * réflexe le jour où elle protège de vrais codes (garde
 * `destructive-confirm-coverage`).
 */
export function FermerSalon({ lobbyId }: { lobbyId: string }) {
  const { state, pending, onSubmit } = useActionForm(closeOrgLobby, {
    networkError: "Fermeture impossible, réessayez.",
  });

  /**
   * Le mot rendu par le geste. `ferme` n'a pas le sien : la ligne disparaît
   * avec le rafraîchissement, et écrire « fermé » sous une ligne qui n'existe
   * plus n'aurait de destinataire que dans le cas où le rafraîchissement rate.
   */
  const message = !state
    ? null
    : !state.ok
      ? state.error
      : state.data.etat === "deja-ferme"
        ? "Ce salon était déjà fermé."
        : state.data.etat === "indisponible"
          ? "Ce salon n'est plus disponible."
          : null;

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-3">
      <input type="hidden" name="lobby_id" value={lobbyId} />
      {message ? (
        <p role="status" className="text-xs font-semibold text-k-body">
          {message}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Fermeture…" : "Fermer"}
      </Button>
    </form>
  );
}
