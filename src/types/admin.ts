/**
 * Types du back-office d'administration (équipe LastChance).
 * Miroir de supabase/migrations/00010_admin_backoffice.sql.
 */

export const ADMIN_ROLES = [
  "super_admin",
  "admin",
  "support",
  "finance",
  "read_only",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  support: "Support",
  finance: "Finance",
  read_only: "Lecture seule",
};

/** Ordre hiérarchique (indice haut = plus de privilèges). */
export const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
  read_only: 0,
  support: 1,
  finance: 1,
  admin: 2,
  super_admin: 3,
};

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: AdminRole;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_user_id: string | null;
  actor_email: string;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

export interface AdminNote {
  id: string;
  organization_id: string;
  admin_user_id: string | null;
  author_email: string;
  body: string;
  created_at: string;
}
