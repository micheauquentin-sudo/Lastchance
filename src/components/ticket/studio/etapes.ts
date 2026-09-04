/**
 * LES CINQ ÉTAPES DU STUDIO DU TICKET D'OR (VIT-45).
 *
 * ── POURQUOI CINQ, ET NON SIX ──
 *
 * Le découpage proposé en portait une de plus, « Le détail de chaque lot
 * (libellé, description) ». Elle n'a pas été écrite : **un lot du Ticket d'Or
 * n'a pas de description**. `tickets_or_lots` porte quatre colonnes réglables —
 * `libelle`, `poids`, `stock`, `actif` — et rien d'autre (20261028120000). Son
 * seul « détail » est le libellé, qui est déjà ce qu'on saisit en ajoutant un
 * lot ; l'étape aurait donc montré une deuxième fois le même champ, sous un
 * titre qui promet un deuxième réglage inexistant.
 *
 * Une étape creuse n'est pas neutre : elle est un aller-retour dans le fil, et
 * un commerçant qui l'ouvre en repart en cherchant ce qu'il a raté. Inventer la
 * colonne manquante aurait demandé une migration — un autre lot, un autre
 * arbitrage.
 *
 * ── LES QUATRE PREMIÈRES SONT DISJOINTES, ET C'EST CE QUI LES RÉTIENT ──
 *
 * Chacune montre UNE colonne du lot, et une seule : le nom, le poids, le
 * stock, la case. Aucune n'est le sous-ensemble d'une autre — c'est ce qui
 * distingue un découpage d'une redite, et c'est le motif déjà retenu pour les
 * étapes de la chasse (« Mes étapes » montre les libellés, « Les indices »
 * montre les indices, jamais les deux).
 *
 * Elles répondent à quatre questions que le commerçant ne se pose PAS au même
 * moment : « qu'est-ce que j'offre » (à l'ouverture), « lequel sort le plus
 * souvent » (en réglant), « combien m'en reste-t-il » (après un réassort),
 * « lequel tourne cette semaine » (le lundi matin). Le tableau de bord, lui,
 * garde les quatre colonnes d'un coup — c'est son rôle, et VIT-45 n'y touche
 * pas.
 *
 * ── CE QUI RESTE DEHORS, ET POURQUOI CE N'EST PAS UN OUBLI ──
 *
 * « Remettre un ticket » — le QR et le code à faire scanner — N'ENTRE PAS dans
 * ce studio. C'est un geste de COMPTOIR, ouvert à tous les rôles y compris la
 * caisse (`gardeTicketOr` admet `cashier`), tandis que régler les lots est
 * réservé à `owner|editor` (`peutRegler`). L'absorber ferait entrer dans le
 * studio une autorisation qui n'est pas la sienne, exactement comme l'écran
 * comptoir de la fidélité et du jackpot, laissés dehors avec un simple lien
 * (ADR-159). L'étape de vérification en montre donc le LIEN, pas le bouton.
 *
 * Les mesures des trente derniers jours restent elles aussi au tableau de
 * bord : c'est du SUIVI, pas du réglage.
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_TICKET = [
  {
    cle: "lots",
    titre: "Mes lots",
    resume: "Ce que vos clients peuvent gagner : ajoutez, renommez, retirez.",
  },
  {
    cle: "chances",
    titre: "Les chances de sortie",
    resume:
      "Le poids de chaque lot — une part relative au total, jamais un pourcentage.",
  },
  {
    cle: "stock",
    titre: "Le stock disponible",
    resume:
      "Combien il reste de chaque lot. Vide = illimité ; zéro = épuisé, donc hors tirage.",
  },
  {
    cle: "actifs",
    titre: "Les lots qui tournent aujourd'hui",
    resume:
      "Couper un lot sans le supprimer : il reste enregistré mais ne sort plus.",
  },
  {
    cle: "verification",
    titre: "Vérifier qu'un lot peut sortir",
    resume:
      "Ce qui doit être vrai pour qu'un ticket ouvert donne quelque chose, et où remettre un ticket.",
  },
] as const;

export type EtapeStudioTicket = (typeof ETAPES_STUDIO_TICKET)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`). Elles
 * restent exportées d'ici parce que c'est ce nom-là que les gardes cherchent —
 * un libellé recopié dans un test divergerait au premier renommage, et la garde
 * chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioTicket(
  brut: string | null | undefined,
): EtapeStudioTicket {
  return parseEtape(ETAPES_STUDIO_TICKET, brut);
}

export function libelleEtapeStudioTicket(cle: EtapeStudioTicket): string {
  return libelleEtape(ETAPES_STUDIO_TICKET, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioTicket>[] =
  ETAPES_STUDIO_TICKET;
void _contrat;
