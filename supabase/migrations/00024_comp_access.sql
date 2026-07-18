-- ============================================================
-- Lastchance — Accès offert (comp access)
--
-- Permet au back-office d'accorder un accès premium complet à un
-- commerçant SANS paiement Stripe : partenaire, compensation, période
-- d'essai prolongée à la main, etc. Indépendant de `subscription_status`
-- (jamais réécrit par un webhook Stripe) et honoré par hasActiveAccess.
--
-- `comp_access_until` borne l'offre (null = illimité) ; `comp_access_note`
-- garde le motif interne pour la traçabilité.
-- ============================================================

alter table public.organizations
  add column if not exists comp_access boolean not null default false,
  add column if not exists comp_access_until timestamptz,
  add column if not exists comp_access_note text not null default '';

comment on column public.organizations.comp_access is
  'Accès offert accordé depuis le back-office (premium sans paiement). Honoré par hasActiveAccess, indépendant de Stripe.';
comment on column public.organizations.comp_access_until is
  'Fin de l''accès offert (null = illimité).';
comment on column public.organizations.comp_access_note is
  'Motif interne de l''accès offert (partenaire, compensation…).';

-- `organizations` utilise des grants de colonnes (00017) : une colonne
-- ajoutée ensuite doit être explicitement rendue lisible par l'app
-- commerçant (getUserAndOrg) — le back-office lit via service role.
grant select (comp_access, comp_access_until, comp_access_note)
  on public.organizations to authenticated;
