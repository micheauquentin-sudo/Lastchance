import type { OnboardingStep } from "@/components/dashboard/onboarding-checklist";
import type { CompteursCentreAnimation } from "@/lib/centre-animation-server";
import { lienSelonRole } from "@/lib/liens-proprietaire";
import type { MemberRole } from "@/types/database";

/**
 * « VOTRE PROCHAINE ACTION » — LA SEULE RÉPONSE VISIBLE EN PREMIER.
 *
 * La vue d'ensemble portait quatre systèmes de guidage concurrents (checklist
 * de démarrage, tableau d'équipe, conseiller, tuiles), qui donnaient jusqu'à
 * trois scores de progression contradictoires pour un même commerce et zéro
 * bouton. Ce module répond à UNE question — « je fais quoi maintenant ? » — et
 * la page n'en affiche qu'une réponse.
 *
 * ── PURE, ET DONC PROUVABLE ──
 *
 * Aucune IO : il projette un état DÉJÀ chargé par la page (les compteurs du
 * Centre d'animation et les étapes de démarrage, elles-mêmes calculées depuis
 * `org_dashboard_summary`). Zéro RPC supplémentaire.
 *
 * ── JAMAIS DE LIEN MORT ──
 *
 * Chaque candidat porte des destinations BRUTES, essayées dans l'ordre à
 * travers `lienSelonRole`. Un candidat dont aucune destination ne survit au
 * rôle n'est pas affiché sans bouton : il est ÉCARTÉ, et c'est le candidat
 * suivant qui prend la place. Le commerçant reçoit toujours une action qu'il
 * peut réellement accomplir.
 */

export type CtaProchaineAction = {
  label: string;
  href: string;
};

export type ProchaineAction = {
  /** `demarrage` porte en plus une progression et les étapes restantes. */
  kind: "demarrage" | "action" | "tout-roule";
  /** Stable : sert aussi à taire le conseil qui redirait ce hero. */
  key: string;
  titre: string;
  phrase: string;
  cta: CtaProchaineAction | null;
  progression?: { faites: number; total: number };
  restantes?: readonly OnboardingStep[];
};

export type EntreeProchaineAction = {
  role: MemberRole | null;
  /** Étapes DÉJÀ filtrées par rôle (`visibleOnboardingSteps`). */
  etapesDemarrage: readonly OnboardingStep[];
  /** `null` quand le Centre d'animation n'a rien rendu (RPC indisponible). */
  compteurs: CompteursCentreAnimation | null;
};

const pluriel = (n: number) => (n > 1 ? "s" : "");

/** La première destination que ce rôle peut réellement ouvrir, sinon `null`. */
function premierLienAutorise(
  hrefs: readonly string[],
  role: MemberRole | null,
): string | null {
  for (const href of hrefs) {
    const autorise = lienSelonRole(href, role);
    if (autorise) return autorise;
  }
  return null;
}

type Candidat = {
  key: string;
  titre: string;
  phrase: string;
  ctaLabel: string;
  /** Destinations brutes, essayées dans l'ordre. */
  hrefs: readonly string[];
};

/**
 * Les candidats opérationnels, dans l'ordre de priorité arrêté par la refonte.
 * Chacun ne naît que si son compteur est strictement positif : un candidat
 * construit puis masqué serait une phrase de plus à maintenir pour rien.
 */
function candidatsOperationnels(
  compteurs: CompteursCentreAnimation,
): Candidat[] {
  const candidats: Candidat[] = [];

  if (compteurs.rewardsToHandOver > 0) {
    const n = compteurs.rewardsToHandOver;
    candidats.push({
      key: "gains",
      titre: `${n} gain${pluriel(n)} à remettre`,
      phrase:
        "Des clients ont gagné et attendent leur lot au comptoir. La caisse scanne ou saisit leur code.",
      ctaLabel: "Ouvrir la caisse",
      // La caisse d'abord : c'est l'écran qui REMET le lot. Le registre des
      // participations ne fait que le lister — et il est réservé au
      // propriétaire, d'où le repli plutôt que l'inverse.
      hrefs: ["/dashboard/redeem", "/dashboard/participations?statut=a-valider"],
    });
  }

  if (compteurs.lowStockPrizes > 0) {
    const n = compteurs.lowStockPrizes;
    candidats.push({
      key: "stock",
      titre: `${n} lot${pluriel(n)} de la roue en stock faible`,
      phrase: "Sans réassort, la roue finira par tourner dans le vide.",
      ctaLabel: "Réapprovisionner les lots",
      hrefs: ["/dashboard/campaigns"],
    });
  }

  if (compteurs.drafts > 0) {
    const n = compteurs.drafts;
    candidats.push({
      key: "brouillons",
      titre: `${n} animation${pluriel(n)} en brouillon`,
      phrase:
        "Elles sont commencées mais jamais ouvertes aux joueurs. Terminez-en une.",
      ctaLabel: "Reprendre un brouillon",
      hrefs: ["/dashboard/campaigns"],
    });
  }

  if (compteurs.qrToTest > 0) {
    const n = compteurs.qrToTest;
    candidats.push({
      key: "qr",
      titre: `${n} QR jamais scanné${pluriel(n)}`,
      phrase:
        "Personne ne l'a encore ouvert. Scannez-le vous-même avant de l'afficher en boutique.",
      ctaLabel: "Voir vos QR codes",
      hrefs: ["/dashboard/qr-codes"],
    });
  }

  if (compteurs.liveExperiences === 0) {
    candidats.push({
      key: "rien-ouvert",
      titre: "Aucune animation ouverte aux joueurs",
      phrase: "Ouvrez-en une pour que vos clients puissent jouer.",
      ctaLabel: "Ouvrir une animation",
      hrefs: ["/dashboard/campaigns"],
    });
  }

  return candidats;
}

/**
 * L'ancre de la section « Vos résultats », sur la même page : le repli calme
 * n'invente pas une destination, il descend l'écran.
 */
export const ANCRE_RESULTATS = "#vos-resultats";

/**
 * La seule chose à faire maintenant.
 *
 * Le démarrage passe AVANT tout : un commerce qui n'a pas encore de lot n'a
 * rien à remettre au comptoir, et la checklist était jusqu'ici reléguée en
 * dixième position, derrière dix cartes de zéros.
 */
export function construireProchaineAction(
  entree: EntreeProchaineAction,
): ProchaineAction {
  const { role, etapesDemarrage, compteurs } = entree;

  // 1. Le démarrage absorbe la checklist : le hero DEVIENT « Pour bien
  //    démarrer » tant qu'une étape ouverte porte une destination autorisée.
  const etapes = etapesDemarrage.filter(
    (etape) => lienSelonRole(etape.href, role) !== null,
  );
  const restantes = etapes.filter((etape) => !etape.done);
  if (etapes.length > 0 && restantes.length > 0) {
    const courante = restantes[0];
    const faites = etapes.length - restantes.length;
    return {
      kind: "demarrage",
      key: "demarrage",
      titre: "Pour bien démarrer",
      phrase: `Étape ${faites + 1} sur ${etapes.length}.`,
      cta: {
        label: courante.label,
        href: lienSelonRole(courante.href, role)!,
      },
      progression: { faites, total: etapes.length },
      // Même filtre que le CTA : la liste « Ensuite » ne doit jamais porter
      // un href que `lienSelonRole` n'a pas traversé.
      restantes: restantes.slice(1).map((etape) => ({
        ...etape,
        href: lienSelonRole(etape.href, role)!,
      })),
    };
  }

  // 2 à 6. Le premier candidat opérationnel dont une destination survit au
  //        rôle. Un candidat sans lien praticable est écarté, pas affiché nu.
  if (compteurs) {
    for (const candidat of candidatsOperationnels(compteurs)) {
      const href = premierLienAutorise(candidat.hrefs, role);
      if (!href) continue;
      return {
        kind: "action",
        key: candidat.key,
        titre: candidat.titre,
        phrase: candidat.phrase,
        cta: { label: candidat.ctaLabel, href },
      };
    }
  }

  // 7. Rien à signaler — et on le dit, plutôt que de laisser un blanc qui se
  //    lirait « l'écran a échoué ».
  return {
    kind: "tout-roule",
    key: "tout-roule",
    titre: "Tout roule 🎉",
    phrase: "Rien ne demande votre attention pour le moment.",
    cta: { label: "Voir vos résultats", href: ANCRE_RESULTATS },
  };
}

/**
 * Les conseils que ce hero REDIRAIT mot pour mot.
 *
 * Le Conseiller vit sur la même page, quelques centimètres plus bas : laisser
 * « 3 gains à remettre. » y apparaître alors que le hero l'affiche déjà en gros
 * recrée exactement le doublon que cette refonte supprime. La page passe cette
 * liste à `construireConseils`, qui les tait.
 */
export function conseilsRecouvertsParHero(
  action: ProchaineAction,
): readonly string[] {
  switch (action.key) {
    case "gains":
      return ["op-gains"];
    case "stock":
      return ["op-stock"];
    case "brouillons":
      return ["op-brouillons", "act-brouillons-non-ouverts"];
    case "qr":
      return ["op-qr"];
    case "rien-ouvert":
      return ["act-rien-ouvert", "act-brouillons-non-ouverts"];
    default:
      return [];
  }
}

/**
 * Les tâches d'équipe que ce hero PROMEUT déjà, et qui n'ont donc plus à figurer
 * une seconde fois dans « Les prochains coups de main ».
 *
 * « Un fait = une seule case » : le hero « 3 gains à remettre » porte
 * exactement le même compteur et exactement la même destination que l'action
 * « Remettre les gains au comptoir ». Deux lignes pour un seul geste, à trois
 * centimètres d'écart, c'est la redondance que cette refonte supprime — le
 * hero garde le fait, la liste garde le reste.
 */
const TACHE_PAR_HERO: Readonly<Record<string, string>> = {
  gains: "remettre-les-gains",
  stock: "recharger-les-lots",
  brouillons: "terminer-les-brouillons",
  qr: "tester-les-qr",
  "rien-ouvert": "verifier-les-modules",
};

export function tachesRecouvertesParHero(
  action: ProchaineAction,
): readonly string[] {
  const cle = TACHE_PAR_HERO[action.key];
  return cle ? [cle] : [];
}
