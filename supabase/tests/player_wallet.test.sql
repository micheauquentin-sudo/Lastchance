-- ============================================================
-- 20260822120000 — player_wallet + rattrapage de player_id
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE RATTRAPAGE, ET LE DÉFAUT QU'IL CORRIGE (section 6). C'est lui qui
--      décide de l'utilité de la fonctionnalité. On prouve les DEUX moitiés :
--      d'abord que `player_id` reste NULL quand le pont naît APRÈS l'émission
--      (le défaut réel, sinon on ne saurait pas qu'il y a quelque chose à
--      rattraper), puis que rejouer la synchro le résout.
--   2. QUE LE RATTRAPAGE NE DÉTRUIT PAS LES LIBELLÉS GRAVÉS (section 6bis).
--      C'était le vrai risque du geste : rejouer `sync_reward_issuance`
--      recopie la table parente. Si le gel de 20260814120000 ne tenait pas,
--      ce rattrapage réécrirait tous les libellés à leur valeur du jour et
--      annulerait un correctif de production.
--   3. LE PORTEFEUILLE NE S'OUVRE QU'AU BON TÉLÉPHONE (sections 3 et 5) :
--      appareil inconnu, hash malformé, appareil révoqué hors grâce → zéro
--      ligne. Et zéro ligne, jamais une erreur qui distinguerait les cas.
--   4. Les quatre états, le groupement par organisation, le libellé gravé,
--      les bornes et l'ACL (sections 2, 4, 7).
--
-- Toutes les assertions sont scopées au joueur ou à l'organisation de test.
-- ============================================================
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()` rend
-- « aucun plan trouvé », ce que rien ne distingue d'un succès. Le cas s'est
-- produit sur ce lot même. Avec `plan(N)`, un arrêt prématuré est un rouge.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ────────────────────────────────────────────────
-- Noms choisis pour que le tri par organisation soit VÉRIFIABLE : « AAA »
-- doit sortir avant « ZZZ », quel que soit l'ordre d'insertion (ici inversé
-- exprès).
insert into public.organizations (id, name, slug) values
  ('eb000000-0000-4000-8000-000000000002', 'ZZZ Garage',      'tap-wallet-z'),
  ('eb000000-0000-4000-8000-000000000001', 'AAA Boulangerie', 'tap-wallet-a');

insert into public.campaigns (id, organization_id, name, status) values
  ('eb000000-0000-4000-8000-000000000010',
   'eb000000-0000-4000-8000-000000000001', 'Campagne portefeuille', 'active');

insert into public.wheels (id, organization_id, campaign_id, name, play_limit) values
  ('eb000000-0000-4000-8000-000000000020',
   'eb000000-0000-4000-8000-000000000001',
   'eb000000-0000-4000-8000-000000000010', 'Roue portefeuille', 'unlimited');

insert into public.prizes (id, organization_id, wheel_id, label, stock) values
  ('eb000000-0000-4000-8000-000000000030',
   'eb000000-0000-4000-8000-000000000001',
   'eb000000-0000-4000-8000-000000000020', 'Café offert', 100),
  -- Lot DÉDIÉ au scénario de rattrapage (section 6). Séparé du précédent
  -- exprès : la section 4 renomme celui-ci, et réutiliser le même lot rendrait
  -- le test du gel ambigu — un libellé « déjà renommé À L'ÉMISSION » ne prouve
  -- rien sur ce que le rejeu préserve.
  ('eb000000-0000-4000-8000-000000000031',
   'eb000000-0000-4000-8000-000000000001',
   'eb000000-0000-4000-8000-000000000020', 'Croissant gravé', 100);

-- Identité du joueur : `resolve_player_identity` crée d'un coup le joueur,
-- l'appareil, l'adhésion et le pont legacy. C'est le chemin réel.
select is(
  (select count(*) from public.resolve_player_identity(
     repeat('7b', 32), 'eb000000-0000-4000-8000-000000000001',
     'campaign', 'eb000000-0000-4000-8000-000000000010',
     repeat('a4', 32), 'direct', null)),
  1::bigint, 'le joueur, son appareil et son pont legacy sont créés');

create temporary table tap_player on commit drop as
  select p.id as player_id
    from public.player_devices d
    join public.players p on p.id = d.player_id
   where d.token_hash = repeat('7b', 32);

-- ── Les récompenses du joueur, dans DEUX organisations ──────
-- États : active / redeemed / cancelled / expired.
insert into public.reward_issuances (
  organization_id, player_id, source_type, source_id, code, label,
  issued_at, expires_at, redeemed_at, cancelled_at, cancelled_reason
)
select * from (values
  ('eb000000-0000-4000-8000-000000000001'::uuid, (select player_id from tap_player),
   'wheel', 'eb000000-0000-4000-8000-000000000101'::uuid, 'GAIN-WAL1', 'Café offert',
   now() - interval '1 day', now() + interval '30 days', null::timestamptz, null::timestamptz, null::text),
  ('eb000000-0000-4000-8000-000000000001'::uuid, (select player_id from tap_player),
   'hunt', 'eb000000-0000-4000-8000-000000000102'::uuid, 'CHASSE-WAL2', 'Trophée',
   now() - interval '2 days', null, now() - interval '1 day', null, null),
  ('eb000000-0000-4000-8000-000000000001'::uuid, (select player_id from tap_player),
   'quiz', 'eb000000-0000-4000-8000-000000000103'::uuid, 'QUIZ-WAL3', 'Bon quiz',
   now() - interval '3 days', null, null, now() - interval '2 days', 'annulé au comptoir'),
  ('eb000000-0000-4000-8000-000000000001'::uuid, (select player_id from tap_player),
   'calendar', 'eb000000-0000-4000-8000-000000000104'::uuid, 'CADEAU-WAL4', 'Chocolat',
   now() - interval '40 days', now() - interval '10 days', null, null, null),
  -- Chez le VOISIN, même joueur : le portefeuille est cross-organisation.
  ('eb000000-0000-4000-8000-000000000002'::uuid, (select player_id from tap_player),
   'loyalty', 'eb000000-0000-4000-8000-000000000105'::uuid, 'FIDELITE-WAL5', 'Vidange',
   now() - interval '5 days', null, null, null, null)
) as v;

-- Un AUTRE joueur, chez le même commerçant : ne doit jamais fuir.
insert into public.players (id) values ('eb000000-0000-4000-8000-0000000000f9');
insert into public.reward_issuances (
  organization_id, player_id, source_type, source_id, code, label, issued_at
) values (
  'eb000000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-0000000000f9',
  'wheel', 'eb000000-0000-4000-8000-000000000106', 'GAIN-AUTRE', 'Lot d''un autre',
  now() - interval '1 day');

-- ══ 1. Le portefeuille rend les lots du bon joueur ══════════
select is(
  (select count(*) from public.player_wallet(repeat('7b', 32), 50)),
  5::bigint, 'les cinq récompenses du joueur, les deux organisations confondues');
select is(
  (select count(*) from public.player_wallet(repeat('7b', 32), 50)
    where code = 'GAIN-AUTRE'),
  0::bigint, 'le lot d''un AUTRE joueur ne fuit pas');

-- ══ 2. Groupement par organisation ══════════════════════════
-- Le tri porte le regroupement : l'appelant n'a qu'à découper sur le nom.
select is(
  (select organization_name from public.player_wallet(repeat('7b', 32), 50) limit 1),
  'AAA Boulangerie',
  'le tri groupe par organisation — « AAA » sort avant « ZZZ » malgré l''ordre d''insertion inverse');
select is(
  (select count(distinct organization_name) from public.player_wallet(repeat('7b', 32), 50)),
  2::bigint, 'les deux commerçants sont représentés');
select is(
  (select organization_name from public.player_wallet(repeat('7b', 32), 50)
    where code = 'FIDELITE-WAL5'),
  'ZZZ Garage', 'chaque lot porte le nom de SON commerçant');

-- ══ 3. Les quatre états ═════════════════════════════════════
select is(
  (select status from public.player_wallet(repeat('7b', 32), 50) where code = 'GAIN-WAL1'),
  'active', 'un lot non retiré et non échu est « active » — c''est celui à montrer en caisse');
select is(
  (select status from public.player_wallet(repeat('7b', 32), 50) where code = 'CHASSE-WAL2'),
  'redeemed', 'un lot retiré est « redeemed »');
select is(
  (select status from public.player_wallet(repeat('7b', 32), 50) where code = 'QUIZ-WAL3'),
  'cancelled', 'un lot annulé est « cancelled »');
select is(
  (select status from public.player_wallet(repeat('7b', 32), 50) where code = 'CADEAU-WAL4'),
  'expired', 'un lot échu et jamais retiré est « expired »');

-- Un lot RETIRÉ dont l'échéance est passée reste « redeemed » : l'afficher
-- « expired » ferait croire au client qu'il a perdu un droit qu'il a exercé.
update public.reward_issuances
   set expires_at = now() - interval '1 day'
 where source_id = 'eb000000-0000-4000-8000-000000000102';
select is(
  (select status from public.player_wallet(repeat('7b', 32), 50) where code = 'CHASSE-WAL2'),
  'redeemed', 'le retrait prime sur l''expiration — un droit exercé n''est pas un droit perdu');

-- ══ 4. Le libellé est le GRAVÉ, pas celui de la table parente ══
update public.prizes set label = 'RENOMMÉ APRÈS COUP'
 where id = 'eb000000-0000-4000-8000-000000000030';
select is(
  (select label from public.player_wallet(repeat('7b', 32), 50) where code = 'GAIN-WAL1'),
  'Café offert',
  'le portefeuille montre ce que le client a GAGNÉ, pas ce que le lot s''appelle aujourd''hui');

-- ══ 5. Le portefeuille ne s'ouvre qu'au bon téléphone ═══════
select is(
  (select count(*) from public.player_wallet(repeat('11', 32), 50)),
  0::bigint, 'un hash d''appareil inconnu rend zéro ligne');
select is(
  (select count(*) from public.player_wallet('pas-un-hash', 50)),
  0::bigint, 'un hash malformé rend zéro ligne — et non une erreur qui distinguerait les cas');
select is(
  (select count(*) from public.player_wallet(null, 50)),
  0::bigint, 'un hash null rend zéro ligne');

-- Appareil révoqué mais ENCORE EN GRÂCE : il lit toujours. La grâce existe
-- pour qu'une rotation de jeton ne coupe pas le joueur en plein parcours.
update public.player_devices
   set revoked_at = now(), grace_expires_at = now() + interval '10 minutes'
 where token_hash = repeat('7b', 32);
select is(
  (select count(*) from public.player_wallet(repeat('7b', 32), 50)),
  5::bigint, 'un appareil révoqué mais encore en grâce lit encore son portefeuille');

-- Grâce ÉCOULÉE : il ne lit plus rien.
update public.player_devices
   set grace_expires_at = now() - interval '1 minute'
 where token_hash = repeat('7b', 32);
select is(
  (select count(*) from public.player_wallet(repeat('7b', 32), 50)),
  0::bigint, 'grâce écoulée : l''appareil révoqué ne lit plus RIEN');

-- On rétablit l'appareil pour la suite.
update public.player_devices
   set revoked_at = null, grace_expires_at = null
 where token_hash = repeat('7b', 32);

-- ══ 5bis. NI AU BON TÉLÉPHONE D'UN JOUEUR BLOQUÉ ═══════════
--
-- L'appareil est valide, le hash est bon — mais le joueur est `blocked`. Le
-- portefeuille sert des CODES DE RETRAIT ENCAISSABLES : les rendre à un joueur
-- que le commerçant vient de bloquer, ce serait lui rendre exactement les
-- droits qu'on lui retire. Les sept autres chemins qui résolvent un appareil
-- vers des données de joueur portent `p.status = 'active'` ; celui-ci était le
-- seul à ne pas le faire, parce qu'un commentaire citait la MOITIÉ d'un
-- prédicat par son numéro de ligne.
update public.players set status = 'blocked'
 where id = (select player_id from tap_player);
select is(
  (select count(*) from public.player_wallet(repeat('7b', 32), 50)),
  0::bigint,
  'un joueur BLOQUÉ ne lit RIEN — même depuis l''appareil qui a scanné, jamais révoqué');

-- Et il relit tout dès qu'il est débloqué : la garde porte bien sur le statut,
-- pas sur un effet de bord du geste de blocage.
update public.players set status = 'active'
 where id = (select player_id from tap_player);
select is(
  (select count(*) from public.player_wallet(repeat('7b', 32), 50)),
  5::bigint, 'repassé « active », il relit ses cinq récompenses');

-- ══ 6. LE RATTRAPAGE — les deux moitiés ═════════════════════
--
-- Première moitié : LE DÉFAUT. Un lot émis AVANT que le pont n'existe porte
-- `player_id = null`, définitivement — `reward_player_from_legacy` est
-- `stable` et ne fait que LIRE le pont. Sans cette assertion, on ne saurait
-- pas qu'il y a quoi que ce soit à rattraper.
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, accepted_terms, redeem_code, player_key
) values (
  'eb000000-0000-4000-8000-000000000201',
  'eb000000-0000-4000-8000-000000000001',
  'eb000000-0000-4000-8000-000000000010',
  'eb000000-0000-4000-8000-000000000020',
  'eb000000-0000-4000-8000-000000000031',
  'Bob', true, 'GAIN-TARDIF', repeat('c9', 32)
);

-- Le libellé est gravé À CET INSTANT, avant tout renommage.
select is(
  (select label from public.reward_issuances
    where source_id = 'eb000000-0000-4000-8000-000000000201'),
  'Croissant gravé', 'le libellé est gravé au moment de l''émission');

select is(
  (select player_id from public.reward_issuances
    where source_id = 'eb000000-0000-4000-8000-000000000201'),
  null,
  'LE DÉFAUT : un lot émis avant l''existence du pont porte player_id = null');

-- Le joueur est ponté PLUS TARD (il scanne, le cookie global est posé).
select is(
  (select count(*) from public.resolve_player_identity(
     repeat('d2', 32), 'eb000000-0000-4000-8000-000000000001',
     'campaign', 'eb000000-0000-4000-8000-000000000010',
     repeat('c9', 32), 'direct', null)),
  1::bigint, 'le pont est créé APRÈS l''émission');

-- Et pourtant le registre ne bouge pas tout seul : c'est ce qui rend le
-- rattrapage NÉCESSAIRE, et non cosmétique.
select is(
  (select player_id from public.reward_issuances
    where source_id = 'eb000000-0000-4000-8000-000000000201'),
  null,
  'la création du pont ne rattrape RIEN toute seule — le registre reste orphelin');
select is(
  (select count(*) from public.player_wallet(repeat('d2', 32), 50)),
  0::bigint, 'et le portefeuille de ce client est VIDE — la fonctionnalité serait inutile pour lui');

-- ══ 6bis. Le rattrapage résout, SANS détruire le libellé ════
--
-- LE COMMERÇANT RENOMME SA RÉCOMPENSE, APRÈS l'émission et AVANT le
-- rattrapage. C'est l'ordre qui compte : si le gel de 20260814120000 ne
-- tenait pas, le rejeu de la synchro recopierait ce nouveau nom et détruirait
-- la seule trace de ce qui a été promis au client.
update public.prizes set label = 'RENOMMÉ APRÈS ÉMISSION'
 where id = 'eb000000-0000-4000-8000-000000000031';

select lives_ok(
  $$ select public.sync_reward_issuance('participations', 'eb000000-0000-4000-8000-000000000201') $$,
  'rejouer la synchro sur une ligne orpheline ne lève rien');

select isnt(
  (select player_id from public.reward_issuances
    where source_id = 'eb000000-0000-4000-8000-000000000201'),
  null,
  'LE RATTRAPAGE : rejouer la synchro résout player_id quand le pont existe aujourd''hui');
select is(
  (select count(*) from public.player_wallet(repeat('d2', 32), 50)),
  1::bigint, 'et le portefeuille de ce client s''ouvre enfin');
select is(
  (select label from public.player_wallet(repeat('d2', 32), 50)),
  'Croissant gravé',
  'LE LIBELLÉ GRAVÉ SURVIT AU RATTRAPAGE — le rejeu ne recopie pas « RENOMMÉ APRÈS ÉMISSION »');

-- Idempotence : un second rejeu n'écrase pas ce qui est déjà résolu.
select lives_ok(
  $$ select public.sync_reward_issuance('participations', 'eb000000-0000-4000-8000-000000000201') $$,
  'la synchro est rejouable');
select isnt(
  (select player_id from public.reward_issuances
    where source_id = 'eb000000-0000-4000-8000-000000000201'),
  null,
  'un second rejeu n''efface pas le player_id déjà résolu (coalesce, pas excluded)');

-- ══ 7. Bornes et ACL ════════════════════════════════════════
select is(
  (select count(*) from public.player_wallet(repeat('7b', 32), 1)),
  1::bigint, 'p_limit est respecté — un portefeuille est une page, pas un export');
select is(
  (select count(*) from public.player_wallet(repeat('7b', 32), 0)),
  1::bigint, 'p_limit = 0 est remonté à 1');

-- ADR-049 : `revoke … from public, anon` ne retire NI `authenticated` NI
-- `service_role`. Les trois révocations sont donc vérifiées séparément.
select ok(
  has_function_privilege('service_role', 'public.player_wallet(text,integer)', 'EXECUTE'),
  'le serveur peut lire un portefeuille');
select ok(
  not has_function_privilege('anon', 'public.player_wallet(text,integer)', 'EXECUTE'),
  'anon ne peut PAS : ce serait publier des codes de retrait sur PostgREST');
select ok(
  not has_function_privilege('authenticated', 'public.player_wallet(text,integer)', 'EXECUTE'),
  'un commerçant connecté non plus — ce serait une corrélation inter-organisations');

select * from finish();
rollback;
