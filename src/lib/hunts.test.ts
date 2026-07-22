import { describe, expect, it } from "vitest";
import {
  firstFreeStepPosition,
  mapHuntScanResult,
  planReorder,
  type StepMove,
} from "./hunts";
import { normalizeHuntCode } from "./utils";
import {
  claimHuntRewardSchema,
  createHuntStepSchema,
  huntRedeemCodeSchema,
  reorderHuntStepsSchema,
  stampHuntStepSchema,
  updateHuntSchema,
} from "./validations/hunts";

const UUID = "00000000-0000-4000-8000-000000000001";
const UUID2 = "00000000-0000-4000-8000-000000000002";
const UUID3 = "00000000-0000-4000-8000-000000000003";

// ────────────────────────────────────────────────────────────
// mapHuntScanResult — mapping du jsonb record_hunt_scan
// ────────────────────────────────────────────────────────────

describe("mapHuntScanResult", () => {
  const huntJson = {
    id: UUID,
    name: "Chasse de l'été",
    order_mode: "ordered",
    reward_label: "Un café offert",
  };

  it("mappe un tampon simple (scanned)", () => {
    const result = mapHuntScanResult({
      state: "scanned",
      hunt: huntJson,
      step: { position: 2, label: "La fontaine", hint: "Près du kiosque" },
      progress: { done: 2, total: 4 },
      stamped: [1, 2],
    });
    expect(result.state).toBe("scanned");
    expect(result.hunt).toEqual({
      id: UUID,
      name: "Chasse de l'été",
      orderMode: "ordered",
      rewardLabel: "Un café offert",
    });
    expect(result.step).toEqual({
      position: 2,
      label: "La fontaine",
      hint: "Près du kiosque",
    });
    expect(result.progress).toEqual({ done: 2, total: 4 });
    expect(result.stamped).toEqual([1, 2]);
  });

  it("expose retry_in_seconds sur too_soon", () => {
    const result = mapHuntScanResult({
      state: "too_soon",
      retry_in_seconds: 42,
      hunt: huntJson,
      step: { position: 3, label: "Le marché" },
      progress: { done: 1, total: 4 },
      stamped: [1],
    });
    expect(result.state).toBe("too_soon");
    expect(result.retryInSeconds).toBe(42);
    expect(result.step?.hint).toBeNull();
  });

  it("expose expected_position sur wrong_order", () => {
    const result = mapHuntScanResult({
      state: "wrong_order",
      expected_position: 1,
      hunt: huntJson,
      step: { position: 3, label: "Le marché" },
      progress: { done: 0, total: 4 },
      stamped: [],
    });
    expect(result.state).toBe("wrong_order");
    expect(result.expectedPosition).toBe(1);
  });

  it("expose le code et already sur completed", () => {
    const fresh = mapHuntScanResult({
      state: "completed",
      already: false,
      code: "CHASSE-ABCD2345",
      hunt: huntJson,
      step: { position: 4, label: "L'arrivée", hint: null },
      progress: { done: 4, total: 4 },
      stamped: [1, 2, 3, 4],
    });
    expect(fresh.state).toBe("completed");
    expect(fresh.code).toBe("CHASSE-ABCD2345");
    expect(fresh.already).toBe(false);

    const again = mapHuntScanResult({
      state: "completed",
      already: true,
      code: "CHASSE-ABCD2345",
      hunt: huntJson,
      step: { position: 4, label: "L'arrivée", hint: null },
      progress: { done: 4, total: 4 },
      stamped: [1, 2, 3, 4],
    });
    expect(again.already).toBe(true);
  });

  it("retombe sur unavailable et des défauts sûrs pour un jsonb inconnu", () => {
    for (const raw of [null, undefined, "junk", {}, { state: "bogus" }]) {
      const result = mapHuntScanResult(raw);
      expect(result.state).toBe("unavailable");
      expect(result.hunt).toBeNull();
      expect(result.step).toBeNull();
      expect(result.progress).toEqual({ done: 0, total: 0 });
      expect(result.stamped).toEqual([]);
      expect(result.code).toBeNull();
      expect(result.already).toBe(false);
    }
  });

  it("ignore les positions non numériques dans stamped", () => {
    const result = mapHuntScanResult({
      state: "scanned",
      stamped: [1, "x", 3, null],
    });
    expect(result.stamped).toEqual([1, 3]);
  });
});

// ────────────────────────────────────────────────────────────
// firstFreeStepPosition
// ────────────────────────────────────────────────────────────

describe("firstFreeStepPosition", () => {
  it("attribue la première position libre 1..10", () => {
    expect(firstFreeStepPosition([])).toBe(1);
    expect(firstFreeStepPosition([1, 2, 3])).toBe(4);
    expect(firstFreeStepPosition([2])).toBe(1);
    expect(firstFreeStepPosition([1, 3])).toBe(2);
    // Un trou après suppression (position 10 occupée) : on comble le trou.
    expect(firstFreeStepPosition([1, 2, 3, 4, 6, 7, 8, 9, 10])).toBe(5);
  });

  it("renvoie null quand les 10 positions sont prises", () => {
    expect(firstFreeStepPosition([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// planReorder
// ────────────────────────────────────────────────────────────

/** Rejoue la séquence de déplacements et vérifie qu'aucune collision
 *  n'apparaît (chaque cible est libre au moment du déplacement). */
function applyMoves(
  steps: Array<{ id: string; position: number }>,
  moves: StepMove[],
): Map<string, number> {
  const pos = new Map(steps.map((s) => [s.id, s.position]));
  for (const move of moves) {
    const occupied = new Set(
      [...pos.entries()].filter(([id]) => id !== move.id).map(([, p]) => p),
    );
    if (occupied.has(move.position)) {
      throw new Error(`collision sur la position ${move.position}`);
    }
    pos.set(move.id, move.position);
  }
  return pos;
}

describe("planReorder", () => {
  const steps = [
    { id: UUID, position: 1 },
    { id: UUID2, position: 2 },
    { id: UUID3, position: 3 },
  ];

  it("ne déplace rien quand l'ordre est déjà bon", () => {
    expect(planReorder(steps, [UUID, UUID2, UUID3])).toEqual([]);
  });

  it("réordonne un cycle sans jamais violer l'unicité", () => {
    // Nouvel ordre 3,1,2 → permutation cyclique des positions 1,2,3.
    const moves = planReorder(steps, [UUID3, UUID, UUID2]);
    expect(moves).not.toBeNull();
    const final = applyMoves(steps, moves!);
    expect(final.get(UUID3)).toBe(1);
    expect(final.get(UUID)).toBe(2);
    expect(final.get(UUID2)).toBe(3);
  });

  it("rejette une entrée incohérente (taille, doublon, id inconnu)", () => {
    expect(planReorder(steps, [UUID, UUID2])).toBeNull();
    expect(planReorder(steps, [UUID, UUID, UUID3])).toBeNull();
    expect(planReorder(steps, [UUID, UUID2, "unknown"])).toBeNull();
  });

  it("échoue proprement sur une chasse pleine (10 étapes) permutée", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      id: `id-${i + 1}`,
      position: i + 1,
    }));
    // Échange strict de deux étapes : aucun slot libre → null.
    const order = ten.map((s) => s.id);
    [order[0], order[1]] = [order[1], order[0]];
    expect(planReorder(ten, order)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// normalizeHuntCode
// ────────────────────────────────────────────────────────────

describe("normalizeHuntCode", () => {
  it("normalise diverses saisies caisse", () => {
    expect(normalizeHuntCode("chasse abcd2345")).toBe("CHASSE-ABCD2345");
    expect(normalizeHuntCode("ABCD2345")).toBe("CHASSE-ABCD2345");
    expect(normalizeHuntCode("chasse-abcd2345")).toBe("CHASSE-ABCD2345");
    expect(normalizeHuntCode("chasseabcd2345")).toBe("CHASSE-ABCD2345");
  });

  it("rejette un code de roue ou une forme invalide", () => {
    expect(normalizeHuntCode("GAIN-ABCD2345")).toBe("");
    expect(normalizeHuntCode("ABC")).toBe("");
    // I/O/0/1 exclus de l'alphabet.
    expect(normalizeHuntCode("ABCDIO01")).toBe("");
    expect(normalizeHuntCode("")).toBe("");
  });
});

// ────────────────────────────────────────────────────────────
// Validations Zod
// ────────────────────────────────────────────────────────────

describe("validations chasse", () => {
  it("borne le lien d'étape (stepToken)", () => {
    expect(stampHuntStepSchema.safeParse({ stepToken: "AbCd1234" }).success).toBe(true);
    expect(stampHuntStepSchema.safeParse({ stepToken: "short" }).success).toBe(false);
    expect(stampHuntStepSchema.safeParse({ stepToken: "with space!" }).success).toBe(false);
  });

  it("exige stepToken OU huntId au claim, email optionnel", () => {
    expect(claimHuntRewardSchema.safeParse({}).success).toBe(false);
    expect(claimHuntRewardSchema.safeParse({ huntId: UUID }).success).toBe(true);
    expect(
      claimHuntRewardSchema.safeParse({ huntId: UUID, email: "pas-un-email" }).success,
    ).toBe(false);
    const ok = claimHuntRewardSchema.safeParse({ huntId: UUID, email: "A@B.CO" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe("a@b.co");
  });

  it("valide le code de retrait caisse (CHASSE-XXXXXXXX)", () => {
    expect(huntRedeemCodeSchema.safeParse(" chasse-abcd2345 ").success).toBe(true);
    expect(huntRedeemCodeSchema.safeParse("CHASSE-ABCDIO01").success).toBe(false);
    expect(huntRedeemCodeSchema.safeParse("GAIN-ABCD2345").success).toBe(false);
  });

  it("borne le libellé et l'indice d'une étape", () => {
    expect(
      createHuntStepSchema.safeParse({ hunt_id: UUID, label: "La fontaine" }).success,
    ).toBe(true);
    expect(createHuntStepSchema.safeParse({ hunt_id: UUID, label: "" }).success).toBe(false);
    expect(
      createHuntStepSchema.safeParse({
        hunt_id: UUID,
        label: "x",
        hint: "y".repeat(201),
      }).success,
    ).toBe(false);
  });

  it("réordonnancement : 2..10 identifiants sans doublon", () => {
    expect(
      reorderHuntStepsSchema.safeParse({ hunt_id: UUID, order: [UUID2, UUID3] }).success,
    ).toBe(true);
    expect(
      reorderHuntStepsSchema.safeParse({ hunt_id: UUID, order: [UUID2] }).success,
    ).toBe(false);
    expect(
      reorderHuntStepsSchema.safeParse({ hunt_id: UUID, order: [UUID2, UUID2] }).success,
    ).toBe(false);
  });

  it("refuse une fenêtre de dates incohérente", () => {
    const base = {
      id: UUID,
      name: "Ma chasse",
      order_mode: "free",
      min_scan_interval_seconds: 0,
    };
    expect(updateHuntSchema.safeParse(base).success).toBe(true);
    expect(
      updateHuntSchema.safeParse({
        ...base,
        starts_at: "2026-08-01T10:00",
        ends_at: "2026-08-01T09:00",
      }).success,
    ).toBe(false);
    expect(
      updateHuntSchema.safeParse({
        ...base,
        starts_at: "2026-08-01T09:00",
        ends_at: "2026-08-01T10:00",
      }).success,
    ).toBe(true);
  });
});
