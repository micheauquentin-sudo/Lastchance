-- ============================================================
-- LastChance — méta-progression : suites de la revue de sécurité.
--
-- Correctif ADDITIF de 20260805200000 + 20260805210000.
--   M2  garde réelle de org_progression_snapshot, et surtout : le
--       commentaire qui la justifiait était FAUX ;
--   M3  interrupteur d'arrêt d'une mission / d'un coffre sur saison
--       lancée, sans toucher aux règles ni aux dotations ;
--   F1  la relecture d'idempotence d'un coffre ignorait chest_id ;
--   F4  une saison expirée non close disparaissait des deux vues ;
--   F5  40001 / 40P01 perdaient définitivement une contribution ;
--   F3  le journal moteur ignorait data_retention_months ;
--   +2 INFO : rotation de loot_seed, et retrait du mode d'emploi du
--       meulage de la charge utile joueur.
--
-- Une contrainte d'unicité est REMPLACÉE (élargie de 2 à 3 colonnes,
-- section 1) : aucune ligne n'est détruite, aucune garde n'est levée.
-- ============================================================

-- ============================================================
-- 1. F1 — un coffre ne rend plus le butin d'un autre
-- ============================================================
-- La relecture d'idempotence filtrait sur (player_season_id, request_id)
-- SANS chest_id : ouvrir le coffre A avec R puis rappeler avec le coffre B
-- et le même R rendait « idempotent: true » et l'objet du coffre A, pour un
-- coffre B jamais ouvert. Aucun gain créé, mais un état incohérent
-- atteignable depuis un client fabriqué.
--
-- L'index élargi est posé AVANT le retrait de l'ancienne contrainte : il
-- n'existe aucun instant où l'unicité ne protège pas la table.
create unique index if not exists progression_chest_openings_request_idx
  on public.progression_chest_openings
    (player_season_id, chest_id, request_id);

do $$
declare
  v_name text;
begin
  select con.conname
    into v_name
    from pg_catalog.pg_constraint con
   where con.conrelid = 'public.progression_chest_openings'::regclass
     and con.contype = 'u'
     and pg_catalog.array_length(con.conkey, 1) = 2
     and (
       select pg_catalog.array_agg(att.attname::text order by att.attname)
         from pg_catalog.pg_attribute att
        where att.attrelid = con.conrelid
          and att.attnum = any (con.conkey)
     ) = array['player_season_id', 'request_id']
   limit 1;
  if v_name is not null then
    execute pg_catalog.format(
      'alter table public.progression_chest_openings drop constraint %I',
      v_name
    );
  end if;
end;
$$;

comment on index public.progression_chest_openings_request_idx is
  'Idempotence par (joueur, COFFRE, request_id). Le chest_id est porteur : sans lui, un request_id rejoué sur un autre coffre rendait le butin du premier.';

-- ============================================================
-- 2. F3 — le journal moteur suit la rétention de l'organisation
-- ============================================================
-- Deux corrections. La trace ne recopie plus player_id : un journal
-- d'exploitation n'a pas besoin d'identité, mission_id et
-- analytics_event_id suffisent au diagnostic. Et sa fenêtre de rétention
-- s'aligne sur data_retention_months au lieu d'un 90 jours en dur, qui
-- gardait des données 90 jours chez une organisation en déclarant 1 mois.
comment on column public.progression_engine_failures.player_id is
  'CONSERVÉE POUR COMPATIBILITÉ, PLUS JAMAIS ÉCRITE depuis 20260805220000. Un journal d''exploitation ne porte pas d''identité joueur.';

-- ============================================================
-- 3. F5 + F3 — moteur : une contention se retente, puis se trace
-- ============================================================
-- Le gestionnaire par mission attrapait aussi serialization_failure et
-- deadlock_detected : sous contention, la contribution était perdue pour
-- de bon. Elle est désormais retentée UNE fois avant d'être tracée.
--
-- Réserve assumée : en READ COMMITTED (le mode de PostgREST) un 40P01 se
-- retente utilement, le verrou étant relâché. Sous REPEATABLE READ ou
-- SERIALIZABLE, un 40001 est acté au niveau de la transaction : la
-- seconde tentative échouera aussi, et la trace sera écrite comme avant.
--
-- La structure évite tout EXIT / CONTINUE traversant un bloc à
-- gestionnaire d'exception : la boucle de tentatives est pilotée par un
-- drapeau.
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
  v_attempt integer;
  v_settled boolean;
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
    v_attempt := 0;
    v_settled := false;
    while not v_settled and v_attempt < 2 loop
      v_attempt := v_attempt + 1;
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
        v_settled := true;
      exception
        when serialization_failure or deadlock_detected then
          get stacked diagnostics
            v_sqlstate = returned_sqlstate,
            v_message = message_text;
          if v_attempt >= 2 then
            begin
              insert into public.progression_engine_failures (
                organization_id,
                season_id,
                mission_id,
                analytics_event_id,
                sqlstate,
                message
              ) values (
                new.organization_id,
                v_mission.season_id,
                v_mission.mission_id,
                new.id,
                v_sqlstate,
                pg_catalog.left(coalesce(v_message, ''), 500)
              );
            exception
              when others then
                null;
            end;
            raise log 'meta progression: mission % lost to contention (% %)',
              v_mission.mission_id, v_sqlstate, v_message;
            v_settled := true;
          end if;
        when others then
          get stacked diagnostics
            v_sqlstate = returned_sqlstate,
            v_message = message_text;
          begin
            insert into public.progression_engine_failures (
              organization_id,
              season_id,
              mission_id,
              analytics_event_id,
              sqlstate,
              message
            ) values (
              new.organization_id,
              v_mission.season_id,
              v_mission.mission_id,
              new.id,
              v_sqlstate,
              pg_catalog.left(coalesce(v_message, ''), 500)
            );
          exception
            when others then
              null;
          end;
          raise log 'meta progression: mission % skipped (% %)',
            v_mission.mission_id, v_sqlstate, v_message;
          v_settled := true;
      end;
    end loop;
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
        organization_id, analytics_event_id, sqlstate, message
      ) values (
        new.organization_id,
        new.id,
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
-- 4. F1 — ouverture de coffre : relecture scopée au coffre
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

  -- chest_id est porteur de la relecture : un request_id rejoué sur un
  -- AUTRE coffre est une nouvelle ouverture, pas un rejeu.
  select *
    into v_opening
    from public.progression_chest_openings
   where player_season_id = v_player_season.id
     and chest_id = v_chest.id
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
-- 5. INFO — la charge utile joueur cesse d'être un mode d'emploi
-- ============================================================
-- player_progression_snapshot servait event_name et experience_kinds au
-- joueur alors qu'aucun écran ne les affiche : c'était la recette exacte
-- du meulage d'une mission. Retirés. Le reste est inchangé.
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
          'key_reward', mission.key_reward
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

-- ============================================================
-- 6. F4 — une saison expirée non close reste lisible par le joueur
-- ============================================================
-- Le snapshot exige ends_at > now(), l'archive exigeait ended/archived :
-- entre la fin de fenêtre et l'action du commerçant, les badges du joueur
-- s'effaçaient de son écran. L'archive prend désormais aussi les saisons
-- encore 'active' dont la fenêtre est passée.
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
       and (
         season.status in ('ended', 'archived')
         or (
           season.status = 'active'
           and season.ends_at <= pg_catalog.now()
         )
       )
    ) archived;

  return pg_catalog.jsonb_build_object('seasons', v_seasons);
end;
$$;

-- ============================================================
-- 7. M2 — garde de l'agrégat commerçant, et commentaire HONNÊTE
-- ============================================================
-- LE COMMENTAIRE PRÉCÉDENT ÉTAIT FAUX. Il affirmait qu'un caissier « lit
-- strictement moins qu'un visiteur, puisque player_progression_snapshot
-- sert déjà la même configuration ». La revue de sécurité l'a infirmé sur
-- quatre points, tous vérifiables dans 20260805200000 :
--   - saisons : le visiteur ne voit que l'active ET démarrée (:1167-1170),
--     l'agrégat rendait TOUTES les saisons, brouillons compris — donc la
--     saison en préparation, non lancée (:1615-1616) ;
--   - missions : visiteur filtré par `and mission.enabled` (:1218),
--     l'agrégat sans aucun filtre (:1558-1562) ;
--   - coffres : même écart (:1294 contre :1609-1610) ;
--   - agrégats players / missions_completed / keys_earned /
--     chests_opened (:1516-1535), que le visiteur n'a jamais.
-- Un caissier saisonnier sur un poste partagé lisait donc les noms de
-- missions, les paliers, les dotations en clés et les coffres d'une saison
-- non lancée, plus les volumes d'engagement de l'enseigne.
--
-- Tranché : la branche `summary` reste ouverte à l'ÉQUIPE (volumes
-- d'engagement, cohérent avec org_prize_funnel) ; la branche `seasons`,
-- qui est la CONFIGURATION, passe à is_org_editor. Un non-éditeur reçoit
-- une liste vide et le drapeau can_configure à false : l'appelant peut
-- distinguer « rien de configuré » de « pas le droit de voir ».
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
  v_can_configure boolean;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(p_organization_id)
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_can_configure := coalesce(auth.role(), '') = 'service_role'
    or public.is_org_editor(p_organization_id);
  select pg_catalog.jsonb_build_object(
    'can_configure', v_can_configure,
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
    'seasons', case when not v_can_configure then '[]'::jsonb else coalesce((
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
          -- loot_seed n'est JAMAIS servi : ni ici, ni au joueur.
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
    ), '[]'::jsonb) end
  ) into v_result;
  return v_result;
end;
$$;

-- ============================================================
-- 8. F3 — purge : le journal moteur suit la rétention déclarée
-- ============================================================
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

  -- Sous-requête corrélée plutôt qu'une jointure : une trace dont
  -- l'organisation a disparu doit être trimée elle aussi, au plafond.
  delete from public.progression_engine_failures failures
   where failures.failed_at < pg_catalog.now()
     - pg_catalog.make_interval(
         months => least(
           greatest(
             coalesce((
               select organization.data_retention_months
                 from public.organizations organization
                where organization.id = failures.organization_id
             ), 24),
             1
           ),
           24
         )
       );

  return v_deleted;
end;
$$;

-- ============================================================
-- 9. INFO — le remplacement du butin fait tourner la graine
-- ============================================================
-- Sans conséquence aujourd'hui (le butin ne change qu'en brouillon, où
-- aucune ouverture n'existe), mais définitif le jour d'une exposition de
-- la graine : un butin neuf mérite une graine neuve.
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
    or pg_catalog.coalesce(pg_catalog.array_length(p_item_ids, 1), 0)
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
         enabled = coalesce(p_enabled, true),
         loot_seed = gen_random_uuid()
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

-- ============================================================
-- 10. M3 — interrupteur d'arrêt sur une saison LANCÉE
-- ============================================================
-- Il n'existait aucun moyen d'arrêter une mission ou un coffre en cours :
-- update_progression_mission et update_progression_chest sont bornées au
-- brouillon, donc `enabled` l'était aussi. Une mission publiée avec un
-- palier trop généreux (target 1, key_reward 100, sans
-- distinct_experiences) ne pouvait être stoppée qu'en clôturant TOUTE la
-- saison, ce qui bascule chaque joueur sur son archive.
--
-- Ces deux RPC ne touchent QUE `enabled`. Aucune règle, aucune dotation,
-- aucun libellé : la promesse faite aux joueurs en cours de saison reste
-- intacte, seule sa distribution s'arrête. Les deux sont journalisées :
-- couper une mécanique en direct est une décision, pas un réglage.
create or replace function public.set_progression_mission_enabled(
  p_organization_id uuid,
  p_mission_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_season_status text;
  v_previous boolean;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'invalid mission' using errcode = '22023';
  end if;
  select mission.season_id, season.status, mission.enabled
    into v_season_id, v_season_status, v_previous
    from public.progression_missions mission
    join public.progression_seasons season
      on season.id = mission.season_id
     and season.organization_id = mission.organization_id
   where mission.id = p_mission_id
     and mission.organization_id = p_organization_id
     and season.status in ('draft', 'active');
  if v_season_id is null then
    raise exception 'open mission not found';
  end if;
  update public.progression_missions
     set enabled = p_enabled,
         updated_at = pg_catalog.now()
   where id = p_mission_id
     and organization_id = p_organization_id;
  if v_previous is distinct from p_enabled then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (
      p_organization_id,
      case when auth.role() = 'service_role'
        then 'system' else coalesce(auth.uid()::text, 'system') end,
      'progression.mission.enabled',
      pg_catalog.jsonb_build_object(
        'mission_id', p_mission_id,
        'season_id', v_season_id,
        'season_status', v_season_status,
        'previous', v_previous,
        'enabled', p_enabled
      )
    );
  end if;
  return true;
end;
$$;

create or replace function public.set_progression_chest_enabled(
  p_organization_id uuid,
  p_chest_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season_id uuid;
  v_season_status text;
  v_previous boolean;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'invalid chest' using errcode = '22023';
  end if;
  select chest.season_id, season.status, chest.enabled
    into v_season_id, v_season_status, v_previous
    from public.progression_chests chest
    join public.progression_seasons season
      on season.id = chest.season_id
     and season.organization_id = chest.organization_id
   where chest.id = p_chest_id
     and chest.organization_id = p_organization_id
     and season.status in ('draft', 'active');
  if v_season_id is null then
    raise exception 'open chest not found';
  end if;
  update public.progression_chests
     set enabled = p_enabled
   where id = p_chest_id
     and organization_id = p_organization_id;
  if v_previous is distinct from p_enabled then
    insert into public.audit_logs (organization_id, actor, action, metadata)
    values (
      p_organization_id,
      case when auth.role() = 'service_role'
        then 'system' else coalesce(auth.uid()::text, 'system') end,
      'progression.chest.enabled',
      pg_catalog.jsonb_build_object(
        'chest_id', p_chest_id,
        'season_id', v_season_id,
        'season_status', v_season_status,
        'previous', v_previous,
        'enabled', p_enabled
      )
    );
  end if;
  return true;
end;
$$;

-- ============================================================
-- 11. M3 (suite) — sort de la branche « mission already has player
--     progress » de delete_progression_mission
-- ============================================================
-- Cette branche est INATTEIGNABLE par construction : la suppression exige
-- une saison 'draft', et une saison brouillon n'a aucun état joueur (le
-- moteur n'accepte que 'active', l'ouverture de coffre aussi). Elle est
-- CONSERVÉE volontairement — comme garde-fou si un futur chemin
-- réintroduisait un retour vers 'draft' ou si une reprise de données
-- créait des lignes de progression — mais son message ne doit plus servir
-- de base à un conseil d'interface : le vrai refus qu'un commerçant
-- rencontre est 'draft mission not found', et la réponse à lui donner est
-- désormais set_progression_mission_enabled(..., false).
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
  -- Garde-fou inatteignable aujourd'hui : voir le commentaire ci-dessus.
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

-- ============================================================
-- 12. ACL des deux nouvelles RPC
-- ============================================================
revoke all on function public.set_progression_mission_enabled(uuid,uuid,boolean)
  from public, anon;
revoke all on function public.set_progression_chest_enabled(uuid,uuid,boolean)
  from public, anon;

grant execute on function public.set_progression_mission_enabled(uuid,uuid,boolean)
  to authenticated, service_role;
grant execute on function public.set_progression_chest_enabled(uuid,uuid,boolean)
  to authenticated, service_role;
