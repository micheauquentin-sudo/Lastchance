-- Invariant base : aucune campagne active ne porte un lot gagnant tirable
-- dont value_cents est NULL ou >= 2000. Ce fichier force la contrainte
-- differee en mode IMMEDIATE afin que chaque refus soit observable par pgTAP.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug)
values (
  'fa000000-0000-4000-8000-000000000001',
  'Invariant valeur',
  'tap-invariant-valeur'
);

insert into auth.users (id, email)
values (
  'fa000000-0000-4000-8000-000000000002',
  'invariant-valeur@tap.local'
);

insert into public.organization_members (organization_id, user_id, role)
values (
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002',
  'owner'
);

insert into public.campaigns
  (id, organization_id, name, status, auto_schedule, starts_at, ends_at)
values
  ('fa000000-0000-4000-8000-000000000101',
   'fa000000-0000-4000-8000-000000000001',
   'Activation manuelle interdite', 'draft', false, null, null),
  ('fa000000-0000-4000-8000-000000000102',
   'fa000000-0000-4000-8000-000000000001',
   'Edition active', 'active', false, null, null),
  ('fa000000-0000-4000-8000-000000000103',
   'fa000000-0000-4000-8000-000000000001',
   'Scheduler interdit', 'draft', true,
   now() - interval '1 hour', now() + interval '1 hour'),
  ('fa000000-0000-4000-8000-000000000104',
   'fa000000-0000-4000-8000-000000000001',
   'Scheduler sur', 'draft', true,
   now() - interval '1 hour', now() + interval '1 hour'),
  ('fa000000-0000-4000-8000-000000000105',
   'fa000000-0000-4000-8000-000000000001',
   'Source brouillon', 'draft', false, null, null),
  ('fa000000-0000-4000-8000-000000000106',
   'fa000000-0000-4000-8000-000000000001',
   'Cible active', 'active', false, null, null);

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values
  ('fa000000-0000-4000-8000-000000000201',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000101', 'Roue activation', 'daily'),
  ('fa000000-0000-4000-8000-000000000202',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000102', 'Roue edition', 'daily'),
  ('fa000000-0000-4000-8000-000000000203',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000103', 'Roue scheduler interdite', 'daily'),
  ('fa000000-0000-4000-8000-000000000204',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000104', 'Roue scheduler sure', 'daily'),
  ('fa000000-0000-4000-8000-000000000205',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000105', 'Roue source', 'daily'),
  ('fa000000-0000-4000-8000-000000000206',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000106', 'Roue cible', 'daily');

insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, stock,
   is_active, value_cents)
values
  ('fa000000-0000-4000-8000-000000000301',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000201',
   'Valeur inconnue', 10, false, 2, true, null),
  ('fa000000-0000-4000-8000-000000000302',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000202',
   'Lot actif sur', 10, false, 2, true, 500),
  ('fa000000-0000-4000-8000-000000000303',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000202',
   'Lot inactif inconnu', 10, false, 2, false, null),
  ('fa000000-0000-4000-8000-000000000304',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000203',
   'Lot scheduler a revaloriser', 10, false, 2, true, 500),
  ('fa000000-0000-4000-8000-000000000305',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000204',
   'Lot scheduler sur', 10, false, 2, true, 500),
  ('fa000000-0000-4000-8000-000000000306',
   'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000205',
   'Lot a deplacer', 10, false, 2, true, 2500);

set constraints all immediate;

select throws_ok(
  $$update public.campaigns set status = 'active'
     where id = 'fa000000-0000-4000-8000-000000000101'$$,
  'P0001', 'campaign prize value invariant violated',
  'activation manuelle refusee si un gain tirable a une valeur inconnue'
);

select throws_ok(
  $$update public.prizes set value_cents = 2000
     where id = 'fa000000-0000-4000-8000-000000000302'$$,
  'P0001', 'campaign prize value invariant violated',
  'revaloriser a 20 EUR un lot tirable de campagne active est refuse'
);

select throws_ok(
  $$update public.prizes set is_active = true
     where id = 'fa000000-0000-4000-8000-000000000303'$$,
  'P0001', 'campaign prize value invariant violated',
  'activer un lot de valeur inconnue sur campagne active est refuse'
);

select throws_ok(
  $$insert into public.prizes
      (organization_id, wheel_id, label, weight, is_losing, stock,
       is_active, value_cents)
    values ('fa000000-0000-4000-8000-000000000001',
      'fa000000-0000-4000-8000-000000000202',
      'Insertion interdite', 1, false, 1, true, null)$$,
  'P0001', 'campaign prize value invariant violated',
  'inserer directement un lot interdit dans une campagne active est refuse'
);

select lives_ok(
  $$update public.prizes set value_cents = 5000
     where id = 'fa000000-0000-4000-8000-000000000301'$$,
  'un brouillon reste librement editable'
);

select lives_ok(
  $$update public.prizes set value_cents = 5000
     where id = 'fa000000-0000-4000-8000-000000000304'$$,
  'une campagne armee mais encore en brouillon peut etre revalorisee'
);

select results_eq(
  $$select campaign_id, action
      from public.run_campaign_schedule()
     where campaign_id in (
       'fa000000-0000-4000-8000-000000000103'::uuid,
       'fa000000-0000-4000-8000-000000000104'::uuid
     )
     order by campaign_id$$,
  $$values (
      'fa000000-0000-4000-8000-000000000104'::uuid,
      'activated'::text
    )$$,
  'le scheduler ignore l interdite et active sa voisine sure'
);

select results_eq(
  $$select id, status from public.campaigns
     where id in (
       'fa000000-0000-4000-8000-000000000103'::uuid,
       'fa000000-0000-4000-8000-000000000104'::uuid
     ) order by id$$,
  $$values
      ('fa000000-0000-4000-8000-000000000103'::uuid, 'draft'::text),
      ('fa000000-0000-4000-8000-000000000104'::uuid, 'active'::text)$$,
  'le resultat persiste : interdite en brouillon, voisine active'
);

select throws_ok(
  $$update public.wheels
       set campaign_id = 'fa000000-0000-4000-8000-000000000106'
     where id = 'fa000000-0000-4000-8000-000000000205'$$,
  'P0001', 'campaign prize value invariant violated',
  'une roue portant un lot interdit ne peut etre rattachee a une campagne active'
);

select throws_ok(
  $$update public.prizes
       set wheel_id = 'fa000000-0000-4000-8000-000000000206'
     where id = 'fa000000-0000-4000-8000-000000000306'$$,
  'P0001', 'campaign prize value invariant violated',
  'un lot interdit ne peut etre deplace sous une campagne active'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$insert into public.wheels
      (organization_id, campaign_id, name, play_limit)
    values (
      'fa000000-0000-4000-8000-000000000001',
      'fa000000-0000-4000-8000-000000000106',
      'Roue qui resterait vide', 'daily'
    )$$,
  'P0001', 'cannot add wheel to active campaign',
  'createWheel est refuse avant de laisser une roue vide sur campagne active'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Reproduit une ligne legacy sans desactiver la garde de verrouillage. Seule
-- la contrainte differee est coupee le temps de poser l'etat historique ; elle
-- est reactivee avant l'edition testee.
alter table public.prizes disable trigger prizes_campaign_value_invariant;
insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, stock,
   is_active, value_cents)
values (
  'fa000000-0000-4000-8000-000000000307',
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000206',
  'Lot legacy interdit', 10, false, 1, true, null
);
alter table public.prizes enable trigger prizes_campaign_value_invariant;

select lives_ok(
  $$update public.prizes set label = 'Lot legacy renomme'
     where id = 'fa000000-0000-4000-8000-000000000307'$$,
  'une edition descriptive reste possible sur un lot legacy interdit actif'
);

-- Les cinq RPC de tours offerts convergent sur leur INSERT dans spins. Chaque
-- source reelle doit donc etre couverte par le meme garde atomique.
select throws_ok(
  pg_catalog.format(
    $sql$insert into public.spins (
      organization_id, campaign_id, wheel_id, prize_id, is_losing,
      player_key, source
    ) values (
      'fa000000-0000-4000-8000-000000000001',
      'fa000000-0000-4000-8000-000000000106',
      'fa000000-0000-4000-8000-000000000206',
      'fa000000-0000-4000-8000-000000000307', false, %L, %L
    )$sql$,
    repeat('f', 64), offered_source
  ),
  'P0001', 'offered spin prize value invariant violated',
  pg_catalog.format('la source offerte %s est gardee', offered_source)
)
from unnest(array[
  'calendar', 'loyalty', 'quiz', 'referral', 'reserver_wait'
]) as covered(offered_source);

-- Preuve transactionnelle sur une vraie RPC : elle reserve d'abord le dernier
-- exemplaire du lot, puis tente l'INSERT spin, avant de valider le grant. Le
-- trigger doit lever et la sous-transaction de throws_ok doit tout restaurer.
insert into public.calendars (
  id, organization_id, name, status, start_date, timezone, day_count,
  public_slug, completion_reward_stock
) values (
  'fa000000-0000-4000-8000-000000000401',
  'fa000000-0000-4000-8000-000000000001',
  'Calendrier invariant', 'active', current_date, 'Europe/Paris', 1,
  'tap-invariant-calendar', 0
);
insert into public.calendar_days (
  id, calendar_id, organization_id, day_index, unlock_at, content_type,
  target_wheel_id
) values (
  'fa000000-0000-4000-8000-000000000402',
  'fa000000-0000-4000-8000-000000000401',
  'fa000000-0000-4000-8000-000000000001', 1, now(), 'spin',
  'fa000000-0000-4000-8000-000000000206'
);
insert into public.calendar_players (
  id, calendar_id, organization_id, token_hash
) values (
  'fa000000-0000-4000-8000-000000000403',
  'fa000000-0000-4000-8000-000000000401',
  'fa000000-0000-4000-8000-000000000001', repeat('e', 64)
);
insert into public.calendar_openings (
  id, player_id, day_id, calendar_id, organization_id, content_type,
  spin_grant_token
) values (
  'fa000000-0000-4000-8000-000000000404',
  'fa000000-0000-4000-8000-000000000403',
  'fa000000-0000-4000-8000-000000000402',
  'fa000000-0000-4000-8000-000000000401',
  'fa000000-0000-4000-8000-000000000001', 'spin', repeat('d', 48)
);

select throws_ok(
  $$select public.consume_calendar_spin_grant(
      'fa000000-0000-4000-8000-000000000401', repeat('e', 64), repeat('d', 48)
    )$$,
  'P0001', 'offered spin prize value invariant violated',
  'la vraie RPC est refusee sur son INSERT avant de valider le grant'
);
select is(
  (select stock from public.prizes
    where id = 'fa000000-0000-4000-8000-000000000307'),
  1,
  'le decrement du dernier exemplaire est annule avec la RPC'
);
select ok(
  (select consumed_at is null and resulting_spin_id is null
     from public.calendar_openings
    where id = 'fa000000-0000-4000-8000-000000000404'),
  'le grant reste entier et rejouable apres le refus'
);
select is(
  (select count(*)::integer from public.spins
    where campaign_id = 'fa000000-0000-4000-8000-000000000106'
      and source in ('calendar', 'loyalty', 'quiz', 'referral', 'reserver_wait')),
  0,
  'aucun spin offert interdit ne persiste'
);

select ok(
  (select pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(p.oid), 'for update'
    ) > 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'lock_campaign_prize_value_invariant'),
  'la garde enfant verrouille explicitement ses parents'
);

select ok(
  (select pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(p.oid), 'old.organization_id'
    ) > 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'lock_campaign_prize_value_invariant'),
  'le trigger de verrouillage ignore aussi les editions hors tuple dangereux'
);

select ok(
  (select pg_catalog.bool_and(t.tgdeferrable and t.tginitdeferred)
     from pg_catalog.pg_trigger t
    where t.tgname in (
      'campaigns_prize_value_invariant',
      'prizes_campaign_value_invariant',
      'wheels_campaign_value_invariant'
    )),
  'les trois validations portent sur l etat final atomique de la transaction'
);

select * from finish();
rollback;
