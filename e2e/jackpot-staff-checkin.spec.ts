import { expect, test } from "@playwright/test";

/**
 * Parcours caisse du Jackpot en mode `staff` (audit MORT-1) : le mode était
 * offert au commerçant, la page joueur affichait bien son QR de check-in, la
 * Server Action `participateJackpotStaff` existait — et AUCUNE spec n'allait
 * du QR joueur jusqu'à la validation en caisse. `jackpot.spec.ts` ne couvre
 * que l'AFFICHAGE, sur la campagne seed `e2e-jackpot` figée à « 0 / 5 » (voir
 * son en-tête) : y valider une participation ferait dériver son compteur et
 * casserait cette autre spec sans rapport visible. Cette spec cible donc la
 * DEUXIÈME campagne staff du seed, dédiée à l'écriture :
 * `e2e-jackpot-staff` (id e2ec0000-0000-4000-8000-000000000002, org E2E Café).
 *
 * Session unique `owner.json` (comme player-win.spec.ts) : le joueur et la
 * caisse sont la même personne dans ce test, ce qui est un cas réel — le
 * patron valide sa propre configuration — et évite un deuxième login.
 *
 * Flux : page joueur du jackpot staff → carte « Participer en caisse » →
 * ouvre le repli texte sous le QR (« Afficher le code ») → copie le jeton →
 * /dashboard/redeem → section caisse jackpot (libellés distincts de la
 * fidélité) → « Saisir le code jackpot à la main » → colle le jeton → valide
 * → message d'état « enregistré » + décompte de session à jour.
 *
 * Le jeton de check-in a un TTL de ~3 min : les deux étapes s'enchaînent
 * sans attente longue entre elles.
 */
const JACKPOT_STAFF_SLUG = "e2e-jackpot-staff";

test.describe("jackpot collectif — validation en caisse (mode staff)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("le QR joueur se valide en caisse et met à jour le décompte de session", async ({
    page,
  }) => {
    // ── 1. Page joueur du jackpot staff : la carte « Participer en caisse »
    // affiche son QR de check-in après hydratation.
    await page.goto(`/jackpot/${JACKPOT_STAFF_SLUG}`);
    await expect(
      page.getByRole("heading", { name: "Participer en caisse" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("img", {
        name: /QR de votre participation au jackpot/i,
      }),
    ).toBeVisible({ timeout: 30_000 });

    // ── 2. Repli texte : le scan peut ne pas marcher en caisse, le code se
    // dicte à la main. On ouvre le <details> et on relit le jeton affiché.
    await page
      .getByText("Afficher le code (si le scan ne marche pas)")
      .click();
    const tokenBlock = page.locator("p.font-mono.select-all");
    await expect(tokenBlock).toBeVisible();
    const token = (await tokenBlock.textContent())!.trim();
    expect(token.length).toBeGreaterThan(10);

    // ── 3. Caisse : la section jackpot (libellés distincts de la fidélité,
    // même page /dashboard/redeem) — on ouvre le repli manuel et on colle
    // le jeton copié à l'étape 2.
    await page.goto("/dashboard/redeem");
    await expect(
      page.getByText("Valider une participation au jackpot"),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", {
        name: "🎰 Scanner le code jackpot du client",
      }),
    ).toBeVisible();
    // L'org sert DEUX jackpots en mode staff (le seed d'affichage
    // « Jackpot E2E » et celui-ci) : le combobox s'initialise sur le premier
    // par ordre d'insertion, pas forcément le nôtre — le sélectionner
    // explicitement, sinon le jeton (lié à SA campagne) est rejeté comme
    // « carte illisible » par la campagne affichée par défaut.
    const jackpotSelect = page.getByLabel("Jackpot", { exact: true });
    await expect(jackpotSelect).toBeVisible();
    await jackpotSelect.selectOption({ label: "Cagnotte comptoir E2E" });
    await expect(jackpotSelect).toHaveValue(
      "e2ec0000-0000-4000-8000-000000000002",
    );
    await page.getByText("Saisir le code jackpot à la main").click();
    const manualInput = page.getByLabel("Code jackpot affiché par le client");
    await expect(manualInput).toBeVisible();
    await manualInput.fill(token);
    await page.getByRole("button", { name: "Valider" }).click();

    // ── 4. Succès : message d'état « enregistré » et décompte de session
    // qui passe à une participation validée.
    await expect(page.getByText("Participation enregistrée !")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/1 participation validée/),
    ).toBeVisible();
  });
});
