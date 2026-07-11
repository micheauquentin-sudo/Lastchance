-- ============================================================
-- Lastchance — Délai de grâce sur les impayés (past_due)
--
-- Un paiement en échec ne coupe plus les roues immédiatement :
-- Stripe relance la carte pendant plusieurs jours (dunning), et
-- l'accès est maintenu pendant cette fenêtre. `past_due_since`
-- date l'entrée en impayé (posée par le webhook Stripe) ; la règle
-- applicative (hasActiveAccess) accorde 14 jours de grâce à partir
-- de cette date, puis coupe — même si le webhook final de Stripe
-- (canceled/unpaid) n'arrivait jamais.
-- ============================================================

alter table public.organizations
  add column past_due_since timestamptz;

comment on column public.organizations.past_due_since is
  'Entrée en impayé (statut past_due). Null hors impayé. Borne le délai de grâce applicatif.';

-- Orgs déjà en impayé : la grâce démarre à l''application de la migration.
update public.organizations
  set past_due_since = now()
  where subscription_status = 'past_due' and past_due_since is null;
