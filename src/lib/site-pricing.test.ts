/**
 * GARDE — le site vitrine ne peut pas diverger du packaging de l'application.
 *
 * `site/` est un projet Next SÉPARÉ (son `package.json`, ses `node_modules`,
 * son alias `@/*`) et n'a AUCUN runner de test. Le fait qu'il ne puisse pas
 * importer `src/lib/plans.ts` est ce qui a justifié un fichier généré
 * (`site/src/content/pricing.generated.ts`) plutôt qu'un import — et c'est
 * précisément ce qui rend un fichier généré dangereux : rien, dans le site, ne
 * remarque qu'il a vieilli.
 *
 * Cette garde vit donc dans la suite RACINE, la seule qui tourne. Elle
 * régénère le module EN MÉMOIRE depuis la source de vérité et le compare au
 * fichier committé : un prix, un nom, un essai, un module, une limite ou un
 * add-on qui bouge dans `src/lib/plans.ts` sans régénération fait rougir ici.
 *
 * Ce qu'elle ne prouve PAS, et il faut le savoir : elle compare du texte et des
 * valeurs, jamais un rendu. Elle ne dit pas que `/tarifs` affiche ce fichier —
 * seulement qu'il dit la vérité. Le site n'ayant pas d'environnement de test,
 * c'est la frontière assumée (ADR-074).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as plans from "@/lib/plans";
import {
  buildSitePricingPayload,
  GENERATED_FILE_RELATIVE_PATH,
  renderSitePricingModule,
} from "../../scripts/site-pricing-template.mjs";

const repoRoot = path.resolve(__dirname, "..", "..");
const generatedPath = path.join(repoRoot, GENERATED_FILE_RELATIVE_PATH);

function readCommitted(): string {
  // Le fichier est écrit en UTF-8 avec des fins de ligne LF par le script ;
  // git peut le restituer en CRLF sur Windows (piège déjà payé sur ce dépôt).
  return readFileSync(generatedPath, "utf8").replace(/\r\n/g, "\n");
}

describe("site/src/content/pricing.generated.ts", () => {
  it("est identique à ce que le générateur produit aujourd'hui", () => {
    const expected = renderSitePricingModule(plans).replace(/\r\n/g, "\n");
    const committed = readCommitted();

    if (committed !== expected) {
      // Diff ligne à ligne : sans cela, l'écart d'un seul chiffre au milieu de
      // 300 lignes rend un message illisible et la garde n'est plus lue.
      const expectedLines = expected.split("\n");
      const committedLines = committed.split("\n");
      const divergences: string[] = [];
      const max = Math.max(expectedLines.length, committedLines.length);
      for (let i = 0; i < max && divergences.length < 10; i += 1) {
        if (expectedLines[i] !== committedLines[i]) {
          divergences.push(
            `ligne ${i + 1}\n  committé : ${committedLines[i] ?? "<absente>"}\n  attendu  : ${expectedLines[i] ?? "<absente>"}`,
          );
        }
      }
      throw new Error(
        `${GENERATED_FILE_RELATIVE_PATH} a divergé de src/lib/plans.ts.\n` +
          `Régénérer avec « npm run site:pricing ».\n\n${divergences.join("\n\n")}`,
      );
    }

    expect(committed).toBe(expected);
  });

  it("porte les quatre offres, leur nom commercial et leur prix", async () => {
    const payload = buildSitePricingPayload(plans);
    const committed = readCommitted();

    expect(payload.tiers).toHaveLength(plans.PLAN_TIERS.length);

    for (const tier of payload.tiers) {
      expect(
        committed,
        `l'offre « ${tier.name} » n'apparaît pas dans le fichier généré`,
      ).toContain(JSON.stringify(tier.name));
      expect(
        committed,
        `le prix de « ${tier.name} » (${tier.priceLabel}) n'apparaît pas dans le fichier généré`,
      ).toContain(JSON.stringify(tier.priceLabel));
      expect(
        tier.trialDays,
        `l'essai de « ${tier.name} » a changé sans régénération`,
      ).toBe(plans.getPlanTier(tier.id).trialDays);
    }
  });

  it("porte les huit add-ons avec leur prix et leur modèle", () => {
    const payload = buildSitePricingPayload(plans);
    const committed = readCommitted();

    expect(payload.addons).toHaveLength(plans.ADDON_OFFERS.length);

    for (const addon of payload.addons) {
      expect(
        committed,
        `l'add-on « ${addon.name} » n'apparaît pas dans le fichier généré`,
      ).toContain(JSON.stringify(addon.name));
      expect(
        committed,
        `le prix de « ${addon.name} » (${addon.priceLabel}) n'apparaît pas dans le fichier généré`,
      ).toContain(JSON.stringify(addon.priceLabel));
      expect(
        addon.priceLabel,
        `le prix de « ${addon.name} » n'est plus dérivé de formatAddonPrice`,
      ).toBe(
        plans.formatAddonPrice(
          plans.findAddonOffer(addon.entitlement as never)!,
        ),
      );
    }
  });

  it("ne laisse jamais un identifiant technique tenir lieu de nom commercial", () => {
    const payload = buildSitePricingPayload(plans);
    for (const tier of payload.tiers) {
      expect(
        tier.name,
        `l'offre ${tier.id} s'afficherait sous son identifiant technique`,
      ).not.toBe(tier.id);
    }
  });

  it("dérive l'hypothèse d'abonnement du simulateur de ROI de l'offre d'entrée", () => {
    const payload = buildSitePricingPayload(plans);
    expect(payload.entrySubscriptionMonthly).toBe(
      plans.PLAN_TIERS[0].priceMonthly,
    );
  });
});
