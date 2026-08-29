-- ============================================================
-- Passeport -> Jackpot : le QR caisse alimente le pot exactement une fois.
-- La preuve porte sur la transaction SQL, pas sur deux Server Actions : un
-- tampon accepte et son entree Jackpot sont inseparables.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug, addon_loyalty, addon_jackpot)
values
  ('f1000000-0000-4000-8000-000000000001', 'Lien test', 'tap-loyalty-jackpot', true, true),
  ('f1000000-0000-4000-8000-000000000002', 'Voisin test', 'tap-loyalty-jackpot-neighbor', true, true);

insert into public.jackpot_campaigns (
  id, organization_id, name, status, validation_mode,
  min_participation_interval_seconds, draw_mode, threshold, reward_stock,
  reward_label, display_base_cents, display_increment_cents
) values (
  'f1000000-0000-4000-8000-000000000011',
  'f1000000-0000-4000-8000-000000000001',
  'Le pot du passeport', 'active', 'staff', 300, 'threshold_draw', 10, 1,
  'Un cafe offert', 500, 100
), (
  'f1000000-0000-4000-8000-000000000012',
  'f1000000-0000-4000-8000-000000000002',
  'Pot voisin', 'active', 'staff', 300, 'threshold_draw', 10, 1,
  'Lot voisin', 0, 0
);

insert into public.loyalty_programs (
  id, organization_id, jackpot_campaign_id, name, status, validation_mode,
  min_stamp_interval_seconds, silver_threshold, gold_threshold
) values (
  'f1000000-0000-4000-8000-000000000021',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000011',
  'Passeport du pot', 'active', 'staff', 300, 2, 3
);

select is(
  (public.record_loyalty_stamp(
    'f1000000-0000-4000-8000-000000000021', repeat('a', 64), null,
    'f1000000-0000-4000-8000-000000000099'
  ) ->> 'state'),
  'stamped',
  'le scan caisse valide cree le tampon'
);
select is(
  (select count(*) from public.loyalty_stamps
    where program_id = 'f1000000-0000-4000-8000-000000000021'),
  1::bigint,
  'un seul tampon est inscrit'
);
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'f1000000-0000-4000-8000-000000000011'),
  1::bigint,
  'le meme scan ajoute une entree au jackpot'
);
select ok(
  exists (
    select 1 from public.jackpot_participants
     where campaign_id = 'f1000000-0000-4000-8000-000000000011'
       and loyalty_stamp_id is not null
  ),
  'la provenance du tampon est conservee'
);
select is(
  (select current_count from public.jackpot_campaigns
    where id = 'f1000000-0000-4000-8000-000000000011'),
  1,
  'la jauge commune augmente exactement une fois'
);

-- La provenance est elle aussi tenant-scopee : une entree d'un pot voisin ne
-- peut jamais etre rattachee au tampon de ce passeport, meme avec un appel
-- SQL de service compromis.
insert into public.jackpot_participants (
  campaign_id, organization_id, player_token_hash, cycle
) values (
  'f1000000-0000-4000-8000-000000000012',
  'f1000000-0000-4000-8000-000000000002', repeat('b', 64), 0
);
select throws_ok($$
  update public.jackpot_participants
     set loyalty_stamp_id = (
       select id from public.loyalty_stamps
        where program_id = 'f1000000-0000-4000-8000-000000000021'
        order by stamped_at asc
        limit 1
     )
   where campaign_id = 'f1000000-0000-4000-8000-000000000012'
$$, '23503', null,
  'la FK composite refuse un tampon de passeport voisin'
);

select is(
  (public.record_loyalty_stamp(
    'f1000000-0000-4000-8000-000000000021', repeat('a', 64), null,
    'f1000000-0000-4000-8000-000000000099'
  ) ->> 'state'),
  'too_soon',
  'le rejeu immediat du QR est refuse par le cooldown du passeport'
);
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'f1000000-0000-4000-8000-000000000011'),
  1::bigint,
  'le rejeu ne cree jamais une seconde entree Jackpot'
);

-- Un pot mis en pause ne bloque pas le retour du client : la fidelite reste
-- validee, mais l'ecriture Jackpot est alors volontairement ignoree.
update public.jackpot_campaigns
   set status = 'archived'
 where id = 'f1000000-0000-4000-8000-000000000011';
update public.loyalty_members
   set last_stamp_at = now() - interval '301 seconds'
 where program_id = 'f1000000-0000-4000-8000-000000000021';
select is(
  (public.record_loyalty_stamp(
    'f1000000-0000-4000-8000-000000000021', repeat('a', 64), null,
    'f1000000-0000-4000-8000-000000000099'
  ) ->> 'state'),
  'stamped',
  'un jackpot archive ne bloque pas le tampon de fidelite'
);
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'f1000000-0000-4000-8000-000000000011'),
  1::bigint,
  'un jackpot archive ne recoit plus de participation'
);

delete from public.loyalty_members
 where program_id = 'f1000000-0000-4000-8000-000000000021';
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'f1000000-0000-4000-8000-000000000011'),
  1::bigint,
  'la purge du passeport conserve le registre du tirage'
);
select is(
  (select loyalty_stamp_id from public.jackpot_participants
    where campaign_id = 'f1000000-0000-4000-8000-000000000011'),
  null::uuid,
  'la provenance est retiree avec le passeport purgé'
);

select throws_ok($$
  insert into public.loyalty_programs (
    organization_id, jackpot_campaign_id, name, status, validation_mode,
    min_stamp_interval_seconds, silver_threshold, gold_threshold
  ) values (
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000012',
    'Lien inter-tenant', 'active', 'staff', 300, 2, 3
  )
$$, '23503', null,
  'la FK composite refuse le jackpot d un voisin'
);

select * from finish();
rollback;
