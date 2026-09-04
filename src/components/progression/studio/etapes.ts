/**
 * LES CINQ ÉTAPES DU STUDIO DE LA MÉTA-PROGRESSION (VIT-50).
 *
 * ── CINQ, ALORS QUE L'ESQUISSE EN PROPOSAIT DIX ──
 *
 * Le découpage proposé portait `saison`, `missions`, `declencheurs`, `cles`,
 * `coffres`, `collections`, `pieces`, `badges`, `passeport`, `lancer`. Cinq
 * sont tombées, chacune pour une raison MÉCANIQUE et non de goût — c'est le
 * motif d'ADR-160 : une étape qui n'a pas de réglage à elle n'existe pas.
 *
 *  · `declencheurs` et `cles` sont des CHAMPS de la mission, pas des surfaces.
 *    `updateProgressionMission` réécrit onze colonnes en bloc et pousse une
 *    NOUVELLE version de règle au journal immuable. Les séparer aurait exigé
 *    trois formulaires miroirs sur une même ligne (ADR-157), pour un gain nul :
 *    « ce qui fait avancer » et « ce que ça rapporte » se lisent sur la même
 *    ligne parce qu'ils se décident ensemble — un palier sans sa dotation ne
 *    veut rien dire. Une étape « les clés » aurait affiché le même formulaire
 *    sous un titre qui promet un réglage distinct.
 *  · `pieces` n'est pas disjointe de `collections` : un objet n'existe QUE dans
 *    sa collection, et `CollectionBlock` le rend déjà à l'intérieur d'elle. Une
 *    seconde étape aurait dû re-rendre toutes les collections pour y accrocher
 *    leurs objets — une redite, pas une découpe.
 *  · `passeport` n'a AUCUN réglage. Ce que le joueur voit est intégralement
 *    dérivé des missions, coffres, collections et badges : il n'existe pas une
 *    colonne à régler pour cet écran. C'est exactement ce que la colonne
 *    d'aperçu montre déjà, en permanence et sur les cinq étapes.
 *  · `saison` n'en a pas davantage : il n'existe PAS de
 *    `updateProgressionSeason`. Le nom et les dates se fixent à la création et
 *    ne se corrigent jamais. L'étape aurait montré trois valeurs en lecture
 *    seule sous un titre qui promet de les régler. La saison n'est donc pas une
 *    étape : elle est le SUJET du studio, comme un identifiant de calendrier.
 *  · `lancer` a fusionné dans `verification` — voir plus bas.
 *
 * ── L'ORDRE EST IMPOSÉ PAR LES DÉPENDANCES, PAS PAR LA LECTURE ──
 *
 * Une mission peut octroyer un badge et un objet ; un coffre ne peut se créer
 * SANS objet (`ChestForm` refuse : « Créez d'abord au moins un objet de
 * collection »). Les badges et les collections précèdent donc les missions, qui
 * précèdent les coffres. C'est déjà l'ordre de `DraftConfiguration`, et ce
 * n'est pas un hasard : c'est le seul ordre dans lequel un commerçant qui
 * descend le fil ne tombe jamais sur un select vide.
 *
 * ── L'ÉTAPE DE VÉRIFICATION NE LANCE PAS, ET C'EST LE MÊME ARBITRAGE QUE LE
 *    PASSEPORT ──
 *
 * `AtelierVerificationFidelite` vérifie et RENVOIE vers l'écran de suivi, seul
 * endroit qui publie. Ici la raison est plus dure encore : le lancement
 * (`activateProgressionSeason`) vit dans `SeasonActions`, au coude à coude avec
 * `deleteProgressionSeason` et `endProgressionSeason`. Doubler le bouton de
 * lancement embarquerait son voisin destructif — ou séparerait un groupe qui se
 * lit ensemble, et l'on cliquerait « Lancer » sans avoir sous les yeux le
 * « Supprimer » qui dit ce qu'on abandonne.
 *
 * Et le lancement est DÉFINITIF : `draft → active → ended → archived` est un
 * aller simple, aucune RPC ne relance une saison close. Un geste irréversible
 * ne gagne rien à exister à deux endroits ; il perd la seule chose qui compte —
 * un seul endroit où l'on sait ce qu'on fait.
 *
 * L'étape mesure donc l'état RÉEL de la saison et renvoie au tableau de bord.
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_PROGRESSION = [
  {
    cle: "badges",
    titre: "Vos badges",
    resume: "Les distinctions que vos missions pourront décerner.",
  },
  {
    cle: "collections",
    titre: "Vos collections",
    resume: "L'album que le joueur remplit, et les pièces qui le composent.",
  },
  {
    cle: "missions",
    titre: "Vos missions",
    resume:
      "Ce qui fait avancer chaque mission, le palier à atteindre et ce qu'elle rapporte.",
  },
  {
    cle: "coffres",
    titre: "Vos coffres",
    resume: "Ce qu'ils coûtent en clés et les pièces qu'ils peuvent rendre.",
  },
  {
    cle: "verification",
    titre: "Je vérifie et je lance",
    resume: "Ce qu'il reste à faire avant d'ouvrir la saison à vos joueurs.",
  },
] as const;

export type EtapeStudioProgression =
  (typeof ETAPES_STUDIO_PROGRESSION)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`). Elles
 * restent exportées d'ici parce que c'est ce nom-là que les gardes cherchent —
 * un libellé recopié dans un test divergerait au premier renommage, et la garde
 * chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioProgression(
  brut: string | null | undefined,
): EtapeStudioProgression {
  return parseEtape(ETAPES_STUDIO_PROGRESSION, brut);
}

export function libelleEtapeStudioProgression(
  cle: EtapeStudioProgression,
): string {
  return libelleEtape(ETAPES_STUDIO_PROGRESSION, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioProgression>[] =
  ETAPES_STUDIO_PROGRESSION;
void _contrat;
