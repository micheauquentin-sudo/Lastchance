import { describe, expect, it } from "vitest";
import {
  findUnresolvedSuspension,
  isVisibleToMerchant,
  resolveSenderPhase,
  suspensionRefusalMessage,
  type SmsSenderRecord,
} from "./sms-sender-state";

const record = (
  status: string,
  retiredAt: string | null = null,
  senderId = "MONRESTO",
): SmsSenderRecord => ({ senderId, status, retiredAt });

const RETIRED_AT = "2026-08-01T10:00:00.000Z";

describe("resolveSenderPhase", () => {
  it("rend le statut tel quel tant que la ligne n'est pas retirée", () => {
    expect(resolveSenderPhase(record("pending"))).toBe("pending");
    expect(resolveSenderPhase(record("declared"))).toBe("declared");
    expect(resolveSenderPhase(record("rejected"))).toBe("rejected");
    expect(resolveSenderPhase(record("suspended"))).toBe("suspended");
  });

  it("distingue « retiré » de « suspendu puis retiré »", () => {
    // LE CŒUR DU MODULE. `set_sms_sender_status(…, 'retired')` conserve le
    // statut : la ligne suspendue puis retirée porte les DEUX marques, et
    // n'afficher que « retiré » efface la sanction.
    expect(resolveSenderPhase(record("declared", RETIRED_AT))).toBe("retired");
    expect(resolveSenderPhase(record("suspended", RETIRED_AT))).toBe(
      "suspended_retired",
    );
  });

  it("ne requalifie pas un statut imprévu en « retiré »", () => {
    expect(resolveSenderPhase(record("something-else"))).toBe("unknown");
    expect(resolveSenderPhase(record("something-else", RETIRED_AT))).toBe(
      "unknown",
    );
  });
});

describe("findUnresolvedSuspension", () => {
  it("ne trouve rien sur une organisation saine", () => {
    expect(
      findUnresolvedSuspension([
        record("declared"),
        record("rejected", null, "MONRESTO2"),
        record("declared", RETIRED_AT, "ANCIENNOM"),
      ]),
    ).toBeNull();
  });

  it("trouve la suspension et la NOMME", () => {
    const found = findUnresolvedSuspension([
      record("pending", null, "MONRESTO2"),
      record("suspended", null, "MONRESTO"),
    ]);
    expect(found?.senderId).toBe("MONRESTO");
  });

  it("le retrait ne lève pas la suspension", () => {
    // La garde de `declare_sms_sender` (20260829120000) ne filtre pas
    // `retired_at` : l'écran doit lire la même chose que la base, sinon il
    // promet une déclaration que la base refusera.
    const found = findUnresolvedSuspension([
      record("suspended", RETIRED_AT, "MONRESTO"),
      record("pending", null, "MONRESTO2"),
    ]);
    expect(found?.senderId).toBe("MONRESTO");
  });

  it("ne trouve rien sur une liste vide", () => {
    expect(findUnresolvedSuspension([])).toBeNull();
  });
});

describe("isVisibleToMerchant", () => {
  it("montre tout ce qui n'est pas retiré", () => {
    for (const status of ["pending", "declared", "rejected", "suspended"]) {
      expect(isVisibleToMerchant(record(status)), status).toBe(true);
    }
  });

  it("cache un retrait ordinaire, garde une suspension retirée", () => {
    expect(isVisibleToMerchant(record("declared", RETIRED_AT))).toBe(false);
    expect(isVisibleToMerchant(record("pending", RETIRED_AT))).toBe(false);
    expect(isVisibleToMerchant(record("suspended", RETIRED_AT))).toBe(true);
  });
});

describe("suspensionRefusalMessage", () => {
  it("nomme l'expéditeur sanctionné", () => {
    expect(suspensionRefusalMessage("MONRESTO")).toContain("MONRESTO");
  });

  it("dit qu'un AUTRE nom ne contourne pas, et par où sortir", () => {
    // Les deux seules choses que le commerçant doit apprendre : réessayer
    // avec un autre nom ne sert à rien, et la levée passe par le support.
    const message = suspensionRefusalMessage("MONRESTO");
    expect(message).toMatch(/nom différent/i);
    expect(message).toMatch(/Écrivez-nous/i);
  });
});
