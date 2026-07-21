import { expect, test } from "@playwright/test";

/**
 * LE parcours métier complet, sur campagne garantie gagnante (seed
 * E2EWIN01, 100 % gagnante, illimitée, collecte email) :
 *
 *   jouer → gagner → réclamer (formulaire) → code de retrait →
 *   caisse (owner) → valider la remise → double retrait refusé.
 *
 * L'ancien scénario s'arrêtait au premier résultat et n'exécutait
 * jamais la réclamation ni le retrait.
 */
const SLUG = "E2EWIN01";

test.describe("parcours joueur — gagner, réclamer, retirer", () => {
  // Session owner partagée (auth.setup.ts) : la partie caisse n'a aucun
  // login à faire — et jouer en étant connecté reste un cas réel (le
  // patron teste sa propre roue).
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("le gain va jusqu'à la validation en caisse, une seule fois", async ({
    page,
  }) => {
    // ── 1. Jouer et gagner (déterministe). 30 s : WebKit sous
    // contention CI met du temps à hydrater + animation 4,4 s.
    await page.goto(`/play/${SLUG}`);
    await page.getByRole("button", { name: "Lancer la roue" }).click();
    await expect(page.getByText("✦ GAGNÉ ✦")).toBeVisible({ timeout: 30_000 });

    // ── 2. Réclamer : la campagne collecte l'email → formulaire complet.
    await page.locator('input[name="firstName"]').fill("Test E2E");
    await page.locator('input[name="email"]').fill("joueur@e2e.local");
    await page.locator('input[name="acceptedTerms"]').check();
    await page.getByRole("button", { name: "Récupérer mon gain" }).click();

    // ── 3. Le code de retrait s'affiche.
    const codeText = page.getByText(/GAIN-[A-HJ-NP-Z2-9]{8}/);
    await expect(codeText).toBeVisible({ timeout: 10_000 });
    const code = (await codeText.textContent())!.match(
      /GAIN-[A-HJ-NP-Z2-9]{8}/,
    )![0];

    // ── 4. Caisse : l'owner (déjà en session) vérifie puis valide,
    // avec le montant du panier (facultatif — revenu attribuable).
    await page.goto(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
    await expect(page.getByText("Test E2E")).toBeVisible();
    await page.getByLabel("Montant du panier (facultatif)").fill("12,50");
    await page.getByRole("button", { name: "Valider la remise" }).click();

    // Succès : la carte repasse en « déjà récupéré ». Sous contention
    // CI (trois navigateurs en parallèle), le rafraîchissement RSC qui
    // suit l'action peut traîner : si l'attente échoue, un reload
    // relit l'état serveur — c'est LUI la source de vérité.
    try {
      await expect(page.getByText(/Déjà récupéré/)).toBeVisible({
        timeout: 20_000,
      });
    } catch {
      await page.reload();
      await expect(page.getByText(/Déjà récupéré/)).toBeVisible({
        timeout: 20_000,
      });
    }

    // ── 5. Double retrait refusé : re-vérification du même code.
    // Le panier saisi au retrait est visible sur la fiche.
    await page.goto(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
    await expect(page.getByText(/Déjà récupéré/)).toBeVisible();
    await expect(page.getByText(/panier/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Valider la remise" }),
    ).toHaveCount(0);
  });

  test("un code expiré est refusé en caisse (échéance serveur) @smoke", async ({
    page,
  }) => {
    // Participation seedée dont redeem_expires_at est dépassé : peu
    // importe la capture d'écran du code, la base dit non.
    await page.goto("/dashboard/redeem?code=GAIN-E2EEXPIRE");
    await expect(page.getByText("Gaston Expire")).toBeVisible();
    await expect(page.getByText(/Code expiré/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Valider la remise" }),
    ).toHaveCount(0);
  });

  test("les probabilités des lots ne fuitent jamais au client @smoke", async ({
    page,
  }) => {
    const documents: string[] = [];
    page.on("response", async (res) => {
      if (res.request().resourceType() === "document") {
        documents.push(await res.text().catch(() => ""));
      }
    });
    await page.goto(`/play/${SLUG}`);
    await expect(
      page.getByRole("button", { name: "Lancer la roue" }),
    ).toBeVisible();
    for (const html of documents) {
      expect(html).not.toMatch(/"weight"\s*:/);
    }
  });

  test("une campagne en pause affiche un message clair @smoke", async ({ page }) => {
    await page.goto("/play/E2EPAUSE");
    await expect(page.getByText("Cette campagne n'est pas active.")).toBeVisible();
  });

  test("le grattage se charge avec sa carte @smoke", async ({ page }) => {
    await page.goto("/play/E2ESCRT1");
    await expect(
      page.getByRole("button", { name: "Gratter la carte" }),
    ).toBeVisible();
  });
});
