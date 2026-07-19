-- ============================================================
-- Lastchance — Prolongations et tirs au but (Pronostics)
--
-- Le score d'un match à élimination directe inclut les prolongations
-- (sémantique fournisseur : intHomeScore = score après 120'), et la
-- séance de tirs au but est stockée à part pour l'affichage. Les
-- points des pronostics se calculent sur le score final hors t.a.b.
-- ============================================================

alter table public.contest_matches
  add column if not exists finish_type text not null default 'regular'
    check (finish_type in ('regular', 'extra_time', 'penalties')),
  add column if not exists home_penalties integer
    check (home_penalties between 0 and 99),
  add column if not exists away_penalties integer
    check (away_penalties between 0 and 99);

comment on column public.contest_matches.finish_type is
  'Fin du match : regular, extra_time (après prolongation) ou penalties (tirs au but).';
comment on column public.contest_matches.home_penalties is
  'Séance de tirs au but (équipe à domicile) — null hors penalties.';
comment on column public.contest_matches.away_penalties is
  'Séance de tirs au but (équipe extérieure) — null hors penalties.';

-- Nouvelle signature : l'ancienne est supprimée (deux fonctions homonymes
-- rendraient l'appel RPC PostgREST ambigu).
drop function if exists public.set_contest_match_result(uuid, uuid, integer, integer);

create function public.set_contest_match_result(
  p_organization_id uuid,
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer,
  p_finish_type text default 'regular',
  p_home_penalties integer default null,
  p_away_penalties integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest_id uuid;
  v_scoring jsonb;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_editor(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  if p_home_score is null or p_away_score is null
    or p_home_score not between 0 and 99 or p_away_score not between 0 and 99
  then
    raise exception 'invalid score';
  end if;
  if p_finish_type not in ('regular', 'extra_time', 'penalties') then
    raise exception 'invalid finish type';
  end if;
  -- La séance de t.a.b. n'a de sens qu'avec finish_type = penalties.
  if p_finish_type <> 'penalties'
    and (p_home_penalties is not null or p_away_penalties is not null)
  then
    raise exception 'invalid penalties';
  end if;
  if p_home_penalties is not null and p_home_penalties not between 0 and 99 then
    raise exception 'invalid penalties';
  end if;
  if p_away_penalties is not null and p_away_penalties not between 0 and 99 then
    raise exception 'invalid penalties';
  end if;

  select c.id, c.scoring
    into v_contest_id, v_scoring
  from public.contests c
  join public.contest_matches m
    on m.contest_id = c.id and m.organization_id = c.organization_id
  where c.organization_id = p_organization_id and m.id = p_match_id
  for update of c, m;

  if not found then return false; end if;

  update public.contest_matches
  set home_score = p_home_score,
      away_score = p_away_score,
      finish_type = p_finish_type,
      home_penalties = p_home_penalties,
      away_penalties = p_away_penalties,
      status = 'finished'
  where id = p_match_id
    and contest_id = v_contest_id
    and organization_id = p_organization_id;

  update public.contest_predictions p
  set points = public.contest_prediction_points(
        v_scoring, p_home_score, p_away_score, p.home_score, p.away_score
      ),
      updated_at = pg_catalog.now()
  where p.match_id = p_match_id
    and p.contest_id = v_contest_id
    and p.organization_id = p_organization_id;

  return true;
end;
$$;

revoke all on function public.set_contest_match_result(uuid,uuid,integer,integer,text,integer,integer)
  from public, anon;
grant execute on function public.set_contest_match_result(uuid,uuid,integer,integer,text,integer,integer)
  to authenticated, service_role;
