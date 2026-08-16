// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'ENREGISTREMENT DE SESSION EST LE TROU QUE `before_send` NE BOUCHE PAS.
 *
 * `masquerJetonsDeLEvenement` (prouvé par `analytics.test.ts`) balaie les
 * propriétés de type CHAÎNE de premier niveau. Les événements `$snapshot` du
 * rejeu de session, eux, transportent l'URL dans des TABLEAUX imbriqués : le
 * crochet passe à côté. Si le rejeu était activé — un clic dans l'interface
 * PostHog, par n'importe qui ayant accès au projet — deux choses partiraient
 * malgré tout le reste du dispositif :
 *
 *  - l'URL à jeton de `/commande`, `/hunt` et `/invite`, donc de quoi
 *    encaisser une commande ou entrer dans une organisation ;
 *  - le film du formulaire de remise en caisse, saisie comprise.
 *
 * Cette garde vérifie que la coupure est déclarée DANS LE CODE, pas seulement
 * cochée dans un réglage distant que ce dépôt ne mesure pas.
 */

// `vi.hoisted` : `vi.mock` est remonté en tête de module, les espions doivent
// donc être créés AVANT lui, sinon la fabrique lit une variable non initialisée.
const { init, optIn } = vi.hoisted(() => ({ init: vi.fn(), optIn: vi.fn() }));

vi.mock("posthog-js", () => ({
  default: {
    __loaded: false,
    init,
    opt_in_capturing: optIn,
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
  },
}));

import { Analytics, OPTIONS_POSTHOG } from "./analytics";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  localStorage.setItem("lc:analytics-consent", "granted");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe("Analytics — ce qui est réellement passé à posthog.init", () => {
  it("coupe l'enregistrement de session", () => {
    render(<Analytics />);

    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][1];
    expect(options.disable_session_recording).toBe(true);
  });

  it("garde le masquage des jetons sur le même appel", () => {
    // Les deux protections voyagent dans le même objet : si quelqu'un le
    // remplace par un littéral inline, cette assertion tombe avec l'autre.
    render(<Analytics />);
    expect(init.mock.calls[0][1]).toBe(OPTIONS_POSTHOG);
    expect(typeof OPTIONS_POSTHOG.before_send).toBe("function");
    expect(optIn).toHaveBeenCalled();
  });

  it("sans consentement, rien n'est initialisé du tout", () => {
    localStorage.setItem("lc:analytics-consent", "denied");
    render(<Analytics />);
    expect(init).not.toHaveBeenCalled();
  });
});
