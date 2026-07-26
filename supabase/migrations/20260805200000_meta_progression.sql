-- ============================================================
-- LastChance — méta-progression multi-expériences (MVP)
--
-- Dépendances strictes :
--   140000 identité joueur pseudonyme ;
--   150000 registre universel des récompenses commerciales ;
--   160000 événements analytics serveur.
--
-- Les clés, badges, objets et coffres de ce module sont des marqueurs
-- d'engagement NON MONÉTAIRES. Aucun code de caisse n'est créé ici : une
-- récompense commerciale reste obligatoirement émise par sa source legacy,
-- puis miroirisée dans reward_issuances.
-- ============================================================

create or replace function public.is_valid_progression_rule(p_rule jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kinds jsonb;
begin
  if p_rule is null or pg_catalog.jsonb_typeof(p_rule) <> 'object' then
    return false;
  end if;
  if exists (
    select 1
      from pg_catalog.jsonb_object_keys(p_rule) as keys(key)
     where key not in (
       'version',
       'event_name',
       'target',
       'experience_kinds',
       'source',
       'distinct_experiences'
     )
  ) then
    return false;
  end if;
  if p_rule ->> 'version' <> '1' then
    return false;
  end if;
  if p_rule ->> 'event_name' not in (
    'experience_started',
    'experience_completed',
    'reward_issued',
    'reward_redeemed',
    'player_returned'
  ) then
    return false;
  end if;
  if coalesce(p_rule ->> 'target', '') !~ '^[1-9][0-9]{0,2}$'
    or (p_rule ->> 'target')::integer > 500
  then
    return false;
  end if;
  v_kinds := p_rule -> 'experience_kinds';
  if pg_catalog.jsonb_typeof(v_kinds) <> 'array'
    or pg_catalog.jsonb_array_length(v_kinds) not between 1 and 9
  then
    return false;
  end if;
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_kinds) value
     where pg_catalog.jsonb_typeof(value) <> 'string'
        or value #>> '{}' not in (
          'campaign', 'hunt', 'loyalty', 'jackpot', 'event',
          'calendar', 'referral', 'contest', 'quiz'
        )
  ) then
    return false;
  end if;
  if (
    select count(distinct value #>> '{}')
      from pg_catalog.jsonb_array_elements(v_kinds) value
  ) <> pg_catalog.jsonb_array_length(v_kinds) then
    return false;
  end if;
  if p_rule ? 'source'
    and p_rule ->> 'source' not in (
      'direct', 'qr', 'share', 'referral', 'unknown'
    )
  then
    return false;
  end if;
  if p_rule ? 'distinct_experiences'
    and pg_catalog.jsonb_typeof(p_rule -> 'distinct_experiences') <> 'boolean'
  then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.is_valid_progression_rule(jsonb)
  from public, anon, authenticated, service_role;

create table public.progression_seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120
  ),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'ended', 'archived')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, organization_id),
  constraint progression_seasons_window_check check (
    ends_at > starts_at
    and ends_at <= starts_at + interval '366 days'
  )
);

create unique index progression_seasons_one_active_org_idx
  on public.progression_seasons (organization_id)
  where status = 'active';
create index progression_seasons_org_time_idx
  on public.progression_seasons (organization_id, starts_at desc);

create table public.progression_badges (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  organization_id uuid not null,
  name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 80
  ),
  description text not null default '' check (
    pg_catalog.char_length(description) <= 500
  ),
  icon_key text not null default 'star'
    check (icon_key in ('star', 'trophy', 'spark', 'crown', 'compass')),
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, season_id, organization_id),
  foreign key (season_id, organization_id)
    references public.progression_seasons(id, organization_id)
    on delete cascade
);

create table public.progression_collections (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  organization_id uuid not null,
  name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 100
  ),
  description text not null default '' check (
    pg_catalog.char_length(description) <= 500
  ),
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, season_id, organization_id),
  foreign key (season_id, organization_id)
    references public.progression_seasons(id, organization_id)
    on delete cascade
);

create table public.progression_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null,
  season_id uuid not null,
  organization_id uuid not null,
  name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 100
  ),
  description text not null default '' check (
    pg_catalog.char_length(description) <= 500
  ),
  image_url text check (
    image_url is null
    or (
      pg_catalog.char_length(image_url) <= 2048
      and image_url ~ '^https://'
    )
  ),
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, season_id, organization_id),
  unique (collection_id, name),
  foreign key (collection_id, season_id, organization_id)
    references public.progression_collections(id, season_id, organization_id)
    on delete cascade
);

create table public.progression_missions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  organization_id uuid not null,
  name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 120
  ),
  description text not null default '' check (
    pg_catalog.char_length(description) <= 800
  ),
  enabled boolean not null default true,
  active_rule_version integer not null default 1
    check (active_rule_version between 1 and 1000),
  key_reward integer not null default 0 check (key_reward between 0 and 100),
  badge_id uuid,
  collection_item_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, season_id, organization_id),
  foreign key (season_id, organization_id)
    references public.progression_seasons(id, organization_id)
    on delete cascade,
  foreign key (badge_id, season_id, organization_id)
    references public.progression_badges(id, season_id, organization_id)
    on delete restrict,
  foreign key (collection_item_id, season_id, organization_id)
    references public.progression_collection_items(id, season_id, organization_id)
    on delete restrict
);

create table public.progression_mission_versions (
  mission_id uuid not null,
  version integer not null check (version between 1 and 1000),
  season_id uuid not null,
  organization_id uuid not null,
  rule jsonb not null check (public.is_valid_progression_rule(rule)),
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (mission_id, version),
  unique (mission_id, version, season_id, organization_id),
  foreign key (mission_id, season_id, organization_id)
    references public.progression_missions(id, season_id, organization_id)
    on delete cascade
);

create index progression_missions_season_idx
  on public.progression_missions (season_id, enabled);

create table public.progression_player_seasons (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  organization_membership_id uuid not null,
  player_id uuid not null,
  organization_id uuid not null,
  keys_balance integer not null default 0 check (keys_balance >= 0),
  keys_earned integer not null default 0 check (keys_earned >= 0),
  keys_spent integer not null default 0 check (keys_spent >= 0),
  first_progress_at timestamptz not null default pg_catalog.now(),
  last_progress_at timestamptz not null default pg_catalog.now(),
  unique (season_id, player_id),
  unique (id, player_id, organization_id, season_id),
  foreign key (season_id, organization_id)
    references public.progression_seasons(id, organization_id)
    on delete cascade,
  foreign key (organization_membership_id, player_id, organization_id)
    references public.player_organization_memberships(
      id, player_id, organization_id
    )
    on delete cascade
);

create index progression_player_seasons_org_idx
  on public.progression_player_seasons (organization_id, last_progress_at desc);
create index progression_player_seasons_player_idx
  on public.progression_player_seasons (player_id, last_progress_at desc);

create table public.progression_mission_progress (
  id uuid primary key default gen_random_uuid(),
  player_season_id uuid not null,
  mission_id uuid not null,
  rule_version integer not null,
  player_id uuid not null,
  organization_id uuid not null,
  season_id uuid not null,
  current_value integer not null default 0 check (current_value >= 0),
  target_value integer not null check (target_value between 1 and 500),
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (player_season_id, mission_id),
  unique (id, player_season_id),
  foreign key (player_season_id, player_id, organization_id, season_id)
    references public.progression_player_seasons(
      id, player_id, organization_id, season_id
    )
    on delete cascade,
  foreign key (mission_id, rule_version, season_id, organization_id)
    references public.progression_mission_versions(
      mission_id, version, season_id, organization_id
    )
    on delete restrict
);

create table public.progression_mission_contributions (
  id bigint generated always as identity primary key,
  progress_id uuid not null,
  player_season_id uuid not null,
  analytics_event_id bigint
    references public.experience_events(id) on delete set null,
  contribution_key text not null check (
    pg_catalog.char_length(contribution_key) between 1 and 180
  ),
  event_name text not null,
  experience_kind text not null,
  experience_id uuid not null,
  contributed_at timestamptz not null default pg_catalog.now(),
  unique (progress_id, contribution_key),
  foreign key (progress_id, player_season_id)
    references public.progression_mission_progress(id, player_season_id)
    on delete cascade
);

create index progression_contributions_event_idx
  on public.progression_mission_contributions (analytics_event_id)
  where analytics_event_id is not null;

create table public.progression_player_badges (
  id uuid primary key default gen_random_uuid(),
  player_season_id uuid not null,
  badge_id uuid not null,
  player_id uuid not null,
  organization_id uuid not null,
  season_id uuid not null,
  mission_id uuid,
  awarded_at timestamptz not null default pg_catalog.now(),
  unique (player_season_id, badge_id),
  foreign key (player_season_id, player_id, organization_id, season_id)
    references public.progression_player_seasons(
      id, player_id, organization_id, season_id
    )
    on delete cascade,
  foreign key (badge_id, season_id, organization_id)
    references public.progression_badges(id, season_id, organization_id)
    on delete cascade,
  foreign key (mission_id, season_id, organization_id)
    references public.progression_missions(id, season_id, organization_id)
    on delete set null (mission_id)
);

create table public.progression_player_items (
  id uuid primary key default gen_random_uuid(),
  player_season_id uuid not null,
  item_id uuid not null,
  player_id uuid not null,
  organization_id uuid not null,
  season_id uuid not null,
  source_type text not null check (source_type in ('mission', 'chest')),
  source_id uuid not null,
  awarded_at timestamptz not null default pg_catalog.now(),
  unique (player_season_id, item_id),
  foreign key (player_season_id, player_id, organization_id, season_id)
    references public.progression_player_seasons(
      id, player_id, organization_id, season_id
    )
    on delete cascade,
  foreign key (item_id, season_id, organization_id)
    references public.progression_collection_items(
      id, season_id, organization_id
    )
    on delete cascade
);

create table public.progression_chests (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  organization_id uuid not null,
  name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 100
  ),
  description text not null default '' check (
    pg_catalog.char_length(description) <= 500
  ),
  key_cost integer not null check (key_cost between 1 and 100),
  enabled boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, season_id, organization_id),
  foreign key (season_id, organization_id)
    references public.progression_seasons(id, organization_id)
    on delete cascade
);

create table public.progression_chest_items (
  chest_id uuid not null,
  item_id uuid not null,
  season_id uuid not null,
  organization_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (chest_id, item_id),
  foreign key (chest_id, season_id, organization_id)
    references public.progression_chests(id, season_id, organization_id)
    on delete cascade,
  foreign key (item_id, season_id, organization_id)
    references public.progression_collection_items(
      id, season_id, organization_id
    )
    on delete cascade
);

create table public.progression_chest_openings (
  id uuid primary key default gen_random_uuid(),
  player_season_id uuid not null,
  chest_id uuid not null,
  item_id uuid not null,
  player_id uuid not null,
  organization_id uuid not null,
  season_id uuid not null,
  request_id uuid not null,
  key_cost integer not null check (key_cost between 1 and 100),
  opened_at timestamptz not null default pg_catalog.now(),
  unique (player_season_id, request_id),
  foreign key (player_season_id, player_id, organization_id, season_id)
    references public.progression_player_seasons(
      id, player_id, organization_id, season_id
    )
    on delete cascade,
  foreign key (chest_id, season_id, organization_id)
    references public.progression_chests(id, season_id, organization_id)
    on delete restrict,
  foreign key (item_id, season_id, organization_id)
    references public.progression_collection_items(
      id, season_id, organization_id
    )
    on delete restrict
);

comment on table public.progression_mission_versions is
  'Règles immuables et bornées. Le moteur ne consomme que des événements experience_events émis côté serveur.';
comment on table public.progression_player_seasons is
  'Progression pseudonyme cloisonnée par organisation et saison ; aucune donnée nominative.';
comment on table public.progression_chests is
  'Coffres non monétaires : ils consomment des clés de saison et débloquent un objet de collection, jamais un code de caisse.';

-- Toutes les tables restent opaques aux visiteurs et commerçants. Les vues
-- passent par des agrégats/RPC gardés ; les mutations par des RPC éditeur.
alter table public.progression_seasons enable row level security;
alter table public.progression_badges enable row level security;
alter table public.progression_collections enable row level security;
alter table public.progression_collection_items enable row level security;
alter table public.progression_missions enable row level security;
alter table public.progression_mission_versions enable row level security;
alter table public.progression_player_seasons enable row level security;
alter table public.progression_mission_progress enable row level security;
alter table public.progression_mission_contributions enable row level security;
alter table public.progression_player_badges enable row level security;
alter table public.progression_player_items enable row level security;
alter table public.progression_chests enable row level security;
alter table public.progression_chest_items enable row level security;
alter table public.progression_chest_openings enable row level security;

revoke all on table
  public.progression_seasons,
  public.progression_badges,
  public.progression_collections,
  public.progression_collection_items,
  public.progression_missions,
  public.progression_mission_versions,
  public.progression_player_seasons,
  public.progression_mission_progress,
  public.progression_mission_contributions,
  public.progression_player_badges,
  public.progression_player_items,
  public.progression_chests,
  public.progression_chest_items,
  public.progression_chest_openings
from public, anon, authenticated, service_role;

grant select on table
  public.progression_seasons,
  public.progression_badges,
  public.progression_collections,
  public.progression_collection_items,
  public.progression_missions,
  public.progression_mission_versions,
  public.progression_player_seasons,
  public.progression_mission_progress,
  public.progression_mission_contributions,
  public.progression_player_badges,
  public.progression_player_items,
  public.progression_chests,
  public.progression_chest_items,
  public.progression_chest_openings
to service_role;

-- ============================================================
-- Moteur : expérience serveur -> contribution -> récompenses méta
-- ============================================================

create or replace function public.apply_meta_progression_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mission record;
  v_membership_id uuid;
  v_player_season_id uuid;
  v_progress public.progression_mission_progress%rowtype;
  v_contribution_key text;
  v_inserted boolean;
  v_target integer;
begin
  if new.player_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.player_id is not null then
    return new;
  end if;

  select id
    into v_membership_id
    from public.player_organization_memberships
   where player_id = new.player_id
     and organization_id = new.organization_id;
  if v_membership_id is null then
    return new;
  end if;

  for v_mission in
    select
      m.id as mission_id,
      m.season_id,
      m.organization_id,
      m.active_rule_version,
      m.key_reward,
      m.badge_id,
      m.collection_item_id,
      version.rule
    from public.progression_missions m
    join public.progression_mission_versions version
      on version.mission_id = m.id
     and version.version = m.active_rule_version
     and version.season_id = m.season_id
     and version.organization_id = m.organization_id
    join public.progression_seasons season
      on season.id = m.season_id
     and season.organization_id = m.organization_id
   where m.organization_id = new.organization_id
     and m.enabled
     and season.status = 'active'
     and new.occurred_at >= season.starts_at
     and new.occurred_at < season.ends_at
     and version.rule ->> 'event_name' = new.event_name
     and (version.rule -> 'experience_kinds') ? new.experience_kind
     and (
       not (version.rule ? 'source')
       or version.rule ->> 'source' = new.source
     )
  loop
    insert into public.progression_player_seasons (
      season_id,
      organization_membership_id,
      player_id,
      organization_id,
      first_progress_at,
      last_progress_at
    ) values (
      v_mission.season_id,
      v_membership_id,
      new.player_id,
      new.organization_id,
      new.occurred_at,
      new.occurred_at
    )
    on conflict (season_id, player_id) do update set
      last_progress_at = greatest(
        progression_player_seasons.last_progress_at,
        excluded.last_progress_at
      )
    returning id into v_player_season_id;

    v_target := (v_mission.rule ->> 'target')::integer;
    insert into public.progression_mission_progress (
      player_season_id,
      mission_id,
      rule_version,
      player_id,
      organization_id,
      season_id,
      target_value
    ) values (
      v_player_season_id,
      v_mission.mission_id,
      v_mission.active_rule_version,
      new.player_id,
      new.organization_id,
      v_mission.season_id,
      v_target
    )
    on conflict (player_season_id, mission_id) do nothing;

    select *
      into v_progress
      from public.progression_mission_progress
     where player_season_id = v_player_season_id
       and mission_id = v_mission.mission_id
     for update;

    if v_progress.completed_at is not null then
      continue;
    end if;

    v_contribution_key := case
      when coalesce(
        (v_mission.rule ->> 'distinct_experiences')::boolean,
        false
      )
      then
        'experience:' || new.experience_kind || ':' || new.experience_id::text
      else 'event:' || new.id::text
    end;

    insert into public.progression_mission_contributions (
      progress_id,
      player_season_id,
      analytics_event_id,
      contribution_key,
      event_name,
      experience_kind,
      experience_id,
      contributed_at
    ) values (
      v_progress.id,
      v_player_season_id,
      new.id,
      v_contribution_key,
      new.event_name,
      new.experience_kind,
      new.experience_id,
      new.occurred_at
    )
    on conflict (progress_id, contribution_key) do nothing;
    get diagnostics v_inserted = row_count;
    if not v_inserted then
      continue;
    end if;

    update public.progression_mission_progress
       set current_value = least(current_value + 1, target_value),
           updated_at = pg_catalog.now()
     where id = v_progress.id
     returning * into v_progress;

    if v_progress.current_value >= v_progress.target_value
      and v_progress.completed_at is null
    then
      update public.progression_mission_progress
         set completed_at = new.occurred_at,
             updated_at = pg_catalog.now()
       where id = v_progress.id;

      if v_mission.key_reward > 0 then
        update public.progression_player_seasons
           set keys_balance = keys_balance + v_mission.key_reward,
               keys_earned = keys_earned + v_mission.key_reward,
               last_progress_at = greatest(last_progress_at, new.occurred_at)
         where id = v_player_season_id;
      end if;

      if v_mission.badge_id is not null then
        insert into public.progression_player_badges (
          player_season_id,
          badge_id,
          player_id,
          organization_id,
          season_id,
          mission_id,
          awarded_at
        ) values (
          v_player_season_id,
          v_mission.badge_id,
          new.player_id,
          new.organization_id,
          v_mission.season_id,
          v_mission.mission_id,
          new.occurred_at
        )
        on conflict (player_season_id, badge_id) do nothing;
      end if;

      if v_mission.collection_item_id is not null then
        insert into public.progression_player_items (
          player_season_id,
          item_id,
          player_id,
          organization_id,
          season_id,
          source_type,
          source_id,
          awarded_at
        ) values (
          v_player_season_id,
          v_mission.collection_item_id,
          new.player_id,
          new.organization_id,
          v_mission.season_id,
          'mission',
          v_mission.mission_id,
          new.occurred_at
        )
        on conflict (player_season_id, item_id) do nothing;
      end if;
    end if;
  end loop;
  return new;
exception
  when others then
    -- La méta-progression est additive : elle ne doit jamais annuler
    -- l'événement analytics ni le parcours métier qui l'a produit.
    return new;
end;
$$;

revoke all on function public.apply_meta_progression_event()
  from public, anon, authenticated, service_role;

create trigger experience_events_meta_progression
after insert or update of player_id
on public.experience_events
for each row execute function public.apply_meta_progression_event();

-- ============================================================
-- Configuration commerçant : mutations bornées sur saison draft
-- ============================================================

create or replace function public.create_progression_season(
  p_organization_id uuid,
  p_name text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120
    or p_starts_at is null
    or p_ends_at is null
    or p_ends_at <= p_starts_at
    or p_ends_at > p_starts_at + interval '366 days'
  then
    raise exception 'invalid season' using errcode = '22023';
  end if;
  insert into public.progression_seasons (
    organization_id, name, starts_at, ends_at, created_by
  ) values (
    p_organization_id,
    pg_catalog.btrim(p_name),
    p_starts_at,
    p_ends_at,
    auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_progression_badge(
  p_organization_id uuid,
  p_season_id uuid,
  p_name text,
  p_description text default '',
  p_icon_key text default 'star'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.progression_seasons
     where id = p_season_id
       and organization_id = p_organization_id
       and status = 'draft'
  ) then
    raise exception 'draft season not found';
  end if;
  insert into public.progression_badges (
    season_id, organization_id, name, description, icon_key
  ) values (
    p_season_id,
    p_organization_id,
    pg_catalog.btrim(p_name),
    coalesce(pg_catalog.btrim(p_description), ''),
    coalesce(p_icon_key, 'star')
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_progression_collection(
  p_organization_id uuid,
  p_season_id uuid,
  p_name text,
  p_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.progression_seasons
     where id = p_season_id
       and organization_id = p_organization_id
       and status = 'draft'
  ) then
    raise exception 'draft season not found';
  end if;
  insert into public.progression_collections (
    season_id, organization_id, name, description
  ) values (
    p_season_id,
    p_organization_id,
    pg_catalog.btrim(p_name),
    coalesce(pg_catalog.btrim(p_description), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_progression_collection_item(
  p_organization_id uuid,
  p_collection_id uuid,
  p_name text,
  p_description text default '',
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_collection public.progression_collections%rowtype;
  v_position integer;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select c.* into v_collection
    from public.progression_collections c
    join public.progression_seasons s
      on s.id = c.season_id and s.organization_id = c.organization_id
   where c.id = p_collection_id
     and c.organization_id = p_organization_id
     and s.status = 'draft';
  if not found then
    raise exception 'draft collection not found';
  end if;
  select coalesce(max(position), -1) + 1 into v_position
    from public.progression_collection_items
   where collection_id = p_collection_id;
  insert into public.progression_collection_items (
    collection_id,
    season_id,
    organization_id,
    name,
    description,
    image_url,
    position
  ) values (
    p_collection_id,
    v_collection.season_id,
    p_organization_id,
    pg_catalog.btrim(p_name),
    coalesce(pg_catalog.btrim(p_description), ''),
    nullif(pg_catalog.btrim(p_image_url), ''),
    v_position
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_progression_mission(
  p_organization_id uuid,
  p_season_id uuid,
  p_name text,
  p_description text,
  p_event_name text,
  p_target integer,
  p_experience_kinds text[],
  p_key_reward integer default 0,
  p_source text default null,
  p_distinct_experiences boolean default false,
  p_badge_id uuid default null,
  p_collection_item_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_rule jsonb;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.progression_seasons
     where id = p_season_id
       and organization_id = p_organization_id
       and status = 'draft'
  ) then
    raise exception 'draft season not found';
  end if;
  v_rule := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'version', 1,
    'event_name', p_event_name,
    'target', p_target,
    'experience_kinds', pg_catalog.to_jsonb(p_experience_kinds),
    'source', p_source,
    'distinct_experiences', coalesce(p_distinct_experiences, false)
  ));
  if not public.is_valid_progression_rule(v_rule)
    or coalesce(p_key_reward, 0) not between 0 and 100
    or p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120
  then
    raise exception 'invalid mission' using errcode = '22023';
  end if;
  if p_badge_id is not null and not exists (
    select 1 from public.progression_badges
     where id = p_badge_id
       and season_id = p_season_id
       and organization_id = p_organization_id
  ) then
    raise exception 'badge not found';
  end if;
  if p_collection_item_id is not null and not exists (
    select 1 from public.progression_collection_items
     where id = p_collection_item_id
       and season_id = p_season_id
       and organization_id = p_organization_id
  ) then
    raise exception 'collection item not found';
  end if;

  insert into public.progression_missions (
    id,
    season_id,
    organization_id,
    name,
    description,
    key_reward,
    badge_id,
    collection_item_id
  ) values (
    v_id,
    p_season_id,
    p_organization_id,
    pg_catalog.btrim(p_name),
    coalesce(pg_catalog.btrim(p_description), ''),
    coalesce(p_key_reward, 0),
    p_badge_id,
    p_collection_item_id
  );
  insert into public.progression_mission_versions (
    mission_id,
    version,
    season_id,
    organization_id,
    rule,
    created_by
  ) values (
    v_id,
    1,
    p_season_id,
    p_organization_id,
    v_rule,
    auth.uid()
  );
  return v_id;
end;
$$;

create or replace function public.create_progression_chest(
  p_organization_id uuid,
  p_season_id uuid,
  p_name text,
  p_description text,
  p_key_cost integer,
  p_item_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_item_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.progression_seasons
     where id = p_season_id
       and organization_id = p_organization_id
       and status = 'draft'
  ) then
    raise exception 'draft season not found';
  end if;
  if p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 100
    or p_key_cost not between 1 and 100
    or coalesce(pg_catalog.array_length(p_item_ids, 1), 0)
      not between 1 and 50
    or (
      select count(distinct item_id)
        from pg_catalog.unnest(p_item_ids) item_id
    ) <> pg_catalog.array_length(p_item_ids, 1)
  then
    raise exception 'invalid chest' using errcode = '22023';
  end if;
  if exists (
    select 1
      from pg_catalog.unnest(p_item_ids) item_id
     where not exists (
       select 1 from public.progression_collection_items item
        where item.id = item_id
          and item.season_id = p_season_id
          and item.organization_id = p_organization_id
     )
  ) then
    raise exception 'collection item not found';
  end if;
  insert into public.progression_chests (
    season_id, organization_id, name, description, key_cost
  ) values (
    p_season_id,
    p_organization_id,
    pg_catalog.btrim(p_name),
    coalesce(pg_catalog.btrim(p_description), ''),
    p_key_cost
  )
  returning id into v_id;
  foreach v_item_id in array p_item_ids loop
    insert into public.progression_chest_items (
      chest_id, item_id, season_id, organization_id
    ) values (
      v_id, v_item_id, p_season_id, p_organization_id
    );
  end loop;
  return v_id;
end;
$$;

create or replace function public.activate_progression_season(
  p_organization_id uuid,
  p_season_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.progression_seasons
     where organization_id = p_organization_id
       and status = 'active'
       and id <> p_season_id
  ) then
    raise exception 'another season is active';
  end if;
  if not exists (
    select 1
      from public.progression_seasons season
     where season.id = p_season_id
       and season.organization_id = p_organization_id
       and season.status = 'draft'
       and season.ends_at > pg_catalog.now()
       and exists (
         select 1 from public.progression_missions mission
          where mission.season_id = season.id
            and mission.organization_id = season.organization_id
            and mission.enabled
       )
  ) then
    raise exception 'season cannot be activated';
  end if;
  update public.progression_seasons
     set status = 'active', updated_at = pg_catalog.now()
   where id = p_season_id
     and organization_id = p_organization_id
     and status = 'draft';
  return found;
end;
$$;

-- ============================================================
-- Lecture joueur et ouverture atomique d'un coffre
-- ============================================================

create or replace function public.player_progression_snapshot(
  p_device_token_hash text,
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_season public.progression_seasons%rowtype;
  v_player_season_id uuid;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or p_device_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select player.id
    into v_player_id
    from public.player_devices device
    join public.players player
      on player.id = device.player_id
     and player.status = 'active'
    join public.player_organization_memberships membership
      on membership.player_id = player.id
     and membership.organization_id = p_organization_id
   where device.token_hash = p_device_token_hash
     and (
       device.revoked_at is null
       or device.grace_expires_at > pg_catalog.now()
     )
   limit 1;
  if v_player_id is null then
    return null;
  end if;
  select *
    into v_season
    from public.progression_seasons
   where organization_id = p_organization_id
     and status = 'active'
     and starts_at <= pg_catalog.now()
     and ends_at > pg_catalog.now()
   limit 1;
  if not found then
    return null;
  end if;
  select id into v_player_season_id
    from public.progression_player_seasons
   where season_id = v_season.id
     and player_id = v_player_id;

  select pg_catalog.jsonb_build_object(
    'organization', pg_catalog.jsonb_build_object(
      'id', organization.id,
      'name', organization.name
    ),
    'season', pg_catalog.jsonb_build_object(
      'id', v_season.id,
      'name', v_season.name,
      'starts_at', v_season.starts_at,
      'ends_at', v_season.ends_at
    ),
    'keys', coalesce(player_season.keys_balance, 0),
    'keys_earned', coalesce(player_season.keys_earned, 0),
    'keys_spent', coalesce(player_season.keys_spent, 0),
    'missions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', mission.id,
          'name', mission.name,
          'description', mission.description,
          'target', (version.rule ->> 'target')::integer,
          'current', coalesce(progress.current_value, 0),
          'completed_at', progress.completed_at,
          'key_reward', mission.key_reward,
          'event_name', version.rule ->> 'event_name',
          'experience_kinds', version.rule -> 'experience_kinds'
        )
        order by mission.created_at, mission.id
      )
      from public.progression_missions mission
      join public.progression_mission_versions version
        on version.mission_id = mission.id
       and version.version = mission.active_rule_version
      left join public.progression_mission_progress progress
        on progress.mission_id = mission.id
       and progress.player_season_id = v_player_season_id
     where mission.season_id = v_season.id
       and mission.organization_id = p_organization_id
       and mission.enabled
    ), '[]'::jsonb),
    'badges', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', badge.id,
          'name', badge.name,
          'description', badge.description,
          'icon_key', badge.icon_key,
          'earned', player_badge.id is not null,
          'awarded_at', player_badge.awarded_at
        )
        order by badge.created_at, badge.id
      )
      from public.progression_badges badge
      left join public.progression_player_badges player_badge
        on player_badge.badge_id = badge.id
       and player_badge.player_season_id = v_player_season_id
     where badge.season_id = v_season.id
       and badge.organization_id = p_organization_id
    ), '[]'::jsonb),
    'collections', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', collection.id,
          'name', collection.name,
          'description', collection.description,
          'items', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', item.id,
                'name', item.name,
                'description', item.description,
                'image_url', item.image_url,
                'owned', player_item.id is not null,
                'awarded_at', player_item.awarded_at
              )
              order by item.position, item.id
            )
            from public.progression_collection_items item
            left join public.progression_player_items player_item
              on player_item.item_id = item.id
             and player_item.player_season_id = v_player_season_id
           where item.collection_id = collection.id
          ), '[]'::jsonb)
        )
        order by collection.created_at, collection.id
      )
      from public.progression_collections collection
     where collection.season_id = v_season.id
       and collection.organization_id = p_organization_id
    ), '[]'::jsonb),
    'chests', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', chest.id,
          'name', chest.name,
          'description', chest.description,
          'key_cost', chest.key_cost,
          'available_items', (
            select count(*)
              from public.progression_chest_items chest_item
             where chest_item.chest_id = chest.id
               and not exists (
                 select 1
                   from public.progression_player_items player_item
                  where player_item.player_season_id = v_player_season_id
                    and player_item.item_id = chest_item.item_id
               )
          )
        )
        order by chest.created_at, chest.id
      )
      from public.progression_chests chest
     where chest.season_id = v_season.id
       and chest.organization_id = p_organization_id
       and chest.enabled
    ), '[]'::jsonb)
  )
  into v_result
  from public.organizations organization
  left join public.progression_player_seasons player_season
    on player_season.id = v_player_season_id
 where organization.id = p_organization_id;

  return v_result;
end;
$$;

create or replace function public.open_progression_chest(
  p_device_token_hash text,
  p_organization_id uuid,
  p_chest_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_membership_id uuid;
  v_chest public.progression_chests%rowtype;
  v_player_season public.progression_player_seasons%rowtype;
  v_opening public.progression_chest_openings%rowtype;
  v_item public.progression_collection_items%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or p_device_token_hash !~ '^[0-9a-f]{64}$'
    or p_request_id is null
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select player.id, membership.id
    into v_player_id, v_membership_id
    from public.player_devices device
    join public.players player
      on player.id = device.player_id
     and player.status = 'active'
    join public.player_organization_memberships membership
      on membership.player_id = player.id
     and membership.organization_id = p_organization_id
   where device.token_hash = p_device_token_hash
     and (
       device.revoked_at is null
       or device.grace_expires_at > pg_catalog.now()
     )
   limit 1;
  if v_player_id is null then
    return null;
  end if;
  select chest.*
    into v_chest
    from public.progression_chests chest
    join public.progression_seasons season
      on season.id = chest.season_id
     and season.organization_id = chest.organization_id
   where chest.id = p_chest_id
     and chest.organization_id = p_organization_id
     and chest.enabled
     and season.status = 'active'
     and season.starts_at <= pg_catalog.now()
     and season.ends_at > pg_catalog.now();
  if not found then
    return null;
  end if;

  insert into public.progression_player_seasons (
    season_id, organization_membership_id, player_id, organization_id
  ) values (
    v_chest.season_id, v_membership_id, v_player_id, p_organization_id
  )
  on conflict (season_id, player_id) do nothing;

  select *
    into v_player_season
    from public.progression_player_seasons
   where season_id = v_chest.season_id
     and player_id = v_player_id
   for update;

  select *
    into v_opening
    from public.progression_chest_openings
   where player_season_id = v_player_season.id
     and request_id = p_request_id;
  if found then
    select * into v_item
      from public.progression_collection_items
     where id = v_opening.item_id;
    return pg_catalog.jsonb_build_object(
      'state', 'opened',
      'idempotent', true,
      'keys', v_player_season.keys_balance,
      'item', pg_catalog.jsonb_build_object(
        'id', v_item.id,
        'name', v_item.name,
        'description', v_item.description,
        'image_url', v_item.image_url
      )
    );
  end if;

  if v_player_season.keys_balance < v_chest.key_cost then
    return pg_catalog.jsonb_build_object(
      'state', 'insufficient_keys',
      'keys', v_player_season.keys_balance,
      'required_keys', v_chest.key_cost
    );
  end if;

  select item.*
    into v_item
    from public.progression_chest_items chest_item
    join public.progression_collection_items item
      on item.id = chest_item.item_id
     and item.season_id = chest_item.season_id
     and item.organization_id = chest_item.organization_id
   where chest_item.chest_id = v_chest.id
     and not exists (
       select 1
         from public.progression_player_items player_item
        where player_item.player_season_id = v_player_season.id
          and player_item.item_id = item.id
     )
   order by pg_catalog.md5(p_request_id::text || ':' || item.id::text)
   limit 1;
  if not found then
    return pg_catalog.jsonb_build_object(
      'state', 'collection_complete',
      'keys', v_player_season.keys_balance
    );
  end if;

  update public.progression_player_seasons
     set keys_balance = keys_balance - v_chest.key_cost,
         keys_spent = keys_spent + v_chest.key_cost,
         last_progress_at = pg_catalog.now()
   where id = v_player_season.id
   returning * into v_player_season;

  insert into public.progression_chest_openings (
    player_season_id,
    chest_id,
    item_id,
    player_id,
    organization_id,
    season_id,
    request_id,
    key_cost
  ) values (
    v_player_season.id,
    v_chest.id,
    v_item.id,
    v_player_id,
    p_organization_id,
    v_chest.season_id,
    p_request_id,
    v_chest.key_cost
  )
  returning * into v_opening;

  insert into public.progression_player_items (
    player_season_id,
    item_id,
    player_id,
    organization_id,
    season_id,
    source_type,
    source_id
  ) values (
    v_player_season.id,
    v_item.id,
    v_player_id,
    p_organization_id,
    v_chest.season_id,
    'chest',
    v_opening.id
  );

  return pg_catalog.jsonb_build_object(
    'state', 'opened',
    'idempotent', false,
    'keys', v_player_season.keys_balance,
    'item', pg_catalog.jsonb_build_object(
      'id', v_item.id,
      'name', v_item.name,
      'description', v_item.description,
      'image_url', v_item.image_url
    )
  );
end;
$$;

-- ============================================================
-- Vue commerçant agrégée : configuration + volumes, jamais de player_id
-- ============================================================

create or replace function public.org_progression_snapshot(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(p_organization_id)
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select pg_catalog.jsonb_build_object(
    'summary', pg_catalog.jsonb_build_object(
      'players', (
        select count(*) from public.progression_player_seasons
         where organization_id = p_organization_id
      ),
      'missions_completed', (
        select count(*) from public.progression_mission_progress
         where organization_id = p_organization_id
           and completed_at is not null
      ),
      'keys_earned', (
        select coalesce(sum(keys_earned), 0)
          from public.progression_player_seasons
         where organization_id = p_organization_id
      ),
      'chests_opened', (
        select count(*) from public.progression_chest_openings
         where organization_id = p_organization_id
      )
    ),
    'seasons', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', season.id,
          'name', season.name,
          'status', season.status,
          'starts_at', season.starts_at,
          'ends_at', season.ends_at,
          'missions', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', mission.id,
                'name', mission.name,
                'description', mission.description,
                'enabled', mission.enabled,
                'key_reward', mission.key_reward,
                'badge_id', mission.badge_id,
                'collection_item_id', mission.collection_item_id,
                'rule', version.rule
              )
              order by mission.created_at, mission.id
            )
            from public.progression_missions mission
            join public.progression_mission_versions version
              on version.mission_id = mission.id
             and version.version = mission.active_rule_version
           where mission.season_id = season.id
          ), '[]'::jsonb),
          'badges', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.to_jsonb(badge) - 'organization_id' - 'season_id'
              order by badge.created_at, badge.id
            )
            from public.progression_badges badge
           where badge.season_id = season.id
          ), '[]'::jsonb),
          'collections', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', collection.id,
                'name', collection.name,
                'description', collection.description,
                'items', coalesce((
                  select pg_catalog.jsonb_agg(
                    pg_catalog.to_jsonb(item)
                      - 'organization_id' - 'season_id' - 'collection_id'
                    order by item.position, item.id
                  )
                  from public.progression_collection_items item
                 where item.collection_id = collection.id
                ), '[]'::jsonb)
              )
              order by collection.created_at, collection.id
            )
            from public.progression_collections collection
           where collection.season_id = season.id
          ), '[]'::jsonb),
          'chests', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', chest.id,
                'name', chest.name,
                'description', chest.description,
                'key_cost', chest.key_cost,
                'enabled', chest.enabled,
                'item_ids', coalesce((
                  select pg_catalog.jsonb_agg(chest_item.item_id)
                    from public.progression_chest_items chest_item
                   where chest_item.chest_id = chest.id
                ), '[]'::jsonb)
              )
              order by chest.created_at, chest.id
            )
            from public.progression_chests chest
           where chest.season_id = season.id
          ), '[]'::jsonb)
        )
        order by season.starts_at desc, season.id
      )
      from public.progression_seasons season
     where season.organization_id = p_organization_id
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Purge des états joueurs inactifs selon le choix de rétention de l'org. La
-- configuration des saisons reste ; supprimer le scope cascade toute la
-- progression pseudonyme (missions, badges, items et ouvertures).
create or replace function public.purge_expired_meta_progression()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from public.progression_player_seasons player_season
  using public.organizations organization,
        public.player_organization_memberships membership
   where organization.id = player_season.organization_id
     and membership.id = player_season.organization_membership_id
     and organization.data_retention_months is not null
     and membership.last_seen_at < pg_catalog.now()
       - pg_catalog.make_interval(
           months => least(
             greatest(organization.data_retention_months, 1),
             24
           )
         );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ACL fonctions.
revoke all on function public.create_progression_season(
  uuid,text,timestamptz,timestamptz
) from public, anon;
revoke all on function public.create_progression_badge(
  uuid,uuid,text,text,text
) from public, anon;
revoke all on function public.create_progression_collection(
  uuid,uuid,text,text
) from public, anon;
revoke all on function public.create_progression_collection_item(
  uuid,uuid,text,text,text
) from public, anon;
revoke all on function public.create_progression_mission(
  uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid
) from public, anon;
revoke all on function public.create_progression_chest(
  uuid,uuid,text,text,integer,uuid[]
) from public, anon;
revoke all on function public.activate_progression_season(uuid,uuid)
  from public, anon;
revoke all on function public.org_progression_snapshot(uuid)
  from public, anon;
revoke all on function public.player_progression_snapshot(text,uuid)
  from public, anon, authenticated;
revoke all on function public.open_progression_chest(text,uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.purge_expired_meta_progression()
  from public, anon, authenticated;

grant execute on function public.create_progression_season(
  uuid,text,timestamptz,timestamptz
) to authenticated, service_role;
grant execute on function public.create_progression_badge(
  uuid,uuid,text,text,text
) to authenticated, service_role;
grant execute on function public.create_progression_collection(
  uuid,uuid,text,text
) to authenticated, service_role;
grant execute on function public.create_progression_collection_item(
  uuid,uuid,text,text,text
) to authenticated, service_role;
grant execute on function public.create_progression_mission(
  uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid
) to authenticated, service_role;
grant execute on function public.create_progression_chest(
  uuid,uuid,text,text,integer,uuid[]
) to authenticated, service_role;
grant execute on function public.activate_progression_season(uuid,uuid)
  to authenticated, service_role;
grant execute on function public.org_progression_snapshot(uuid)
  to authenticated, service_role;
grant execute on function public.player_progression_snapshot(text,uuid)
  to service_role;
grant execute on function public.open_progression_chest(text,uuid,uuid,uuid)
  to service_role;
grant execute on function public.purge_expired_meta_progression()
  to service_role;
