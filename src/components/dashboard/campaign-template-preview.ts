import { getPreset } from "@/lib/wheel-style";

/**
 * Place de marché de campagnes — RÉSUMÉ D'AFFICHAGE d'un blueprint.
 *
 * Module PUR (aucune I/O, aucun JSX) : il transforme un blueprint en sept
 * lignes lisibles par un commerçant — les sept promesses d'un modèle :
 * visuel, jeu, textes, lots suggérés, emails, durée, règles.
 *
 * Il lit DÉFENSIVEMENT : un modèle privé est un `jsonb` écrit par une
 * version antérieure du produit, éventuellement incomplet. Une vignette ne
 * doit jamais faire tomber la page des campagnes — quand la forme est
 * inutilisable, `summarizeBlueprint` renvoie `null` et la carte affiche un
 * message plutôt qu'une erreur de rendu. La validation SÉRIEUSE reste celle
 * de l'action (`campaignBlueprintSchema`), rejouée à l'application.
 */

/** Les sept promesses, prêtes à afficher. */
export interface TemplatePromises {
  /** Préréglage visuel, en clair (« Kermesse », « Néon »…). */
  visual: string;
  /** Mécanique de jeu, en clair (« Roue », « Carte à gratter »…). */
  game: string;
  /** L'accroche vue par le joueur. */
  texts: string;
  /** « 4 lots gagnants + 1 lot perdant ». */
  prizes: string;
  /** Les premiers libellés de lots, pour donner le ton. */
  prizeLabels: string[];
  /** Nombre de lots au-delà de `prizeLabels`. */
  prizeOverflow: number;
  /** « 3 textes fournis : annonce, gagnant, rappel » ou « Aucun texte ». */
  emails: string;
  /** Nombre de textes d'email (0 = pas de mention « non activés »). */
  emailCount: number;
  /** « 14 jours ». */
  duration: string;
  /** Règles en pastilles : participation, données demandées, code… */
  rules: string[];
}

/** Libellés des 15 mécaniques (miroir de `GAME_TYPES` de wheel-settings). */
const GAME_LABELS: Record<string, string> = {
  wheel: "Roue",
  scratch: "Carte à gratter",
  flip_card: "Carte retournée",
  cups: "Bonneteau (3 gobelets)",
  slot: "Machine à sous",
  memory: "Memory",
  chest: "Coffre à choisir",
  dice: "Lancer de dé",
  draw_card: "Tirage d'une carte",
  rps: "Pierre-feuille-ciseaux",
  reflex: "Jeu de réflexe",
  gauge: "Jauge à arrêter",
  puzzle: "Puzzle simple",
  mystery_word: "Mot mystère",
  estimate: "Estimation d'un nombre",
};

/** Libellés des limites de participation (miroir de `LIMITS`). */
const LIMIT_LABELS: Record<string, string> = {
  once: "1 participation par personne",
  daily: "1 participation par jour",
  weekly: "1 participation par semaine",
  unlimited: "Participations illimitées",
};

const MOMENT_LABELS: Record<string, string> = {
  annonce: "annonce",
  gagnant: "gagnant",
  rappel: "rappel",
  fin: "fin",
};

/** Nombre de libellés de lots montrés avant le « + N ». */
const PRIZE_PREVIEW_COUNT = 3;

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Bag)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/**
 * Blueprint (forme libre) → sept promesses affichables.
 * `null` si le jsonb ne ressemble pas à un blueprint exploitable.
 */
export function summarizeBlueprint(raw: unknown): TemplatePromises | null {
  const blueprint = bag(raw);
  if (!blueprint) return null;

  const texts = bag(blueprint.texts);
  const visual = bag(blueprint.visual);
  const game = bag(blueprint.game);
  const rules = bag(blueprint.rules);
  const prizes = Array.isArray(blueprint.prizes) ? blueprint.prizes : [];
  const emails = Array.isArray(blueprint.emails) ? blueprint.emails : [];
  if (!prizes.length) return null;

  const gameType = text(game?.game_type);
  const presetKey = text(visual?.preset);
  const preset = presetKey ? getPreset(presetKey) : undefined;

  const prizeRows = prizes.map((prize) => bag(prize)).filter((p): p is Bag => p !== null);
  const winners = prizeRows.filter((prize) => prize.is_losing !== true);
  const losers = prizeRows.length - winners.length;

  const durationDays =
    typeof blueprint.durationDays === "number" && Number.isFinite(blueprint.durationDays)
      ? Math.round(blueprint.durationDays)
      : 0;

  const moments = emails
    .map((email) => MOMENT_LABELS[text(bag(email)?.moment)] ?? "")
    .filter(Boolean);

  const ruleChips: string[] = [];
  const limit = LIMIT_LABELS[text(rules?.play_limit)];
  if (limit) ruleChips.push(limit);
  if (rules?.collect_email === true) ruleChips.push("Email demandé");
  if (rules?.collect_phone === true) ruleChips.push("Téléphone demandé");
  if (typeof rules?.code_ttl_seconds === "number" && rules.code_ttl_seconds > 0) {
    const seconds = rules.code_ttl_seconds;
    ruleChips.push(
      seconds >= 60
        ? `Code valable ${Math.round(seconds / 60)} min`
        : `Code valable ${seconds} s`,
    );
  }
  if (typeof rules?.budget_cents === "number" && rules.budget_cents > 0) {
    ruleChips.push(`Budget ${Math.round(rules.budget_cents / 100)} €`);
  }
  if (!ruleChips.length) ruleChips.push("Règles par défaut");

  return {
    visual: preset?.label ?? (presetKey ? `Préréglage « ${presetKey} »` : "Visuel par défaut"),
    game: GAME_LABELS[gameType] ?? "Jeu",
    texts: text(texts?.wheelTitle) || "Accroche à personnaliser",
    prizes: losers
      ? `${plural(winners.length, "lot gagnant", "lots gagnants")} + ${plural(losers, "lot perdant", "lots perdants")}`
      : plural(winners.length, "lot gagnant", "lots gagnants"),
    prizeLabels: winners
      .slice(0, PRIZE_PREVIEW_COUNT)
      .map((prize) => text(prize.label))
      .filter(Boolean),
    prizeOverflow: Math.max(0, winners.length - PRIZE_PREVIEW_COUNT),
    emails: moments.length
      ? `${plural(moments.length, "texte fourni", "textes fournis")} : ${moments.join(", ")}`
      : "Aucun texte d'email fourni",
    emailCount: moments.length,
    duration: durationDays > 0 ? plural(durationDays, "jour") : "Durée à définir",
    rules: ruleChips,
  };
}
