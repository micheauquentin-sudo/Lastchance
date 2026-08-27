// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { createBrowserClient } from "@supabase/ssr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventPublicState } from "@/lib/event";
import type { Database } from "@/types/database.generated";

vi.mock("@/actions/events", () => ({ getEventState: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const { getEventState } = await import("@/actions/events");
const { createClient } = await import("@/lib/supabase/client");
const { useEventPoll } = await import("./use-event-poll");

/**
 * L'ÉCRAN DOIT DIRE QU'IL EST DÉSYNCHRONISÉ.
 *
 * Le poll comptait déjà ses échecs — dans un `useRef`, qui ne déclenche AUCUN
 * rendu. Un bandeau branché dessus ne se serait donc jamais affiché : le
 * téléphone serait resté sur une question close, muet, pendant que la salle
 * passait à la suivante. Ce fichier tient le miroir en state.
 */

const etat = (over: Partial<EventPublicState> = {}): EventPublicState => ({
  state: "ok",
  session: null,
  question: null,
  correctOptionId: null,
  distribution: null,
  leaderboard: [],
  you: null,
  serverNow: null,
  ...over,
});

const enPanne = etat({ state: "unavailable" });

/**
 * Avance le temps jusqu'à ce que le poll ait effectué EXACTEMENT `n` lectures.
 * Par pas courts : avancer d'un bloc en enchaînerait plusieurs et on ne pourrait
 * plus distinguer « un échec » de « deux ».
 */
async function attendreLectures(n: number) {
  const lectures = () => vi.mocked(getEventState).mock.calls.length;
  for (let i = 0; i < 200 && lectures() < n; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
  }
  expect(lectures()).toBe(n);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(getEventState).mockReset();
  vi.mocked(createClient).mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useEventPoll — aveu de désynchronisation", () => {
  it("se tait sur un échec ISOLÉ, et l'avoue au second", async () => {
    vi.mocked(getEventState).mockResolvedValue(enPanne);
    const { result } = renderHook(() => useEventPoll("s-1", etat()));

    await attendreLectures(1); // 1er échec : le poll suivant rattrape d'ordinaire.
    expect(result.current.desynchronise).toBe(false);

    await attendreLectures(2); // 2e échec consécutif : l'écran ment sans le dire.
    expect(result.current.desynchronise).toBe(true);
  });

  it("compte aussi une action qui JETTE (réseau coupé)", async () => {
    vi.mocked(getEventState).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useEventPoll("s-2", etat()));

    await attendreLectures(2);
    expect(result.current.desynchronise).toBe(true);
  });

  it("LÈVE le bandeau dès qu'une lecture saine revient", async () => {
    vi.mocked(getEventState).mockResolvedValue(enPanne);
    const { result } = renderHook(() => useEventPoll("s-3", etat()));

    await attendreLectures(2);
    expect(result.current.desynchronise).toBe(true);

    vi.mocked(getEventState).mockResolvedValue(
      etat({ leaderboard: [{ pseudo: "Zoé", avatar: "fox", score: 3, rank: 1 }] }),
    );
    await attendreLectures(3);
    expect(result.current.desynchronise).toBe(false);
    expect(result.current.state.leaderboard).toHaveLength(1);
  });

  it("garde la dernière photo saine pendant la panne", async () => {
    const initial = etat({
      leaderboard: [{ pseudo: "Zoé", avatar: "fox", score: 3, rank: 1 }],
    });
    vi.mocked(getEventState).mockResolvedValue(enPanne);
    const { result } = renderHook(() => useEventPoll("s-4", initial));

    await attendreLectures(2);
    expect(result.current.state.state).toBe("ok");
    expect(result.current.state.leaderboard).toHaveLength(1);
  });

  it("continue le polling si Realtime ne peut pas s'initialiser", async () => {
    vi.mocked(getEventState).mockResolvedValue(etat());
    vi.mocked(createClient).mockImplementation(() => {
      throw new Error("Supabase public configuration missing");
    });

    expect(() => renderHook(() => useEventPoll("s-5", etat(), true))).not.toThrow();
    await attendreLectures(1);
  });

  it("continue le polling si l'abonnement Realtime jette", async () => {
    vi.mocked(getEventState).mockResolvedValue(etat());
    const client = createBrowserClient<Database>(
      "https://example.supabase.co",
      "anonymous-test-key",
    );
    vi.spyOn(client, "channel").mockImplementation(() => {
      throw new Error("Realtime unavailable");
    });
    vi.mocked(createClient).mockReturnValue(client);

    expect(() => renderHook(() => useEventPoll("s-6", etat(), true))).not.toThrow();
    await attendreLectures(1);
  });
});
