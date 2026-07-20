import { expect, test } from "@playwright/test";

/**
 * Championnat de pronostics seedé (E2EPRONO) : un match futur (pronos
 * ouverts) et un match passé (verrouillé, résultat + points saisis).
 * Couvre : inscription pseudo+avatar → saisie d'un prono → verrouillage
 * au coup d'envoi → résultats/points → classement général.
 * (Turnstile est désactivé en E2E : aucune clé configurée.)
 */
const SLUG = "E2EPRONO";

test.describe("pronostics — parcours joueur complet", () => {
  test("inscription, prono, verrouillage, résultats et classement", async ({
    page,
  }, testInfo) => {
    await page.goto(`/pronos/${SLUG}`);

    // ── Inscription : pseudo unique par projet (les deux mobiles tournent
    // en parallèle sur le même championnat seedé).
    const pseudo = `E2E ${testInfo.project.name}`.slice(0, 30);
    await page.getByLabel("Pseudo").fill(pseudo);
    // Avatar : on prend un drapeau pour couvrir l'onglet Nations.
    await page.getByRole("tab", { name: "Nations" }).click();
    await page.getByRole("button", { name: "France" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "C'est parti 🎉" }).click();

    // ── Mini espace joueur : en-tête profil + onglets.
    await expect(page.getByText(pseudo).first()).toBeVisible({ timeout: 10_000 });

    // ── Match futur : saisie d'un pronostic.
    const homeInput = page.getByRole("spinbutton").first();
    const awayInput = page.getByRole("spinbutton").nth(1);
    await homeInput.fill("2");
    await awayInput.fill("1");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("button", { name: /Enregistré|Modifier/ })).toBeVisible({
      timeout: 10_000,
    });

    // ── Match passé : verrouillé, résultat affiché.
    await expect(page.getByText(/Terminé \d+ – \d+/)).toBeVisible();
    // Ses inputs sont désactivés (pronostics fermés au coup d'envoi).
    const disabledInputs = page.locator("input[type=number][disabled]");
    await expect(disabledInputs.first()).toBeVisible();

    // ── Classement général : l'onglet liste le joueur et ses points.
    // (.first() : au retry CI, un homonyme d'un run précédent peut exister.)
    await page.getByRole("tab", { name: /Classement/ }).click();
    await expect(page.getByText("Classement").first()).toBeVisible();
    await expect(page.getByText(pseudo).first()).toBeVisible();
    await expect(page.getByText(/\d+ pts?/).first()).toBeVisible();

    // ── Profil : modification du pseudo depuis l'onglet dédié.
    await page.getByRole("tab", { name: /Profil/ }).click();
    const edited = `${pseudo} ✎`.slice(0, 30);
    await page.getByLabel("Pseudo").fill(edited);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(edited).first()).toBeVisible({ timeout: 10_000 });
  });

  test("un championnat inconnu affiche un message clair @smoke", async ({ page }) => {
    await page.goto("/pronos/INCONNU9");
    await expect(page.getByText("Oups")).toBeVisible();
  });
});
