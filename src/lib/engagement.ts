import type {
  EngagementAction,
  EngagementConfig,
} from "@/types/database";

export const ENGAGEMENT_ACTIONS: EngagementAction[] = [
  "newsletter",
  "instagram",
  "tiktok",
  "google_review",
];

/** Les actions liens externes (tout sauf la newsletter) exigent une URL. */
export function actionRequiresUrl(action: EngagementAction): boolean {
  return action !== "newsletter";
}

export interface PublicEngagementAction {
  action: EngagementAction;
  /** Présent pour les actions lien (Instagram, TikTok, avis Google). */
  url?: string;
}

/**
 * Actions effectivement proposées au joueur : activées par le
 * commerçant ET correctement configurées (URL présente si requise).
 */
export function enabledEngagementActions(
  config: EngagementConfig | null | undefined,
): PublicEngagementAction[] {
  if (!config) return [];
  return ENGAGEMENT_ACTIONS.flatMap((action) => {
    const entry = config[action];
    if (!entry?.enabled) return [];
    if (actionRequiresUrl(action)) {
      const url = entry.url?.trim();
      if (!url || !url.startsWith("https://")) return [];
      return [{ action, url }];
    }
    return [{ action }];
  });
}
