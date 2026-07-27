-- ============================================================
-- LastChance — méta-progression : cycle de vie de saison, édition
-- bornée au brouillon, moteur résilient, butin de coffre inforgeable.
--
-- Correctif ADDITIF de 20260805200000. Aucune table n'est supprimée,
-- aucune colonne n'est retirée, aucune ligne de progression n'est
-- détruite. Deux contraintes de clé étrangère sont RECONSTRUITES à
-- l'identique en RESTRICT -> NO ACTION (voir section 3) : c'est le seul
-- changement de schéma existant, et il n'assouplit aucun refus.
--
-- Ce module reste NON MONÉTAIRE : aucun code de caisse n'est créé ici.
-- ============================================================

-- ============================================================
-- 1. Trace exploitable des échecs du moteur
-- ============================================================
-- Écrite depuis un gestionnaire d'exception : VOLONTAIREMENT sans clé
-- étrangère et sans CHECK, pour qu'aucune contrainte ne puisse faire
-- échouer la trace au moment précis où elle est la plus utile.
create table if not exists public.progression_engine_failures (
  id bigint generated always as identity primary key,
  organization_id uuid,
  season_id uuid,
  mission_id uuid,
  analytics_event_id bigint,
  player_id uuid,
  sqlstate text,
  message text,
  failed_at timestamptz not null default pg_catalog.now()
);

comment on table public.progression_engine_failures is
  'Journal des missions que le moteur n''a pas pu appliquer. Sans FK ni CHECK : une trace ne doit jamais échouer. Lecture service_role uniquement.';

create index if not exists progression_engine_failures_org_idx
  on public.progression_engine_failures (organization_id, failed_at desc);

alter table public.progression_engine_failures enable row level security;

revoke all on table public.progression_engine_failures
  from public, anon, authenticated, service_role;
grant select on table public.progression_engine_failures to service_role;

-- ============================================================
-- 2. Sel serveur du tirage de butin
-- ============================================================
-- Sans lui, l'ordre de tirage se calcule à partir du seul p_request_id,
-- que l'appelant fournit : un client fabriqué peut meuler des request_id
-- hors ligne jusqu'à obtenir l'objet voulu. Le sel est posé par la base
-- et n'est exposé par AUCUN snapshot.
alter table public.progression_chests
  add column if not exists loot_seed uuid not null default gen_random_uuid();

comment on column public.progression_chests.loot_seed is
  'Sel serveur du tirage de butin. Jamais servi par une RPC de lecture : l''idempotence par request_id reste vraie, la prédiction du butin devient impossible.';

-- ============================================================
-- 3. Références de mission : RESTRICT -> NO ACTION
-- ============================================================
-- Les deux FK de progression_missions vers progression_badges et
-- progression_collection_items étaient en ON DELETE RESTRICT. RESTRICT
-- vérifie IMMÉDIATEMENT : supprimer une saison ou une organisation
-- déclenchait la cascade vers les badges AVANT la cascade vers les
-- missions et ÉCHOUAIT, alors que les missions allaient disparaître dans
-- la même instruction. NO ACTION vérifie en fin d'instruction : le refus
-- d'orphelin est conservé, la cascade redevient possible.
do $$
declare
  v_name text;
begin
  select con.conname
    into v_name
    from pg_catalog.pg_constraint con
   where con.conrelid = 'public.progression_missions'::regclass
     and con.contype = 'f'
     and con.confrelid = 'public.progression_badges'::regclass;
  if v_name is not null then
    execute pg_catalog.format(
      'alter table public.progression_missions drop constraint %I', v_name);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.progression_missions'::regclass
       and conname = 'progression_missions_badge_fk'
  ) then
    alter table public.progression_missions
      add constraint progression_missions_badge_fk
      foreign key (badge_id, season_id, organization_id)
      references public.progression_badges(id, season_id, organization_id);
  end if;
end;
$$;

do $$
declare
  v_name text;
begin
  select con.conname
    into v_name
    from pg_catalog.pg_constraint con
   where con.conrelid = 'public.progression_missions'::regclass
     and con.contype = 'f'
     and con.confrelid = 'public.progression_collection_items'::regclass;
  if v_name is not null then
    execute pg_catalog.format(
      'alter table public.progression_missions drop constraint %I', v_name);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.progression_missions'::regclass
       and conname = 'progression_missions_collection_item_fk'
  ) then
    alter table public.progression_missions
      add constraint progression_missions_collection_item_fk
      foreign key (collection_item_id, season_id, organization_id)
      references public.progression_collection_items(
        id, season_id, organization_id
      );
  end if;
end;
$$;

-- ============================================================
-- 4. Moteur : portée d'erreur resserrée à UNE mission
-- ============================================================
-- Trois niveaux, dans cet ordre de priorité :
--   1. une mission qui échoue n'annule QUE sa propre contribution ;
--      les missions déjà appliquées pour le même événement restent
--      acquises (l'ancien bloc unique les annulait toutes) ;
--   2. l'échec laisse une trace requêtable et une ligne de log serveur ;
--   3. le trigger ne fait JAMAIS échouer l'événement analytics : il est
--      posé sur experience_events, une exception remontante casserait le
--      parcours joueur qui a produit l'événement. La méta-progression est
--      additive : elle s'efface, elle ne bloque pas.
-- row_count est désormais lu dans un bigint : plus de dépendance au repli
-- de coercition entier -> booléen de plpgsql.
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
  v_row_count bigint;
  v_target integer;
  v_sqlstate text;
  v_message text;
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
    begin
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

      -- Une mission close ne recompte plus rien. Structure en `if` plutôt
      -- qu'en `continue` : on ne saute jamais hors d'un bloc à
      -- gestionnaire d'exception.
      if v_progress.completed_at is null then
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
        get diagnostics v_row_count = row_count;

        if v_row_count > 0 then
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
                     last_progress_at = greatest(
                       last_progress_at, new.occurred_at
                     )
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
        end if;
      end if;
    exception
      when others then
        get stacked diagnostics
          v_sqlstate = returned_sqlstate,
          v_message = message_text;
        -- La trace elle-même ne doit jamais propager d'erreur.
        begin
          insert into public.progression_engine_failures (
            organization_id,
            season_id,
            mission_id,
            analytics_event_id,
            player_id,
            sqlstate,
            message
          ) values (
            new.organization_id,
            v_mission.season_id,
            v_mission.mission_id,
            new.id,
            new.player_id,
            v_sqlstate,
            pg_catalog.left(coalesce(v_message, ''), 500)
          );
        exception
          when others then
            null;
        end;
        raise log 'meta progression: mission % skipped (% %)',
          v_mission.mission_id, v_sqlstate, v_message;
    end;
  end loop;
  return new;
exception
  when others then
    -- Ceinture de dernier recours : couvre la sélection des missions
    -- elle-même. On trace puis on rend la main sans casser l'événement.
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_message = message_text;
    begin
      insert into public.progression_engine_failures (
        organization_id, analytics_event_id, player_id, sqlstate, message
      ) values (
        new.organization_id,
        new.id,
        new.player_id,
        v_sqlstate,
        pg_catalog.left(coalesce(v_message, ''), 500)
      );
    exception
      when others then
        null;
    end;
    raise log 'meta progression: event % skipped (% %)',
      new.id, v_sqlstate, v_message;
    return new;
end;
$$;

revoke all on function public.apply_meta_progression_event()
  from public, anon, authenticated, service_role;

-- ============================================================
-- 5. Ouverture de coffre : butin salé, idempotence intacte
-- ============================================================
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

  -- L'ordre reste DÉTERMINISTE pour un couple (coffre, request_id) —
  -- l'idempotence est donc inchangée — mais il dépend d'un sel que
  -- l'appelant ne connaît pas : le butin n'est plus choisissable.
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
   order by pg_catalog.md5(
     v_chest.loot_seed::text || ':' || p_request_id::text || ':' || item.id::text
   )
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
-- 6. Purge : rétention mesurée sur la PROGRESSION, jamais laxiste
-- ============================================================
-- Deux corrections : la fenêtre se mesure sur player_season
-- .last_progress_at (l'activité réelle dans la saison) et non sur
-- membership.last_seen_at ; et une organisation sans rétention déclarée
-- n'échappe plus à la purge — elle retombe sur le plafond de 24 mois.
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
  using public.organizations organization
   where organization.id = player_season.organization_id
     and player_season.last_progress_at < pg_catalog.now()
       - pg_catalog.make_interval(
           months => least(
             greatest(coalesce(organization.data_retention_months, 24), 1),
             24
           )
         );
  get diagnostics v_deleted = row_count;

  -- Le journal de panne du moteur est un outil d'exploitation, pas une
  -- archive : il se borne tout seul.
  delete from public.progression_engine_failures
   where failed_at < pg_catalog.now() - interval '90 days';

  return v_deleted;
end;
$$;

-- ============================================================
-- 7. Cycle de vie d'une saison : clore, archiver, enchaîner
-- ============================================================
-- Avant ce correctif, progression_seasons_one_active_org_idx interdisait
-- une seconde saison et AUCUN chemin ne faisait sortir de 'active' :
-- une organisation était bloquée sur sa première saison à vie.
create or replace function public.end_progression_season(
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
  -- La clôture ne touche QUE le statut. Saisons joueurs, progressions,
  -- badges, objets et ouvertures restent en base et restent lisibles par
  -- player_progression_archive : un badge gagné ne se perd pas.
  update public.progression_seasons
     set status = 'ended', updated_at = pg_catalog.now()
   where id = p_season_id
     and organization_id = p_organization_id
     and status = 'active';
  if not found then
    raise exception 'active season not found';
  end if;
  return true;
end;
$$;

create or replace function public.archive_progression_season(
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
  update public.progression_seasons
     set status = 'archived', updated_at = pg_catalog.now()
   where id = p_season_id
     and organization_id = p_organization_id
     and status = 'ended';
  if not found then
    raise exception 'ended season not found';
  end if;
  return true;
end;
$$;

-- Activation : une saison active DÉJÀ EXPIRÉE ne verrouille plus
-- l'organisation. Elle se clôt d'elle-même à la première tentative
-- d'ouverture de la suivante.
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
  update public.progression_seasons
     set status = 'ended', updated_at = pg_catalog.now()
   where organization_id = p_organization_id
     and status = 'active'
     and ends_at <= pg_catalog.now();
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
-- 8. Lecture joueur des saisons closes
-- ============================================================
-- player_progression_snapshot ne sert que la saison ACTIVE. Sans cette
-- seconde lecture, clore une saison ferait disparaître de l'écran du
-- joueur tout ce qu'il a gagné. Aucune donnée nominative, aucun
-- identifiant joueur dans la charge utile.
create or replace function public.player_progression_archive(
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
  v_seasons jsonb;
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

  select coalesce(
    pg_catalog.jsonb_agg(archived.entry order by archived.starts_at desc),
    '[]'::jsonb
  )
    into v_seasons
    from (
      select
        season.starts_at as starts_at,
        pg_catalog.jsonb_build_object(
          'id', season.id,
          'name', season.name,
          'status', season.status,
          'starts_at', season.starts_at,
          'ends_at', season.ends_at,
          'keys_earned', player_season.keys_earned,
          'keys_spent', player_season.keys_spent,
          'badges', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', badge.id,
                'name', badge.name,
                'description', badge.description,
                'icon_key', badge.icon_key,
                'awarded_at', player_badge.awarded_at
              )
              order by player_badge.awarded_at, badge.id
            )
            from public.progression_player_badges player_badge
            join public.progression_badges badge
              on badge.id = player_badge.badge_id
           where player_badge.player_season_id = player_season.id
          ), '[]'::jsonb),
          'items', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', item.id,
                'name', item.name,
                'description', item.description,
                'image_url', item.image_url,
                'awarded_at', player_item.awarded_at
              )
              order by player_item.awarded_at, item.id
            )
            from public.progression_player_items player_item
            join public.progression_collection_items item
              on item.id = player_item.item_id
           where player_item.player_season_id = player_season.id
          ), '[]'::jsonb)
        ) as entry
      from public.progression_player_seasons player_season
      join public.progression_seasons season
        on season.id = player_season.season_id
       and season.organization_id = player_season.organization_id
     where player_season.player_id = v_player_id
       and player_season.organization_id = p_organization_id
       and season.status in ('ended', 'archived')
    ) archived;

  return pg_catalog.jsonb_build_object('seasons', v_seasons);
end;
$$;

-- ============================================================
-- 9. Édition et suppression — BORNÉES À UNE SAISON BROUILLON
-- ============================================================
-- Arbitrage produit : corriger une faute de frappe, jamais réécrire sous
-- les joueurs. Toutes ces RPC refusent dès que la saison n'est plus
-- 'draft' ; une saison brouillon n'a par construction aucun état joueur
-- (le moteur n'accepte que 'active', l'ouverture de coffre aussi).
--
-- Références orphelines : une mission cite badge_id et
-- collection_item_id. Supprimer une cible encore référencée est REFUSÉ
-- avec un message actionnable — jamais laissé à la violation de FK.
-- L'appartenance à un coffre, elle, est propagée (le lien disparaît),
-- sauf si le coffre se retrouverait sans butin.

create or replace function public.update_progression_badge(
  p_organization_id uuid,
  p_badge_id uuid,
  p_name text,
  p_description text default '',
  p_icon_key text default 'star'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select badge.season_id
    into v_season_id
    from public.progression_badges badge
    join public.progression_seasons season
      on season.id = badge.season_id
     and season.organization_id = badge.organization_id
   where badge.id = p_badge_id
     and badge.organization_id = p_organization_id
     and season.status = 'draft';
  if v_season_id is null then
    raise exception 'draft badge not found';
  end if;
  if p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 80
    or coalesce(p_icon_key, 'star') not in (
      'star', 'trophy', 'spark', 'crown', 'compass'
    )
    or pg_catalog.char_length(coalesce(p_description, '')) > 500
  then
    raise exception 'invalid badge' using errcode = '22023';
  end if;
  update public.progression_badges
     set name = pg_catalog.btrim(p_name),
         description = coalesce(pg_catalog.btrim(p_description), ''),
         icon_key = coalesce(p_icon_key, 'star')
   where id = p_badge_id
     and organization_id = p_organization_id;
  return true;
end;
$$;

create or replace function public.delete_progression_badge(
  p_organization_id uuid,
  p_badge_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select badge.season_id
    into v_season_id
    from public.progression_badges badge
    join public.progression_seasons season
      on season.id = badge.season_id
     and season.organization_id = badge.organization_id
   where badge.id = p_badge_id
     and badge.organization_id = p_organization_id
     and season.status = 'draft';
  if v_season_id is null then
    raise exception 'draft badge not found';
  end if;
  if exists (
    select 1 from public.progression_missions
     where badge_id = p_badge_id
       and organization_id = p_organization_id
  ) then
    raise exception 'badge used by a mission';
  end if;
  delete from public.progression_badges
   where id = p_badge_id
     and organization_id = p_organization_id;
  return true;
end;
$$;

create or replace function public.update_progression_collection(
  p_organization_id uuid,
  p_collection_id uuid,
  p_name text,
  p_description text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select collection.season_id
    into v_season_id
    from public.progression_collections collection
    join public.progression_seasons season
      on season.id = collection.season_id
     and season.organization_id = collection.organization_id
   where collection.id = p_collection_id
     and collection.organization_id = p_organization_id
     and season.status = 'draft';
  if v_season_id is null then
    raise exception 'draft collection not found';
  end if;
  if p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 100
    or pg_catalog.char_length(coalesce(p_description, '')) > 500
  then
    raise exception 'invalid collection' using errcode = '22023';
  end if;
  update public.progression_collections
     set name = pg_catalog.btrim(p_name),
         description = coalesce(pg_catalog.btrim(p_description), '')
   where id = p_collection_id
     and organization_id = p_organization_id;
  return true;
end;
$$;

create or replace function public.delete_progression_collection(
  p_organization_id uuid,
  p_collection_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select collection.season_id
    into v_season_id
    from public.progression_collections collection
    join public.progression_seasons season
      on season.id = collection.season_id
     and season.organization_id = collection.organization_id
   where collection.id = p_collection_id
     and collection.organization_id = p_organization_id
     and season.status = 'draft';
  if v_season_id is null then
    raise exception 'draft collection not found';
  end if;
  if exists (
    select 1
      from public.progression_missions mission
      join public.progression_collection_items item
        on item.id = mission.collection_item_id
     where item.collection_id = p_collection_id
  ) then
    raise exception 'collection item used by a mission';
  end if;
  -- Un coffre dont TOUT le butin vient de cette collection deviendrait
  -- vide : create_progression_chest exige au moins un objet, la
  -- suppression ne doit pas casser cet invariant par la bande.
  if exists (
    select 1
      from public.progression_chest_items chest_item
      join public.progression_collection_items item
        on item.id = chest_item.item_id
     where item.collection_id = p_collection_id
       and not exists (
         select 1
           from public.progression_chest_items other
           join public.progression_collection_items other_item
             on other_item.id = other.item_id
          where other.chest_id = chest_item.chest_id
            and other_item.collection_id <> p_collection_id
       )
  ) then
    raise exception 'chest would be left empty';
  end if;
  delete from public.progression_collections
   where id = p_collection_id
     and organization_id = p_organization_id;
  return true;
end;
$$;

create or replace function public.update_progression_collection_item(
  p_organization_id uuid,
  p_item_id uuid,
  p_name text,
  p_description text default '',
  p_image_url text default null,
  p_position integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.progression_collection_items%rowtype;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select item.*
    into v_item
    from public.progression_collection_items item
    join public.progression_seasons season
      on season.id = item.season_id
     and season.organization_id = item.organization_id
   where item.id = p_item_id
     and item.organization_id = p_organization_id
     and season.status = 'draft';
  if not found then
    raise exception 'draft collection item not found';
  end if;
  if p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 100
    or pg_catalog.char_length(coalesce(p_description, '')) > 500
    or (
      p_image_url is not null
      and (
        pg_catalog.char_length(p_image_url) > 2048
        or p_image_url !~ '^https://'
      )
    )
    or (p_position is not null and p_position not between 0 and 1000)
  then
    raise exception 'invalid collection item' using errcode = '22023';
  end if;
  update public.progression_collection_items
     set name = pg_catalog.btrim(p_name),
         description = coalesce(pg_catalog.btrim(p_description), ''),
         image_url = nullif(pg_catalog.btrim(p_image_url), ''),
         position = coalesce(p_position, v_item.position)
   where id = p_item_id
     and organization_id = p_organization_id;
  return true;
end;
$$;

create or replace function public.delete_progression_collection_item(
  p_organization_id uuid,
  p_item_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select item.season_id
    into v_season_id
    from public.progression_collection_items item
    join public.progression_seasons season
      on season.id = item.season_id
     and season.organization_id = item.organization_id
   where item.id = p_item_id
     and item.organization_id = p_organization_id
     and season.status = 'draft';
  if v_season_id is null then
    raise exception 'draft collection item not found';
  end if;
  if exists (
    select 1 from public.progression_missions
     where collection_item_id = p_item_id
       and organization_id = p_organization_id
  ) then
    raise exception 'collection item used by a mission';
  end if;
  if exists (
    select 1 from public.progression_chest_items chest_item
     where chest_item.item_id = p_item_id
       and (
         select count(*) from public.progression_chest_items other
          where other.chest_id = chest_item.chest_id
       ) = 1
  ) then
    raise exception 'chest would be left empty';
  end if;
  -- Le lien vers les coffres tombe par cascade : c'est une propagation
  -- volontaire, le coffre garde au moins un objet (contrôle ci-dessus).
  delete from public.progression_collection_items
   where id = p_item_id
     and organization_id = p_organization_id;
  return true;
end;
$$;

-- Édition d'une mission : la règle n'est jamais réécrite en place. Une
-- NOUVELLE version est ajoutée et devient active — progression_mission
-- _versions reste un journal immuable.
create or replace function public.update_progression_mission(
  p_organization_id uuid,
  p_mission_id uuid,
  p_name text,
  p_description text,
  p_event_name text,
  p_target integer,
  p_experience_kinds text[],
  p_key_reward integer default 0,
  p_source text default null,
  p_distinct_experiences boolean default false,
  p_badge_id uuid default null,
  p_collection_item_id uuid default null,
  p_enabled boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_version integer;
  v_rule jsonb;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select mission.season_id, mission.active_rule_version + 1
    into v_season_id, v_version
    from public.progression_missions mission
    join public.progression_seasons season
      on season.id = mission.season_id
     and season.organization_id = mission.organization_id
   where mission.id = p_mission_id
     and mission.organization_id = p_organization_id
     and season.status = 'draft';
  if v_season_id is null then
    raise exception 'draft mission not found';
  end if;
  if v_version > 1000 then
    raise exception 'too many mission revisions' using errcode = '22023';
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
    or pg_catalog.char_length(coalesce(p_description, '')) > 800
  then
    raise exception 'invalid mission' using errcode = '22023';
  end if;
  if p_badge_id is not null and not exists (
    select 1 from public.progression_badges
     where id = p_badge_id
       and season_id = v_season_id
       and organization_id = p_organization_id
  ) then
    raise exception 'badge not found';
  end if;
  if p_collection_item_id is not null and not exists (
    select 1 from public.progression_collection_items
     where id = p_collection_item_id
       and season_id = v_season_id
       and organization_id = p_organization_id
  ) then
    raise exception 'collection item not found';
  end if;

  insert into public.progression_mission_versions (
    mission_id, version, season_id, organization_id, rule, created_by
  ) values (
    p_mission_id, v_version, v_season_id, p_organization_id, v_rule, auth.uid()
  );
  update public.progression_missions
     set name = pg_catalog.btrim(p_name),
         description = coalesce(pg_catalog.btrim(p_description), ''),
         enabled = coalesce(p_enabled, true),
         key_reward = coalesce(p_key_reward, 0),
         badge_id = p_badge_id,
         collection_item_id = p_collection_item_id,
         active_rule_version = v_version,
         updated_at = pg_catalog.now()
   where id = p_mission_id
     and organization_id = p_organization_id;
  return v_version;
end;
$$;

create or replace function public.delete_progression_mission(
  p_organization_id uuid,
  p_mission_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select mission.season_id
    into v_season_id
    from public.progression_missions mission
    join public.progression_seasons season
      on season.id = mission.season_id
     and season.organization_id = mission.organization_id
   where mission.id = p_mission_id
     and mission.organization_id = p_organization_id
     and season.status = 'draft';
  if v_season_id is null then
    raise exception 'draft mission not found';
  end if;
  -- Ceinture : une saison brouillon n'a pas d'état joueur, mais on ne
  -- détruit jamais une progression par surprise.
  if exists (
    select 1 from public.progression_mission_progress
     where mission_id = p_mission_id
  ) then
    raise exception 'mission already has player progress';
  end if;
  delete from public.progression_missions
   where id = p_mission_id
     and organization_id = p_organization_id;
  return true;
end;
$$;

create or replace function public.update_progression_chest(
  p_organization_id uuid,
  p_chest_id uuid,
  p_name text,
  p_description text,
  p_key_cost integer,
  p_item_ids uuid[],
  p_enabled boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_item_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select chest.season_id
    into v_season_id
    from public.progression_chests chest
    join public.progression_seasons season
      on season.id = chest.season_id
     and season.organization_id = chest.organization_id
   where chest.id = p_chest_id
     and chest.organization_id = p_organization_id
     and season.status = 'draft';
  if v_season_id is null then
    raise exception 'draft chest not found';
  end if;
  if p_name is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 100
    or pg_catalog.char_length(coalesce(p_description, '')) > 500
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
          and item.season_id = v_season_id
          and item.organization_id = p_organization_id
     )
  ) then
    raise exception 'collection item not found';
  end if;
  update public.progression_chests
     set name = pg_catalog.btrim(p_name),
         description = coalesce(pg_catalog.btrim(p_description), ''),
         key_cost = p_key_cost,
         enabled = coalesce(p_enabled, true)
   where id = p_chest_id
     and organization_id = p_organization_id;
  delete from public.progression_chest_items where chest_id = p_chest_id;
  foreach v_item_id in array p_item_ids loop
    insert into public.progression_chest_items (
      chest_id, item_id, season_id, organization_id
    ) values (
      p_chest_id, v_item_id, v_season_id, p_organization_id
    );
  end loop;
  return true;
end;
$$;

create or replace function public.delete_progression_chest(
  p_organization_id uuid,
  p_chest_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select chest.season_id
    into v_season_id
    from public.progression_chests chest
    join public.progression_seasons season
      on season.id = chest.season_id
     and season.organization_id = chest.organization_id
   where chest.id = p_chest_id
     and chest.organization_id = p_organization_id
     and season.status = 'draft';
  if v_season_id is null then
    raise exception 'draft chest not found';
  end if;
  if exists (
    select 1 from public.progression_chest_openings
     where chest_id = p_chest_id
  ) then
    raise exception 'chest already opened by a player';
  end if;
  delete from public.progression_chests
   where id = p_chest_id
     and organization_id = p_organization_id;
  return true;
end;
$$;

-- Suppression d'une saison brouillon entière. Les DELETE sont explicites
-- et ordonnés : on ne s'en remet pas à l'ordre de déclenchement des
-- triggers d'intégrité référentielle.
create or replace function public.delete_progression_season(
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
  if not exists (
    select 1 from public.progression_seasons
     where id = p_season_id
       and organization_id = p_organization_id
       and status = 'draft'
  ) then
    raise exception 'draft season not found';
  end if;
  delete from public.progression_chests
   where season_id = p_season_id and organization_id = p_organization_id;
  delete from public.progression_missions
   where season_id = p_season_id and organization_id = p_organization_id;
  delete from public.progression_collections
   where season_id = p_season_id and organization_id = p_organization_id;
  delete from public.progression_badges
   where season_id = p_season_id and organization_id = p_organization_id;
  delete from public.progression_seasons
   where id = p_season_id
     and organization_id = p_organization_id
     and status = 'draft';
  return true;
end;
$$;

-- ============================================================
-- 10. ACL des nouvelles RPC
-- ============================================================
revoke all on function public.end_progression_season(uuid,uuid)
  from public, anon;
revoke all on function public.archive_progression_season(uuid,uuid)
  from public, anon;
revoke all on function public.delete_progression_season(uuid,uuid)
  from public, anon;
revoke all on function public.update_progression_badge(uuid,uuid,text,text,text)
  from public, anon;
revoke all on function public.delete_progression_badge(uuid,uuid)
  from public, anon;
revoke all on function public.update_progression_collection(uuid,uuid,text,text)
  from public, anon;
revoke all on function public.delete_progression_collection(uuid,uuid)
  from public, anon;
revoke all on function public.update_progression_collection_item(
  uuid,uuid,text,text,text,integer
) from public, anon;
revoke all on function public.delete_progression_collection_item(uuid,uuid)
  from public, anon;
revoke all on function public.update_progression_mission(
  uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid,boolean
) from public, anon;
revoke all on function public.delete_progression_mission(uuid,uuid)
  from public, anon;
revoke all on function public.update_progression_chest(
  uuid,uuid,text,text,integer,uuid[],boolean
) from public, anon;
revoke all on function public.delete_progression_chest(uuid,uuid)
  from public, anon;
revoke all on function public.player_progression_archive(text,uuid)
  from public, anon, authenticated;

grant execute on function public.end_progression_season(uuid,uuid)
  to authenticated, service_role;
grant execute on function public.archive_progression_season(uuid,uuid)
  to authenticated, service_role;
grant execute on function public.delete_progression_season(uuid,uuid)
  to authenticated, service_role;
grant execute on function public.update_progression_badge(uuid,uuid,text,text,text)
  to authenticated, service_role;
grant execute on function public.delete_progression_badge(uuid,uuid)
  to authenticated, service_role;
grant execute on function public.update_progression_collection(uuid,uuid,text,text)
  to authenticated, service_role;
grant execute on function public.delete_progression_collection(uuid,uuid)
  to authenticated, service_role;
grant execute on function public.update_progression_collection_item(
  uuid,uuid,text,text,text,integer
) to authenticated, service_role;
grant execute on function public.delete_progression_collection_item(uuid,uuid)
  to authenticated, service_role;
grant execute on function public.update_progression_mission(
  uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid,boolean
) to authenticated, service_role;
grant execute on function public.delete_progression_mission(uuid,uuid)
  to authenticated, service_role;
grant execute on function public.update_progression_chest(
  uuid,uuid,text,text,integer,uuid[],boolean
) to authenticated, service_role;
grant execute on function public.delete_progression_chest(uuid,uuid)
  to authenticated, service_role;
grant execute on function public.player_progression_archive(text,uuid)
  to service_role;

-- org_progression_snapshot reste volontairement gardé par is_org_member :
-- sa charge utile ne contient aucun secret ni aucun identifiant joueur, et
-- player_progression_snapshot sert DÉJÀ la même configuration (missions,
-- règles, badges, collections, prix des coffres) à n'importe quel joueur.
-- Un caissier y lit strictement moins qu'un visiteur ; seuls les agrégats
-- s'ajoutent, et le projet les ouvre déjà à l'équipe (org_prize_funnel).
