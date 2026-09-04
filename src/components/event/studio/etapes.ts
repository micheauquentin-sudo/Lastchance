/**
 * LES SEPT ÉTAPES DU STUDIO DE LA SOIRÉE (VIT-47).
 *
 * ── POURQUOI SEPT, ALORS QUE L'ATELIER N'EN A QUE QUATRE ──
 *
 * L'atelier n'en a jamais eu que quatre pour une raison mécanique, écrite noir
 * sur blanc dans `atelier-event-etapes.ts` : deux de ses actions écrivent leurs
 * champs D'UN SEUL TENANT.
 *
 *  1. `updateEventQuestion` écrit type + intitulé + temps + points + options en
 *     bloc, et `refineQuestion` croise le type et la bonne réponse ;
 *  2. `updateEventSession` lit ses quatre champs avec `input.X ?? ""` — omettre
 *     le stock écrit 0, c'est-à-dire « podium sans lot », en silence.
 *
 * Dans l'atelier, chaque étape est une NAVIGATION : `?etape=` recharge la page,
 * donc rend un formulaire NEUF, donc une charge utile amputée de tout ce qui
 * n'est pas à l'écran. Le socle des studios lève exactement cette contrainte
 * (VIT-38, ADR-154) : l'état vit en mémoire, aucun contrôle visible ne porte de
 * `name`, et chaque charge utile est CONSTRUITE EN ENTIER au moment de l'envoi,
 * quelle que soit l'étape affichée.
 *
 * ── « VOS QUESTIONS » ET « LE TEMPS DE RÉPONSE » SONT DEUX VUES, PAS DEUX ENVOIS ──
 *
 * C'est la nuance qui fait tenir la découpe, et c'est celle d'ADR-156.
 * `updateEventQuestion` reste INDIVISIBLE : type, intitulé, temps, points et
 * options partent toujours ensemble, en un seul appel, construit à un seul
 * endroit par `chargeRythmeEvenement`. Régler le chronomètre renvoie donc aussi
 * le type et la bonne réponse — sans les changer, et sans que le commerçant ait
 * à le savoir. Une étape qui n'aurait posté que le temps aurait transformé
 * chaque quiz en sondage à la première seconde retouchée : le schéma exige le
 * type, et un type absent n'est pas « inchangé », il est refusé — ou pire,
 * remplacé par le défaut.
 *
 * Même chose côté salles : « Les salles de la soirée » (l'étiquette) et « Le lot
 * et le nombre de gagnants » (lot, détails, stock, échéance) sont deux VUES de
 * la charge de `updateEventSession`, construite par `chargeSalleEvenement`.
 *
 * ── CE QUI N'EST PAS ENTRÉ, ET C'EST DÉLIBÉRÉ ──
 *
 * Le PILOTAGE reste dehors : « Piloter », l'écran de projection, le compteur
 * d'ouvertures en direct. `/dashboard/events/[id]/remote` est une console temps
 * réel tenue PENDANT la soirée ; le studio prépare, il n'anime pas. L'étape
 * « Le QR et le code d'accès » n'en garde que ce qui se prépare AVANT — l'affiche
 * à imprimer, le lien à envoyer, le code à lire à voix haute — et un simple lien
 * vers la console.
 *
 * ── L'ORDRE SUIT LA SOIRÉE, PAS LES TABLES ──
 *
 * On nomme, on écrit les questions, on règle leur rythme, on prépare les salles,
 * on décide du lot, on imprime le QR, on vérifie. Un découpage par action
 * serveur — updateEventGame, puis updateEventQuestion, puis updateEventSession —
 * aurait été plus simple à écrire et illisible : personne ne cherche « la charge
 * utile d'updateEventSession », on cherche « mon lot ».
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_SOIREE = [
  {
    cle: "nom",
    titre: "Le nom de votre soirée",
    resume:
      "Ce que vos clients liront en haut de leur téléphone et sur l'écran de salle.",
  },
  {
    cle: "questions",
    titre: "Vos questions",
    resume: "Ce que vous demanderez, dans l'ordre, et les réponses proposées.",
  },
  {
    cle: "rythme",
    titre: "Le temps de réponse et les points",
    resume: "Combien de secondes pour répondre, et ce que la question rapporte.",
  },
  {
    cle: "salles",
    titre: "Les salles de la soirée",
    resume: "Une salle par déroulé : son nom, et celle que vous préparez.",
  },
  {
    cle: "lot",
    titre: "Le lot et le nombre de gagnants",
    resume: "Ce que gagne le podium, en quelle quantité, et jusqu'à quand.",
  },
  {
    cle: "acces",
    titre: "Le QR et le code d'accès",
    resume: "L'affiche à imprimer et le code à lire à voix haute en salle.",
  },
  {
    cle: "verification",
    titre: "Vérification avant d'ouvrir",
    resume: "Ce qu'il reste à faire avant d'ouvrir le jeu aux joueurs.",
  },
] as const;

export type EtapeStudioSoiree = (typeof ETAPES_STUDIO_SOIREE)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`). Elles
 * restent exportées d'ici parce que c'est ce nom-là que les gardes cherchent —
 * un libellé recopié dans un test divergerait au premier renommage, et la garde
 * chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioSoiree(
  brut: string | null | undefined,
): EtapeStudioSoiree {
  return parseEtape(ETAPES_STUDIO_SOIREE, brut);
}

export function libelleEtapeStudioSoiree(cle: EtapeStudioSoiree): string {
  return libelleEtape(ETAPES_STUDIO_SOIREE, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioSoiree>[] =
  ETAPES_STUDIO_SOIREE;
void _contrat;
