import type { GameType, Wheel } from "@/types/database";

/**
 * L'ÉTAT DU DÉFI D'UNE ROUE — extrait de `wheel-settings.tsx` (VIT-46).
 *
 * ── POURQUOI CE FICHIER EXISTE ──
 *
 * Le studio de la roue règle la MÊME chose que l'étape « Le jeu » de
 * l'atelier : la mécanique, son défi, et combien de fois on joue. Recopier
 * `defautsDefi` et la sérialisation de `skill_config` dans le studio aurait
 * fait DEUX vérités sur la forme attendue par `parseSkillConfig` — et la
 * seconde aurait divergé au premier réglage ajouté, en silence, parce qu'un
 * `skill_config` mal formé ne casse rien : l'action répond « Configuration du
 * jeu invalide » sur un écran, et pas sur l'autre.
 *
 * Rien n'est modifié au passage : c'est le même code, au même endroit
 * logique, avec deux appelants au lieu d'un.
 *
 * ── L'ÉTAT EST TYPÉ PAR MÉCANIQUE, ET REPART DE ZÉRO À CHAQUE BASCULE ──
 *
 * L'écran d'origine initialisait dix `useState` depuis le `skill_config` de la
 * roue SANS regarder à quelle mécanique il appartenait. Or les clés se
 * chevauchent (`tolerance` de l'estimation contre `tolerancePct` de la jauge,
 * `hint` du mot mystère contre `question` de l'estimation) : passer d'estimate
 * à gauge puis revenir faisait réapparaître des valeurs qui n'avaient jamais
 * été saisies pour cette mécanique-là.
 *
 * Ici, la config existante n'est lue que si la mécanique choisie EST celle qui
 * l'a produite. Sinon on repart des défauts — déterministes, et volontairement
 * jouables : une estimation neuve arrive à 100 ± 10, pas vide.
 */

/** Config skill_config existante (jsonb) telle que chargée pour cette roue. */
export type RawSkillConfig = Record<string, unknown> | null;

export function readRaw(wheel: Wheel): RawSkillConfig {
  const raw = (wheel as { skill_config?: RawSkillConfig }).skill_config ?? null;
  return raw && typeof raw === "object" ? raw : null;
}

function str(raw: RawSkillConfig, key: string): string {
  const v = raw?.[key];
  return v == null ? "" : String(v);
}

export type EtatDefi = {
  reflexDuration: string;
  gaugeTolerance: string;
  mwWord: string;
  mwHint: string;
  estQuestion: string;
  estTarget: string;
  estTolerance: string;
  estUnit: string;
  estImageUrl: string;
  puzzleFragments: string;
};

export const DEFI_VIDE: EtatDefi = {
  reflexDuration: "1500",
  gaugeTolerance: "15",
  mwWord: "",
  mwHint: "",
  estQuestion: "",
  estTarget: "100",
  estTolerance: "10",
  estUnit: "",
  estImageUrl: "",
  puzzleFragments: "",
};

export function defautsDefi(
  gameType: GameType,
  raw: RawSkillConfig,
): EtatDefi {
  if (!raw) return { ...DEFI_VIDE };
  switch (gameType) {
    case "reflex":
      return { ...DEFI_VIDE, reflexDuration: str(raw, "durationMs") || DEFI_VIDE.reflexDuration };
    case "gauge":
      return { ...DEFI_VIDE, gaugeTolerance: str(raw, "tolerancePct") || DEFI_VIDE.gaugeTolerance };
    case "mystery_word":
      return { ...DEFI_VIDE, mwWord: str(raw, "word"), mwHint: str(raw, "hint") };
    case "estimate":
      return {
        ...DEFI_VIDE,
        estQuestion: str(raw, "question"),
        estTarget: str(raw, "target") || DEFI_VIDE.estTarget,
        estTolerance: str(raw, "tolerance") || DEFI_VIDE.estTolerance,
        estUnit: str(raw, "unit"),
        estImageUrl: str(raw, "imageUrl"),
      };
    case "puzzle":
      return {
        ...DEFI_VIDE,
        puzzleFragments: Array.isArray(raw.fragments)
          ? (raw.fragments as unknown[]).map(String).join("\n")
          : "",
      };
    default:
      return { ...DEFI_VIDE };
  }
}

/**
 * Sérialise `skill_config` selon le `game_type`. Vide pour les jeux non-skill
 * (et pour rps qui n'a aucun réglage) : l'action remet alors `skill_config` à
 * null. Miroir EXACT de la forme Zod de `parseSkillConfig` — les nombres
 * restent en texte, `z.coerce` s'en charge côté serveur (et signale les
 * erreurs).
 */
export function serialiserDefi(gameType: GameType, defi: EtatDefi): string {
  switch (gameType) {
    case "reflex":
      return JSON.stringify({ durationMs: defi.reflexDuration });
    case "gauge":
      return JSON.stringify({ tolerancePct: defi.gaugeTolerance });
    case "mystery_word":
      return JSON.stringify({ word: defi.mwWord, hint: defi.mwHint });
    case "estimate":
      return JSON.stringify({
        target: defi.estTarget,
        tolerance: defi.estTolerance,
        question: defi.estQuestion,
        unit: defi.estUnit,
        imageUrl: defi.estImageUrl,
      });
    case "puzzle": {
      const fragments = defi.puzzleFragments
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      // Ordre attendu = ordre de saisie (identité) : le joueur doit
      // reconstituer la séquence telle que renseignée ici.
      return JSON.stringify({ fragments, order: fragments.map((_, i) => i) });
    }
    // rps + tous les jeux non-skill : aucun réglage à persister.
    default:
      return "";
  }
}
