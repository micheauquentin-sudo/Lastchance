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
 * Dernière barrière avant l'envoi à PostHog, ET LA SEULE : aucune propriété ne
 * doit sortir en portant un secret, qu'il voyage dans le CHEMIN
 * (`/commande/<jeton>`, `/hunt/<jeton>`, `/invite/<jeton>`, `/ticket/<code>`…)
 * ou dans la QUERY (`?token=`).
 *
 * « ET LA SEULE » est le point important, et c'était le défaut : Sentry, lui,
 * branche `masquerJetonUrl` PUIS l'expurgation par nom de paramètre de
 * `sentry-scrub`. Ici il n'y a pas de second poste — `masquerJetonUrl` doit
 * donc couvrir les deux, et c'est désormais le cas.
 *
 * Le balayage porte sur TOUTES les propriétés de type chaîne, pas sur une
 * liste de clés. PostHog en pose une dizaine qui contiennent une URL —
 * `$current_url`, `$pathname`, `$referrer`, `$initial_current_url`,
 * `$prev_pageview_pathname`, `$session_entry_url`… — et en ajoutera d'autres
 * sans nous prévenir ; une liste explicite serait périmée à la prochaine
 * montée de version, silencieusement. `masquerJetonUrl` est un no-op sur tout
 * ce qui ne porte ni préfixe de chemin fermé ni paramètre au nom sensible, le
 * balayage large ne coûte donc rien en fidélité de la donnée.
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
  // `/hunt/<jeton>`, `/invite/<jeton>`, `/ticket/<code>` et
  // `…/recover?token=`, le jeton EST le secret. Sans ce crochet, PostHog en
  // conserve un journal rejouable.
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
    const accorde = () =>
      localStorage.getItem("lc:analytics-consent") === "granted";

    async function applyConsent() {
      if (!accorde()) {
        if (ph?.__loaded) {
          // L'ORDRE COMPTE, et l'inverse est un piège.
          //
          // `reset()` de posthog-js appelle `consent.reset()`, qui EFFACE la
          // préférence de consentement stockée. Appelé APRÈS
          // `opt_out_capturing()`, il annulait donc le refus qu'on venait de
          // poser : la bibliothèque repassait à l'état « pending », c'est-à-dire
          // capture active. Le refus de l'utilisateur ne survivait pas au geste
          // censé l'appliquer. `reset()` d'abord (on jette l'identité et les
          // données de session), le refus ensuite — et il tient.
          ph.reset();
          ph.opt_out_capturing();
        }
        return;
      }
      // Seul endroit du produit où posthog-js est réellement chargé. L'`await`
      // est INCONDITIONNEL, même quand la poignée est déjà peuplée : le module
      // est en cache, l'attente ne coûte rien, et elle garantit que la
      // relecture ci-dessous a toujours lieu APRÈS un tour de boucle — sinon
      // le contrôle de fraîcheur serait actif au premier appel et absent aux
      // suivants, c'est-à-dire justement quand l'utilisateur change d'avis.
      const posthog = await import("posthog-js");
      ph ??= posthog.default;
      // RELU APRÈS L'ATTENTE. Le téléchargement du chunk prend un temps réseau
      // pendant lequel l'utilisateur peut très bien retirer son consentement —
      // le bandeau est à l'écran, c'est même le moment le plus probable. Sans
      // cette seconde lecture, `init` et `opt_in_capturing` s'exécutaient sur
      // une décision périmée de quelques centaines de millisecondes. Le module
      // reste chargé (le code est déjà là, le jeter n'apporte rien) ; ce sont
      // l'initialisation et l'activation qui sont conditionnées.
      if (!accorde()) return;
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
  // `__loaded` dit seulement que la bibliothèque est initialisée — pas que
  // l'utilisateur veut être suivi. Un joueur qui refuse EN COURS DE PARTIE
  // laissait partir tous les événements de la page en cours, jusqu'au
  // rechargement : PostHog était déjà chargé, et rien ici ne relisait sa
  // décision. Le refus doit s'appliquer au tour de roue suivant, pas au
  // prochain chargement de page.
  if (ph?.__loaded && !ph.has_opted_out_capturing()) ph.capture(event, properties);
}
