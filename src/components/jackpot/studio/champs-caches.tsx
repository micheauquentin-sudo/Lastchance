import {
  chargeReglagesCagnotte,
  type EtatCagnotte,
} from "@/components/jackpot/studio/etat";

/**
 * LA CHARGE UTILE D'`updateJackpotCampaign` — rendue EN ENTIER, à chaque rendu,
 * sur les HUIT étapes (VIT-44).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE UN `name` ──
 *
 * Aucun contrôle visible n'en porte. Les champs, les boutons radio et les
 * `<select>` de la colonne de gauche écrivent dans `EtatCagnotte` ; ce composant
 * traduit cet état en formulaire. La conséquence est celle qu'on cherche :
 * **il n'existe aucun chemin par lequel un champ pourrait manquer**, quelle que
 * soit l'étape ouverte, parce qu'aucun champ ne dépend d'une étape pour exister.
 *
 * ── ET C'EST TOUT L'ENJEU DE CE MODULE ──
 *
 * `updateJackpotCampaign` fait un `.update(campaignFieldsForMode(...))` de
 * TOUTES ses colonnes. Un champ non rendu n'y est pas « absent » : il prend le
 * défaut de son schéma, et l'action l'écrit. Trois valent la peine d'être
 * nommées, parce que les trois sont MUETTES :
 *
 *  · `public_slug` — `publicSlugSchema` est `.nullable().default(null)` : le
 *    champ manquant vide l'adresse lisible, et tous les QR imprimés et collés
 *    en vitrine cessent de mener quelque part ;
 *  · `reward_label` — `texteOptionnel` rend `""` : le lot s'efface, et
 *    l'activation de la cagnotte se voit refusée sans qu'on comprenne pourquoi ;
 *  · `display_base` / `display_increment` — `nonRenduVaut(…, 0)` : le compteur
 *    qui chauffe la salle retombe à zéro.
 *
 * Aucun des trois ne fait rougir quoi que ce soit. L'action répond
 * « Enregistré », et elle dit vrai. C'est la raison — écrite noir sur blanc
 * dans `atelier-jackpot-etapes.ts` — pour laquelle la carte de réglages de
 * l'atelier n'a JAMAIS été découpée : un découpage y aurait exigé que chaque
 * morceau reposte les champs des autres en caché, et deux miroirs sur les mêmes
 * colonnes sont deux ÉCRIVAINS CONCURRENTS dès qu'ils sont à l'écran ensemble.
 *
 * Le socle rend le découpage possible SANS un seul miroir : un état, une
 * traduction, aucun `name` visible.
 *
 * ── `code_ttl_days` EST LE CHAMP QUE `has()` DÉCIDE ──
 *
 * Côté serveur il est lu par `formData.has("code_ttl_days")` et non `get()`,
 * parce que le VIDE y est une valeur LÉGITIME — « sans limite ». Champ absent
 * ⇒ colonne intacte ; champ présent et vide ⇒ colonne effacée. Il est donc
 * rendu TOUJOURS et sans condition, et c'est ICI qu'il l'est :
 * `CodeTtlDaysField` reçoit `champCache={false}` dans l'étape « Comment on
 * participe », sans quoi son champ vivrait dans une étape démontable, hors du
 * formulaire de réglages, et ne partirait jamais.
 */
export function ChampsCachesCagnotte({
  id,
  etat,
}: {
  id: string;
  etat: EtatCagnotte;
}) {
  const charge = chargeReglagesCagnotte(id, etat);
  return (
    <>
      {Object.entries(charge).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
    </>
  );
}
