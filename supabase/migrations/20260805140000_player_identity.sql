-- ============================================================
-- LastChance — Identité joueur progressive et pseudonyme
-- ============================================================
-- Cette migration est ADDITIVE :
--   - le cookie global `lc-player` n'est stocké qu'après hashage ;
--   - les cookies/tables joueurs historiques restent intacts et autoritaires ;
--   - leur hash est relié paresseusement à une identité centrale ;
--   - aucune donnée nominative n'est introduite.
--
-- Les tables de pont sont volontairement service-role-only. Un commerçant ne
-- peut donc ni corréler un joueur entre deux organisations, ni usurper une
-- identité en écrivant directement un hash.

-- Une origine QR facultative doit appartenir au même tenant que l'adhésion.
alter table public.qr_codes
  add constraint qr_codes_id_org_unique unique (id, organization_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  -- Préparation d'une liaison nominative FUTURE. Aucune API publique ne la
  -- remplit dans cette version. Une valeur exige une preuve de consentement
  -- versionnée ; l'identifiant auth n'est pas une PII recopiée.
  auth_user_id uuid unique references auth.users(id) on delete set null,
  identity_consent_version text,
  identity_consent_at timestamptz,
  identity_linked_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint players_nominal_link_requires_consent check (
    auth_user_id is null
    or (
      identity_consent_version is not null
      and identity_consent_version ~ '^[A-Za-z0-9._-]{1,80}$'
      and identity_consent_at is not null
      and identity_linked_at is not null
    )
  )
);

comment on table public.players is
  'Identité joueur centrale pseudonyme. Aucune PII ; une liaison auth future exige un consentement explicite versionné.';

create table public.player_devices (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  token_version integer not null default 1 check (token_version between 1 and 1000000),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  grace_expires_at timestamptz,
  replaced_by_device_id uuid,
  unique (id, player_id),
  constraint player_devices_grace_requires_revocation check (
    grace_expires_at is null or revoked_at is not null
  ),
  constraint player_devices_replacement_requires_revocation check (
    replaced_by_device_id is null or revoked_at is not null
  )
);

alter table public.player_devices
  add constraint player_devices_replacement_same_player_fk
  foreign key (replaced_by_device_id, player_id)
  references public.player_devices(id, player_id)
  on delete set null (replaced_by_device_id);

comment on table public.player_devices is
  'Hashes des jetons opaques lc-player. Rotation avec grâce courte ; aucun jeton brut en base.';

create index player_devices_player_idx
  on public.player_devices (player_id, last_seen_at desc);
create index player_devices_active_idx
  on public.player_devices (player_id)
  where revoked_at is null;

create table public.player_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (player_id, organization_id),
  unique (id, player_id, organization_id)
);

comment on table public.player_organization_memberships is
  'Présence pseudonyme d''un joueur dans un tenant. Table interne non lisible par les commerçants.';

create table public.player_experience_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_membership_id uuid not null,
  player_id uuid not null references public.players(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  experience_kind text not null check (
    experience_kind in (
      'campaign', 'hunt', 'loyalty', 'jackpot', 'event',
      'calendar', 'referral', 'contest', 'quiz'
    )
  ),
  experience_id uuid not null,
  acquisition_source text not null default 'unknown' check (
    acquisition_source in ('direct', 'qr', 'share', 'referral', 'unknown')
  ),
  acquisition_qr_code_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (organization_id, experience_kind, experience_id, player_id),
  unique (id, player_id, organization_id, experience_kind, experience_id),
  foreign key (organization_membership_id, player_id, organization_id)
    references public.player_organization_memberships
      (id, player_id, organization_id)
    on delete cascade,
  foreign key (acquisition_qr_code_id, organization_id)
    references public.qr_codes(id, organization_id)
    on delete set null (acquisition_qr_code_id)
);

comment on table public.player_experience_memberships is
  'Adhésion pseudonyme à une expérience, reliée par FK composite à son tenant et validée contre la ressource métier.';

create index player_experience_memberships_player_idx
  on public.player_experience_memberships (player_id, last_seen_at desc);
create index player_experience_memberships_scope_idx
  on public.player_experience_memberships
    (organization_id, experience_kind, experience_id);

create table public.player_legacy_identities (
  id uuid primary key default gen_random_uuid(),
  experience_membership_id uuid not null,
  player_id uuid not null,
  organization_id uuid not null,
  experience_kind text not null,
  experience_id uuid not null,
  -- Hash déjà utilisé par la table historique (player_key/token_hash).
  -- Jamais le cookie/jeton brut.
  legacy_identity_hash text not null
    check (legacy_identity_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (
    organization_id,
    experience_kind,
    experience_id,
    legacy_identity_hash
  ),
  foreign key (
    experience_membership_id,
    player_id,
    organization_id,
    experience_kind,
    experience_id
  ) references public.player_experience_memberships
      (id, player_id, organization_id, experience_kind, experience_id)
    on delete cascade
);

comment on table public.player_legacy_identities is
  'Pont lazy-link entre lc-player et les hashes des cookies historiques, sans modifier leur progression.';

create index player_legacy_identities_membership_idx
  on public.player_legacy_identities
    (experience_membership_id, last_seen_at desc);
create index player_legacy_identities_player_idx
  on public.player_legacy_identities (player_id, last_seen_at desc);

-- ────────────────────────────────────────────────────────────
-- Isolation : aucune lecture directe publique ou marchande
-- ────────────────────────────────────────────────────────────

alter table public.players enable row level security;
alter table public.player_devices enable row level security;
alter table public.player_organization_memberships enable row level security;
alter table public.player_experience_memberships enable row level security;
alter table public.player_legacy_identities enable row level security;

revoke all on table public.players from public, anon, authenticated, service_role;
revoke all on table public.player_devices from public, anon, authenticated, service_role;
revoke all on table public.player_organization_memberships
  from public, anon, authenticated, service_role;
revoke all on table public.player_experience_memberships
  from public, anon, authenticated, service_role;
revoke all on table public.player_legacy_identities
  from public, anon, authenticated, service_role;

-- Le code applicatif écrit uniquement via les RPC SECURITY DEFINER ci-dessous.
-- La lecture service_role sert aux diagnostics internes et futures migrations.
grant select on table public.players to service_role;
grant select on table public.player_devices to service_role;
grant select on table public.player_organization_memberships to service_role;
grant select on table public.player_experience_memberships to service_role;
grant select on table public.player_legacy_identities to service_role;

-- ────────────────────────────────────────────────────────────
-- Validation polymorphe stricte expérience -> organisation
-- ────────────────────────────────────────────────────────────

create or replace function public.player_experience_scope_is_valid(
  p_experience_kind text,
  p_experience_id uuid,
  p_organization_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_experience_kind = 'campaign' then
    return exists (
      select 1 from public.campaigns c
       where c.id = p_experience_id
         and c.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'hunt' then
    return exists (
      select 1 from public.hunts h
       where h.id = p_experience_id
         and h.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'loyalty' then
    return exists (
      select 1 from public.loyalty_programs l
       where l.id = p_experience_id
         and l.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'jackpot' then
    return exists (
      select 1 from public.jackpot_campaigns j
       where j.id = p_experience_id
         and j.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'event' then
    return exists (
      select 1 from public.event_sessions e
       where e.id = p_experience_id
         and e.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'calendar' then
    return exists (
      select 1 from public.calendars c
       where c.id = p_experience_id
         and c.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'referral' then
    return exists (
      select 1 from public.referral_programs r
       where r.id = p_experience_id
         and r.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'contest' then
    return exists (
      select 1 from public.contests c
       where c.id = p_experience_id
         and c.organization_id = p_organization_id
    );
  elsif p_experience_kind = 'quiz' then
    return exists (
      select 1 from public.quizzes q
       where q.id = p_experience_id
         and q.organization_id = p_organization_id
    );
  end if;
  return false;
end;
$$;

create or replace function public.assert_player_experience_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.player_experience_scope_is_valid(
    new.experience_kind,
    new.experience_id,
    new.organization_id
  ) then
    raise exception 'player experience does not belong to organization'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger player_experience_memberships_scope_guard
before insert or update of organization_id, experience_kind, experience_id
on public.player_experience_memberships
for each row execute function public.assert_player_experience_scope();

-- ────────────────────────────────────────────────────────────
-- Résolution/lazy-link atomique
--
-- `#variable_conflict use_column` : les colonnes de `returns table`
-- deviennent des variables OUT en scope dans tout le corps. Les deux
-- cibles d'inférence `on conflict (player_id, …)` plus bas ne peuvent pas
-- être qualifiées (la syntaxe l'interdit) : leur `player_id` désigne à la
-- fois la colonne de la table et la variable OUT homonyme → « column
-- reference "player_id" is ambiguous » (42702) À L'EXÉCUTION, donc toute
-- résolution d'identité joueur cassée alors que le DDL s'applique.
-- La directive fait gagner la colonne, sens voulu. Sûre ici : le corps
-- n'accède jamais aux variables OUT par leur nom nu (locales
-- `v_`-préfixées, `return query select v_player_id, …`) — aucune
-- référence légitime n'est réinterprétée. Signature et colonnes de retour
-- inchangées. Même correctif que 20260724130000 pour
-- create_contest_league / join_contest_league.
-- ────────────────────────────────────────────────────────────

create or replace function public.resolve_player_identity(
  p_device_token_hash text,
  p_organization_id uuid,
  p_experience_kind text,
  p_experience_id uuid,
  p_legacy_identity_hash text,
  p_acquisition_source text,
  p_acquisition_qr_code_id uuid
)
returns table (
  player_id uuid,
  device_id uuid,
  experience_membership_id uuid,
  legacy_identity_hash text,
  device_created boolean,
  should_rotate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_player_id uuid;
  v_device_id uuid;
  v_device_created boolean := false;
  v_device_created_at timestamptz;
  v_device_revoked_at timestamptz;
  v_device_grace_expires_at timestamptz;
  v_player_status text;
  v_org_membership_id uuid;
  v_experience_membership_id uuid;
  v_existing_experience_membership_id uuid;
  v_legacy_identity_hash text;
  v_has_scope boolean;
begin
  if p_device_token_hash is null
     or p_device_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player device token hash' using errcode = '22023';
  end if;
  if p_legacy_identity_hash is not null
     and p_legacy_identity_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid legacy identity hash' using errcode = '22023';
  end if;
  if p_acquisition_source is null
     or p_acquisition_source not in ('direct', 'qr', 'share', 'referral', 'unknown') then
    raise exception 'invalid acquisition source' using errcode = '22023';
  end if;

  v_has_scope :=
    p_organization_id is not null
    and p_experience_kind is not null
    and p_experience_id is not null;
  if v_has_scope <> (
    p_organization_id is not null
    or p_experience_kind is not null
    or p_experience_id is not null
  ) then
    raise exception 'organization, experience kind and experience id must be provided together'
      using errcode = '22023';
  end if;
  if not v_has_scope and (
    p_legacy_identity_hash is not null
    or p_acquisition_qr_code_id is not null
  ) then
    raise exception 'legacy identity and QR origin require an experience scope'
      using errcode = '22023';
  end if;
  if v_has_scope and not public.player_experience_scope_is_valid(
    p_experience_kind,
    p_experience_id,
    p_organization_id
  ) then
    raise exception 'player experience does not belong to organization'
      using errcode = '23503';
  end if;

  -- Même ordre de verrouillage dans tous les appels : device puis legacy.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player-device:' || p_device_token_hash, 0)
  );
  if p_legacy_identity_hash is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'player-legacy:'
          || p_organization_id::text || ':'
          || p_experience_kind || ':'
          || p_experience_id::text || ':'
          || p_legacy_identity_hash,
        0
      )
    );
  end if;

  select d.id, d.player_id, d.created_at, d.revoked_at, d.grace_expires_at
    into v_device_id, v_player_id, v_device_created_at,
         v_device_revoked_at, v_device_grace_expires_at
    from public.player_devices d
   where d.token_hash = p_device_token_hash
   for update;

  if found then
    if v_device_revoked_at is not null
       and (
         v_device_grace_expires_at is null
         or v_device_grace_expires_at <= pg_catalog.now()
       ) then
      raise exception 'expired player device token' using errcode = '22023';
    end if;
  else
    -- Si le cookie global a été recréé mais qu'un cookie historique subsiste,
    -- rattacher le nouveau device au joueur déjà lazy-linké.
    if v_has_scope and p_legacy_identity_hash is not null then
      select l.player_id
        into v_player_id
        from public.player_legacy_identities l
       where l.organization_id = p_organization_id
         and l.experience_kind = p_experience_kind
         and l.experience_id = p_experience_id
         and l.legacy_identity_hash = p_legacy_identity_hash
       for update;
    end if;

    if v_player_id is null then
      insert into public.players default values
      returning id into v_player_id;
    end if;

    insert into public.player_devices (player_id, token_hash)
    values (v_player_id, p_device_token_hash)
    returning id, created_at
      into v_device_id, v_device_created_at;
    v_device_created := true;
  end if;

  select p.status into v_player_status
    from public.players p
   where p.id = v_player_id
   for update;
  if v_player_status is distinct from 'active' then
    raise exception 'player identity is not active' using errcode = '42501';
  end if;

  update public.players
     set last_seen_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = v_player_id;
  update public.player_devices
     set last_seen_at = pg_catalog.now()
   where id = v_device_id;

  if v_has_scope then
    insert into public.player_organization_memberships
      (player_id, organization_id)
    values (v_player_id, p_organization_id)
    on conflict (player_id, organization_id) do update
      set last_seen_at = pg_catalog.now()
    returning id into v_org_membership_id;

    insert into public.player_experience_memberships (
      organization_membership_id,
      player_id,
      organization_id,
      experience_kind,
      experience_id,
      acquisition_source,
      acquisition_qr_code_id
    ) values (
      v_org_membership_id,
      v_player_id,
      p_organization_id,
      p_experience_kind,
      p_experience_id,
      p_acquisition_source,
      p_acquisition_qr_code_id
    )
    on conflict (
      organization_id,
      experience_kind,
      experience_id,
      player_id
    ) do update set
      last_seen_at = pg_catalog.now(),
      acquisition_source = case
        when player_experience_memberships.acquisition_source = 'unknown'
          then excluded.acquisition_source
        else player_experience_memberships.acquisition_source
      end,
      acquisition_qr_code_id = coalesce(
        player_experience_memberships.acquisition_qr_code_id,
        excluded.acquisition_qr_code_id
      )
    returning id into v_experience_membership_id;

    if p_legacy_identity_hash is not null then
      select l.experience_membership_id
        into v_existing_experience_membership_id
        from public.player_legacy_identities l
       where l.organization_id = p_organization_id
         and l.experience_kind = p_experience_kind
         and l.experience_id = p_experience_id
         and l.legacy_identity_hash = p_legacy_identity_hash
       for update;

      if v_existing_experience_membership_id is not null
         and v_existing_experience_membership_id <> v_experience_membership_id then
        raise exception 'legacy identity is linked to another player'
          using errcode = '23505';
      end if;

      if v_existing_experience_membership_id is null then
        insert into public.player_legacy_identities (
          experience_membership_id,
          player_id,
          organization_id,
          experience_kind,
          experience_id,
          legacy_identity_hash
        ) values (
          v_experience_membership_id,
          v_player_id,
          p_organization_id,
          p_experience_kind,
          p_experience_id,
          p_legacy_identity_hash
        );
      else
        update public.player_legacy_identities
           set last_seen_at = pg_catalog.now()
         where organization_id = p_organization_id
           and experience_kind = p_experience_kind
           and experience_id = p_experience_id
           and legacy_identity_hash = p_legacy_identity_hash;
      end if;
      v_legacy_identity_hash := p_legacy_identity_hash;
    else
      select l.legacy_identity_hash
        into v_legacy_identity_hash
        from public.player_legacy_identities l
       where l.experience_membership_id = v_experience_membership_id
       order by l.last_seen_at desc, l.first_seen_at desc
       limit 1;
    end if;
  end if;

  return query select
    v_player_id,
    v_device_id,
    v_experience_membership_id,
    v_legacy_identity_hash,
    v_device_created,
    (
      v_device_revoked_at is not null
      or v_device_created_at <= pg_catalog.now() - interval '90 days'
    );
end;
$$;

-- Rotation : l'ancien hash est révoqué, avec cinq minutes de grâce pour les
-- requêtes concurrentes d'un même navigateur. Un hash expiré n'est jamais
-- réactivé.
create or replace function public.rotate_player_device(
  p_old_token_hash text,
  p_new_token_hash text
)
returns table (
  player_id uuid,
  device_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_old_device_id uuid;
  v_old_version integer;
  v_old_revoked_at timestamptz;
  v_old_grace_expires_at timestamptz;
  v_new_device_id uuid;
  v_new_player_id uuid;
  v_new_revoked_at timestamptz;
begin
  if p_old_token_hash is null
     or p_old_token_hash !~ '^[0-9a-f]{64}$'
     or p_new_token_hash is null
     or p_new_token_hash !~ '^[0-9a-f]{64}$'
     or p_old_token_hash = p_new_token_hash then
    raise exception 'invalid player device rotation' using errcode = '22023';
  end if;

  -- Ordre lexical pour éviter deux rotations croisées en interblocage.
  if p_old_token_hash < p_new_token_hash then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('player-device:' || p_old_token_hash, 0)
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('player-device:' || p_new_token_hash, 0)
    );
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('player-device:' || p_new_token_hash, 0)
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('player-device:' || p_old_token_hash, 0)
    );
  end if;

  select d.id, d.player_id, d.token_version, d.revoked_at, d.grace_expires_at
    into v_old_device_id, v_player_id, v_old_version,
         v_old_revoked_at, v_old_grace_expires_at
    from public.player_devices d
   where d.token_hash = p_old_token_hash
   for update;
  if not found then
    raise exception 'unknown player device token' using errcode = '22023';
  end if;
  if v_old_revoked_at is not null
     and (
       v_old_grace_expires_at is null
       or v_old_grace_expires_at <= pg_catalog.now()
     ) then
    raise exception 'expired player device token' using errcode = '22023';
  end if;

  select d.id, d.player_id, d.revoked_at
    into v_new_device_id, v_new_player_id, v_new_revoked_at
    from public.player_devices d
   where d.token_hash = p_new_token_hash
   for update;
  if found then
    if v_new_player_id <> v_player_id or v_new_revoked_at is not null then
      raise exception 'new player device token is unavailable' using errcode = '23505';
    end if;
  else
    insert into public.player_devices (player_id, token_hash, token_version)
    values (v_player_id, p_new_token_hash, v_old_version + 1)
    returning id into v_new_device_id;
  end if;

  update public.player_devices
     set revoked_at = coalesce(revoked_at, pg_catalog.now()),
         grace_expires_at = greatest(
           coalesce(grace_expires_at, pg_catalog.now()),
           pg_catalog.now() + interval '5 minutes'
         ),
         replaced_by_device_id = v_new_device_id,
         last_seen_at = pg_catalog.now()
   where id = v_old_device_id;
  update public.players
     set last_seen_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = v_player_id;

  return query select v_player_id, v_new_device_id;
end;
$$;

-- Lecture sans écriture pour une future reprise de progression. Elle ne renvoie
-- que le hash déjà employé par la table historique, jamais un jeton brut.
create or replace function public.lookup_player_identity(
  p_device_token_hash text,
  p_organization_id uuid,
  p_experience_kind text,
  p_experience_id uuid
)
returns table (
  player_id uuid,
  experience_membership_id uuid,
  legacy_identity_hash text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, e.id, l.legacy_identity_hash
    from public.player_devices d
    join public.players p
      on p.id = d.player_id
     and p.status = 'active'
    join public.player_experience_memberships e
      on e.player_id = p.id
     and e.organization_id = p_organization_id
     and e.experience_kind = p_experience_kind
     and e.experience_id = p_experience_id
    left join lateral (
      select li.legacy_identity_hash
        from public.player_legacy_identities li
       where li.experience_membership_id = e.id
       order by li.last_seen_at desc, li.first_seen_at desc
       limit 1
    ) l on true
   where d.token_hash = p_device_token_hash
     and (
       d.revoked_at is null
       or d.grace_expires_at > pg_catalog.now()
     )
   limit 1
$$;

revoke all on function public.player_experience_scope_is_valid(text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.assert_player_experience_scope()
  from public, anon, authenticated;
revoke all on function public.resolve_player_identity(
  text, uuid, text, uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.rotate_player_device(text, text)
  from public, anon, authenticated;
revoke all on function public.lookup_player_identity(text, uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.resolve_player_identity(
  text, uuid, text, uuid, text, text, uuid
) to service_role;
grant execute on function public.rotate_player_device(text, text)
  to service_role;
grant execute on function public.lookup_player_identity(text, uuid, text, uuid)
  to service_role;
