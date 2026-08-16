"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import type { CaptureResult } from "posthog-js";
import { masquerJetonUrl } from "@/lib/masquer-jeton-url";

/**
 * Dernière barrière avant l'envoi à PostHog : aucune propriété ne doit sortir
 * en portant un jeton de chemin (`/commande/<jeton>`, `/hunt/<jeton>`,
 * `/invite/<jeton>`).
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
 * Options d'initialisation de PostHog — exportées pour être PROUVÉES par un
 * test, parce que deux d'entre elles sont des mesures de sécurité et pas des
 * réglages de confort.
 */
export const OPTIONS_POSTHOG = {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
  capture_pageview: true,
  persistence: "localStorage" as const,
  // `capture_pageview` envoie l'URL COMPLÈTE : sur `/commande/<jeton>`,
  // `/hunt/<jeton>` et `/invite/<jeton>`, le jeton EST le secret, et il est
  // dans le chemin. Sans ce crochet, PostHog en conserve un journal rejouable.
  before_send: masquerJetonsDeLEvenement,
  // L'ENREGISTREMENT DE SESSION EST COUPÉ ICI, ET PAS SEULEMENT CÔTÉ PROJET.
  //
  // Le rejeu s'active d'un clic dans l'interface PostHog, par n'importe qui
  // ayant accès au projet : laisser la décision là-bas, c'est confier une
  // protection du produit à un réglage distant que rien dans ce dépôt ne
  // mesure. Deux conséquences, s'il était activé :
  //  - les événements `$snapshot` transportent l'URL dans des TABLEAUX, hors
  //    d'atteinte de `before_send` ci-dessus, qui ne balaie que les chaînes de
  //    premier niveau — le jeton repartirait malgré le masquage ;
  //  - le formulaire de remise en caisse serait FILMÉ, saisie comprise.
  disable_session_recording: true,
};

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
        posthog.init(key!, OPTIONS_POSTHOG);
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
