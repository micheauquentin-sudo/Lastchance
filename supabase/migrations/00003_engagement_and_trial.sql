-- ============================================================
-- Lastchance — Actions d'engagement pré-jeu + essai 7 jours
--
-- 1. organizations.trial_ends_at : fin d'essai applicative (7 jours
--    après l'inscription). Après cette date, sans abonnement actif,
--    les roues publiques sont désactivées et les campagnes ne
--    peuvent plus être activées (les QR codes restent créables).
-- 2. organizations.engagement : configuration des actions proposées
--    au client AVANT de jouer (newsletter, Instagram, TikTok, avis
--    Google), activables et configurables par le commerçant.
-- 3. newsletter_subscribers : emails collectés via l'action
--    "newsletter" (consentement explicite du joueur).
-- 4. spins.engagement_action : action choisie par le joueur (traçabilité).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Essai applicatif de 7 jours (idempotent)
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'trial_ends_at'
  ) then
    alter table public.organizations
      add column trial_ends_at timestamptz;
  end if;
end $$;

-- Orgs existantes : 7 jours à partir de leur création.
update public.organizations
  set trial_ends_at = created_at + interval '7 days'
  where trial_ends_at is null;

-- Ensure not null + default if column was just created
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_trial_ends_at_not_null'
  ) then
    alter table public.organizations
      alter column trial_ends_at set not null,
      alter column trial_ends_at set default (now() + interval '7 days');
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- 2. Configuration des actions d'engagement (par établissement)
--    Forme : { "newsletter": {"enabled": true},
--              "instagram": {"enabled": true, "url": "https://…"},
--              "tiktok": {"enabled": false, "url": ""},
--              "google_review": {"enabled": true, "url": "https://…"} }
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'engagement'
  ) then
    alter table public.organizations
      add column engagement jsonb not null default '{}'::jsonb;
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- 3. Abonnés newsletter (insertion via service role uniquement,
--    lecture/suppression par les membres de l'org)
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'newsletter_subscribers'
  ) then
    create table public.newsletter_subscribers (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
      source text not null default 'wheel',
      created_at timestamptz not null default now(),
      unique (organization_id, email)
    );

    create index newsletter_subscribers_org_idx
      on public.newsletter_subscribers(organization_id);

    alter table public.newsletter_subscribers enable row level security;

    create policy "newsletter: select membres" on public.newsletter_subscribers
      for select using (public.is_org_member(organization_id));
    create policy "newsletter: delete membres" on public.newsletter_subscribers
      for delete using (public.is_org_member(organization_id));
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- 4. Traçabilité de l'action choisie sur chaque spin
-- ────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'spins' and column_name = 'engagement_action'
  ) then
    alter table public.spins
      add column engagement_action text
        check (engagement_action is null
               or engagement_action in ('newsletter','instagram','tiktok','google_review'));
  end if;
end $$;
