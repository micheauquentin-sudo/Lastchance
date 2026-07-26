-- ============================================================
-- Méta-progression multi-expériences
-- (20260805200000 + correctif de cycle de vie 20260805210000)
--
-- Ce fichier a UN sujet principal : la progression est un état SERVEUR,
-- dérivé du seul journal `experience_events`, et CLOISONNÉ par
-- organisation. Rien ici n'est écrit par un client, rien n'est lisible
-- directement — ni par un visiteur, ni par un commerçant.
--
-- L'ordre des sections suit cette priorité :
--   (a) structure, RLS et ACL de table des 15 tables progression_* ;
--   (b) ACL déclarées des 27 RPC exposées ;
--   (c) garde éditeur réelle des RPC de configuration ;
--   (d) activation de saison et immutabilité d'une saison active ;
--   (e) le moteur (trigger -> apply_meta_progression_event), dont
--       l'ISOLATION D'ERREUR mission par mission ;
--   (f) ouverture de coffre : débit réel, idempotence par request_id,
--       butin salé donc non forgeable ;
--   (g) lectures gardées (joueur / commerçant) ;
--   (h) cycle de vie : clore, archiver, ENCHAÎNER UNE SAISON 2, et
--       garder lisible ce que le joueur a déjà gagné ;
--   (i) INVARIANT PRODUIT : ce module n'émet AUCUN code de caisse ;
--   (j) purge RGPD : les états joueurs partent, la configuration reste ;
--   (k) édition et suppression, bornées à une saison brouillon ;
--   (l) cascade tenant.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ── Terrain : deux organisations étanches ────────────────────
insert into public.organizations (id, name, slug, data_retention_months) values
  ('9c000000-0000-4000-8000-000000000001', 'Progression A', 'tap-meta-a', 12),
  ('9c000000-0000-4000-8000-000000000002', 'Progression B', 'tap-meta-b', 12);

insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at
) values
  ('9c000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
   'owner-a@tapmeta.local', '', now(), now()),
  ('9c000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated',
   'cashier-a@tapmeta.local', '', now(), now()),
  ('9c000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated',
   'owner-b@tapmeta.local', '', now(), now());

insert into public.organization_members (organization_id, user_id, role) values
  ('9c000000-0000-4000-8000-000000000001',
   '9c000000-0000-4000-8000-0000000000a1', 'owner'),
  -- Membre RÉEL de l'organisation A, mais NON éditeur : c'est lui qui
  -- prouve que la garde des 7 RPC de configuration est `is_org_editor`
  -- et non `is_org_member`.
  ('9c000000-0000-4000-8000-000000000001',
   '9c000000-0000-4000-8000-0000000000a2', 'cashier'),
  ('9c000000-0000-4000-8000-000000000002',
   '9c000000-0000-4000-8000-0000000000b1', 'owner');

insert into public.campaigns (id, organization_id, name, status) values
  ('9c000000-0000-4000-8000-000000000011',
   '9c000000-0000-4000-8000-000000000001', 'Roue A1', 'active'),
  ('9c000000-0000-4000-8000-000000000012',
   '9c000000-0000-4000-8000-000000000001', 'Roue A2', 'active'),
  ('9c000000-0000-4000-8000-000000000013',
   '9c000000-0000-4000-8000-000000000002', 'Roue B1', 'active');

-- Identités pseudonymes (migration 140000). Aucune PII.
insert into public.players (id) values
  ('9c000000-0000-4000-8000-0000000000f1'),
  ('9c000000-0000-4000-8000-0000000000f2');

insert into public.player_devices (id, player_id, token_hash) values
  ('9c000000-0000-4000-8000-0000000000d1',
   '9c000000-0000-4000-8000-0000000000f1', repeat('a', 64)),
  ('9c000000-0000-4000-8000-0000000000d2',
   '9c000000-0000-4000-8000-0000000000f2', repeat('b', 64));

-- Le joueur 2 adhère aux DEUX organisations : le cloisonnement testé
-- plus bas n'est donc pas un simple effet de bord d'un joueur absent.
insert into public.player_organization_memberships
  (id, player_id, organization_id)
values
  ('9c000000-0000-4000-8000-0000000000c1',
   '9c000000-0000-4000-8000-0000000000f1',
   '9c000000-0000-4000-8000-000000000001'),
  ('9c000000-0000-4000-8000-0000000000c2',
   '9c000000-0000-4000-8000-0000000000f2',
   '9c000000-0000-4000-8000-000000000002'),
  ('9c000000-0000-4000-8000-0000000000c3',
   '9c000000-0000-4000-8000-0000000000f2',
   '9c000000-0000-4000-8000-000000000001');

-- Les 15 tables du module, énumérées une fois pour les balayages d'ACL.
create temporary table tap_progression_tables (name text primary key)
  on commit drop;
insert into tap_progression_tables (name) values
  ('progression_engine_failures'),
  ('progression_seasons'),
  ('progression_badges'),
  ('progression_collections'),
  ('progression_collection_items'),
  ('progression_missions'),
  ('progression_mission_versions'),
  ('progression_player_seasons'),
  ('progression_mission_progress'),
  ('progression_mission_contributions'),
  ('progression_player_badges'),
  ('progression_player_items'),
  ('progression_chests'),
  ('progression_chest_items'),
  ('progression_chest_openings');

-- Les 28 fonctions du module (27 exposées + le corps du trigger).
create temporary table tap_progression_functions (sig text primary key)
  on commit drop;
insert into tap_progression_functions (sig) values
  ('public.apply_meta_progression_event()'),
  ('public.create_progression_season(uuid,text,timestamptz,timestamptz)'),
  ('public.create_progression_badge(uuid,uuid,text,text,text)'),
  ('public.create_progression_collection(uuid,uuid,text,text)'),
  ('public.create_progression_collection_item(uuid,uuid,text,text,text)'),
  ('public.create_progression_mission(uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid)'),
  ('public.create_progression_chest(uuid,uuid,text,text,integer,uuid[])'),
  ('public.activate_progression_season(uuid,uuid)'),
  ('public.player_progression_snapshot(text,uuid)'),
  ('public.open_progression_chest(text,uuid,uuid,uuid)'),
  ('public.org_progression_snapshot(uuid)'),
  ('public.purge_expired_meta_progression()'),
  -- Correctif 20260805210000.
  ('public.end_progression_season(uuid,uuid)'),
  ('public.archive_progression_season(uuid,uuid)'),
  ('public.delete_progression_season(uuid,uuid)'),
  ('public.player_progression_archive(text,uuid)'),
  ('public.update_progression_badge(uuid,uuid,text,text,text)'),
  ('public.delete_progression_badge(uuid,uuid)'),
  ('public.update_progression_collection(uuid,uuid,text,text)'),
  ('public.delete_progression_collection(uuid,uuid)'),
  ('public.update_progression_collection_item(uuid,uuid,text,text,text,integer)'),
  ('public.delete_progression_collection_item(uuid,uuid)'),
  ('public.update_progression_mission(uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid,boolean)'),
  ('public.delete_progression_mission(uuid,uuid)'),
  ('public.update_progression_chest(uuid,uuid,text,text,integer,uuid[],boolean)'),
  ('public.delete_progression_chest(uuid,uuid)'),
  -- Correctif 20260805220000 : interrupteur d'arrêt sur saison lancée.
  ('public.set_progression_mission_enabled(uuid,uuid,boolean)'),
  ('public.set_progression_chest_enabled(uuid,uuid,boolean)');

-- ══════════════════════════════════════════════════════════════
-- (a) Structure, RLS et ACL de table des 15 tables
-- ══════════════════════════════════════════════════════════════
select is(
  (select count(*)::integer from tap_progression_tables t
    where (
      select c.relrowsecurity from pg_catalog.pg_class c
       where c.oid = ('public.' || t.name)::regclass
    )),
  15,
  'la RLS est active sur les 15 tables de méta-progression'
);

-- SENTINELLE CENTRALE, vérifiée sur les policies RÉELLEMENT installées :
-- aucune policy de ce module ne s'applique à anon ni à public. Une future
-- policy « progression publique » ferait tomber ce test — c'est le but.
select is(
  (select count(*)::integer from pg_policies p
     join tap_progression_tables t on t.name = p.tablename
    where p.schemaname = 'public'
      and (
        'anon' = any (p.roles::text[])
        or 'public' = any (p.roles::text[])
      )),
  0,
  'aucune policy de méta-progression n''est ouverte à anon ou public'
);

-- Choix de conception assumé : le module est intégralement servi par RPC.
-- Les 15 tables sont donc RLS-active SANS AUCUNE policy (deny-all pour
-- tout rôle non propriétaire). Ce test documente ce choix : voir apparaître
-- une policy impose de ré-auditer le cloisonnement.
select is(
  (select count(*)::integer from pg_policies p
     join tap_progression_tables t on t.name = p.tablename
    where p.schemaname = 'public'),
  0,
  'les 15 tables sont RPC-only : aucune policy directe n''existe'
);

select is(
  (select count(*)::integer from tap_progression_tables t
    where has_table_privilege('anon', 'public.' || t.name, 'SELECT')
       or has_table_privilege('anon', 'public.' || t.name, 'INSERT')
       or has_table_privilege('anon', 'public.' || t.name, 'UPDATE')
       or has_table_privilege('anon', 'public.' || t.name, 'DELETE')),
  0,
  'anon n''a aucun privilège sur les 15 tables de méta-progression'
);

select is(
  (select count(*)::integer from tap_progression_tables t
    where has_table_privilege('authenticated', 'public.' || t.name, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || t.name, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || t.name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || t.name, 'DELETE')),
  0,
  'aucune session marchande ne lit ni n''écrit directement la progression'
);

select is(
  (select count(*)::integer from tap_progression_tables t
    where has_table_privilege('service_role', 'public.' || t.name, 'SELECT')),
  15,
  'le service role diagnostique les 15 tables'
);

select is(
  (select count(*)::integer from tap_progression_tables t
    where has_table_privilege('service_role', 'public.' || t.name, 'INSERT')
       or has_table_privilege('service_role', 'public.' || t.name, 'UPDATE')
       or has_table_privilege('service_role', 'public.' || t.name, 'DELETE')),
  0,
  'le service role lui-même n''écrit la progression que par RPC'
);

-- Le cloisonnement tenant est structurel : 14 tables portent
-- organization_id. progression_mission_contributions est la seule
-- exception — elle est rattachée par FK COMPOSITE à sa ligne de
-- progression, qui porte l'organisation.
select is(
  (select count(*)::integer from tap_progression_tables t
     join pg_catalog.pg_attribute a
       on a.attrelid = ('public.' || t.name)::regclass
    where a.attname = 'organization_id'
      and a.attnum > 0
      and not a.attisdropped),
  14,
  '14 des 15 tables portent organization_id'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.progression_mission_contributions'::regclass
       and contype = 'f'
       and pg_catalog.pg_get_constraintdef(oid)
         ilike '%(progress_id, player_season_id)%'
  ),
  'les contributions sont rattachées par FK composite à leur progression'
);

-- Le journal de panne du moteur est écrit DEPUIS un gestionnaire
-- d'exception : la moindre contrainte le ferait échouer au moment où il
-- est le plus utile. Il n'a donc ni clé étrangère ni CHECK.
select is(
  (select count(*)::integer from pg_catalog.pg_constraint
    where conrelid = 'public.progression_engine_failures'::regclass
      and contype in ('f', 'c')),
  0,
  'la trace des pannes du moteur n''a ni FK ni CHECK qui puisse la bloquer'
);

-- Correctif 20260805210000 : les deux références de mission passent de
-- ON DELETE RESTRICT (vérifié immédiatement, donc incompatible avec une
-- cascade de saison ou d'organisation) à NO ACTION (vérifié en fin
-- d'instruction). Le refus d'orphelin est conservé.
select is(
  (select count(*)::integer from pg_catalog.pg_constraint
    where conrelid = 'public.progression_missions'::regclass
      and conname in (
        'progression_missions_badge_fk',
        'progression_missions_collection_item_fk'
      )
      and contype = 'f'
      and confdeltype = 'a'),
  2,
  'les références badge et objet de mission sont en NO ACTION, pas RESTRICT'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
     where schemaname = 'public'
       and tablename = 'progression_seasons'
       and indexname = 'progression_seasons_one_active_org_idx'
       and indexdef ilike '%unique%'
       and indexdef ilike '%status%'
  ),
  'un index unique partiel interdit deux saisons actives dans une organisation'
);
-- F1 (20260805220000) : l'unicité porte sur le COFFRE, pas seulement sur
-- le request_id. Sans chest_id, un request_id rejoué sur un autre coffre
-- était lu comme un rejeu et rendait le butin du premier.
select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
     where schemaname = 'public'
       and tablename = 'progression_chest_openings'
       and indexname = 'progression_chest_openings_request_idx'
       and indexdef ilike '%unique%'
       and indexdef ilike '%player_season_id, chest_id, request_id%'
  ),
  'une ouverture de coffre est unique par (joueur, COFFRE, request_id)'
);
select is(
  (select count(*)::integer from pg_catalog.pg_constraint con
    where con.conrelid = 'public.progression_chest_openings'::regclass
      and con.contype = 'u'
      and pg_catalog.array_length(con.conkey, 1) = 2
      and (
        select pg_catalog.array_agg(att.attname::text order by att.attname)
          from pg_catalog.pg_attribute att
         where att.attrelid = con.conrelid
           and att.attnum = any (con.conkey)
      ) = array['player_season_id', 'request_id']),
  0,
  'l''ancienne unicité à deux colonnes est retirée : elle bloquait le cas légitime'
);
-- F5 : la contention n'est plus confondue avec une erreur métier.
select ok(
  pg_catalog.pg_get_functiondef(
    'public.apply_meta_progression_event()'::regprocedure
  ) like '%serialization_failure%'
    and pg_catalog.pg_get_functiondef(
      'public.apply_meta_progression_event()'::regprocedure
    ) like '%deadlock_detected%',
  'F5 : le moteur reconnaît la contention et la retente avant de la tracer'
);
-- F3 : la trace d'exploitation ne recopie plus d'identité joueur. La
-- preuve est comportementale, en section (h), sur la ligne réellement
-- écrite ; ici on constate que la colonne demeure pour compatibilité.
select ok(
  exists (
    select 1 from pg_catalog.pg_attribute
     where attrelid = 'public.progression_engine_failures'::regclass
       and attname = 'player_id'
       and not attnotnull
  ),
  'la colonne player_id du journal moteur reste nullable, donc jamais requise'
);
select has_trigger(
  'public',
  'experience_events',
  'experience_events_meta_progression',
  'le moteur est branché sur le journal analytics serveur'
);
select is(
  (select count(*)::integer from tap_progression_functions f
    where pg_catalog.to_regprocedure(f.sig) is not null),
  28,
  'les 28 fonctions du module existent avec la signature attendue'
);
-- Le sel de tirage est posé par la base et distinct par coffre.
select ok(
  (select attnotnull from pg_catalog.pg_attribute
    where attrelid = 'public.progression_chests'::regclass
      and attname = 'loot_seed'),
  'le sel de tirage de butin est obligatoire sur chaque coffre'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.open_progression_chest(text,uuid,uuid,uuid)'::regprocedure
  ) like '%loot_seed%',
  'le tirage de butin fait intervenir le sel serveur'
);

-- Comportement RÉEL sous le rôle marchand : la table n'existe pas.
set local role authenticated;
select throws_ok(
  $$select count(*) from public.progression_seasons$$,
  '42501', 'permission denied for table progression_seasons',
  'un commerçant ne lit pas la configuration de progression en direct'
);
select throws_ok(
  $$select count(*) from public.progression_player_seasons$$,
  '42501', 'permission denied for table progression_player_seasons',
  'un commerçant ne lit pas l''état de progression des joueurs'
);
set local role anon;
select throws_ok(
  $$select count(*) from public.progression_missions$$,
  '42501', 'permission denied for table progression_missions',
  'un visiteur ne lit pas les missions'
);
select throws_ok(
  $$select count(*) from public.progression_chest_openings$$,
  '42501', 'permission denied for table progression_chest_openings',
  'un visiteur ne lit pas les ouvertures de coffre'
);
reset role;

-- ══════════════════════════════════════════════════════════════
-- (b) ACL déclarées des 27 RPC exposées
-- ══════════════════════════════════════════════════════════════
-- Les 7 RPC de configuration : session marchande + serveur, jamais anon.
select ok(
  has_function_privilege('authenticated',
    'public.create_progression_season(uuid,text,timestamptz,timestamptz)', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.create_progression_season(uuid,text,timestamptz,timestamptz)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.create_progression_season(uuid,text,timestamptz,timestamptz)', 'EXECUTE'),
  'create_progression_season : marchand + serveur, jamais anon'
);
select ok(
  has_function_privilege('authenticated',
    'public.create_progression_badge(uuid,uuid,text,text,text)', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.create_progression_badge(uuid,uuid,text,text,text)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.create_progression_badge(uuid,uuid,text,text,text)', 'EXECUTE'),
  'create_progression_badge : marchand + serveur, jamais anon'
);
select ok(
  has_function_privilege('authenticated',
    'public.create_progression_collection(uuid,uuid,text,text)', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.create_progression_collection(uuid,uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.create_progression_collection(uuid,uuid,text,text)', 'EXECUTE'),
  'create_progression_collection : marchand + serveur, jamais anon'
);
select ok(
  has_function_privilege('authenticated',
    'public.create_progression_collection_item(uuid,uuid,text,text,text)', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.create_progression_collection_item(uuid,uuid,text,text,text)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.create_progression_collection_item(uuid,uuid,text,text,text)', 'EXECUTE'),
  'create_progression_collection_item : marchand + serveur, jamais anon'
);
select ok(
  has_function_privilege('authenticated',
    'public.create_progression_mission(uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.create_progression_mission(uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.create_progression_mission(uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid)', 'EXECUTE'),
  'create_progression_mission : marchand + serveur, jamais anon'
);
select ok(
  has_function_privilege('authenticated',
    'public.create_progression_chest(uuid,uuid,text,text,integer,uuid[])', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.create_progression_chest(uuid,uuid,text,text,integer,uuid[])', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.create_progression_chest(uuid,uuid,text,text,integer,uuid[])', 'EXECUTE'),
  'create_progression_chest : marchand + serveur, jamais anon'
);
select ok(
  has_function_privilege('authenticated',
    'public.activate_progression_season(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.activate_progression_season(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.activate_progression_season(uuid,uuid)', 'EXECUTE'),
  'activate_progression_season : marchand + serveur, jamais anon'
);
select ok(
  has_function_privilege('authenticated',
    'public.org_progression_snapshot(uuid)', 'EXECUTE')
    and has_function_privilege('service_role',
      'public.org_progression_snapshot(uuid)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.org_progression_snapshot(uuid)', 'EXECUTE'),
  'org_progression_snapshot : agrégat marchand gardé en interne, jamais anon'
);

-- Les 3 RPC joueur/serveur : service_role SEULE.
select ok(
  has_function_privilege('service_role',
    'public.player_progression_snapshot(text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.player_progression_snapshot(text,uuid)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.player_progression_snapshot(text,uuid)', 'EXECUTE'),
  'player_progression_snapshot est exclusivement serveur'
);
select ok(
  has_function_privilege('service_role',
    'public.open_progression_chest(text,uuid,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.open_progression_chest(text,uuid,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.open_progression_chest(text,uuid,uuid,uuid)', 'EXECUTE'),
  'open_progression_chest est exclusivement serveur'
);
select ok(
  has_function_privilege('service_role',
    'public.purge_expired_meta_progression()', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.purge_expired_meta_progression()', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.purge_expired_meta_progression()', 'EXECUTE'),
  'purge_expired_meta_progression est exclusivement serveur'
);

-- Les deux fonctions internes ne sont appelables par PERSONNE, pas même
-- par le service role : leur SECURITY DEFINER contournerait la RLS.
select ok(
  not has_function_privilege('anon',
    'public.is_valid_progression_rule(jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.is_valid_progression_rule(jsonb)', 'EXECUTE')
    and not has_function_privilege('service_role',
      'public.is_valid_progression_rule(jsonb)', 'EXECUTE'),
  'le validateur de règle n''est appelable par aucun rôle'
);
select ok(
  not has_function_privilege('anon',
    'public.apply_meta_progression_event()', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.apply_meta_progression_event()', 'EXECUTE')
    and not has_function_privilege('service_role',
      'public.apply_meta_progression_event()', 'EXECUTE'),
  'le moteur n''est déclenchable que par son trigger'
);

-- Les 15 RPC d'édition et de cycle de vie (20260805210000 + 220000).
create temporary table tap_progression_editor_rpc (sig text primary key)
  on commit drop;
insert into tap_progression_editor_rpc (sig) values
  ('public.set_progression_mission_enabled(uuid,uuid,boolean)'),
  ('public.set_progression_chest_enabled(uuid,uuid,boolean)'),
  ('public.end_progression_season(uuid,uuid)'),
  ('public.archive_progression_season(uuid,uuid)'),
  ('public.delete_progression_season(uuid,uuid)'),
  ('public.update_progression_badge(uuid,uuid,text,text,text)'),
  ('public.delete_progression_badge(uuid,uuid)'),
  ('public.update_progression_collection(uuid,uuid,text,text)'),
  ('public.delete_progression_collection(uuid,uuid)'),
  ('public.update_progression_collection_item(uuid,uuid,text,text,text,integer)'),
  ('public.delete_progression_collection_item(uuid,uuid)'),
  ('public.update_progression_mission(uuid,uuid,text,text,text,integer,text[],integer,text,boolean,uuid,uuid,boolean)'),
  ('public.delete_progression_mission(uuid,uuid)'),
  ('public.update_progression_chest(uuid,uuid,text,text,integer,uuid[],boolean)'),
  ('public.delete_progression_chest(uuid,uuid)');

select is(
  (select count(*)::integer from tap_progression_editor_rpc f
    where has_function_privilege('authenticated', f.sig, 'EXECUTE')),
  15,
  'les 15 RPC d''édition sont appelables par une session marchande'
);
select is(
  (select count(*)::integer from tap_progression_editor_rpc f
    where has_function_privilege('service_role', f.sig, 'EXECUTE')),
  15,
  'les 15 RPC d''édition sont appelables par le serveur'
);
select is(
  (select count(*)::integer from tap_progression_editor_rpc f
    where has_function_privilege('anon', f.sig, 'EXECUTE')),
  0,
  'aucune RPC d''édition n''est ouverte à anon'
);
select ok(
  has_function_privilege('service_role',
    'public.player_progression_archive(text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.player_progression_archive(text,uuid)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.player_progression_archive(text,uuid)', 'EXECUTE'),
  'player_progression_archive est exclusivement serveur'
);

-- ══════════════════════════════════════════════════════════════
-- (c) Configuration : garde éditeur réelle et cloisonnement
-- ══════════════════════════════════════════════════════════════
create temporary table tap_meta (
  season_a uuid,
  season_empty uuid,
  badge_a uuid,
  collection_a uuid,
  item_a1 uuid,
  item_a2 uuid,
  item_a3 uuid,
  mission_starts uuid,
  mission_hunt uuid,
  mission_distinct uuid,
  mission_qr uuid,
  mission_return uuid,
  chest_a uuid,
  chest_rich uuid,
  season_b uuid,
  badge_b uuid,
  collection_b uuid,
  item_b uuid,
  mission_b uuid,
  -- Saison 2 (correctif 20260805210000) et isolation d'erreur du moteur.
  badge_s2 uuid,
  mission_s2_ok uuid,
  mission_s2_fail uuid,
  collection_s2 uuid,
  item_s2a uuid,
  chest_s2 uuid,
  -- Graine de butin capturée avant remplacement (INFO 20260805220000).
  seed_before uuid,
  -- Saison brouillon de rebut : édition et suppression.
  season_scrap uuid,
  badge_s uuid,
  collection_s uuid,
  item_s1 uuid,
  item_s2 uuid,
  mission_s uuid,
  chest_s uuid,
  -- Saison brouillon supprimée d'un bloc, références intactes.
  season_doomed uuid,
  badge_d uuid,
  collection_d uuid,
  item_d uuid,
  mission_d uuid
) on commit drop;
insert into tap_meta default values;

-- ── Contre-épreuve éditeur : le propriétaire de A configure sa saison ──
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);

update tap_meta set season_a = public.create_progression_season(
  '9c000000-0000-4000-8000-000000000001',
  'Saison A',
  now() - interval '1 day',
  now() + interval '30 days'
);
select ok((select season_a from tap_meta) is not null,
  'un éditeur crée une saison de progression');

-- Cette saison sert d'abord de brouillon SANS mission (refus d'activation
-- en section d), puis devient la SAISON 2 en section h. Sa fenêtre est donc
-- déjà ouverte : le moteur exige occurred_at dans [starts_at, ends_at[.
update tap_meta set season_empty = public.create_progression_season(
  '9c000000-0000-4000-8000-000000000001',
  'Saison 2',
  now() - interval '1 hour',
  now() + interval '60 days'
);

update tap_meta set badge_a = public.create_progression_badge(
  '9c000000-0000-4000-8000-000000000001',
  season_a,
  'Explorateur',
  'Trois expériences lancées',
  'trophy'
);
select ok((select badge_a from tap_meta) is not null,
  'un éditeur crée un badge sur sa saison brouillon');

update tap_meta set collection_a = public.create_progression_collection(
  '9c000000-0000-4000-8000-000000000001',
  season_a,
  'Vitrine de saison',
  'Trois objets à réunir'
);
select ok((select collection_a from tap_meta) is not null,
  'un éditeur crée une collection');

update tap_meta set item_a1 = public.create_progression_collection_item(
  '9c000000-0000-4000-8000-000000000001', collection_a, 'Fève');
update tap_meta set item_a2 = public.create_progression_collection_item(
  '9c000000-0000-4000-8000-000000000001', collection_a, 'Étoile');
update tap_meta set item_a3 = public.create_progression_collection_item(
  '9c000000-0000-4000-8000-000000000001', collection_a, 'Clé d''or');
select is(
  (select count(*)::integer from public.progression_collection_items
    where collection_id = (select collection_a from tap_meta)),
  3,
  'un éditeur remplit sa collection'
);
select results_eq(
  $$select item.position from public.progression_collection_items item
     where item.collection_id = (select collection_a from tap_meta)
     order by item.position$$,
  $$values (0), (1), (2)$$,
  'les objets reçoivent une position contiguë sans la recevoir du client'
);

-- Cinq missions : elles couvrent le nom d'événement, la cible, le filtre
-- de type d'expérience, le filtre de source et distinct_experiences.
update tap_meta set mission_starts = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000001',
  season_a,
  'Trois lancements',
  'Lancer trois fois une campagne',
  'experience_started',
  3,
  array['campaign']::text[],
  p_key_reward => 5,
  p_badge_id => badge_a
);
select ok((select mission_starts from tap_meta) is not null,
  'un éditeur crée une mission et sa règle version 1');
select is(
  (select count(*)::integer from public.progression_mission_versions
    where mission_id = (select mission_starts from tap_meta)
      and version = 1),
  1,
  'la règle est figée dans une version immuable'
);
select results_eq(
  $$select rule ->> 'version', rule ->> 'event_name', rule ->> 'target',
           rule ->> 'distinct_experiences', rule -> 'source' is null
      from public.progression_mission_versions
     where mission_id = (select mission_starts from tap_meta)$$,
  $$values ('1'::text, 'experience_started'::text, '3'::text, 'false'::text, true)$$,
  'une source absente est retirée de la règle, jamais stockée en null'
);

update tap_meta set mission_hunt = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000001',
  season_a,
  'Première chasse',
  'Lancer une chasse au trésor',
  'experience_started',
  1,
  array['hunt']::text[],
  p_key_reward => 3
);
update tap_meta set mission_distinct = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000001',
  season_a,
  'Deux campagnes distinctes',
  'Terminer deux campagnes DIFFÉRENTES',
  'experience_completed',
  2,
  array['campaign']::text[],
  p_distinct_experiences => true,
  p_collection_item_id => item_a1
);
update tap_meta set mission_qr = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000001',
  season_a,
  'Gain scanné',
  'Obtenir un lot depuis un QR',
  'reward_issued',
  1,
  array['campaign']::text[],
  p_key_reward => 2,
  p_source => 'qr'
);
update tap_meta set mission_return = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000001',
  season_a,
  'Fidèle',
  'Revenir deux fois',
  'player_returned',
  2,
  array['campaign']::text[]
);

update tap_meta set chest_a = public.create_progression_chest(
  '9c000000-0000-4000-8000-000000000001',
  season_a,
  'Coffre de saison',
  'Quatre clés',
  4,
  array[item_a1, item_a2, item_a3]
);
select ok((select chest_a from tap_meta) is not null,
  'un éditeur crée un coffre et sa table de butin');
select is(
  (select count(*)::integer from public.progression_chest_items
    where chest_id = (select chest_a from tap_meta)),
  3,
  'le butin du coffre est enregistré objet par objet'
);
update tap_meta set chest_rich = public.create_progression_chest(
  '9c000000-0000-4000-8000-000000000001',
  season_a,
  'Coffre hors de prix',
  'Cent clés',
  100,
  array[item_a2]
);

-- ── L'organisation B configure la sienne ──
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000b1"}',
  true);
update tap_meta set season_b = public.create_progression_season(
  '9c000000-0000-4000-8000-000000000002',
  'Saison B',
  now() - interval '1 day',
  now() + interval '30 days'
);
update tap_meta set badge_b = public.create_progression_badge(
  '9c000000-0000-4000-8000-000000000002', season_b, 'Badge B');
update tap_meta set collection_b = public.create_progression_collection(
  '9c000000-0000-4000-8000-000000000002', season_b, 'Collection B');
update tap_meta set item_b = public.create_progression_collection_item(
  '9c000000-0000-4000-8000-000000000002', collection_b, 'Objet B');
-- La mission de B RÉCOMPENSE UN BADGE : c'est ce qui rend le test de
-- cascade tenant, tout à la fin, réellement discriminant. Avec l'ancien
-- ON DELETE RESTRICT, supprimer l'organisation cascadait vers les badges
-- AVANT les missions et échouait.
update tap_meta set mission_b = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000002',
  season_b,
  'Lancement B',
  'Lancer une campagne chez B',
  'experience_started',
  1,
  array['campaign']::text[],
  p_key_reward => 7,
  p_badge_id => badge_b
);

-- ── Un membre NON éditeur de A : les 7 RPC lui sont fermées ──
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a2"}',
  true);
select throws_ok(
  $$select public.create_progression_season(
      '9c000000-0000-4000-8000-000000000001', 'Saison pirate',
      now(), now() + interval '10 days')$$,
  '42501', 'not authorized',
  'un caissier ne crée pas de saison'
);
select throws_ok(
  $$select public.create_progression_badge(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Badge pirate')$$,
  '42501', 'not authorized',
  'un caissier ne crée pas de badge'
);
select throws_ok(
  $$select public.create_progression_collection(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Collection pirate')$$,
  '42501', 'not authorized',
  'un caissier ne crée pas de collection'
);
select throws_ok(
  $$select public.create_progression_collection_item(
      '9c000000-0000-4000-8000-000000000001',
      (select collection_a from tap_meta), 'Objet pirate')$$,
  '42501', 'not authorized',
  'un caissier n''ajoute pas d''objet de collection'
);
select throws_ok(
  $$select public.create_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Mission pirate', '',
      'experience_started', 1, array['campaign']::text[])$$,
  '42501', 'not authorized',
  'un caissier ne crée pas de mission'
);
select throws_ok(
  $$select public.create_progression_chest(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Coffre pirate', '', 1,
      array[(select item_a1 from tap_meta)])$$,
  '42501', 'not authorized',
  'un caissier ne crée pas de coffre'
);
select throws_ok(
  $$select public.activate_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta))$$,
  '42501', 'not authorized',
  'un caissier n''active pas une saison'
);

-- ── L'éditeur d'une AUTRE organisation est un étranger ──
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000b1"}',
  true);
select throws_ok(
  $$select public.create_progression_season(
      '9c000000-0000-4000-8000-000000000001', 'Saison volée',
      now(), now() + interval '10 days')$$,
  '42501', 'not authorized',
  'un éditeur de B ne crée pas de saison chez A'
);
select throws_ok(
  $$select public.activate_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta))$$,
  '42501', 'not authorized',
  'un éditeur de B n''active pas la saison de A'
);

-- ── Injection d'un identifiant d'un autre tenant : refus ──
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);
select throws_ok(
  $$select public.create_progression_badge(
      '9c000000-0000-4000-8000-000000000001',
      (select season_b from tap_meta), 'Badge greffé')$$,
  'P0001', 'draft season not found',
  'une saison d''un autre tenant ne peut pas recevoir un badge de A'
);
select throws_ok(
  $$select public.create_progression_collection_item(
      '9c000000-0000-4000-8000-000000000001',
      (select collection_b from tap_meta), 'Objet greffé')$$,
  'P0001', 'draft collection not found',
  'une collection d''un autre tenant ne peut pas recevoir un objet de A'
);
select throws_ok(
  $$select public.create_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Mission greffée', '',
      'experience_started', 1, array['campaign']::text[],
      p_badge_id => (select badge_b from tap_meta))$$,
  'P0001', 'badge not found',
  'une mission ne peut pas récompenser le badge d''un autre tenant'
);
select throws_ok(
  $$select public.create_progression_chest(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Coffre greffé', '', 5,
      array[(select item_b from tap_meta)])$$,
  'P0001', 'collection item not found',
  'un coffre ne peut pas contenir l''objet d''un autre tenant'
);

-- ── Bornes de la configuration ──
select throws_ok(
  $$select public.create_progression_season(
      '9c000000-0000-4000-8000-000000000001', 'Saison sans fin',
      now(), now() + interval '400 days')$$,
  '22023', 'invalid season',
  'une saison ne peut pas dépasser 366 jours'
);
select throws_ok(
  $$select public.create_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Cible nulle', '',
      'experience_started', 0, array['campaign']::text[])$$,
  '22023', 'invalid mission',
  'une mission de cible 0 est refusée'
);
select throws_ok(
  $$select public.create_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Type inconnu', '',
      'experience_started', 1, array['roulette']::text[])$$,
  '22023', 'invalid mission',
  'un type d''expérience hors catalogue est refusé'
);
select throws_ok(
  $$select public.create_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Événement inconnu', '',
      'experience_teleported', 1, array['campaign']::text[])$$,
  '22023', 'invalid mission',
  'un nom d''événement hors catalogue est refusé'
);
select throws_ok(
  $$select public.create_progression_chest(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Coffre gratuit', '', 0,
      array[(select item_a1 from tap_meta)])$$,
  '22023', 'invalid chest',
  'un coffre gratuit est refusé : les clés sont la seule monnaie'
);
select throws_ok(
  $$select public.create_progression_chest(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Coffre doublon', '', 3,
      array[(select item_a1 from tap_meta), (select item_a1 from tap_meta)])$$,
  '22023', 'invalid chest',
  'un butin comportant deux fois le même objet est refusé'
);

-- ══════════════════════════════════════════════════════════════
-- (d) Activation d'une saison et immutabilité d'une saison active
-- ══════════════════════════════════════════════════════════════
select throws_ok(
  $$select public.activate_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_b from tap_meta))$$,
  'P0001', 'season cannot be activated',
  'A ne peut pas activer la saison de B, même en s''annonçant comme A'
);
select throws_ok(
  $$select public.activate_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_empty from tap_meta))$$,
  'P0001', 'season cannot be activated',
  'une saison sans mission activée ne peut pas être ouverte'
);
select is(
  public.activate_progression_season(
    '9c000000-0000-4000-8000-000000000001',
    (select season_a from tap_meta)
  ),
  true,
  'un éditeur active sa saison configurée'
);
select throws_ok(
  $$select public.activate_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_empty from tap_meta))$$,
  'P0001', 'another season is active',
  'une deuxième saison ne peut pas être active en même temps'
);
select throws_ok(
  $$select public.activate_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta))$$,
  'P0001', 'season cannot be activated',
  'activer deux fois la même saison ne fait rien : elle n''est plus brouillon'
);
select is(
  (select count(*)::integer from public.progression_seasons
    where organization_id = '9c000000-0000-4000-8000-000000000001'
      and status = 'active'),
  1,
  'l''organisation A n''a qu''une saison active'
);

-- IMMUTABILITÉ : une saison active n'est plus configurable. Les cinq RPC
-- de contenu exigent explicitement un brouillon.
select throws_ok(
  $$select public.create_progression_badge(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Badge tardif')$$,
  'P0001', 'draft season not found',
  'aucun badge n''est ajouté à une saison active'
);
select throws_ok(
  $$select public.create_progression_collection(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Collection tardive')$$,
  'P0001', 'draft season not found',
  'aucune collection n''est ajoutée à une saison active'
);
select throws_ok(
  $$select public.create_progression_collection_item(
      '9c000000-0000-4000-8000-000000000001',
      (select collection_a from tap_meta), 'Objet tardif')$$,
  'P0001', 'draft collection not found',
  'aucun objet n''est ajouté à la collection d''une saison active'
);
select throws_ok(
  $$select public.create_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Mission tardive', '',
      'experience_started', 1, array['campaign']::text[])$$,
  'P0001', 'draft season not found',
  'aucune mission n''est ajoutée à une saison active'
);
select throws_ok(
  $$select public.create_progression_chest(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta), 'Coffre tardif', '', 2,
      array[(select item_a1 from tap_meta)])$$,
  'P0001', 'draft season not found',
  'aucun coffre n''est ajouté à une saison active'
);

-- L'organisation B ouvre la sienne : deux saisons actives coexistent,
-- une par tenant.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000b1"}',
  true);
select is(
  public.activate_progression_season(
    '9c000000-0000-4000-8000-000000000002',
    (select season_b from tap_meta)
  ),
  true,
  'chaque organisation ouvre sa propre saison'
);

-- ══════════════════════════════════════════════════════════════
-- (e) LE MOTEUR : experience_events -> apply_meta_progression_event
-- ══════════════════════════════════════════════════════════════
-- Les événements sont insérés directement dans le journal serveur :
-- record_experience_event ne permet pas de choisir occurred_at, et le
-- moteur lit la ligne, pas la RPC. experience_events ne porte pas de FK
-- sur experience_id (la RPC la valide en amont), ce qui permet d'exercer
-- le type « hunt » sans monter une chasse complète.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- E1 : premier lancement de campagne.
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_started', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'qr',
  '9c000000-0000-4000-8000-0000000000f1', now()
);

select is(
  (select current_value from public.progression_mission_progress
    where mission_id = (select mission_starts from tap_meta)),
  1,
  'un événement serveur fait progresser la mission correspondante'
);
select is(
  (select count(*)::integer from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  1,
  'la saison joueur est créée à la première contribution'
);
select is(
  (select count(*)::integer from public.progression_mission_progress
    where mission_id = (select mission_hunt from tap_meta)),
  0,
  'FILTRE DE TYPE : un lancement de campagne ne touche pas la mission chasse'
);
select is(
  (select target_value from public.progression_mission_progress
    where mission_id = (select mission_starts from tap_meta)),
  3,
  'la cible de la progression est copiée depuis la règle versionnée'
);

-- E2 et E3 : la cible est atteinte. distinct_experiences est faux, donc
-- deux lancements de la MÊME campagne comptent deux fois.
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_started', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'qr',
  '9c000000-0000-4000-8000-0000000000f1', now()
);
select is(
  (select current_value from public.progression_mission_progress
    where mission_id = (select mission_starts from tap_meta)),
  2,
  'sans distinct_experiences, deux passages sur la même expérience comptent deux fois'
);

insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_started', 'campaign',
  '9c000000-0000-4000-8000-000000000012', 'direct',
  '9c000000-0000-4000-8000-0000000000f1', now()
);
select ok(
  (select completed_at is not null from public.progression_mission_progress
    where mission_id = (select mission_starts from tap_meta)),
  'la cible atteinte clôt la mission'
);
select ok(
  (select keys_balance = 5 and keys_earned = 5 and keys_spent = 0
     from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  'la clôture crédite exactement key_reward clés'
);
select is(
  (select count(*)::integer from public.progression_player_badges
    where player_id = '9c000000-0000-4000-8000-0000000000f1'
      and badge_id = (select badge_a from tap_meta)),
  1,
  'la clôture octroie le badge de la mission'
);
select is(
  (select count(*)::integer from public.progression_mission_contributions c
     join public.progression_mission_progress p on p.id = c.progress_id
    where p.mission_id = (select mission_starts from tap_meta)),
  3,
  'exactement trois contributions sont journalisées'
);

-- E4 : un quatrième lancement ne déborde pas la cible et ne re-récompense pas.
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_started', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'qr',
  '9c000000-0000-4000-8000-0000000000f1', now()
);
select results_eq(
  $$select current_value, target_value
      from public.progression_mission_progress
     where mission_id = (select mission_starts from tap_meta)$$,
  $$values (3, 3)$$,
  'RESPECT DE LA CIBLE : la progression ne dépasse jamais target'
);
select ok(
  (select keys_balance = 5 and keys_earned = 5
     from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  'une mission close ne recrédite pas de clés'
);
select is(
  (select count(*)::integer from public.progression_player_badges
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  1,
  'une mission close ne réattribue pas son badge'
);
select is(
  (select count(*)::integer from public.progression_mission_contributions c
     join public.progression_mission_progress p on p.id = c.progress_id
    where p.mission_id = (select mission_starts from tap_meta)),
  3,
  'un événement postérieur à la clôture ne produit aucune contribution'
);

-- E5 : le type « hunt » n'alimente que la mission qui le déclare.
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_started', 'hunt',
  '9c000000-0000-4000-8000-000000000021', 'direct',
  '9c000000-0000-4000-8000-0000000000f1', now()
);
select ok(
  (select completed_at is not null from public.progression_mission_progress
    where mission_id = (select mission_hunt from tap_meta)),
  'FILTRE DE TYPE : une chasse clôt la mission qui déclare le type hunt'
);
select is(
  (select keys_balance from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  8,
  'les clés des missions closes s''additionnent'
);

-- E6 à E8 : distinct_experiences. Deux complétions de la MÊME campagne ne
-- comptent qu'une fois ; c'est aussi la preuve d'idempotence des
-- contributions (clé experience:<kind>:<id>).
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_completed', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'qr',
  '9c000000-0000-4000-8000-0000000000f1', now()
);
select is(
  (select current_value from public.progression_mission_progress
    where mission_id = (select mission_distinct from tap_meta)),
  1,
  'la première complétion compte'
);
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_completed', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'direct',
  '9c000000-0000-4000-8000-0000000000f1', now()
);
select is(
  (select current_value from public.progression_mission_progress
    where mission_id = (select mission_distinct from tap_meta)),
  1,
  'NON-DOUBLE-COMPTAGE : la même expérience ne compte qu''une fois'
);
select is(
  (select count(*)::integer from public.progression_mission_contributions c
     join public.progression_mission_progress p on p.id = c.progress_id
    where p.mission_id = (select mission_distinct from tap_meta)),
  1,
  'la contribution en double est absorbée par sa clé unique'
);
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_completed', 'campaign',
  '9c000000-0000-4000-8000-000000000012', 'qr',
  '9c000000-0000-4000-8000-0000000000f1', now()
);
select ok(
  (select completed_at is not null from public.progression_mission_progress
    where mission_id = (select mission_distinct from tap_meta)),
  'une seconde expérience DIFFÉRENTE clôt la mission'
);
select results_eq(
  $$select source_type from public.progression_player_items
     where player_id = '9c000000-0000-4000-8000-0000000000f1'$$,
  $$values ('mission'::text)$$,
  'la clôture octroie l''objet de collection, tracé comme venant d''une mission'
);
select is(
  (select item_id from public.progression_player_items
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  (select item_a1 from tap_meta),
  'l''objet octroyé est celui déclaré par la mission'
);

-- E9 : filtre de source. Un lot obtenu en direct n'alimente pas une
-- mission qui exige la source « qr ».
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'reward_issued', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'direct',
  '9c000000-0000-4000-8000-0000000000f1', now()
);
select is(
  (select count(*)::integer from public.progression_mission_progress
    where mission_id = (select mission_qr from tap_meta)),
  0,
  'FILTRE DE SOURCE : une source non déclarée n''ouvre même pas la progression'
);

-- E10 : le même événement, source « qr », mais sans joueur identifié.
-- Rien ne bouge : la méta-progression n'existe que pour un joueur connu.
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at, idempotency_key
) values (
  '9c000000-0000-4000-8000-000000000001', 'reward_issued', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'qr',
  null, now(), 'tap-meta-lazy-link'
);
select is(
  (select count(*)::integer from public.progression_mission_progress
    where mission_id = (select mission_qr from tap_meta)),
  0,
  'un événement sans joueur ne produit aucune progression'
);

-- Lazy-link : l'identité est rattachée après coup (migration 140000).
-- Le trigger rejoue alors l'événement, une seule fois.
update public.experience_events
   set player_id = '9c000000-0000-4000-8000-0000000000f1'
 where idempotency_key = 'tap-meta-lazy-link';
select ok(
  (select completed_at is not null from public.progression_mission_progress
    where mission_id = (select mission_qr from tap_meta)),
  'le rattachement tardif du joueur fait progresser la mission'
);
select is(
  (select keys_balance from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  10,
  'la mission source « qr » crédite ses deux clés'
);

-- Réattribution de l'événement à un AUTRE joueur, lui aussi membre de A :
-- le garde old.player_id interdit tout rejeu.
update public.experience_events
   set player_id = '9c000000-0000-4000-8000-0000000000f2'
 where idempotency_key = 'tap-meta-lazy-link';
select is(
  (select count(*)::integer from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f2'
      and organization_id = '9c000000-0000-4000-8000-000000000001'),
  0,
  'un événement déjà attribué n''est jamais rejoué au profit d''un autre joueur'
);
select is(
  (select keys_balance from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  10,
  'le solde de clés du joueur initial reste intact'
);

-- E11 : hors de la fenêtre de saison, rien ne progresse.
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'player_returned', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'direct',
  '9c000000-0000-4000-8000-0000000000f1', now() - interval '2 days'
);
select is(
  (select count(*)::integer from public.progression_mission_progress
    where mission_id = (select mission_return from tap_meta)),
  0,
  'un événement antérieur au début de saison ne compte pas'
);

-- E12 : dans la fenêtre, il compte — et laisse une mission en cours.
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000001', 'player_returned', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'direct',
  '9c000000-0000-4000-8000-0000000000f1', now()
);
select results_eq(
  $$select current_value, target_value, completed_at is null
      from public.progression_mission_progress
     where mission_id = (select mission_return from tap_meta)$$,
  $$values (1, 2, true)$$,
  'une mission partiellement remplie reste ouverte'
);

-- E13 : CLOISONNEMENT. Un événement de B ne progresse que chez B.
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at
) values (
  '9c000000-0000-4000-8000-000000000002', 'experience_started', 'campaign',
  '9c000000-0000-4000-8000-000000000013', 'qr',
  '9c000000-0000-4000-8000-0000000000f2', now()
);
select ok(
  (select completed_at is not null from public.progression_mission_progress
    where mission_id = (select mission_b from tap_meta)),
  'l''événement de B clôt la mission de B'
);
select is(
  (select count(*)::integer from public.progression_mission_progress
    where organization_id = '9c000000-0000-4000-8000-000000000001'
      and player_id = '9c000000-0000-4000-8000-0000000000f2'),
  0,
  'aucune progression de A n''est ouverte par un événement de B'
);
select is(
  (select count(*)::integer from public.progression_mission_progress
    where organization_id = '9c000000-0000-4000-8000-000000000002'
      and player_id = '9c000000-0000-4000-8000-0000000000f1'),
  0,
  'aucune progression de B n''est alimentée par le joueur de A'
);
select is(
  (select keys_balance from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f2'),
  7,
  'les clés du joueur de B sont propres à la saison de B'
);
select is(
  (select count(*)::integer from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f2'),
  1,
  'le même joueur central n''a de saison que là où il a progressé'
);

-- ══════════════════════════════════════════════════════════════
-- (f) Coffre : débit réel, refus, idempotence par request_id
-- ══════════════════════════════════════════════════════════════
create temporary table tap_chest (label text primary key, payload jsonb)
  on commit drop;

-- Jeton mal formé : la RPC ne se laisse pas sonder.
select throws_ok(
  $$select public.open_progression_chest(
      'pas-un-hash', '9c000000-0000-4000-8000-000000000001',
      (select chest_a from tap_meta),
      '9c000000-0000-4000-8000-00000000e001')$$,
  '42501', 'not authorized',
  'un jeton d''appareil mal formé est refusé avant toute lecture'
);
select is(
  (select public.open_progression_chest(
     repeat('e', 64), '9c000000-0000-4000-8000-000000000001',
     chest_a, '9c000000-0000-4000-8000-00000000e002') from tap_meta),
  null::jsonb,
  'un appareil inconnu est indiscernable d''une absence de progression'
);
select is(
  (select public.open_progression_chest(
     repeat('a', 64), '9c000000-0000-4000-8000-000000000002',
     chest_a, '9c000000-0000-4000-8000-00000000e003') from tap_meta),
  null::jsonb,
  'CLOISONNEMENT : le coffre de A est invisible depuis l''organisation B'
);

-- Clés insuffisantes : aucun débit, aucune ouverture.
insert into tap_chest (label, payload)
select 'poor', public.open_progression_chest(
  repeat('a', 64), '9c000000-0000-4000-8000-000000000001',
  chest_rich, '9c000000-0000-4000-8000-00000000e004') from tap_meta;
select results_eq(
  $$select payload ->> 'state', (payload ->> 'keys')::integer,
           (payload ->> 'required_keys')::integer
      from tap_chest where label = 'poor'$$,
  $$values ('insufficient_keys'::text, 10, 100)$$,
  'un coffre trop cher est refusé en annonçant le prix, sans débit'
);
select ok(
  (select keys_balance = 10 and keys_spent = 0
     from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  'un refus pour clés insuffisantes ne touche pas le solde'
);
select is(
  (select count(*)::integer from public.progression_chest_openings),
  0,
  'un refus n''enregistre aucune ouverture'
);

-- Ouverture nominale : débit réel et objet non encore possédé.
insert into tap_chest (label, payload)
select 'first', public.open_progression_chest(
  repeat('a', 64), '9c000000-0000-4000-8000-000000000001',
  chest_a, '9c000000-0000-4000-8000-00000000e005') from tap_meta;
select results_eq(
  $$select payload ->> 'state', (payload ->> 'idempotent')::boolean,
           (payload ->> 'keys')::integer
      from tap_chest where label = 'first'$$,
  $$values ('opened'::text, false, 6)$$,
  'l''ouverture débite le coût du coffre et rend l''objet'
);
select ok(
  (select keys_balance = 6 and keys_spent = 4 and keys_earned = 10
     from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  'le débit est réel : solde et cumul dépensé bougent, le cumul gagné non'
);
select isnt(
  (select payload #>> '{item,id}' from tap_chest where label = 'first'),
  (select item_a1::text from tap_meta),
  'le coffre ne redonne pas un objet déjà possédé'
);
select is(
  (select count(*)::integer from public.progression_chest_openings),
  1,
  'une ouverture est journalisée'
);
select is(
  (select count(*)::integer from public.progression_player_items
    where player_id = '9c000000-0000-4000-8000-0000000000f1'
      and source_type = 'chest'),
  1,
  'l''objet est inscrit à l''inventaire, tracé comme venant d''un coffre'
);
select ok(
  (select exists (
     select 1 from public.progression_player_items item
      join public.progression_chest_openings opening
        on opening.id = item.source_id
     where item.source_type = 'chest'
       and item.item_id = opening.item_id
       and item.player_season_id = opening.player_season_id
   )),
  'ATOMICITÉ : l''objet inventorié est exactement celui de son ouverture'
);

-- BUTIN NON FORGEABLE. Le backend accepte un request_id FOURNI par
-- l'appelant : sans sel, un client fabriqué meulait des request_id hors
-- ligne jusqu'à obtenir l'objet rare. L'objet réellement tiré doit suivre
-- l'ordre SALÉ — celui qu'on ne peut pas calculer sans connaître la graine.
select is(
  (select payload #>> '{item,id}' from tap_chest where label = 'first'),
  (select item.id::text
     from public.progression_chest_items chest_item
     join public.progression_collection_items item
       on item.id = chest_item.item_id
     cross join (
       select loot_seed from public.progression_chests
        where id = (select chest_a from tap_meta)
     ) seed
    where chest_item.chest_id = (select chest_a from tap_meta)
      and item.id <> (select item_a1 from tap_meta)
    order by pg_catalog.md5(
      seed.loot_seed::text
      || ':' || '9c000000-0000-4000-8000-00000000e005'
      || ':' || item.id::text
    )
    limit 1),
  'le butin tiré suit l''ordre SALÉ, pas un ordre dérivable du seul request_id'
);
select ok(
  (select count(distinct loot_seed)::integer
     from public.progression_chests
    where organization_id = '9c000000-0000-4000-8000-000000000001') = 2,
  'chaque coffre reçoit sa propre graine, jamais une graine partagée'
);

-- IDEMPOTENCE : le MÊME request_id ne rouvre rien et ne débite pas.
insert into tap_chest (label, payload)
select 'replay', public.open_progression_chest(
  repeat('a', 64), '9c000000-0000-4000-8000-000000000001',
  chest_a, '9c000000-0000-4000-8000-00000000e005') from tap_meta;
select results_eq(
  $$select payload ->> 'state', (payload ->> 'idempotent')::boolean,
           (payload ->> 'keys')::integer
      from tap_chest where label = 'replay'$$,
  $$values ('opened'::text, true, 6)$$,
  'IDEMPOTENCE : le rejeu se déclare comme tel et rend le même solde'
);
select is(
  (select payload #>> '{item,id}' from tap_chest where label = 'replay'),
  (select payload #>> '{item,id}' from tap_chest where label = 'first'),
  'le rejeu rend exactement le même objet'
);
select ok(
  (select keys_balance = 6 and keys_spent = 4
     from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  'IDEMPOTENCE : le rejeu ne débite pas une seconde fois'
);
select is(
  (select count(*)::integer from public.progression_chest_openings),
  1,
  'IDEMPOTENCE : le rejeu n''ouvre pas un second coffre'
);
select is(
  (select count(*)::integer from public.progression_player_items
    where player_id = '9c000000-0000-4000-8000-0000000000f1'
      and source_type = 'chest'),
  1,
  'IDEMPOTENCE : le rejeu n''inventorie pas un second objet'
);

-- F1 : le MÊME request_id sur un AUTRE coffre n'est PAS un rejeu. Avant
-- le correctif, la relecture ne filtrait pas sur chest_id : cet appel
-- rendait « idempotent: true » et le butin du coffre déjà ouvert, pour un
-- coffre jamais ouvert — et sans même regarder le solde de clés.
insert into tap_chest (label, payload)
select 'cross', public.open_progression_chest(
  repeat('a', 64), '9c000000-0000-4000-8000-000000000001',
  chest_rich, '9c000000-0000-4000-8000-00000000e005') from tap_meta;
select is(
  (select payload ->> 'state' from tap_chest where label = 'cross'),
  'insufficient_keys',
  'F1 : un request_id rejoué sur un AUTRE coffre repart du contrôle des clés'
);
select ok(
  (select payload -> 'item' is null from tap_chest where label = 'cross'),
  'F1 : aucun butin d''un autre coffre n''est rendu'
);
select is(
  (select count(*)::integer from public.progression_chest_openings),
  1,
  'F1 : la tentative croisée n''a ouvert aucun coffre'
);

-- Un NOUVEAU request_id ouvre bien un second coffre : la garde est le
-- request_id, pas une limite arbitraire.
insert into tap_chest (label, payload)
select 'second', public.open_progression_chest(
  repeat('a', 64), '9c000000-0000-4000-8000-000000000001',
  chest_a, '9c000000-0000-4000-8000-00000000e006') from tap_meta;
select results_eq(
  $$select payload ->> 'state', (payload ->> 'idempotent')::boolean,
           (payload ->> 'keys')::integer
      from tap_chest where label = 'second'$$,
  $$values ('opened'::text, false, 2)$$,
  'un nouveau request_id ouvre un second coffre et redébite'
);
select is(
  (select count(*)::integer from public.progression_chest_openings),
  2,
  'deux ouvertures distinctes sont journalisées'
);

-- Le butin est fini : une fois la collection réunie, plus rien à donner.
-- Le solde est remonté ici SANS passer par le moteur, uniquement pour
-- atteindre l'état « collection complète » avec des clés suffisantes.
update public.progression_player_seasons
   set keys_balance = 50
 where player_id = '9c000000-0000-4000-8000-0000000000f1';
insert into tap_chest (label, payload)
select 'complete', public.open_progression_chest(
  repeat('a', 64), '9c000000-0000-4000-8000-000000000001',
  chest_a, '9c000000-0000-4000-8000-00000000e007') from tap_meta;
select is(
  (select payload ->> 'state' from tap_chest where label = 'complete'),
  'collection_complete',
  'un coffre dont tout le butin est déjà possédé ne donne rien'
);
select ok(
  (select keys_balance = 50 and keys_spent = 8
     from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'),
  'un coffre sans butin disponible ne débite aucune clé'
);

-- Un coffre désactivé disparaît, comme un coffre d'un autre tenant.
update public.progression_chests set enabled = false
 where id = (select chest_a from tap_meta);
select is(
  (select public.open_progression_chest(
     repeat('a', 64), '9c000000-0000-4000-8000-000000000001',
     chest_a, '9c000000-0000-4000-8000-00000000e008') from tap_meta),
  null::jsonb,
  'un coffre désactivé n''est plus ouvrable'
);
update public.progression_chests set enabled = true
 where id = (select chest_a from tap_meta);

-- ══════════════════════════════════════════════════════════════
-- (g) Lectures gardées : joueur (serveur) et commerçant (agrégat)
-- ══════════════════════════════════════════════════════════════
select throws_ok(
  $$select public.player_progression_snapshot(
      'pas-un-hash', '9c000000-0000-4000-8000-000000000001')$$,
  '42501', 'not authorized',
  'la lecture joueur exige un hash d''appareil bien formé'
);
select is(
  public.player_progression_snapshot(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000002'),
  null::jsonb,
  'CLOISONNEMENT : le joueur de A ne lit rien chez B'
);
select is(
  (public.player_progression_snapshot(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001') ->> 'keys')::integer,
  50,
  'la lecture joueur rend son solde de clés'
);
select is(
  pg_catalog.jsonb_array_length(
    public.player_progression_snapshot(
      repeat('a', 64), '9c000000-0000-4000-8000-000000000001') -> 'missions'),
  5,
  'la lecture joueur rend les cinq missions actives de la saison'
);
select ok(
  (public.player_progression_snapshot(
     repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
   ) #> '{badges,0}' ->> 'earned')::boolean,
  'le badge gagné est marqué comme acquis'
);
select ok(
  public.player_progression_snapshot(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
  )::text not like '%9c000000-0000-4000-8000-0000000000f1%',
  'la lecture joueur ne renvoie jamais l''identifiant central du joueur'
);
-- Le sel n'a de valeur que s'il reste inconnu de l'appelant.
select ok(
  pg_catalog.position(
    (select loot_seed::text from public.progression_chests
      where id = (select chest_a from tap_meta))
    in public.player_progression_snapshot(
      repeat('a', 64), '9c000000-0000-4000-8000-000000000001')::text
  ) = 0,
  'la lecture joueur ne fuit jamais la graine de tirage d''un coffre'
);
-- INFO (20260805220000) : le joueur recevait event_name et
-- experience_kinds, qu'aucun écran n'affiche — c'était la recette exacte
-- du meulage d'une mission. Retirés de la charge utile.
select ok(
  public.player_progression_snapshot(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
  )::text not like '%event_name%'
    and public.player_progression_snapshot(
      repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
    )::text not like '%experience_kinds%',
  'la charge utile joueur ne livre plus le mode d''emploi du meulage'
);

-- Agrégat commerçant : gardé en interne, sans identifiant de joueur.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);
select throws_ok(
  $$select public.org_progression_snapshot(
      '9c000000-0000-4000-8000-000000000002')$$,
  '42501', 'not authorized',
  'CLOISONNEMENT : un commerçant ne lit pas l''agrégat d''un autre tenant'
);
select is(
  (public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001') #>> '{summary,players}')::integer,
  1,
  'l''agrégat compte les joueurs de son seul tenant'
);
select is(
  (public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001') #>> '{summary,keys_earned}')::integer,
  10,
  'l''agrégat additionne les clés gagnées du tenant'
);
select is(
  (public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001') #>> '{summary,chests_opened}')::integer,
  2,
  'l''agrégat compte les coffres ouverts du tenant'
);
select ok(
  public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001'
  )::text not like '%9c000000-0000-4000-8000-0000000000f1%',
  'l''agrégat commerçant ne contient aucun identifiant de joueur'
);
select ok(
  pg_catalog.position(
    (select loot_seed::text from public.progression_chests
      where id = (select chest_a from tap_meta))
    in public.org_progression_snapshot(
      '9c000000-0000-4000-8000-000000000001')::text
  ) = 0,
  'l''agrégat commerçant ne fuit pas non plus la graine de tirage'
);

-- ── M2 : la CONFIGURATION n'est pas de la lecture d'équipe ──
-- Le commentaire d'origine prétendait qu'un caissier « lit strictement
-- moins qu'un visiteur ». C'était faux : l'agrégat rendait toutes les
-- saisons, brouillons compris, sans filtre `enabled`, plus les volumes
-- d'engagement. « Saison 2 » est ici une saison NON LANCÉE : c'est elle
-- qui sert de témoin.
select ok(
  (public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001') ->> 'can_configure')::boolean,
  'un éditeur est annoncé comme habilité à configurer'
);
select ok(
  public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001')::text like '%Saison 2%',
  'un éditeur voit bien sa saison en préparation'
);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a2"}',
  true);
select lives_ok(
  $$select public.org_progression_snapshot(
      '9c000000-0000-4000-8000-000000000001')$$,
  'un caissier garde accès à l''agrégat de son organisation'
);
select is(
  (public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001') ->> 'can_configure')::boolean,
  false,
  'un caissier est annoncé comme NON habilité à configurer'
);
select is(
  pg_catalog.jsonb_array_length(
    public.org_progression_snapshot(
      '9c000000-0000-4000-8000-000000000001') -> 'seasons'),
  0,
  'M2 : un caissier ne lit AUCUNE configuration de saison'
);
select ok(
  public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001')::text not like '%Saison 2%',
  'M2 : la saison NON LANCÉE ne fuit plus vers un poste de caisse'
);
select ok(
  public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001')::text not like '%Coffre hors de prix%',
  'M2 : ni les coffres, ni leurs prix, ni les dotations en clés'
);
select is(
  (public.org_progression_snapshot(
    '9c000000-0000-4000-8000-000000000001') #>> '{summary,players}')::integer,
  1,
  'les volumes d''engagement restent ouverts à l''équipe, comme org_prize_funnel'
);
select throws_ok(
  $$select public.org_progression_snapshot(
      '9c000000-0000-4000-8000-000000000002')$$,
  '42501', 'not authorized',
  'un caissier ne lit pas non plus l''agrégat d''un autre tenant'
);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);

-- ══════════════════════════════════════════════════════════════
-- (h) Cycle de vie : clore, archiver, ENCHAÎNER UNE SAISON 2
-- ══════════════════════════════════════════════════════════════
-- Avant 20260805210000, progression_seasons_one_active_org_idx interdisait
-- une seconde saison ET aucun chemin ne faisait sortir de 'active' : une
-- organisation était bloquée à vie sur sa première saison. C'est la section
-- qui prouve que le blocage est levé sans rien perdre du joueur.

-- Un membre non éditeur ne touche pas au cycle de vie.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a2"}',
  true);
select throws_ok(
  $$select public.end_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta))$$,
  '42501', 'not authorized',
  'un caissier ne clôt pas une saison'
);
select throws_ok(
  $$select public.archive_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta))$$,
  '42501', 'not authorized',
  'un caissier n''archive pas une saison'
);
select throws_ok(
  $$select public.delete_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_empty from tap_meta))$$,
  '42501', 'not authorized',
  'un caissier ne supprime pas une saison'
);

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);
select throws_ok(
  $$select public.end_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_empty from tap_meta))$$,
  'P0001', 'active season not found',
  'une saison brouillon ne se clôt pas : il n''y a rien à clore'
);
select throws_ok(
  $$select public.archive_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta))$$,
  'P0001', 'ended season not found',
  'une saison active ne s''archive pas sans être close d''abord'
);
select throws_ok(
  $$select public.end_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_b from tap_meta))$$,
  'P0001', 'active season not found',
  'CLOISONNEMENT : A ne clôt pas la saison active de B'
);

select is(
  public.end_progression_season(
    '9c000000-0000-4000-8000-000000000001',
    (select season_a from tap_meta)
  ),
  true,
  'un éditeur clôt sa saison'
);
select is(
  (select status from public.progression_seasons
    where id = (select season_a from tap_meta)),
  'ended',
  'la saison close passe en ended'
);

-- LE POINT DÉLICAT : clore ne détruit rien.
select results_eq(
  $$select
      (select count(*) from public.progression_player_seasons
        where player_id = '9c000000-0000-4000-8000-0000000000f1'),
      (select count(*) from public.progression_mission_progress
        where player_id = '9c000000-0000-4000-8000-0000000000f1'),
      (select count(*) from public.progression_player_badges
        where player_id = '9c000000-0000-4000-8000-0000000000f1'),
      (select count(*) from public.progression_player_items
        where player_id = '9c000000-0000-4000-8000-0000000000f1'),
      (select count(*) from public.progression_chest_openings
        where player_id = '9c000000-0000-4000-8000-0000000000f1')$$,
  $$values (1::bigint, 5::bigint, 1::bigint, 3::bigint, 2::bigint)$$,
  'la clôture ne touche QUE le statut : rien de la progression joueur ne part'
);

-- Lectures joueur après clôture.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.player_progression_snapshot(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001'),
  null::jsonb,
  'la lecture « saison en cours » ne trouve plus de saison active'
);
select throws_ok(
  $$select public.player_progression_archive(
      'pas-un-hash', '9c000000-0000-4000-8000-000000000001')$$,
  '42501', 'not authorized',
  'l''archive joueur exige un hash d''appareil bien formé'
);
select is(
  public.player_progression_archive(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000002'),
  null::jsonb,
  'CLOISONNEMENT : le joueur de A ne lit pas l''archive de B'
);
select is(
  pg_catalog.jsonb_array_length(
    public.player_progression_archive(
      repeat('a', 64), '9c000000-0000-4000-8000-000000000001') -> 'seasons'),
  1,
  'l''archive rend la saison close du joueur'
);
select is(
  public.player_progression_archive(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
  ) #>> '{seasons,0,status}',
  'ended',
  'l''archive annonce le statut réel de la saison'
);
select is(
  pg_catalog.jsonb_array_length(
    public.player_progression_archive(
      repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
    ) #> '{seasons,0,badges}'),
  1,
  'LES BADGES OBTENUS NE DISPARAISSENT PAS À LA CLÔTURE'
);
select is(
  pg_catalog.jsonb_array_length(
    public.player_progression_archive(
      repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
    ) #> '{seasons,0,items}'),
  3,
  'les objets collectés restent lisibles après la clôture'
);
select is(
  (public.player_progression_archive(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
  ) #>> '{seasons,0,keys_earned}')::integer,
  10,
  'l''archive conserve le compte de clés gagnées'
);
select ok(
  public.player_progression_archive(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
  )::text not like '%9c000000-0000-4000-8000-0000000000f1%',
  'l''archive ne renvoie jamais l''identifiant central du joueur'
);

-- SAISON 2 : ce que le module ne savait pas faire.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);
update tap_meta set badge_s2 = public.create_progression_badge(
  '9c000000-0000-4000-8000-000000000001', season_empty, 'Badge saison 2');
update tap_meta set mission_s2_ok = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000001',
  season_empty,
  'Mission saine',
  'Terminer une campagne',
  'experience_completed',
  1,
  array['campaign']::text[],
  p_key_reward => 4
);
-- Cette mission-ci sera sabotée plus bas pour prouver l'isolation
-- d'erreur : elle octroie un badge, donc elle a un point de rupture.
update tap_meta set mission_s2_fail = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000001',
  season_empty,
  'Mission sabotée',
  'Terminer une campagne',
  'experience_completed',
  1,
  array['campaign']::text[],
  p_badge_id => badge_s2
);
-- Un coffre dans la saison 2 : c'est lui qui sert à prouver
-- l'interrupteur d'arrêt d'un coffre sur une saison LANCÉE (M3).
update tap_meta set collection_s2 = public.create_progression_collection(
  '9c000000-0000-4000-8000-000000000001', season_empty, 'Vitrine saison 2');
update tap_meta set item_s2a = public.create_progression_collection_item(
  '9c000000-0000-4000-8000-000000000001', collection_s2, 'Jeton saison 2');
update tap_meta set chest_s2 = public.create_progression_chest(
  '9c000000-0000-4000-8000-000000000001',
  season_empty, 'Coffre saison 2', '', 2, array[item_s2a]);
select is(
  public.activate_progression_season(
    '9c000000-0000-4000-8000-000000000001',
    (select season_empty from tap_meta)
  ),
  true,
  'UNE SECONDE SAISON PEUT ÊTRE OUVERTE : le blocage historique est levé'
);
select results_eq(
  $$select
      (select count(*) from public.progression_seasons
        where organization_id = '9c000000-0000-4000-8000-000000000001'
          and status = 'active'),
      (select count(*) from public.progression_seasons
        where organization_id = '9c000000-0000-4000-8000-000000000001'
          and status = 'ended')$$,
  $$values (1::bigint, 1::bigint)$$,
  'l''organisation a une saison active et une saison close, pas deux actives'
);

-- Archivage : dernière étape du cycle, l'archive joueur y survit.
select is(
  public.archive_progression_season(
    '9c000000-0000-4000-8000-000000000001',
    (select season_a from tap_meta)
  ),
  true,
  'une saison close s''archive'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.player_progression_archive(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
  ) #>> '{seasons,0,status}',
  'archived',
  'une saison archivée reste lisible par le joueur'
);
select is(
  (public.player_progression_snapshot(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001') ->> 'keys')::integer,
  0,
  'sur la saison 2, le joueur repart à zéro sans perdre son archive'
);

-- ── ISOLATION D'ERREUR DU MOTEUR ────────────────────────────
-- Un événement sert DEUX missions. On rend l'une d'elles impossible à
-- appliquer : l'autre doit rester acquise, l'événement analytique doit
-- réussir, et l'échec doit laisser une trace nommant la mission fautive.
select is(
  (select count(*)::integer from public.progression_engine_failures),
  0,
  'le scénario nominal n''a produit aucune panne du moteur'
);
do $$
begin
  execute pg_catalog.format(
    'alter table public.progression_player_badges '
    || 'add constraint tap_meta_boom check (badge_id <> %L)',
    (select badge_s2 from tap_meta)
  );
end;
$$;

insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at, idempotency_key
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_completed', 'campaign',
  '9c000000-0000-4000-8000-000000000011', 'qr',
  '9c000000-0000-4000-8000-0000000000f1', now(), 'tap-meta-engine-isolation'
);

select is(
  (select count(*)::integer from public.experience_events
    where idempotency_key = 'tap-meta-engine-isolation'),
  1,
  'le trigger ne fait JAMAIS échouer l''événement analytique qui le déclenche'
);
select ok(
  (select completed_at is not null from public.progression_mission_progress
    where mission_id = (select mission_s2_ok from tap_meta)),
  'ISOLATION : la mission saine est appliquée malgré l''échec de sa voisine'
);
select is(
  (select keys_balance from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'
      and season_id = (select season_empty from tap_meta)),
  4,
  'la mission saine crédite bien ses clés'
);
select is(
  (select count(*)::integer from public.progression_mission_progress
    where mission_id = (select mission_s2_fail from tap_meta)),
  0,
  'ISOLATION : la mission en échec ne laisse aucune progression partielle'
);
select is(
  (select count(*)::integer from public.progression_engine_failures),
  1,
  'l''échec laisse exactement une trace'
);
select is(
  (select mission_id from public.progression_engine_failures),
  (select mission_s2_fail from tap_meta),
  'la trace désigne la mission fautive, pas l''événement entier'
);
select ok(
  (select organization_id = '9c000000-0000-4000-8000-000000000001'
      and season_id = (select season_empty from tap_meta)
      and analytics_event_id is not null
      and sqlstate = '23514'
     from public.progression_engine_failures),
  'la trace est exploitable : tenant, saison, événement et SQLSTATE réel'
);
-- F3 : un journal d'exploitation ne porte pas d'identité joueur. mission_id
-- et analytics_event_id suffisent au diagnostic, et l'événement analytique
-- a sa propre rétention.
select is(
  (select player_id from public.progression_engine_failures),
  null::uuid,
  'F3 : la trace ne recopie AUCUNE identité joueur'
);

alter table public.progression_player_badges drop constraint tap_meta_boom;

-- ── M3 : interrupteur d'arrêt sur une saison LANCÉE ─────────
-- Il n'existait aucun moyen d'arrêter une mécanique en cours : les RPC
-- d'édition sont bornées au brouillon, donc `enabled` l'était aussi. Le
-- seul recours était de clôturer TOUTE la saison, ce qui bascule chaque
-- joueur sur son archive.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a2"}',
  true);
select throws_ok(
  $$select public.set_progression_mission_enabled(
      '9c000000-0000-4000-8000-000000000001',
      (select mission_s2_ok from tap_meta), false)$$,
  '42501', 'not authorized',
  'un caissier ne coupe pas une mission'
);
select throws_ok(
  $$select public.set_progression_chest_enabled(
      '9c000000-0000-4000-8000-000000000001',
      (select chest_s2 from tap_meta), false)$$,
  '42501', 'not authorized',
  'un caissier ne coupe pas un coffre'
);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);
select throws_ok(
  $$select public.set_progression_mission_enabled(
      '9c000000-0000-4000-8000-000000000001',
      (select mission_b from tap_meta), false)$$,
  'P0001', 'open mission not found',
  'CLOISONNEMENT : A ne coupe pas la mission de B'
);
select throws_ok(
  $$select public.set_progression_chest_enabled(
      '9c000000-0000-4000-8000-000000000001',
      (select chest_a from tap_meta), false)$$,
  'P0001', 'open chest not found',
  'un coffre de saison archivée n''a plus d''interrupteur'
);
select throws_ok(
  $$select public.set_progression_mission_enabled(
      '9c000000-0000-4000-8000-000000000001',
      (select mission_s2_ok from tap_meta), null)$$,
  '22023', 'invalid mission',
  'l''interrupteur exige une valeur explicite'
);

select is(
  public.set_progression_mission_enabled(
    '9c000000-0000-4000-8000-000000000001',
    (select mission_s2_ok from tap_meta), false),
  true,
  'M3 : une mission d''une saison ACTIVE peut être coupée'
);
select results_eq(
  $$select enabled, key_reward, active_rule_version
      from public.progression_missions
     where id = (select mission_s2_ok from tap_meta)$$,
  $$values (false, 4, 1)$$,
  'M3 : SEUL enabled change — ni la dotation, ni la version de règle'
);
select is(
  (select count(*)::integer from public.progression_mission_versions
    where mission_id = (select mission_s2_ok from tap_meta)),
  1,
  'M3 : couper une mission n''ajoute aucune version de règle'
);
select is(
  (select count(*)::integer from public.audit_logs
    where organization_id = '9c000000-0000-4000-8000-000000000001'
      and action = 'progression.mission.enabled'),
  1,
  'couper une mécanique en direct est journalisé'
);
-- Rebasculer sur la MÊME valeur ne journalise pas une seconde fois.
select is(
  public.set_progression_mission_enabled(
    '9c000000-0000-4000-8000-000000000001',
    (select mission_s2_ok from tap_meta), false),
  true,
  'l''interrupteur est idempotent'
);
select is(
  (select count(*)::integer from public.audit_logs
    where organization_id = '9c000000-0000-4000-8000-000000000001'
      and action = 'progression.mission.enabled'),
  1,
  'un basculement sans changement réel n''écrit pas de second audit'
);
-- La seconde mission de la saison écoute le même événement : on la coupe
-- aussi, pour que le prochain événement ne puisse alimenter PERSONNE.
select is(
  public.set_progression_mission_enabled(
    '9c000000-0000-4000-8000-000000000001',
    (select mission_s2_fail from tap_meta), false),
  true,
  'la seconde mission de la saison est coupée aussi'
);
select is(
  (select count(*)::integer from public.audit_logs
    where organization_id = '9c000000-0000-4000-8000-000000000001'
      and action = 'progression.mission.enabled'),
  2,
  'chaque coupure réelle a sa ligne d''audit'
);

-- Le moteur cesse immédiatement de servir les missions coupées.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  source, player_id, occurred_at, idempotency_key
) values (
  '9c000000-0000-4000-8000-000000000001', 'experience_completed', 'campaign',
  '9c000000-0000-4000-8000-000000000012', 'qr',
  '9c000000-0000-4000-8000-0000000000f1', now(), 'tap-meta-after-kill'
);
select is(
  (select keys_balance from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'
      and season_id = (select season_empty from tap_meta)),
  4,
  'M3 : une mission coupée ne distribue plus rien, immédiatement'
);
select is(
  (select count(*)::integer from public.progression_mission_contributions c
     join public.progression_mission_progress p on p.id = c.progress_id
    where p.mission_id = (select mission_s2_ok from tap_meta)),
  1,
  'M3 : aucune contribution nouvelle sur une mission coupée'
);
select is(
  (select count(*)::integer from public.progression_mission_progress
    where mission_id = (select mission_s2_fail from tap_meta)),
  0,
  'M3 : la mission coupée n''ouvre même pas de progression'
);
select is(
  (select count(*)::integer from public.progression_player_badges
    where player_id = '9c000000-0000-4000-8000-0000000000f1'
      and season_id = (select season_empty from tap_meta)),
  0,
  'M3 : aucun badge n''est distribué par une mission coupée'
);

-- Coffre : le même interrupteur, la même portée.
select is(
  pg_catalog.jsonb_array_length(
    public.player_progression_snapshot(
      repeat('a', 64), '9c000000-0000-4000-8000-000000000001') -> 'chests'),
  1,
  'le coffre de la saison 2 est bien offert au joueur'
);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);
select is(
  public.set_progression_chest_enabled(
    '9c000000-0000-4000-8000-000000000001',
    (select chest_s2 from tap_meta), false),
  true,
  'M3 : un coffre d''une saison ACTIVE peut être coupé'
);
select results_eq(
  $$select enabled, key_cost from public.progression_chests
     where id = (select chest_s2 from tap_meta)$$,
  $$values (false, 2)$$,
  'M3 : SEUL enabled change — le prix du coffre est intact'
);
select is(
  (select count(*)::integer from public.audit_logs
    where organization_id = '9c000000-0000-4000-8000-000000000001'
      and action = 'progression.chest.enabled'),
  1,
  'couper un coffre est journalisé aussi'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  pg_catalog.jsonb_array_length(
    public.player_progression_snapshot(
      repeat('a', 64), '9c000000-0000-4000-8000-000000000001') -> 'chests'),
  0,
  'M3 : le coffre coupé disparaît de l''écran joueur'
);
select is(
  (select public.open_progression_chest(
     repeat('a', 64), '9c000000-0000-4000-8000-000000000001',
     chest_s2, '9c000000-0000-4000-8000-00000000e009') from tap_meta),
  null::jsonb,
  'M3 : un coffre coupé n''est plus ouvrable'
);
-- Et il se rallume.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);
select is(
  public.set_progression_chest_enabled(
    '9c000000-0000-4000-8000-000000000001',
    (select chest_s2 from tap_meta), true),
  true,
  'l''interrupteur se rallume'
);
select is(
  (select count(*)::integer from public.audit_logs
    where organization_id = '9c000000-0000-4000-8000-000000000001'
      and action = 'progression.chest.enabled'),
  2,
  'le rallumage est journalisé comme la coupure'
);

-- ══════════════════════════════════════════════════════════════
-- (i) INVARIANT PRODUIT : aucun code de caisse n'est créé ici
-- ══════════════════════════════════════════════════════════════
-- En-tête de la migration : « Les clés, badges, objets et coffres de ce
-- module sont des marqueurs d'engagement NON MONÉTAIRES. Aucun code de
-- caisse n'est créé ici. » Le scénario complet vient de se dérouler :
-- deux saisons, 7 missions, 2 badges, 3 objets, 2 coffres ouverts.
select is(
  (select count(*)::integer from public.reward_issuances),
  0,
  'INVARIANT : le parcours complet n''émet AUCUNE récompense commerciale'
);
select is(
  (select count(*)::integer from public.participations),
  0,
  'INVARIANT : aucune participation encaissable n''est créée'
);
select is(
  (select count(*)::integer
     from tap_progression_tables t
     join pg_catalog.pg_attribute a
       on a.attrelid = ('public.' || t.name)::regclass
    where a.attnum > 0
      and not a.attisdropped
      and a.attname in (
        'code', 'redeem_code', 'redeemed_at', 'redeemed_by',
        'redeem_expires_at', 'basket_cents', 'wallet_status',
        'code_ttl_seconds'
      )),
  0,
  'INVARIANT : aucune table du module ne porte de colonne de code de caisse'
);
-- Aucun chemin du module ne touche le registre universel ni la caisse.
-- (is_valid_progression_rule est volontairement hors liste : elle cite
-- le nom d'événement analytics « reward_redeemed », qui n'est pas un code.)
select is(
  (select count(*)::integer from tap_progression_functions f
    where pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(f.sig))
      ~* '(reward_issuances|redeem|participations|prizes)'),
  0,
  'INVARIANT : aucune des 28 fonctions ne touche la caisse ni le registre'
);

-- ══════════════════════════════════════════════════════════════
-- (j) Purge RGPD : les états joueurs partent, la configuration reste
-- ══════════════════════════════════════════════════════════════
-- État avant purge : 8 contributions pour le joueur de A sur la saison 1
-- (3 lancements, 1 chasse, 2 complétions distinctes, 1 lot QR, 1 retour),
-- 1 pour lui sur la saison 2, 1 pour le joueur de B.
select is(
  (select count(*)::integer from public.progression_mission_contributions),
  10,
  'le scénario a journalisé dix contributions, tenants et saisons confondus'
);

select throws_ok(
  $$select public.purge_expired_meta_progression()$$,
  '42501', 'not authorized',
  'un commerçant ne déclenche pas la purge'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.purge_expired_meta_progression(),
  0::bigint,
  'la purge ne touche pas un joueur encore actif'
);

-- Correctif 20260805210000 : la fenêtre se mesure sur l'activité RÉELLE
-- dans la saison (player_season.last_progress_at) et non plus sur
-- membership.last_seen_at, qui ne dit rien de la progression. On vieillit
-- donc la SEULE saison 1 du joueur de A : sa saison 2 doit survivre.
update public.progression_player_seasons
   set last_progress_at = now() - interval '13 months'
 where player_id = '9c000000-0000-4000-8000-0000000000f1'
   and season_id = (select season_a from tap_meta);
-- La preuve que la colonne a bien changé : l'adhésion tenant, elle, reste
-- toute fraîche. Sous l'ancienne implémentation, rien n'aurait été purgé.
select ok(
  (select last_seen_at > now() - interval '1 hour'
     from public.player_organization_memberships
    where id = '9c000000-0000-4000-8000-0000000000c1'),
  'l''adhésion tenant du joueur est récente : seule la progression a vieilli'
);
select is(
  public.purge_expired_meta_progression(),
  1::bigint,
  'la purge retire la saison joueur au-delà de la rétention'
);

select is(
  (select count(*)::integer from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'
      and season_id = (select season_a from tap_meta)),
  0,
  'la saison joueur purgée a disparu'
);
select is(
  (select count(*)::integer from public.progression_player_seasons
    where player_id = '9c000000-0000-4000-8000-0000000000f1'
      and season_id = (select season_empty from tap_meta)),
  1,
  'la purge est par SAISON : la progression en cours du même joueur reste'
);
select results_eq(
  $$select
      (select count(*) from public.progression_mission_progress
        where player_id = '9c000000-0000-4000-8000-0000000000f1'
          and season_id = (select season_a from tap_meta)),
      (select count(*) from public.progression_player_badges
        where player_id = '9c000000-0000-4000-8000-0000000000f1'
          and season_id = (select season_a from tap_meta)),
      (select count(*) from public.progression_player_items
        where player_id = '9c000000-0000-4000-8000-0000000000f1'
          and season_id = (select season_a from tap_meta)),
      (select count(*) from public.progression_chest_openings
        where player_id = '9c000000-0000-4000-8000-0000000000f1'
          and season_id = (select season_a from tap_meta))$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  'la cascade emporte progression, badges, objets et ouvertures'
);
-- progression_mission_contributions ne porte pas organization_id : la
-- preuve de cascade est donc le total, qui tombe de 10 aux deux seules
-- contributions encore rattachées (saison 2 du joueur de A, saison de B).
select is(
  (select count(*)::integer from public.progression_mission_contributions),
  2,
  'les contributions de la saison purgée partent, les autres restent'
);
select results_eq(
  $$select
      (select count(*) from public.progression_seasons
        where organization_id = '9c000000-0000-4000-8000-000000000001'),
      (select count(*) from public.progression_missions
        where organization_id = '9c000000-0000-4000-8000-000000000001'),
      (select count(*) from public.progression_mission_versions
        where organization_id = '9c000000-0000-4000-8000-000000000001'),
      (select count(*) from public.progression_badges
        where organization_id = '9c000000-0000-4000-8000-000000000001'),
      (select count(*) from public.progression_collections
        where organization_id = '9c000000-0000-4000-8000-000000000001'),
      (select count(*) from public.progression_collection_items
        where organization_id = '9c000000-0000-4000-8000-000000000001'),
      (select count(*) from public.progression_chests
        where organization_id = '9c000000-0000-4000-8000-000000000001'),
      (select count(*) from public.progression_chest_items
        where organization_id = '9c000000-0000-4000-8000-000000000001')$$,
  $$values (
    2::bigint, 7::bigint, 7::bigint, 2::bigint,
    2::bigint, 4::bigint, 3::bigint, 5::bigint
  )$$,
  'PURGE : la configuration de saison est intégralement conservée'
);
select is(
  (select count(*)::integer from public.progression_player_seasons
    where organization_id = '9c000000-0000-4000-8000-000000000002'),
  1,
  'la purge d''un tenant ne touche pas la progression de l''autre'
);

-- Seconde correction : une organisation SANS rétention déclarée
-- n'échappait jamais à la purge — le filtre exigeait
-- data_retention_months not null. Elle retombe désormais sur le plafond
-- de 24 mois.
update public.organizations
   set data_retention_months = null
 where id = '9c000000-0000-4000-8000-000000000002';
update public.progression_player_seasons
   set last_progress_at = now() - interval '25 months'
 where organization_id = '9c000000-0000-4000-8000-000000000002';
select is(
  public.purge_expired_meta_progression(),
  1::bigint,
  'une organisation sans rétention déclarée n''échappe plus à la purge'
);
select is(
  (select count(*)::integer from public.progression_player_seasons
    where organization_id = '9c000000-0000-4000-8000-000000000002'),
  0,
  'la progression du tenant sans rétention est bien partie'
);

-- F3 : le journal moteur était trimé à 90 jours en dur, alors que les
-- scopes joueur respectent data_retention_months. Il suit désormais la
-- même règle (ici 12 mois pour l'organisation A).
select is(
  (select count(*)::integer from public.progression_engine_failures),
  1,
  'la trace du moteur est encore là avant son échéance'
);
update public.progression_engine_failures
   set failed_at = now() - interval '13 months';
select is(
  public.purge_expired_meta_progression(),
  0::bigint,
  'la purge du journal moteur ne compte pas dans les saisons joueurs purgées'
);
select is(
  (select count(*)::integer from public.progression_engine_failures),
  0,
  'F3 : le journal moteur suit la rétention déclarée de son organisation'
);

-- F4 : une saison qui atteint ends_at sans être close disparaissait des
-- DEUX vues — le snapshot exige ends_at > now(), l'archive exigeait
-- ended/archived. Les badges du joueur s'effaçaient de son écran jusqu'à
-- une action du commerçant.
update public.progression_seasons
   set ends_at = now() - interval '1 minute'
 where id = (select season_empty from tap_meta);
select is(
  public.player_progression_snapshot(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001'),
  null::jsonb,
  'la fenêtre passée ferme bien la vue « saison en cours »'
);
select is(
  pg_catalog.jsonb_array_length(
    public.player_progression_archive(
      repeat('a', 64), '9c000000-0000-4000-8000-000000000001') -> 'seasons'),
  1,
  'F4 : la saison expirée mais non close reste lisible dans l''archive'
);
select is(
  public.player_progression_archive(
    repeat('a', 64), '9c000000-0000-4000-8000-000000000001'
  ) #>> '{seasons,0,status}',
  'active',
  'F4 : l''archive l''annonce encore active — la clôture reste au commerçant'
);

-- ══════════════════════════════════════════════════════════════
-- (k) Édition et suppression, BORNÉES à une saison brouillon
-- ══════════════════════════════════════════════════════════════
-- Arbitrage produit : corriger une faute de frappe, jamais réécrire sous
-- les joueurs. Les entités de la saison 1 (archivée) et de la saison 2
-- (active) doivent être refusées ; celles d'un brouillon acceptées.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);

select throws_ok(
  $$select public.update_progression_badge(
      '9c000000-0000-4000-8000-000000000001',
      (select badge_a from tap_meta), 'Renommé trop tard')$$,
  'P0001', 'draft badge not found',
  'un badge de saison archivée n''est plus modifiable'
);
select throws_ok(
  $$select public.update_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select mission_s2_ok from tap_meta), 'Réécrite en direct', '',
      'experience_completed', 1, array['campaign']::text[])$$,
  'P0001', 'draft mission not found',
  'une mission de saison ACTIVE ne se réécrit pas sous les joueurs'
);
select throws_ok(
  $$select public.delete_progression_chest(
      '9c000000-0000-4000-8000-000000000001',
      (select chest_a from tap_meta))$$,
  'P0001', 'draft chest not found',
  'un coffre déjà joué ne se supprime pas'
);

-- Terrain de rebut : une saison brouillon complète.
update tap_meta set season_scrap = public.create_progression_season(
  '9c000000-0000-4000-8000-000000000001',
  'Saison brouillon',
  now() + interval '100 days',
  now() + interval '130 days'
);
update tap_meta set badge_s = public.create_progression_badge(
  '9c000000-0000-4000-8000-000000000001', season_scrap, 'Badge rebut');
update tap_meta set collection_s = public.create_progression_collection(
  '9c000000-0000-4000-8000-000000000001', season_scrap, 'Collection rebut');
update tap_meta set item_s1 = public.create_progression_collection_item(
  '9c000000-0000-4000-8000-000000000001', collection_s, 'Objet rebut 1');
update tap_meta set item_s2 = public.create_progression_collection_item(
  '9c000000-0000-4000-8000-000000000001', collection_s, 'Objet rebut 2');
update tap_meta set mission_s = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000001',
  season_scrap,
  'Mission rebut',
  'À corriger',
  'experience_started',
  2,
  array['campaign']::text[],
  p_badge_id => badge_s,
  p_collection_item_id => item_s1
);
update tap_meta set chest_s = public.create_progression_chest(
  '9c000000-0000-4000-8000-000000000001',
  season_scrap, 'Coffre rebut', '', 3, array[item_s1, item_s2]);

-- ── Contre-épreuve : en brouillon, tout est corrigeable ──
select is(
  public.update_progression_badge(
    '9c000000-0000-4000-8000-000000000001',
    (select badge_s from tap_meta), 'Badge corrigé', 'Faute réparée', 'crown'),
  true,
  'un badge de brouillon se corrige'
);
select results_eq(
  $$select name, icon_key from public.progression_badges
     where id = (select badge_s from tap_meta)$$,
  $$values ('Badge corrigé'::text, 'crown'::text)$$,
  'la correction du badge est bien enregistrée'
);
select throws_ok(
  $$select public.update_progression_badge(
      '9c000000-0000-4000-8000-000000000001',
      (select badge_s from tap_meta), 'Icône inventée', '', 'licorne')$$,
  '22023', 'invalid badge',
  'une icône hors catalogue reste refusée à l''édition'
);
select is(
  public.update_progression_collection(
    '9c000000-0000-4000-8000-000000000001',
    (select collection_s from tap_meta), 'Collection corrigée'),
  true,
  'une collection de brouillon se corrige'
);
select is(
  public.update_progression_collection_item(
    '9c000000-0000-4000-8000-000000000001',
    (select item_s1 from tap_meta), 'Objet corrigé', '',
    'https://exemple.test/objet.webp', 7),
  true,
  'un objet de collection de brouillon se corrige'
);
select results_eq(
  $$select item.name, item.position from public.progression_collection_items item
     where item.id = (select item_s1 from tap_meta)$$,
  $$values ('Objet corrigé'::text, 7)$$,
  'nom et position de l''objet sont bien réécrits'
);
select throws_ok(
  $$select public.update_progression_collection_item(
      '9c000000-0000-4000-8000-000000000001',
      (select item_s1 from tap_meta), 'Image en clair', '',
      'http://exemple.test/objet.webp')$$,
  '22023', 'invalid collection item',
  'une image non HTTPS reste refusée à l''édition'
);

-- La règle d'une mission n'est jamais réécrite en place : une NOUVELLE
-- version est ajoutée et devient active.
select is(
  public.update_progression_mission(
    '9c000000-0000-4000-8000-000000000001',
    (select mission_s from tap_meta),
    'Mission corrigée',
    'Cible revue',
    'experience_completed',
    5,
    array['campaign', 'hunt']::text[],
    p_key_reward => 9,
    p_badge_id => (select badge_s from tap_meta),
    p_collection_item_id => (select item_s1 from tap_meta)
  ),
  2,
  'l''édition d''une mission rend le numéro de sa NOUVELLE version'
);
select results_eq(
  $$select name, active_rule_version, key_reward
      from public.progression_missions
     where id = (select mission_s from tap_meta)$$,
  $$values ('Mission corrigée'::text, 2, 9)$$,
  'la mission pointe désormais sur sa version 2'
);
select is(
  (select count(*)::integer from public.progression_mission_versions
    where mission_id = (select mission_s from tap_meta)),
  2,
  'la version 1 reste en base : le journal des règles est immuable'
);
select results_eq(
  $$select rule ->> 'target' from public.progression_mission_versions
     where mission_id = (select mission_s from tap_meta)
     order by version$$,
  $$values ('2'::text), ('5'::text)$$,
  'chaque version garde la règle qu''elle portait'
);
select throws_ok(
  $$select public.update_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select mission_s from tap_meta), 'Cible absurde', '',
      'experience_started', 0, array['campaign']::text[])$$,
  '22023', 'invalid mission',
  'les bornes de règle valent aussi à l''édition'
);
select throws_ok(
  $$select public.update_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select mission_s from tap_meta), 'Badge étranger', '',
      'experience_started', 1, array['campaign']::text[],
      p_badge_id => (select badge_a from tap_meta))$$,
  'P0001', 'badge not found',
  'l''édition ne peut pas greffer le badge d''une autre saison'
);

update tap_meta set seed_before = (
  select loot_seed from public.progression_chests
   where id = (select chest_s from tap_meta)
);
select is(
  public.update_progression_chest(
    '9c000000-0000-4000-8000-000000000001',
    (select chest_s from tap_meta), 'Coffre corrigé', '', 6,
    array[(select item_s2 from tap_meta)]),
  true,
  'un coffre de brouillon se corrige, butin compris'
);
-- INFO (20260805220000) : un butin neuf mérite une graine neuve. Sans
-- conséquence aujourd'hui (le butin ne change qu'en brouillon, sans
-- ouverture), définitif le jour où la graine fuiterait.
select isnt(
  (select loot_seed from public.progression_chests
    where id = (select chest_s from tap_meta)),
  (select seed_before from tap_meta),
  'remplacer le butin fait tourner la graine de tirage'
);
select results_eq(
  $$select
      (select key_cost from public.progression_chests
        where id = (select chest_s from tap_meta)),
      (select count(*)::integer from public.progression_chest_items
        where chest_id = (select chest_s from tap_meta))$$,
  $$values (6, 1)$$,
  'le butin du coffre est remplacé, pas cumulé'
);
select throws_ok(
  $$select public.update_progression_chest(
      '9c000000-0000-4000-8000-000000000001',
      (select chest_s from tap_meta), 'Coffre vide', '', 6,
      array[]::uuid[])$$,
  '22023', 'invalid chest',
  'un coffre sans butin reste refusé à l''édition'
);

-- ── RÉFÉRENCES ORPHELINES : refus explicite et actionnable ──
select throws_ok(
  $$select public.delete_progression_badge(
      '9c000000-0000-4000-8000-000000000001',
      (select badge_s from tap_meta))$$,
  'P0001', 'badge used by a mission',
  'supprimer un badge encore récompensé est refusé, avec un motif lisible'
);
select throws_ok(
  $$select public.delete_progression_collection_item(
      '9c000000-0000-4000-8000-000000000001',
      (select item_s1 from tap_meta))$$,
  'P0001', 'collection item used by a mission',
  'supprimer un objet encore récompensé est refusé, avec un motif lisible'
);
select throws_ok(
  $$select public.delete_progression_collection(
      '9c000000-0000-4000-8000-000000000001',
      (select collection_s from tap_meta))$$,
  'P0001', 'collection item used by a mission',
  'supprimer la collection d''un objet récompensé est refusé de la même façon'
);
select throws_ok(
  $$select public.delete_progression_collection_item(
      '9c000000-0000-4000-8000-000000000001',
      (select item_s2 from tap_meta))$$,
  'P0001', 'chest would be left empty',
  'supprimer le dernier objet d''un coffre est refusé : un coffre a du butin'
);

-- La mission relâche ses références : la suppression redevient possible.
select is(
  public.update_progression_mission(
    '9c000000-0000-4000-8000-000000000001',
    (select mission_s from tap_meta),
    'Mission sans récompense',
    '',
    'experience_started',
    1,
    array['campaign']::text[]
  ),
  3,
  'une nouvelle version détache le badge et l''objet de la mission'
);
select is(
  public.delete_progression_badge(
    '9c000000-0000-4000-8000-000000000001',
    (select badge_s from tap_meta)),
  true,
  'le badge déréférencé se supprime'
);
select is(
  (select count(*)::integer from public.progression_badges
    where id = (select badge_s from tap_meta)),
  0,
  'le badge a bien disparu'
);
-- L'objet 1 n'est plus dans le coffre (butin remplacé plus haut) ni cité
-- par la mission : sa suppression est propagée sans casser personne.
select is(
  public.delete_progression_collection_item(
    '9c000000-0000-4000-8000-000000000001',
    (select item_s1 from tap_meta)),
  true,
  'un objet libre de toute référence se supprime'
);
select is(
  public.delete_progression_chest(
    '9c000000-0000-4000-8000-000000000001',
    (select chest_s from tap_meta)),
  true,
  'un coffre jamais ouvert se supprime'
);
select is(
  (select count(*)::integer from public.progression_chest_items
    where chest_id = (select chest_s from tap_meta)),
  0,
  'le butin du coffre supprimé part avec lui'
);
select is(
  public.delete_progression_collection(
    '9c000000-0000-4000-8000-000000000001',
    (select collection_s from tap_meta)),
  true,
  'une collection libre se supprime'
);
select is(
  (select count(*)::integer from public.progression_collection_items
    where collection_id = (select collection_s from tap_meta)),
  0,
  'les objets restants partent avec leur collection'
);
select is(
  public.delete_progression_mission(
    '9c000000-0000-4000-8000-000000000001',
    (select mission_s from tap_meta)),
  true,
  'une mission sans progression joueur se supprime'
);
select is(
  (select count(*)::integer from public.progression_mission_versions
    where mission_id = (select mission_s from tap_meta)),
  0,
  'les versions de règle partent avec leur mission'
);
select throws_ok(
  $$select public.delete_progression_mission(
      '9c000000-0000-4000-8000-000000000001',
      (select mission_s2_ok from tap_meta))$$,
  'P0001', 'draft mission not found',
  'une mission déjà jouée n''est pas supprimable'
);

-- Un caissier n'édite ni ne supprime rien, même en brouillon.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a2"}',
  true);
select throws_ok(
  $$select public.update_progression_collection(
      '9c000000-0000-4000-8000-000000000001',
      (select collection_s from tap_meta), 'Pirate')$$,
  '42501', 'not authorized',
  'un caissier ne corrige pas une collection'
);
select throws_ok(
  $$select public.delete_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_scrap from tap_meta))$$,
  '42501', 'not authorized',
  'un caissier ne supprime pas une saison brouillon'
);
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"9c000000-0000-4000-8000-0000000000a1"}',
  true);

-- ── Suppression d'une saison brouillon ENTIÈRE ──
-- Le cas qui échouait avant le correctif : une mission référence encore
-- son badge ET son objet, et la suppression doit passer quand même.
update tap_meta set season_doomed = public.create_progression_season(
  '9c000000-0000-4000-8000-000000000001',
  'Saison condamnée',
  now() + interval '200 days',
  now() + interval '230 days'
);
update tap_meta set badge_d = public.create_progression_badge(
  '9c000000-0000-4000-8000-000000000001', season_doomed, 'Badge condamné');
update tap_meta set collection_d = public.create_progression_collection(
  '9c000000-0000-4000-8000-000000000001', season_doomed, 'Collection condamnée');
update tap_meta set item_d = public.create_progression_collection_item(
  '9c000000-0000-4000-8000-000000000001', collection_d, 'Objet condamné');
update tap_meta set mission_d = public.create_progression_mission(
  '9c000000-0000-4000-8000-000000000001',
  season_doomed,
  'Mission condamnée',
  '',
  'experience_started',
  1,
  array['campaign']::text[],
  p_badge_id => badge_d,
  p_collection_item_id => item_d
);

select throws_ok(
  $$select public.delete_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_empty from tap_meta))$$,
  'P0001', 'draft season not found',
  'une saison ACTIVE ne se supprime pas'
);
select throws_ok(
  $$select public.delete_progression_season(
      '9c000000-0000-4000-8000-000000000001',
      (select season_a from tap_meta))$$,
  'P0001', 'draft season not found',
  'une saison archivée ne se supprime pas non plus'
);
select is(
  public.delete_progression_season(
    '9c000000-0000-4000-8000-000000000001',
    (select season_doomed from tap_meta)),
  true,
  'une saison brouillon se supprime entièrement, références intactes'
);
select results_eq(
  $$select
      (select count(*) from public.progression_seasons
        where id = (select season_doomed from tap_meta)),
      (select count(*) from public.progression_missions
        where season_id = (select season_doomed from tap_meta)),
      (select count(*) from public.progression_mission_versions
        where season_id = (select season_doomed from tap_meta)),
      (select count(*) from public.progression_badges
        where season_id = (select season_doomed from tap_meta)),
      (select count(*) from public.progression_collections
        where season_id = (select season_doomed from tap_meta)),
      (select count(*) from public.progression_collection_items
        where season_id = (select season_doomed from tap_meta))$$,
  $$values (
    0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint
  )$$,
  'la suppression de la saison emporte badges, collections et missions'
);
select is(
  public.delete_progression_season(
    '9c000000-0000-4000-8000-000000000001',
    (select season_scrap from tap_meta)),
  true,
  'la saison de rebut vidée se supprime aussi'
);
select is(
  (select count(*)::integer from public.progression_seasons
    where organization_id = '9c000000-0000-4000-8000-000000000001'),
  2,
  'il ne reste que les deux saisons réellement jouées'
);

-- ══════════════════════════════════════════════════════════════
-- (l) Cascade tenant
-- ══════════════════════════════════════════════════════════════
-- La mission de B récompense un badge de B. Avec l'ancien ON DELETE
-- RESTRICT, cette suppression échouait : la cascade atteignait les badges
-- avant les missions et refusait, alors que les missions partaient dans la
-- même instruction.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  (select badge_id is not null from public.progression_missions
    where id = (select mission_b from tap_meta)),
  'la mission de B référence bien un badge : la cascade est discriminante'
);
select lives_ok(
  $$delete from public.organizations
     where id = '9c000000-0000-4000-8000-000000000002'$$,
  'supprimer une organisation dont une mission récompense un badge PASSE'
);
select is(
  (select count(*)::integer from public.progression_seasons
    where organization_id = '9c000000-0000-4000-8000-000000000002'),
  0,
  'la suppression d''une organisation emporte ses saisons (cascade)'
);
select ok(
  (select count(*) > 0 from public.progression_seasons
    where organization_id = '9c000000-0000-4000-8000-000000000001'),
  'la saison de l''autre organisation est intacte'
);

select * from finish();
rollback;
