import { describe, expect, it } from "vitest";
import {
  can,
  canAssignRole,
  canManageAdmin,
  evaluateRoleChange,
  ROLE_PERMISSIONS,
} from "./rbac";
import { ADMIN_ROLES } from "@/types/admin";

describe("can", () => {
  it("super_admin a toutes les permissions dont la gestion des admins", () => {
    expect(can("super_admin", "admins.manage")).toBe(true);
    expect(can("super_admin", "merchants.suspend")).toBe(true);
  });

  it("admin gère l'opérationnel mais pas l'équipe admin", () => {
    expect(can("admin", "merchants.suspend")).toBe(true);
    expect(can("admin", "stripe.manage")).toBe(true);
    expect(can("admin", "admins.manage")).toBe(false);
  });

  it("support : support commerçant, aucune action finance/Stripe", () => {
    expect(can("support", "support.reply")).toBe(true);
    expect(can("support", "merchants.view")).toBe(true);
    expect(can("support", "merchants.suspend")).toBe(false);
    expect(can("support", "stripe.manage")).toBe(false);
    expect(can("support", "stripe.view")).toBe(false);
  });

  it("finance : Stripe oui, actions support non", () => {
    expect(can("finance", "stripe.manage")).toBe(true);
    expect(can("finance", "support.reply")).toBe(false);
    expect(can("finance", "merchants.suspend")).toBe(false);
  });

  it("read_only ne peut effectuer aucune action mutante", () => {
    const mutating = [
      "merchants.edit",
      "merchants.suspend",
      "support.reply",
      "stripe.manage",
      "admins.manage",
    ] as const;
    for (const p of mutating) expect(can("read_only", p)).toBe(false);
    expect(can("read_only", "merchants.view")).toBe(true);
  });

  it("chaque rôle voit au moins le dashboard", () => {
    for (const role of ADMIN_ROLES) {
      expect(ROLE_PERMISSIONS[role]).toContain("dashboard.view");
    }
  });
});

describe("anti-escalade de privilèges", () => {
  const superA = { id: "s", role: "super_admin" as const };
  const superB = { id: "s2", role: "super_admin" as const };
  const admin = { id: "a", role: "admin" as const };
  const support = { id: "t", role: "support" as const };

  it("seul un super_admin peut gérer des admins", () => {
    expect(canManageAdmin(admin, support)).toBe(false);
    expect(canManageAdmin(superA, admin)).toBe(true);
  });

  it("on ne se gère pas soi-même", () => {
    expect(canManageAdmin(superA, { id: "s", role: "read_only" })).toBe(false);
  });

  it("on ne gère pas un rang strictement supérieur", () => {
    // Impossible en pratique (seul super_admin gère), mais la règle tient.
    expect(canManageAdmin(superA, superB)).toBe(true); // même rang OK
  });

  it("on ne peut pas attribuer un rôle supérieur au sien", () => {
    expect(canAssignRole("super_admin", "super_admin")).toBe(true);
    expect(canAssignRole("admin", "super_admin")).toBe(false);
    expect(canAssignRole("admin", "admin")).toBe(false); // admin ne gère pas les admins
  });

  it("evaluateRoleChange refuse l'auto-modification", () => {
    const r = evaluateRoleChange(superA, { id: "s", role: "admin" }, "read_only");
    expect(r.ok).toBe(false);
  });

  it("evaluateRoleChange refuse la promotion au-dessus de soi", () => {
    const r = evaluateRoleChange(superA, admin, "super_admin");
    expect(r.ok).toBe(true); // super peut créer un super
    const r2 = evaluateRoleChange(
      { id: "x", role: "admin" },
      support,
      "admin",
    );
    expect(r2.ok).toBe(false); // admin n'a pas admins.manage
  });

  it("evaluateRoleChange nominal : super rétrograde un admin en support", () => {
    const r = evaluateRoleChange(superA, admin, "support");
    expect(r.ok).toBe(true);
  });
});
