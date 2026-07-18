/**
 * RBAC du back-office — source de vérité unique des permissions.
 *
 * Module PUR (aucun accès réseau/DB) : testable unitairement et
 * réutilisable côté serveur (garde d'accès) comme côté rendu (afficher
 * ou non un bouton). La sécurité réelle est TOUJOURS appliquée côté
 * serveur (voir src/lib/admin/auth.ts) — le masquage UI n'est qu'un
 * confort.
 */

import { ADMIN_ROLE_RANK, type AdminRole } from "@/types/admin";

/** Permissions atomiques, nommées `module.action`. */
export type Permission =
  | "dashboard.view"
  | "merchants.view"
  | "merchants.edit"
  | "merchants.comp_access"
  | "merchants.suspend"
  | "merchants.delete"
  | "support.view"
  | "support.reply"
  | "stripe.view"
  | "stripe.manage"
  | "analytics.view"
  | "audit.view"
  | "monitoring.view"
  | "settings.view"
  | "admins.manage";

/**
 * Matrice rôle → permissions. Explicite et exhaustive : ajouter une
 * permission oblige à décider, rôle par rôle, qui y a droit.
 *
 * - super_admin : tout, y compris la gestion de l'équipe admin.
 * - admin       : tout l'opérationnel, mais PAS la gestion des admins.
 * - support     : lecture + support commerçants (pas de finance/Stripe).
 * - finance     : lecture + Stripe/facturation (pas d'action support).
 * - read_only   : lecture seule, aucune action.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  super_admin: [
    "dashboard.view",
    "merchants.view",
    "merchants.edit",
    "merchants.comp_access",
    "merchants.suspend",
    "merchants.delete",
    "support.view",
    "support.reply",
    "stripe.view",
    "stripe.manage",
    "analytics.view",
    "audit.view",
    "monitoring.view",
    "settings.view",
    "admins.manage",
  ],
  admin: [
    "dashboard.view",
    "merchants.view",
    "merchants.edit",
    "merchants.suspend",
    "support.view",
    "support.reply",
    "stripe.view",
    "stripe.manage",
    "analytics.view",
    "audit.view",
    "monitoring.view",
    "settings.view",
  ],
  support: [
    "dashboard.view",
    "merchants.view",
    "support.view",
    "support.reply",
    "analytics.view",
    "monitoring.view",
  ],
  finance: [
    "dashboard.view",
    "merchants.view",
    "stripe.view",
    "stripe.manage",
    "analytics.view",
    "audit.view",
    "monitoring.view",
  ],
  read_only: [
    "dashboard.view",
    "merchants.view",
    "support.view",
    "stripe.view",
    "analytics.view",
    "audit.view",
    "monitoring.view",
  ],
};

/** L'admin actif (rôle) a-t-il la permission demandée ? */
export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Toutes les permissions du rôle (utile pour exposer au client). */
export function permissionsFor(role: AdminRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/* ────────────────────────────────────────────────────────────
 * Anti-escalade de privilèges — helpers PURS
 * Utilisés côté serveur avant toute mutation de l'équipe admin.
 * ──────────────────────────────────────────────────────────── */

export interface AdminActorRef {
  id: string;
  role: AdminRole;
}
export interface AdminTargetRef {
  id: string;
  role: AdminRole;
}

/**
 * `actor` peut-il gérer (modifier/désactiver) le compte admin `target` ?
 * Règles :
 *  - il faut la permission `admins.manage` (super_admin uniquement) ;
 *  - personne ne se gère soi-même via cet écran (évite l'auto-blocage
 *    et l'auto-rétrogradation accidentelle) ;
 *  - on ne gère pas un compte de rang strictement supérieur au sien.
 */
export function canManageAdmin(actor: AdminActorRef, target: AdminTargetRef): boolean {
  if (!can(actor.role, "admins.manage")) return false;
  if (actor.id === target.id) return false;
  return ADMIN_ROLE_RANK[actor.role] >= ADMIN_ROLE_RANK[target.role];
}

/**
 * `actor` peut-il attribuer le rôle `nextRole` ?
 * On ne peut jamais accorder un rôle strictement supérieur au sien :
 * un admin ne peut pas fabriquer un super_admin, etc.
 */
export function canAssignRole(actorRole: AdminRole, nextRole: AdminRole): boolean {
  if (!can(actorRole, "admins.manage")) return false;
  return ADMIN_ROLE_RANK[nextRole] <= ADMIN_ROLE_RANK[actorRole];
}

/**
 * Garde composite pour une modification de rôle : combine la capacité à
 * gérer la cible ET à attribuer le nouveau rôle. Renvoie une raison
 * lisible en cas de refus (pour le message d'erreur serveur).
 */
export function evaluateRoleChange(
  actor: AdminActorRef,
  target: AdminTargetRef,
  nextRole: AdminRole,
): { ok: true } | { ok: false; reason: string } {
  if (!can(actor.role, "admins.manage")) {
    return { ok: false, reason: "Rôle insuffisant pour gérer l'équipe admin." };
  }
  if (actor.id === target.id) {
    return { ok: false, reason: "Vous ne pouvez pas modifier votre propre rôle." };
  }
  if (ADMIN_ROLE_RANK[actor.role] < ADMIN_ROLE_RANK[target.role]) {
    return { ok: false, reason: "Cible de rang supérieur au vôtre." };
  }
  if (!canAssignRole(actor.role, nextRole)) {
    return { ok: false, reason: "Vous ne pouvez pas attribuer un rôle supérieur au vôtre." };
  }
  return { ok: true };
}
