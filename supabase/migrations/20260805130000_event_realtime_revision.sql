-- Event Realtime invalidation contract:
-- - one monotonic revision for observable state-machine mutations;
-- - no revision bump for answers, joins, scores or merchant metadata;
-- - public state remains available only through the service-role RPC.

alter table public.event_sessions
  add column state_revision bigint not null default 0,
  add constraint event_sessions_state_revision_nonnegative
    check (state_revision >= 0);

comment on column public.event_sessions.state_revision is
  'Monotonic invalidation revision; managed by event state transitions only.';

create or replace function public.bump_event_state_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    old.status,
    old.phase,
    old.current_question_id,
    old.current_question_started_at,
    old.prono_correct_option_id
  ) is distinct from (
    new.status,
    new.phase,
    new.current_question_id,
    new.current_question_started_at,
    new.prono_correct_option_id
  ) then
    new.state_revision := old.state_revision + 1;
  else
    -- Prevent direct writes from manufacturing a revision.
    new.state_revision := old.state_revision;
  end if;
  return new;
end;
$$;

revoke all on function public.bump_event_state_revision()
  from public, anon, authenticated;

create trigger event_sessions_state_revision
  before update on public.event_sessions
  for each row execute function public.bump_event_state_revision();

-- Supports both the public top-50 ordering and per-player rank lookup.
create index event_players_session_score_rank_idx
  on public.event_players (session_id, score desc, joined_at asc, id asc);

create or replace function public.event_public_state(
  p_session_id uuid,
  p_player_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_qid uuid;
  v_qtype text;
  v_reveal boolean;
  v_distribution_visible boolean;
  v_question jsonb := null;
  v_correct_option uuid := null;
  v_distribution jsonb := null;
  v_leaderboard jsonb;
  v_your jsonb := null;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select s.* into v_session
    from public.event_sessions s
   where s.id = p_session_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_qid := v_session.current_question_id;
  v_reveal := (v_session.phase = 'reveal');
  v_distribution_visible :=
    (v_session.phase in ('question_locked', 'reveal', 'leaderboard'));

  if v_qid is not null
     and v_session.phase in (
       'question_active',
       'question_locked',
       'reveal',
       'leaderboard'
     ) then
    select q.question_type
      into v_qtype
      from public.event_questions q
     where q.id = v_qid;

    select pg_catalog.jsonb_build_object(
             'id', q.id,
             'question_type', q.question_type,
             'prompt', q.prompt,
             'time_limit_seconds', q.time_limit_seconds,
             'started_at', v_session.current_question_started_at,
             'options', coalesce((
               select pg_catalog.jsonb_agg(
                        pg_catalog.jsonb_build_object(
                          'id', o.id,
                          'label', o.label,
                          'position', o.position
                        )
                        order by o.position
                      )
                 from public.event_question_options o
                where o.question_id = q.id
             ), '[]'::jsonb)
           )
      into v_question
      from public.event_questions q
     where q.id = v_qid;

    if v_reveal then
      if v_qtype = 'quiz' then
        select o.id
          into v_correct_option
          from public.event_question_options o
         where o.question_id = v_qid
           and o.is_correct
         order by o.position
         limit 1;
      elsif v_qtype = 'prono' then
        v_correct_option := v_session.prono_correct_option_id;
      end if;
    end if;

    if v_distribution_visible then
      select coalesce(
               pg_catalog.jsonb_agg(
                 pg_catalog.jsonb_build_object(
                   'option_id', o.id,
                   'label', o.label,
                   'position', o.position,
                   'votes', coalesce(c.votes, 0)
                 )
                 order by o.position
               ),
               '[]'::jsonb
             )
        into v_distribution
        from public.event_question_options o
        left join (
          select a.option_id, pg_catalog.count(*) as votes
            from public.event_answers a
           where a.session_id = p_session_id
             and a.question_id = v_qid
           group by a.option_id
        ) c on c.option_id = o.id
       where o.question_id = v_qid;
    end if;
  end if;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'pseudo', t.pseudo,
               'avatar', t.avatar,
               'score', t.score,
               'rank', t.rank
             )
             order by t.rank
           ),
           '[]'::jsonb
         )
    into v_leaderboard
    from (
      select
        p.pseudo,
        p.avatar,
        p.score,
        pg_catalog.row_number() over (
          order by p.score desc, p.joined_at asc, p.id asc
        ) as rank
        from public.event_players p
       where p.session_id = p_session_id
       order by p.score desc, p.joined_at asc, p.id asc
       limit 50
    ) t;

  if p_player_token_hash is not null
     and p_player_token_hash ~ '^[0-9a-f]{64}$' then
    select pg_catalog.jsonb_build_object(
             'pseudo', mp.pseudo,
             'avatar', mp.avatar,
             'score', mp.score,
             'rank', 1 + (
               select pg_catalog.count(*)
                 from public.event_players x
                where x.session_id = p_session_id
                  and (
                    x.score > mp.score
                    or (
                      x.score = mp.score
                      and x.joined_at < mp.joined_at
                    )
                    or (
                      x.score = mp.score
                      and x.joined_at = mp.joined_at
                      and x.id < mp.id
                    )
                  )
             ),
             'win', (
               select pg_catalog.jsonb_build_object(
                        'rank', w.rank,
                        'code', w.code
                      )
                 from public.event_wins w
                where w.session_id = p_session_id
                  and w.winner_token_hash = p_player_token_hash
                limit 1
             )
           )
      into v_your
      from public.event_players mp
     where mp.session_id = p_session_id
       and mp.token_hash = p_player_token_hash;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'session', pg_catalog.jsonb_build_object(
      'id', v_session.id,
      'state_revision', v_session.state_revision,
      'status', v_session.status,
      'phase', v_session.phase,
      'join_code', v_session.join_code,
      'reward_label', v_session.reward_label,
      'reward_stock', v_session.reward_stock,
      'reward_claimed_count', v_session.reward_claimed_count
    ),
    'question', v_question,
    'correct_option_id', v_correct_option,
    'distribution', v_distribution,
    'leaderboard', v_leaderboard,
    'you', v_your
  );
end;
$$;

revoke all on function public.event_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.event_public_state(uuid, text) to service_role;
