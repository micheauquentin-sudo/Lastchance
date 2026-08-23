import type { VitrineCarteView } from "@/lib/vitrine";

/**
 * VIT-12 — QUAND UNE VITRINE A LE DROIT D'ENTRER DANS UN MOTEUR.
 *
 * ── TROIS CONDITIONS, ET AUCUNE N'EST FACULTATIVE ──
 *
 *   1. `published` — l'adresse est ouverte ;
 *   2. `indexable` — le commerçant l'a explicitement demandé ;
 *   3. COMPLÈTE — il y a réellement quelque chose à indexer.
 *
 * La troisième vit ici et non en base : « complète » est un jugement de
 * produit qui bougera, et un `check` l'aurait figé au point de rendre une
 * vitrine inenregistrable le jour où le critère change. Un trigger aurait fait
 * pire : décocher la case du commerçant dans son dos parce qu'il a supprimé un
 * plat.
 *
 * ── POURQUOI LA COMPLÉTUDE EST UNE CONDITION ──
 *
 * Une page indexée qui ne porte qu'un nom et une carte vide est ce qu'un
 * moteur appelle du contenu mince : elle dessert le commerce plutôt que de le
 * servir, et elle promet au visiteur une carte qu'il ne trouvera pas. Mieux
 * vaut ne pas y être.
 *
 * ── CE QUE LE RETRAIT PROMET, ET CE QU'IL NE PROMET PAS ──
 *
 * Décocher la case remet `noindex` au chargement suivant : c'est immédiat
 * CÔTÉ APPLICATION. L'oubli par les moteurs, lui, ne se commande pas — il
 * dépend de leur prochaine visite. L'écran le dit ; il ne promet pas un
 * effacement qu'il ne contrôle pas.
 */

/** Le minimum pour qu'une carte vaille d'être trouvée. */
export const VITRINE_FICHES_MIN_INDEXATION = 3;

export interface EtatIndexation {
  /** L'indexation est-elle réellement servie ? */
  indexee: boolean;
  /** Ce qui manque, en une phrase, ou `null` si tout est là. */
  manque: string | null;
}

/** Combien de fiches, toutes cartes actives confondues. */
export function compterFiches(cartes: readonly VitrineCarteView[]): number {
  return cartes.reduce(
    (total, carte) =>
      total +
      carte.categories.reduce(
        (sous, rubrique) => sous + rubrique.fiches.length,
        0,
      ),
    0,
  );
}

/**
 * L'état d'indexation d'une vitrine, et ce qui lui manque.
 *
 * L'ORDRE DES REFUS EST CELUI DES GESTES : on ne demande pas au commerçant
 * d'étoffer sa carte avant de lui dire qu'il n'a pas publié.
 */
export function etatIndexation(input: {
  published: boolean;
  indexable: boolean;
  accroche: string | null;
  cartes: readonly VitrineCarteView[];
}): EtatIndexation {
  if (!input.published) {
    return { indexee: false, manque: "Votre vitrine n'est pas encore publiée." };
  }
  if (!input.accroche || !input.accroche.trim()) {
    return {
      indexee: false,
      manque:
        "Il manque l'accroche : c'est elle que Google affiche sous votre nom.",
    };
  }

  const fiches = compterFiches(input.cartes);
  if (fiches < VITRINE_FICHES_MIN_INDEXATION) {
    return {
      indexee: false,
      manque: `Il faut au moins ${VITRINE_FICHES_MIN_INDEXATION} fiches à votre carte — vous en avez ${fiches}.`,
    };
  }

  if (!input.indexable) {
    return {
      indexee: false,
      manque:
        "Tout est prêt : il ne manque que votre accord pour être trouvable.",
    };
  }

  return { indexee: true, manque: null };
}

/**
 * Les données structurées d'un lieu, pour un moteur.
 *
 * ── CE QU'ELLES NE DISENT PAS, ET C'EST LE POINT ──
 *
 * Ni note, ni avis, ni prix, ni disponibilité, ni horaires structurés. Le
 * cahier l'interdit — « ne jamais publier dans Google une disponibilité, un
 * prix, un avis ou une note qui ne serait pas exact » — et la raison tient en
 * une phrase : ces quatre-là changent plus vite que l'index. Une note inventée
 * est une fraude ; un prix périmé affiché dans un résultat de recherche est
 * une promesse que le comptoir devra refuser.
 *
 * `hasMenu` pointe la page elle-même : la carte EST à cette adresse, et un
 * moteur qui suit le lien lit ce que le client lit.
 */
export function donneesStructureesVitrine(input: {
  nom: string;
  accroche: string | null;
  url: string;
  image: string | null;
}): Record<string, unknown> {
  const document: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: input.nom,
    url: input.url,
    hasMenu: input.url,
  };
  if (input.accroche?.trim()) document.description = input.accroche.trim();
  if (input.image) document.image = input.image;
  return document;
}
