-- ============================================================
-- Lastchance — Réglages de jeu PAR CAMPAGNE
-- (à appliquer après 00003_engagement_and_trial.sql)
--
-- 1. Les actions d'engagement se configurent désormais sur chaque
--    campagne (plus au niveau de l'établissement). La config org
--    existante est recopiée sur ses campagnes, puis supprimée.
-- 2. Le commerçant choisit ce qui est demandé au gagnant AVANT
--    d'afficher le code : email et/ou téléphone, ou rien du tout
--    (le code s'affiche alors directement).
-- 3. Compte à rebours optionnel avant masquage de l'écran du code
--    (le gagnant doit le présenter au staff dans le temps imparti).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1+2+3. Nouveaux réglages sur campaigns
-- ────────────────────────────────────────────────────────────

alter table public.campaigns
  add column engagement jsonb not null default '{}'::jsonb,
  add column collect_email boolean not null default true,
  add column collect_phone boolean not null default false,
  add column code_ttl_seconds integer
    check (code_ttl_seconds is null or code_ttl_seconds between 10 and 600);

-- Reprise de la config d'engagement déjà saisie au niveau org.
update public.campaigns c
  set engagement = o.engagement
  from public.organizations o
  where o.id = c.organization_id
    and o.engagement <> '{}'::jsonb;

alter table public.organizations drop column engagement;

-- ────────────────────────────────────────────────────────────
-- Participations : email/prénom deviennent optionnels (campagnes
-- sans collecte), ajout du téléphone. Les CHECK existants passent
-- automatiquement sur NULL.
-- ────────────────────────────────────────────────────────────

alter table public.participations
  alter column email drop not null,
  alter column first_name drop not null,
  add column phone text
    check (phone is null or phone ~ '^\+?[0-9 .()\-]{6,20}$');
