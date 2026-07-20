import { expect, test } from "@playwright/test";
import QRCode from "qrcode";
import { installFakeCamera } from "./helpers";

/**
 * Scanner de QR en caisse, caméra simulée : getUserMedia est remplacé
 * par un flux canvas affichant le QR d'un code de gain seedé
 * (GAIN-E2ESCAN2). BarcodeDetector étant absent des navigateurs de
 * test, c'est le repli jsQR — le chemin Safari — qui est exercé de
 * bout en bout : détection → navigation → code prérempli → fiche.
 *
 * (La validation n'est pas cliquée ici : le retrait réel est couvert
 * par player-win.spec.ts ; ce code seedé reste retirable pour que les
 * deux projets navigateurs puissent scanner en parallèle.)
 */
const SEEDED_CODE = "GAIN-E2ESCAN2";

test.describe("caisse — scanner caméra", () => {
  // Session cashier partagée (auth.setup.ts) : aucun login consommé ici.
  test.use({ storageState: "e2e/.auth/cashier.json" });

  test("scan simulé : détection jsQR → code prérempli → fiche du gain", async ({
    page,
  }) => {
    const qrDataUrl = await QRCode.toDataURL(SEEDED_CODE, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 360,
    });
    await installFakeCamera(page, qrDataUrl);

    // Journal du navigateur : remonté dans l'échec pour diagnostiquer.
    const logs: string[] = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

    await page.goto("/dashboard/redeem");

    // Pré-conditions explicites : caméra simulée réellement installée.
    const probe = await page.evaluate(() => ({
      fakeInstalled: (window as unknown as Record<string, unknown>).__e2eFakeCamera,
      getUserMedia: typeof navigator.mediaDevices?.getUserMedia,
    }));
    expect(probe.fakeInstalled, JSON.stringify(probe)).toBe(true);

    // Le flux simulé démarre-t-il vraiment ? En cas d'échec, l'erreur
    // exacte du fake apparaît ici plutôt qu'un « Caméra indisponible ».
    const streamTest = await page.evaluate(async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        return { ok: true, tracks: s.getTracks().length };
      } catch (e) {
        return { ok: false, err: String(e) };
      }
    });
    expect(streamTest.ok, JSON.stringify(streamTest)).toBe(true);

    // Le bouton existe même sans BarcodeDetector (repli jsQR).
    const scanButton = page.getByRole("button", {
      name: "📷 Scanner le QR du client",
    });
    await expect(scanButton).toBeVisible();
    await scanButton.click();

    // Soit l'aperçu tourne, soit le composant a signalé un échec caméra —
    // dans ce cas on échoue avec le journal complet du navigateur.
    const video = page.getByLabel("Aperçu caméra pour scanner le code de gain");
    const camError = page.getByText(/Caméra indisponible/);
    await expect(video.or(camError)).toBeVisible({ timeout: 10_000 });
    if (await camError.isVisible().catch(() => false)) {
      throw new Error(`start() a échoué côté composant.\nJournal :\n${logs.join("\n")}`);
    }

    await expect(page).toHaveURL(/code=GAIN-E2ESCAN2/, { timeout: 20_000 });

    // La fiche du gain seedé s'affiche, prête à valider.
    await expect(page.locator('input[name="code"]')).toHaveValue(SEEDED_CODE);
    await expect(page.getByText("Scan E2E")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Valider la remise" }),
    ).toBeVisible();
  });
});
