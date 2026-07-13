"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeRedeemCode } from "@/lib/utils";

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

/**
 * Scan caméra du QR affiché sur l'écran de gain du client (voir
 * RedeemQr) : évite de taper le code à la main en caisse. Repli
 * silencieux vers la saisie manuelle si l'API BarcodeDetector ou la
 * caméra ne sont pas disponibles.
 */
export function RedeemScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const supported = getBarcodeDetector() !== null;

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => stop, []);

  async function start() {
    setError("");
    const Detector = getBarcodeDetector();
    if (!Detector) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      const detector = new Detector({ formats: ["qr_code"] });
      const poll = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            window.clearInterval(poll);
            stop();
            const code = normalizeRedeemCode(codes[0].rawValue);
            router.push(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
          }
        } catch {
          // Frame illisible — on retente à l'intervalle suivant.
        }
      }, 350);
    } catch {
      setError("Caméra indisponible — vérifiez les autorisations du navigateur.");
      stop();
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
