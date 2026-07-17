import { describe, expect, it } from "vitest";
import { selectActiveMembership, type OrganizationMembership } from "./active-organization";

function membership(
  organizationId: string,
  joinedAt: string,
): OrganizationMembership {
  return {
    organizationId,
    role: "editor",
    joinedAt,
    organization: { id: organizationId, name: organizationId } as OrganizationMembership["organization"],
  };
}

describe("selectActiveMembership", () => {
  const oldest = membership("00000000-0000-4000-8000-000000000001", "2026-01-01T00:00:00Z");
  const newest = membership("00000000-0000-4000-8000-000000000002", "2026-02-01T00:00:00Z");

  it("honore une organisation demandée dont l'utilisateur est membre", () => {
    expect(selectActiveMembership([oldest, newest], newest.organizationId)).toBe(newest);
  });

  it("ignore un cookie ne correspondant à aucune appartenance", () => {
    expect(selectActiveMembership([newest, oldest], "tenant-inconnu")).toBe(oldest);
  });

  it("retourne null sans appartenance", () => {
    expect(selectActiveMembership([], undefined)).toBeNull();
  });
});
