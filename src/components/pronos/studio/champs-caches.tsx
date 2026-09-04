import { ttlContestSecondes } from "@/components/pronos/contest-code-ttl";
import type { EtatContest } from "@/components/pronos/studio/etat";

/**
 * LA CHARGE UTILE D'`updateContest` — rendue EN ENTIER, à chaque rendu, sur les
 * HUIT étapes (VIT-43).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE UN `name` ──
 *
 * Aucun contrôle visible n'en porte. Les champs, les tuiles de thème et les
 * cases à cocher de la colonne de gauche écrivent dans `EtatContest` ; ce
 * composant traduit cet état en formulaire. La conséquence est celle qu'on
 * cherche : **il n'existe aucun chemin par lequel un champ pourrait manquer**,
 * quelle que soit l'étape ouverte, parce qu'aucun champ ne dépend d'une étape
 * pour exister.
 *
 * ── LES TROIS DISCRIMINANTS QUE L'ACTION ATTEND ──
 *
 * `updateContest` sert TROIS formulaires distincts de l'atelier, et il les
 * reconnaît à des champs cachés. Les rendre est ce qui rend la fusion possible ;
 * en oublier un ne casse rien, ce qui est bien pire.
 *
 * 1. `collection_settings="1"`. Sans lui, l'action lit `undefined` pour les
 *    deux booléens et laisse les colonnes tranquilles. AVEC lui, elle lit
 *    `formData.get("collect_email") === "on"` : une case décochée doit donc
 *    rendre un champ PRÉSENT et non « on », jamais un champ absent — c'est ce
 *    que fait `value={… ? "on" : ""}`. Un champ retiré vaudrait « ne touche
 *    pas », et décocher n'aurait aucun effet.
 * 2. `fond_key`, TOUJOURS rendu. `''` (« suivre le thème ») est une valeur
 *    LÉGITIME et même le défaut : l'action le lit par `formData.has(...)`
 *    précisément parce que `get() ?? ""` ne saurait pas la distinguer d'un
 *    champ absent.
 * 3. `code_ttl_seconds`, rendu SEULEMENT si la durée en base se laisse écrire
 *    en jours entiers. C'est le seul champ CONDITIONNEL de cette charge, et
 *    c'est délibéré : voir l'en-tête de `contest-code-ttl.ts`. Champ absent ⇒
 *    colonne intacte ; champ présent et vide ⇒ « sans limite ».
 *
 * `theme` se lit NUEMENT côté serveur (le schéma replie déjà `null` sur
 * l'absence) : il n'a pas de garde à rendre, juste une valeur.
 *
 * ── CE QUI N'EST PAS ICI, ET POURQUOI ──
 *
 * `status` et `reason` n'entrent JAMAIS dans cette charge. Le studio
 * enregistre tout seul ; un `status` rendu en champ caché ferait rejouer une
 * transition à chaque frappe — et `set_contest_status` est idempotente, donc
 * personne ne le verrait. `ContestStatusControls` garde ses propres
 * formulaires, un par transition, comme sur le tableau de bord.
 *
 * Le barème, les lots, la subsidiaire et les réglages d'événement ne passent
 * pas non plus par ici : ils ont chacun leur action, leur RPC gardée et leur
 * champ « motif ». Les mêler à cette charge aurait voulu dire réécrire quatre
 * actions serveur pour arranger un écran.
 */
export function ChampsCachesContest({
  id,
  etat,
  /** La durée en base se laisse-t-elle écrire en jours entiers ? */
  ttlEditable,
}: {
  id: string;
  etat: EtatContest;
  ttlEditable: boolean;
}) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={etat.name} />
      {/* LE DISCRIMINANT DES DEUX BOOLÉENS. Voir l'en-tête : sans lui, aucune
          des deux cases ne s'enregistre jamais. */}
      <input type="hidden" name="collection_settings" value="1" />
      <input
        type="hidden"
        name="collect_email"
        value={etat.collect_email ? "on" : ""}
      />
      <input
        type="hidden"
        name="collect_phone"
        value={etat.collect_phone ? "on" : ""}
      />
      <input type="hidden" name="theme" value={etat.theme} />
      {/* TOUJOURS RENDU, même vide : `''` veut dire « suivre le thème », et
          l'action le lit par `has()`. */}
      <input type="hidden" name="fond_key" value={etat.fond_key} />
      {/* LE SEUL CHAMP CONDITIONNEL, et c'est ce qui protège une durée que ce
          formulaire ne sait pas représenter. */}
      {ttlEditable ? (
        <input
          type="hidden"
          name="code_ttl_seconds"
          value={ttlContestSecondes(etat.code_ttl_days)}
        />
      ) : null}
    </>
  );
}
