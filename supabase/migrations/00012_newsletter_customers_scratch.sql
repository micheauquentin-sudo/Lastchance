-- ============================================================
-- Lastchance — Fermeture de la boucle fidélisation
--   1. newsletter_subscribers : désinscription + historique d'envois
--   2. Profil client agrégé (visites/gains par email)
--   3. wheels.game_type : deuxième mécanique de jeu (carte à gratter)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. NEWSLETTER — désinscription + campagnes envoyées
-- ────────────────────────────────────────────────────────────

alter table public.newsletter_subscribers
  add column if not exists unsubscribed_at timestamptz;

create table public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 150),
  body text not null check (char_length(body) between 1 and 5000),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default now()
);

create index newsletter_campaigns_org_idx
  on public.newsletter_campaigns(organization_id, created_at desc);

alter table public.newsletter_campaigns enable row level security;

create policy "newsletter_campaigns: select membres" on public.newsletter_campaigns
  for select using (public.is_org_member(organization_id));
create policy "newsletter_campaigns: insert membres" on public.newsletter_campaigns
  for insert with check (public.is_org_member(organization_id));

-- ────────────────────────────────────────────────────────────
-- 2. PROFIL CLIENT — agrégat des participations (gains) par email
-- Une participation n'existe que pour un lot gagnant (voir claimPrize) :
-- ce profil reflète donc les joueurs identifiés lors d'un gain, pas
-- l'ensemble des tentatives (les tours perdants restent pseudonymisés,
-- par conception RGPD — aucune donnée personnelle n'y est associée).
-- SECURITY DEFINER + vérification interne d'appartenance : appelable
-- par un membre authentifié, jamais par anon.
-- ────────────────────────────────────────────────────────────

create or replace function public.org_customer_profiles(p_organization_id uuid)
returns table (
  email text,
  first_name text,
  wins bigint,
  redeemed bigint,
  first_win timestamptz,
  last_win timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not authorized';
  end if;

  return query
  select
    p.email,
    (array_agg(p.first_name order by p.created_at desc))[1] as first_name,
    count(*) as wins,
    count(*) filter (where p.redeemed_at is not null) as redeemed,
    min(p.created_at) as first_win,
    max(p.created_at) as last_win
  from public.participations p
  where p.organization_id = p_organization_id
    and p.email is not null
  group by p.email
  order by max(p.created_at) desc;
end;
$$;

revoke all on function public.org_customer_profiles(uuid) from public, anon;
grant execute on function public.org_customer_profiles(uuid) to authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. DEUXIÈME MÉCANIQUE DE JEU — carte à gratter
-- Le tirage, les lots (poids/stock/perdant) et le flux de gain sont
-- déjà entièrement découplés du rendu visuel (voir actions/play.ts) :
-- une seule colonne suffit à basculer la présentation.
-- ────────────────────────────────────────────────────────────

alter table public.wheels
  add column if not exists game_type text not null default 'wheel'
    check (game_type in ('wheel', 'scratch'));
