// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * PostHog est branché avec `capture_pageview: true` sur le layout RACINE :
 * chaque page vue envoie l'URL COMPLÈTE. Deux routes portent leur secret dans
 * le chemin (`/commande/<jeton>`, `/hunt/<jeton>`), et un jeton conservé dans
 * les journaux d'un tiers reste rejouable — c'est une commande encaissable ou
 * une étape de chasse tamponnable à la place du joueur.
 *
 * Ce fichier verrouille le crochet `before_send`, sur la charge telle que
 * PostHog la construit.
 */

// posthog-js n'est pas exercé ici : le module est importé pour ses effets de
// bord au chargement, on ne veut ni son runtime navigateur ni son poids.
vi.mock("posthog-js", () => ({ default: {} }));

import { masquerJetonsDeLEvenement } from "./analytics";
import type { CaptureResult } from "posthog-js";

const JETON = "7bd21ac9-QRCODE-11";

function pageview(properties: Record<string, unknown>): CaptureResult {
  return {
    event: "$pageview",
    properties,
    timestamp: new Date(),
    uuid: "0199aa00-0000-7000-8000-000000000000",
  };
}

describe("masquerJetonsDeLEvenement", () => {
  it("masque le jeton dans les trois propriétés d'URL du pageview", () => {
    const evenement = masquerJetonsDeLEvenement(
      pageview({
        $current_url: `https://app.lastchance.fr/commande/${JETON}`,
        $pathname: `/commande/${JETON}`,
        $referrer: `https://app.lastchance.fr/hunt/${JETON}`,
      }),
    );

    const proprietes = evenement!.properties!;
    expect(proprietes.$current_url).toBe(
      "https://app.lastchance.fr/commande/[jeton]",
    );
    expect(proprietes.$pathname).toBe("/commande/[jeton]");
    expect(proprietes.$referrer).toBe("https://app.lastchance.fr/hunt/[jeton]");
    expect(JSON.stringify(evenement)).not.toContain(JETON);
  });

  it("couvre AUSSI les propriétés d'URL que PostHog ajoutera demain", () => {
    // Le balayage porte sur toutes les chaînes, pas sur une liste de clés :
    // `$initial_current_url` et compagnie apparaissent au fil des versions du
    // SDK, et une liste explicite serait périmée sans que rien ne rougisse.
    const evenement = masquerJetonsDeLEvenement(
      pageview({
        $initial_current_url: `https://app.lastchance.fr/hunt/${JETON}`,
        $prev_pageview_pathname: `/commande/${JETON}`,
        une_cle_inventee: `/hunt/${JETON}`,
      }),
    );

    expect(JSON.stringify(evenement)).not.toContain(JETON);
  });

  it("laisse intacte toute propriété sans jeton de chemin", () => {
    const evenement = masquerJetonsDeLEvenement(
      pageview({
        $current_url: "https://app.lastchance.fr/dashboard/participations?page=2",
        $screen_height: 844,
        $browser: "Mobile Safari",
        campagne: "Roue de l'été",
      }),
    );

    const proprietes = evenement!.properties!;
    expect(proprietes.$current_url).toBe(
      "https://app.lastchance.fr/dashboard/participations?page=2",
    );
    expect(proprietes.$screen_height).toBe(844);
    expect(proprietes.$browser).toBe("Mobile Safari");
    expect(proprietes.campagne).toBe("Roue de l'été");
  });

  it("laisse passer un événement vide ou nul sans lever", () => {
    // `before_send` est appelé sur CHAQUE événement, y compris ceux qu'un autre
    // crochet a déjà annulés : lever ici casserait toute la capture.
    expect(masquerJetonsDeLEvenement(null)).toBeNull();
    expect(() => masquerJetonsDeLEvenement(pageview({}))).not.toThrow();
    // Charge SANS `properties` : le type de PostHog la déclare obligatoire,
    // mais c'est justement la garde `!evenement?.properties` qu'on veut voir
    // tenir si le SDK livre un jour une charge amputée.
    // unsafe-cast-justification: fabriquer une charge que le type interdit oblige à sortir du type.
    const ampute = { event: "$pageview", uuid: "x" } as unknown as CaptureResult;
    expect(() => masquerJetonsDeLEvenement(ampute)).not.toThrow();
  });
});
