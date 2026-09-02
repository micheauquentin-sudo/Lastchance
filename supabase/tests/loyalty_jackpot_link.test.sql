-- ============================================================
-- Passeport -> Jackpot : le QR caisse alimente le pot exactement une fois.
-- La preuve porte sur la transaction SQL, pas sur deux Server Actions : un
-- tampon accepte et son entree Jackpot sont inseparables.
--
-- ⚠️ LES DEUX EMPREINTES SONT DIFFERENTES, ET CE N'EST PAS UN DETAIL.
-- Ce fichier passait le MEME repeat('a', 64) des deux cotes jusqu'a ID-8a. Il
-- encodait ainsi l'egalite « empreinte fidelite = empreinte jackpot » —
-- c'est-a-dire exactement le defaut corrige : le trigger recopiait
-- loyalty_members.token_hash comme jackpot_players.token_hash, et ce test
-- serait reste VERT sur une correction ratee.
--
-- Depuis, la personne porte deux empreintes : repeat('a', 64) pour son
-- passeport, repeat('c', 64) pour sa cagnotte, reliees par le socle
-- d'identite. Le pot doit voir la SECONDE.
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

-- ── LE SOCLE D'IDENTITE : une personne, deux empreintes ──
-- Le meme appareil ouvre la cagnotte puis le passeport. Les deux empreintes
-- historiques sont pontees vers le MEME joueur, ce qui donne au trigger de
-- caisse de quoi retrouver l'identite jackpot au lieu de la fabriquer.
create temporary table tap_lien_joueur on commit drop as
select * from public.resolve_player_identity(
  repeat('d', 64), 'f1000000-0000-4000-8000-000000000001',
  'jackpot', 'f1000000-0000-4000-8000-000000000011',
  repeat('c', 64), 'unknown', null);

select public.resolve_player_identity(
  repeat('d', 64), 'f1000000-0000-4000-8000-000000000001',
  'loyalty', 'f1000000-0000-4000-8000-000000000021',
  repeat('a', 64), 'unknown', null);

select isnt(repeat('a', 64), repeat('c', 64),
  'les deux mondes portent bien deux empreintes DISTINCTES');

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

-- ── L'ASSERTION QUI SEPARE LES DEUX MONDES (ID-8a) ──
-- Sur le code d'hier, l'entree porte repeat('a', 64) : la cle du passeport
-- recopiee telle quelle. Les trois assertions suivantes tombent alors, et
-- c'est precisement ce qu'aucune n'attrapait avant.
select is(
  (select player_token_hash from public.jackpot_participants
    where campaign_id = 'f1000000-0000-4000-8000-000000000011'),
  repeat('c', 64),
  'ID-8a : l''entree porte l''empreinte JACKPOT de la personne'
);
select is(
  (select count(*) from public.jackpot_players
    where campaign_id = 'f1000000-0000-4000-8000-000000000011'
      and token_hash = repeat('a', 64)),
  0::bigint,
  'ID-8a : l''empreinte FIDELITE ne devient jamais une identite jackpot'
);
select is(
  (select count(*) from public.jackpot_players
    where campaign_id = 'f1000000-0000-4000-8000-000000000011'),
  1::bigint,
  'ID-8a : une personne, UNE seule ligne joueur'
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
update public.jackpot_participants
   set loyalty_stamp_id = null
 where campaign_id = 'f1000000-0000-4000-8000-000000000011';
insert into public.jackpot_participants (
  campaign_id, organization_id, player_token_hash, cycle
) values (
  'f1000000-0000-4000-8000-000000000012',
  'f1000000-0000-4000-8000-000000000002', repeat('b', 64), 1
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
