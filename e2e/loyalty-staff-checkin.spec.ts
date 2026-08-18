import { PNG } from "pngjs";
import jsQR from "jsqr";
import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Parcours caisse de la Fidélité en mode `staff` (le pendant, côté passeport,
 * de `jackpot-staff-checkin.spec.ts` pour le jackpot — même trou d'audit
 * MORT-1 : le mode existait, le QR joueur s'affichait, la Server Action
 * `stampLoyaltyVisitStaff` existait, et AUCUNE spec n'allait du QR joueur
 * jusqu'au tampon en caisse). Programme du seed : « Passeport E2E »
 * (`e2eb0000-0000-4000-8000-000000000001`, org E2E Café, `validation_mode`
 * `staff`, paliers à 2 et 3 visites).
 *
 * Contrairement au jackpot, le passeport n'affiche AUCUN repli texte pour le
 * jeton de check-in — seulement le QR (`StaffPassportCard` /
 * `loyalty-passport.tsx`). On décode donc l'image côté Node avec la même
 * paire jsQR + pngjs que `src/lib/qr-decode.test.ts` (repli scanner déjà
 * verrouillé ailleurs), plutôt que de scanner une caméra qui n'existe pas en
 * CI : l'image est une data-URL PNG générée par la même lib `qrcode` que les
 * écrans de gain.
 *
 * Session unique `owner.json` (même choix que `jackpot-staff-checkin.spec.ts`) :
 * le joueur et la caisse sont la même personne, ce qui est un cas réel — le
 * patron valide sa propre carte.
 */
const LOYALTY_PROGRAM_ID = "e2eb0000-0000-4000-8000-000000000001";

/** Décode le jeton porté par un QR généré par la lib `qrcode` (data-URL PNG). */
function decodeQrDataUrl(dataUrl: string): string {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const png = PNG.sync.read(Buffer.from(base64, "base64"));
  const hit = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, {
    inversionAttempts: "dontInvert",
  });
  if (!hit) throw new Error("QR de check-in illisible dans l'image générée");
  return hit.data;
}

test.describe("fidélité — validation d'une visite en caisse (mode staff)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("le QR du passeport se valide en caisse et compte une visite", async ({
    page,
  }) => {
    // ── 1. Page joueur du passeport : la carte « Ma carte à présenter »
    // affiche son QR de check-in après hydratation (jeton signé, ~3 min).
    await page.goto(`/passeport/${LOYALTY_PROGRAM_ID}`);
    await expect(
      page.getByRole("heading", { name: "Ma carte à présenter" }),
    ).toBeVisible({ timeout: 30_000 });
    const qrImg = page.getByRole("img", {
      name: /QR de votre passeport de fidélité/i,
    });
    await expect(qrImg).toBeVisible({ timeout: 30_000 });
    const dataUrl = await qrImg.getAttribute("src");
    expect(dataUrl).toBeTruthy();
    const token = decodeQrDataUrl(dataUrl!);
    expect(token.length).toBeGreaterThan(10);

    // ── 2. Caisse : section fidélité (« Valider une visite fidélité »), repli
    // manuel — pas de caméra en CI, la saisie à la main colle le jeton décodé.
    await page.goto("/dashboard/redeem");
    await expect(
      page.getByRole("heading", { name: "Valider une visite fidélité" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: "📷 Scanner le passeport du client" }),
    ).toBeVisible();
    await page.getByText("Saisir le code de validation à la main").click();
    const manualInput = page.getByLabel("Code de validation affiché par le client");
    await expect(manualInput).toBeVisible();
    await manualInput.fill(token);
    await page.getByRole("button", { name: "Valider" }).click();

    // ── 3. Succès : la visite est validée, le tampon annonce le niveau et le
    // décompte de session de caisse passe à une visite validée.
    await expect(
      page.getByText(/✓ Visite validée — Passeport E2E/),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/1 visite validée/)).toBeVisible();
  });
});

/**
 * Filet de contraste et de structure de l'écran caisse fidélité — miroir du
 * filet jackpot (`jackpot-staff-checkin.spec.ts`). La caisse est partagée par
 * neuf familles de récompense sur une seule page : jamais scannée seule.
 */
test.describe("accessibilité — la caisse (section fidélité)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("la caisse sans violation axe serious/critical", async ({ page }, testInfo) => {
    await page.goto("/dashboard/redeem");
    await expect(page.getByRole("heading", { name: "Caisse" })).toBeVisible();
    await expectNoA11yViolations(page, testInfo);
  });
});
