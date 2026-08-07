import {
  definitionEtape,
  hrefEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";

/**
 * LES QUATRE ÉTAPES DE L'ATELIER DE LA SOIRÉE.
 *
 * Le Mode événement est l'inverse exact du jackpot : il porte DÉJÀ quatre
 * actions granulaires — `updateEventGame` n'écrit que `name`, les questions ont
 * leur triplet par ligne, les sessions le leur. Le découpage ne coûte donc
 * aucun champ caché et aucune action nouvelle.
 *
 * ── LA COUPE PASSE AU MILIEU DES SESSIONS ──
 *
 * La carte « Sessions en direct » mélangeait ce qu'on PRÉPARE (étiquette, lot,
 * détails, stock, échéance) et ce qu'on ANIME (code d'accès, QR imprimable,
 * « Piloter », « Écran », compteur d'ouvertures). L'atelier ne garde que la
 * préparation ; le reste vit sur la page de suivi, où on l'ouvre le soir venu.
 *
 * Deux blocages internes que ce découpage n'a pas le droit de franchir :
 * `updateEventQuestion` écrit type + intitulé + temps + points + options d'un
 * seul tenant (`refineQuestion` couple le type et la bonne réponse), et
 * `updateEventSession` écrit étiquette + lot + détails + stock avec
 * `input.X ?? ""` — omettre le stock écrirait 0, c'est-à-dire « podium sans
 * lot », sans un mot.
 */
export type EtapeEvenement = "jeu" | "manches" | "soiree" | "verification";

export const ETAPES_EVENEMENT = [
  {
    cle: "jeu",
    titre: "Le jeu",
    resume: "Son nom — celui qui s'affiche sur l'écran de salle.",
  },
  {
    cle: "manches",
    titre: "Les manches",
    resume: "Les questions, leurs options et le temps de réponse.",
  },
  {
    cle: "soiree",
    titre: "La soirée",
    resume: "Les sessions, leur lot et le nombre de gagnants.",
  },
  {
    cle: "verification",
    titre: "La vérification",
    resume: "Ce qu'il reste à faire avant d'ouvrir le jeu.",
  },
] as const satisfies readonly EtapeAtelier[];

export function baseAtelierEvenement(gameId: string): string {
  return `/dashboard/events/${gameId}`;
}

export function hrefEtapeEvenement(gameId: string, cle: string): string {
  return hrefEtape(baseAtelierEvenement(gameId), cle);
}

/** Titre d'une étape, pour la nommer depuis la vérification. */
export function titreEtapeEvenement(cle: string): string {
  return definitionEtape(ETAPES_EVENEMENT, cle)?.titre ?? ETAPES_EVENEMENT[0].titre;
}
