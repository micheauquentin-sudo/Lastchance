import { expect, test } from "@playwright/test";
import { CODE_CONSOMME } from "./redeem-card";

/**
 * Offres de stock (RES-5, lot L9) : bloquer une unité réelle via un code
 * `RESA-`, la retirer au comptoir dans sa fenêtre, ou l'annuler pour la
 * remettre en vente — au-dessus de la mécanique de créneaux de
 * `reserver.spec.ts`, qui ne bouge pas ici.
 *
 * Seed (`supabase/seed.sql`) :
 * - « Tarte du jour E2E » (`...a1`) : fenêtre englobant MAINTENANT (−1h à
 *   +3h), stock 4, `per_player_limit` 1 — la seule forme sur laquelle le
 *   retrait en caisse est immédiatement jouable.
 * - « Drop du soir E2E » (`...a2`) : fenêtre COURTE et À VENIR (+2h à +3h),
 *   stock 3 — la prise est ouverte, le retrait ne l'est pas encore.
 *
 * Comme les specs sœurs : on prouve l'ÉTAT réel affiché à l'écran (le code,
 * la fenêtre, le restant, le verdict de caisse), jamais un simple message de
 * succès flottant. Style et helpers repris de `reserver-signature.spec.ts` :
 * `storageState: "e2e/.auth/owner.json"`, sélection par `getByRole`,
 * `reloadOnSuccess`, pas de `waitForTimeout`, contextes de navigateur
 * distincts pour des identités séparées (le cookie `lc-player`, jamais un
 * compte).
 */
const OFFER_NOW = "e2ea0000-0000-4000-8000-0000000000a1";
const OFFER_FUTURE = "e2ea0000-0000-4000-8000-0000000000a2";
const RESA_CODE = /^RESA-[A-HJ-NP-Z2-9]{8}$/;

test.describe("réserver — offre de stock, code RESA-, portefeuille, annulation puis re-prise", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("prise → code affiché avec sa fenêtre → visible au portefeuille → annulation → re-prise", async ({
    page,
  }) => {
    await page.goto(`/reserver/stock/${OFFER_NOW}`);
    await expect(
      page.getByRole("heading", { name: "Tarte du jour E2E" }),
    ).toBeVisible({ timeout: 30_000 });

    // ── 1. La fenêtre de retrait est annoncée AVANT toute prise. ──
    await expect(page.getByText("Fenêtre de retrait")).toBeVisible();

    await page.getByRole("button", { name: "Réserver la mienne" }).click();

    // ── 2. `reloadOnSuccess` : la carte « Ma réservation » apparaît, avec le
    // code RESA- en grand et la fenêtre répétée sous lui. ──
    await expect(
      page.getByRole("heading", { name: "Ma réservation" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Votre code de retrait")).toBeVisible();

    const codeTexte = (
      await page.locator("p.font-mono.text-3xl").first().textContent()
    )?.trim();
    expect(codeTexte).toMatch(RESA_CODE);
    const code = codeTexte as string;

    await expect(page.getByText(/Donnez ce code au comptoir, à retirer/)).toBeVisible();

    // ── 3. Le hold apparaît sur /portefeuille — même cookie, aucun compte. ──
    await page.goto("/portefeuille");
    await expect(
      page.getByRole("heading", { name: "Mes récompenses" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(code)).toBeVisible({ timeout: 20_000 });

    // ── 4. Retour sur l'offre : annulation possible tant que la prise est
    // vivante. ──
    await page.goto(`/reserver/stock/${OFFER_NOW}`);
    await expect(
      page.getByRole("heading", { name: "Ma réservation" }),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole("button", { name: "Annuler ma réservation" })
      .click();

    // `reloadOnSuccess` : la page se recharge et relit `stock_offer_public_state`
    // — `my_hold` EXCLUT délibérément le statut `cancelled` (migration
    // 20261010120000, la même requête que le restant), donc « Ma réservation »
    // disparaît et le formulaire de prise redevient la preuve que l'annulation a
    // bien libéré l'unité — pas un message flottant qui ne serait jamais relu
    // après ce rechargement.
    await expect(
      page.getByRole("button", { name: "Réserver la mienne" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: "Annuler ma réservation" }),
    ).toHaveCount(0);

    // ── 5. Re-prise : l'unité annulée est repartie en vente, une nouvelle
    // prise réussit, avec un NOUVEAU code. ──
    await page.getByRole("button", { name: "Réserver la mienne" }).click();

    await expect(
      page.getByRole("heading", { name: "Ma réservation" }),
    ).toBeVisible({ timeout: 30_000 });
    const codeTexteApres = (
      await page.locator("p.font-mono.text-3xl").first().textContent()
    )?.trim();
    expect(codeTexteApres).toMatch(RESA_CODE);
    expect(codeTexteApres).not.toBe(code);
  });
});

test.describe("réserver — retrait en caisse d'une offre de stock", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("code RESA- saisi en caisse → retrait enregistré → rejeu refusé (déjà retiré)", async ({
    page,
    browser,
  }) => {
    // Identité SÉPARÉE du contexte de caisse : contexte neuf, sans
    // storageState, seul le cookie `lc-player` la porte.
    const contextClient = await browser.newContext();
    let code = "";
    try {
      const pageClient = await contextClient.newPage();
      await pageClient.goto(`/reserver/stock/${OFFER_NOW}`);
      await expect(
        pageClient.getByRole("heading", { name: "Tarte du jour E2E" }),
      ).toBeVisible({ timeout: 30_000 });
      await pageClient
        .getByRole("button", { name: "Réserver la mienne" })
        .click();
      await expect(
        pageClient.getByRole("heading", { name: "Ma réservation" }),
      ).toBeVisible({ timeout: 30_000 });
      const codeTexte = (
        await pageClient.locator("p.font-mono.text-3xl").first().textContent()
      )?.trim();
      expect(codeTexte).toMatch(RESA_CODE);
      code = codeTexte as string;
    } finally {
      await contextClient.close();
    }

    // ── Caisse : la carte porte le code, le titre de l'offre, la fenêtre. ──
    await page.goto(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
    await expect(page.getByText(code)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Tarte du jour E2E")).toBeVisible();
    await expect(page.getByText("Réservation de stock")).toBeVisible();

    await page.getByRole("button", { name: "Valider le retrait" }).click();
    try {
      await expect(page.getByText(CODE_CONSOMME)).toBeVisible({
        timeout: 20_000,
      });
    } catch {
      await page.reload();
      await expect(page.getByText(CODE_CONSOMME)).toBeVisible({
        timeout: 20_000,
      });
    }

    // ── Rejeu : le même code re-vérifié ne propose plus de bouton. ──
    await page.goto(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
    await expect(page.getByText(CODE_CONSOMME)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "Valider le retrait" }),
    ).toHaveCount(0);
  });

  test("offre à fenêtre FUTURE : prise acceptée, retrait en caisse refusé — pas encore ouvert", async ({
    page,
    browser,
  }) => {
    const contextClient = await browser.newContext();
    let code = "";
    try {
      const pageClient = await contextClient.newPage();
      await pageClient.goto(`/reserver/stock/${OFFER_FUTURE}`);
      await expect(
        pageClient.getByRole("heading", { name: "Drop du soir E2E" }),
      ).toBeVisible({ timeout: 30_000 });
      await pageClient
        .getByRole("button", { name: "Réserver la mienne" })
        .click();
      await expect(
        pageClient.getByRole("heading", { name: "Ma réservation" }),
      ).toBeVisible({ timeout: 30_000 });
      const codeTexte = (
        await pageClient.locator("p.font-mono.text-3xl").first().textContent()
      )?.trim();
      expect(codeTexte).toMatch(RESA_CODE);
      code = codeTexte as string;

      // La page du client dit elle-même que le retrait n'est pas encore
      // ouvert — même mot que le comptoir.
      await expect(
        pageClient.getByText(/Retrait pas encore ouvert/),
      ).toBeVisible();
    } finally {
      await contextClient.close();
    }

    await page.goto(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
    await expect(page.getByText(code)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Retrait pas encore ouvert/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Valider le retrait" }),
    ).toHaveCount(0);
  });
});

test.describe("réserver — restant d'une offre de stock (RES-5)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("le restant décroît après une prise, remonte après l'annulation", async ({
    browser,
  }, testInfo) => {
    // Assertion sur un COMPTE EXACT, partagé par tout ce qui prend une unité
    // sur `OFFER_NOW` dans ce fichier ET dans les autres tests de ce bloc,
    // eux-mêmes joués en parallèle sur `mobile-chrome` et `mobile-safari`
    // (`fullyParallel`) — même arbitrage que la jauge duo de
    // `reserver-signature.spec.ts` : un seul projet mute et lit ce compte,
    // les autres ne le vérifient pas.
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "restant exact sur une offre partagée entre projets — un seul projet le lit",
    );

    // Identité TÉMOIN (nouveau contexte) : `loadStockOfferPublicContext` ne
    // rend le formulaire de prise (donc le restant) qu'à qui n'a PAS déjà de
    // prise vivante sur cette offre — même raison que le créneau duo.
    const contextTemoin = await browser.newContext();
    const pageTemoin = await contextTemoin.newPage();

    const lireRestant = async (): Promise<number> => {
      await pageTemoin.goto(`/reserver/stock/${OFFER_NOW}`);
      await expect(
        pageTemoin.getByRole("heading", { name: "Tarte du jour E2E" }),
      ).toBeVisible({ timeout: 30_000 });
      const bouton = pageTemoin.getByRole("button", {
        name: "Réserver la mienne",
      });
      // L'offre peut déjà être épuisée si les tests de caisse ci-dessus ont
      // consommé tout le stock avant celui-ci (ordre non garanti entre
      // fichiers) : dans ce cas le témoin ne voit plus le formulaire, et ce
      // test n'a rien à mesurer.
      test.skip(
        !(await bouton.isVisible().catch(() => false)),
        "offre épuisée par un test frère — rien à mesurer",
      );
      const texte = await pageTemoin
        .getByText(/Plus que \d+/)
        .first()
        .textContent();
      const m = (texte ?? "").match(/Plus que (\d+)/);
      expect(m).not.toBeNull();
      return Number(m![1]);
    };

    try {
      const avant = await lireRestant();

      // Une identité NEUVE prend une unité.
      const contextPreneur = await browser.newContext();
      try {
        const pagePreneur = await contextPreneur.newPage();
        await pagePreneur.goto(`/reserver/stock/${OFFER_NOW}`);
        await expect(
          pagePreneur.getByRole("heading", { name: "Tarte du jour E2E" }),
        ).toBeVisible({ timeout: 30_000 });
        await pagePreneur
          .getByRole("button", { name: "Réserver la mienne" })
          .click();
        await expect(
          pagePreneur.getByRole("heading", { name: "Ma réservation" }),
        ).toBeVisible({ timeout: 30_000 });

        const apresPrise = await lireRestant();
        expect(apresPrise).toBe(avant - 1);

        // Puis l'annule : l'unité repart en vente, le restant remonte.
        await pagePreneur
          .getByRole("button", { name: "Annuler ma réservation" })
          .click();
        // `reloadOnSuccess` : `my_hold` exclut le statut `cancelled` (même
        // requête que le restant) — le formulaire de prise redevient visible,
        // preuve que l'unité est repartie en vente.
        await expect(
          pagePreneur.getByRole("button", { name: "Réserver la mienne" }),
        ).toBeVisible({ timeout: 30_000 });

        const apresAnnulation = await lireRestant();
        expect(apresAnnulation).toBe(avant);
      } finally {
        await contextPreneur.close();
      }
    } finally {
      await contextTemoin.close();
    }
  });
});
