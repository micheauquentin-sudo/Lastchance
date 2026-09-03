import type { EtatQuiz } from "@/components/quiz/studio/etat";

/**
 * LA CHARGE UTILE D'`updateQuiz` — rendue EN ENTIER, à chaque rendu, sur les
 * HUIT étapes (VIT-41).
 *
 * ── C'EST LE SEUL ENDROIT DE L'ÉCRAN QUI PORTE UN `name` ──
 *
 * Aucun contrôle visible n'en porte. Les champs, les tuiles de thème et les
 * boutons de la colonne de gauche écrivent dans `EtatQuiz` ; ce composant
 * traduit cet état en formulaire. La conséquence est celle qu'on cherche :
 * **il n'existe aucun chemin par lequel un champ pourrait manquer**, quelle que
 * soit l'étape ouverte, parce qu'aucun champ ne dépend d'une étape pour
 * exister.
 *
 * ── ET C'EST TOUT L'ENJEU DE CE MODULE ──
 *
 * `updateQuiz` écrit `intro_text: parsed.data.intro_text || null` sans jamais
 * regarder si le champ était là : un formulaire qui ne le rend pas EFFACE la
 * consigne d'accueil. C'est écrit noir sur blanc dans `atelier-quiz-etapes.ts`
 * — « `updateQuiz` exige name + theme et EFFACE `intro_text` s'il n'est pas
 * rendu : les trois voyagent donc ensemble dans « Le quiz » » — et c'est la
 * raison pour laquelle l'atelier n'a jamais pu séparer le nom de l'habillage.
 *
 * Découper l'écran en huit rouvre ce piège sous sa pire forme : une étape qu'on
 * quitte est DÉMONTÉE, donc régler le lot depuis « Le lot et son stock »
 * effacerait la consigne écrite dans « L'habillage ». Rien ne le signalerait —
 * l'action répondrait « Enregistré. » en faisant autre chose que ce qu'on
 * croit.
 *
 * ── `code_ttl_days` EST LE CHAMP QUE `has()` DÉCIDE ──
 *
 * Côté serveur il est lu par `formData.has("code_ttl_days")` et non `get()`,
 * parce que le VIDE y est une valeur LÉGITIME — « sans limite ». Champ absent
 * ⇒ colonne intacte ; champ présent et vide ⇒ colonne effacée. Il est donc
 * rendu TOUJOURS et sans condition, et c'est ICI qu'il l'est : `CodeTtlDaysField`
 * reçoit `champCache={false}` dans l'étape « Le lot », sans quoi son champ
 * vivrait dans une étape démontable, hors du formulaire de réglages, et ne
 * partirait jamais.
 *
 * ── CE QUI N'EST PAS ICI, ET POURQUOI ──
 *
 * La DOTATION (sept colonnes) et le PARTAGE (un booléen) ne passent pas par ce
 * formulaire : `updateQuizReward` prend un objet typé et non une `FormData`, et
 * `updateQuizShareInvite` est délibérément un formulaire SÉPARÉ — les deux
 * écrivent la même ligne `quizzes`, et un champ commun ferait qu'enregistrer
 * les réglages réécrirait le drapeau de partage, ou l'inverse, selon celui qui
 * poste en dernier.
 */
export function ChampsCachesQuiz({
  id,
  etat,
}: {
  id: string;
  etat: EtatQuiz;
}) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={etat.name} />
      <input type="hidden" name="theme" value={etat.theme} />
      <input type="hidden" name="public_slug" value={etat.public_slug} />
      {/* TOUJOURS RENDU, même vide : `updateQuiz` écrit `intro_text || null`
          sans regarder si le champ existait. Voir l'en-tête. */}
      <input type="hidden" name="intro_text" value={etat.intro_text} />
      {/* TOUJOURS RENDU, même vide : `formData.has("code_ttl_days")` est la
          seule chose qui distingue « sans limite » d'un formulaire qui ne règle
          pas l'échéance. Voir l'en-tête. */}
      <input
        type="hidden"
        name="code_ttl_days"
        value={etat.code_ttl_days.trim()}
      />
    </>
  );
}
