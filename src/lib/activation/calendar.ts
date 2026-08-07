import type { SpinWheelIssue } from "@/components/dashboard/loyalty-settings-presets";
import type { EtapeCalendrier } from "@/components/dashboard/atelier-calendar-etapes";
import type { ControleActivation } from "./controle";

/**
 * LES PRÉCONDITIONS D'OUVERTURE D'UN CALENDRIER — une seule vérité, deux
 * lecteurs.
 *
 * Ces règles vivaient dans une fonction PRIVÉE de `src/actions/calendar.ts`
 * (`activationBlocker`). Elles ne disaient jamais QUELLE case bloque : « Une
 * case lot n'a pas de stock » sur une grille de 24 à 60 cases oblige à toutes
 * les dérouler. Le module extrait garde le message de l'action MOT POUR MOT —
 * l'action n'a pas changé — mais il rend en plus le `day_index` fautif, ce qui
 * est l'apport principal de l'étape « La vérification » sur ce module.
 *
 * PUR : aucun IO, aucune date implicite.
 */

export const CALENDRIER_BLOCAGE_GRILLE =
  "Le calendrier doit compter au moins une case.";
export const CALENDRIER_BLOCAGE_SANS_CASE =
  "Configurez les cases du calendrier avant de l'activer.";
export const CALENDRIER_BLOCAGE_LOT_SANS_STOCK =
  "Une case lot n'a pas de stock : indiquez le nombre de lots avant d'activer.";
export const CALENDRIER_BLOCAGE_LOT_SANS_LIBELLE =
  "Une case lot n'a pas de libellé : renseignez le lot avant d'activer.";
export const CALENDRIER_BLOCAGE_SPIN_SANS_ROUE =
  "Une case tour de roue n'a pas de roue : choisissez-la avant d'activer.";

/**
 * Une case telle que l'action et la page la lisent. `day_index` est OPTIONNEL :
 * l'action ne le sélectionne pas (son message ne nomme rien), la page le
 * connaît et c'est ce qui lui permet de nommer la case fautive.
 */
export interface CaseCalendrier {
  day_index?: number | null;
  content_type: string;
  reward_stock: number | null;
  reward_label: string;
  target_wheel_id: string | null;
  content_text: string | null;
}

export interface CaseFautive {
  /** `null` quand l'appelant n'a pas fourni l'index (cas de l'action). */
  dayIndex: number | null;
  message: string;
}

/**
 * Ce qui manque à UNE case pour son usage, ou `null` si elle est complète.
 *
 * Ne restent ici que les deux refus qui ont un CHECK SQL derrière eux (lot ⇒
 * stock + libellé, spin ⇒ roue) : sans eux le commerçant récolterait une
 * 23514 brute. Le refus « case message vide » a été RETIRÉ — une case laissée
 * vide est légale en base et signifie « perdu » pour le client ce jour-là ;
 * elle est SIGNALÉE, jamais bloquée (voir `cases-vides` plus bas).
 */
export function refusCase(d: CaseCalendrier): string | null {
  if (d.content_type === "lot") {
    if (d.reward_stock === null) return CALENDRIER_BLOCAGE_LOT_SANS_STOCK;
    if (!d.reward_label.trim()) return CALENDRIER_BLOCAGE_LOT_SANS_LIBELLE;
  }
  if (d.content_type === "spin" && !d.target_wheel_id) {
    return CALENDRIER_BLOCAGE_SPIN_SANS_ROUE;
  }
  return null;
}

/** Une case qui ne donne rien : `content` sans texte — un « pas de chance ». */
export function caseVide(d: CaseCalendrier): boolean {
  return d.content_type === "content" && !(d.content_text ?? "").trim();
}

/** TOUTES les cases incomplètes, dans l'ordre reçu. */
export function casesIncompletes(
  days: readonly CaseCalendrier[],
): CaseFautive[] {
  return days.flatMap((d) => {
    const message = refusCase(d);
    return message ? [{ dayIndex: d.day_index ?? null, message }] : [];
  });
}

/**
 * Calendrier prêt à l'activation ? Message d'erreur sinon (null = OK).
 *
 * Ordre et libellés STRICTEMENT identiques à ceux de l'action d'origine : on
 * rend le refus de la PREMIÈRE case fautive rencontrée, sans la nommer.
 */
export function blocageActivationCalendrier(
  dayCount: number,
  days: readonly CaseCalendrier[],
): string | null {
  if (dayCount < 1) return CALENDRIER_BLOCAGE_GRILLE;
  if (days.length < 1) return CALENDRIER_BLOCAGE_SANS_CASE;
  return casesIncompletes(days)[0]?.message ?? null;
}

// ────────────────────────────────────────────────────────────
// L'étape « La vérification » : les mêmes règles, nommées, plus
// ce que le serveur ne regarde pas.
// ────────────────────────────────────────────────────────────

export interface CaseVerification extends CaseCalendrier {
  day_index: number;
  /** Renseigné par la page pour les cases `spin` : `null` = roue supprimée. */
  roue?: { nom: string; probleme: SpinWheelIssue } | null;
}

export interface EntreeVerificationCalendrier {
  dayCount: number;
  cases: readonly CaseVerification[];
  completionRewardLabel: string;
  completionRewardStock: number;
}

/**
 * Un point de vérification du calendrier : la forme partagée, plus le seul
 * ajout qui lui est propre — les cases fautives, nommées pour un lien direct.
 */
export interface ControleCalendrier
  extends ControleActivation<EtapeCalendrier> {
  /** Cases à corriger, pour un lien direct vers la case nommée. */
  casesLiees?: number[];
}

export interface VerificationCalendrier {
  controles: ControleCalendrier[];
  toutPret: boolean;
  /** Cases complètes sur cases existantes — le compteur « garnies N/M ». */
  garnies: number;
}

/** Une énumération lisible : « 3, 7 et 12 », tronquée au-delà de six. */
function listeCases(indexes: readonly number[]): string {
  const visibles = indexes.slice(0, 6);
  const reste = indexes.length - visibles.length;
  const texte =
    visibles.length > 1
      ? `${visibles.slice(0, -1).join(", ")} et ${visibles[visibles.length - 1]}`
      : String(visibles[0]);
  return reste > 0 ? `${texte} (+ ${reste} autre${reste > 1 ? "s" : ""})` : texte;
}

export function verificationCalendrier(
  entree: EntreeVerificationCalendrier,
): VerificationCalendrier {
  const { dayCount, cases } = entree;
  const fautives = casesIncompletes(cases);
  const garnies = cases.length - fautives.length;
  const controles: ControleCalendrier[] = [];

  const grilleOk = dayCount >= 1 && cases.length >= 1;
  controles.push({
    cle: "grille",
    ok: grilleOk,
    bloquant: true,
    titre: "La grille existe",
    detail: grilleOk
      ? `${cases.length} case${cases.length > 1 ? "s" : ""}, la première s'ouvrant à la date de départ.`
      : dayCount < 1
        ? CALENDRIER_BLOCAGE_GRILLE
        : CALENDRIER_BLOCAGE_SANS_CASE,
    etape: "reglages",
  });

  const indexesFautifs = fautives
    .map((f) => f.dayIndex)
    .filter((i): i is number => i !== null);
  controles.push({
    cle: "cases",
    ok: fautives.length === 0,
    bloquant: true,
    titre: "Chaque case lot ou tour de roue est complète",
    detail:
      fautives.length === 0
        ? `Les ${cases.length} cases sont complètes pour leur usage.`
        : `${garnies} case${garnies > 1 ? "s" : ""} sur ${cases.length} — il manque quelque chose à la case ${listeCases(indexesFautifs)}. ${fautives[0].message}`,
    etape: "cases",
    casesLiees: indexesFautifs,
  });

  // ── Ce que le serveur ne vérifie PAS ──
  // Une case `content` sans texte PASSE l'activation : c'est un « pas de
  // chance » assumé, et le commerçant n'a plus à garnir 24 cases pour publier.
  // Silencieux, donc dit — jamais bloqué.
  const vides = cases.filter(caseVide).map((d) => d.day_index);
  if (vides.length > 0) {
    controles.push({
      cle: "cases-vides",
      ok: false,
      bloquant: false,
      titre: `${vides.length} case${vides.length > 1 ? "s" : ""} sans rien à gagner`,
      detail: `La case ${listeCases(vides)} s'ouvrira sur un « pas de chance » — le calendrier peut s'ouvrir tel quel.`,
      etape: "cases",
      casesLiees: vides,
    });
  }

  // Garde-fou d'assiduité : une grille ENTIÈREMENT vide s'ouvre sans qu'aucune
  // case ne donne quoi que ce soit. Le seul lot atteignable est alors le cadeau
  // d'assiduité — et s'il n'est pas promis non plus, personne ne gagne rien.
  if (cases.length > 0 && vides.length === cases.length) {
    const cadeauFinal =
      entree.completionRewardLabel.trim() !== "" &&
      entree.completionRewardStock > 0;
    controles.push({
      cle: "aucun-gain",
      ok: false,
      bloquant: false,
      titre: "Aucune case ne donne quoi que ce soit",
      detail: cadeauFinal
        ? `Les ${cases.length} cases s'ouvriront toutes sur un « pas de chance » : seul le cadeau d'assiduité reste à gagner.`
        : `Les ${cases.length} cases s'ouvriront toutes sur un « pas de chance », et aucun cadeau d'assiduité n'est promis : personne ne peut rien gagner.`,
      etape: "cases",
      casesLiees: vides,
    });
  }

  // Un stock à 0 PASSE l'activation (l'action ne refuse que `null`) : la case
  // s'ouvre et n'émet rien. C'est légitime — une case peut être mise en pause —
  // mais silencieux, donc on le dit.
  const enPause = cases
    .filter((d) => d.content_type === "lot" && d.reward_stock === 0)
    .map((d) => d.day_index);
  if (enPause.length > 0) {
    controles.push({
      cle: "cases-en-pause",
      ok: false,
      bloquant: false,
      titre: `${enPause.length} case${enPause.length > 1 ? "s" : ""} lot à stock zéro`,
      detail: `La case ${listeCases(enPause)} s'ouvrira sans rien remettre : un stock à 0 met la case en pause. Le calendrier peut s'ouvrir tel quel.`,
      etape: "cases",
      casesLiees: enPause,
    });
  }

  const roueMuette = cases
    .filter(
      (d) =>
        d.content_type === "spin" &&
        d.target_wheel_id !== null &&
        (d.roue === null || (d.roue && d.roue.probleme !== "none")),
    )
    .map((d) => d.day_index);
  if (roueMuette.length > 0) {
    controles.push({
      cle: "roues",
      ok: false,
      bloquant: false,
      titre: "Un tour de roue offert risque de ne rien donner",
      detail: `La roue désignée par la case ${listeCases(roueMuette)} a été supprimée, ou n'a aucun lot tirable en tour offert. Le joueur conserverait son tour sans rien gagner.`,
      etape: "cases",
      casesLiees: roueMuette,
    });
  }

  const libelle = entree.completionRewardLabel.trim();
  if (libelle && entree.completionRewardStock < 1) {
    controles.push({
      cle: "assiduite",
      ok: false,
      bloquant: false,
      titre: "Le cadeau d'assiduité est annoncé mais sans stock",
      detail: `« ${libelle} » est promis au client qui ouvre toutes les cases, mais son stock est à 0 : aucun code ne sera émis.`,
      etape: "reglages",
    });
  }

  return {
    controles,
    toutPret: controles.every((c) => !c.bloquant || c.ok),
    garnies,
  };
}
