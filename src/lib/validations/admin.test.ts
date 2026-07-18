import { describe, expect, it } from "vitest";
import { merchantCompAccessSchema } from "./admin";

const BASE = {
  organizationId: "20000000-0000-4000-8000-000000000001",
  enabled: "true",
  note: "Partenaire",
  includePronostics: "false",
};

describe("merchantCompAccessSchema", () => {
  it("conserve une date calendrier sans conversion UTC implicite", () => {
    const parsed = merchantCompAccessSchema.parse({ ...BASE, until: "2026-07-18" });
    expect(parsed.until).toBe("2026-07-18");
  });

  it("rejette une date impossible", () => {
    expect(
      merchantCompAccessSchema.safeParse({ ...BASE, until: "2026-02-30" }).success,
    ).toBe(false);
  });
});
