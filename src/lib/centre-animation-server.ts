import "server-only";

import { lienSelonRole } from "@/lib/liens-proprietaire";
import { reportError } from "@/lib/monitoring";
import { rpcStrict } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

/**
 * LE CENTRE D'ANIMATION ET LE TABLEAU D'ÉQUIPE — côté données.
 *
 * Le cahier §5 demande « une vue des brouillons, QR à tester, jeux en cours,
 * stocks faibles, gains à remettre et tâches d'équipe », plus un tableau qui
 * « rend visuellement les actions attribuées au propriétaire, à l'éditeur ou à
 * la caisse ». Ce module rend ces deux choses en UN aller-retour.
 *
 * ── UNE RPC, PAS SIX COMPTAGES ──
 *
 * `org_animation_center_counts` (migration 20260914120000) balaie vingt et une
 * tables et garde son prédicat en base. Elle est appelée avec le client de
 * SESSION et non le service_role, pour une raison qui n'est pas stylistique :
 * sa garde interne est `is_org_editor(p_organization_id)`, qui lit
 * `auth.uid()`. Un appel service rendrait `not authorized` — la fonction sert
 * un écran connecté, pas un job.
 *
 * ── LES CHIFFRES NE SONT PAS RATTRAPÉS ──
 *
 * Aucun `?? 0` sur les cinq compteurs. La RPC fait déjà le `coalesce` côté SQL
 * et son type est non-nullable ; un repli défensif ici masquerait exactement la
 * régression qu'on voudrait voir — un compteur qui cesse de compter.
 * L'indisponibilité, elle, rend `null` pour TOUT le bloc : mieux vaut ne rien
 * afficher que d'afficher des zéros qui se lisent « tout est fait ».
 *
 * ── `teamTasks` EST DÉRIVÉ, JAMAIS COMPTÉ À PART ──
 *
 * C'est le nombre d'actions réellement `ready` dans la liste ci-dessous. Un
 * sixième compteur SQL aurait été un second endroit où décider ce qui reste à
 * faire, et les deux auraient divergé au premier ajout d'action.
 */

export type CompteursCentreAnimation = {
  /** Animations en brouillon, tous modules confondus. */
  drafts: number;
  /**
   * QR jamais ouverts (`scan_count = 0`). PROXY assumé : aucune colonne ne dit
   * si le commerçant l'a essayé lui-même. Le libellé reste descriptif.
   */
  qrToTest: number;
  /** Animations publiées, tous modules confondus. */
  liveExperiences: number;
  /** Lots de la ROUE sous leur seuil — seule table de lots à en porter un. */
  lowStockPrizes: number;
  /** Récompenses en attente au comptoir, sur les dix tables d'émission. */
  rewardsToHandOver: number;
  /** Nombre d'actions d'équipe `ready`. Dérivé de `actionsEquipe`. */
  teamTasks: number;
};

export type ActionEquipe = {
  key: string;
  label: string;
  description: string;
  /** À qui cette action revient dans le commerce. */
  assigneeRole: MemberRole;
  status: "ready" | "done" | "blocked";
  /** Rôles à qui l'action peut être présentée comme actionnable. */
  availableTo: readonly MemberRole[];
  href?: string;
  blockedReason?: string;
};

const DEMANDER_AU_PROPRIETAIRE =
  "Cet écran est réservé au propriétaire du commerce : demandez-lui de regarder.";

type DefinitionAction = {
  key: string;
  label: string;
  description: string;
  assigneeRole: MemberRole;
  availableTo: readonly MemberRole[];
  /** Chemin BRUT. Il ne sort d'ici qu'après passage par `lienSelonRole`. */
  href: string;
  /** Ce qu'il reste à faire. Zéro = `done`. */
  aFaire: (compteurs: Omit<CompteursCentreAnimation, "teamTasks">) => number;
};

/**
 * LES ACTIONS RÉELLES, et rien d'autre.
 *
 * Chacune pointe vers un écran qui existe et se conditionne à un compteur que
 * la RPC rend vraiment : un tableau d'équipe qui invente des tâches, ou qui
 * affiche « à faire » sur un travail déjà terminé, se fait ignorer en deux
 * jours.
 *
 * `href` est ici le chemin BRUT. Il ne sort jamais tel quel — `lienSelonRole`
 * le remplace par `null` quand la destination refuse le rôle, et l'action
 * devient alors `blocked` avec la phrase qui dit à qui s'adresser. C'est
 * exactement le défaut réparé par `liens-proprietaire.ts` : un lien cliquable
 * qui renvoie l'éditeur sur « Vue d'ensemble », sans un mot.
 */
const CATALOGUE_ACTIONS: readonly DefinitionAction[] = [
  {
    key: "remettre-les-gains",
    label: "Remettre les gains au comptoir",
    description:
      "Des clients ont gagné et attendent leur lot. La caisse scanne ou saisit leur code.",
    assigneeRole: "cashier",
    availableTo: ["owner", "editor", "cashier"],
    href: "/dashboard/redeem",
    aFaire: (compteurs) => compteurs.rewardsToHandOver,
  },
  {
    key: "tester-les-qr",
    label: "Tester les QR jamais ouverts",
    description:
      "Ces QR n'ont encore été ouverts par personne. Scannez-les vous-même avant de les afficher en boutique.",
    assigneeRole: "editor",
    availableTo: ["owner", "editor"],
    href: "/dashboard/qr-codes",
    aFaire: (compteurs) => compteurs.qrToTest,
  },
  {
    key: "recharger-les-lots",
    label: "Recharger les lots de la roue presque épuisés",
    description:
      "Des lots sont sous leur seuil de stock. Sans réassort, la roue tournera dans le vide.",
    assigneeRole: "editor",
    availableTo: ["owner", "editor"],
    href: "/dashboard/campaigns",
    aFaire: (compteurs) => compteurs.lowStockPrizes,
  },
  {
    key: "terminer-les-brouillons",
    label: "Terminer les animations en brouillon",
    description:
      "Des animations sont commencées mais jamais ouvertes aux joueurs.",
    assigneeRole: "editor",
    availableTo: ["owner", "editor"],
    href: "/dashboard/discover",
    aFaire: (compteurs) => compteurs.drafts,
  },
  {
    key: "verifier-les-participations",
    label: "Vérifier les participations à valider",
    description:
      "Le registre des participations liste les gains encore non remis, avec leur client.",
    assigneeRole: "editor",
    availableTo: ["owner", "editor"],
    // Réservé au propriétaire (`CHEMINS_PROPRIETAIRE`) : pour un éditeur, ce
    // lien disparaît et l'action bascule en `blocked`.
    href: "/dashboard/participations?statut=a-valider",
    aFaire: (compteurs) => compteurs.rewardsToHandOver,
  },
  {
    key: "verifier-les-modules",
    label: "Vérifier les modules ouverts",
    description:
      "Aucune animation n'est en ligne. Ouvrez un module ou publiez un brouillon pour que vos clients puissent jouer.",
    assigneeRole: "owner",
    availableTo: ["owner"],
    href: "/dashboard/settings/modules",
    // Le seul compteur qui se lit à l'envers : c'est l'ABSENCE d'animation en
    // ligne qui appelle une décision du propriétaire.
    aFaire: (compteurs) => (compteurs.liveExperiences === 0 ? 1 : 0),
  },
];

/**
 * Construit le tableau d'équipe pour un rôle donné.
 *
 * Exporté et PUR : c'est ce qui rend testable la promesse « aucun href ne
 * contourne `lienSelonRole` » sans monter une base de données.
 */
export function construireActionsEquipe(
  compteurs: Omit<CompteursCentreAnimation, "teamTasks">,
  role: MemberRole,
): ActionEquipe[] {
  return CATALOGUE_ACTIONS.map((definition) => {
    const href = lienSelonRole(definition.href, role);
    const reste = definition.aFaire(compteurs);

    const action: ActionEquipe = {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      assigneeRole: definition.assigneeRole,
      availableTo: definition.availableTo,
      status: reste === 0 ? "done" : href === null ? "blocked" : "ready",
    };
    if (href !== null) action.href = href;
    // Toutes ces actions sont un écran à ouvrir : sans lien, il n'en reste
    // rien à faire pour cette personne — d'où `blocked` plutôt que `ready`.
    if (action.status === "blocked") action.blockedReason = DEMANDER_AU_PROPRIETAIRE;
    return action;
  });
}

/**
 * Compteurs + tableau d'équipe de l'organisation active.
 *
 * `null` dans deux cas, volontairement indiscernables pour l'écran : le rôle
 * caisse (la RPC le refuserait, on ne l'appelle donc pas) et l'indisponibilité
 * de la base. Dans les deux cas il n'y a rien d'honnête à afficher.
 */
export async function chargerCentreAnimation(
  organizationId: string,
  role: MemberRole,
): Promise<{
  compteurs: CompteursCentreAnimation;
  actionsEquipe: ActionEquipe[];
} | null> {
  // La caisse encaisse : elle ne pilote pas les animations, et
  // `org_animation_center_counts` lèverait `not authorized`. Refuser AVANT
  // l'appel évite une exception Postgres pour une réponse qu'on connaît déjà.
  if (role === "cashier") return null;

  const supabase = await createClient();
  const { data, error } = await rpcStrict(
    supabase,
    "org_animation_center_counts",
    { p_organization_id: organizationId },
  );

  const ligne = data?.[0];
  if (error || !ligne) {
    reportError(
      "centre-animation",
      error?.message ?? "org_animation_center_counts n'a rendu aucune ligne",
    );
    return null;
  }

  const bruts = {
    drafts: ligne.drafts,
    qrToTest: ligne.qr_never_scanned,
    liveExperiences: ligne.live_experiences,
    lowStockPrizes: ligne.low_stock_prizes,
    rewardsToHandOver: ligne.rewards_to_hand_over,
  };

  const actionsEquipe = construireActionsEquipe(bruts, role);

  return {
    compteurs: {
      ...bruts,
      // DÉRIVÉ. Voir l'en-tête : un compteur SQL de plus aurait divergé.
      teamTasks: actionsEquipe.filter((action) => action.status === "ready").length,
    },
    actionsEquipe,
  };
}
