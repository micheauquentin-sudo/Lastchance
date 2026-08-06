import {
  estClotureeAventure,
  type KindAventure,
  type MarqueursParKind,
} from "@/lib/experience-lifecycle";
import { parseScoring } from "@/lib/pronostics";
import { getExperienceBlueprintAdapter } from "@/platform/experiences/templates/adapters";
import { blueprintRewardsSchema } from "@/platform/experiences/templates/schemas";

/**
 * « RELANCER UNE FORMULE » — le sérialiseur, et rien d'autre.
 *
 * Le cahier §5 le décrit en une phrase : « repartir d'une animation réussie
 * vers un brouillon propre pour Noël, soldes, match ou anniversaire ». Le
 * moteur d'application existe déjà (`apply_experience_blueprint_version`) ;
 * ce qui manquait est la marche AVANT : transformer une instance vivante en
 * configuration de modèle. C'est le miroir exact de `saveCampaignAsTemplate`,
 * pour les six kinds que le moteur universel sait appliquer.
 *
 * ── CE QUI NE PASSE PAS, ET C'EST STRUCTUREL ──
 *
 * Les schémas de `templates/schemas.ts` sont la LISTE BLANCHE. Ils n'acceptent
 * ni participants, ni gagnants, ni scans, ni codes de retrait, ni jetons
 * d'étape : une configuration qui en transporterait serait refusée à la
 * validation, ici, avant toute écriture. On ne s'appuie donc pas sur la
 * discipline du rédacteur pour garantir qu'aucune donnée joueur ne fuit d'une
 * animation vers la suivante — on s'appuie sur un schéma qui les refuse.
 *
 * Trois autres choses ne passent pas, par construction du moteur d'application
 * plutôt que par oubli : les jetons de QR (`hunt_steps.token` est régénéré), les
 * slugs publics (régénérés), et le secret tournant d'un passeport (jamais lu —
 * la colonne est révoquée aux sessions marchandes).
 *
 * ── LES IDENTIFIANTS D'OPTION SONT RENUMÉROTÉS ──
 *
 * Le quiz du dépôt admet `^[A-Za-z0-9_-]{1,40}$` pour un identifiant d'option
 * (`OPTION_ID_PATTERN`), le blueprint `^[a-z0-9_-]{1,32}$`. Un quiz réel dont
 * les options s'appellent « A » et « B » serait donc REFUSÉ à la copie — pour
 * une clé interne que personne ne lit. On renumérote en `o1`, `o2`… et on
 * remappe la bonne réponse avec, plutôt que de rejeter une animation valide au
 * nom d'une divergence de casse.
 */

export type EtatSourceRelance = "completed" | "not_completed";

/**
 * Une animation peut-elle servir de point de départ ?
 *
 * Un seul critère : elle est TERMINÉE. Relancer une animation en cours
 * fabriquerait deux animations concurrentes du même module, dont la seconde
 * n'a aucun public — et le commerçant a déjà « Dupliquer » pour ce geste-là.
 *
 * Le prédicat est celui de la Carte de l'Aventure, importé et non recopié : si
 * la carte affiche « Clôturée », le bouton doit fonctionner, et inversement.
 */
export function etatSourceRelance<K extends KindAventure>(
  kind: K,
  marqueurs: MarqueursParKind[K],
  maintenant: Date = new Date(),
): EtatSourceRelance {
  const complet = { kind, ...marqueurs } as Parameters<typeof estClotureeAventure>[0];
  return estClotureeAventure(complet, maintenant) ? "completed" : "not_completed";
}

// ── Les six sources sérialisables ────────────────────────────

/** Une question de quiz telle qu'elle est stockée. */
export interface LigneQuestionQuiz {
  position: number;
  question_type: string;
  prompt: string;
  options: unknown;
  correct_answer: unknown;
  preset: string;
  time_limit_seconds: number | null;
  points: number;
}

export interface SourceRelanceParKind {
  quiz: {
    name: string;
    theme: string;
    intro_text: string | null;
    reward_label: string;
    reward_details: string | null;
    reward_stock: number;
    questions: readonly LigneQuestionQuiz[];
  };
  hunt: {
    name: string;
    order_mode: string;
    min_scan_interval_seconds: number;
    reward_label: string;
    reward_details: string | null;
    reward_stock: number | null;
    steps: readonly { position: number; label: string; hint_text: string | null }[];
  };
  calendar: {
    name: string;
    theme: string;
    merchant_content: string | null;
    completion_reward_label: string;
    completion_reward_details: string | null;
    completion_reward_stock: number;
    days: readonly {
      day_index: number;
      content_text: string | null;
      is_special: boolean;
    }[];
  };
  loyalty: {
    name: string;
    validation_mode: string;
    rotating_period_seconds: number;
    min_stamp_interval_seconds: number;
    silver_threshold: number;
    gold_threshold: number;
    milestones: readonly {
      position: number;
      visit_count: number;
      reward_type: string;
      reward_label: string;
      reward_details: string | null;
      reward_stock: number | null;
    }[];
  };
  event: {
    name: string;
    session_label: string | null;
    reward_label: string;
    reward_details: string | null;
    reward_stock: number;
    questions: readonly {
      position: number;
      question_type: string;
      prompt: string;
      time_limit_seconds: number;
      points_base: number;
      options: readonly { position: number; label: string; is_correct: boolean }[];
    }[];
  };
  pronostics: {
    name: string;
    competition_key: string;
    event_kind: string;
    collect_email: boolean;
    collect_phone: boolean;
    scoring: unknown;
    matches: readonly {
      position: number;
      home_name: string;
      away_name: string;
      kickoff_at: string;
    }[];
  };
}

export type KindRelance = keyof SourceRelanceParKind;

export type SourceRelance = {
  [K in KindRelance]: { kind: K } & SourceRelanceParKind[K];
}[KindRelance];

export const KINDS_RELANCE = [
  "quiz",
  "hunt",
  "calendar",
  "loyalty",
  "event",
  "pronostics",
] as const satisfies readonly KindRelance[];

export type DotationBlueprint = ReturnType<
  typeof blueprintRewardsSchema.parse
>[number];

export type ResultatSerialisation =
  | { ok: true; configuration: unknown; defaultRewards: DotationBlueprint[] }
  | { ok: false; error: string };

const REFUS_GENERIQUE =
  "Cette animation ne peut pas être recopiée telle quelle";

function parOrdre<T extends { position: number }>(lignes: readonly T[]): T[] {
  return [...lignes].sort((a, b) => a.position - b.position);
}

/**
 * Une dotation `primary`, ou aucune.
 *
 * Le moteur d'application lit la PREMIÈRE dotation dont l'emplacement est
 * `primary`, `completion` ou `session` pour en faire le lot du module. Un
 * libellé vide veut dire « ce module ne remet rien » : on n'invente pas une
 * dotation sans nom, elle referait surface à l'application sous la forme d'un
 * lot fantôme.
 */
function dotationPrincipale(
  label: string,
  details: string | null,
  stock: number | null,
): DotationBlueprint[] {
  const libelle = label.trim();
  if (!libelle) return [];
  const dotation: DotationBlueprint = {
    slot: "primary",
    label: libelle,
    stock: Math.max(0, stock ?? 0),
  };
  const precision = details?.trim();
  if (precision) dotation.details = precision;
  return [dotation];
}

const HEURE_MS = 60 * 60 * 1000;
/** Le premier match d'une relance est posé à J+1, pas dans le passé. */
const DECALAGE_PREMIER_MATCH_HEURES = 24;
const DECALAGE_MAX_HEURES = 8_760;

/**
 * Convertit des coups d'envoi ABSOLUS (donc passés) en décalages relatifs.
 *
 * Le blueprint ne stocke que des offsets — c'est ce qui rend un modèle
 * réutilisable en décembre comme en juin. On conserve l'ÉCART entre les
 * matchs, en reposant le premier à J+1 : une journée de championnat recopiée
 * garde son rythme (samedi, samedi, dimanche) sans réclamer une ressaisie.
 */
function decalagesDeCoupDenvoi(
  matchs: readonly { kickoff_at: string }[],
): number[] {
  const premier = Date.parse(matchs[0]?.kickoff_at ?? "");
  return matchs.map((match) => {
    const instant = Date.parse(match.kickoff_at);
    if (!Number.isFinite(premier) || !Number.isFinite(instant)) {
      return DECALAGE_PREMIER_MATCH_HEURES;
    }
    const ecart = Math.round((instant - premier) / HEURE_MS);
    return Math.min(
      DECALAGE_MAX_HEURES,
      Math.max(1, DECALAGE_PREMIER_MATCH_HEURES + ecart),
    );
  });
}

/** Le brut, avant validation. Chaque branche parle le vocabulaire du schéma. */
function configurationBrute(source: SourceRelance): {
  configuration: unknown;
  defaultRewards: DotationBlueprint[];
} {
  switch (source.kind) {
    case "quiz": {
      const questions = parOrdre(source.questions)
        // Seules les questions à choix sont représentables : le blueprint
        // n'a ni classement, ni tolérance, ni saisie libre.
        .filter((question) => question.question_type === "choice")
        .map((question) => {
          const brutes = Array.isArray(question.options) ? question.options : [];
          const options: { id: string; label: string }[] = [];
          const remap = new Map<string, string>();
          brutes.forEach((option, index) => {
            if (typeof option !== "object" || option === null) return;
            const champ = option as Record<string, unknown>;
            const label = typeof champ.label === "string" ? champ.label : "";
            const identifiant = `o${index + 1}`;
            if (typeof champ.id === "string") remap.set(champ.id, identifiant);
            options.push({ id: identifiant, label });
          });
          const veriteBrute =
            typeof question.correct_answer === "string" ? question.correct_answer : "";
          return {
            prompt: question.prompt,
            options,
            correct_option_id: remap.get(veriteBrute) ?? veriteBrute,
            preset: question.preset,
            points: question.points,
            ...(question.time_limit_seconds !== null
              ? { time_limit_seconds: question.time_limit_seconds }
              : {}),
          };
        });
      return {
        configuration: {
          name: source.name,
          theme: source.theme,
          questions,
          ...(source.intro_text ? { intro_text: source.intro_text } : {}),
        },
        defaultRewards: dotationPrincipale(
          source.reward_label,
          source.reward_details,
          source.reward_stock,
        ),
      };
    }

    case "hunt":
      return {
        configuration: {
          name: source.name,
          order_mode: source.order_mode,
          min_scan_interval_seconds: source.min_scan_interval_seconds,
          // Les jetons ne sont PAS recopiés : l'application en régénère.
          steps: parOrdre(source.steps).map((etape) => ({
            label: etape.label,
            ...(etape.hint_text ? { hint_text: etape.hint_text } : {}),
          })),
        },
        defaultRewards: dotationPrincipale(
          source.reward_label,
          source.reward_details,
          source.reward_stock,
        ),
      };

    case "calendar":
      return {
        configuration: {
          name: source.name,
          theme: source.theme,
          // La relance démarre AUJOURD'HUI : la date d'origine est par
          // définition passée, la recopier créerait un calendrier déjà fini.
          start_offset_days: 0,
          days: [...source.days]
            .sort((a, b) => a.day_index - b.day_index)
            .map((jour) => ({
              content_text: jour.content_text ?? "",
              is_special: jour.is_special,
            })),
          ...(source.merchant_content
            ? { merchant_content: source.merchant_content }
            : {}),
        },
        defaultRewards: dotationPrincipale(
          source.completion_reward_label,
          source.completion_reward_details,
          source.completion_reward_stock,
        ),
      };

    case "loyalty":
      return {
        configuration: {
          name: source.name,
          validation_mode: source.validation_mode,
          rotating_period_seconds: source.rotating_period_seconds,
          min_stamp_interval_seconds: source.min_stamp_interval_seconds,
          silver_threshold: source.silver_threshold,
          gold_threshold: source.gold_threshold,
          milestones: parOrdre(source.milestones)
            // Un palier en POINTS n'est pas un lot : le moteur d'application
            // écrit `reward_type = 'lot'` pour tous, y transporter un palier
            // en points le transformerait en objet de comptoir.
            .filter((palier) => palier.reward_type === "lot")
            .map((palier) => ({
              visit_count: palier.visit_count,
              label: palier.reward_label,
              stock: Math.max(0, palier.reward_stock ?? 0),
              ...(palier.reward_details ? { details: palier.reward_details } : {}),
            })),
        },
        // Les dotations d'un passeport vivent dans ses paliers : une dotation
        // de tête serait ignorée par le moteur d'application.
        defaultRewards: [],
      };

    case "event":
      return {
        configuration: {
          name: source.name,
          questions: parOrdre(source.questions).map((question) => ({
            type: question.question_type,
            prompt: question.prompt,
            time_limit_seconds: question.time_limit_seconds,
            points_base: question.points_base,
            options: parOrdre(question.options).map((option) => ({
              label: option.label,
              is_correct: option.is_correct,
            })),
          })),
          ...(source.session_label ? { session_label: source.session_label } : {}),
        },
        defaultRewards: dotationPrincipale(
          source.reward_label,
          source.reward_details,
          source.reward_stock,
        ),
      };

    case "pronostics": {
      const matchs = parOrdre(source.matches);
      const decalages = decalagesDeCoupDenvoi(matchs);
      // `parseScoring` rend aussi les barèmes GÉNÉRIQUES (questions non
      // sportives) ; le schéma du blueprint est `.strict()` et n'en connaît
      // que trois. On projette plutôt que d'élargir un schéma partagé.
      const bareme = parseScoring(source.scoring);
      return {
        configuration: {
          name: source.name,
          competition_key: source.competition_key,
          event_kind: source.event_kind,
          collect_email: source.collect_email,
          collect_phone: source.collect_phone,
          scoring: {
            exact: bareme.exact,
            diff: bareme.diff,
            winner: bareme.winner,
          },
          matches: matchs.map((match, index) => ({
            home_name: match.home_name,
            away_name: match.away_name,
            kickoff_offset_hours: decalages[index],
          })),
        },
        // L'échelle de récompenses d'un concours porte des PLAGES de rangs
        // (`{from, to, label}`) que le format de dotation ne sait pas dire : le
        // moteur d'application relit chaque entrée comme un rang unique. La
        // recopier écraserait « du 1er au 3e » en « 1er » sans le dire — on
        // préfère laisser le commerçant reposer son échelle.
        defaultRewards: [],
      };
    }
  }
}

/**
 * Instance vivante → configuration de modèle, VALIDÉE.
 *
 * La validation n'est pas une politesse : c'est elle qui garantit qu'aucune
 * donnée joueur ne peut sortir d'ici, et que le blueprint créé sera applicable.
 * Un refus est rendu au commerçant tel quel, avec la raison du schéma.
 */
export function serialiserRelance(source: SourceRelance): ResultatSerialisation {
  const { configuration, defaultRewards } = configurationBrute(source);

  const adapter = getExperienceBlueprintAdapter(source.kind);
  const valide = adapter.configurationSchema.safeParse(configuration);
  if (!valide.success) {
    return {
      ok: false,
      error: `${REFUS_GENERIQUE} : ${valide.error.issues[0]?.message ?? "configuration invalide"}.`,
    };
  }

  const dotations = blueprintRewardsSchema.safeParse(defaultRewards);
  if (!dotations.success) {
    return {
      ok: false,
      error: `${REFUS_GENERIQUE} : ${dotations.error.issues[0]?.message ?? "dotations invalides"}.`,
    };
  }

  return {
    ok: true,
    // La valeur VALIDÉE, pas le brut : ce qui sort d'ici a traversé la liste
    // blanche, clé par clé.
    configuration: valide.data,
    defaultRewards: dotations.data,
  };
}
