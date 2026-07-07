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
-- 1+2+3. Nouveaux réglages sur campaigns (idempotent)
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'engagement'
  ) then
    alter table public.campaigns
      add column engagement jsonb not null default '{}'::jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'collect_email'
  ) then
    alter table public.campaigns
      add column collect_email boolean not null default true;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'collect_phone'
  ) then
    alter table public.campaigns
      add column collect_phone boolean not null default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'code_ttl_seconds'
  ) then
    alter table public.campaigns
      add column code_ttl_seconds integer
        check (code_ttl_seconds is null or code_ttl_seconds between 10 and 600);
  end if;
end $$;

-- Reprise de la config d'engagement déjà saisie au niveau org.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'engagement'
  ) then
    update public.campaigns c
      set engagement = o.engagement
      from public.organizations o
      where o.id = c.organization_id
        and o.engagement <> '{}'::jsonb;
  end if;
end $$;

-- Drop org engagement column if it still exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'engagement'
  ) then
    alter table public.organizations drop column engagement;
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- Participations : email/prénom deviennent optionnels (campagnes
-- sans collecte), ajout du téléphone. Les CHECK existants passent
-- automatiquement sur NULL.
-- ────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select constraint_name from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'participations' and column_name = 'email'
    and constraint_name like '%not_null%'
  ) then
    alter table public.participations
      alter column email drop not null;
  end if;

  if exists (
    select constraint_name from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'participations' and column_name = 'first_name'
    and constraint_name like '%not_null%'
  ) then
    alter table public.participations
      alter column first_name drop not null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'participations' and column_name = 'phone'
  ) then
    alter table public.participations
      add column phone text
        check (phone is null or phone ~ '^\+?[0-9 .()\-]{6,20}$');
  end if;
end $$;
