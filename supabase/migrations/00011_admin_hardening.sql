-- ============================================================
-- Lastchance — Durcissement sécurité du back-office
--   1. admin_audit_logs : append-only (trigger anti-altération)
--   2. admin_users.last_login_at : horloge de session admin
--      (sessions courtes + ré-authentification pour actions sensibles)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. JOURNAL D'AUDIT IMMUABLE
-- La service role key contourne la RLS mais PAS les triggers : toute
-- tentative d'UPDATE/DELETE (même via le back-office) est refusée. Le
-- journal ne peut donc être ni réécrit ni effacé par l'application.
-- Seul un opérateur base superuser pourrait désactiver le trigger.
-- ────────────────────────────────────────────────────────────

create or replace function public.admin_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_logs est append-only : % interdit', TG_OP;
end;
$$;

create trigger admin_audit_no_update
  before update on public.admin_audit_logs
  for each row execute function public.admin_audit_immutable();

create trigger admin_audit_no_delete
  before delete on public.admin_audit_logs
  for each row execute function public.admin_audit_immutable();

-- ────────────────────────────────────────────────────────────
-- 2. HORLOGE DE SESSION ADMIN
-- Renseignée à chaque connexion réussie au back-office. Le code compare
-- (now - last_login_at) pour :
--   - expirer les sessions admin longues (durée absolue) ;
--   - exiger une connexion récente (« sudo ») avant les actions
--     sensibles (gestion d'équipe, suspension d'un commerçant).
-- ────────────────────────────────────────────────────────────

alter table public.admin_users
  add column if not exists last_login_at timestamptz;
