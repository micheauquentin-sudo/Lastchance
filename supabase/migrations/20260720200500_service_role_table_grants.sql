-- ============================================================
-- Lastchance — Grants explicites du service_role sur le schéma public
--
-- Sur un Supabase LOCAL (CI/E2E, dev), les tables créées par les
-- migrations n'héritent pas toujours des privilèges par défaut du
-- service_role : PostgREST répondait « permission denied for table
-- qr_codes » (42501) au client admin — toutes les pages publiques
-- (/play, /pronos) étaient inutilisables en E2E, alors que la
-- production (bootstrap hébergé différent) fonctionnait.
--
-- Grants idempotents : no-op là où ils existent déjà (production),
-- réparation partout ailleurs. N'élargit en rien anon/authenticated
-- (les révocations de 00021 restent intactes).
-- ============================================================

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
