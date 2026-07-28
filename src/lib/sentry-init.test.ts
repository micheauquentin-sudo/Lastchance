// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'assainissement ne vaut que s'il est BRANCHÉ : ce test prouve que les
 * trois runtimes (serveur, edge, navigateur) passent bien par le module
 * central, et pas seulement qu'il existe.
 */

const init = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  init: (...args: unknown[]) => init(...args),
  captureRouterTransitionStart: vi.fn(),
}));

type SentryOptions = {
  sendDefaultPii?: boolean;
  beforeSend?: (event: Record<string, unknown>) => unknown;
  beforeBreadcrumb?: (crumb: Record<string, unknown>) => unknown;
};

const RUNTIMES: Array<{ name: string; load: () => Promise<unknown> }> = [
  { name: "serveur", load: () => import("../../sentry.server.config") },
  { name: "edge", load: () => import("../../sentry.edge.config") },
  { name: "navigateur", load: () => import("../instrumentation-client") },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe.each(RUNTIMES)("Sentry ($name)", ({ load }) => {
  it("branche l'assainissement central sur les exceptions et le fil d'Ariane", async () => {
    await load();

    expect(init).toHaveBeenCalledOnce();
    const options = init.mock.calls[0][0] as SentryOptions;
    expect(options.sendDefaultPii).toBe(false);

    const event = options.beforeSend?.({
      message: "échec pour joueur@example.com",
      extra: { api_key: "sk_live_abcdefghijklmnop" },
    }) as { message: string; extra: { api_key: string } };
    expect(event.message).not.toContain("joueur@example.com");
    expect(event.extra.api_key).not.toContain("sk_live");

    const crumb = options.beforeBreadcrumb?.({
      message: "appel https://app.example.com/api/wallet?token=abc123def456",
    }) as { message: string };
    expect(crumb.message).not.toContain("abc123def456");
  });
});
