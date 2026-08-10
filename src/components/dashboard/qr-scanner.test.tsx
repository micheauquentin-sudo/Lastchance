// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QrScanner } from "@/components/dashboard/qr-scanner";

/**
 * CE QUE CE FICHIER PROTÈGE.
 *
 * **Le flux caméra doit atterrir sur le <video>.** Le piège est structurel :
 * l'élément n'est monté qu'une fois `scanning` à true, donc tout code qui
 * branche `srcObject` AVANT ce passage vise une ref nulle. Le symptôme n'est
 * pas une erreur mais un **aperçu noir** — et, plus insidieux, un `videoWidth`
 * à 0 qui rend toute détection impossible en silence. L'E2E ne le voyait pas :
 * il vérifie que l'aperçu est *visible*, ce qu'un <video> vide est aussi.
 */

/** Un VRAI MediaStream : `video.srcObject` refuse tout autre type. */
function fakeStream() {
  const track = { stop: vi.fn() };
  const stream = new MediaStream();
  // happy-dom fournit la classe (nécessaire au contrôle de type de
  // srcObject) mais pas getTracks : on le pose à la main.
  Object.defineProperty(stream, "getTracks", {
    configurable: true,
    value: () => [track as unknown as MediaStreamTrack],
  });
  return Object.assign(stream, { _track: track });
}

function mockCamera(stream: MediaStream) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("QrScanner", () => {
  it("branche le flux caméra sur le <video> une fois l'aperçu monté", async () => {
    const stream = fakeStream();
    mockCamera(stream);

    const { container } = render(
      <QrScanner label="📷 Scanner" onResult={vi.fn()} />,
    );

    // `supported` est lu après montage : le bouton n'existe qu'ensuite.
    const bouton = await screen.findByRole("button", { name: "📷 Scanner" });
    await act(async () => {
      fireEvent.click(bouton);
    });

    const video = await waitFor(() => {
      const el = container.querySelector("video");
      expect(el).toBeTruthy();
      return el as HTMLVideoElement;
    });

    await waitFor(() => expect(video.srcObject).toBe(stream));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("coupe la caméra quand on annule le scan", async () => {
    const stream = fakeStream();
    mockCamera(stream);

    render(<QrScanner label="📷 Scanner" onResult={vi.fn()} />);

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "📷 Scanner" }));
    });

    const annuler = await screen.findByRole("button", {
      name: "Annuler le scan",
    });
    await act(async () => {
      fireEvent.click(annuler);
    });

    expect(stream._track.stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "📷 Scanner" })).toBeTruthy();
  });

  it("affiche un message quand la caméra est refusée", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
      },
    });

    render(<QrScanner label="📷 Scanner" onResult={vi.fn()} />);

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "📷 Scanner" }));
    });

    expect(await screen.findByText(/Caméra indisponible/)).toBeTruthy();
  });
});
