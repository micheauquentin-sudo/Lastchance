import { expect, test } from "@playwright/test";

/**
 * TEST-1.2 — la moitié manquante du wagon 3 du jackpot collectif : le mode
 * `rotating_code` avait son écran comptoir (affiche un code qui tourne) et sa
 * page joueur (saisit le code), mais aucune spec n'allait de l'un à l'autre —
 * même trou d'audit MORT-1 que les deux autres modes de validation (staff
 * fidélité/jackpot, déjà couverts par `jackpot-staff-checkin.spec.ts` et
 * `loyalty-staff-checkin.spec.ts`).
 *
 * Fixture dédiée (seme le 2026-08-18, commit `851e3bd`) : campagne
 * `e2ec0000-0000-4000-8000-000000000003`, slug joueur `e2e-jackpot-code`,
 * « Tirelire au code E2E », `validation_mode` `rotating_code`, seuil 5,
 * active, ISOLÉE des deux campagnes staff du seed (`e2e-jackpot`,
 * `e2e-jackpot-staff`) — une participation ici ne fait dériver ni leur
 * compteur ni leur libellé.
 *
 * Flux : l'écran comptoir (`/dashboard/jackpot/[id]/comptoir`, owner/editor)
 * affiche le code tournant en grand → le joueur (même session, comme
 * `jackpot-staff-checkin.spec.ts` : le patron valide sa propre configuration)
 * le saisit sur `/jackpot/[slug]` → la jauge avance de 0/5 à 1/5 et le
 * message de confirmation s'affiche.
 */
const CAMPAIGN_ID = "e2ec0000-0000-4000-8000-000000000003";
const CAMPAIGN_SLUG = "e2e-jackpot-code";

test.describe("jackpot collectif — participation par code tournant", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("le code affiché au comptoir se saisit côté joueur et fait avancer la jauge", async ({
    page,
  }) => {
    // ── 1. Écran comptoir : le code tournant s'affiche en grand. La jauge
    // n'est PAS assumée à 0/5 : sous CI (`retries: 1`), une reprise après un
    // premier essai qui a timeout APRÈS avoir déjà enregistré la
    // participation retrouverait une jauge à 1/5 — un test qui exige "0 / 5"
    // en dur échoue alors en permanence sur la reprise. On lit le compte
    // courant et on vérifie l'incrément relatif, seule assertion valable
    // quel que soit l'essai.
    await page.goto(`/dashboard/jackpot/${CAMPAIGN_ID}/comptoir`);
    await expect(
      page.getByText("Participez avec ce code"),
    ).toBeVisible({ timeout: 30_000 });
    const gauge = page.getByText(/^\d+ \/ 5$/);
    await expect(gauge).toBeVisible({ timeout: 30_000 });
    const before = Number((await gauge.textContent())!.match(/^(\d+) \/ 5$/)![1]);

    // Le code est groupé "XXX XXX" (espace de lisibilité) dans le seul
    // paragraphe géant en police mono de cet écran.
    const codeBlock = page.locator("p.font-mono").first();
    await expect(codeBlock).toBeVisible({ timeout: 30_000 });
    const grouped = (await codeBlock.textContent())!.trim();
    const code = grouped.replace(/\s+/g, "");
    expect(code).toMatch(/^\d{6}$/);

    // ── 2. Page joueur : saisie manuelle du code à 6 chiffres.
    await page.goto(`/jackpot/${CAMPAIGN_SLUG}`);
    await expect(
      page.getByRole("heading", { name: "Participer au jackpot" }),
    ).toBeVisible({ timeout: 30_000 });
    const codeInput = page.getByLabel("Code affiché au comptoir (6 chiffres)");
    await expect(codeInput).toBeVisible();
    await codeInput.fill(code);
    await page.getByRole("button", { name: "Je participe !" }).click();

    // ── 3. Succès : message de confirmation et jauge incrémentée d'une unité
    // par rapport à la valeur lue avant participation (jamais "1 / 5" en dur).
    await expect(page.getByText("Participation enregistrée !")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(`${before + 1} / 5`)).toBeVisible();
  });
});
