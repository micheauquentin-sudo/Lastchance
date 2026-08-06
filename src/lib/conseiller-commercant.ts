import type { CompteursCentreAnimation } from "@/lib/centre-animation-server";
import { lienSelonRole } from "@/lib/liens-proprietaire";
import { EXPERIENCE_CATALOG } from "@/platform/experiences/catalog";
import type { ExperienceKind } from "@/platform/experiences/contract";
import type { MemberRole } from "@/types/database";

/**
 * LE CONSEILLER COMMERÇANT — DÉTERMINISTE, GRATUIT, SANS APPEL EXTERNE.
 *
 * Il remplace l'assistant IA payant retiré. Aucune clé, aucun réseau, aucun
 * coût par usage : de simples règles sur des données que le commerçant a DÉJÀ.
 * Deux sources, aucune requête neuve :
 *   1. les compteurs du Centre d'animation pour les signaux OPÉRATIONNELS — sa
 *      RPC, déjà chargée par la page, balaie les vingt et une tables ;
 *   2. le catalogue des modules (`EXPERIENCE_CATALOG` + les kinds actifs) pour
 *      ce qui n'est pas encore actif.
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
  categorie: "operationnel" | "module" | "decouverte";
  /** La phrase sobre affichée. */
  texte: string;
  /** Déjà filtré par `lienSelonRole` : absent si le rôle ne peut pas l'ouvrir. */
  href?: string;
  /** Plus haut = plus urgent. Sert au tri et au plafonnement. */
  priorite: number;
};

/**
 * L'état déjà chargé que projette `construireConseils`. `compteurs` est `null`
 * quand le Centre d'animation n'a rien à rendre (caisse ou base indisponible) :
 * il n'y a alors aucun signal opérationnel, seulement modules et découverte.
 */
export type EntreeConseils = {
  role: MemberRole;
  compteurs: CompteursCentreAnimation | null;
  activeKinds: readonly ExperienceKind[];
};

/** Au plus ce nombre de conseils, la découverte comprise, pour ne pas noyer. */
const MAX_CONSEILS = 6;

const CHEMIN_DECOUVERTE = "/dashboard/discover";

const pluriel = (n: number) => (n > 1 ? "s" : "");

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
    texte: (n) => `${n} QR jamais ouvert${pluriel(n)} — à tester avant diffusion.`,
  },
  {
    key: "op-brouillons",
    href: CHEMIN_DECOUVERTE,
    priorite: 70,
    compteur: (c) => c.drafts,
    texte: (n) => `${n} animation${pluriel(n)} en brouillon à terminer.`,
  },
];

/** Priorité des conseils « module », sous l'opérationnel, en ordre catalogue. */
const MODULE_PRIORITE_BASE = 50;

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
  const { role, compteurs, activeKinds } = entree;

  const conseil = (
    base: Omit<ConseilCommercant, "href">,
    hrefBrut: string,
  ): ConseilCommercant => {
    const href = lienSelonRole(hrefBrut, role);
    return href === null ? base : { ...base, href };
  };

  const operationnels: ConseilCommercant[] = compteurs
    ? REGLES_OPERATIONNELLES.flatMap((regle) => {
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

  const modules: ConseilCommercant[] = EXPERIENCE_CATALOG.filter(
    (entry) => !activeKinds.includes(entry.kind),
  ).map((entry, index) =>
    conseil(
      {
        key: `mod-${entry.kind}`,
        categorie: "module",
        texte: `Module ${entry.label} disponible (objectif : ${entry.objective}).`,
        priorite: MODULE_PRIORITE_BASE - index,
      },
      entry.dashboardHref,
    ),
  );

  const decouverte: ConseilCommercant = {
    key: "decouverte",
    categorie: "decouverte",
    texte: "Parcourir tous les modules par objectif.",
    href: CHEMIN_DECOUVERTE,
    priorite: PRIORITE_DECOUVERTE,
  };

  // La découverte occupe une place réservée : les autres conseils se partagent
  // les `MAX_CONSEILS - 1` restantes, par priorité décroissante. Le tri est
  // stable, l'ordre catalogue des modules est donc préservé à priorité égale.
  const autres = [...operationnels, ...modules]
    .sort((a, b) => b.priorite - a.priorite)
    .slice(0, MAX_CONSEILS - 1);

  return [...autres, decouverte];
}
