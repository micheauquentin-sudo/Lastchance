/**
 * HUIT MODULES, HUIT FORMES DE CONTRÔLE — UNE SEULE POUR LES TUILES.
 *
 * Les huit calculs « peut-on ouvrir ? » ne rendent pas la même chose :
 *  · quiz, calendrier, jackpot, événement portent un champ `bloquant` ;
 *  · roue, chasse, fidélité et pronostics rendent `{cle, ok, titre, detail}`
 *    sans plus — leur caractère bloquant est tranché par la table ci-dessous.
 *
 * Une tuile de page doit pourtant dire « complet » ou « il manque quelque
 * chose », et ce verdict n'a de sens que si l'on sait CE QUI BLOQUE. Recopier
 * la réponse dans chaque page ferait huit tables au lieu d'une, divergentes au
 * premier contrôle ajouté. Elle est donc ICI, une fois, commentée.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ──
 *
 * Il ne calcule aucun contrôle et n'en invente aucun : il reçoit ceux que les
 * modules d'activation produisent et se contente de leur attribuer un défaut
 * `bloquant` quand ils n'en portent pas. La vérité « ok / pas ok » reste chez
 * eux, seuls lecteurs des règles serveur.
 */
import type { PointControle } from "@/lib/activation/controle";

export type ModuleChecklist =
  | "roue"
  | "quiz"
  | "calendrier"
  | "chasse"
  | "fidelite"
  | "jackpot"
  | "evenement"
  | "pronostics";

/** Ce que les modules d'activation rendent — `bloquant` optionnel. */
export interface ControleBrut extends PointControle {
  bloquant?: boolean;
}

/** Ce que les tuiles consomment — `bloquant` toujours tranché. */
export interface ControleNormalise {
  cle: string;
  ok: boolean;
  titre: string;
  detail: string;
  bloquant: boolean;
}

/** Le module porte lui-même le champ : on le lit, on ne le redécide pas. */
const CHAMP = "champ" as const;

/**
 * QUI BLOQUE, PAR MODULE ET PAR CLÉ.
 *
 * « Bloquant » veut dire : tant que ce point est rouge, l'animation ne devrait
 * pas s'ouvrir aux joueurs. Il ne veut PAS dire « le serveur refuse » — la
 * plupart de ces gardes n'existent pas en base, et c'est justement pourquoi
 * l'écran les raconte. La règle appliquée ci-dessous est la même partout :
 * bloquant = « sans cela, le joueur ne peut pas jouer ou repart les mains
 * vides » ; non-bloquant = « cela se répare après, ou c'est un avertissement ».
 *
 * Une clé absente de la table est NON-BLOQUANTE : un contrôle ajouté demain à
 * un module doit apparaître dans la tuile sans jamais faire dire « il manque
 * quelque chose » à un écran que personne n'a relu.
 */
const DEFAUTS_BLOQUANT: Record<
  ModuleChecklist,
  typeof CHAMP | Readonly<Record<string, boolean>>
> = {
  // Les quatre modules qui tranchent déjà eux-mêmes.
  quiz: CHAMP,
  calendrier: CHAMP,
  jackpot: CHAMP,
  evenement: CHAMP,

  // La roue : sans mécanique réglée, sans défi complet, sans un lot gagnant
  // tirable ou avec un poids total nul, le client joue pour rien. Le QR et la
  // fenêtre de dates, eux, se règlent après — ils avertissent.
  roue: {
    mecanique: true,
    defi: true,
    "lot-gagnant": true,
    poids: true,
    qr: false,
    fenetre: false,
  },

  // La chasse : le parcours et le lot final sont les deux refus de
  // `setHuntStatus`. Le stock (facultatif — vide = illimité) et la date de fin
  // n'empêchent pas l'ouverture.
  chasse: {
    parcours: true,
    lot: true,
    stock: false,
    fenetre: false,
  },

  // Le passeport : un palier suffit à ouvrir, c'est la garde de
  // `setLoyaltyProgramStatus`. Un palier en pause ou un tour de roue offert
  // sans roue sont des avertissements — le programme tourne quand même.
  fidelite: {
    paliers: true,
    stock: false,
    roues: false,
  },

  // Les pronostics : la matière est le seul refus de `updateContest` depuis le
  // wagon 4 (`blocageActivationContest`) — ouvert sans un match ni une
  // question, /pronos/<slug> affiche une page vide. Les quatre autres points
  // (récompenses, échéances, subsidiaire, contact) avertissent : un
  // championnat sans palier de récompense reste un réglage légitime.
  //
  // Cette table a longtemps été VIDE, et le commentaire disait pourquoi :
  // « aucune précondition d'ouverture n'existe côté serveur ». C'était le fait,
  // et c'était le défaut FIA-2 — il est fermé, la table le suit.
  pronostics: {
    matiere: true,
  },
};

export function normaliserControles(
  module: ModuleChecklist,
  controles: readonly ControleBrut[],
): ControleNormalise[] {
  const table = DEFAUTS_BLOQUANT[module];
  return controles.map((c) => ({
    cle: c.cle,
    ok: c.ok,
    titre: c.titre,
    detail: c.detail,
    bloquant:
      table === CHAMP ? (c.bloquant ?? false) : (table[c.cle] ?? false),
  }));
}
