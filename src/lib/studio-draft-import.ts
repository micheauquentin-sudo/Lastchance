import { z } from "zod";

export const STUDIO_MODULES = [
  "vitrine",
  "roue",
  "pronostics",
  "fidelite",
  "calendrier",
] as const;

export type StudioModule = (typeof STUDIO_MODULES)[number];

const STUDIO_MODULE_DESTINATIONS: Record<StudioModule, string> = {
  vitrine: "/vitrine-studio",
  roue: "/dashboard/campaigns",
  pronostics: "/dashboard/pronostics",
  fidelite: "/dashboard/loyalty",
  calendrier: "/dashboard/calendar",
};

const STUDIO_MODULE_LABELS: Record<StudioModule, string> = {
  vitrine: "Vitrine",
  roue: "Roue & jeux",
  pronostics: "Pronostics",
  fidelite: "Fidélité",
  calendrier: "Calendrier",
};

const rawDraftSchema = z
  .object({
    lastModule: z.string().optional(),
    vitrine: z
      .object({
        nom: z.string().max(120).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ParsedStudioDraft = {
  organizationName: string | null;
  activeModule: StudioModule | null;
};

/** Valide un identifiant de module issu du Studio public (`studio.js`). */
export function parseStudioModule(raw: unknown): StudioModule | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return (STUDIO_MODULES as readonly string[]).includes(trimmed)
    ? (trimmed as StudioModule)
    : null;
}

/** Retourne la destination post-onboarding pour un module du Studio public. */
export function studioModuleDestination(mod: StudioModule | null): string {
  return mod ? STUDIO_MODULE_DESTINATIONS[mod] : "/dashboard";
}

/** Libellé lisible du module pour les bandeaux de continuité. */
export function studioModuleLabel(mod: StudioModule): string {
  return STUDIO_MODULE_LABELS[mod];
}

/**
 * Extrait en toute sécurité le nom d'établissement et le module actif depuis
 * les clés `localStorage` écrites par `public/h-site-final-20k/studio.js`.
 */
export function parseLocalStudioDraft(
  rawDraftJson: string | null,
  rawActiveModule: string | null,
): ParsedStudioDraft | null {
  let organizationName: string | null = null;
  let fromDraftModule: StudioModule | null = null;

  if (rawDraftJson) {
    try {
      const json: unknown = JSON.parse(rawDraftJson);
      const parsed = rawDraftSchema.safeParse(json);
      if (parsed.success) {
        const nom = parsed.data.vitrine?.nom?.trim();
        if (nom && nom.length >= 2) {
          organizationName = nom.slice(0, 120);
        }
        fromDraftModule = parseStudioModule(parsed.data.lastModule);
      }
    } catch {
      // JSON corrompu ignoré silencieusement.
    }
  }

  const activeModule = parseStudioModule(rawActiveModule) ?? fromDraftModule;
  if (!organizationName && !activeModule) return null;
  return { organizationName, activeModule };
}
