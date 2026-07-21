-- ============================================================
-- Lastchance — Correctif : NULLIF n'est pas une fonction
--
-- 20260721150000 qualifiait `pg_catalog.nullif(...)` : NULLIF est une
-- construction du parseur SQL (comme COALESCE), pas une fonction du
-- catalogue — la définition passe (corps non évalué au CREATE) mais
-- l'exécution échoue : « function pg_catalog.nullif(text, unknown)
-- does not exist ». Classement et clôture étaient donc inutilisables.
-- Recrée à l'identique les trois fonctions touchées avec `nullif` nu
-- (sans danger sous search_path = '' : résolu par le parseur).
-- ============================================================

create or replace function public.update_contest_tiebreaker(
  p_organization_id uuid,
  p_contest_id uuid,
  p_question text,
  p_answer integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev_question text;
  v_prev_answer integer;
  v_finalized timestamptz;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_question is not null and pg_catalog.char_length(pg_catalog.btrim(p_question)) not between 1 and 160 then
    raise exception 'invalid question';
  end if;
  if p_answer is not null and p_answer not between 0 and 1000000 then
    raise exception 'invalid answer';
  end if;

  select c.tiebreaker_question, c.tiebreaker_answer, c.finalized_at
    into v_prev_question, v_prev_answer, v_finalized
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  -- La QUESTION est figée dès le verrou (les joueurs y ont répondu) ;
  -- la RÉPONSE officielle, elle, arrive naturellement en fin de saison.
  if public.contest_is_locked(p_contest_id)
     and pg_catalog.btrim(coalesce(p_question, '')) is distinct from pg_catalog.btrim(coalesce(v_prev_question, ''))
  then
    raise exception 'locked: question frozen';
  end if;

  update public.contests
  set tiebreaker_question = nullif(pg_catalog.btrim(coalesce(p_question, '')), ''),
      tiebreaker_answer = p_answer
  where id = p_contest_id and organization_id = p_organization_id;

  if (v_prev_question, v_prev_answer) is distinct from (p_question, p_answer) then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (
      p_organization_id,
      coalesce(auth.uid()::text, auth.role(), 'system'),
      'contest.tiebreaker.update',
      pg_catalog.jsonb_build_object(
        'contest_id', p_contest_id,
        'previous', pg_catalog.jsonb_build_object('question', v_prev_question, 'answer', v_prev_answer),
        'next', pg_catalog.jsonb_build_object('question', p_question, 'answer', p_answer)
      )
    );
  end if;
  return true;
end;
$$;

create or replace function public.finalize_contest(
  p_organization_id uuid,
  p_contest_id uuid,
  p_tiebreaker_answer integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_finalized timestamptz;
  v_rewards jsonb;
  v_scoring jsonb;
  v_answer integer;
  v_pending integer;
  v_players integer := 0;
  v_awards integer := 0;
  v_draws integer := 0;
  v_exact integer;
  v_diff integer;
  r record;
  v_label text;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_try integer;
begin
  -- Clôture : décision du propriétaire (ou du serveur), pas des éditeurs.
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_owner(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;

  select c.status, c.finalized_at, c.rewards, c.scoring,
         coalesce(p_tiebreaker_answer, c.tiebreaker_answer)
    into v_status, v_finalized, v_rewards, v_scoring, v_answer
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'contest not found';
  end if;
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  if v_status = 'draft' then
    raise exception 'contest not started';
  end if;

  -- Tous les matchs doivent être joués (ou supprimés avec motif) :
  -- clôturer avec des matchs en attente fausserait le classement.
  select count(*)::integer into v_pending
  from public.contest_matches m
  where m.contest_id = p_contest_id and m.status <> 'finished';
  if v_pending > 0 then
    raise exception 'matches pending';
  end if;

  v_exact := coalesce(nullif(v_scoring->>'exact', '')::integer, 3);
  v_diff  := coalesce(nullif(v_scoring->>'diff', '')::integer, 2);

  if p_tiebreaker_answer is not null then
    update public.contests set tiebreaker_answer = p_tiebreaker_answer
    where id = p_contest_id;
  end if;

  -- Classement final : politique d'ex æquo complète, puis tirage
  -- déterministe et auditable (md5(contest,joueur) — pré-engagé, aucun
  -- acteur ne peut l'influencer) pour garantir UN joueur par rang.
  for r in
    with base as (
      select pl.id as player_id,
             pl.created_at,
             coalesce(sum(pr.points), 0)::integer as total_points,
             (count(*) filter (where pr.points = v_exact))::integer as exact_count,
             (count(*) filter (where pr.points = v_diff))::integer as diff_count,
             case
               when v_answer is null or pl.tiebreaker_guess is null then null
               else pg_catalog.abs(pl.tiebreaker_guess - v_answer)
             end as tiebreaker_delta
        from public.contest_players pl
        left join public.contest_predictions pr
          on pr.contest_id = pl.contest_id
         and pr.player_id = pl.id
         and pr.points is not null
       where pl.contest_id = p_contest_id
         and pl.accepted_terms = true
       group by pl.id, pl.created_at, pl.tiebreaker_guess
    ),
    ordered as (
      select b.*,
             row_number() over (
               order by b.total_points desc,
                        b.exact_count desc,
                        b.diff_count desc,
                        b.tiebreaker_delta asc nulls last,
                        pg_catalog.md5(p_contest_id::text || b.player_id::text) asc
             ) as final_rank,
             (count(*) over (
               partition by b.total_points, b.exact_count, b.diff_count, b.tiebreaker_delta
             )) > 1 as draw_applied
        from base b
    )
    select * from ordered order by final_rank
  loop
    v_players := v_players + 1;
    if r.draw_applied then
      v_draws := v_draws + 1;
    end if;

    insert into public.contest_final_standings
      (contest_id, organization_id, player_id, rank, total_points,
       exact_count, diff_count, tiebreaker_delta, draw_applied)
    values
      (p_contest_id, p_organization_id, r.player_id, r.final_rank,
       r.total_points, r.exact_count, r.diff_count, r.tiebreaker_delta,
       r.draw_applied);

    -- Récompense du rang (première tranche couvrante) — un seul joueur
    -- par rang, donc un seul lot par rang prévu au règlement.
    select x->>'label' into v_label
    from pg_catalog.jsonb_array_elements(v_rewards) x
    where (x->>'from')::integer <= r.final_rank
      and (x->>'to')::integer >= r.final_rank
    limit 1;

    if v_label is not null then
      v_code := 'PRONO-';
      for v_try in 1..8 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet,
          1 + (pg_catalog.get_byte(extensions.gen_random_bytes(1), 0) % 32),
          1
        );
      end loop;
      insert into public.contest_awards
        (contest_id, organization_id, player_id, rank, reward_label, code)
      values
        (p_contest_id, p_organization_id, r.player_id, r.final_rank, v_label, v_code);
      v_awards := v_awards + 1;
    end if;
  end loop;

  update public.contests
  set status = 'finished', finalized_at = pg_catalog.now()
  where id = p_contest_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.finalize',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'players', v_players,
      'awards', v_awards,
      'draws', v_draws,
      'tiebreaker_answer', v_answer
    )
  );

  return pg_catalog.jsonb_build_object(
    'players', v_players,
    'awards', v_awards,
    'draws', v_draws
  );
end;
$$;

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
  diff_count integer,
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
  v_diff integer;
  v_answer integer;
  v_finalized timestamptz;
begin
  select c.organization_id,
         coalesce(nullif(c.scoring->>'exact', '')::integer, 3),
         coalesce(nullif(c.scoring->>'diff', '')::integer, 2),
         c.tiebreaker_answer,
         c.finalized_at
    into v_org, v_exact, v_diff, v_answer, v_finalized
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

  -- Championnat clôturé : le palmarès photographié fait foi (rangs
  -- uniques, tirage compris) — plus aucun recalcul.
  if v_finalized is not null then
    return query
    select s.player_id, pl.first_name, coalesce(pl.avatar, '') as avatar,
           pl.email, s.total_points, s.exact_count, s.diff_count,
           (select count(pr.player_id)::integer
              from public.contest_predictions pr
             where pr.contest_id = p_contest_id
               and pr.player_id = s.player_id
               and pr.points is not null) as prediction_count,
           s.rank::bigint,
           (count(*) over ())::bigint as total_players
      from public.contest_final_standings s
      join public.contest_players pl on pl.id = s.player_id
     where s.contest_id = p_contest_id
     order by s.rank asc
     limit greatest(least(coalesce(p_limit, 50), 500), 0)
    offset greatest(coalesce(p_offset, 0), 0);
    return;
  end if;

  return query
  with base as (
    select pl.id,
           pl.first_name,
           coalesce(pl.avatar, '') as avatar,
           pl.email,
           pl.created_at,
           case
             when v_answer is null or pl.tiebreaker_guess is null then null
             else pg_catalog.abs(pl.tiebreaker_guess - v_answer)
           end as tiebreaker_delta,
           coalesce(sum(pr.points), 0)::integer as total_points,
           (count(*) filter (where pr.points = v_exact))::integer as exact_count,
           (count(*) filter (where pr.points = v_diff))::integer as diff_count,
           count(pr.player_id)::integer as prediction_count
      from public.contest_players pl
      left join public.contest_predictions pr
        on pr.contest_id = pl.contest_id
       and pr.player_id = pl.id
       and pr.points is not null
     where pl.contest_id = p_contest_id
       and pl.accepted_terms = true
     group by pl.id, pl.first_name, pl.avatar, pl.email, pl.created_at,
              pl.tiebreaker_guess
  ),
  ranked as (
    select b.*,
           rank() over (
             order by b.total_points desc,
                      b.exact_count desc,
                      b.diff_count desc,
                      b.tiebreaker_delta asc nulls last
           ) as rnk,
           count(*) over () as total
      from base b
  )
  select r.id, r.first_name, r.avatar, r.email, r.total_points,
         r.exact_count, r.diff_count, r.prediction_count, r.rnk, r.total
    from ranked r
   order by r.rnk asc, r.created_at asc, r.id asc
   limit greatest(least(coalesce(p_limit, 50), 500), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
