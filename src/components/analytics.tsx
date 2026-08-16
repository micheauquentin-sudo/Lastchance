"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import type { CaptureResult } from "posthog-js";
import { masquerJetonUrl } from "@/lib/masquer-jeton-url";

/**
 * Dernière barrière avant l'envoi à PostHog : aucune propriété ne doit sortir
 * en portant un jeton de chemin (`/commande/<jeton>`, `/hunt/<jeton>`).
 *
 * Le balayage porte sur TOUTES les propriétés de type chaîne, pas sur une
 * liste de clés. PostHog en pose une dizaine qui contiennent une URL —
 * `$current_url`, `$pathname`, `$referrer`, `$initial_current_url`,
 * `$prev_pageview_pathname`, `$session_entry_url`… — et en ajoutera d'autres
 * sans nous prévenir ; une liste explicite serait périmée à la prochaine
 * montée de version, silencieusement. `masquerJetonUrl` est un no-op sur tout
 * ce qui ne contient pas l'un des deux préfixes fermés, le balayage large ne
 * coûte donc rien en fidélité de la donnée.
 */
export function masquerJetonsDeLEvenement(evenement: CaptureResult | null) {
  if (!evenement?.properties) return evenement;
  for (const [cle, valeur] of Object.entries(evenement.properties)) {
    if (typeof valeur === "string") {
      evenement.properties[cle] = masquerJetonUrl(valeur);
    }
  }
  return evenement;
}

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
          // `capture_pageview` envoie l'URL COMPLÈTE : sur `/commande/<jeton>`
          // et `/hunt/<jeton>`, le jeton EST le secret, et il est dans le
          // chemin. Sans ce crochet, PostHog en conserve un journal rejouable.
          before_send: masquerJetonsDeLEvenement,
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
