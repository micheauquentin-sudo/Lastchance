import { expect, test } from "@playwright/test";

/**
 * Scanner de QR en caisse, caméra simulée NATIVEMENT : Chromium est
 * lancé avec --use-file-for-fake-video-capture sur un y4m qui « filme »
 * le QR du code seedé (e2e/global-setup.ts). Le scanner est donc testé
 * sur son pipeline réel — getUserMedia → <video> → détection (jsQR,
 * BarcodeDetector étant sans backend en headless) → navigation → fiche.
 *
 * WebKit n'a pas d'équivalent de caméra-fichier : le chemin jsQR y est
 * verrouillé par le test unitaire src/lib/qr-decode.test.ts, et le
 * fonctionnement Safari réel repose sur le même repli (aucune API
 * BarcodeDetector là-bas non plus).
 */
const SEEDED_CODE = "GAIN-E2ESCAN2";

test.describe("caisse — scanner caméra", () => {
  // Session cashier partagée (auth.setup.ts) : aucun login consommé ici.
  test.use({ storageState: "e2e/.auth/cashier.json" });

  test("scan réel : caméra → détection → code prérempli → fiche du gain", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "Caméra-fichier disponible sur Chromium uniquement (repli jsQR couvert par test unitaire)",
    );

    await page.goto("/dashboard/redeem");

    const scanButton = page.getByRole("button", {
      name: "📷 Scanner le QR du client",
    });
    await expect(scanButton).toBeVisible();
    await scanButton.click();

    // L'aperçu caméra tourne, puis la détection navigue avec le code.
    await expect(
      page.getByLabel("Aperçu caméra pour scanner le code de gain"),
    ).toBeVisible({ timeout: 10_000 });
    try {
      await expect(page).toHaveURL(/code=GAIN-E2ESCAN2/, { timeout: 20_000 });
    } catch (e) {
      // Diagnostic : que « filme » réellement la caméra ? (blanc 255 =
      // notre y4m ; couleurs animées = mire par défaut, fichier ignoré)
      const pixels = await page.evaluate(() => {
        const v = document.querySelector("video");
        if (!v) return "pas de video";
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(v, 0, 0);
        const px = (x: number, y: number) =>
          Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
        return {
          size: `${v.videoWidth}x${v.videoHeight}`,
          readyState: v.readyState,
          corner: px(4, 4),
          center: px(v.videoWidth >> 1, v.videoHeight >> 1),
        };
      });
      throw new Error(`Pas de détection. Caméra : ${JSON.stringify(pixels)}\n${e}`);
    }

    // La fiche du gain seedé s'affiche, prête à valider.
    await expect(page.locator('input[name="code"]')).toHaveValue(SEEDED_CODE);
    await expect(page.getByText("Scan E2E")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Valider la remise" }),
    ).toBeVisible();
  });
});
