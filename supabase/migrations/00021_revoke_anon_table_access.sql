-- ============================================================
-- LastChance — ACL anon explicites et reproductibles
-- ============================================================
-- Le parcours public passe exclusivement par des Server Actions et des RPC
-- service_role contrôlées. Le rôle anon n'a donc besoin d'aucun accès direct
-- aux tables ou séquences du schéma public.

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;

