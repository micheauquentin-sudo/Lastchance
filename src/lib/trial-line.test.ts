import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trialLine } from "@/lib/subscription";

/**
 * NE PAS PROMETTRE 7 JOURS D'ESSAI GRATUIT À QUELQU'UN QUI VIENT D'ÊTRE DÉBITÉ.
 *
 * La cascade de la fiche « Abonnement » ne testait que `trialExpired` puis
 * `trialing` ; tout le reste — `active`, `past_due`, et un `canceled` après une
 * vraie résiliation — retombait sur `${plan.trialDays} jours`, la valeur
 * statique du catalogue. Un commerçant qui paie lisait donc « Actif » en badge
 * et « Essai gratuit : 7 jours » quatre lignes plus bas.
 */
const BASE = { trialExpired: false, daysLeft: 0, trialDays: 7 } as const;

describe("trialLine", () => {
  it("ne parle plus d'essai à un abonné qui paie", () => {
    expect(trialLine({ ...BASE, status: "active" })).toBeNull();
  });

  it("ne parle plus d'essai sur un paiement en retard", () => {
    expect(trialLine({ ...BASE, status: "past_due" })).toBeNull();
  });

  it("ne parle plus d'essai à un résilié après un vrai abonnement", () => {
    // `trialExpired` est faux dans ce cas : `isTrialExpired` exige
    // `ever_subscribed === false` pour un `canceled`.
    expect(trialLine({ ...BASE, status: "canceled" })).toBeNull();
  });

  it("dit « Terminé » à un essai que le cron vient de clore", () => {
    expect(
      trialLine({ ...BASE, status: "canceled", trialExpired: true }),
    ).toBe("Terminé");
  });

  it("l'ordre compte : « Terminé » l'emporte sur « trialing »", () => {
    // Tester `trialing` d'abord réafficherait « N jours restants » à un essai
    // déjà expiré — le défaut corrigé la fois précédente, à ne pas rouvrir.
    expect(
      trialLine({
        ...BASE,
        status: "trialing",
        trialExpired: true,
        daysLeft: 3,
      }),
    ).toBe("Terminé");
  });

  it("compte les jours pendant l'essai", () => {
    expect(trialLine({ ...BASE, status: "trialing", daysLeft: 3 })).toBe(
      "3 jours restants",
    );
    expect(trialLine({ ...BASE, status: "trialing", daysLeft: 1 })).toBe(
      "1 jour restant",
    );
    expect(trialLine({ ...BASE, status: "trialing", daysLeft: 0 })).toBe(
      "0 jour restant",
    );
  });

  it("garde la promesse du catalogue tant que rien n'a commencé", () => {
    expect(trialLine({ ...BASE, status: "inactive" })).toBe("7 jours");
  });
});

describe("la fiche d'abonnement consomme bien la règle", () => {
  it("la page n'écrit plus la valeur du catalogue en direct", () => {
    const page = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
    expect(page).toMatch(/const ligneEssai = trialLine\(\{/);
    expect(page).toMatch(/\{ligneEssai !== null && \(/);
    expect(page).not.toMatch(/\$\{plan\.trialDays\} jours/);
  });
});
