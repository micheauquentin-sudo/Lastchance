import {
  VITRINE_CARTE_NOM_MAX,
  VITRINE_FICHE_DESCRIPTION_MAX,
  VITRINE_FICHE_NOM_MAX,
  VITRINE_PRIX_AFFICHE_MAX,
  VITRINE_RUBRIQUE_NOM_MAX,
} from "@/lib/vitrine";

/**
 * LE PARSEUR DE CARTE COLLÉE — heuristique, PUR, et jamais autonome.
 *
 * ── AUCUNE IA, ET C'EST LA DÉCISION, PAS UN REPLI ──
 *
 * Un modèle qui « comprend » une carte invente : il complète un prix manquant,
 * traduit un plat régional, devine un allergène. Sur une carte de restaurant,
 * une invention n'est pas une approximation — c'est un client à qui on sert du
 * gluten. Un parseur ligne à ligne, lui, se trompe de façon LISIBLE : il classe
 * mal, et le commerçant le voit dans l'aperçu.
 *
 * D'où la forme : ce module ne rend JAMAIS un import prêt à partir. Il rend une
 * liste de lignes CLASSÉES, que `import-carte.tsx` affiche, laisse re-classer et
 * corriger. La revue est l'écran, pas une case à cocher.
 *
 * ── CE QUI N'EST PAS DEVINÉ, ET NE LE SERA PAS ──
 *
 * Ni les badges, ni les allergènes, ni la disponibilité, ni les photos. Un badge
 * « fait maison » deviné est un argument commercial fabriqué par la plateforme ;
 * un allergène deviné est un risque sanitaire. Ils se posent fiche par fiche
 * ensuite, dans l'éditeur, par quelqu'un qui sait.
 *
 * Ce module ne touche ni au DOM ni à React : il est testable seul
 * (`import-parse.test.ts`), et c'est le seul endroit où l'heuristique vit.
 */

/**
 * LES BORNES SONT CELLES DU SERVEUR, IMPORTÉES — jamais recopiées.
 *
 * `12` et `120` écrits ici seraient une seconde source de vérité : le jour où
 * la RPC monte à 200 fiches, l'aperçu continuerait de refuser à 120 sans qu'un
 * seul test ne rougisse. Elles viennent donc du schéma qui les fait appliquer.
 */
export {
  VITRINE_IMPORT_FICHES_MAX,
  VITRINE_IMPORT_RUBRIQUES_MAX,
} from "@/lib/validations/vitrine";

/**
 * La rubrique ouverte d'office quand la carte commence par un plat.
 *
 * Le format `{rubriques: [{fiches}]}` n'a pas de place pour une fiche orpheline.
 * Plutôt que de jeter les premières lignes — ce sont souvent les plus
 * importantes — on ouvre une rubrique nommée, VISIBLE dans l'aperçu, que le
 * commerçant renomme ou re-classe.
 */
export const RUBRIQUE_PAR_DEFAUT = "Notre carte";

export type TypeLigne = "rubrique" | "fiche" | "ignorer";

export interface LigneImport {
  /** Clé stable de rendu et d'édition — l'index de la ligne d'origine. */
  cle: string;
  /** La ligne telle que collée, gardée pour que l'aperçu montre l'origine. */
  brut: string;
  type: TypeLigne;
  nom: string;
  description: string;
  prix: string;
}

export interface FicheImport {
  nom: string;
  description?: string;
  prix_affiche?: string;
}

export interface RubriqueImport {
  nom: string;
  fiches: FicheImport[];
}

export interface CarteImport {
  nom: string;
  rubriques: RubriqueImport[];
}

/**
 * UN PRIX AVEC SA DEVISE — le cas franc, et le plus fréquent.
 *
 * « 12 € », « 12,50€ », « 8.5 EUR », « à partir de 8 € ». La devise lève toute
 * ambiguïté : on accepte alors l'entier nu qui la précède.
 */
const PRIX_DEVISE =
  /(?:(?:à partir de|dès|a partir de)\s+)?\d{1,4}(?:[.,]\d{1,2})?\s*(?:€|EUR\b|euros?\b)\.?$/i;

/**
 * UN PRIX SANS DEVISE — accepté seulement s'il est DÉTACHÉ et DÉCIMAL.
 *
 * « Calzone 12,00 » et « Tartare — 18,50 » sont des prix ; « Menu 3 plats » ne
 * l'est pas, et « Burrata 125 g » encore moins. LA DÉCIMALE EST LE GARDE-FOU :
 * un entier nu en fin de ligne reste du texte — la ligne part alors en fiche
 * sans prix, que l'aperçu laisse compléter. C'est le sens de la restriction, et
 * c'est pourquoi on n'exige PAS de séparateur fort : une carte collée depuis un
 * PDF perd sa mise en colonne et rend « Calzone 12,00 », qu'il faut savoir lire.
 */
const PRIX_NU = /(?:[—–:\t]|\s)\s*(?:(?:à partir de|dès)\s+)?\d{1,4}[.,]\d{1,2}$/;

/** Les séparateurs « nom — description » d'une ligne de carte. */
const SEPARATEUR_DESCRIPTION = /\s+[—–]\s+|\s+-\s+|\s*:\s+|\t+/;

/** Au-delà, une ligne sans prix ne ressemble plus à un intitulé de rubrique. */
const LONGUEUR_RUBRIQUE_MAX = 32;

function couper(valeur: string, max: number): string {
  const propre = valeur.replace(/\s+/g, " ").trim();
  return propre.length > max ? propre.slice(0, max).trim() : propre;
}

/** Une ligne est-elle écrite tout en capitales ? (« ENTRÉES », « NOS PIZZAS ») */
function estEnMajuscules(texte: string): boolean {
  if (!/\p{L}/u.test(texte)) return false;
  return texte === texte.toLocaleUpperCase("fr");
}

/** Le prix trouvé en fin de ligne, et ce qui reste devant. */
function detacherPrix(ligne: string): { reste: string; prix: string } {
  for (const motif of [PRIX_DEVISE, PRIX_NU]) {
    const trouve = ligne.match(motif);
    if (!trouve) continue;
    const brut = trouve[0];
    return {
      // Le séparateur de mise en page qui PRÉCÈDE le prix ne fait pas partie
      // du nom : sans ce nettoyage, « Tartare — câpres — 14 € » finirait avec
      // une description « câpres — », tiret imprimé compris.
      reste: ligne
        .slice(0, trouve.index ?? 0)
        .replace(/[\s\-—–:.\t]+$/, "")
        .trim(),
      // Le séparateur capté par `PRIX_NU` (« — 12,50 ») n'appartient pas au
      // prix : c'est de la mise en page, et il finirait imprimé sur la carte.
      prix: couper(brut.replace(/^[\s—–:\t]+/, ""), VITRINE_PRIX_AFFICHE_MAX),
    };
  }
  return { reste: ligne.trim(), prix: "" };
}

/** « Nom — description » quand un séparateur le dit, sinon tout est le nom. */
function detacherDescription(texte: string): {
  nom: string;
  description: string;
} {
  const trouve = texte.match(SEPARATEUR_DESCRIPTION);
  if (!trouve || trouve.index === undefined || trouve.index === 0) {
    return { nom: texte, description: "" };
  }
  return {
    nom: texte.slice(0, trouve.index).trim(),
    description: texte.slice(trouve.index + trouve[0].length).trim(),
  };
}

/**
 * LA CARTE COLLÉE → DES LIGNES CLASSÉES. Rien de plus.
 *
 * Les lignes vides disparaissent — elles ne portent aucune information et
 * feraient de l'aperçu une liste à trous. Tout le reste survit : une ligne mal
 * classée reste une ligne visible, que le commerçant redresse en un clic. C'est
 * l'inverse d'un filtre silencieux, qui ferait perdre un plat sans le dire.
 */
export function analyserCarte(texte: string): LigneImport[] {
  const lignes: LigneImport[] = [];

  texte.split(/\r?\n/).forEach((brut, index) => {
    const ligne = brut.trim();
    if (!ligne) return;

    const { reste, prix } = detacherPrix(ligne);

    if (prix) {
      const { nom, description } = detacherDescription(reste || ligne);
      lignes.push({
        cle: `l${index}`,
        brut: ligne,
        type: "fiche",
        nom: couper(nom, VITRINE_FICHE_NOM_MAX),
        description: couper(description, VITRINE_FICHE_DESCRIPTION_MAX),
        prix,
      });
      return;
    }

    const finitParDeuxPoints = /:\s*$/.test(ligne);
    const sansDeuxPoints = ligne.replace(/\s*:\s*$/, "");
    const estRubrique =
      finitParDeuxPoints ||
      estEnMajuscules(ligne) ||
      sansDeuxPoints.length <= LONGUEUR_RUBRIQUE_MAX;

    if (estRubrique) {
      lignes.push({
        cle: `l${index}`,
        brut: ligne,
        type: "rubrique",
        nom: couper(sansDeuxPoints, VITRINE_RUBRIQUE_NOM_MAX),
        description: "",
        prix: "",
      });
      return;
    }

    // Longue, sans prix : le plus souvent un plat dont le prix est ailleurs
    // dans la mise en page d'origine. On la garde en fiche SANS prix — le prix
    // se complète dans l'aperçu — plutôt que de la jeter.
    const { nom, description } = detacherDescription(ligne);
    lignes.push({
      cle: `l${index}`,
      brut: ligne,
      type: "fiche",
      nom: couper(nom, VITRINE_FICHE_NOM_MAX),
      description: couper(description, VITRINE_FICHE_DESCRIPTION_MAX),
      prix: "",
    });
  });

  return lignes;
}

/**
 * LES LIGNES REVUES → LA CHARGE ENVOYÉE AU SERVEUR.
 *
 * Clés FERMÉES : `nom`, `rubriques[].nom`, `fiches[].nom` et, seulement quand
 * elles sont renseignées, `description` et `prix_affiche`. Ni photo, ni
 * disponibilité, ni badge, ni allergène — l'action serveur les refuse, et les
 * envoyer vides aurait fait croire ici qu'elles sont pilotables.
 */
export function construireImport(
  nomCarte: string,
  lignes: LigneImport[],
): CarteImport {
  const rubriques: RubriqueImport[] = [];

  const rubriqueCourante = (): RubriqueImport => {
    const derniere = rubriques[rubriques.length - 1];
    if (derniere) return derniere;
    const ouverte: RubriqueImport = { nom: RUBRIQUE_PAR_DEFAUT, fiches: [] };
    rubriques.push(ouverte);
    return ouverte;
  };

  for (const ligne of lignes) {
    if (ligne.type === "ignorer") continue;
    const nom = ligne.nom.trim();
    if (!nom) continue;

    if (ligne.type === "rubrique") {
      rubriques.push({
        nom: couper(nom, VITRINE_RUBRIQUE_NOM_MAX),
        fiches: [],
      });
      continue;
    }

    const fiche: FicheImport = { nom: couper(nom, VITRINE_FICHE_NOM_MAX) };
    const description = ligne.description.trim();
    if (description) {
      fiche.description = couper(description, VITRINE_FICHE_DESCRIPTION_MAX);
    }
    const prix = ligne.prix.trim();
    if (prix) fiche.prix_affiche = couper(prix, VITRINE_PRIX_AFFICHE_MAX);
    rubriqueCourante().fiches.push(fiche);
  }

  return { nom: couper(nomCarte, VITRINE_CARTE_NOM_MAX), rubriques };
}

/**
 * Les comptes AFFICHÉS, dérivés de la charge réellement envoyée.
 *
 * Compter les lignes de l'aperçu aurait donné un autre chiffre que le serveur —
 * la rubrique ouverte d'office, les lignes à nom vide — et c'est exactement le
 * genre d'écart qui fait refuser un import « pourtant dans les clous ».
 */
export function compterImport(
  nomCarte: string,
  lignes: LigneImport[],
): { rubriques: number; fiches: number } {
  const carte = construireImport(nomCarte, lignes);
  return {
    rubriques: carte.rubriques.length,
    fiches: carte.rubriques.reduce((n, r) => n + r.fiches.length, 0),
  };
}

/**
 * LES RUBRIQUES HOMONYMES — le refus que l'aperçu doit dire AVANT le clic.
 *
 * Le schéma serveur les rejette (`carteImporteeSchema.superRefine`), et l'import
 * est limité à quelques tentatives par heure : découvrir « deux rubriques
 * portent le même nom » après avoir consommé un jeton du seau, sur trente
 * lignes, revient à faire attendre le commerçant. Le nom est comparé APRÈS le
 * même détourage que côté serveur — sinon l'aperçu jugerait sur une chaîne que
 * le schéma ne verra jamais.
 */
export function rubriquesHomonymes(
  nomCarte: string,
  lignes: LigneImport[],
): string[] {
  const vus = new Set<string>();
  const doublons = new Set<string>();
  for (const rubrique of construireImport(nomCarte, lignes).rubriques) {
    if (vus.has(rubrique.nom)) doublons.add(rubrique.nom);
    vus.add(rubrique.nom);
  }
  return [...doublons];
}
