-- ============================================================
-- RELEASE GATE — segment perdant rejouable et skill fini
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug)
values ('e1500000-0000-4000-8000-000000000001',
        'TAP Release Gate', 'tap-release-gate');

insert into public.campaigns (id, organization_id, name, status) values
  ('e1500000-0000-4000-8000-000000000011',
   'e1500000-0000-4000-8000-000000000001', 'Perte rejouable', 'active'),
  ('e1500000-0000-4000-8000-000000000012',
   'e1500000-0000-4000-8000-000000000001', 'Réflexe fini', 'active'),
  ('e1500000-0000-4000-8000-000000000013',
   'e1500000-0000-4000-8000-000000000001', 'Jauge refusée', 'active');

insert into public.wheels
  (id, organization_id, campaign_id, name, game_type, play_limit)
values
  ('e1500000-0000-4000-8000-000000000021',
   'e1500000-0000-4000-8000-000000000001',
   'e1500000-0000-4000-8000-000000000011',
   'Roue perdante', 'wheel', 'unlimited'),
  ('e1500000-0000-4000-8000-000000000022',
   'e1500000-0000-4000-8000-000000000001',
   'e1500000-0000-4000-8000-000000000012',
   'Réflexe borné', 'reflex', 'daily');

select throws_ok(
  $$update public.wheels
       set play_limit = 'unlimited'
     where id = 'e1500000-0000-4000-8000-000000000022'$$,
  '23514',
  null,
  'SKILL-1 une écriture SQL directe ne peut pas rendre Réflexe illimité'
);

select throws_ok(
  $$insert into public.wheels
      (id, organization_id, campaign_id, name, game_type, play_limit)
    values
      ('e1500000-0000-4000-8000-000000000023',
       'e1500000-0000-4000-8000-000000000001',
       'e1500000-0000-4000-8000-000000000013',
       'Jauge illimitée', 'gauge', 'unlimited')$$,
  '23514',
  null,
  'SKILL-2 une création SQL directe ne peut pas rendre Jauge illimitée'
);

select ok(
  (select c.convalidated
     from pg_catalog.pg_constraint c
    where c.conrelid = 'public.wheels'::regclass
      and c.conname = 'wheels_client_reported_skill_finite_check'),
  'SKILL-3 sur une base propre, la contrainte est validée'
);

insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, stock, is_active)
values
  ('e1500000-0000-4000-8000-000000000031',
   'e1500000-0000-4000-8000-000000000001',
   'e1500000-0000-4000-8000-000000000021',
   'Pas cette fois', 100, true, null, true);

create temporary table t_perte_initiale on commit drop as
select * from public.perform_atomic_spin(
  'e1500000-0000-4000-8000-000000000001',
  'e1500000-0000-4000-8000-000000000011',
  'e1500000-0000-4000-8000-000000000021',
  repeat('p', 64), null, 'direct', false,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

create temporary table t_perte_rejouee on commit drop as
select * from public.perform_atomic_spin(
  'e1500000-0000-4000-8000-000000000001',
  'e1500000-0000-4000-8000-000000000011',
  'e1500000-0000-4000-8000-000000000021',
  repeat('p', 64), null, 'direct', false,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

select is(
  (select prize_id from t_perte_initiale),
  'e1500000-0000-4000-8000-000000000031'::uuid,
  'SPIN-1 le premier appel rend le segment perdant réellement choisi'
);

select is(
  (select prize_id from t_perte_rejouee),
  (select prize_id from t_perte_initiale),
  'SPIN-2 le même nonce restitue exactement le même segment perdant'
);

select is(
  (select spin_id from t_perte_rejouee),
  (select spin_id from t_perte_initiale),
  'SPIN-3 le rejeu restitue le même spin, sans seconde écriture'
);

select is(
  (select prize_id from public.spins
    where id = (select spin_id from t_perte_initiale)),
  null::uuid,
  'SPIN-4 `spins.prize_id` reste null : une perte ne devient jamais un gain'
);

select is(
  (select display_prize_id from public.spins
    where id = (select spin_id from t_perte_initiale)),
  'e1500000-0000-4000-8000-000000000031'::uuid,
  'SPIN-5 le segment d''affichage est conservé dans sa colonne dédiée'
);

select is(
  (select pg_catalog.count(*)::integer from public.spins
    where wheel_id = 'e1500000-0000-4000-8000-000000000021'),
  1,
  'SPIN-6 le rejeu n''insère pas une seconde participation'
);

-- La suppression applicative vérifie déjà l'absence d'historique, mais ce
-- contrôle serait racy sans FK bloquante : ce test exerce la base directement.
insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, stock, is_active)
values
  ('e1500000-0000-4000-8000-000000000032',
   'e1500000-0000-4000-8000-000000000001',
   'e1500000-0000-4000-8000-000000000021',
   'Gain historique', 0, false, 1, false);

insert into public.spins
  (id, organization_id, campaign_id, wheel_id, prize_id, is_losing, player_key)
values
  ('e1500000-0000-4000-8000-000000000041',
   'e1500000-0000-4000-8000-000000000001',
   'e1500000-0000-4000-8000-000000000011',
   'e1500000-0000-4000-8000-000000000021',
   'e1500000-0000-4000-8000-000000000032', false, repeat('h', 64));

select throws_ok(
  $$delete from public.prizes
     where id = 'e1500000-0000-4000-8000-000000000032'$$,
  '23503',
  null,
  'SPIN-7 la DB refuse atomiquement de supprimer un lot déjà attribué'
);

select is(
  (select prize_id from public.spins
    where id = 'e1500000-0000-4000-8000-000000000041'),
  'e1500000-0000-4000-8000-000000000032'::uuid,
  'SPIN-8 le refus conserve la référence de reprise du gain historique'
);

select * from finish();
rollback;
