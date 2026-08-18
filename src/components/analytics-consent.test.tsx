// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LE REFUS DOIT TENIR — trois façons dont il ne tenait pas.
 *
 * `analytics-init.test.tsx` prouve CE QUI est passé à `posthog.init`. Ce
 * fichier prouve QUAND, et il lui faut son propre module mocké : ses gardes
 * ont besoin d'un `posthog-js` dont `__loaded` bascule et dont l'ordre des
 * appels est observable, ce que le mock de l'autre fichier ne permet pas.
 *
 * Les trois défauts, dans l'ordre où on les rencontre :
 *
 *  1. La COURSE. Le consentement était lu AVANT le téléchargement du chunk
 *     posthog-js et jamais après. Or ce téléchargement dure un temps réseau,
 *     et c'est précisément le moment où le bandeau est à l'écran : retirer son
 *     consentement pendant ces quelques centaines de millisecondes laissait
 *     `init` et `opt_in_capturing` s'exécuter quand même, sur une décision
 *     périmée.
 *
 *  2. L'ORDRE. `opt_out_capturing()` puis `reset()` — or `reset()` de
 *     posthog-js appelle `consent.reset()`, qui EFFACE la préférence qu'on
 *     vient d'écrire. Le refus était donc annulé par le geste censé
 *     l'appliquer, et la bibliothèque repartait en état « pending », c'est-à-
 *     dire capture ACTIVE. Vérifié sur la version installée (1.409.5).
 *
 *  3. LA PARTIE EN COURS. `capturePlayEvent` ne testait que `__loaded`. Un
 *     joueur qui refusait au milieu d'un tour de roue voyait tous les
 *     événements de sa page partir jusqu'au rechargement suivant : PostHog
 *     était déjà chargé, et rien ne relisait sa décision.
 */

const ph = vi.hoisted(() => {
  /** Trace d'appel, pour prouver un ORDRE et pas seulement une présence. */
  const ordre: string[] = [];
  const faux = {
    __loaded: false,
    ordre,
    init: vi.fn(() => {
      faux.__loaded = true;
      ordre.push("init");
    }),
    opt_in_capturing: vi.fn(() => ordre.push("opt_in")),
    opt_out_capturing: vi.fn(() => ordre.push("opt_out")),
    reset: vi.fn(() => ordre.push("reset")),
    capture: vi.fn(() => ordre.push("capture")),
    has_opted_out_capturing: vi.fn(() => false),
  };
  return faux;
});

vi.mock("posthog-js", () => ({ default: ph }));

import { Analytics, capturePlayEvent } from "./analytics";

/** Laisse se résoudre l'`import()` mocké et les effets qui en dépendent. */
const laisserPasserLImport = () => vi.waitFor(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  ph.__loaded = false;
  ph.ordre.length = 0;
  ph.has_opted_out_capturing.mockReturnValue(false);
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  localStorage.setItem("lc:analytics-consent", "granted");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe("le consentement est relu après le chargement de posthog-js", () => {
  it("un refus arrivé pendant le téléchargement annule l'initialisation", async () => {
    render(<Analytics />);
    // L'effet a démarré et attend le chunk. L'utilisateur change d'avis ICI —
    // exactement la fenêtre que la lecture unique laissait ouverte.
    localStorage.setItem("lc:analytics-consent", "denied");
    await laisserPasserLImport();

    expect(ph.init).not.toHaveBeenCalled();
    expect(ph.opt_in_capturing).not.toHaveBeenCalled();
  });

  it("sans changement d'avis, l'initialisation a bien lieu", async () => {
    // Contre-épreuve : la garde ci-dessus doit bloquer un refus, pas tout.
    render(<Analytics />);
    await vi.waitFor(() => expect(ph.init).toHaveBeenCalledTimes(1));
    expect(ph.opt_in_capturing).toHaveBeenCalled();
  });
});

describe("le refus survit au geste qui l'applique", () => {
  it("réinitialise AVANT de couper, jamais l'inverse", async () => {
    render(<Analytics />);
    await vi.waitFor(() => expect(ph.init).toHaveBeenCalled());

    // Retrait du consentement, par le même canal que le bandeau.
    localStorage.setItem("lc:analytics-consent", "denied");
    window.dispatchEvent(new Event("lastchance:analytics-consent"));
    await vi.waitFor(() => expect(ph.opt_out_capturing).toHaveBeenCalled());

    const iReset = ph.ordre.indexOf("reset");
    const iOptOut = ph.ordre.indexOf("opt_out");
    expect(iReset, "reset() doit avoir été appelé").toBeGreaterThan(-1);
    expect(
      iReset,
      "`reset()` efface la préférence de consentement : appelé APRÈS " +
        "`opt_out_capturing()`, il annule le refus et remet la capture active",
    ).toBeLessThan(iOptOut);
  });
});

describe("capturePlayEvent respecte un refus en cours de partie", () => {
  it("n'envoie plus rien une fois l'utilisateur désinscrit", async () => {
    render(<Analytics />);
    await vi.waitFor(() => expect(ph.init).toHaveBeenCalled());

    // La bibliothèque reste chargée — c'est tout le piège : `__loaded` est
    // toujours vrai, et il ne dit rien du consentement.
    ph.has_opted_out_capturing.mockReturnValue(true);
    capturePlayEvent("wheel_spun");
    expect(ph.capture).not.toHaveBeenCalled();

    // Contre-épreuve : sans refus, l'événement part.
    ph.has_opted_out_capturing.mockReturnValue(false);
    capturePlayEvent("wheel_spun");
    expect(ph.capture).toHaveBeenCalledWith("wheel_spun", undefined);
  });
});
