-- ============================================================
-- LE FILET, SUITE — RÉSERVATION ET FILES (ID-2, 20261117120000)
--
-- Ce que ce fichier prouve, et rien d'autre :
--   1. les deux familles neuves sont admises par le `check` ET par le
--      validateur de portée, jusqu'au bout du chemin réel ;
--   2. une portée d'un AUTRE locataire reste refusée — le contrôle négatif
--      d'isolation, sans lequel les assertions positives ne valent rien ;
--   3. `lookup_player_legacy_identities` rend TOUTES les anciennes empreintes,
--      de la plus récente à la plus ancienne ;
--   4. elle ne rend JAMAIS l'empreinte d'un autre joueur ;
--   5. les droits : serveur seulement.
--
-- `player_identity.test.sql` reste vert SANS MODIFICATION : c'est la preuve
-- que l'extension n'a rien cassé, et c'est pourquoi la reprise plurielle est
-- une SECONDE fonction plutôt qu'un élargissement de la première.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.organizations (id, name, slug)
values
  ('1e200000-0000-4000-8000-000000000001', 'Filet A', 'tap-filet-a'),
  ('1e200000-0000-4000-8000-000000000002', 'Filet B', 'tap-filet-b');

-- L'activité de A, celle de B (le locataire d'en face), et deux files de A.
insert into public.reservation_activities (id, organization_id, name)
values
  (
    '1e200000-0000-4000-8000-000000000011',
    '1e200000-0000-4000-8000-000000000001',
    'Service du soir'
  ),
  (
    '1e200000-0000-4000-8000-000000000012',
    '1e200000-0000-4000-8000-000000000002',
    'Service du voisin'
  );

-- La file RATTACHÉE à une activité, et la file SANS activité — cette seconde
-- est l'argument structurel qui a fait choisir deux familles plutôt qu'une :
-- `reservation_queues.activity_id` est nullable, donc une file d'accueil peut
-- exister sans activité, et aucune portée `reserver_activity` ne saurait la
-- désigner.
insert into public.reservation_queues (id, organization_id, activity_id, name)
values
  (
    '1e200000-0000-4000-8000-000000000021',
    '1e200000-0000-4000-8000-000000000001',
    '1e200000-0000-4000-8000-000000000011',
    'File du comptoir'
  ),
  (
    '1e200000-0000-4000-8000-000000000022',
    '1e200000-0000-4000-8000-000000000001',
    null,
    'File sans activité'
  ),
  (
    '1e200000-0000-4000-8000-000000000023',
    '1e200000-0000-4000-8000-000000000002',
    null,
    'File du voisin'
  );


-- ────────────────────────────────────────────────────────────
-- 1. LE VALIDATEUR DE PORTÉE CONNAÎT LES DEUX FAMILLES
-- ────────────────────────────────────────────────────────────

select ok(
  public.player_experience_scope_is_valid(
    'reserver_activity',
    '1e200000-0000-4000-8000-000000000011',
    '1e200000-0000-4000-8000-000000000001'
  ),
  'une activité de réservation est une portée valide pour son organisation'
);

select ok(
  public.player_experience_scope_is_valid(
    'reserver_queue',
    '1e200000-0000-4000-8000-000000000021',
    '1e200000-0000-4000-8000-000000000001'
  ),
  'une file d accueil est une portée valide pour son organisation'
);

select ok(
  public.player_experience_scope_is_valid(
    'reserver_queue',
    '1e200000-0000-4000-8000-000000000022',
    '1e200000-0000-4000-8000-000000000001'
  ),
  'une file SANS activité est une portée valide — c est la raison d être de la seconde famille'
);


-- ────────────────────────────────────────────────────────────
-- 2. CONTRÔLE NÉGATIF D'ISOLATION — la portée du voisin est refusée
--
-- Sans ces quatre assertions, les trois précédentes seraient satisfaites par
-- un `return true` posé dans la branche : c'est le second prédicat
-- (`organization_id = p_organization_id`) qu'on vérifie ici, et lui seul
-- empêche de rattacher l'adhésion d'un joueur à l'expérience d'un autre
-- commerçant.
-- ────────────────────────────────────────────────────────────

select ok(
  not public.player_experience_scope_is_valid(
    'reserver_activity',
    '1e200000-0000-4000-8000-000000000012',
    '1e200000-0000-4000-8000-000000000001'
  ),
  'l activité d un AUTRE locataire est refusée comme portée'
);

select ok(
  not public.player_experience_scope_is_valid(
    'reserver_queue',
    '1e200000-0000-4000-8000-000000000023',
    '1e200000-0000-4000-8000-000000000001'
  ),
  'la file d un AUTRE locataire est refusée comme portée'
);

-- Les familles ne se confondent pas entre elles : une file présentée comme une
-- activité est refusée, et réciproquement. Sans ces deux-là, une branche qui
-- interrogerait la mauvaise table passerait toutes les assertions ci-dessus.
select ok(
  not public.player_experience_scope_is_valid(
    'reserver_activity',
    '1e200000-0000-4000-8000-000000000021',
    '1e200000-0000-4000-8000-000000000001'
  ),
  'une file présentée comme une activité est refusée'
);

select ok(
  not public.player_experience_scope_is_valid(
    'reserver_queue',
    '1e200000-0000-4000-8000-000000000011',
    '1e200000-0000-4000-8000-000000000001'
  ),
  'une activité présentée comme une file est refusée'
);

select ok(
  not public.player_experience_scope_is_valid(
    'reserver_activity',
    '1e200000-0000-4000-8000-000000000099',
    '1e200000-0000-4000-8000-000000000001'
  ),
  'une expérience inexistante reste refusée — le deny-by-default tient'
);


-- ────────────────────────────────────────────────────────────
-- 3. LE CHEMIN RÉEL — le `check` et le trigger acceptent les deux familles
--
-- `player_experience_scope_is_valid` peut rendre vrai sans que la ligne passe :
-- le `check` de la colonne et le trigger de portée sont deux gardes distinctes,
-- et une famille admise par l'une et pas par l'autre échoue à l'insertion. On
-- pose donc de vrais ponts.
-- ────────────────────────────────────────────────────────────

create temporary table tap_activite on commit drop as
select *
  from public.resolve_player_identity(
    repeat('a', 64),
    '1e200000-0000-4000-8000-000000000001',
    'reserver_activity',
    '1e200000-0000-4000-8000-000000000011',
    repeat('1', 64),
    'direct',
    null
  );

select is(
  (select device_created from tap_activite),
  true,
  'un pont reserver_activity se pose de bout en bout'
);

create temporary table tap_file on commit drop as
select *
  from public.resolve_player_identity(
    repeat('a', 64),
    '1e200000-0000-4000-8000-000000000001',
    'reserver_queue',
    '1e200000-0000-4000-8000-000000000022',
    repeat('2', 64),
    'direct',
    null
  );

select is(
  (select player_id from tap_file),
  (select player_id from tap_activite),
  'le même appareil garde une seule identité centrale sur les deux familles'
);

select isnt(
  (select experience_membership_id from tap_file),
  (select experience_membership_id from tap_activite),
  'la file et l activité sont DEUX adhésions distinctes, pas une seule'
);

-- Le contrôle négatif du chemin réel : l'activité du voisin, revendiquée par
-- l'organisation A. C'est le trigger de portée qui doit refuser.
select throws_ok(
  $$select * from public.resolve_player_identity(
      repeat('b', 64),
      '1e200000-0000-4000-8000-000000000001',
      'reserver_activity',
      '1e200000-0000-4000-8000-000000000012',
      repeat('3', 64),
      'direct',
      null
    )$$,
  '23503',
  'player experience does not belong to organization',
  'une activité d un autre tenant est refusée à l insertion du pont'
);

select throws_ok(
  $$select * from public.resolve_player_identity(
      repeat('b', 64),
      '1e200000-0000-4000-8000-000000000001',
      'reserver_queue',
      '1e200000-0000-4000-8000-000000000023',
      repeat('3', 64),
      'direct',
      null
    )$$,
  '23503',
  'player experience does not belong to organization',
  'une file d un autre tenant est refusée à l insertion du pont'
);


-- ────────────────────────────────────────────────────────────
-- 4. TOUTES LES ANCIENNES EMPREINTES, DE LA PLUS RÉCENTE À LA PLUS ANCIENNE
--
-- Le joueur a tourné DEUX fois d'appareil : son adhésion porte trois
-- empreintes. `resolve_player_identity` les a posées dans la même transaction,
-- donc toutes avec le même `now()` — on écarte les horodatages à la main pour
-- que l'ordre testé soit celui de la fonction et non celui du hasard.
-- ────────────────────────────────────────────────────────────

insert into public.player_legacy_identities (
  experience_membership_id, player_id, organization_id,
  experience_kind, experience_id, legacy_identity_hash
)
select
  (select experience_membership_id from tap_activite),
  (select player_id from tap_activite),
  '1e200000-0000-4000-8000-000000000001',
  'reserver_activity',
  '1e200000-0000-4000-8000-000000000011',
  h
from (values (repeat('4', 64)), (repeat('5', 64))) as v(h);

update public.player_legacy_identities
   set last_seen_at = now() - interval '30 days',
       first_seen_at = now() - interval '30 days'
 where legacy_identity_hash = repeat('1', 64);
update public.player_legacy_identities
   set last_seen_at = now() - interval '10 days',
       first_seen_at = now() - interval '10 days'
 where legacy_identity_hash = repeat('4', 64);
update public.player_legacy_identities
   set last_seen_at = now() - interval '1 day',
       first_seen_at = now() - interval '1 day'
 where legacy_identity_hash = repeat('5', 64);

select is(
  (
    select array_agg(x.legacy_identity_hash order by x.n)
      from public.lookup_player_legacy_identities(
        repeat('a', 64),
        '1e200000-0000-4000-8000-000000000001',
        'reserver_activity',
        '1e200000-0000-4000-8000-000000000011'
      ) with ordinality as x(
        player_id, experience_membership_id, legacy_identity_hash,
        last_seen_at, n
      )
  ),
  array[repeat('5', 64), repeat('4', 64), repeat('1', 64)]::text[],
  'les trois anciennes empreintes sont rendues, de la plus récente à la plus ancienne'
);

-- L'aînée n'a pas bougé, et la PREMIÈRE ligne de la nouvelle est exactement ce
-- qu'elle rend. C'est la continuité de contrat entre les deux fonctions : la
-- seconde étend la première, elle ne la contredit pas.
select is(
  (
    select legacy_identity_hash
      from public.lookup_player_identity(
        repeat('a', 64),
        '1e200000-0000-4000-8000-000000000001',
        'reserver_activity',
        '1e200000-0000-4000-8000-000000000011'
      )
  ),
  repeat('5', 64),
  'l ancienne fonction rend toujours UNE empreinte, la plus récente'
);


-- ────────────────────────────────────────────────────────────
-- 5. LE CONTRÔLE NÉGATIF QUI COMPTE — jamais l'empreinte d'un autre joueur
--
-- Sans lui, une requête trop large — qui aurait oublié de borner les empreintes
-- à `experience_membership_id`, ou qui serait partie de l'expérience au lieu de
-- l'appareil — passerait l'assertion précédente sans qu'on le voie : elle rend
-- bien les trois attendues, PLUS celles des autres.
-- ────────────────────────────────────────────────────────────

create temporary table tap_voisin on commit drop as
select *
  from public.resolve_player_identity(
    repeat('c', 64),
    '1e200000-0000-4000-8000-000000000001',
    'reserver_activity',
    '1e200000-0000-4000-8000-000000000011',
    repeat('9', 64),
    'direct',
    null
  );

select isnt(
  (select player_id from tap_voisin),
  (select player_id from tap_activite),
  'le second appareil est bien un AUTRE joueur, sur la MÊME expérience'
);

select is(
  (
    select count(*)::integer
      from public.lookup_player_legacy_identities(
        repeat('a', 64),
        '1e200000-0000-4000-8000-000000000001',
        'reserver_activity',
        '1e200000-0000-4000-8000-000000000011'
      ) l
     where l.legacy_identity_hash = repeat('9', 64)
  ),
  0,
  'la reprise ne rend JAMAIS l empreinte d un autre joueur de la même expérience'
);

select is(
  (
    select count(*)::integer
      from public.lookup_player_legacy_identities(
        repeat('a', 64),
        '1e200000-0000-4000-8000-000000000001',
        'reserver_activity',
        '1e200000-0000-4000-8000-000000000011'
      )
  ),
  3,
  'et elle n en rend que trois — l ensemble est borné à l adhésion du demandeur'
);

-- Les portées ne fuient pas entre elles non plus : l'empreinte posée sur la
-- FILE n'apparaît pas dans la reprise de l'ACTIVITÉ, bien que le joueur et
-- l'organisation soient les mêmes.
select is(
  (
    select count(*)::integer
      from public.lookup_player_legacy_identities(
        repeat('a', 64),
        '1e200000-0000-4000-8000-000000000001',
        'reserver_activity',
        '1e200000-0000-4000-8000-000000000011'
      ) l
     where l.legacy_identity_hash = repeat('2', 64)
  ),
  0,
  'l empreinte de la file ne fuit pas dans la reprise de l activité'
);

-- Et l'organisation d'en face ne rend rien du tout, avec le même appareil.
select is(
  (
    select count(*)::integer
      from public.lookup_player_legacy_identities(
        repeat('a', 64),
        '1e200000-0000-4000-8000-000000000002',
        'reserver_activity',
        '1e200000-0000-4000-8000-000000000011'
      )
  ),
  0,
  'la reprise ne traverse pas la frontière de locataire'
);


-- ────────────────────────────────────────────────────────────
-- 6. LES DROITS — serveur seulement
-- ────────────────────────────────────────────────────────────

select ok(
  has_function_privilege(
    'service_role',
    'public.lookup_player_legacy_identities(text,uuid,text,uuid)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.lookup_player_legacy_identities(text,uuid,text,uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.lookup_player_legacy_identities(text,uuid,text,uuid)',
      'EXECUTE'
    ),
  'la reprise plurielle est exclusivement serveur'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.player_experience_scope_is_valid(text,uuid,uuid)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'authenticated',
      'public.player_experience_scope_is_valid(text,uuid,uuid)',
      'EXECUTE'
    ),
  'la garde d isolation reste fermée après son remplacement'
);

select * from finish();
rollback;
