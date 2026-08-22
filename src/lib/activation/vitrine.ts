import { DUO_OPTIONS_MIN_BASE } from "@/lib/duo";
import { DUO_OPTIONS_MIN_ECRAN } from "@/lib/validations/duo";
import type { PointControle } from "./controle";

/**
 * « CETTE VITRINE EST-ELLE LISIBLE PAR UN CLIENT ? » — EN FONCTION PURE.
 *
 * ── CE QUE LE SERVEUR VÉRIFIE, ET CE QU'IL NE VÉRIFIE PAS ──
 *
 * Rien. `ecrirePublication` (src/actions/vitrine.ts) est un `update({published})`
 * sans la moindre précondition métier : le seul refus possible vient du trigger
 * `vitrine_settings_guard_publication`, qui parle de l'OFFRE, pas de l'état de la
 * carte. Une vitrine sans une seule fiche se publie donc sans un mot, et le
 * client qui scanne le QR posé sur la table lit une page vide.
 *
 * C'est EXACTEMENT le défaut FIA-2 des pronostics, à ceci près qu'on ne le
 * referme pas ici : ce module ne pose aucune garde nouvelle, il RACONTE l'état
 * avant le geste. Poser la garde serveur demanderait de toucher
 * `src/actions/vitrine.ts`, ce que ce lot ne fait pas ; le champ `bloquant` de
 * `checklist/controles.ts` dit donc « le client repartirait les mains vides »,
 * et non « le serveur refuserait ».
 *
 * ── CE QUE CE MODULE NE CONTRÔLE PAS, ET POURQUOI ──
 *
 * · « À la une » : trois liens FACULTATIFS, et l'écran public masque simplement
 *   le bloc quand la liste est vide. Un contrôle dessus serait orange pour tout
 *   commerçant qui n'en veut pas — c'est-à-dire la plupart — et c'est le motif
 *   que `checklist/tuiles.ts` interdit en toutes lettres : « un choix assumé
 *   n'est pas un oubli ».
 * · La COUVERTURE DE TRADUCTION : le chiffre existe (`vitrine_translation_state`)
 *   mais la page Vitrine ne le charge délibérément PAS — une RPC de plus à chaque
 *   ouverture, payée par tous pour un nombre que seul celui qui va traduire
 *   regarde (arbitrage écrit dans `dashboard/vitrine/page.tsx`). Un contrôle qui
 *   exigerait cette lecture renverserait cet arbitrage par effet de bord. Et un
 *   contrôle non chiffré ne dirait rien : la traduction est facultative, son
 *   absence n'est pas un défaut.
 * · Le PORTRAIT DE LA BANDE : son unique réglage a un défaut en base
 *   (`pack not null default 'amis'`) ET trois replis en TypeScript. Il n'existe
 *   aucun état « pas configuré », donc aucun contrôle qui ne serait pas vert pour
 *   toujours. Son bloc a une tuile — c'est un bloc de la page — et zéro contrôle.
 *
 * Il est PUR et testé : aucun réseau, `now` n'est même pas nécessaire — rien ici
 * ne dépend de l'heure.
 */

/** Une rubrique, réduite à ce qui compte ici : combien de fiches elle porte. */
export interface RubriqueVerificationVitrine {
  fiches: readonly unknown[];
}

/**
 * Une carte du catalogue. `active` est le SEUL masquage du module : une fiche
 * n'a pas de drapeau « visible », c'est sa carte qui sort ou non de la RPC
 * publique. Trente fiches rangées sous une carte coupée sont donc, pour le
 * client, exactement zéro fiche — et c'est le piège que ce module nomme.
 */
export interface CarteVerificationVitrine {
  active: boolean;
  categories: readonly RubriqueVerificationVitrine[];
}

export interface EntreeVerificationVitrine {
  /**
   * `vitrine_settings` de l'organisation, ou `null`. `null` n'est pas un objet
   * vide : la ligne NAÎT de `set_vitrine_slug`, donc son absence veut dire
   * « aucune adresse choisie », l'état de tout premier pas.
   */
  settings: { slug: string; published: boolean } | null;
  /** Toutes les cartes, actives ET coupées, avec leurs rubriques et fiches. */
  cartes: readonly CarteVerificationVitrine[];
  /**
   * Lignes `duo_options` épinglées par le commerçant. Zéro veut dire « le Duo
   * Miroir n'est pas proposé », ce qui est un choix ; une seule veut dire « il a
   * été composé puis il a maigri », ce qui est une panne silencieuse.
   */
  nbFichesDuo: number;
}

export interface EtatVerificationVitrine {
  controles: PointControle[];
  toutPret: boolean;
  /** Le SEUL endroit qui publie : l'écran Vitrine, carte « Publication ». */
  ctaHref: string;
}

/** Combien de fiches un client verrait vraiment, cartes coupées exclues. */
function compterFiches(
  cartes: readonly CarteVerificationVitrine[],
  actives: boolean,
): number {
  return cartes
    .filter((carte) => carte.active === actives)
    .reduce(
      (total, carte) =>
        total +
        carte.categories.reduce((n, rubrique) => n + rubrique.fiches.length, 0),
      0,
    );
}

const pluriel = (n: number) => (n > 1 ? "s" : "");

export function construireVerificationVitrine(
  entree: EntreeVerificationVitrine,
): EtatVerificationVitrine {
  const { settings, cartes, nbFichesDuo } = entree;
  const controles: PointControle[] = [];

  // 1. L'ADRESSE. Sans elle il n'y a pas d'URL publique du tout — et la page
  //    elle-même refuse d'afficher quoi que ce soit d'autre tant qu'elle manque.
  controles.push({
    cle: "adresse",
    ok: settings !== null,
    titre: "Votre vitrine a une adresse publique",
    detail:
      settings === null
        ? "Aucune adresse choisie : il n'existe encore aucune page à faire scanner, et le reste de cet écran attend ce premier réglage."
        : `Vos clients la liront sur /v/${settings.slug}.`,
  });

  // Les trois contrôles suivants n'ont de sens qu'APRÈS l'adresse : sans elle,
  // ni catalogue ni publication n'existent, et les redire en rouge ferait porter
  // trois reproches à un seul réglage manquant.
  if (settings !== null) {
    // 2. DE QUOI LIRE. C'est le contrôle `matiere` des pronostics, transposé :
    //    publiée sans une fiche visible, la vitrine sert une page vide.
    const visibles = compterFiches(cartes, true);
    const masquees = compterFiches(cartes, false);
    controles.push({
      cle: "catalogue",
      ok: visibles > 0,
      titre: "Il y a quelque chose à lire",
      detail:
        visibles > 0
          ? `${visibles} fiche${pluriel(visibles)} visible${pluriel(visibles)} par vos clients.`
          : masquees > 0
            ? `Vos ${masquees} fiche${pluriel(masquees)} sont toutes rangées sous des cartes coupées : la page publique est vide pour vos clients, exactement comme si vous n'en aviez saisi aucune. Réactivez au moins une carte.`
            : "Aucune fiche : scannée maintenant, votre vitrine afficherait une page vide.",
    });

    // 3. PUBLIÉE. Ce point ne BLOQUE pas — il serait tautologique : « ouvrir aux
    //    joueurs » est précisément ce que publier veut dire. Il est rattaché au
    //    bloc des QR, où il répond à la seule question qui compte là : peut-on
    //    déjà imprimer ? Un QR posé sur une table renvoie vers une page qui
    //    refuse tant que `published` est faux, et rien d'autre ne le rappelle au
    //    moment de lancer l'impression.
    controles.push({
      cle: "publiee",
      ok: settings.published,
      titre: "La vitrine est publiée",
      detail: settings.published
        ? "Votre page répond : vos planches de QR peuvent partir à l'impression."
        : "Vitrine non publiée : les QR que vous imprimeriez maintenant mèneraient à une page indisponible. Publiez d'abord, imprimez ensuite.",
    });
  }

  // 4. LE DUO MIROIR — ÉMIS SEULEMENT SI LE COMMERÇANT A COMMENCÉ.
  //
  //    Ne rien épingler est un CHOIX : la porte du jeu n'apparaît alors pas sur
  //    la vitrine, et personne ne manque de rien. Poser un point rouge permanent
  //    à tous ceux qui ne veulent pas de ce jeu apprendrait à ignorer la
  //    couleur — même motif que le contrôle `roues` du passeport.
  //
  //    En revanche, un plateau COMMENCÉ qui tombe sous le plancher est une panne
  //    muette, et la seule de ce module : `duo_jouable` (< 2 fiches) commande à
  //    la fois `duo_start` ET l'affichage de la porte publique, donc le jeu
  //    disparaît de la vitrine sans qu'aucun écran ne le dise. Le cas se produit
  //    tout seul, par cascade : supprimer un plat de la carte retire sa fiche du
  //    plateau.
  if (nbFichesDuo > 0) {
    controles.push({
      cle: "duo-plateau",
      ok: nbFichesDuo >= DUO_OPTIONS_MIN_BASE,
      titre: "Le plateau du Duo Miroir tient debout",
      detail:
        nbFichesDuo >= DUO_OPTIONS_MIN_ECRAN
          ? `${nbFichesDuo} fiches épinglées : la porte du Duo Miroir s'affiche sur votre vitrine.`
          : nbFichesDuo >= DUO_OPTIONS_MIN_BASE
            ? `${nbFichesDuo} fiches épinglées : le jeu tourne encore, mais le plateau est descendu sous les ${DUO_OPTIONS_MIN_ECRAN} fiches exigées à l'enregistrement — vous ne pourrez pas le modifier sans en rajouter une.`
            : `Une seule fiche épinglée : le Duo Miroir a disparu de votre vitrine, personne ne peut plus y jouer. Une suppression dans votre carte retire aussi la fiche du plateau — recomposez-le avec ${DUO_OPTIONS_MIN_ECRAN} fiches au moins.`,
    });
  }

  return {
    controles,
    toutPret: controles.every((c) => c.ok),
    ctaHref: "/dashboard/vitrine",
  };
}
