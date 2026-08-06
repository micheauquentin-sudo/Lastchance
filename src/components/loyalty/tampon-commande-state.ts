/**
 * Messages du QR de commande unique (cahier §7), côté joueur.
 *
 * Pourquoi un module à part plutôt qu'une branche de plus dans
 * `messageForStampState` : ce chemin n'a PAS les mêmes issues que le comptoir.
 *
 *  · `too_soon` N'Y ARRIVE JAMAIS — le jeton de commande contourne
 *    `min_stamp_interval_seconds` (deux commandes le même jour valent deux
 *    tampons, migration 20260915120000). Le repli le couvre quand même : un
 *    état inattendu doit produire une phrase, pas un écran vide.
 *  · `order_invalid` n'existe QUE là, et son ton est délibérément CALME :
 *    « déjà servie » n'est pas une erreur du client. Il a scanné le QR d'une
 *    commande dont le tampon est déjà posé — souvent parce qu'il a rouvert
 *    l'onglet. Un cadre rouge lui ferait croire qu'il a perdu quelque chose.
 *
 * Le reste (`stamped`, `unavailable`, et tout le reste) délègue à la table
 * partagée du passeport : une seule formulation par état, un seul endroit.
 */

import type { LoyaltyStampState } from "@/types/database";
import {
  messageForStampState,
  type LoyaltyStateMessage,
} from "./loyalty-passport-state";

export function messageForOrderStamp(
  state: LoyaltyStampState,
): LoyaltyStateMessage {
  switch (state) {
    case "stamped":
      return {
        tone: "success",
        title: "Tampon ajouté !",
        body: "Votre commande vous offre un tampon sur votre passeport de fidélité.",
      };
    case "order_invalid":
      return {
        tone: "info",
        title: "Carte déjà servie",
        body: "Cette carte a déjà offert son tampon, ou elle n'est plus valide. Votre passeport, lui, reste ouvert.",
      };
    default:
      return messageForStampState(state);
  }
}
