"use client";

import { useEffect } from "react";
import type { CaptureResult } from "posthog-js";
import { masquerJetonUrl } from "@/lib/masquer-jeton-url";

/**
 * LA POIGNÉE DE MODULE — pourquoi posthog-js n'est plus importé statiquement.
 *
 * `Analytics` est monté par le layout racine, donc sur TOUTES les pages, y
 * compris les dix parcours joueur qui s'ouvrent depuis un QR code en boutique,
 * sur réseau mobile. Un `import posthog from "posthog-js"` en tête de fichier
 * met la bibliothèque dans le lot de départ de chaque page — payée par tout le
 * monde, y compris par les visiteurs qui n'ont pas donné leur consentement et
 * chez qui elle ne sera JAMAIS initialisée.
 *
 * La référence est donc gardée dans une variable de module, peuplée par un
 * `import()` dans la seule branche où le module sert réellement : consentement
 * accordé ET clé publique définie. Deux réflexes ont été écartés :
 *  - `next/dynamic`, qui vise un COMPOSANT à rendre ; ici il n'y a rien à
 *    rendre, `Analytics` retourne `null` ;
 *  - un import déclenché au clic, qui ferait rater les événements précédant
 *    le premier clic et déplacerait le coût réseau au pire moment.
 *
 * `capturePlayEvent` reste un no-op tant que la poignée est vide : un
 * événement émis avant le consentement n'est pas mis en file, il est perdu —
 * ce qui est le comportement voulu, pas une régression.
 */
let ph: typeof import("posthog-js").default | null = null;

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
    async function applyConsent() {
      if (localStorage.getItem("lc:analytics-consent") !== "granted") {
        if (ph?.__loaded) {
          ph.opt_out_capturing();
          ph.reset();
        }
        return;
      }
      // Seul endroit du produit où posthog-js est réellement chargé.
      ph ??= (await import("posthog-js")).default;
      if (!ph.__loaded) {
        ph.init(key!, OPTIONS_POSTHOG);
      }
      ph.opt_in_capturing();
    }
    void applyConsent();
    const surConsentement = () => void applyConsent();
    window.addEventListener("lastchance:analytics-consent", surConsentement);
    return () =>
      window.removeEventListener("lastchance:analytics-consent", surConsentement);
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
  if (ph?.__loaded) ph.capture(event, properties);
}
