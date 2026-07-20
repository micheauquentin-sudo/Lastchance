import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import QRCode from "qrcode";

/**
 * Génère e2e/.artifacts/qr.y4m : une « vraie » caméra pour Chromium
 * (--use-file-for-fake-video-capture) qui filme en boucle le QR du code
 * de gain seedé. Le scanner est ainsi testé sur son pipeline réel
 * (getUserMedia → <video> → détection) sans aucun patch JavaScript —
 * l'injection de getUserMedia s'est révélée fragile selon les moteurs.
 */
const CODE = "GAIN-E2ESCAN2";
const W = 640;
const H = 480;

export default async function globalSetup() {
  const png = PNG.sync.read(
    await QRCode.toBuffer(CODE, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 360,
    }),
  );

  /* Cadre blanc W×H, QR centré. */
  const rgb = new Uint8Array(W * H * 3).fill(255);
  const ox = Math.floor((W - png.width) / 2);
  const oy = Math.floor((H - png.height) / 2);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const s = (y * png.width + x) * 4;
      const d = ((oy + y) * W + (ox + x)) * 3;
      rgb[d] = png.data[s];
      rgb[d + 1] = png.data[s + 1];
      rgb[d + 2] = png.data[s + 2];
    }
  }

  /* RGB → YUV 4:2:0 (BT.601), une frame répétée. */
  const yPlane = new Uint8Array(W * H);
  const uPlane = new Uint8Array((W / 2) * (H / 2)).fill(128);
  const vPlane = new Uint8Array((W / 2) * (H / 2)).fill(128);
  for (let i = 0; i < W * H; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    yPlane[i] = Math.max(16, Math.min(235, Math.round(16 + 0.257 * r + 0.504 * g + 0.098 * b)));
  }

  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`);
  const frameHeader = Buffer.from("FRAME\n");
  const frame = Buffer.concat([frameHeader, Buffer.from(yPlane), Buffer.from(uPlane), Buffer.from(vPlane)]);
  // Quelques secondes de « film » : le scanner sonde toutes les 350 ms.
  const frames = Array.from({ length: 90 }, () => frame);

  const dir = join(__dirname, ".artifacts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "qr.y4m"), Buffer.concat([header, ...frames]));
}
