-- ============================================================
-- Le jackpot cesse de dédoubler ses joueurs (ID-8a)
--
-- CE FICHIER SÉPARE LES DEUX MONDES, ET C'EST TOUT SON OBJET. L'empreinte
-- fidélité et l'empreinte jackpot d'une personne y sont TOUJOURS différentes ;
-- un test qui leur donnerait la même valeur encoderait le défaut qu'on corrige
-- et resterait vert sur une correction ratée.
--
-- Ce qu'il doit prouver, dans l'ordre où ça compte :
--   1. un tampon de caisse n'ouvre PLUS une seconde identité jackpot pour
--      quelqu'un que le socle connaît déjà ;
--   2. et quand le socle ne connaît encore aucune empreinte jackpot, le repli
--      d'hier est PONTÉ — il ne se dédouble donc qu'une fois, jamais deux ;
--   3. la déduplication réunit les entrées au tirage ;
--   4. un lot GAGNÉ ET NON RETIRÉ reste visible pour son gagnant après
--      déduplication — la perte la plus dure, celle qu'aucune clé étrangère
--      n'aurait signalée ;
--   5. les empreintes ORPHELINES (joueur purgé, entrées conservées) sont
--      rattrapées, et le compteur du survivant tient compte de ce qu'il
--      hérite ;
--   6. un gain remporté PAR UN TAMPON est porté par l'empreinte jackpot du
--      gagnant — sinon il ne le verrait jamais ;
--   7. la fonction est idempotente : rejouer ne change rien et le dit ;
--   8. l'isolation entre organisations tient.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Fabrique d'empreintes : `^[0-9a-f]{64}$` sans épuiser les seize caractères
-- répétables. `repeat('a', 64)` ne permet que seize identités distinctes, et il
-- en faut dix-sept ici.
create function pg_temp.h(p text) returns text language sql immutable as $$
  select lpad(p, 64, '0');
$$;

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_loyalty, addon_jackpot)
values
  ('eb000000-0000-4000-8000-000000000001', 'Identite A', 'tap-jackpot-id-a', true, true),
  ('eb000000-0000-4000-8000-000000000002', 'Voisin B',   'tap-jackpot-id-b', true, true),
  ('eb000000-0000-4000-8000-000000000003', 'Identite C', 'tap-jackpot-id-c', true, true);

insert into public.jackpot_campaigns (
  id, organization_id, name, status, validation_mode,
  min_participation_interval_seconds, draw_mode, threshold, win_probability,
  reward_stock, reward_label
) values
  -- campA : reliée au passeport de A. Seuil haut, aucun tirage accidentel.
  ('eb000000-0000-4000-8000-000000000011', 'eb000000-0000-4000-8000-000000000001',
   'Pot relie A', 'active', 'staff', 300, 'threshold_draw', 50, null, 1, 'Cafe'),
  -- campLibre : NON reliée. rescan_win + probabilité 1 → le gagnant est
  -- l'appelant, donc le tirage est déterministe et le gain atterrit là où on
  -- le veut.
  ('eb000000-0000-4000-8000-000000000012', 'eb000000-0000-4000-8000-000000000001',
   'Pot libre A', 'active', 'staff', 300, 'rescan_win', 1, 1, 1, 'Menu'),
  -- campB : le voisin, pour l'isolation.
  ('eb000000-0000-4000-8000-000000000013', 'eb000000-0000-4000-8000-000000000002',
   'Pot voisin', 'active', 'staff', 300, 'threshold_draw', 50, null, 1, 'Lot voisin'),
  -- campC : reliée au passeport de C, et gagnable AU TAMPON.
  ('eb000000-0000-4000-8000-000000000014', 'eb000000-0000-4000-8000-000000000003',
   'Pot relie C', 'active', 'staff', 300, 'rescan_win', 1, 1, 1, 'Dessert');

insert into public.loyalty_programs (
  id, organization_id, jackpot_campaign_id, name, status, validation_mode,
  min_stamp_interval_seconds, silver_threshold, gold_threshold
) values
  ('eb000000-0000-4000-8000-000000000021', 'eb000000-0000-4000-8000-000000000001',
   'eb000000-0000-4000-8000-000000000011',
   'Passeport A', 'active', 'staff', 300, 2, 3),
  ('eb000000-0000-4000-8000-000000000022', 'eb000000-0000-4000-8000-000000000003',
   'eb000000-0000-4000-8000-000000000014',
   'Passeport C', 'active', 'staff', 300, 2, 3);


-- ════════════════════════════════════════════════════════════
-- 1. LE TAMPON N'OUVRE PLUS UNE SECONDE IDENTITÉ
--
-- La personne 1 est connue du socle des DEUX côtés, avec DEUX empreintes
-- distinctes : le cookie de son passeport (h('10')) et celui de sa cagnotte
-- (h('20')). Le tampon de caisse doit entrer dans le pot sous la SECONDE.
-- Sur le code d'hier il entre sous la première, et les deux assertions
-- ci-dessous tombent.
-- ════════════════════════════════════════════════════════════

-- Le navigateur a déjà ouvert /jackpot/<slug> : l'empreinte jackpot existe.
create temporary table tap_p1 on commit drop as
select * from public.resolve_player_identity(
  pg_temp.h('a1'), 'eb000000-0000-4000-8000-000000000001',
  'jackpot', 'eb000000-0000-4000-8000-000000000011',
  pg_temp.h('20'), 'unknown', null);

-- …et le même appareil a ouvert le passeport : même personne, autre empreinte.
select public.resolve_player_identity(
  pg_temp.h('a1'), 'eb000000-0000-4000-8000-000000000001',
  'loyalty', 'eb000000-0000-4000-8000-000000000021',
  pg_temp.h('10'), 'unknown', null);

select isnt(pg_temp.h('10'), pg_temp.h('20'),
  'les deux mondes ont bien deux empreintes DIFFERENTES (sans quoi ce fichier ne prouverait rien)');

select is(
  (public.record_loyalty_stamp(
    'eb000000-0000-4000-8000-000000000021', pg_temp.h('10'), null,
    'eb000000-0000-4000-8000-0000000000aa') ->> 'state'),
  'stamped', 'le scan caisse valide cree le tampon');

select is(
  (select count(*) from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash = pg_temp.h('20')),
  1::bigint,
  'ID-8a : le tampon entre dans le pot sous l''empreinte JACKPOT de la personne');
select is(
  (select count(*) from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash = pg_temp.h('10')),
  0::bigint,
  'ID-8a : l''empreinte FIDELITE n''est plus recopiee comme identite jackpot');
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and player_token_hash = pg_temp.h('20')
      and loyalty_stamp_id is not null),
  1::bigint,
  'ID-8a : la provenance du tampon suit l''empreinte jackpot');


-- ════════════════════════════════════════════════════════════
-- 2. LE REPLI EST PONTÉ — il ne se dédouble qu'une fois
--
-- La personne 2 n'a jamais ouvert la cagnotte : le socle ne lui connaît aucune
-- empreinte jackpot. Le tampon retombe donc sur l'empreinte fidélité, comme
-- hier — mais il l'ENREGISTRE, et c'est ce qui empêche le second dédoublement.
-- ════════════════════════════════════════════════════════════

create temporary table tap_p2 on commit drop as
select * from public.resolve_player_identity(
  pg_temp.h('a2'), 'eb000000-0000-4000-8000-000000000001',
  'loyalty', 'eb000000-0000-4000-8000-000000000021',
  pg_temp.h('11'), 'unknown', null);

select is(
  (public.record_loyalty_stamp(
    'eb000000-0000-4000-8000-000000000021', pg_temp.h('11'), null,
    'eb000000-0000-4000-8000-0000000000aa') ->> 'state'),
  'stamped', 'le second client est tamponne');

select is(
  (select count(*) from public.player_legacy_identities
    where organization_id = 'eb000000-0000-4000-8000-000000000001'
      and experience_kind = 'jackpot'
      and experience_id = 'eb000000-0000-4000-8000-000000000011'
      and legacy_identity_hash = pg_temp.h('11')
      and player_id = (select player_id from tap_p2)),
  1::bigint,
  'ID-8a : le repli est PONTE — la prochaine visite de la cagnotte retrouvera cette identite');

-- Le navigateur arrive ensuite avec un cookie de cagnotte tout neuf. Le socle
-- porte alors DEUX empreintes pour cette personne, et c'est celle que le pot
-- connaît (celle qui a une ligne joueur) qui reste canonique.
select public.resolve_player_identity(
  pg_temp.h('a2'), 'eb000000-0000-4000-8000-000000000001',
  'jackpot', 'eb000000-0000-4000-8000-000000000011',
  pg_temp.h('21'), 'unknown', null);

select is(
  public.jackpot_identity_for_player(
    (select player_id from tap_p2),
    'eb000000-0000-4000-8000-000000000001',
    'eb000000-0000-4000-8000-000000000011'),
  pg_temp.h('11'),
  'ID-8a : l''empreinte canonique est celle qui porte une ligne joueur, pas la plus recente');


-- ════════════════════════════════════════════════════════════
-- 3. LA DÉDUPLICATION RÉUNIT LES ENTRÉES AU TIRAGE
--
-- La personne 3 reproduit le dédoublement RÉEL, par les vrais chemins : deux
-- tampons quand le socle ignorait sa cagnotte, puis trois participations sous
-- le cookie de son navigateur. Deux lignes joueur, deux jeux d'entrées.
-- ════════════════════════════════════════════════════════════

create temporary table tap_p3 on commit drop as
select * from public.resolve_player_identity(
  pg_temp.h('a3'), 'eb000000-0000-4000-8000-000000000001',
  'loyalty', 'eb000000-0000-4000-8000-000000000021',
  pg_temp.h('12'), 'unknown', null);

select public.record_loyalty_stamp(
  'eb000000-0000-4000-8000-000000000021', pg_temp.h('12'), null,
  'eb000000-0000-4000-8000-0000000000aa');

-- Les DEUX cooldowns doivent reculer : celui du passeport et celui du pot.
-- Ne reculer que le premier fait lever « linked jackpot participation was not
-- recorded », et l'erreur n'accuse pas sa cause.
update public.loyalty_members set last_stamp_at = now() - interval '301 seconds'
 where program_id = 'eb000000-0000-4000-8000-000000000021';
update public.jackpot_players set last_participation_at = now() - interval '301 seconds'
 where campaign_id = 'eb000000-0000-4000-8000-000000000011';

select public.record_loyalty_stamp(
  'eb000000-0000-4000-8000-000000000021', pg_temp.h('12'), null,
  'eb000000-0000-4000-8000-0000000000aa');

-- Le navigateur ouvre enfin la cagnotte, avec sa propre empreinte.
select public.resolve_player_identity(
  pg_temp.h('a3'), 'eb000000-0000-4000-8000-000000000001',
  'jackpot', 'eb000000-0000-4000-8000-000000000011',
  pg_temp.h('22'), 'unknown', null);

-- …et le parcours joueur, qui n'a PAS encore adopté le socle, écrit dessous.
select public.record_jackpot_participation(
  'eb000000-0000-4000-8000-000000000011', pg_temp.h('22'), null,
  'eb000000-0000-4000-8000-0000000000aa');
update public.jackpot_players set last_participation_at = now() - interval '301 seconds'
 where campaign_id = 'eb000000-0000-4000-8000-000000000011';
select public.record_jackpot_participation(
  'eb000000-0000-4000-8000-000000000011', pg_temp.h('22'), null,
  'eb000000-0000-4000-8000-0000000000aa');
update public.jackpot_players set last_participation_at = now() - interval '301 seconds'
 where campaign_id = 'eb000000-0000-4000-8000-000000000011';
select public.record_jackpot_participation(
  'eb000000-0000-4000-8000-000000000011', pg_temp.h('22'), null,
  'eb000000-0000-4000-8000-0000000000aa');

select is(
  (select count(*) from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash in (pg_temp.h('12'), pg_temp.h('22'))),
  2::bigint,
  'AVANT deduplication : la meme personne porte bien DEUX lignes joueur');


-- ════════════════════════════════════════════════════════════
-- 4. UN LOT GAGNÉ ET NON RETIRÉ SUIT SON GAGNANT
--
-- `jackpot_wins.winner_token_hash` n'a AUCUNE clé étrangère : rien ne cascade,
-- rien n'alerte. La personne 4 gagne sous son SECONDE empreinte (celle qui
-- sera absorbée) ; après déduplication, le gain doit être porté par celle qui
-- survit — sinon son écran ne le montre plus, alors que le code reste valable
-- en caisse.
-- ════════════════════════════════════════════════════════════

create temporary table tap_p4 on commit drop as
select * from public.resolve_player_identity(
  pg_temp.h('a4'), 'eb000000-0000-4000-8000-000000000001',
  'jackpot', 'eb000000-0000-4000-8000-000000000012',
  pg_temp.h('30'), 'unknown', null);

-- La première participation ARME le pot (count = seuil) et ne tire pas.
select public.record_jackpot_participation(
  'eb000000-0000-4000-8000-000000000012', pg_temp.h('30'), null,
  'eb000000-0000-4000-8000-0000000000aa');

select public.resolve_player_identity(
  pg_temp.h('a4'), 'eb000000-0000-4000-8000-000000000001',
  'jackpot', 'eb000000-0000-4000-8000-000000000012',
  pg_temp.h('31'), 'unknown', null);

-- La suivante gagne (probabilité 1), et le gagnant EST l'appelant.
select public.record_jackpot_participation(
  'eb000000-0000-4000-8000-000000000012', pg_temp.h('31'), null,
  'eb000000-0000-4000-8000-0000000000aa');

create temporary table tap_gain on commit drop as
select code, winner_token_hash, redeemed_at
  from public.jackpot_wins
 where campaign_id = 'eb000000-0000-4000-8000-000000000012';

select is((select count(*) from tap_gain), 1::bigint,
  'AVANT deduplication : un gain existe, non retire');
select is((select winner_token_hash from tap_gain), pg_temp.h('31'),
  'AVANT deduplication : il est porte par l''empreinte qui sera ABSORBEE');


-- ════════════════════════════════════════════════════════════
-- 5. LES EMPREINTES ORPHELINES
--
-- `purge_expired_jackpot_players` supprime les lignes joueur SANS toucher aux
-- entrées ni aux gains. La personne 5 en porte une : deux entrées sous une
-- empreinte fidélité dont la ligne joueur a disparu, et une participation
-- récente sous son cookie de cagnotte.
--
-- Deux pièges d'un coup : un rattrapage par jointure sur `jackpot_players` ne
-- verrait jamais ces entrées, et un recalcul de compteur conditionné à une
-- SUPPRESSION de ligne joueur laisserait le survivant à 1 au lieu de 3.
-- ════════════════════════════════════════════════════════════

-- Le membre de passeport existe (son cookie a été tamponné autrefois)…
insert into public.loyalty_members (program_id, organization_id, token_hash)
values ('eb000000-0000-4000-8000-000000000021',
        'eb000000-0000-4000-8000-000000000001', pg_temp.h('13'));

create temporary table tap_p5 on commit drop as
select * from public.resolve_player_identity(
  pg_temp.h('a5'), 'eb000000-0000-4000-8000-000000000001',
  'loyalty', 'eb000000-0000-4000-8000-000000000021',
  pg_temp.h('13'), 'unknown', null);

-- …ses entrees de tirage ont survecu a la purge de sa ligne joueur, et RIEN ne
-- les rattache au socle : c'est exactement ce que l'ancien trigger a laisse.
insert into public.jackpot_participants
  (campaign_id, organization_id, player_token_hash, cycle)
values
  ('eb000000-0000-4000-8000-000000000011',
   'eb000000-0000-4000-8000-000000000001', pg_temp.h('13'), 1),
  ('eb000000-0000-4000-8000-000000000011',
   'eb000000-0000-4000-8000-000000000001', pg_temp.h('13'), 1);

select is(
  (select count(*) from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash = pg_temp.h('13')),
  0::bigint,
  'AVANT deduplication : l''empreinte orpheline n''a bien AUCUNE ligne joueur');

-- Le navigateur revient, avec une empreinte neuve et une participation.
select public.resolve_player_identity(
  pg_temp.h('a5'), 'eb000000-0000-4000-8000-000000000001',
  'jackpot', 'eb000000-0000-4000-8000-000000000011',
  pg_temp.h('23'), 'unknown', null);
select public.record_jackpot_participation(
  'eb000000-0000-4000-8000-000000000011', pg_temp.h('23'), null,
  'eb000000-0000-4000-8000-0000000000aa');


-- ════════════════════════════════════════════════════════════
-- 6. UN GAIN REMPORTÉ PAR UN TAMPON EST PORTÉ PAR L'EMPREINTE JACKPOT
--
-- C'est l'invariant de `jackpot.test.sql` (« le code n'est renvoyé qu'au
-- gagnant réel ») transposé au chemin de la caisse, et c'est le premier à
-- vérifier après un changement de clé : `record_jackpot_participation` compare
-- `v_winner = p_player_token_hash`, et ce second terme est précisément ce que
-- ce lot change. Si le gain restait porté par l'empreinte fidélité, le gagnant
-- ne le verrait jamais sur son écran.
-- ════════════════════════════════════════════════════════════

select public.resolve_player_identity(
  pg_temp.h('a6'), 'eb000000-0000-4000-8000-000000000003',
  'jackpot', 'eb000000-0000-4000-8000-000000000014',
  pg_temp.h('40'), 'unknown', null);
select public.resolve_player_identity(
  pg_temp.h('a6'), 'eb000000-0000-4000-8000-000000000003',
  'loyalty', 'eb000000-0000-4000-8000-000000000022',
  pg_temp.h('41'), 'unknown', null);

-- Un autre client arme le pot.
select public.record_jackpot_participation(
  'eb000000-0000-4000-8000-000000000014', pg_temp.h('4f'), null,
  'eb000000-0000-4000-8000-0000000000aa');

select is(
  (public.record_loyalty_stamp(
    'eb000000-0000-4000-8000-000000000022', pg_temp.h('41'), null,
    'eb000000-0000-4000-8000-0000000000aa') ->> 'state'),
  'stamped', 'le tampon gagnant est accepte');

select is(
  (select winner_token_hash from public.jackpot_wins
    where campaign_id = 'eb000000-0000-4000-8000-000000000014'),
  pg_temp.h('40'),
  'ID-8a : le gain remporte au tampon est porte par l''empreinte JACKPOT du gagnant');
select isnt(
  (select winner_token_hash from public.jackpot_wins
    where campaign_id = 'eb000000-0000-4000-8000-000000000014'),
  pg_temp.h('41'),
  'ID-8a : il n''est PAS porte par l''empreinte fidelite (le gagnant ne le verrait jamais)');


-- ════════════════════════════════════════════════════════════
-- 7. ISOLATION ENTRE ORGANISATIONS — avant toute déduplication
-- ════════════════════════════════════════════════════════════

select throws_ok(
  format($$select public.link_jackpot_legacy_identity(
    %L::uuid, 'eb000000-0000-4000-8000-000000000002'::uuid,
    'eb000000-0000-4000-8000-000000000011'::uuid, %L)$$,
    (select player_id from tap_p1), pg_temp.h('7a')),
  '23503', null,
  'ISOLATION : ponter une empreinte sur la campagne d''un AUTRE locataire est refuse');

select throws_ok(
  format($$select public.link_jackpot_legacy_identity(
    %L::uuid, 'eb000000-0000-4000-8000-000000000001'::uuid,
    'eb000000-0000-4000-8000-000000000013'::uuid, %L)$$,
    (select player_id from tap_p1), pg_temp.h('7b')),
  '23503', null,
  'ISOLATION : annoncer le locataire A pour la campagne de B est refuse');

select throws_ok(
  format($$select public.link_jackpot_legacy_identity(
    %L::uuid, 'eb000000-0000-4000-8000-000000000001'::uuid,
    'eb000000-0000-4000-8000-000000000011'::uuid, %L)$$,
    (select player_id from tap_p2), pg_temp.h('20')),
  '23505', null,
  'ISOLATION : une empreinte deja pontee a une AUTRE personne n''est pas deplacee en silence');

-- Le voisin porte lui aussi une entrée : elle ne doit pas bouger d'un iota.
insert into public.jackpot_participants
  (campaign_id, organization_id, player_token_hash, cycle)
values ('eb000000-0000-4000-8000-000000000013',
        'eb000000-0000-4000-8000-000000000002', pg_temp.h('13'), 1);


-- ════════════════════════════════════════════════════════════
-- 8. LA DÉDUPLICATION
-- ════════════════════════════════════════════════════════════

create temporary table tap_dedup1 on commit drop as
select public.dedupe_jackpot_player_identities(null) as r;

-- ── Personne 3 : les entrées réunies ──
select is(
  (select count(*) from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash in (pg_temp.h('12'), pg_temp.h('22'))),
  1::bigint,
  'DEDUP : la personne 3 ne porte plus qu''UNE ligne joueur');
select is(
  (select token_hash from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash in (pg_temp.h('12'), pg_temp.h('22'))),
  pg_temp.h('12'),
  'DEDUP : la survivante est la plus ancienne, pas la plus recente');
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and player_token_hash = pg_temp.h('12')),
  5::bigint,
  'DEDUP : les CINQ entrees de tirage sont reunies sous une seule empreinte');
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and player_token_hash = pg_temp.h('22')),
  0::bigint,
  'DEDUP : l''empreinte absorbee ne porte plus aucune entree');
select is(
  (select participation_count from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash = pg_temp.h('12')),
  5,
  'DEDUP : le compteur est RECALCULE depuis le registre, pas additionne');

-- ── Personne 4 : le lot gagné suit son gagnant ──
select is(
  (select winner_token_hash from public.jackpot_wins
    where campaign_id = 'eb000000-0000-4000-8000-000000000012'),
  pg_temp.h('30'),
  'DEDUP : le gain non retire est reecrit sur l''empreinte SURVIVANTE');
select is(
  (select count(*) from public.jackpot_wins w
    where w.campaign_id = 'eb000000-0000-4000-8000-000000000012'
      and w.winner_token_hash = public.jackpot_identity_for_player(
        (select player_id from tap_p4),
        'eb000000-0000-4000-8000-000000000001',
        'eb000000-0000-4000-8000-000000000012')),
  1::bigint,
  'DEDUP : son gagnant le voit encore depuis son identite canonique');
select is(
  (select code from public.jackpot_wins
    where campaign_id = 'eb000000-0000-4000-8000-000000000012'),
  (select code from tap_gain),
  'DEDUP : le code de retrait est INCHANGE — la caisse continue de l''honorer');
select ok(
  (select redeemed_at is null from public.jackpot_wins
    where campaign_id = 'eb000000-0000-4000-8000-000000000012'),
  'DEDUP : le lot reste non retire');
select is(
  (select redeemed_now from public.redeem_jackpot_prize(
     'eb000000-0000-4000-8000-000000000001',
     (select code from tap_gain), 'tap-caisse')),
  true,
  'DEDUP : le code reecrit reste encaissable en caisse');

-- ── Personne 5 : l'orpheline, et le pont d'ancienneté qui la rattrape ──
select is(
  ((select r from tap_dedup1) ->> 'bridged_identities')::integer,
  1,
  'PONT D''ANCIENNETE : une empreinte laissee par l''ancien trigger a ete rattachee');
select is(
  (select count(*) from public.player_legacy_identities
    where organization_id = 'eb000000-0000-4000-8000-000000000001'
      and experience_kind = 'jackpot'
      and experience_id = 'eb000000-0000-4000-8000-000000000011'
      and legacy_identity_hash = pg_temp.h('13')
      and player_id = (select player_id from tap_p5)),
  1::bigint,
  'PONT D''ANCIENNETE : elle est rattachee a SA personne, pas a une autre');
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and player_token_hash = pg_temp.h('13')),
  0::bigint,
  'DEDUP : les entrees ORPHELINES sont rattrapees, sans ligne joueur pour les porter');
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and player_token_hash = pg_temp.h('23')),
  3::bigint,
  'DEDUP : elles rejoignent l''empreinte survivante de leur personne');
select is(
  (select participation_count from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash = pg_temp.h('23')),
  3,
  'DEDUP : le compteur du survivant tient compte de ce qu''il HERITE, meme sans ligne supprimee');
select is(
  (select count(*) from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash = pg_temp.h('13')),
  0::bigint,
  'DEDUP : aucune ligne joueur n''est RESSUSCITEE pour une identite purgee');

-- ── Le voisin n'a pas bougé ──
select is(
  (select count(*) from public.jackpot_participants
    where campaign_id = 'eb000000-0000-4000-8000-000000000013'
      and player_token_hash = pg_temp.h('13')),
  1::bigint,
  'ISOLATION : l''entree du locataire voisin, de meme empreinte, est intacte');

-- ── Les personnes 1 et 2 n'avaient rien à réunir ──
select is(
  (select count(*) from public.jackpot_players
    where campaign_id = 'eb000000-0000-4000-8000-000000000011'
      and token_hash in (pg_temp.h('10'), pg_temp.h('11'), pg_temp.h('20'), pg_temp.h('21'))),
  2::bigint,
  'DEDUP : les personnes deja uniques gardent chacune leur unique ligne');


-- ════════════════════════════════════════════════════════════
-- 9. IDEMPOTENCE — rejouer ne change rien, ET LE DIT
--
-- La personne 2 porte DEUX empreintes pontées dont une seule est vivante :
-- elle repasse donc dans la boucle à chaque appel. Si le rapport la comptait,
-- « rejouer ne change rien » deviendrait invérifiable.
-- ════════════════════════════════════════════════════════════

create temporary table tap_etat1 on commit drop as
select md5(string_agg(l, '|' order by l)) as empreinte from (
  select 'j:' || campaign_id::text || ':' || token_hash || ':'
         || participation_count::text as l
    from public.jackpot_players
  union all
  select 'p:' || campaign_id::text || ':' || player_token_hash || ':' || id::text
    from public.jackpot_participants
  union all
  select 'w:' || campaign_id::text || ':' || winner_token_hash || ':' || code
    from public.jackpot_wins
) s;

create temporary table tap_dedup2 on commit drop as
select public.dedupe_jackpot_player_identities(null) as r;

select is(
  (select r from tap_dedup2),
  '{"wins_moved": 0, "entries_moved": 0, "players_merged": 0, "persons_deduped": 0, "bridged_identities": 0}'::jsonb,
  'IDEMPOTENCE : le second passage ne deplace rien et rend zero partout');

select is(
  (select md5(string_agg(l, '|' order by l)) from (
     select 'j:' || campaign_id::text || ':' || token_hash || ':'
            || participation_count::text as l
       from public.jackpot_players
     union all
     select 'p:' || campaign_id::text || ':' || player_token_hash || ':' || id::text
       from public.jackpot_participants
     union all
     select 'w:' || campaign_id::text || ':' || winner_token_hash || ':' || code
       from public.jackpot_wins
   ) s),
  (select empreinte from tap_etat1),
  'IDEMPOTENCE : joueurs, entrees et gains sont octet pour octet identiques');

-- Le PREMIER passage, lui, a bien travaillé — sans quoi l'assertion ci-dessus
-- serait vraie sur une fonction qui ne fait rien du tout.
select is(
  ((select r from tap_dedup1) ->> 'persons_deduped')::integer,
  3,
  'DEDUP : le premier passage a bien reuni les TROIS personnes dedoublees');
select ok(
  ((select r from tap_dedup1) ->> 'entries_moved')::integer > 0
    and ((select r from tap_dedup1) ->> 'wins_moved')::integer > 0,
  'DEDUP : et il a deplace des entrees ET un gain');


-- ════════════════════════════════════════════════════════════
-- 10. LES DROITS — le contrôle négatif est celui qui compte
-- ════════════════════════════════════════════════════════════

select ok(
  has_function_privilege('service_role',
    'public.dedupe_jackpot_player_identities(uuid)', 'EXECUTE'),
  'DROITS : le serveur peut dedupliquer');
select ok(
  not has_function_privilege('anon',
    'public.dedupe_jackpot_player_identities(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.dedupe_jackpot_player_identities(uuid)', 'EXECUTE'),
  'DROITS : ni anon ni authenticated ne peuvent deplacer des empreintes');
select ok(
  not has_function_privilege('anon',
    'public.link_jackpot_legacy_identity(uuid,uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.link_jackpot_legacy_identity(uuid,uuid,uuid,text)', 'EXECUTE'),
  'DROITS : ni anon ni authenticated ne peuvent ponter une identite');
select ok(
  not has_function_privilege('anon',
    'public.jackpot_identity_for_player(uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.jackpot_identity_for_player(uuid,uuid,uuid)', 'EXECUTE'),
  'DROITS : l''empreinte canonique n''est pas lisible hors du serveur');

select * from finish();
rollback;
