import type { EtatCalendrier } from "@/components/calendar/studio/etat";

/**
 * LA CHARGE UTILE DU STUDIO DU CALENDRIER — rendue EN ENTIER, à chaque rendu,
 * sur les HUIT étapes (VIT-39).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE UN `name` ──
 *
 * Aucun contrôle visible n'en porte. Les champs, les tuiles de thème et les
 * curseurs de la colonne de gauche écrivent dans `EtatCalendrier` ; ce
 * composant traduit cet état en formulaire. La conséquence est celle qu'on
 * cherche : **il n'existe aucun chemin par lequel un champ pourrait manquer**,
 * quelle que soit l'étape ouverte, parce qu'aucun champ ne dépend d'une étape
 * pour exister.
 *
 * ── ET C'EST TOUT L'ENJEU DE CE MODULE ──
 *
 * `updateCalendar` lit TREIZE champs d'un seul `FormData` et réécrit la ligne
 * en bloc : un champ absent est ÉCRASÉ. C'est la raison pour laquelle
 * l'atelier historique n'a jamais eu qu'une étape « Les réglages »,
 * INDIVISIBLE — découper l'écran en pages navigables aurait effacé le thème en
 * réglant les dates. Rien ne l'aurait signalé : l'action aurait répondu
 * « Enregistré. » en faisant autre chose que ce qu'on croit.
 *
 * ── LES DEUX CHAMPS QUE `has()` DÉCIDE ──
 *
 * `fond_key` et `code_ttl_days` sont lus côté serveur par `formData.has()` et
 * non `get()`, parce que le VIDE y est une valeur LÉGITIME — « suivre le
 * thème » et « sans limite ». Champ absent ⇒ colonne intacte ; champ présent et
 * vide ⇒ colonne effacée. Ils sont donc rendus TOUJOURS et sans condition : les
 * omettre une seule fois rendrait impossible de revenir à « suivre le thème »,
 * et les rendre par intermittence ferait dépendre le sens d'un enregistrement
 * de l'étape qu'on regardait.
 *
 * ── `confirm_day_loss` N'EST PAS DANS L'ÉTAT, ET C'EST DÉLIBÉRÉ ──
 *
 * C'est un consentement ponctuel à UN envoi, pas un réglage. Le mettre dans
 * `EtatCalendrier` l'aurait fait relancer l'enregistrement automatique — donc
 * poster la réduction de grille à l'instant même où le commerçant coche la
 * case, sans qu'il ait cliqué. Il arrive donc en prop, et n'est rendu qu'une
 * fois coché.
 */
export function ChampsCachesCalendrier({
  id,
  etat,
  confirmeSuppression = false,
}: {
  id: string;
  etat: EtatCalendrier;
  /** Le commerçant a coché « je comprends » après un premier refus. */
  confirmeSuppression?: boolean;
}) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={etat.name} />
      <input type="hidden" name="theme" value={etat.theme} />
      {/* TOUJOURS RENDU, même vide : `formData.has("fond_key")` est la seule
          chose qui distingue « suivre le thème » d'un formulaire qui ne règle
          pas le fond. Voir l'en-tête. */}
      <input type="hidden" name="fond_key" value={etat.fond_key} />
      <input type="hidden" name="start_date" value={etat.start_date} />
      <input type="hidden" name="timezone" value={etat.timezone} />
      <input type="hidden" name="day_count" value={etat.day_count} />
      <input type="hidden" name="public_slug" value={etat.public_slug} />
      <input
        type="hidden"
        name="merchant_content"
        value={etat.merchant_content}
      />
      <input
        type="hidden"
        name="completion_reward_label"
        value={etat.completion_reward_label}
      />
      <input
        type="hidden"
        name="completion_reward_details"
        value={etat.completion_reward_details}
      />
      <input
        type="hidden"
        name="completion_reward_stock"
        value={etat.completion_reward_stock}
      />
      {/* TOUJOURS RENDU, même vide — même raison que `fond_key`. */}
      <input
        type="hidden"
        name="code_ttl_days"
        value={etat.code_ttl_days.trim()}
      />
      {confirmeSuppression ? (
        <input type="hidden" name="confirm_day_loss" value="1" />
      ) : null}
    </>
  );
}
