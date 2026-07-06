-- ============================================================
-- Lastchance — Schéma initial multi-tenant
-- Toutes les tables métier portent organization_id + RLS.
-- ============================================================

-- Extension pour gen_random_uuid (incluse par défaut sur Supabase)
create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────
-- TENANTS
-- ────────────────────────────────────────────────────────────

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,48}$'),
  stripe_customer_id text unique,
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled','inactive')),
  plan text not null default 'starter',
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','staff')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members(user_id);

-- ────────────────────────────────────────────────────────────
-- MÉTIER
-- ────────────────────────────────────────────────────────────

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft','active','paused','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index campaigns_org_idx on public.campaigns(organization_id);

create table public.wheels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  name text not null default 'Ma roue' check (char_length(name) between 1 and 120),
  theme jsonb not null default '{}'::jsonb,
  play_limit text not null default 'weekly'
    check (play_limit in ('once','daily','weekly','unlimited')),
  created_at timestamptz not null default now()
);

create index wheels_org_idx on public.wheels(organization_id);

create table public.prizes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wheel_id uuid not null references public.wheels(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  color text not null default '#7c3aed' check (color ~ '^#[0-9a-fA-F]{6}$'),
  weight integer not null default 1 check (weight >= 0 and weight <= 10000),
  is_losing boolean not null default false,
  stock integer check (stock is null or stock >= 0),
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index prizes_wheel_idx on public.prizes(wheel_id);
create index prizes_org_idx on public.prizes(organization_id);

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  slug text not null unique check (slug ~ '^[A-Za-z0-9-]{4,64}$'),
  label text not null default '' check (char_length(label) <= 120),
  scan_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index qr_codes_org_idx on public.qr_codes(organization_id);
create index qr_codes_campaign_idx on public.qr_codes(campaign_id);

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  wheel_id uuid not null references public.wheels(id) on delete cascade,
  prize_id uuid references public.prizes(id) on delete set null,
  first_name text not null check (char_length(first_name) between 1 and 80),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  accepted_terms boolean not null,
  marketing_opt_in boolean not null default false,
  redeem_code text unique,
  redeemed_at timestamptz,
  player_key text not null,          -- hash SHA-256(IP+UA+sel) : pas de PII brute
  created_at timestamptz not null default now(),
  check (accepted_terms = true)      -- RGPD : pas d'enregistrement sans consentement
);

create index participations_org_idx on public.participations(organization_id);
create index participations_campaign_idx on public.participations(campaign_id);
create index participations_player_idx on public.participations(wheel_id, player_key, created_at);

-- Idempotence des webhooks Stripe
create table public.stripe_events (
  id text primary key,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

-- Helper : l'utilisateur courant est-il membre de l'org ?
-- SECURITY DEFINER pour éviter la récursion RLS sur organization_members.
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org_id and m.user_id = (select auth.uid())
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.wheels enable row level security;
alter table public.prizes enable row level security;
alter table public.qr_codes enable row level security;
alter table public.participations enable row level security;
alter table public.stripe_events enable row level security;

-- organizations : lecture/màj par les membres. L'insertion passe par
-- une fonction dédiée (create_organization) — pas de policy insert.
create policy "org: select membres" on public.organizations
  for select using (public.is_org_member(id));
create policy "org: update membres" on public.organizations
  for update using (public.is_org_member(id));

-- organization_members : chacun voit ses propres appartenances,
-- et les membres voient les autres membres de leur org.
create policy "members: select self" on public.organization_members
  for select using (user_id = (select auth.uid()) or public.is_org_member(organization_id));

-- Tables métier : accès complet aux membres de l'org.
create policy "campaigns: all membres" on public.campaigns
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "wheels: all membres" on public.wheels
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "prizes: all membres" on public.prizes
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "qr_codes: all membres" on public.qr_codes
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- participations : les membres lisent et valident (update redeemed_at) ;
-- l'insertion vient du parcours public via service role uniquement.
create policy "participations: select membres" on public.participations
  for select using (public.is_org_member(organization_id));
create policy "participations: update membres" on public.participations
  for update using (public.is_org_member(organization_id));
create policy "participations: delete membres" on public.participations
  for delete using (public.is_org_member(organization_id));

-- stripe_events : aucun accès client (service role uniquement).

-- ────────────────────────────────────────────────────────────
-- ONBOARDING : création d'organisation
-- ────────────────────────────────────────────────────────────

-- Crée l'org + le membership owner en une transaction, appelable
-- par un utilisateur authentifié (RPC). Un même user peut être
-- membre de plusieurs orgs plus tard ; en V1 l'UI n'en crée qu'une.
create or replace function public.create_organization(org_name text, org_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'authentification requise';
  end if;
  if org_name is null or char_length(trim(org_name)) < 1 then
    raise exception 'nom d''organisation invalide';
  end if;
  if org_slug is null or org_slug !~ '^[a-z0-9-]{2,48}$' then
    raise exception 'slug d''organisation invalide';
  end if;

  insert into public.organizations (name, slug)
  values (trim(org_name), org_slug)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, uid, 'owner');

  return new_org_id;
end;
$$;

-- Décrément de stock atomique (utilisé par le spin serveur).
-- Retourne true si le stock a pu être réservé (ou est illimité).
create or replace function public.decrement_prize_stock(p_prize_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.prizes
  set stock = stock - 1
  where id = p_prize_id and stock is not null and stock > 0;
  get diagnostics updated = row_count;

  if updated > 0 then
    return true;
  end if;

  -- stock null = illimité
  return exists (
    select 1 from public.prizes where id = p_prize_id and stock is null
  );
end;
$$;

-- Incrément du compteur de scans QR (parcours public, service role).
create or replace function public.increment_qr_scan(p_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.qr_codes set scan_count = scan_count + 1 where slug = p_slug;
$$;

-- Verrouille l'exécution des fonctions sensibles aux seuls rôles prévus
revoke execute on function public.create_organization(text, text) from anon;
revoke execute on function public.decrement_prize_stock(uuid) from anon, authenticated;
revoke execute on function public.increment_qr_scan(text) from anon, authenticated;
