-- ============================================================
-- LastChance — images d'affiche dans Storage + audit Pronostics
-- ============================================================

-- Les images sont publiques comme les affiches imprimées, mais les écritures
-- passent exclusivement par le service role après une garde d'organisation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'poster-images',
  'poster-images',
  true,
  2097152,
  array['image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Les suppressions passent désormais par des RPC qui verrouillent la cible,
-- contrôlent l'organisation et écrivent le journal métier dans la même
-- transaction. La RLS seule ne garantissait ni l'audit ni la protection des
-- matchs alimentés automatiquement.
revoke delete on table public.contests from authenticated;
revoke delete on table public.contest_matches from authenticated;

create or replace function public.delete_contest(
  p_organization_id uuid,
  p_contest_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_status text;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  select c.slug, c.status
    into v_slug, v_status
  from public.contests c
  where c.id = p_contest_id
    and c.organization_id = p_organization_id
  for update;
  if not found then return null; end if;

  delete from public.contests c
  where c.id = p_contest_id
    and c.organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.delete',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'previous_status', v_status
    )
  );
  return v_slug;
end;
$$;

revoke all on function public.delete_contest(uuid,uuid) from public, anon;
grant execute on function public.delete_contest(uuid,uuid) to authenticated, service_role;

create or replace function public.delete_contest_match(
  p_organization_id uuid,
  p_match_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest_id uuid;
  v_status text;
  v_external_ref text;
  v_prediction_count bigint;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_editor(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;

  select m.contest_id, m.status, m.external_ref,
         (select pg_catalog.count(*) from public.contest_predictions p
          where p.match_id = m.id
            and p.contest_id = m.contest_id
            and p.organization_id = m.organization_id)
    into v_contest_id, v_status, v_external_ref, v_prediction_count
  from public.contest_matches m
  where m.id = p_match_id
    and m.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  if coalesce(auth.role(), '') <> 'service_role' and v_external_ref <> '' then
    raise exception 'managed match';
  end if;

  delete from public.contest_matches m
  where m.id = p_match_id
    and m.contest_id = v_contest_id
    and m.organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.match.delete',
    pg_catalog.jsonb_build_object(
      'contest_id', v_contest_id,
      'match_id', p_match_id,
      'previous_status', v_status,
      'predictions_deleted', v_prediction_count
    )
  );
  return true;
end;
$$;

revoke all on function public.delete_contest_match(uuid,uuid) from public, anon;
grant execute on function public.delete_contest_match(uuid,uuid) to authenticated, service_role;

-- Une correction de résultat reste possible, mais un commerçant ne peut pas
-- écraser un match synchronisé et un premier résultat ne peut pas être saisi
-- avant le coup d'envoi. Résultat et recalcul restent atomiques.
create or replace function public.set_contest_match_result(
  p_organization_id uuid,
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest_id uuid;
  v_scoring jsonb;
  v_kickoff_at timestamptz;
  v_previous_status text;
  v_previous_home integer;
  v_previous_away integer;
  v_external_ref text;
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

  select c.id, c.scoring, m.kickoff_at, m.status,
         m.home_score, m.away_score, m.external_ref
    into v_contest_id, v_scoring, v_kickoff_at, v_previous_status,
         v_previous_home, v_previous_away, v_external_ref
  from public.contests c
  join public.contest_matches m
    on m.contest_id = c.id and m.organization_id = c.organization_id
  where c.organization_id = p_organization_id and m.id = p_match_id
  for update of c, m;
  if not found then return false; end if;

  if coalesce(auth.role(), '') <> 'service_role' and v_external_ref <> '' then
    raise exception 'managed match';
  end if;
  if v_previous_status <> 'finished'
    and v_kickoff_at > pg_catalog.clock_timestamp()
  then
    raise exception 'match not started';
  end if;

  update public.contest_matches
  set home_score = p_home_score,
      away_score = p_away_score,
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

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    case when auth.role() = 'service_role'
      then 'system' else coalesce(auth.uid()::text, 'system') end,
    case when v_previous_status = 'finished'
      then 'contest.result.correct' else 'contest.result.set' end,
    pg_catalog.jsonb_build_object(
      'contest_id', v_contest_id,
      'match_id', p_match_id,
      'previous_home', v_previous_home,
      'previous_away', v_previous_away,
      'home_score', p_home_score,
      'away_score', p_away_score,
      'source', case when auth.role() = 'service_role' then 'provider' else 'merchant' end
    )
  );
  return true;
end;
$$;

revoke all on function public.set_contest_match_result(uuid,uuid,integer,integer)
  from public, anon;
grant execute on function public.set_contest_match_result(uuid,uuid,integer,integer)
  to authenticated, service_role;

-- Le nouveau barème et le recalcul des matchs finis sont journalisés dans la
-- même transaction, avec l'ancien et le nouveau document de points.
create or replace function public.update_contest_scoring(
  p_organization_id uuid,
  p_contest_id uuid,
  p_exact integer,
  p_diff integer,
  p_winner integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_scoring jsonb;
  v_scoring jsonb;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_exact is null or p_diff is null or p_winner is null
    or p_exact not between 0 and 100
    or p_diff not between 0 and 100
    or p_winner not between 0 and 100
  then
    raise exception 'invalid scoring';
  end if;

  v_scoring := pg_catalog.jsonb_build_object(
    'exact', p_exact,
    'diff', p_diff,
    'winner', p_winner
  );

  select c.scoring into v_previous_scoring
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  update public.contests
  set scoring = v_scoring
  where id = p_contest_id and organization_id = p_organization_id;

  update public.contest_predictions p
  set points = public.contest_prediction_points(
        v_scoring, m.home_score, m.away_score, p.home_score, p.away_score
      ),
      updated_at = pg_catalog.now()
  from public.contest_matches m
  where p.contest_id = p_contest_id
    and p.organization_id = p_organization_id
    and m.id = p.match_id
    and m.contest_id = p.contest_id
    and m.organization_id = p.organization_id
    and m.status = 'finished'
    and m.home_score is not null
    and m.away_score is not null;

  if v_previous_scoring is distinct from v_scoring then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (
      p_organization_id,
      coalesce(auth.uid()::text, auth.role(), 'system'),
      'contest.scoring.update',
      pg_catalog.jsonb_build_object(
        'contest_id', p_contest_id,
        'previous', v_previous_scoring,
        'next', v_scoring
      )
    );
  end if;
  return true;
end;
$$;

revoke all on function public.update_contest_scoring(uuid,uuid,integer,integer,integer)
  from public, anon;
grant execute on function public.update_contest_scoring(uuid,uuid,integer,integer,integer)
  to authenticated, service_role;
