-- ============================================================
-- Lastchance — Rétention RGPD & webhooks sortants
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- RÉTENTION DES DONNÉES (RGPD — minimisation)
-- Purge automatique des participations (données personnelles) et des
-- abonnés désinscrits, au-delà d'une durée de conservation choisie par
-- le commerçant. Null = pas de purge automatique (comportement actuel,
-- inchangé par défaut).
-- ────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists data_retention_months smallint
    check (data_retention_months is null or data_retention_months between 1 and 60);

comment on column public.organizations.data_retention_months is
  'Durée de conservation (mois) des participations et abonnés désinscrits. Null = conservation illimitée.';

-- ────────────────────────────────────────────────────────────
-- WEBHOOKS SORTANTS
-- Un commerçant peut brancher son propre outil (caisse, CRM, Zapier…)
-- sur les événements Lastchance. webhook_secret signe chaque livraison
-- (HMAC SHA-256, header X-Lastchance-Signature) — généré à la création
-- de l'organisation, jamais transmis en clair ailleurs que côté
-- Réglages du propriétaire.
-- ────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists webhook_url text
    check (webhook_url is null or webhook_url ~ '^https://'),
  add column if not exists webhook_secret text not null
    default encode(gen_random_bytes(24), 'hex');
