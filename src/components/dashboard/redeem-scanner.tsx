"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// BarcodeDetector n'est pas systématiquement dans le lib DOM du projet
// (support navigateur encore partiel — Chrome/Edge/Android oui, Safari/
// Firefox non à ce jour). Déclaration minimale, suffisante à l'usage.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  return (
    (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
      .BarcodeDetector ?? null
  );
}

/** Décodage d'une frame vidéo : BarcodeDetector natif quand il existe,
 *  sinon jsQR (chargé à la demande) sur un canvas — Safari/Firefox. */
type FrameDecoder = (video: HTMLVideoElement) => Promise<string | null>;

/** Repli universel : jsQR (~40 Ko, importé uniquement si nécessaire). */
async function createJsQrDecoder(): Promise<FrameDecoder> {
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!ctx) return null;
    // Résolution plafonnée : suffisant pour un QR plein cadre, et le
    // décodage reste fluide sur les téléphones modestes.
    const scale = Math.min(1, 640 / (video.videoWidth || 640));
    canvas.width = Math.round((video.videoWidth || 640) * scale);
    canvas.height = Math.round((video.videoHeight || 480) * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = jsQR(image.data, image.width, image.height, {
      inversionAttempts: "dontInvert",
    });
    return hit?.data ?? null;
  };
}

async function createDecoder(): Promise<FrameDecoder> {
  const Detector = getBarcodeDetector();
  if (!Detector) return createJsQrDecoder();

  // L'API peut exister sans backend fonctionnel : la CONSTRUCTION
  // elle-même peut lever (« detection service unavailable » sur Chrome
  // sans service de détection), et detect() peut rester muet à jamais.
  // Dans les deux cas : jsQR.
  let detector: BarcodeDetectorLike;
  try {
    detector = new Detector({ formats: ["qr_code"] });
  } catch {
    return createJsQrDecoder();
  }
  let silentFrames = 0;
  let fallback: FrameDecoder | null = null;
  return async (video) => {
    if (fallback) return fallback(video);
    try {
      const codes = await detector.detect(video);
      if (codes.length > 0) return codes[0].rawValue;
    } catch {
      silentFrames += 3; // API cassée : bascule accélérée
    }
    if (++silentFrames >= 8) fallback = await createJsQrDecoder();
    return null;
  };
}

/**
 * Scan caméra du QR affiché sur l'écran de gain du client (voir
 * RedeemQr) : évite de taper le code à la main en caisse. Repli
 * silencieux vers la saisie manuelle si la caméra est refusée ou
 * indisponible. Fonctionne partout où getUserMedia existe :
 * BarcodeDetector natif (Chrome/Android) ou jsQR (Safari/Firefox).
 */
export function RedeemScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const detectBusyRef = useRef(false);
  const startingRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(false);

  // getUserMedia suffit : le décodage a toujours un repli (jsQR).
  // Évalué au montage — jamais pendant le rendu serveur.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique post-montage, évite tout écart d'hydratation SSR/CSR.
    setSupported(
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  function stop() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    detectBusyRef.current = false;
    startingRef.current = false;
    setScanning(false);
  }

  // Démontage : caméra ET boucle de détection arrêtées.
  useEffect(() => stop, []);

  async function start() {
    if (startingRef.current || scanning) return; // double-clic sur Démarrer
    startingRef.current = true;
    setError("");

    try {
      const decode = await createDecoder();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      intervalRef.current = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        if (detectBusyRef.current) return; // une détection à la fois
        detectBusyRef.current = true;
        try {
          const raw = await decode(video);
          if (raw) {
            stop();
            // Le payload du QR/pass porte déjà son préfixe (GAIN-… pour la
            // roue, CHASSE-… pour la chasse au trésor) : on le transmet TEL
            // QUEL. Le routage GAIN vs CHASSE et toute normalisation sont
            // faits côté serveur par lookupRedeemCode. Pré-normaliser ici
            // forcerait le préfixe GAIN- et casserait les codes de chasse.
            router.push(`/dashboard/redeem?code=${encodeURIComponent(raw)}`);
            return;
          }
        } catch {
          // Frame illisible — on retente à l'intervalle suivant.
        } finally {
          detectBusyRef.current = false;
        }
      }, 350);
    } catch (err) {
      // Trace développeur : distingue refus de permission, absence de
      // caméra, échec du décodeur… sans rien exposer à l'utilisateur.
      console.warn("[scanner] démarrage impossible :", err);
      setError("Caméra indisponible — vérifiez les autorisations du navigateur.");
      stop();
    } finally {
      startingRef.current = false;
    }
  }

  if (!supported) return null;

  return (
    <div className="mb-6">
      {!scanning ? (
        <button
          type="button"
          onClick={start}
          className="w-full rounded-xl border border-zinc-300 bg-white text-sm font-semibold px-4 py-3 hover:bg-zinc-50 transition-colors"
        >
          📷 Scanner le QR du client
        </button>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-300 bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Aperçu caméra pour scanner le code de gain"
            className="w-full aspect-video object-cover"
          />
          <button
            type="button"
            onClick={stop}
            className="w-full bg-zinc-900 text-white text-sm font-semibold py-2.5"
          >
            Annuler le scan
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
