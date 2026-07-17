"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * PostHog — ne s'active que si NEXT_PUBLIC_POSTHOG_KEY est défini.
 * Pageviews automatiques ; capture d'événements via capturePlayEvent().
 */
export function Analytics() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    function applyConsent() {
      if (localStorage.getItem("lc:analytics-consent") !== "granted") {
        if (posthog.__loaded) {
          posthog.opt_out_capturing();
          posthog.reset();
        }
        return;
      }
      if (!posthog.__loaded) {
        posthog.init(key!, {
          api_host:
            process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
          capture_pageview: true,
          persistence: "localStorage",
        });
      }
      posthog.opt_in_capturing();
    }
    applyConsent();
    window.addEventListener("lastchance:analytics-consent", applyConsent);
    return () =>
      window.removeEventListener("lastchance:analytics-consent", applyConsent);
  }, []);

  return null;
}

/** Capture un événement du parcours de jeu (no-op si PostHog inactif). */
export function capturePlayEvent(
  event:
    | "wheel_spun"
    | "prize_won"
    | "prize_claimed"
    | "engagement_completed"
    | "shared",
  properties?: Record<string, string | number | boolean>,
) {
  if (posthog.__loaded) posthog.capture(event, properties);
}
