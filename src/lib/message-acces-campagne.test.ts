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
  const GESTES = ["activation", "relance", "programmation"] as const;

  it("essai terminé : parle de l'essai, sur les trois gestes", () => {
    for (const geste of GESTES) {
      expect(messageAccesCampagne({ essaiTermine: true, geste }), geste).toMatch(
        /^Votre essai gratuit est terminé/,
      );
    }
  });

  it("abonnement mort : ne parle JAMAIS d'essai", () => {
    for (const geste of GESTES) {
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
    expect(
      messageAccesCampagne({ essaiTermine: false, geste: "programmation" }),
    ).toMatch(/pour programmer l'activation automatique de vos campagnes/);
    // Et les trois phrases restent bien trois : une valeur ajoutée à l'union
    // qui retomberait sur le texte d'un voisin passerait les assertions
    // ci-dessus sans rien nommer de neuf.
    expect(
      new Set(GESTES.map((geste) => messageAccesCampagne({ essaiTermine: false, geste })))
        .size,
    ).toBe(3);
  });

  it("programmer : dit que le reste du panneau n'a pas été enregistré", () => {
    // Le refus vient d'un trigger `before update of auto_schedule` : c'est
    // l'UPDATE ENTIER qui est rejeté. Taire les dates et le budget ferait
    // repartir le commerçant en croyant son plafond en base — le seul écart
    // qui justifie un troisième geste plutôt que la phrase d'« activation ».
    for (const essaiTermine of [true, false]) {
      expect(
        messageAccesCampagne({ essaiTermine, geste: "programmation" }),
        String(essaiTermine),
      ).toMatch(/vos dates et votre budget n'ont pas été enregistrés/);
    }
  });

  it("le texte d'essai ne vit plus en dur dans les actions de campagne", () => {
    // La règle ne vaut que si TOUS les sites l'appellent. Un texte recopié dans
    // l'action rendrait le module vert et l'écran menteur — c'est exactement
    // l'état d'avant.
    //
    // CINQ sites. Quatre depuis que `campaigns.status` est passé derrière la
    // RPC `set_campaign_status` (migration 20260905120000) : les deux gardes
    // applicatives d'origine (activation, relance) ET les deux traductions du
    // refus que la RPC peut rendre sur les mêmes gestes. Ce second couple n'est
    // pas décoratif : un refus venu de la base doit se lire dans le MÊME
    // vocabulaire que le refus venu de l'application, sinon un commerçant
    // obtiendrait deux phrases différentes pour une seule et même cause.
    //
    // Le cinquième vient de `20260906120000` : ARMER `auto_schedule` est une
    // publication différée, et son refus (trigger, `P0001`) n'a aucune garde
    // applicative en face — c'est le seul des cinq qui ne peut arriver QUE de
    // la base.
    const action = readFileSync("src/actions/campaigns.ts", "utf8");
    // Commentaires retirés : le récit du défaut CITE la phrase fautive, et
    // c'est très bien — ce qu'on interdit, c'est qu'elle reste du code.
    const code = action
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/essai gratuit est terminé/);
    const appels = code.match(/messageAccesCampagne\(\{/g) ?? [];
    expect(appels).toHaveLength(5);
  });
});
