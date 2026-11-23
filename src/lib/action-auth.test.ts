// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserAndOrgMock, redirectMock } = vi.hoisted(() => ({
  getUserAndOrgMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  getUserAndOrg: (...args: unknown[]) => getUserAndOrgMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

import { requireOrgEditor, requireOrgOwner } from "./action-auth";

const ORG = { id: "org-1", name: "Bistrot", slug: "bistrot" };

beforeEach(() => {
  getUserAndOrgMock.mockReset();
  redirectMock.mockClear();
});

describe("requireOrgEditor", () => {
  it("redirige vers /login si utilisateur ou organisation absents", async () => {
    getUserAndOrgMock.mockResolvedValue({ user: null, organization: null, role: null });
    await expect(requireOrgEditor()).rejects.toThrow("REDIRECT:/login");
  });

  it("refuse le rôle staff (retourne null)", async () => {
    getUserAndOrgMock.mockResolvedValue({
      user: { id: "u-1" },
      organization: ORG,
      role: "staff",
    });
    expect(await requireOrgEditor()).toBeNull();
  });

  it("autorise editor et owner", async () => {
    getUserAndOrgMock.mockResolvedValue({
      user: { id: "u-1" },
      organization: ORG,
      role: "editor",
    });
    expect(await requireOrgEditor()).toEqual({
      userId: "u-1",
      organization: ORG,
      role: "editor",
    });

    getUserAndOrgMock.mockResolvedValue({
      user: { id: "u-2" },
      organization: ORG,
      role: "owner",
    });
    expect(await requireOrgEditor()).toEqual({
      userId: "u-2",
      organization: ORG,
      role: "owner",
    });
  });
});

describe("requireOrgOwner", () => {
  it("refuse editor et staff, autorise uniquement owner", async () => {
    getUserAndOrgMock.mockResolvedValue({
      user: { id: "u-1" },
      organization: ORG,
      role: "editor",
    });
    expect(await requireOrgOwner()).toBeNull();

    getUserAndOrgMock.mockResolvedValue({
      user: { id: "u-2" },
      organization: ORG,
      role: "owner",
    });
    expect(await requireOrgOwner()).toEqual({
      userId: "u-2",
      organization: ORG,
      role: "owner",
    });
  });
});
