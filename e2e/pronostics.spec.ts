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
    // #id direct : getByLabel("Pseudo") matcherait AUSSI la checkbox de
    // consentement (son libellé contient « Mon pseudo et mon avatar… »).
    await page.locator("#prono-first-name").fill(pseudo);
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
    await page.locator("#prono-edit-nickname").fill(edited);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(edited).first()).toBeVisible({ timeout: 10_000 });
  });

  test("un championnat inconnu affiche un message clair @smoke", async ({ page }) => {
    await page.goto("/pronos/INCONNU9");
    await expect(page.getByText("Oups")).toBeVisible();
  });
});

/**
 * Clôture des récompenses (audit #5) : le propriétaire fige le
 * classement du championnat seedé E2EPRONO2 (tous matchs joués, Zoe
 * devant Yann au nombre de scores exacts), le palmarès attribue le lot
 * du rang 1 avec un code de retrait, et le public voit le classement
 * final. Mono-projet : la clôture est définitive — un seul projet la
 * déclenche, et le test reste rejouable (déjà clôturé → assertions
 * directes).
 */
test.describe("pronostics — clôture des récompenses", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : la clôture mute définitivement le championnat",
    );
  });

  test("clôturer → palmarès avec code, classement final public @smoke", async ({
    page,
  }) => {
    await page.goto("/dashboard/pronostics/e2e60000-0000-4000-8000-000000000002");

    // Premier passage : clôture. Retry/relance : déjà clôturé, la carte
    // de clôture a disparu — on passe directement aux assertions.
    const finalizeButton = page.getByRole("button", {
      name: "Clôturer et attribuer les récompenses",
    });
    if (await finalizeButton.isVisible().catch(() => false)) {
      await finalizeButton.click();
      await page
        .getByRole("button", { name: "Confirmer la clôture" })
        .click();
    }

    // Palmarès : le lot du rang 1 revient à Zoe (2 scores exacts contre
    // 1), avec un code de retrait au format maison et le statut initial.
    await expect(page.getByText("Récompenses attribuées")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Zoe E2E").first()).toBeVisible();
    await expect(page.getByText("Coupe du patron").first()).toBeVisible();
    await expect(page.getByText(/PRONO-[A-HJ-NP-Z2-9]{8}/)).toBeVisible();

    // Le règlement est figé : les éditeurs l'affichent clairement.
    await expect(
      page.getByText(/Championnat clôturé : règlement et classement/).first(),
    ).toBeVisible();

    // Côté public : classement final, rangs uniques, gagnante en tête.
    await page.goto("/pronos/E2EPRONO2");
    await expect(page.getByText("🏅 Classement final")).toBeVisible();
    await expect(page.getByText("Zoe E2E")).toBeVisible();
    await expect(page.getByText("Championnat terminé — merci d'avoir joué !")).toBeVisible();
  });
});
