import type { EtatChasse } from "@/components/hunts/studio/etat";

/**
 * LA CHARGE UTILE DU STUDIO DE LA CHASSE — rendue EN ENTIER, à chaque rendu,
 * sur les SEPT étapes (VIT-40).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE UN `name` DE RÉGLAGE ──
 *
 * Aucun contrôle visible n'en porte. Les champs, les boutons radio et les
 * curseurs de la colonne de gauche écrivent dans `EtatChasse` ; ce composant
 * traduit cet état en formulaire. La conséquence est celle qu'on cherche :
 * **il n'existe aucun chemin par lequel un champ pourrait manquer**, quelle
 * que soit l'étape ouverte, parce qu'aucun champ ne dépend d'une étape pour
 * exister.
 *
 * (Les formulaires des ÉTAPES DE LA CHASSE — libellé, indice, suppression —
 * portent bien des `name` visibles, et c'est normal : ils appartiennent à
 * `updateHuntStep` / `deleteHuntStep`, atomiques par étape, et vivent hors de
 * ce formulaire-ci.)
 *
 * ── ET C'EST TOUT L'ENJEU DE CE MODULE ──
 *
 * `updateHunt` lit NEUF champs d'un seul `FormData` et réécrit la ligne en
 * bloc : un champ absent est ÉCRASÉ. C'est la raison pour laquelle l'atelier
 * historique empile le nom, l'ordre, le délai, la fenêtre et le lot sur une
 * seule étape — découper cet écran en pages navigables aurait effacé le lot
 * final en réglant les dates. Rien ne l'aurait signalé : l'action aurait
 * répondu « Enregistré. » en faisant autre chose que ce qu'on croit.
 *
 * ── LE CHAMP QUE `has()` DÉCIDE ──
 *
 * `code_ttl_days` est lu côté serveur par `formData.has()` et non `get()`,
 * parce que le VIDE y est une valeur LÉGITIME — « sans limite ». Champ absent
 * ⇒ colonne intacte ; champ présent et vide ⇒ colonne effacée. Il est donc
 * rendu TOUJOURS et sans condition : l'omettre une seule fois rendrait
 * impossible de revenir à « sans limite », et le rendre par intermittence
 * ferait dépendre le sens d'un enregistrement de l'étape qu'on regardait.
 */
export function ChampsCachesChasse({
  id,
  etat,
}: {
  id: string;
  etat: EtatChasse;
}) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={etat.name} />
      <input type="hidden" name="order_mode" value={etat.order_mode} />
      <input
        type="hidden"
        name="min_scan_interval_seconds"
        value={etat.min_scan_interval_seconds}
      />
      <input type="hidden" name="reward_label" value={etat.reward_label} />
      <input type="hidden" name="reward_details" value={etat.reward_details} />
      <input type="hidden" name="reward_stock" value={etat.reward_stock} />
      {/* TOUJOURS RENDUS, même vides : vide = « sans borne », et l'action
          convertit avec le fuseau de l'établissement. Les omettre une étape
          durant rouvrirait la fenêtre de jeu sans un mot. */}
      <input type="hidden" name="starts_at" value={etat.starts_at} />
      <input type="hidden" name="ends_at" value={etat.ends_at} />
      {/* TOUJOURS RENDU, même vide — voir l'en-tête (`has()` côté action). */}
      <input
        type="hidden"
        name="code_ttl_days"
        value={etat.code_ttl_days.trim()}
      />
    </>
  );
}
