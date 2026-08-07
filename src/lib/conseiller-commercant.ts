import type { CompteursCentreAnimation } from "@/lib/centre-animation-server";
import type { ExperienceAnalyticsSnapshot } from "@/lib/experience-analytics-dashboard";
import { lienSelonRole } from "@/lib/liens-proprietaire";
import { EXPERIENCE_CATALOG } from "@/platform/experiences/catalog";
import type { ExperienceKind } from "@/platform/experiences/contract";
import type { MemberRole } from "@/types/database";

/**
 * LE CONSEILLER COMMERÇANT — DÉTERMINISTE, GRATUIT, SANS APPEL EXTERNE.
 *
 * Il remplace l'assistant IA payant retiré. Aucune clé, aucun réseau, aucun
 * coût par usage : de simples règles sur des données que le commerçant a DÉJÀ.
 * Quatre sources, aucune requête neuve :
 *   1. les compteurs du Centre d'animation pour les signaux OPÉRATIONNELS — sa
 *      RPC, déjà chargée par la page, balaie les vingt et une tables ;
 *   2. le catalogue des modules (`EXPERIENCE_CATALOG` + les kinds actifs) pour
 *      ce qui n'est pas encore actif ;
 *   3. `org_dashboard_summary` et 4. `org_experience_analytics`, toutes deux
 *      déjà appelées par `dashboard/page.tsx` dans le même `Promise.all`, pour
 *      les signaux d'ACTIVITÉ.
 *
 * ── LA CATÉGORIE « activite » EST UNE LECTURE, PAS UN CHIFFRE DE PLUS ──
 *
 * Le commerçant voit déjà chacun de ces compteurs en tuile. Ce qu'aucun écran
 * ne lui dit, c'est ce qu'ils signifient ENSEMBLE : des brouillons prêts alors
 * que rien n'est ouvert, des joueurs vus qui ne lancent aucune partie, des lots
 * gagnés dont personne ne réclame le gain. Une règle d'activité ne se déclenche
 * donc jamais sur un compteur seul — c'est le croisement qui porte le sens, et
 * c'est aussi ce qui la distingue d'une tuile répétée.
 *
 * ── CE QUE LE CONSEILLER NE DIT JAMAIS ──
 *
 * Rien sur l'abonnement ni l'essai : `dashboard/layout.tsx` porte déjà ses
 * bandeaux (essai qui expire, `past_due`, `canceled`, abonnement inactif).
 * Rien non plus sur les six étapes de démarrage — créer une campagne, un lot,
 * un QR, l'affiche, le logo, l'activation : `OnboardingChecklist` les tient, à
 * l'écran, sur la même page. Un conseiller qui répète l'encart d'à côté se fait
 * ignorer avec lui.
 *
 * ── TON SOBRE ET INFORMATIF ──
 *
 * Le conseiller SIGNALE ; il ne survend pas. Comptes exacts, phrases neutres,
 * pas d'emphase commerciale. « Module Passeport fidélité disponible (objectif :
 * Fidéliser). », « 3 gains à remettre. » — et rien de plus.
 *
 * ── UNE SEULE FONCTION, PURE ──
 *
 * `construireConseils` projette un état DÉJÀ chargé (compteurs + kinds actifs)
 * en conseils : aucune IO, testable sans base. La page appelante lui passe le
 * résultat de `chargerCentreAnimation` qu'elle a déjà en main — il n'y a pas de
 * seconde RPC. Comme le Centre d'animation, la caisse n'a pas de conseil à
 * recevoir (elle encaisse, elle ne pilote pas) : `compteurs` est alors `null`.
 *
 * ── AUCUN href NE CONTOURNE `lienSelonRole` ──
 *
 * Même filet que le tableau d'équipe : chaque lien passe par `lienSelonRole`,
 * qui rend `null` quand la destination refuse le rôle. Un chemin réservé au
 * propriétaire (le registre des participations) ne sort donc pas pour un
 * éditeur — le conseil reste lisible, seul le lien disparaît.
 */

export type ConseilCommercant = {
  /** Stable pour React. */
  key: string;
  categorie: "activite" | "operationnel" | "module" | "decouverte";
  /** La phrase sobre affichée. */
  texte: string;
  /** Déjà filtré par `lienSelonRole` : absent si le rôle ne peut pas l'ouvrir. */
  href?: string;
  /** Plus haut = plus urgent. Sert au tri et au plafonnement. */
  priorite: number;
};

/**
 * Le sous-ensemble d'`org_dashboard_summary` que le conseiller lit.
 *
 * Un sous-ensemble NOMMÉ, et non le `DashboardSummary` de la page : ce module
 * n'a besoin que de trois champs, et un type structurel étroit dit exactement
 * de quoi les règles dépendent. La page lui passe son `summary` complet — le
 * typage structurel de TypeScript l'accepte sans conversion, et rien ici ne
 * remonte vers `src/app`.
 */
export type SommaireConseils = {
  /** Tours gagnants de la roue, depuis toujours. */
  wins: number;
  /** Gains réclamés (le formulaire a été rempli), depuis toujours. */
  participations: number;
  /** Campagnes de roue créées, tous statuts confondus. */
  campaigns: number;
};

/**
 * L'état déjà chargé que projette `construireConseils`. `compteurs` est `null`
 * quand le Centre d'animation n'a rien à rendre (caisse ou base indisponible) :
 * il n'y a alors aucun signal opérationnel, seulement modules et découverte.
 *
 * `sommaire` et `analytics` suivent la même convention — nullables, jamais
 * absents. Un champ optionnel se serait oublié en silence au premier appelant
 * nouveau ; un `null` explicite oblige à décider qu'on n'a rien à passer.
 */
export type EntreeConseils = {
  role: MemberRole;
  compteurs: CompteursCentreAnimation | null;
  activeKinds: readonly ExperienceKind[];
  /** Retour d'`org_dashboard_summary`, déjà chargé par la page. */
  sommaire: SommaireConseils | null;
  /** Retour d'`org_experience_analytics` sur 30 jours, déjà chargé. */
  analytics: ExperienceAnalyticsSnapshot | null;
  /**
   * Clés de conseils que le bloc « Votre prochaine action » affiche DÉJÀ, en
   * gros et avec un bouton, quelques centimètres plus haut. Les redire ici,
   * c'est recréer le doublon que la refonte supprime. La page les fournit
   * depuis `conseilsRecouvertsParHero`.
   */
  exclure?: readonly string[];
};

/**
 * Au plus ce nombre de conseils, la découverte comprise.
 *
 * RAMENÉ DE 8 À 4. Le plafond de 8 partait d'un raisonnement juste — laisser de
 * la place aux signaux d'entonnoir à côté de l'opérationnel — et produisait à
 * l'écran l'inverse de son but : un panneau de huit lignes, dont sept « Module
 * X disponible » pour un commerce sans add-on, sous un hero qui répétait déjà
 * la plus urgente. Le conseiller n'est pas la liste de tout ce qu'on pourrait
 * dire ; c'est ce qui reste à dire une fois le hero lu.
 */
const MAX_CONSEILS = 4;

const CHEMIN_DECOUVERTE = "/dashboard/discover";
const CHEMIN_CAMPAGNES = "/dashboard/campaigns";

const pluriel = (n: number) => (n > 1 ? "s" : "");

/**
 * Ce que voient les règles d'activité : les trois états déjà chargés, chacun
 * pouvant manquer indépendamment. Une règle qui ne trouve pas sa source se tait
 * — jamais de repli sur zéro, qui se lirait « c'est mesuré, et c'est nul ».
 */
type ContexteActivite = {
  compteurs: CompteursCentreAnimation | null;
  sommaire: SommaireConseils | null;
  analytics: ExperienceAnalyticsSnapshot | null;
};

/**
 * LES RÈGLES D'ACTIVITÉ — un croisement chacune, aucune répétition de tuile.
 *
 * `texte` rend `null` quand la règle ne se déclenche pas : décider et rédiger
 * au même endroit évite le couple prédicat/texte qui diverge à la première
 * retouche (le compteur testé n'étant plus celui affiché).
 *
 * Toutes sont prioritaires sur l'opérationnel : remettre trois lots au comptoir
 * est utile, mais si rien n'est ouvert aux joueurs il n'y aura pas de quatrième.
 */
const REGLES_ACTIVITE: readonly {
  key: string;
  href: string;
  priorite: number;
  texte: (contexte: ContexteActivite) => string | null;
}[] = [
  {
    // Le croisement le plus coûteux : le travail est fait, il n'est pas publié.
    key: "act-brouillons-non-ouverts",
    href: CHEMIN_DECOUVERTE,
    priorite: 130,
    texte: ({ compteurs }) =>
      compteurs && compteurs.liveExperiences === 0 && compteurs.drafts > 0
        ? `${compteurs.drafts} animation${pluriel(compteurs.drafts)} en brouillon, aucune ouverte aux joueurs.`
        : null,
  },
  {
    // Même constat sans brouillon pour l'expliquer — donc une autre décision à
    // prendre, d'où deux règles et non deux phrases d'une seule. La garde
    // `campaigns > 0` écarte le commerce qui n'a encore rien créé : c'est la
    // checklist de démarrage qui l'accompagne, pas le conseiller.
    key: "act-rien-ouvert",
    href: CHEMIN_CAMPAGNES,
    priorite: 128,
    texte: ({ compteurs, sommaire }) =>
      compteurs &&
      compteurs.liveExperiences === 0 &&
      compteurs.drafts === 0 &&
      sommaire !== null &&
      sommaire.campaigns > 0
        ? "Aucune animation n'est ouverte aux joueurs."
        : null,
  },
  {
    // Entrée de l'entonnoir. « Vue qualifiée » est le vocabulaire exact du
    // tableau d'analytics juste en dessous (une identité touchée côté serveur,
    // pas une vue de page) : deux mots pour la même mesure se seraient
    // contredits à l'écran.
    key: "act-vues-sans-partie",
    href: CHEMIN_CAMPAGNES,
    priorite: 125,
    texte: ({ analytics }) => {
      if (!analytics) return null;
      const { views, starts } = analytics.summary;
      if (views === 0 || starts > 0) return null;
      const s = pluriel(views);
      return `${views} vue${s} qualifiée${s} sur ${analytics.periodDays} jours, aucune partie lancée.`;
    },
  },
  {
    // Milieu de l'entonnoir. Ne peut pas se déclencher pour une roue seule :
    // le trigger `track_experience_activity` marque chaque spin complet, donc
    // `starts > 0` y implique `completions > 0`. Le signal vise les modules à
    // parcours long — chasse, quiz, calendrier — où l'abandon est réel.
    key: "act-parties-sans-fin",
    href: CHEMIN_CAMPAGNES,
    priorite: 120,
    texte: ({ analytics }) => {
      if (!analytics) return null;
      const { starts, completions } = analytics.summary;
      if (starts === 0 || completions > 0) return null;
      const s = pluriel(starts);
      return `${starts} partie${s} lancée${s} sur ${analytics.periodDays} jours, aucune terminée.`;
    },
  },
  {
    // Sortie de l'entonnoir. Une participation naît du formulaire que le
    // gagnant remplit APRÈS le tour (`claim_winning_spin`) : gagner sans
    // participer est donc un abandon devant ce formulaire, pas une anomalie.
    key: "act-gains-sans-coordonnees",
    href: CHEMIN_CAMPAGNES,
    priorite: 115,
    texte: ({ sommaire }) =>
      sommaire && sommaire.wins > 0 && sommaire.participations === 0
        ? `${sommaire.wins} lot${pluriel(sommaire.wins)} gagné${pluriel(sommaire.wins)} à la roue, aucune coordonnée client enregistrée.`
        : null,
  },
];

/**
 * Les règles opérationnelles, dans l'ordre d'urgence. Chacune lit UN compteur
 * du Centre d'animation et ne s'affiche que s'il est strictement positif.
 *
 * `href` est le chemin BRUT : il ne sort qu'après passage par `lienSelonRole`.
 * « Gains à remettre » pointe vers le registre des participations — réservé au
 * propriétaire —, exactement comme l'action `verifier-les-participations` du
 * tableau d'équipe : pour un éditeur, le lien disparaît, la phrase reste.
 */
const REGLES_OPERATIONNELLES: readonly {
  key: string;
  href: string;
  priorite: number;
  compteur: (c: CompteursCentreAnimation) => number;
  texte: (n: number) => string;
}[] = [
  {
    key: "op-gains",
    href: "/dashboard/participations?statut=a-valider",
    priorite: 100,
    compteur: (c) => c.rewardsToHandOver,
    texte: (n) => `${n} gain${pluriel(n)} à remettre.`,
  },
  {
    key: "op-stock",
    href: "/dashboard/campaigns",
    priorite: 90,
    compteur: (c) => c.lowStockPrizes,
    texte: (n) => `${n} lot${pluriel(n)} de la roue en stock faible.`,
  },
  {
    key: "op-qr",
    href: "/dashboard/qr-codes",
    priorite: 80,
    compteur: (c) => c.qrToTest,
    // « jamais scanné », le mot exact de la tuile et du hero. La phrase disait
    // « jamais ouvert — à tester avant diffusion » : trois vocabulaires pour un
    // seul compteur (`scan_count = 0`), sur un seul écran.
    texte: (n) => `${n} QR jamais scanné${pluriel(n)}.`,
  },
  {
    key: "op-brouillons",
    href: CHEMIN_DECOUVERTE,
    priorite: 70,
    compteur: (c) => c.drafts,
    texte: (n) => `${n} animation${pluriel(n)} en brouillon à terminer.`,
  },
];

/** La découverte est toujours présente et la moins prioritaire. */
const PRIORITE_DECOUVERTE = 0;

/**
 * Projette un état déjà chargé en conseils. PURE : aucune IO, testable seule.
 *
 * L'ordre de sortie : les plus prioritaires d'abord, la découverte toujours en
 * dernier et toujours là. Le total est borné à `MAX_CONSEILS` — la découverte
 * occupe la dernière place réservée, les autres se partagent le reste.
 */
export function construireConseils(entree: EntreeConseils): ConseilCommercant[] {
  const { role, compteurs, activeKinds, sommaire, analytics } = entree;
  const exclure = new Set(entree.exclure ?? []);

  const conseil = (
    base: Omit<ConseilCommercant, "href">,
    hrefBrut: string,
  ): ConseilCommercant => {
    const href = lienSelonRole(hrefBrut, role);
    return href === null ? base : { ...base, href };
  };

  const contexte: ContexteActivite = { compteurs, sommaire, analytics };
  const activite: ConseilCommercant[] = REGLES_ACTIVITE.flatMap((regle) => {
    const texte = regle.texte(contexte);
    if (texte === null) return [];
    return [
      conseil(
        {
          key: regle.key,
          categorie: "activite",
          texte,
          priorite: regle.priorite,
        },
        regle.href,
      ),
    ];
  });

  // `act-brouillons-non-ouverts` compte DÉJÀ les brouillons, et le dit mieux :
  // il ajoute l'information qui manque au compteur seul (rien n'est ouvert).
  // Laisser les deux, c'est écrire le même chiffre deux fois de suite.
  const brouillonsDejaDits = activite.some(
    (c) => c.key === "act-brouillons-non-ouverts",
  );

  const operationnels: ConseilCommercant[] = compteurs
    ? REGLES_OPERATIONNELLES.flatMap((regle) => {
        if (regle.key === "op-brouillons" && brouillonsDejaDits) return [];
        const n = regle.compteur(compteurs);
        if (n <= 0) return [];
        return [
          conseil(
            {
              key: regle.key,
              categorie: "operationnel",
              texte: regle.texte(n),
              priorite: regle.priorite,
            },
            regle.href,
          ),
        ];
      })
    : [];

  /*
   * UNE SEULE LIGNE POUR TOUS LES MODULES INACTIFS.
   *
   * Il y en avait une PAR module : un commerçant sans add-on lisait sept
   * « Module X disponible (objectif : Y) » et le panneau censé conseiller
   * devenait une brochure, poussant les deux conseils réellement utiles hors du
   * plafond. Le compte reste exact et le ton constatif ; le choix du module se
   * fait sur « Découvrir », qui est fait pour ça.
   */
  const inactifs = EXPERIENCE_CATALOG.filter(
    (entry) => !activeKinds.includes(entry.kind),
  ).length;

  const decouverte: ConseilCommercant = {
    key: "decouverte",
    categorie: "decouverte",
    texte:
      inactifs > 0
        ? `${inactifs} module${pluriel(inactifs)} pourrai${inactifs > 1 ? "ent" : "t"} servir vos objectifs.`
        : "Parcourir tous les modules par objectif.",
    href: CHEMIN_DECOUVERTE,
    priorite: PRIORITE_DECOUVERTE,
  };

  // La découverte occupe une place réservée : les autres conseils se partagent
  // les `MAX_CONSEILS - 1` restantes, par priorité décroissante. Le tri est
  // stable. Les conseils que le hero affiche déjà sont écartés AVANT le
  // plafonnement — sinon un doublon volerait la place d'un conseil neuf.
  const autres = [...activite, ...operationnels]
    .filter((c) => !exclure.has(c.key))
    .sort((a, b) => b.priorite - a.priorite)
    .slice(0, MAX_CONSEILS - 1);

  return [...autres, decouverte];
}
