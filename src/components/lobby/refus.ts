import type { CreateLobbyOutcome, JoinLobbyOutcome } from "@/actions/lobby";

/**
 * Les refus d'une salle, dits au joueur — cœur PUR (aucun JSX, aucun réseau).
 *
 * ── Pourquoi retraduire ce que l'action dit déjà ──
 *
 * Les actions rendent quatre refus BORNÉS, et ils sont déjà justes : une salle
 * indisponible, complète, fermée, ou un commerce au quota. Mais ils sont écrits
 * du point de vue de la SALLE, alors que le joueur, lui, tient un CODE dans la
 * main et n'a aucune idée de ce qu'est une salle qu'il n'a jamais vue. La phrase
 * qui l'aide lui parle de son code et de son prochain geste.
 *
 * ── LE DISCRIMINANT EST UN TYPE, PLUS UN FRAGMENT DE TEXTE ──
 *
 * Ce fichier classait autrefois les refus en cherchant des motifs dans le
 * MESSAGE de l'action (« complèt », « déjà fermé », « beaucoup de salles »).
 * C'était la seule chose que l'action exposât — et c'était une jointure par
 * hasard : reformuler une phrase là-bas faisait silencieusement retomber son
 * refus dans le cas générique, sans qu'aucun test ni aucun typecheck ne s'en
 * aperçoive. Les actions rendent désormais `data.etat`, un littéral que le
 * compilateur suit ; les deux unions ci-dessous en sont DÉRIVÉES, de sorte qu'un
 * cinquième refus ajouté côté serveur casse la compilation ici au lieu de
 * disparaître à l'écran.
 *
 * ── L'INDISTINCTION EST UNE PROPRIÉTÉ, PAS UN RACCOURCI ──
 *
 * Code inventé, code malformé, code expiré, salle close, commerce inconnu,
 * module fermé : la base et les actions les confondent tous sous un seul refus
 * (voir l'en-tête de `src/actions/lobby.ts`). L'écran leur donne donc LE MÊME
 * texte, sans quoi il rétablirait à l'affichage l'oracle qu'on a pris soin de
 * fermer en dessous.
 */

/** Les trois façons de ne pas ENTRER dans une salle. */
export type MotifRefusEntree = Exclude<
  JoinLobbyOutcome,
  { etat: "joined" }
>["etat"];

/** Les deux façons de ne pas OUVRIR une salle. */
export type MotifRefusCreation = Exclude<
  CreateLobbyOutcome,
  { etat: "cree" }
>["etat"];

/** Message d'un refus À L'ENTRÉE d'une salle (`/lobby/[code]`). */
export function messageRefusEntree(motif: MotifRefusEntree): string {
  switch (motif) {
    case "complet":
      return "Cette salle est complète. Demandez à l’hôte d’en ouvrir une plus grande.";
    case "verrouille":
      return "La partie a déjà commencé : la porte de cette salle est fermée.";
    case "indisponible":
      return "Ce code ne mène nulle part — vérifiez-le ou demandez-en un nouveau.";
  }
}

/** Message d'un refus À LA CRÉATION d'une salle (`/lobby/nouveau/[slug]`). */
export function messageRefusCreation(motif: MotifRefusCreation): string {
  switch (motif) {
    case "quota":
      return "Beaucoup de salles sont déjà ouvertes ici. Réessayez dans quelques minutes.";
    case "indisponible":
      return "Impossible d’ouvrir une salle ici pour le moment.";
  }
}
