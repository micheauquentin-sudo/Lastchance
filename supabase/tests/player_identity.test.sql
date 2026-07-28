-- ============================================================
-- Identité joueur progressive : pseudonymisation, lazy-link,
-- isolation tenant, ACL et rotation du cookie global.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.organizations (id, name, slug)
values
  ('1d000000-0000-4000-8000-000000000001', 'Identité A', 'tap-player-a'),
  ('1d000000-0000-4000-8000-000000000002', 'Identité B', 'tap-player-b');

insert into public.campaigns (id, organization_id, name, status)
values
  (
    '1d000000-0000-4000-8000-000000000011',
    '1d000000-0000-4000-8000-000000000001',
    'Campagne A',
    'active'
  ),
  (
    '1d000000-0000-4000-8000-000000000012',
    '1d000000-0000-4000-8000-000000000002',
    'Campagne B',
    'active'
  );

insert into public.qr_codes (id, organization_id, campaign_id, slug)
values
  (
    '1d000000-0000-4000-8000-000000000021',
    '1d000000-0000-4000-8000-000000000001',
    '1d000000-0000-4000-8000-000000000011',
    'PLAYERA1'
  ),
  (
    '1d000000-0000-4000-8000-000000000022',
    '1d000000-0000-4000-8000-000000000002',
    '1d000000-0000-4000-8000-000000000012',
    'PLAYERB1'
  );

-- Les cinq tables sont privées et protégées, même pour un membre marchand.
select is(
  (
    select count(*)::integer
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
         'players',
         'player_devices',
         'player_organization_memberships',
         'player_experience_memberships',
         'player_legacy_identities'
       )
       and c.relrowsecurity
  ),
  5,
  'RLS est activée sur toutes les tables centrales'
);

select ok(
  not has_table_privilege('anon', 'public.players', 'SELECT')
    and not has_table_privilege('authenticated', 'public.players', 'SELECT')
    and not has_table_privilege(
      'authenticated',
      'public.player_experience_memberships',
      'SELECT'
    )
    and not has_table_privilege(
      'authenticated',
      'public.player_legacy_identities',
      'SELECT'
    ),
  'aucun visiteur ou commerçant ne peut corréler les identités centrales'
);

select ok(
  has_table_privilege('service_role', 'public.players', 'SELECT')
    and not has_table_privilege('service_role', 'public.players', 'INSERT'),
  'le service role diagnostique les identités mais écrit uniquement par RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.resolve_player_identity(text,uuid,text,uuid,text,text,uuid)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.resolve_player_identity(text,uuid,text,uuid,text,text,uuid)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.resolve_player_identity(text,uuid,text,uuid,text,text,uuid)',
      'EXECUTE'
    ),
  'la résolution pseudonyme est exclusivement serveur'
);

create temporary table tap_first on commit drop as
select *
  from public.resolve_player_identity(
    repeat('a', 64),
    '1d000000-0000-4000-8000-000000000001',
    'campaign',
    '1d000000-0000-4000-8000-000000000011',
    repeat('1', 64),
    'qr',
    '1d000000-0000-4000-8000-000000000021'
  );

select is((select device_created from tap_first), true,
  'le premier passage crée une identité et son device');
select is((select count(*)::integer from public.players), 1,
  'une seule identité centrale est créée');
select is(
  (select count(*)::integer from public.player_organization_memberships),
  1,
  'une adhésion tenant est créée'
);
select is(
  (select count(*)::integer from public.player_experience_memberships),
  1,
  'une adhésion expérience est créée'
);
select is((select count(*)::integer from public.player_legacy_identities), 1,
  'le hash historique est lazy-linké sans recopier le jeton');

create temporary table tap_repeat on commit drop as
select *
  from public.resolve_player_identity(
    repeat('a', 64),
    '1d000000-0000-4000-8000-000000000001',
    'campaign',
    '1d000000-0000-4000-8000-000000000011',
    repeat('1', 64),
    'qr',
    '1d000000-0000-4000-8000-000000000021'
  );

select is(
  (select player_id from tap_repeat),
  (select player_id from tap_first),
  'la résolution est idempotente pour le même cookie'
);
select is(
  (select experience_membership_id from tap_repeat),
  (select experience_membership_id from tap_first),
  'le re-scan réutilise la même adhésion expérience'
);
select is((select count(*)::integer from public.player_devices), 1,
  'le re-scan ne crée aucun device en double');

-- Cookie global recréé, cookie historique conservé : la progression est reprise.
create temporary table tap_lazy_recovery on commit drop as
select *
  from public.resolve_player_identity(
    repeat('b', 64),
    '1d000000-0000-4000-8000-000000000001',
    'campaign',
    '1d000000-0000-4000-8000-000000000011',
    repeat('1', 64),
    'direct',
    null
  );

select is(
  (select player_id from tap_lazy_recovery),
  (select player_id from tap_first),
  'un nouveau lc-player reprend le joueur du cookie historique'
);
select is((select device_created from tap_lazy_recovery), true,
  'la reprise ajoute seulement un nouveau device');

-- L'identifiant d'expérience est toujours validé contre son organisation.
select throws_ok(
  $$select * from public.resolve_player_identity(
      repeat('c', 64),
      '1d000000-0000-4000-8000-000000000001',
      'campaign',
      '1d000000-0000-4000-8000-000000000012',
      repeat('2', 64),
      'direct',
      null
    )$$,
  '23503',
  'player experience does not belong to organization',
  'une campagne d un autre tenant est refusée'
);

select throws_ok(
  $$select * from public.resolve_player_identity(
      repeat('c', 64),
      '1d000000-0000-4000-8000-000000000001',
      'campaign',
      '1d000000-0000-4000-8000-000000000011',
      repeat('2', 64),
      'qr',
      '1d000000-0000-4000-8000-000000000022'
    )$$,
  '23503',
  null,
  'un QR d un autre tenant ne peut pas être attribué à l adhésion'
);

-- Un même hash legacy peut exister dans deux expériences/tenants sans fusion
-- implicite. Le cookie global volontairement partagé reste le seul pont central.
create temporary table tap_other_tenant on commit drop as
select *
  from public.resolve_player_identity(
    repeat('a', 64),
    '1d000000-0000-4000-8000-000000000002',
    'campaign',
    '1d000000-0000-4000-8000-000000000012',
    repeat('1', 64),
    'qr',
    '1d000000-0000-4000-8000-000000000022'
  );

select is(
  (select count(*)::integer from public.player_organization_memberships),
  2,
  'les adhésions restent distinctes par organisation'
);
select is(
  (select player_id from tap_other_tenant),
  (select player_id from tap_first),
  'le cookie global relie le même navigateur sans exposer ce lien aux tenants'
);

-- Rotation : nouveau hash, même joueur, ancien hash révoqué avec grâce courte.
create temporary table tap_rotation on commit drop as
select *
  from public.rotate_player_device(repeat('a', 64), repeat('d', 64));

select is(
  (select player_id from tap_rotation),
  (select player_id from tap_first),
  'la rotation conserve l identité centrale'
);
select ok(
  (
    select revoked_at is not null
       and grace_expires_at > revoked_at
       and replaced_by_device_id = (select device_id from tap_rotation)
      from public.player_devices
     where token_hash = repeat('a', 64)
  ),
  'l ancien device est révoqué et pointe vers son remplaçant'
);
select is(
  (
    select player_id
      from public.lookup_player_identity(
        repeat('d', 64),
        '1d000000-0000-4000-8000-000000000001',
        'campaign',
        '1d000000-0000-4000-8000-000000000011'
      )
  ),
  (select player_id from tap_first),
  'le nouveau hash retrouve la progression lazy-linkée'
);
select is(
  (
    select should_rotate
      from public.resolve_player_identity(
        repeat('a', 64),
        '1d000000-0000-4000-8000-000000000001',
        'campaign',
        '1d000000-0000-4000-8000-000000000011',
        repeat('1', 64),
        'direct',
        null
      )
  ),
  true,
  'l ancien hash reste brièvement utilisable mais impose une nouvelle rotation'
);

update public.player_devices
   set grace_expires_at = now() - interval '1 second'
 where token_hash = repeat('a', 64);
select throws_ok(
  $$select * from public.resolve_player_identity(
      repeat('a', 64),
      '1d000000-0000-4000-8000-000000000001',
      'campaign',
      '1d000000-0000-4000-8000-000000000011',
      repeat('1', 64),
      'direct',
      null
    )$$,
  '22023',
  'expired player device token',
  'un ancien hash ne redevient jamais valide après sa grâce'
);

-- La future liaison nominative n'est possible qu'avec consentement explicite
-- versionné. Aucune RPC publique de liaison n'existe dans cette version.
insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at
) values (
  '1d000000-0000-4000-8000-0000000000a1',
  'authenticated',
  'authenticated',
  'player-consent@test.local',
  '',
  now(),
  now()
);

select throws_ok(
  $$insert into public.players (auth_user_id)
    values ('1d000000-0000-4000-8000-0000000000a1')$$,
  '23514',
  null,
  'une liaison nominative sans preuve de consentement est impossible'
);
select lives_ok(
  $$insert into public.players (
      auth_user_id,
      identity_consent_version,
      identity_consent_at,
      identity_linked_at
    ) values (
      '1d000000-0000-4000-8000-0000000000a1',
      'identity-v1',
      now(),
      now()
    )$$,
  'le modèle accepte une liaison future avec consentement explicite versionné'
);

select * from finish();
rollback;
