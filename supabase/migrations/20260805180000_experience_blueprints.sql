-- ============================================================
-- Lastchance — ExperienceBlueprint universel V1 (ADR-043)
--
-- Modèles strictement privés à une organisation. Une version publiée est
-- immuable. Restaurer signifie copier une ancienne version vers une NOUVELLE
-- version draft. L'application est une RPC transactionnelle service-role :
-- soit le module draft complet est créé, soit rien ne l'est.
-- ============================================================

create table public.experience_blueprints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null
    check (kind in ('campaign', 'pronostics', 'hunt', 'loyalty', 'jackpot',
                    'event', 'calendar', 'quiz', 'referral')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published', 'archived')),
  published_version integer check (published_version is null or published_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name)
);

create table public.experience_blueprint_versions (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null check (version > 0),
  schema_version integer not null check (schema_version > 0),
  configuration jsonb not null,
  assets jsonb not null default '[]'::jsonb,
  default_rewards jsonb not null default '[]'::jsonb,
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'published')),
  restored_from_version integer check (restored_from_version is null or restored_from_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint experience_blueprint_versions_blueprint_org_fk
    foreign key (blueprint_id, organization_id)
    references public.experience_blueprints(id, organization_id) on delete cascade,
  constraint experience_blueprint_versions_unique unique (blueprint_id, version),
  constraint experience_blueprint_versions_tenant_unique
    unique (blueprint_id, version, organization_id),
  constraint experience_blueprint_versions_configuration_object
    check (jsonb_typeof(configuration) = 'object'),
  constraint experience_blueprint_versions_assets_array
    check (jsonb_typeof(assets) = 'array'),
  constraint experience_blueprint_versions_rewards_array
    check (jsonb_typeof(default_rewards) = 'array'),
  constraint experience_blueprint_versions_configuration_size
    check (pg_column_size(configuration) <= 65536),
  constraint experience_blueprint_versions_assets_size
    check (pg_column_size(assets) <= 32768),
  constraint experience_blueprint_versions_rewards_size
    check (pg_column_size(default_rewards) <= 32768),
  constraint experience_blueprint_versions_publish_consistency
    check (
      (publication_status = 'published' and published_at is not null)
      or (publication_status = 'draft' and published_at is null)
    )
);

alter table public.experience_blueprints
  add constraint experience_blueprints_published_version_fk
  foreign key (id, published_version)
  references public.experience_blueprint_versions(blueprint_id, version)
  on delete set null (published_version)
  deferrable initially deferred;

create table public.experience_blueprint_applications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  blueprint_id uuid not null,
  blueprint_version integer not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null
    check (kind in ('campaign', 'pronostics', 'hunt', 'loyalty', 'jackpot',
                    'event', 'calendar', 'quiz', 'referral')),
  target_id uuid not null,
  secondary_target_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint experience_blueprint_applications_version_org_fk
    foreign key (blueprint_id, blueprint_version, organization_id)
    references public.experience_blueprint_versions(
      blueprint_id, version, organization_id
    ) on delete restrict,
  unique (organization_id, request_id)
);

create index experience_blueprints_org_created_idx
  on public.experience_blueprints (organization_id, created_at desc);
create index experience_blueprint_versions_org_blueprint_idx
  on public.experience_blueprint_versions
  (organization_id, blueprint_id, version desc);
create index experience_blueprint_applications_org_created_idx
  on public.experience_blueprint_applications (organization_id, created_at desc);

comment on table public.experience_blueprints is
  'Bibliothèque ExperienceBlueprint privée et tenant-scopée. Aucun catalogue ni partage inter-organisation.';
comment on table public.experience_blueprint_versions is
  'Snapshots versionnés. Une ligne publiée est immuable ; restaurer crée une nouvelle version draft.';
comment on table public.experience_blueprint_applications is
  'Journal idempotent des applications transactionnelles de versions publiées vers des modules draft.';

-- ── Garde d'acteur pour toutes les RPC mutantes ───────────────────────────

create or replace function public.assert_experience_blueprint_editor(
  p_organization_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_actor_id is null or not exists (
    select 1
      from public.organization_members m
     where m.organization_id = p_organization_id
       and m.user_id = p_actor_id
       and m.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized';
  end if;
end;
$$;

revoke all on function public.assert_experience_blueprint_editor(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assert_experience_blueprint_editor(uuid, uuid)
  to service_role;

-- La base borne et vérifie la compatibilité structurelle. La validation
-- détaillée des champs est assurée par les adaptateurs Zod versionnés ; les
-- contraintes des tables cibles restent le dernier verrou lors de l'apply.
create or replace function public.is_valid_experience_blueprint_payload(
  p_kind text,
  p_schema_version integer,
  p_configuration jsonb,
  p_assets jsonb,
  p_default_rewards jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_asset jsonb;
  v_reward jsonb;
  v_items jsonb;
begin
  if p_schema_version <> 1
    or jsonb_typeof(p_configuration) <> 'object'
    or jsonb_typeof(p_configuration -> 'name') <> 'string'
    or char_length(btrim(p_configuration ->> 'name')) not between 1 and 120
    or jsonb_typeof(p_assets) <> 'array'
    or jsonb_array_length(p_assets) > 16
    or jsonb_typeof(p_default_rewards) <> 'array'
    or jsonb_array_length(p_default_rewards) > 32
  then
    return false;
  end if;

  for v_asset in select value from jsonb_array_elements(p_assets)
  loop
    if jsonb_typeof(v_asset) <> 'object'
      or coalesce(v_asset ->> 'key', '') !~ '^[a-z][a-z0-9_-]{0,39}$'
      or coalesce(v_asset ->> 'url', '') !~ '^https?://'
      or char_length(coalesce(v_asset ->> 'url', '')) > 2048
    then
      return false;
    end if;
  end loop;

  for v_reward in select value from jsonb_array_elements(p_default_rewards)
  loop
    if jsonb_typeof(v_reward) <> 'object'
      or coalesce(v_reward ->> 'slot', '') !~ '^[a-z][a-z0-9:_-]{0,39}$'
      or jsonb_typeof(v_reward -> 'label') <> 'string'
      or char_length(btrim(v_reward ->> 'label')) not between 1 and 120
      or jsonb_typeof(v_reward -> 'stock') <> 'number'
      or (v_reward ->> 'stock')::numeric <> trunc((v_reward ->> 'stock')::numeric)
      or (v_reward ->> 'stock')::numeric not between 0 and 1000000
    then
      return false;
    end if;
  end loop;

  v_items := case p_kind
    when 'quiz' then p_configuration -> 'questions'
    when 'hunt' then p_configuration -> 'steps'
    when 'calendar' then p_configuration -> 'days'
    when 'loyalty' then p_configuration -> 'milestones'
    when 'event' then p_configuration -> 'questions'
    when 'pronostics' then p_configuration -> 'matches'
    else '[]'::jsonb
  end;

  if p_kind in ('quiz', 'calendar', 'loyalty', 'event', 'pronostics')
    and (jsonb_typeof(v_items) <> 'array'
         or jsonb_array_length(v_items) not between 1 and
           case p_kind
             when 'calendar' then 60
             when 'loyalty' then 50
             when 'pronostics' then 200
             else 100
           end)
  then
    return false;
  end if;
  if p_kind = 'hunt'
    and (jsonb_typeof(v_items) <> 'array'
         or jsonb_array_length(v_items) not between 2 and 10)
  then
    return false;
  end if;
  if p_kind = 'pronostics' and jsonb_array_length(p_default_rewards) > 20 then
    return false;
  end if;
  return p_kind in (
    'campaign', 'pronostics', 'hunt', 'loyalty', 'jackpot',
    'event', 'calendar', 'quiz', 'referral'
  );
exception when others then
  return false;
end;
$$;

revoke all on function public.is_valid_experience_blueprint_payload(
  text, integer, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.is_valid_experience_blueprint_payload(
  text, integer, jsonb, jsonb, jsonb
) to service_role;

-- ── Immutabilité des versions publiées ────────────────────────────────────

create or replace function public.protect_experience_blueprint_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publication_status = 'published' then
    raise exception 'published blueprint versions are immutable';
  end if;
  if new.blueprint_id is distinct from old.blueprint_id
    or new.organization_id is distinct from old.organization_id
    or new.version is distinct from old.version
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'blueprint version attribution is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_experience_blueprint_version()
  from public, anon, authenticated;

create trigger experience_blueprint_versions_immutable
  before update on public.experience_blueprint_versions
  for each row execute function public.protect_experience_blueprint_version();

-- ── Versioning et publication ─────────────────────────────────────────────

create or replace function public.create_experience_blueprint(
  p_organization_id uuid,
  p_actor_id uuid,
  p_kind text,
  p_name text,
  p_description text,
  p_schema_version integer,
  p_configuration jsonb,
  p_assets jsonb default '[]'::jsonb,
  p_default_rewards jsonb default '[]'::jsonb
)
returns table (blueprint_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blueprint_id uuid;
begin
  perform public.assert_experience_blueprint_editor(p_organization_id, p_actor_id);
  if not public.is_valid_experience_blueprint_payload(
    p_kind, p_schema_version, p_configuration, p_assets, p_default_rewards
  ) then
    raise exception 'invalid or incompatible blueprint payload';
  end if;
  if btrim(coalesce(p_name, '')) = ''
    or char_length(btrim(p_name)) > 120
    or char_length(coalesce(p_description, '')) > 500
  then
    raise exception 'invalid blueprint metadata';
  end if;

  insert into public.experience_blueprints (
    organization_id, kind, name, description, created_by
  ) values (
    p_organization_id, p_kind, btrim(p_name), nullif(btrim(p_description), ''), p_actor_id
  )
  returning id into v_blueprint_id;

  insert into public.experience_blueprint_versions (
    blueprint_id, organization_id, version, schema_version,
    configuration, assets, default_rewards, created_by
  ) values (
    v_blueprint_id, p_organization_id, 1, p_schema_version,
    p_configuration, p_assets, p_default_rewards, p_actor_id
  );

  return query select v_blueprint_id, 1;
end;
$$;

create or replace function public.create_experience_blueprint_version(
  p_organization_id uuid,
  p_actor_id uuid,
  p_blueprint_id uuid,
  p_expected_latest_version integer,
  p_schema_version integer,
  p_configuration jsonb,
  p_assets jsonb default '[]'::jsonb,
  p_default_rewards jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_latest integer;
  v_next integer;
begin
  perform public.assert_experience_blueprint_editor(p_organization_id, p_actor_id);
  select b.kind into v_kind
    from public.experience_blueprints b
   where b.id = p_blueprint_id
     and b.organization_id = p_organization_id
   for update;
  if not found then raise exception 'blueprint not found'; end if;

  select max(v.version) into v_latest
    from public.experience_blueprint_versions v
   where v.blueprint_id = p_blueprint_id
     and v.organization_id = p_organization_id;
  if v_latest is distinct from p_expected_latest_version then
    raise exception 'blueprint version conflict';
  end if;
  if not public.is_valid_experience_blueprint_payload(
    v_kind, p_schema_version, p_configuration, p_assets, p_default_rewards
  ) then
    raise exception 'invalid or incompatible blueprint payload';
  end if;

  v_next := v_latest + 1;
  insert into public.experience_blueprint_versions (
    blueprint_id, organization_id, version, schema_version,
    configuration, assets, default_rewards, created_by
  ) values (
    p_blueprint_id, p_organization_id, v_next, p_schema_version,
    p_configuration, p_assets, p_default_rewards, p_actor_id
  );
  update public.experience_blueprints
     set updated_at = pg_catalog.now()
   where id = p_blueprint_id and organization_id = p_organization_id;
  return v_next;
end;
$$;

create or replace function public.publish_experience_blueprint_version(
  p_organization_id uuid,
  p_actor_id uuid,
  p_blueprint_id uuid,
  p_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.experience_blueprint_versions%rowtype;
  v_kind text;
begin
  perform public.assert_experience_blueprint_editor(p_organization_id, p_actor_id);
  select b.kind into v_kind
    from public.experience_blueprints b
   where b.id = p_blueprint_id and b.organization_id = p_organization_id
   for update;
  if not found then raise exception 'blueprint not found'; end if;

  select * into v_row
    from public.experience_blueprint_versions v
   where v.blueprint_id = p_blueprint_id
     and v.organization_id = p_organization_id
     and v.version = p_version
   for update;
  if not found then raise exception 'blueprint version not found'; end if;
  if v_row.publication_status = 'published' then return true; end if;
  if not public.is_valid_experience_blueprint_payload(
    v_kind, v_row.schema_version, v_row.configuration,
    v_row.assets, v_row.default_rewards
  ) then
    raise exception 'invalid or incompatible blueprint payload';
  end if;

  update public.experience_blueprint_versions
     set publication_status = 'published', published_at = pg_catalog.now()
   where id = v_row.id;
  update public.experience_blueprints
     set publication_status = 'published',
         published_version = p_version,
         updated_at = pg_catalog.now()
   where id = p_blueprint_id and organization_id = p_organization_id;
  return true;
end;
$$;

create or replace function public.restore_experience_blueprint_version(
  p_organization_id uuid,
  p_actor_id uuid,
  p_blueprint_id uuid,
  p_source_version integer,
  p_expected_latest_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.experience_blueprint_versions%rowtype;
  v_latest integer;
  v_next integer;
begin
  perform public.assert_experience_blueprint_editor(p_organization_id, p_actor_id);
  perform 1
    from public.experience_blueprints b
   where b.id = p_blueprint_id and b.organization_id = p_organization_id
   for update;
  if not found then raise exception 'blueprint not found'; end if;

  select max(v.version) into v_latest
    from public.experience_blueprint_versions v
   where v.blueprint_id = p_blueprint_id
     and v.organization_id = p_organization_id;
  if v_latest is distinct from p_expected_latest_version then
    raise exception 'blueprint version conflict';
  end if;
  select * into v_source
    from public.experience_blueprint_versions v
   where v.blueprint_id = p_blueprint_id
     and v.organization_id = p_organization_id
     and v.version = p_source_version
     and v.publication_status = 'published';
  if not found then raise exception 'published source version not found'; end if;

  v_next := v_latest + 1;
  insert into public.experience_blueprint_versions (
    blueprint_id, organization_id, version, schema_version,
    configuration, assets, default_rewards, restored_from_version, created_by
  ) values (
    p_blueprint_id, p_organization_id, v_next, v_source.schema_version,
    v_source.configuration, v_source.assets, v_source.default_rewards,
    p_source_version, p_actor_id
  );
  update public.experience_blueprints
     set updated_at = pg_catalog.now()
   where id = p_blueprint_id and organization_id = p_organization_id;
  return v_next;
end;
$$;

revoke all on function public.create_experience_blueprint(
  uuid, uuid, text, text, text, integer, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.create_experience_blueprint_version(
  uuid, uuid, uuid, integer, integer, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.publish_experience_blueprint_version(
  uuid, uuid, uuid, integer
) from public, anon, authenticated;
revoke all on function public.restore_experience_blueprint_version(
  uuid, uuid, uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.create_experience_blueprint(
  uuid, uuid, text, text, text, integer, jsonb, jsonb, jsonb
) to service_role;
grant execute on function public.create_experience_blueprint_version(
  uuid, uuid, uuid, integer, integer, jsonb, jsonb, jsonb
) to service_role;
grant execute on function public.publish_experience_blueprint_version(
  uuid, uuid, uuid, integer
) to service_role;
grant execute on function public.restore_experience_blueprint_version(
  uuid, uuid, uuid, integer, integer
) to service_role;

-- ── Application atomique vers les six adaptateurs sûrs ───────────────────

create or replace function public.apply_experience_blueprint_version(
  p_organization_id uuid,
  p_actor_id uuid,
  p_blueprint_id uuid,
  p_version integer,
  p_request_id uuid
)
returns table (kind text, target_id uuid, secondary_target_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_configuration jsonb;
  v_assets jsonb;
  v_rewards jsonb;
  v_schema_version integer;
  v_existing public.experience_blueprint_applications%rowtype;
  v_target uuid;
  v_secondary uuid;
  v_item jsonb;
  v_option jsonb;
  v_reward jsonb;
  v_position integer;
  v_child uuid;
  v_start_date date;
  v_timezone text;
  v_reward_json jsonb := '[]'::jsonb;
begin
  perform public.assert_experience_blueprint_editor(p_organization_id, p_actor_id);
  if p_request_id is null then raise exception 'request id required'; end if;

  select * into v_existing
    from public.experience_blueprint_applications a
   where a.organization_id = p_organization_id and a.request_id = p_request_id;
  if found then
    if v_existing.blueprint_id <> p_blueprint_id
      or v_existing.blueprint_version <> p_version
    then
      raise exception 'idempotency key already used';
    end if;
    return query
      select v_existing.kind, v_existing.target_id, v_existing.secondary_target_id;
    return;
  end if;

  select b.kind, v.schema_version, v.configuration, v.assets, v.default_rewards
    into v_kind, v_schema_version, v_configuration, v_assets, v_rewards
    from public.experience_blueprints b
    join public.experience_blueprint_versions v
      on v.blueprint_id = b.id and v.organization_id = b.organization_id
   where b.id = p_blueprint_id
     and b.organization_id = p_organization_id
     and v.version = p_version
     and v.publication_status = 'published'
   for share of b, v;
  if not found then raise exception 'published blueprint version not found'; end if;
  if v_kind not in ('quiz', 'hunt', 'calendar', 'loyalty', 'event', 'pronostics') then
    raise exception 'unsupported blueprint adapter: %', v_kind;
  end if;
  if not public.is_valid_experience_blueprint_payload(
    v_kind, v_schema_version, v_configuration, v_assets, v_rewards
  ) then
    raise exception 'invalid or incompatible blueprint payload';
  end if;

  select value into v_reward
    from jsonb_array_elements(v_rewards)
   order by case when value ->> 'slot' in ('primary', 'completion', 'session') then 0 else 1 end
   limit 1;

  if v_kind = 'quiz' then
    insert into public.quizzes (
      organization_id, name, theme, status, intro_text,
      reward_mode, reward_label, reward_details, reward_stock
    ) values (
      p_organization_id,
      v_configuration ->> 'name',
      coalesce(v_configuration ->> 'theme', 'neutre'),
      'draft',
      nullif(v_configuration ->> 'intro_text', ''),
      case when v_reward is null then 'none' else 'instant' end,
      coalesce(v_reward ->> 'label', ''),
      nullif(v_reward ->> 'details', ''),
      coalesce((v_reward ->> 'stock')::integer, 0)
    ) returning id into v_target;

    v_position := 0;
    for v_item in select value from jsonb_array_elements(v_configuration -> 'questions')
    loop
      insert into public.quiz_questions (
        quiz_id, organization_id, position, prompt, question_type, preset,
        options, correct_answer, image_url, time_limit_seconds, points
      ) values (
        v_target, p_organization_id, v_position, v_item ->> 'prompt', 'choice',
        coalesce(v_item ->> 'preset', 'multiple_choice'),
        v_item -> 'options', to_jsonb(v_item ->> 'correct_option_id'),
        (
          select asset ->> 'url' from jsonb_array_elements(v_assets) asset
           where asset ->> 'key' = v_item ->> 'image_asset_key' limit 1
        ),
        (v_item ->> 'time_limit_seconds')::integer,
        coalesce((v_item ->> 'points')::integer, 1)
      );
      v_position := v_position + 1;
    end loop;

  elsif v_kind = 'hunt' then
    insert into public.hunts (
      organization_id, name, status, order_mode, min_scan_interval_seconds,
      reward_label, reward_details, reward_stock
    ) values (
      p_organization_id, v_configuration ->> 'name', 'draft',
      coalesce(v_configuration ->> 'order_mode', 'free'),
      coalesce((v_configuration ->> 'min_scan_interval_seconds')::integer, 0),
      coalesce(v_reward ->> 'label', ''),
      nullif(v_reward ->> 'details', ''),
      (v_reward ->> 'stock')::integer
    ) returning id into v_target;

    v_position := 1;
    for v_item in select value from jsonb_array_elements(v_configuration -> 'steps')
    loop
      insert into public.hunt_steps (
        hunt_id, organization_id, position, label, hint_text, token
      ) values (
        v_target, p_organization_id, v_position, v_item ->> 'label',
        nullif(v_item ->> 'hint_text', ''),
        encode(extensions.gen_random_bytes(16), 'hex')
      );
      v_position := v_position + 1;
    end loop;

  elsif v_kind = 'calendar' then
    v_start_date := current_date
      + coalesce((v_configuration ->> 'start_offset_days')::integer, 0);
    insert into public.calendars (
      organization_id, name, theme, status, start_date, day_count,
      merchant_content, completion_reward_label,
      completion_reward_details, completion_reward_stock
    ) values (
      p_organization_id, v_configuration ->> 'name',
      coalesce(v_configuration ->> 'theme', 'neutre'), 'draft',
      v_start_date, jsonb_array_length(v_configuration -> 'days'),
      nullif(v_configuration ->> 'merchant_content', ''),
      coalesce(v_reward ->> 'label', ''),
      nullif(v_reward ->> 'details', ''),
      coalesce((v_reward ->> 'stock')::integer, 0)
    ) returning id, timezone into v_target, v_timezone;

    v_position := 1;
    for v_item in select value from jsonb_array_elements(v_configuration -> 'days')
    loop
      insert into public.calendar_days (
        calendar_id, organization_id, day_index, unlock_at, content_type,
        content_text, is_special
      ) values (
        v_target, p_organization_id, v_position,
        ((v_start_date + (v_position - 1))::timestamp at time zone v_timezone),
        'content', nullif(v_item ->> 'content_text', ''),
        coalesce((v_item ->> 'is_special')::boolean, false)
      );
      v_position := v_position + 1;
    end loop;

  elsif v_kind = 'loyalty' then
    insert into public.loyalty_programs (
      organization_id, name, status, validation_mode,
      rotating_period_seconds, min_stamp_interval_seconds,
      silver_threshold, gold_threshold
    ) values (
      p_organization_id, v_configuration ->> 'name', 'draft',
      coalesce(v_configuration ->> 'validation_mode', 'staff'),
      coalesce((v_configuration ->> 'rotating_period_seconds')::integer, 60),
      coalesce((v_configuration ->> 'min_stamp_interval_seconds')::integer, 86400),
      (v_configuration ->> 'silver_threshold')::integer,
      (v_configuration ->> 'gold_threshold')::integer
    ) returning id into v_target;

    v_position := 1;
    for v_item in select value from jsonb_array_elements(v_configuration -> 'milestones')
    loop
      insert into public.loyalty_milestones (
        program_id, organization_id, visit_count, reward_type,
        reward_label, reward_details, reward_stock, position
      ) values (
        v_target, p_organization_id, (v_item ->> 'visit_count')::integer, 'lot',
        v_item ->> 'label', nullif(v_item ->> 'details', ''),
        (v_item ->> 'stock')::integer, v_position
      );
      v_position := v_position + 1;
    end loop;

  elsif v_kind = 'event' then
    insert into public.event_games (organization_id, name, status)
    values (p_organization_id, v_configuration ->> 'name', 'draft')
    returning id into v_target;

    v_position := 0;
    for v_item in select value from jsonb_array_elements(v_configuration -> 'questions')
    loop
      insert into public.event_questions (
        game_id, organization_id, position, question_type, prompt,
        time_limit_seconds, points_base, media_url
      ) values (
        v_target, p_organization_id, v_position, v_item ->> 'type',
        v_item ->> 'prompt',
        coalesce((v_item ->> 'time_limit_seconds')::integer, 20),
        coalesce((v_item ->> 'points_base')::integer, 1000),
        (
          select asset ->> 'url' from jsonb_array_elements(v_assets) asset
           where asset ->> 'key' = v_item ->> 'media_asset_key' limit 1
        )
      ) returning id into v_child;
      for v_option in select value from jsonb_array_elements(v_item -> 'options')
      loop
        insert into public.event_question_options (
          question_id, organization_id, position, label, is_correct
        ) values (
          v_child, p_organization_id,
          coalesce((
            select count(*) from public.event_question_options o
             where o.question_id = v_child
          ), 0),
          v_option ->> 'label',
          coalesce((v_option ->> 'is_correct')::boolean, false)
        );
      end loop;
      v_position := v_position + 1;
    end loop;

    insert into public.event_sessions (
      game_id, organization_id, label, status, phase,
      reward_label, reward_details, reward_stock
    ) values (
      v_target, p_organization_id,
      nullif(v_configuration ->> 'session_label', ''), 'draft', 'lobby',
      coalesce(v_reward ->> 'label', ''),
      nullif(v_reward ->> 'details', ''),
      coalesce((v_reward ->> 'stock')::integer, 0)
    ) returning id into v_secondary;

  elsif v_kind = 'pronostics' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'from', ordinality, 'to', ordinality, 'label', value ->> 'label'
    )), '[]'::jsonb)
      into v_reward_json
      from jsonb_array_elements(v_rewards) with ordinality;

    insert into public.contests (
      organization_id, slug, name, competition_key, status, scoring, rewards,
      collect_email, collect_phone, event_kind
    ) values (
      p_organization_id,
      'prono-' || encode(extensions.gen_random_bytes(8), 'hex'),
      v_configuration ->> 'name',
      coalesce(v_configuration ->> 'competition_key', 'custom'),
      'draft', v_configuration -> 'scoring', v_reward_json,
      coalesce((v_configuration ->> 'collect_email')::boolean, true),
      coalesce((v_configuration ->> 'collect_phone')::boolean, false),
      coalesce(v_configuration ->> 'event_kind', 'football')
    ) returning id into v_target;

    v_position := 0;
    for v_item in select value from jsonb_array_elements(v_configuration -> 'matches')
    loop
      insert into public.contest_matches (
        contest_id, organization_id, home_name, away_name, kickoff_at,
        status, position, question_type
      ) values (
        v_target, p_organization_id, v_item ->> 'home_name',
        v_item ->> 'away_name',
        pg_catalog.now() + make_interval(
          hours => (v_item ->> 'kickoff_offset_hours')::integer
        ),
        'scheduled', v_position, 'score'
      );
      v_position := v_position + 1;
    end loop;
  end if;

  insert into public.experience_blueprint_applications (
    request_id, blueprint_id, blueprint_version, organization_id,
    kind, target_id, secondary_target_id, created_by
  ) values (
    p_request_id, p_blueprint_id, p_version, p_organization_id,
    v_kind, v_target, v_secondary, p_actor_id
  );

  return query select v_kind, v_target, v_secondary;
end;
$$;

revoke all on function public.apply_experience_blueprint_version(
  uuid, uuid, uuid, integer, uuid
) from public, anon, authenticated;
grant execute on function public.apply_experience_blueprint_version(
  uuid, uuid, uuid, integer, uuid
) to service_role;

-- ── RLS / ACL : aucun anon, aucun cashier, aucune marketplace ─────────────

alter table public.experience_blueprints enable row level security;
alter table public.experience_blueprint_versions enable row level security;
alter table public.experience_blueprint_applications enable row level security;

revoke all on table public.experience_blueprints
  from public, anon, authenticated, service_role;
revoke all on table public.experience_blueprint_versions
  from public, anon, authenticated, service_role;
revoke all on table public.experience_blueprint_applications
  from public, anon, authenticated, service_role;

grant select on table public.experience_blueprints to authenticated;
grant select on table public.experience_blueprint_versions to authenticated;
grant select on table public.experience_blueprint_applications to authenticated;
grant select on table public.experience_blueprints to service_role;
grant select on table public.experience_blueprint_versions to service_role;
grant select on table public.experience_blueprint_applications to service_role;

create policy "experience_blueprints: editors read"
  on public.experience_blueprints
  for select to authenticated
  using (public.is_org_editor(organization_id));
create policy "experience_blueprint_versions: editors read"
  on public.experience_blueprint_versions
  for select to authenticated
  using (public.is_org_editor(organization_id));
create policy "experience_blueprint_applications: editors read"
  on public.experience_blueprint_applications
  for select to authenticated
  using (public.is_org_editor(organization_id));
