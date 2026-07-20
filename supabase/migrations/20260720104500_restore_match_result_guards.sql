-- ============================================================
-- Lastchance — Restauration des garde-fous de set_contest_match_result
--
-- La réécriture « prolongations / tirs au but » (20260719153904) a
-- involontairement supprimé trois protections présentes depuis
-- 20260719040000 :
--   1. un commerçant ne peut pas écraser un match synchronisé par le
--      fournisseur (external_ref) — « managed match » ;
--   2. un premier résultat ne peut pas être saisi avant le coup
--      d'envoi — « match not started » ;
--   3. toute saisie/correction de résultat est journalisée dans
--      audit_logs (avec désormais finish_type et t.a.b.).
-- L'audit pgTAP (security_acl.test.sql, tests 86/87/94) a détecté la
-- régression. Signature 7 paramètres conservée à l'identique.
-- ============================================================

create or replace function public.set_contest_match_result(
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
      'finish_type', p_finish_type,
      'home_penalties', p_home_penalties,
      'away_penalties', p_away_penalties,
      'source', case when auth.role() = 'service_role' then 'provider' else 'merchant' end
    )
  );
  return true;
end;
$$;

revoke all on function public.set_contest_match_result(uuid,uuid,integer,integer,text,integer,integer)
  from public, anon;
grant execute on function public.set_contest_match_result(uuid,uuid,integer,integer,text,integer,integer)
  to authenticated, service_role;
