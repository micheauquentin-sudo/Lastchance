-- ============================================================
-- 20260901120000 — la description d'un lot émis est gravée
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE CONTRÔLE INTERNE (section 2). Une valeur qui ne bouge pas ne prouve
--      rien tant qu'on n'a pas montré que quelque chose la ferait bouger. Le
--      MÊME geste du commerçant réécrit la description du lot ET renomme la
--      campagne ; après resynchronisation, `experience_label` porte le nouveau
--      nom de campagne — donc `metadata` a bien été réécrit — pendant que
--      `reward_details` porte encore l'ancienne description. Les deux clés
--      vivent dans le même JSON : sans cette asymétrie, un `reward_details`
--      immobile serait indistinguable d'un miroir qui ne se resynchronise pas.
--   2. QUE LA REMISE EN CAISSE NE RÉÉCRIT RIEN (section 3). C'est le chemin
--      exact du défaut : le trigger `participations_reward_issuance` est
--      `after insert or update`, donc poser `redeemed_at` resynchronise le
--      miroir au moment même où le caissier lit la carte.
--   3. QUE LE GEL REMPLIT SANS ÉCRASER, DANS LES DEUX FORMES DE L'ABSENCE
--      (sections 4 et 4bis). « Pas de description » n'a pas la même
--      représentation partout : sur la ROUE la clé existe et vaut la chaîne
--      vide (`prizes.description` est non nulle, à défaut vide), sur les sept
--      familles à colonne nullable `jsonb_strip_nulls` retire la clé. Une
--      garde portant sur la seule PRÉSENCE de la clé aurait figé une chaîne
--      vide à vie sur le parcours principal — c'est la première rédaction de
--      cette migration, corrigée par cette mesure et non par relecture.
--   4. QUE LE REJEU DU RATTRAPAGE NE DÉTRUIT PAS LA GRAVURE (section 5). Même
--      risque que celui couvert pour le libellé par player_wallet.test.sql
--      §6bis : rejouer `sync_reward_issuance` recopie la table parente.
--   5. QUE LE GEL DU LIBELLÉ A SURVÉCU (section 6) : cette migration réécrit
--      la fonction qui le porte.
--
-- Toutes les assertions sont scopées aux fixtures de ce fichier.
-- ============================================================
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()` rend
-- « aucun plan trouvé », que rien ne distingue d'un succès.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ────────────────────────────────────────────────
-- Famille `wheel` : c'est le parcours principal, et `prizes.description` est
-- le champ que la caisse affiche sous le titre.
insert into public.organizations (id, name, slug) values
  ('ec000000-0000-4000-8000-000000000001', 'Boulangerie du gel', 'tap-details-gel');

insert into public.campaigns (id, organization_id, name, status) values
  ('ec000000-0000-4000-8000-000000000010',
   'ec000000-0000-4000-8000-000000000001', 'Opération de mai', 'active');

insert into public.wheels (id, organization_id, campaign_id, name, play_limit) values
  ('ec000000-0000-4000-8000-000000000020',
   'ec000000-0000-4000-8000-000000000001',
   'ec000000-0000-4000-8000-000000000010', 'Roue du gel', 'unlimited');

insert into public.prizes (id, organization_id, wheel_id, label, description, stock) values
  -- Le lot décrit : celui que le commerçant va réécrire.
  ('ec000000-0000-4000-8000-000000000030',
   'ec000000-0000-4000-8000-000000000001',
   'ec000000-0000-4000-8000-000000000020',
   'Café offert', 'un expresso au comptoir', 100),
  -- Lot SANS description à l'émission : dédié à la section 4. Séparé exprès —
  -- réutiliser le lot décrit rendrait le test du remplissage vide de sens.
  -- La description est la chaîne VIDE et non `null` : `prizes.description` est
  -- `not null default ''`. C'est précisément la forme que la roue produit, et
  -- celle qu'une garde portant sur la seule présence de la clé aurait gelée à
  -- vie sur le parcours principal.
  ('ec000000-0000-4000-8000-000000000031',
   'ec000000-0000-4000-8000-000000000001',
   'ec000000-0000-4000-8000-000000000020',
   'Viennoiserie', '', 100);

-- ══ 1. La description est gravée à l'émission ═══════════════
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, accepted_terms, redeem_code, player_key
) values (
  'ec000000-0000-4000-8000-000000000201',
  'ec000000-0000-4000-8000-000000000001',
  'ec000000-0000-4000-8000-000000000010',
  'ec000000-0000-4000-8000-000000000020',
  'ec000000-0000-4000-8000-000000000030',
  'Alice', true, 'GAIN-DETAILS1', repeat('e1', 32)
);

select is(
  (select metadata ->> 'reward_details' from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000201'),
  'un expresso au comptoir',
  'la description est gravée au moment de l''émission');
select is(
  (select metadata ->> 'experience_label' from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000201'),
  'Opération de mai',
  'le contexte de campagne est écrit dans le même JSON — c''est lui le témoin');

-- ══ 2. LE CONTRÔLE INTERNE : ce qui bouge, ce qui ne bouge pas ══
--
-- Un seul geste de commerçant, entre le gain et la venue du client : il
-- renomme sa récompense, en réécrit la description, et rebaptise sa campagne.
update public.prizes
   set label = 'Croissant offert',
       description = 'un croissant pur beurre, hors boissons'
 where id = 'ec000000-0000-4000-8000-000000000030';
update public.campaigns set name = 'Opération de juin'
 where id = 'ec000000-0000-4000-8000-000000000010';

select lives_ok(
  $$ select public.sync_reward_issuance('participations', 'ec000000-0000-4000-8000-000000000201') $$,
  'resynchroniser le miroir ne lève rien');

-- Le témoin d'abord : SI celui-là ne bougeait pas, l'immobilité du suivant ne
-- dirait rien du gel — seulement que rien ne resynchronise.
select is(
  (select metadata ->> 'experience_label' from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000201'),
  'Opération de juin',
  'TÉMOIN : le reste de `metadata` se resynchronise bien — le miroir a été réécrit');
select is(
  (select metadata ->> 'reward_details' from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000201'),
  'un expresso au comptoir',
  'LE GEL : la description reste celle sous laquelle le client a gagné');
select is(
  (select label from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000201'),
  'Café offert',
  'et le libellé gravé de 20260814120000 tient toujours dans la même écriture');

-- ══ 3. La remise en caisse ne réécrit pas la gravure ════════
-- Le chemin exact du défaut : le trigger est `after insert or update`, donc
-- poser `redeemed_at` resynchronise le miroir à l'instant où le caissier lit
-- la carte.
update public.participations set redeemed_at = now()
 where id = 'ec000000-0000-4000-8000-000000000201';

select is(
  (select metadata ->> 'reward_details' from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000201'),
  'un expresso au comptoir',
  'LA REMISE EN CAISSE ne réécrit pas la description — c''est elle qui déclenchait le défaut');
select isnt(
  (select redeemed_at from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000201'),
  null,
  'et la remise a bien été miroitée — la resynchronisation a réellement eu lieu');

-- ══ 4. Remplir une description absente reste possible ═══════
-- C'est l'état d'une ligne rétro-alimentée, ou du lot que le commerçant décrit
-- APRÈS l'avoir créé — le geste le plus banal de l'éditeur. Le gel doit la
-- laisser se remplir. Sur la roue cet état est une chaîne VIDE, pas une clé
-- absente : une garde portant sur `jsonb_exists` seul l'aurait figée pour
-- toujours, sur la famille qui émet le plus.
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, accepted_terms, redeem_code, player_key
) values (
  'ec000000-0000-4000-8000-000000000202',
  'ec000000-0000-4000-8000-000000000001',
  'ec000000-0000-4000-8000-000000000010',
  'ec000000-0000-4000-8000-000000000020',
  'ec000000-0000-4000-8000-000000000031',
  'Bob', true, 'GAIN-DETAILS2', repeat('e2', 32)
);

select is(
  (select metadata ->> 'reward_details' from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000202'),
  '',
  'sur la roue, « pas de description » est une chaîne VIDE — la clé EXISTE, elle est vide');

update public.prizes set description = 'une viennoiserie au choix'
 where id = 'ec000000-0000-4000-8000-000000000031';

-- La resynchronisation est EXPLICITE, et ce n'est pas une commodité de test :
-- les triggers `*_reward_issuance` sont posés sur les tables de LOTS ÉMIS
-- (`participations`…), jamais sur les tables de définition (`prizes`…).
-- Réécrire une description ne touche donc le miroir qu'au prochain geste sur
-- le lot lui-même — la remise en caisse, ou le rejeu du rattrapage.
select lives_ok(
  $$ select public.sync_reward_issuance('participations', 'ec000000-0000-4000-8000-000000000202') $$,
  'resynchroniser après réécriture de la description ne lève rien');

select is(
  (select metadata ->> 'reward_details' from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000202'),
  'une viennoiserie au choix',
  'REMPLIR OUI : une description absente se grave encore, comme le libellé vide');

-- ══ 4bis. L'autre forme de l'absence : la clé RETIRÉE ═══════
-- Les sept familles dont la colonne parente est nullable (hunt, loyalty,
-- jackpot, event, calendar, referral, quiz) n'ont PAS la clé quand la
-- description est vide — `jsonb_strip_nulls` la retire. C'est aussi la forme
-- des lignes rétro-alimentées par 20260807120000. Le prédicat porte sur la
-- valeur, il doit donc couvrir cette forme-là aussi, sans fixture d'une autre
-- famille : on retire la clé de la ligne existante et on rejoue.
update public.reward_issuances set metadata = metadata - 'reward_details'
 where source_id = 'ec000000-0000-4000-8000-000000000201';
select ok(
  not (select metadata ? 'reward_details' from public.reward_issuances
        where source_id = 'ec000000-0000-4000-8000-000000000201'),
  'la clé est bien absente — la forme des sept familles nullables');

select lives_ok(
  $$ select public.sync_reward_issuance('participations', 'ec000000-0000-4000-8000-000000000201') $$,
  'resynchroniser une ligne à clé absente ne lève rien');
select is(
  (select metadata ->> 'reward_details' from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000201'),
  'un croissant pur beurre, hors boissons',
  'REMPLIR OUI, seconde forme : une clé absente se grave, elle n''est pas bloquée par le gel');

-- ══ 5. Le rejeu du rattrapage ne détruit pas la gravure ═════
-- Même risque que pour le libellé (player_wallet.test.sql §6bis) : le
-- rattrapage de 20260822120000 rejoue `sync_reward_issuance` sur les lignes
-- orphelines, et recopierait la description du jour.
update public.prizes set description = 'RÉÉCRITE APRÈS ÉMISSION'
 where id = 'ec000000-0000-4000-8000-000000000031';
select lives_ok(
  $$ select public.sync_reward_issuance('participations', 'ec000000-0000-4000-8000-000000000202') $$,
  'le rejeu du rattrapage ne lève rien');
select is(
  (select metadata ->> 'reward_details' from public.reward_issuances
    where source_id = 'ec000000-0000-4000-8000-000000000202'),
  'une viennoiserie au choix',
  'LA GRAVURE SURVIT AU REJEU — le rattrapage ne recopie pas « RÉÉCRITE APRÈS ÉMISSION »');

-- ══ 6. Le catalogue vivant porte les DEUX gels ══════════════
-- Cette migration réécrit la fonction qui portait déjà celui du libellé : le
-- perdre en la réécrivant rouvrirait un correctif de production.
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'upsert_reward_issuance'
      and p.prosrc like '%DESCRIPTION GRAVÉE À L''ÉMISSION%'
      and p.prosrc like '%LIBELLÉ GRAVÉ À L''ÉMISSION%'
  ),
  'le corps INSTALLÉ porte les deux gravures — le libellé n''a pas été perdu en route');

select * from finish();
rollback;
