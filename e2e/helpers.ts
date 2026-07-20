import { expect, type Page } from "@playwright/test";

/** Comptes seedés (supabase/seed.sql) — mot de passe commun. */
export const E2E_PASSWORD = "Password123!";
export const E2E_USERS = {
  owner: "owner@e2e.local",
  editor: "editor@e2e.local",
  cashier: "cashier@e2e.local",
} as const;

/** Connexion au dashboard avec un compte seedé. */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Caméra simulée : remplace getUserMedia par un flux canvas qui affiche
 * en boucle l'image fournie (un QR de code de gain). Fonctionne dans
 * Chromium comme WebKit — et comme BarcodeDetector est absent des
 * navigateurs de test, c'est le repli jsQR (chemin Safari) qui est
 * réellement exercé.
 */
export async function installFakeCamera(page: Page, imageDataUrl: string) {
  await page.addInitScript((dataUrl: string) => {
    const fake = async () => {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image caméra simulée illisible"));
        img.src = dataUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // QR centré, marges généreuses — cadrage réaliste d'un téléphone.
        const size = 360;
        ctx.drawImage(img, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
        requestAnimationFrame(draw);
      };
      draw();
      return canvas.captureStream(15);
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: fake,
    });
  }, imageDataUrl);
}
