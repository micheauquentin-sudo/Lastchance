import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { messageAccesCampagne } from "@/lib/message-acces-campagne";

/**
 * DEUX CAUSES, DEUX PHRASES.
 *
 * `hasActiveAccess` répond « non » pour quatre vécus ; le refus d'activation
 * était écrit en dur sur un seul. Le témoin de ce défaut existe un cran plus
 * haut, `src/lib/subscription.test.ts` : « annoncerait *votre essai gratuit est
 * terminé* à un client qui a payé pendant deux ans ».
 */
describe("messageAccesCampagne", () => {
  it("essai terminé : parle de l'essai, sur les deux gestes", () => {
    expect(
      messageAccesCampagne({ essaiTermine: true, geste: "activation" }),
    ).toMatch(/^Votre essai gratuit est terminé/);
    expect(
      messageAccesCampagne({ essaiTermine: true, geste: "relance" }),
    ).toMatch(/^Votre essai gratuit est terminé/);
  });

  it("abonnement mort : ne parle JAMAIS d'essai", () => {
    for (const geste of ["activation", "relance"] as const) {
      const message = messageAccesCampagne({ essaiTermine: false, geste });
      expect(message, geste).toMatch(/^Votre abonnement est inactif/);
      expect(message, geste).not.toMatch(/essai/);
    }
  });

  it("chaque geste nomme l'action que le commerçant vient de tenter", () => {
    // « Activer » et « Relancer » sont deux boutons distincts : renvoyer le
    // même texte aux deux ferait parler de réactivation à qui n'a rien mis en
    // pause, et inversement.
    expect(
      messageAccesCampagne({ essaiTermine: false, geste: "activation" }),
    ).toMatch(/pour activer vos campagnes/);
    expect(
      messageAccesCampagne({ essaiTermine: false, geste: "relance" }),
    ).toMatch(/pour réactiver vos campagnes/);
  });

  it("le texte d'essai ne vit plus en dur dans les actions de campagne", () => {
    // La règle ne vaut que si les deux sites l'appellent. Un texte recopié dans
    // l'action rendrait le module vert et l'écran menteur — c'est exactement
    // l'état d'avant.
    const action = readFileSync("src/actions/campaigns.ts", "utf8");
    // Commentaires retirés : le récit du défaut CITE la phrase fautive, et
    // c'est très bien — ce qu'on interdit, c'est qu'elle reste du code.
    const code = action
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/essai gratuit est terminé/);
    const appels = code.match(/messageAccesCampagne\(\{/g) ?? [];
    expect(appels).toHaveLength(2);
  });
});
