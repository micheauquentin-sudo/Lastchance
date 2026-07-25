-- ============================================================
-- LastChance — sécurité, équité et capacité commerciale
-- ============================================================
-- Migration progressive :
--   * alias central pseudonyme + modération Event tenant-scopée ;
--   * capacité Event figée à la création et join atomique ;
--   * détection de temps serveur physiquement impossibles ;
--   * minimisation de la date de naissance au mois/jour ;
--   * fondation de plafonds économiques, inactive par défaut.

-- ============================================================
-- 1. Alias joueur central : formatage, modération et stockage privé
-- ============================================================

create or replace function public.format_player_alias(p_alias text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_alias, '')),
    '[[:space:]]+',
    ' ',
    'g'
  )
$$;

create or replace function public.normalize_player_alias(p_alias text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.translate(
      public.format_player_alias(p_alias),
      'àáâäãåçèéêëìíîïñòóôöõùúûüýÿœæ',
      'aaaaaaceeeeiiiinooooouuuuyyoea'
    )
  )
$$;

create or replace function public.player_alias_is_allowed(p_alias text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_display text := public.format_player_alias(p_alias);
  v_normalized text := public.normalize_player_alias(p_alias);
  v_compact text;
  v_word text;
  v_codepoint integer;
  v_blocked constant text[] := array[
    'con', 'connard', 'connasse', 'encule', 'enculee', 'enculer',
    'fdp', 'hitler', 'merde', 'nazi', 'nique', 'putain', 'pute',
    'salope', 'suicide'
  ];
begin
  if pg_catalog.char_length(v_display) not between 1 and 24 then
    return false;
  end if;
  if v_display ~ '[[:cntrl:]]' then
    return false;
  end if;

  -- Caractères de formatage invisibles/bidi fréquemment utilisés pour usurper
  -- visuellement un pseudo. React échappe le HTML, mais ne corrige pas le bidi.
  foreach v_codepoint in array array[
    8203, 8204, 8205, 8206, 8207,
    8234, 8235, 8236, 8237, 8238,
    8294, 8295, 8296, 8297, 65279
  ] loop
    if pg_catalog.strpos(v_display, pg_catalog.chr(v_codepoint)) > 0 then
      return false;
    end if;
  end loop;

  v_normalized := pg_catalog.regexp_replace(
    v_normalized, '[^a-z0-9]+', ' ', 'g'
  );
  v_normalized := pg_catalog.btrim(v_normalized);
  v_compact := pg_catalog.replace(v_normalized, ' ', '');

  foreach v_word in array v_blocked loop
    if v_normalized = v_word
       or v_normalized like v_word || ' %'
       or v_normalized like '% ' || v_word
       or v_normalized like '% ' || v_word || ' %'
       or v_compact = v_word then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.format_player_alias(text)
  from public, anon, authenticated;
revoke all on function public.normalize_player_alias(text)
  from public, anon, authenticated;
revoke all on function public.player_alias_is_allowed(text)
  from public, anon, authenticated;
grant execute on function public.format_player_alias(text) to service_role;
grant execute on function public.normalize_player_alias(text) to service_role;
grant execute on function public.player_alias_is_allowed(text) to service_role;

create table public.player_aliases (
  id uuid primary key default gen_random_uuid(),
  experience_membership_id uuid not null unique,
  player_id uuid not null,
  organization_id uuid not null,
  experience_kind text not null,
  experience_id uuid not null,
  display_alias text not null
    check (pg_catalog.char_length(display_alias) between 1 and 24),
  normalized_alias text not null
    check (pg_catalog.char_length(normalized_alias) between 1 and 80),
  moderation_state text not null default 'active'
    check (moderation_state in ('active', 'hidden', 'banned')),
  moderated_at timestamptz,
  moderation_reason text
    check (
      moderation_reason is null
      or pg_catalog.char_length(moderation_reason) between 1 and 300
    ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (
    experience_membership_id,
    player_id,
    organization_id,
    experience_kind,
    experience_id
  ) references public.player_experience_memberships (
    id,
    player_id,
    organization_id,
    experience_kind,
    experience_id
  ) on delete cascade
);

comment on table public.player_aliases is
  'Alias pseudonymes centraux, privés et liés par FK composite à une adhésion d''expérience du même tenant. Aucun commerçant ne peut les corréler entre expériences.';

create index player_aliases_scope_idx
  on public.player_aliases (
    organization_id, experience_kind, experience_id, normalized_alias
  );

alter table public.player_aliases enable row level security;
revoke all on table public.player_aliases
  from public, anon, authenticated, service_role;
grant select on table public.player_aliases to service_role;

create or replace function public.upsert_player_alias(
  p_experience_membership_id uuid,
  p_alias text
)
returns table (
  alias_id uuid,
  display_alias text,
  moderation_state text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.player_experience_memberships%rowtype;
  v_display text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  v_display := public.format_player_alias(p_alias);
  if not public.player_alias_is_allowed(v_display) then
    raise exception 'invalid player alias' using errcode = '22023';
  end if;

  select e.* into v_membership
    from public.player_experience_memberships e
   where e.id = p_experience_membership_id;
  if not found then
    raise exception 'unknown player experience membership' using errcode = '23503';
  end if;

  return query
  insert into public.player_aliases (
    experience_membership_id,
    player_id,
    organization_id,
    experience_kind,
    experience_id,
    display_alias,
    normalized_alias
  ) values (
    v_membership.id,
    v_membership.player_id,
    v_membership.organization_id,
    v_membership.experience_kind,
    v_membership.experience_id,
    v_display,
    public.normalize_player_alias(v_display)
  )
  on conflict (experience_membership_id) do update set
    display_alias = case
      when player_aliases.moderation_state = 'active'
        then excluded.display_alias
      else player_aliases.display_alias
    end,
    normalized_alias = case
      when player_aliases.moderation_state = 'active'
        then excluded.normalized_alias
      else player_aliases.normalized_alias
    end,
    updated_at = pg_catalog.now()
  returning
    player_aliases.id,
    player_aliases.display_alias,
    player_aliases.moderation_state;
end;
$$;

revoke all on function public.upsert_player_alias(uuid, text)
  from public, anon, authenticated;
grant execute on function public.upsert_player_alias(uuid, text)
  to service_role;

-- ============================================================
-- 2. Event live : capacité commerciale et modération atomique
-- ============================================================

create or replace function public.event_participant_capacity(
  p_organization_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (
      o.comp_access
      and (
        o.comp_access_until is null
        or o.comp_access_until > pg_catalog.now()
      )
    ) or o.plan = 'full' then 1000
    when o.plan = 'live' then 500
    else 100
  end
  from public.organizations o
  where o.id = p_organization_id
$$;

revoke all on function public.event_participant_capacity(uuid)
  from public, anon, authenticated;
grant execute on function public.event_participant_capacity(uuid)
  to service_role;

alter table public.event_sessions
  add column max_participants integer;

update public.event_sessions s
   set max_participants = coalesce(
     public.event_participant_capacity(s.organization_id),
     100
   );

alter table public.event_sessions
  alter column max_participants set default 100,
  alter column max_participants set not null,
  add constraint event_sessions_max_participants_check
    check (max_participants in (100, 500, 1000)),
  add column participant_revision bigint not null default 0
    check (participant_revision >= 0);

comment on column public.event_sessions.max_participants is
  'Capacité commerciale figée à la création : legacy/addon 100, Live 500, Full ou accès offert 1000.';

create or replace function public.snapshot_event_participant_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.max_participants := coalesce(
    public.event_participant_capacity(new.organization_id),
    100
  );
  return new;
end;
$$;

revoke all on function public.snapshot_event_participant_capacity()
  from public, anon, authenticated;

create trigger event_sessions_capacity_snapshot
  before insert on public.event_sessions
  for each row execute function public.snapshot_event_participant_capacity();

-- Étend la révision observable aux seules mutations explicites de modération.
-- Les joins/réponses ordinaires restent hors du canal Realtime.
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
    old.prono_correct_option_id,
    old.participant_revision
  ) is distinct from (
    new.status,
    new.phase,
    new.current_question_id,
    new.current_question_started_at,
    new.prono_correct_option_id,
    new.participant_revision
  ) then
    new.state_revision := old.state_revision + 1;
  else
    new.state_revision := old.state_revision;
  end if;
  return new;
end;
$$;

alter table public.event_players
  add column moderation_state text not null default 'active'
    check (moderation_state in ('active', 'hidden', 'banned')),
  add column moderation_original_pseudo text
    check (
      moderation_original_pseudo is null
      or pg_catalog.char_length(moderation_original_pseudo) between 1 and 24
    ),
  add column moderated_at timestamptz,
  add column moderated_by uuid references auth.users(id) on delete set null,
  add column moderation_reason text
    check (
      moderation_reason is null
      or pg_catalog.char_length(moderation_reason) between 1 and 300
    );

create index event_players_session_moderation_idx
  on public.event_players (session_id, moderation_state, joined_at);

create or replace function public.keep_moderated_event_score_zero()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.moderation_state <> 'active' then
    new.score := 0;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_moderated_event_score_zero()
  from public, anon, authenticated;

create trigger event_players_moderated_score_zero
  before insert or update of score, moderation_state
  on public.event_players
  for each row execute function public.keep_moderated_event_score_zero();

create or replace function public.join_event_session(
  p_join_code text,
  p_player_token_hash text,
  p_pseudo text,
  p_avatar text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_player public.event_players%rowtype;
  v_pseudo text;
  v_avatar text;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null
     or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select s.* into v_session
    from public.event_sessions s
    join public.organizations o on o.id = s.organization_id
   where s.join_code = pg_catalog.upper(
     pg_catalog.btrim(coalesce(p_join_code, ''))
   )
     and o.addon_events
   for update of s;
  if not found or v_session.status not in ('lobby', 'live') then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_pseudo := public.format_player_alias(p_pseudo);
  if not public.player_alias_is_allowed(v_pseudo) then
    return pg_catalog.jsonb_build_object('state', 'invalid_pseudo');
  end if;

  v_avatar := coalesce(p_avatar, '');
  if v_avatar <> '' and v_avatar !~ '^[a-z]{1,20}$' then
    v_avatar := '';
  end if;

  -- Le verrou de session sérialise capacité + insertion. Un joueur connu peut
  -- revenir lorsque la salle est pleine, mais une identité modérée ne contourne
  -- jamais son bannissement en changeant de pseudo.
  select p.* into v_player
    from public.event_players p
   where p.session_id = v_session.id
     and p.token_hash = p_player_token_hash;
  if found then
    if v_player.moderation_state <> 'active' then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;
    update public.event_players
       set pseudo = v_pseudo, avatar = v_avatar
     where id = v_player.id
    returning * into v_player;
  else
    select pg_catalog.count(*)::integer into v_count
      from public.event_players p
     where p.session_id = v_session.id;
    if v_count >= v_session.max_participants then
      return pg_catalog.jsonb_build_object(
        'state', 'full',
        'capacity', v_session.max_participants
      );
    end if;

    insert into public.event_players (
      session_id, organization_id, token_hash, pseudo, avatar
    ) values (
      v_session.id,
      v_session.organization_id,
      p_player_token_hash,
      v_pseudo,
      v_avatar
    )
    returning * into v_player;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'joined',
    'player', pg_catalog.jsonb_build_object(
      'id', v_player.id,
      'pseudo', v_player.pseudo,
      'avatar', v_player.avatar,
      'score', v_player.score
    ),
    'session', pg_catalog.jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status,
      'phase', v_session.phase,
      'max_participants', v_session.max_participants
    )
  );
end;
$$;

revoke all on function public.join_event_session(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.join_event_session(text, text, text, text)
  to service_role;

create or replace function public.submit_event_answer(
  p_session_id uuid,
  p_question_id uuid,
  p_player_token_hash text,
  p_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_player public.event_players%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_limit_seconds integer;
  v_elapsed_ms bigint;
  v_inserted boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null
     or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select s.* into v_session
    from public.event_sessions s
   where s.id = p_session_id
   for update of s;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_session.phase <> 'question_active'
     or v_session.current_question_id is distinct from p_question_id
     or v_session.current_question_started_at is null then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  select q.time_limit_seconds into v_limit_seconds
    from public.event_questions q
   where q.id = p_question_id
     and q.organization_id = v_session.organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  v_elapsed_ms := pg_catalog.floor(
    extract(
      epoch from (v_now - v_session.current_question_started_at)
    ) * 1000
  )::bigint;
  if v_elapsed_ms < 0
     or v_elapsed_ms > v_limit_seconds::bigint * 1000 then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  select p.* into v_player
    from public.event_players p
   where p.session_id = p_session_id
     and p.token_hash = p_player_token_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_joined');
  end if;
  if v_player.moderation_state <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not exists (
    select 1
      from public.event_question_options o
     where o.id = p_option_id
       and o.question_id = p_question_id
       and o.organization_id = v_session.organization_id
  ) then
    return pg_catalog.jsonb_build_object('state', 'invalid_option');
  end if;

  insert into public.event_answers (
    session_id,
    question_id,
    organization_id,
    player_id,
    option_id,
    answered_at,
    elapsed_ms
  ) values (
    p_session_id,
    p_question_id,
    v_session.organization_id,
    v_player.id,
    p_option_id,
    v_now,
    v_elapsed_ms::integer
  )
  on conflict (session_id, question_id, player_id) do nothing;
  v_inserted := found;
  if not v_inserted then
    return pg_catalog.jsonb_build_object('state', 'already_answered');
  end if;
  return pg_catalog.jsonb_build_object('state', 'recorded');
end;
$$;

revoke all on function public.submit_event_answer(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_event_answer(uuid, uuid, text, uuid)
  to service_role;

create or replace function public.moderate_event_player(
  p_organization_id uuid,
  p_session_id uuid,
  p_player_id uuid,
  p_moderation_state text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.event_players%rowtype;
  v_actor uuid := auth.uid();
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_moderation_state not in ('active', 'hidden', 'banned') then
    raise exception 'invalid moderation state' using errcode = '22023';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 300 then
    raise exception 'invalid moderation reason' using errcode = '22023';
  end if;

  select p.* into v_player
    from public.event_players p
   where p.id = p_player_id
     and p.session_id = p_session_id
     and p.organization_id = p_organization_id
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if p_moderation_state = 'active' then
    update public.event_players
       set pseudo = coalesce(moderation_original_pseudo, pseudo),
           moderation_original_pseudo = null,
           moderation_state = 'active',
           moderated_at = pg_catalog.now(),
           moderated_by = v_actor,
           moderation_reason = v_reason
     where id = p_player_id;
  else
    update public.event_players
       set moderation_original_pseudo = case
             when moderation_state = 'active' then pseudo
             else coalesce(moderation_original_pseudo, pseudo)
           end,
           pseudo = 'Joueur modéré',
           score = 0,
           moderation_state = p_moderation_state,
           moderated_at = pg_catalog.now(),
           moderated_by = v_actor,
           moderation_reason = v_reason
     where id = p_player_id;
  end if;

  update public.player_aliases a
     set moderation_state = p_moderation_state,
         moderated_at = pg_catalog.now(),
         moderation_reason = v_reason,
         updated_at = pg_catalog.now()
    from public.player_legacy_identities l
   where l.experience_membership_id = a.experience_membership_id
     and l.organization_id = p_organization_id
     and l.experience_kind = 'event'
     and l.experience_id = p_session_id
     and l.legacy_identity_hash = v_player.token_hash;

  update public.event_sessions
     set participant_revision = participant_revision + 1
   where id = p_session_id
     and organization_id = p_organization_id;

  insert into public.audit_logs (
    organization_id, actor, action, metadata
  ) values (
    p_organization_id,
    coalesce(v_actor::text, 'service_role'),
    'event.player.moderate',
    pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'player_id', p_player_id,
      'state', p_moderation_state
    )
  );

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'player_id', p_player_id,
    'moderation_state', p_moderation_state
  );
end;
$$;

revoke all on function public.moderate_event_player(
  uuid, uuid, uuid, text, text
) from public, anon;
grant execute on function public.moderate_event_player(
  uuid, uuid, uuid, text, text
) to authenticated, service_role;

-- Le classement public et la vue "moi" excluent totalement les joueurs
-- modérés. La fonction reprend le contrat state_revision de la migration 1300.
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
  v_reveal := v_session.phase = 'reveal';
  v_distribution_visible :=
    v_session.phase in ('question_locked', 'reveal', 'leaderboard');

  if v_qid is not null
     and v_session.phase in (
       'question_active', 'question_locked', 'reveal', 'leaderboard'
     ) then
    select q.question_type into v_qtype
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
        select o.id into v_correct_option
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
            join public.event_players p
              on p.id = a.player_id
             and p.session_id = a.session_id
           where a.session_id = p_session_id
             and a.question_id = v_qid
             and p.moderation_state = 'active'
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
         and p.moderation_state = 'active'
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
                  and x.moderation_state = 'active'
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
       and mp.token_hash = p_player_token_hash
       and mp.moderation_state = 'active';
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
      'reward_claimed_count', v_session.reward_claimed_count,
      'max_participants', v_session.max_participants
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
grant execute on function public.event_public_state(uuid, text)
  to service_role;

-- Un joueur modéré a score zéro ; ce filtre explicite ferme aussi tout futur
-- changement qui réintroduirait un score non nul.
create or replace function public.end_event_session(
  p_organization_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_available integer;
  v_awarded integer := 0;
  v_rank integer := 0;
  r record;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  select s.* into v_session
    from public.event_sessions s
   where s.id = p_session_id
     and s.organization_id = p_organization_id
   for update of s;
  if not found or v_session.status not in ('lobby', 'live') then
    return pg_catalog.jsonb_build_object('state', 'invalid_transition');
  end if;

  update public.event_sessions
     set status = 'ended',
         phase = 'ended',
         ended_at = pg_catalog.now()
   where id = p_session_id;

  v_available := pg_catalog.greatest(
    v_session.reward_stock - v_session.reward_claimed_count,
    0
  );
  if v_available > 0 then
    for r in
      select p.token_hash
        from public.event_players p
       where p.session_id = p_session_id
         and p.moderation_state = 'active'
         and p.score > 0
       order by p.score desc, p.joined_at asc, p.id asc
       limit v_available
    loop
      v_rank := v_rank + 1;
      v_code := null;
      for attempt in 1..8 loop
        v_bytes := extensions.gen_random_bytes(8);
        v_code := 'EVENT-';
        for i in 0..7 loop
          v_code := v_code || pg_catalog.substr(
            v_alphabet,
            pg_catalog.get_byte(v_bytes, i)
              % pg_catalog.length(v_alphabet) + 1,
            1
          );
        end loop;
        begin
          insert into public.event_wins (
            session_id, organization_id, rank, winner_token_hash, code
          ) values (
            p_session_id, p_organization_id, v_rank, r.token_hash, v_code
          );
          exit;
        exception when unique_violation then
          v_code := null;
        end;
      end loop;
      if v_code is null then
        raise exception 'event win code generation exhausted';
      end if;
      v_awarded := v_awarded + 1;
    end loop;

    if v_awarded > 0 then
      update public.event_sessions
         set reward_claimed_count = reward_claimed_count + v_awarded
       where id = p_session_id;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'session_id', p_session_id,
    'status', 'ended',
    'phase', 'ended',
    'winners', v_awarded
  );
end;
$$;

revoke all on function public.end_event_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.end_event_session(uuid, uuid)
  to authenticated, service_role;

-- ============================================================
-- 3. Détection des réponses physiquement impossibles
-- ============================================================

create table public.player_equity_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  experience_kind text not null check (experience_kind in ('event', 'quiz')),
  experience_id uuid not null,
  source_table text not null check (
    source_table in ('event_answers', 'quiz_answers')
  ),
  source_id uuid not null,
  signal_type text not null check (
    signal_type in ('impossible_server_elapsed')
  ),
  observed_ms integer not null check (observed_ms >= 0),
  minimum_ms integer not null check (minimum_ms between 1 and 10000),
  created_at timestamptz not null default pg_catalog.now(),
  unique (source_table, source_id, signal_type)
);

comment on table public.player_equity_signals is
  'Signaux internes non nominatifs. Les temps proviennent exclusivement des horloges serveur Event/Quiz ; aucune durée cliente n''est acceptée.';

create index player_equity_signals_scope_idx
  on public.player_equity_signals (
    organization_id, experience_kind, experience_id, created_at desc
  );

alter table public.player_equity_signals enable row level security;
revoke all on table public.player_equity_signals
  from public, anon, authenticated, service_role;
grant select, insert, delete on table public.player_equity_signals
  to service_role;

create or replace function public.detect_impossible_answer_elapsed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minimum_ms constant integer := 100;
begin
  if tg_table_name = 'event_answers' then
    if new.elapsed_ms < v_minimum_ms then
      insert into public.player_equity_signals (
        organization_id,
        experience_kind,
        experience_id,
        source_table,
        source_id,
        signal_type,
        observed_ms,
        minimum_ms
      ) values (
        new.organization_id,
        'event',
        new.session_id,
        'event_answers',
        new.id,
        'impossible_server_elapsed',
        new.elapsed_ms,
        v_minimum_ms
      )
      on conflict (source_table, source_id, signal_type) do nothing;
    end if;
  elsif tg_table_name = 'quiz_answers'
        and new.answered_at is not null
        and old.answered_at is null
        and new.elapsed_ms is not null
        and new.elapsed_ms < v_minimum_ms then
    insert into public.player_equity_signals (
      organization_id,
      experience_kind,
      experience_id,
      source_table,
      source_id,
      signal_type,
      observed_ms,
      minimum_ms
    ) values (
      new.organization_id,
      'quiz',
      new.quiz_id,
      'quiz_answers',
      new.id,
      'impossible_server_elapsed',
      new.elapsed_ms,
      v_minimum_ms
    )
    on conflict (source_table, source_id, signal_type) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.detect_impossible_answer_elapsed()
  from public, anon, authenticated;

create trigger event_answers_impossible_elapsed
  after insert on public.event_answers
  for each row execute function public.detect_impossible_answer_elapsed();

create trigger quiz_answers_impossible_elapsed
  after update of answered_at on public.quiz_answers
  for each row execute function public.detect_impossible_answer_elapsed();

-- ============================================================
-- 4. Minimisation anniversaire : le millésime n'est plus conservé
-- ============================================================

alter table public.newsletter_subscribers
  add column birthday_month smallint,
  add column birthday_day smallint,
  add constraint newsletter_birthday_month_day_check check (
    (birthday_month is null and birthday_day is null)
    or (
      birthday_month between 1 and 12
      and birthday_day between 1 and case birthday_month
        when 2 then 29
        when 4 then 30
        when 6 then 30
        when 9 then 30
        when 11 then 30
        else 31
      end
    )
  );

update public.newsletter_subscribers
   set birthday_month =
         extract(month from birth_date)::smallint,
       birthday_day =
         extract(day from birth_date)::smallint
 where birth_date is not null;

-- Le millésime a rempli sa seule fonction (contrôle d'âge au formulaire). Il
-- n'est pas nécessaire aux rappels annuels et est donc supprimé des lignes.
update public.newsletter_subscribers
   set birth_date = null
 where birth_date is not null;

comment on column public.newsletter_subscribers.birth_date is
  'Colonne de compatibilité : toujours neutralisée par trigger. Le millésime n''est plus conservé après le contrôle d''âge.';
comment on column public.newsletter_subscribers.birthday_month is
  'Mois d''anniversaire minimisé, présent uniquement avec consentement anniversaire.';
comment on column public.newsletter_subscribers.birthday_day is
  'Jour d''anniversaire minimisé, présent uniquement avec consentement anniversaire.';

create or replace function public.minimize_newsletter_birth_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date is not null then
    new.birthday_month :=
      extract(month from new.birth_date)::smallint;
    new.birthday_day :=
      extract(day from new.birth_date)::smallint;
    new.birth_date := null;
  end if;
  return new;
end;
$$;

revoke all on function public.minimize_newsletter_birth_date()
  from public, anon, authenticated;

create trigger newsletter_minimize_birth_date
  before insert or update of birth_date
  on public.newsletter_subscribers
  for each row execute function public.minimize_newsletter_birth_date();

-- Signature conservée pour éviter une rupture applicative. La date renvoyée
-- utilise l'année sentinelle bissextile 2000 ; aucun millésime réel n'est lu.
create or replace function public.automation_birthday_targets(
  p_organization_id uuid,
  p_limit integer default 100
)
returns table (email text, first_name text, birth_date date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_feb28_nonleap boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select (pg_catalog.now() at time zone o.timezone)::date
    into v_today
    from public.organizations o
   where o.id = p_organization_id;
  if v_today is null then
    return;
  end if;

  v_feb28_nonleap :=
    extract(month from v_today) = 2
    and extract(day from v_today) = 28
    and extract(day from (
      pg_catalog.date_trunc('year', v_today::timestamp)
      + interval '2 months' - interval '1 day'
    )) = 28;

  return query
  select
    s.email,
    last_win.first_name,
    pg_catalog.make_date(
      2000,
      s.birthday_month::integer,
      s.birthday_day::integer
    )
    from public.newsletter_subscribers s
    left join lateral (
      select p.first_name
        from public.participations p
       where p.organization_id = s.organization_id
         and p.email = s.email
       order by p.created_at desc
       limit 1
    ) last_win on true
   where s.organization_id = p_organization_id
     and s.unsubscribed_at is null
     and s.birthday_month is not null
     and s.birthday_day is not null
     and (
       (
         s.birthday_month =
           extract(month from v_today)::integer
         and s.birthday_day =
           extract(day from v_today)::integer
       )
       or (
         v_feb28_nonleap
         and s.birthday_month = 2
         and s.birthday_day = 29
       )
     )
     and not exists (
       select 1
         from public.email_log el
        where el.dedup_key = 'birthday:' || s.email || ':'
          || extract(year from v_today)::integer::text
     )
   order by s.email asc
   limit pg_catalog.least(
     pg_catalog.greatest(coalesce(p_limit, 100), 1),
     500
   );
end;
$$;

revoke all on function public.automation_birthday_targets(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.automation_birthday_targets(uuid, integer)
  to service_role;

-- ============================================================
-- 5. Fondation économique : plafonds configurables, monitor par défaut
-- ============================================================

create table public.experience_economic_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  experience_kind text not null check (
    experience_kind in (
      'campaign', 'hunt', 'loyalty', 'jackpot', 'event',
      'calendar', 'referral', 'contest', 'quiz'
    )
  ),
  experience_id uuid not null,
  source_type text not null check (
    source_type in (
      'wheel', 'hunt', 'loyalty', 'jackpot', 'event',
      'calendar', 'referral', 'quiz', 'contest'
    )
  ),
  enforcement_mode text not null default 'monitor'
    check (enforcement_mode in ('monitor', 'enforce')),
  max_total_issued integer
    check (max_total_issued is null or max_total_issued >= 0),
  max_per_player integer
    check (max_per_player is null or max_per_player >= 1),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, source_type, experience_id),
  constraint experience_economic_policy_has_cap check (
    max_total_issued is not null or max_per_player is not null
  )
);

comment on table public.experience_economic_policies is
  'Plafonds de distribution progressifs. Absence de ligne = aucun blocage ; monitor observe sans bloquer ; enforce refuse atomiquement au-dessus du plafond.';

alter table public.experience_economic_policies enable row level security;
revoke all on table public.experience_economic_policies
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.experience_economic_policies
  to authenticated, service_role;

create policy "economic policies: member select"
  on public.experience_economic_policies
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "economic policies: editor write"
  on public.experience_economic_policies
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create table public.economic_policy_events (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null
    references public.experience_economic_policies(id) on delete cascade,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  source_type text not null,
  experience_id uuid not null,
  reason text not null check (
    reason in ('total_cap_exceeded', 'player_cap_exceeded', 'player_unresolved')
  ),
  observed_total integer,
  observed_player_total integer,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.economic_policy_events enable row level security;
revoke all on table public.economic_policy_events
  from public, anon, authenticated, service_role;
grant select, insert, delete on table public.economic_policy_events
  to service_role;

create index economic_policy_events_scope_idx
  on public.economic_policy_events (
    organization_id, source_type, experience_id, created_at desc
  );

create or replace function public.assert_economic_policy_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_kind text;
begin
  v_expected_kind := case new.source_type
    when 'wheel' then 'campaign'
    else new.source_type
  end;
  if new.experience_kind <> v_expected_kind
     or not public.player_experience_scope_is_valid(
       new.experience_kind,
       new.experience_id,
       new.organization_id
     ) then
    raise exception 'economic policy experience does not belong to organization'
      using errcode = '23503';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.assert_economic_policy_scope()
  from public, anon, authenticated;

create trigger experience_economic_policy_scope
  before insert or update
  on public.experience_economic_policies
  for each row execute function public.assert_economic_policy_scope();

create or replace function public.apply_economic_distribution_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy public.experience_economic_policies%rowtype;
  v_total integer;
  v_player_total integer;
  v_reason text := null;
begin
  if new.experience_id is null then
    return new;
  end if;

  select p.* into v_policy
    from public.experience_economic_policies p
   where p.organization_id = new.organization_id
     and p.source_type = new.source_type
     and p.experience_id = new.experience_id
   for update;
  if not found then
    return new;
  end if;

  select pg_catalog.count(*)::integer + 1 into v_total
    from public.reward_issuances r
   where r.organization_id = new.organization_id
     and r.source_type = new.source_type
     and r.experience_id = new.experience_id
     and r.cancelled_at is null;

  if v_policy.max_total_issued is not null
     and v_total > v_policy.max_total_issued then
    v_reason := 'total_cap_exceeded';
  elsif v_policy.max_per_player is not null and new.player_id is null then
    v_reason := 'player_unresolved';
  elsif v_policy.max_per_player is not null then
    select pg_catalog.count(*)::integer + 1 into v_player_total
      from public.reward_issuances r
     where r.organization_id = new.organization_id
       and r.source_type = new.source_type
       and r.experience_id = new.experience_id
       and r.player_id = new.player_id
       and r.cancelled_at is null;
    if v_player_total > v_policy.max_per_player then
      v_reason := 'player_cap_exceeded';
    end if;
  end if;

  if v_reason is null then
    return new;
  end if;
  if v_policy.enforcement_mode = 'enforce'
     and v_reason <> 'player_unresolved' then
    raise exception 'economic distribution cap exceeded'
      using errcode = 'P0001';
  end if;

  insert into public.economic_policy_events (
    policy_id,
    organization_id,
    source_type,
    experience_id,
    reason,
    observed_total,
    observed_player_total
  ) values (
    v_policy.id,
    new.organization_id,
    new.source_type,
    new.experience_id,
    v_reason,
    v_total,
    v_player_total
  );
  return new;
end;
$$;

revoke all on function public.apply_economic_distribution_policy()
  from public, anon, authenticated;

create trigger reward_issuances_economic_policy
  before insert on public.reward_issuances
  for each row execute function public.apply_economic_distribution_policy();
