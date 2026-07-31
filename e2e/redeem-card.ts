/**
 * Ce que dit la carte de caisse quand un code est CONSOMMÉ.
 *
 * Depuis le 2026-07-31 elle en dit deux choses, et c'est délibéré :
 *
 *   · « ✓ Remise enregistrée — remettez le lot au client » dans les 90 s qui
 *     suivent le geste du caissier ;
 *   · « ⚠ Déjà remis/récupéré le … » ensuite.
 *
 * Auparavant les deux situations s'affichaient à l'identique : un caissier qui
 * validait une remise obtenait, mot pour mot et couleur pour couleur, l'écran
 * d'un refus. Celui qui reprenait le poste hésitait à donner le lot.
 *
 * Les specs de caisse cherchaient le second texte. Ils doivent accepter les
 * deux : joués d'affilée ils voient la confirmation, rejoués plus tard sur une
 * base non réarmée ils verraient l'avertissement. Les deux valent « ce code est
 * consommé », qui est ce qu'ils vérifient réellement.
 *
 * UN SEUL ENDROIT, et non une regex recopiée dans quatre fichiers : le jour où
 * le libellé bouge encore, il bouge ici.
 */
export const CODE_CONSOMME = /Remise enregistrée|Déjà remis|Déjà récupéré/;
