-- ============================================================
-- Lastchance — Durcissement sécurité
--
-- 1. rate_limits : compteur atomique à fenêtre fixe, utilisé pour
--    limiter le parcours public (spin/claim) et l'authentification
--    (login/signup) contre les bots, le spam, le drainage de stock
--    et le credential stuffing. Le compteur atomique (upsert +
--    increment) ferme aussi la course sur la limite de jeu.
-- 2. audit_logs : journal des actions sensibles (validation de gain,
--    facturation, création d'organisation) — lisible par les membres
--    de l'org, écrit uniquement via service role.
--
-- Écritures réservées au service role : aucune policy d'insertion,
-- fonctions SECURITY DEFINER dont l'exécution est révoquée à anon /
-- authenticated.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Rate limiting
-- ────────────────────────────────────────────────────────────

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

create index rate_limits_window_idx on public.rate_limits(window_start);

alter table public.rate_limits enable row level security;
-- Aucune policy : accès service role uniquement.

-- Incrément atomique d'un seau à fenêtre fixe. Retourne true tant que
-- le nombre d'événements dans la fenêtre courante reste <= p_limit.
create or replace function public.check_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w_start timestamptz;
  c integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    return true;
  end if;

  -- Début de la fenêtre fixe courante (alignée sur p_window_seconds).
  w_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, w_start, 1)
  on conflict (bucket, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into c;

  return c <= p_limit;
end;
$$;

-- Purge des seaux expirés (à appeler périodiquement, ex : cron Supabase).
create or replace function public.prune_rate_limits(p_older_than_seconds integer default 86400)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits
  where window_start < now() - make_interval(secs => p_older_than_seconds);
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from anon, authenticated;
revoke execute on function public.prune_rate_limits(integer) from anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. Journal d'audit
-- ────────────────────────────────────────────────────────────

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor text not null,               -- user id, 'stripe', 'public', 'system'
  action text not null check (char_length(action) between 1 and 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_org_idx on public.audit_logs(organization_id, created_at desc);

alter table public.audit_logs enable row level security;

-- Les membres de l'org lisent leur propre journal ; écritures service role.
create policy "audit: select membres" on public.audit_logs
  for select using (
    organization_id is not null and public.is_org_member(organization_id)
  );
