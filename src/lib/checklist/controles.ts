/**
 * DIX MODULES, DEUX FORMES DE CONTRÔLE — UNE SEULE POUR LES TUILES.
 *
 * Les dix calculs « peut-on ouvrir ? » ne rendent pas la même chose :
 *  · quiz, calendrier, jackpot, événement portent un champ `bloquant` ;
 *  · roue, chasse, fidélité, pronostics, vitrine et réserver rendent
 *    `{cle, ok, titre, detail}` sans plus — leur caractère bloquant est tranché
 *    par la table ci-dessous.
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
  | "pronostics"
  /**
   * VITRINE ET RÉSERVER SONT DEUX ENTRÉES, PAS QUATRE.
   *
   * Quatre modules ont été livrés (Vitrine, Réserver, Duo Miroir, Portrait de la
   * Bande) et les quatre sont couverts ici — mais cette union ne nomme pas des
   * FONCTIONNALITÉS, elle nomme des PAGES : une tuile est « un bloc de la page,
   * avec son rang », et le rang se lit de la position dans la liste.
   *
   * Or le Duo Miroir et le Portrait de la Bande n'ont pas de page à eux : ils
   * sont deux BLOCS de `/dashboard/vitrine`, réglés là, entre le catalogue et
   * les QR (`DuoEditeur`, `BandeEditeur`). Leur donner une entrée d'union aurait
   * fait rendre trois listes numérotées sur un seul écran — deux pastilles « 1 »
   * à quelques centimètres l'une de l'autre — et le rang aurait cessé de vouloir
   * dire quoi que ce soit. Leurs tuiles et leurs contrôles vivent donc dans
   * `vitrine`, à leur vraie place dans l'ordre de la page.
   */
  | "vitrine"
  | "reserver";

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

  // La vitrine : sans adresse il n'y a pas de page, sans une fiche visible il y
  // a une page vide, et sous deux fiches épinglées le Duo Miroir disparaît de la
  // vitrine — trois façons pour le client de repartir les mains vides.
  //
  // `publiee` n'est PAS bloquant, et pas par indulgence : « ouvrir aux joueurs »
  // est exactement ce que publier veut dire, donc en faire une précondition de
  // l'ouverture serait une tautologie. Il avertit, là où il sert : sur le bloc
  // des QR, avant l'impression.
  //
  // Le Portrait de la Bande n'a AUCUNE clé ici, et c'en est la mesure : son seul
  // réglage a un défaut en base (`pack not null default 'amis'`) et trois replis
  // en TypeScript. Il n'existe pas d'état « pas configuré » à bloquer.
  vitrine: {
    adresse: true,
    catalogue: true,
    "duo-plateau": true,
    publiee: false,
  },

  // Réserver : rien à réserver, ou rien d'ouvert à venir, et le client repart
  // sans date. `places` (tout est complet) et `files-activite` (une file dite
  // « ouverte » que `queue_join` referme) avertissent — la première est une
  // salle pleine, pas une panne ; la seconde se répare en un clic.
  reserver: {
    activites: true,
    creneaux: true,
    places: false,
    "files-activite": false,
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
