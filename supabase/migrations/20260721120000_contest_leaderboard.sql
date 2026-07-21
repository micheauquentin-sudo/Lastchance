-- ============================================================
-- Lastchance — Classement Pronostics agrégé en base
--
-- Le classement chargeait tous les joueurs et tous les pronostics
-- notés puis agrégeait en JavaScript : correct à 50 participants,
-- intenable à plusieurs milliers. Deux RPC déplacent l'agrégation
-- (total, nombre d'exacts, nombre de pronostics notés, rang ex æquo)
-- dans PostgreSQL avec pagination :
--   · contest_leaderboard  — page de classement (service role, ou
--     propriétaire de l'organisation côté dashboard) ;
--   · contest_player_rank  — ligne d'un joueur précis (position du
--     joueur courant sous le top 50 public), service role uniquement.
-- ============================================================

-- L'agrégat par joueur ne lit que l'index, même à plusieurs milliers
-- de pronostics par championnat.
create index if not exists contest_predictions_contest_player_points_idx
  on public.contest_predictions (contest_id, player_id) include (points);

-- Lignes classées d'un championnat, triées par points décroissants.
-- Rang « competition » (1, 2, 2, 4) — identique à rankPlayers() côté
-- app, qui reste la référence des tests unitaires. total_players est
-- répété sur chaque ligne : pagination et « X sur N » sans requête
-- supplémentaire. exact_count compte les pronostics payés au palier
-- « score exact » du barème du championnat.
create or replace function public.contest_leaderboard(
  p_contest_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  player_id uuid,
  first_name text,
  avatar text,
  email text,
  total_points integer,
  exact_count integer,
  prediction_count integer,
  rank bigint,
  total_players bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_exact integer;
begin
  select c.organization_id,
         coalesce(nullif(c.scoring->>'exact', '')::integer, 3)
    into v_org, v_exact
    from public.contests c
   where c.id = p_contest_id;
  if v_org is null then
    return; -- championnat inconnu : zéro ligne, pas d'oracle d'existence
  end if;

  -- Serveur (pages publiques) ou propriétaire (dashboard) : les emails
  -- des joueurs font partie de la réponse, réservée à ces deux rôles.
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_owner(v_org)
  ) then
    raise exception 'not authorized';
  end if;

  return query
  with base as (
    select pl.id,
           pl.first_name,
           coalesce(pl.avatar, '') as avatar,
           pl.email,
           pl.created_at,
           coalesce(sum(pr.points), 0)::integer as total_points,
           (count(*) filter (where pr.points = v_exact))::integer as exact_count,
           count(pr.player_id)::integer as prediction_count
      from public.contest_players pl
      left join public.contest_predictions pr
        on pr.contest_id = pl.contest_id
       and pr.player_id = pl.id
       and pr.points is not null
     where pl.contest_id = p_contest_id
       and pl.accepted_terms = true
     group by pl.id, pl.first_name, pl.avatar, pl.email, pl.created_at
  ),
  ranked as (
    select b.*,
           rank() over (order by b.total_points desc) as rnk,
           count(*) over () as total
      from base b
  )
  select r.id, r.first_name, r.avatar, r.email, r.total_points,
         r.exact_count, r.prediction_count, r.rnk, r.total
    from ranked r
   order by r.total_points desc, r.created_at asc, r.id asc
   limit greatest(least(coalesce(p_limit, 50), 500), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.contest_leaderboard(uuid, integer, integer) from public, anon;
grant execute on function public.contest_leaderboard(uuid, integer, integer)
  to service_role, authenticated;

-- Ligne d'un joueur précis (rang calculé sur l'ensemble du championnat).
-- Sert la « position du joueur courant » quand il est hors du top
-- public. Service role uniquement : l'identité joueur vient du cookie,
-- vérifiée côté serveur.
create or replace function public.contest_player_rank(
  p_contest_id uuid,
  p_player_id uuid
)
returns table (
  player_id uuid,
  first_name text,
  avatar text,
  email text,
  total_points integer,
  exact_count integer,
  prediction_count integer,
  rank bigint,
  total_players bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return query
  select l.player_id, l.first_name, l.avatar, l.email, l.total_points,
         l.exact_count, l.prediction_count, l.rank, l.total_players
    from public.contest_leaderboard(p_contest_id, 500000, 0) l
   where l.player_id = p_player_id;
end;
$$;

revoke all on function public.contest_player_rank(uuid, uuid) from public, anon, authenticated;
grant execute on function public.contest_player_rank(uuid, uuid) to service_role;
