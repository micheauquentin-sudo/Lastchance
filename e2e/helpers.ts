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
    // Certains contextes de test n'exposent pas mediaDevices : on le crée
    // pour que le scanner se considère « supporté » et utilise le fake.
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        value: {},
        configurable: true,
      });
    }
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
      // Sans argument : une frame à chaque peinture du canvas (WebKit n'a
      // pas requestFrame ; Chromium l'a en bonus pour fiabiliser).
      const stream = canvas.captureStream();
      const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
        requestFrame?: () => void;
      };
      const draw = () => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // QR centré, marges généreuses — cadrage réaliste d'un téléphone.
        const size = 360;
        ctx.drawImage(img, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
        // rAF n'est pas fiable pour un canvas hors DOM en headless :
        // chaque frame est poussée explicitement quand l'API existe.
        track.requestFrame?.();
      };
      // 10 im/s suffisent largement pour un QR statique.
      setInterval(draw, 100);
      draw();
      return stream;
    };
    // Installation défensive : selon le moteur, la propriété native est
    // en lecture seule ou non configurable — on tente du plus doux au
    // plus radical, et on pose un marqueur vérifiable par le test.
    const md = navigator.mediaDevices as MediaDevices & Record<string, unknown>;
    try {
      md.getUserMedia = fake as unknown as MediaDevices["getUserMedia"];
    } catch {
      /* lecture seule : on essaie defineProperty */
    }
    if (md.getUserMedia !== (fake as unknown)) {
      try {
        Object.defineProperty(md, "getUserMedia", { configurable: true, value: fake });
      } catch {
        // Non configurable : on remplace mediaDevices entier sur navigator.
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: { getUserMedia: fake },
        });
      }
    }
    (window as unknown as Record<string, unknown>).__e2eFakeCamera =
      navigator.mediaDevices.getUserMedia === (fake as unknown);
  }, imageDataUrl);
}
