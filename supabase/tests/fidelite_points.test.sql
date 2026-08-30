-- ============================================================
-- FID-2a — La fidélité passe aux POINTS (comportement réel sur base migrée)
--
-- Ce que ce fichier prouve, dans l'ordre :
--   1. Un tampon crédite 100 points aux DEUX compteurs et incrémente toujours
--      `visit_count` — les trois avancent ensemble, aucun ne remplace l'autre.
--   2. L'ARBITRAGE, et c'est le test central du lot : le niveau se calcule sur
--      le CUMUL (`points_earned_total`), jamais sur le solde. Un membre qui
--      dépense reste « or ». Si le niveau se lisait sur le solde, l'assertion
--      du §5 rendrait « silver ».
--   3. Un échange débite le solde et n'entame PAS le cumul.
--   4. Solde insuffisant → `insufficient_points`, et RIEN n'a bougé : ni le
--      solde, ni le compteur de stock, ni la table des récompenses.
--   5. Stock épuisé → `out_of_stock`, solde intact.
--   6. Idempotence par `p_request_id` : un rejeu rend la MÊME récompense et ne
--      débite qu'une fois.
--   7. CONTRÔLE NÉGATIF de l'idempotence : deux `p_request_id` DIFFÉRENTS sur
--      le MÊME palier débitent deux fois. Sans lui, une RPC qui refuserait
--      tout second échange passerait le §6 sans rien garantir. C'est aussi la
--      preuve que l'ancienne contrainte `unique (member_id, milestone_id)` a
--      bien été restreinte au chemin des récompenses OFFERTES.
--   8. États nommés du refus : `unknown_milestone` (y compris pour un palier
--      d'une AUTRE organisation — pas d'oracle inter-tenant), `inactive`,
--      `not_a_member`.
--   9. ACL : `anon` et `authenticated` ne peuvent ni exécuter la RPC ni écrire
--      les compteurs ; les colonnes neuves sont lisibles là où il faut.
--  10. La conversion ×100 : sur la ligne SEMÉE (le seed est rejoué APRÈS les
--      migrations, ses valeurs sont donc écrites dans la nouvelle unité), et
--      sur le trigger transitoire qui dérive `cost_points` de `visit_count`.
--  11. Le lot est ADDITIF : l'émission d'une récompense au franchissement d'un
--      palier fonctionne toujours, et crédite désormais des points au passage.
--
-- CE FICHIER EXIGE LA BASE SEMÉE (§10) : `supabase db reset` ne sème rien,
-- appliquer `supabase/seed.sql` explicitement. La CI le fait avant pgTAP.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_loyalty)
values ('fd000000-0000-4000-8000-000000000001', 'Test Points', 'tap-points', true);
-- Seconde organisation : preuve qu'un palier d'ailleurs est indiscernable d'un
-- identifiant inventé.
insert into public.organizations (id, name, slug, addon_loyalty)
values ('fd000000-0000-4000-8000-000000000031', 'Autre Org Points', 'tap-points-2', true);

-- Programme A — mode staff (cooldown au plancher 300 s), seuils EN POINTS :
-- argent à 200 (2 visites), or à 300 (3 visites).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  min_stamp_interval_seconds, silver_threshold, gold_threshold
) values (
  'fd000000-0000-4000-8000-000000000002',
  'fd000000-0000-4000-8000-000000000001',
  'Boutique de points', 'active', 'staff', 300, 200, 300
);

-- Programme B — sert au §11 (l'émission au franchissement survit).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  min_stamp_interval_seconds, silver_threshold, gold_threshold
) values (
  'fd000000-0000-4000-8000-000000000003',
  'fd000000-0000-4000-8000-000000000001',
  'Passeport palier', 'active', 'staff', 300, 200, 300
);

-- Roue cible du palier `spin` acheté.
insert into public.campaigns (id, organization_id, name, status)
values ('fd000000-0000-4000-8000-000000000021',
        'fd000000-0000-4000-8000-000000000001', 'Campagne points', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('fd000000-0000-4000-8000-000000000022',
        'fd000000-0000-4000-8000-000000000001',
        'fd000000-0000-4000-8000-000000000021', 'Roue points', 'unlimited');

-- ── Les paliers du programme A sont une BOUTIQUE, pas des seuils ──
--
-- `visit_count` est volontairement placé hors d'atteinte (900+) : le
-- franchissement automatique ne doit JAMAIS se déclencher pendant les tests
-- d'échange, sinon il émettrait des récompenses et consommerait du stock dans
-- le dos des assertions. Seul `cost_points` — fourni explicitement, donc le
-- trigger de dérivation ne s'en mêle pas — gouverne le prix.
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, cost_points, reward_type,
  reward_label, reward_stock, position
) values
  -- A1 : le café, 200 points, stock 5. Achetable deux fois (§7).
  ('fd000000-0000-4000-8000-000000000011',
   'fd000000-0000-4000-8000-000000000002',
   'fd000000-0000-4000-8000-000000000001', 900, 200, 'lot',
   'Café offert', 5, 0),
  -- A2 : stock ZÉRO — le refus `out_of_stock` (§5).
  ('fd000000-0000-4000-8000-000000000012',
   'fd000000-0000-4000-8000-000000000002',
   'fd000000-0000-4000-8000-000000000001', 901, 300, 'lot',
   'Rupture', 0, 1),
  -- A3 : hors de prix — le refus `insufficient_points` (§4).
  ('fd000000-0000-4000-8000-000000000013',
   'fd000000-0000-4000-8000-000000000002',
   'fd000000-0000-4000-8000-000000000001', 902, 5000, 'lot',
   'Trop cher', 5, 2);

-- A4 : tour de roue offert, 100 points — l'autre branche d'émission.
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, cost_points, reward_type,
  target_wheel_id, reward_stock, position
) values (
  'fd000000-0000-4000-8000-000000000014',
  'fd000000-0000-4000-8000-000000000002',
  'fd000000-0000-4000-8000-000000000001', 903, 100, 'spin',
  'fd000000-0000-4000-8000-000000000022', 5, 3
);

-- Palier du programme B : un VRAI seuil, à 2 visites (§11).
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  reward_label, reward_stock, position
) values (
  'fd000000-0000-4000-8000-000000000015',
  'fd000000-0000-4000-8000-000000000003',
  'fd000000-0000-4000-8000-000000000001', 2, 'lot',
  'Palier classique', 3, 0
);

-- Palier de l'AUTRE organisation (§8).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  min_stamp_interval_seconds, silver_threshold, gold_threshold
) values (
  'fd000000-0000-4000-8000-000000000032',
  'fd000000-0000-4000-8000-000000000031',
  'Programme voisin', 'active', 'staff', 300, 200, 300
);
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, cost_points, reward_type,
  reward_label, reward_stock, position
) values (
  'fd000000-0000-4000-8000-000000000033',
  'fd000000-0000-4000-8000-000000000032',
  'fd000000-0000-4000-8000-000000000031', 900, 100, 'lot',
  'Lot du voisin', 5, 0
);

create temporary table tap_r (r jsonb) on commit drop;

-- Un tampon staff exige l'identité du validateur.
create function pg_temp.tap_stamp(p_program uuid, p_hash text)
returns jsonb language sql as $$
  select public.record_loyalty_stamp(
    p_program, p_hash, null, 'fd000000-0000-4000-8000-000000000099'::uuid);
$$;

-- Le cooldown (300 s) est reculé entre deux tampons du même passeport.
create function pg_temp.tap_rewind(p_hash text)
returns void language sql as $$
  update public.loyalty_members
     set last_stamp_at = last_stamp_at - interval '1 day'
   where token_hash = p_hash;
$$;


-- ══ 1. UN TAMPON CRÉDITE 100 POINTS AUX DEUX COMPTEURS ═══════
delete from tap_r;
insert into tap_r select pg_temp.tap_stamp(
  'fd000000-0000-4000-8000-000000000002', repeat('a', 64));

select is((select r->>'state' from tap_r), 'stamped', 'premier tampon validé');
select is((select r->>'visit_count' from tap_r), '1',
  'visit_count RESTE et compte toujours les visites');
select is((select r->>'points_balance' from tap_r), '100',
  'le solde est crédité de 100 points');
select is((select r->>'points_earned_total' from tap_r), '100',
  'le cumul est crédité des mêmes 100 points');
select is((select r->>'points_earned' from tap_r), '100',
  'la réponse annonce ce que la visite a rapporté');
select is((select r->>'tier' from tap_r), 'bronze',
  '100 points : sous le seuil argent (200)');

select results_eq(
  $q$select visit_count, points_balance, points_earned_total
       from public.loyalty_members where token_hash = repeat('a', 64)$q$,
  $q$values (1, 100, 100)$q$,
  'les trois compteurs sont écrits en base, pas seulement dans la réponse');


-- ══ 2. LE NIVEAU MONTE AVEC LE CUMUL ════════════════════════
select pg_temp.tap_rewind(repeat('a', 64));
delete from tap_r;
insert into tap_r select pg_temp.tap_stamp(
  'fd000000-0000-4000-8000-000000000002', repeat('a', 64));
select is((select r->>'points_earned_total' from tap_r), '200', 'cumul à 200');
select is((select r->>'tier' from tap_r), 'silver', 'seuil argent (200 points)');

select pg_temp.tap_rewind(repeat('a', 64));
delete from tap_r;
insert into tap_r select pg_temp.tap_stamp(
  'fd000000-0000-4000-8000-000000000002', repeat('a', 64));
select is((select r->>'points_earned_total' from tap_r), '300', 'cumul à 300');
select is((select r->>'points_balance' from tap_r), '300', 'solde à 300');
select is((select r->>'tier' from tap_r), 'gold', 'seuil or (300 points)');


-- ══ 3. SOLDE INSUFFISANT : REFUS NOMMÉ, ET RIEN N'A BOUGÉ ════
delete from tap_r;
insert into tap_r select public.spend_loyalty_points(
  'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
  'fd000000-0000-4000-8000-000000000013',
  'fd000000-0000-4000-8000-0000000000a1');

select is((select r->>'state' from tap_r), 'insufficient_points',
  'palier hors de prix : insufficient_points (pas un false muet)');
select is((select r->>'points_missing' from tap_r), '4700',
  'la réponse dit COMBIEN il manque');
select results_eq(
  $q$select points_balance, points_earned_total
       from public.loyalty_members where token_hash = repeat('a', 64)$q$,
  $q$values (300, 300)$q$,
  'refus faute de points : les compteurs n''ont pas bougé');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'fd000000-0000-4000-8000-000000000013'), 0,
  'refus faute de points : le stock n''a pas été entamé');
select is((select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('a', 64)), 0::bigint,
  'refus faute de points : aucune récompense émise');


-- ══ 4. STOCK ÉPUISÉ : REFUS NOMMÉ, SOLDE INTACT ═════════════
delete from tap_r;
insert into tap_r select public.spend_loyalty_points(
  'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
  'fd000000-0000-4000-8000-000000000012',
  'fd000000-0000-4000-8000-0000000000a2');

select is((select r->>'state' from tap_r), 'out_of_stock',
  'palier épuisé : out_of_stock');
select is((select r->>'points_balance' from tap_r), '300',
  'stock épuisé : le solde annoncé est intact');
select is((select points_balance from public.loyalty_members
    where token_hash = repeat('a', 64)), 300,
  'stock épuisé : le solde en base est intact');
select is((select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('a', 64)), 0::bigint,
  'stock épuisé : aucune récompense émise');


-- ══ 5. L'ÉCHANGE — ET L'ARBITRAGE DES DEUX COMPTEURS ════════
delete from tap_r;
insert into tap_r select public.spend_loyalty_points(
  'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
  'fd000000-0000-4000-8000-000000000011',
  'fd000000-0000-4000-8000-0000000000a3');

select is((select r->>'state' from tap_r), 'spent', 'échange accepté');
select is((select r->>'idempotent' from tap_r), 'false',
  'premier appel : ce n''est pas un rejeu');
select ok((select r->>'code' from tap_r) ~ '^FIDELITE-[A-HJ-NP-Z2-9]{8}$',
  'le code réutilise la génération existante (préfixe et alphabet)');
select is((select r->>'spent_points' from tap_r), '200',
  'la réponse dit ce qui a été payé');
select is((select r->>'points_balance' from tap_r), '100',
  'le solde est débité du prix du palier');
select is((select r->>'points_earned_total' from tap_r), '300',
  'LE CUMUL N''EST PAS ENTAMÉ par la dépense');

select results_eq(
  $q$select points_balance, points_earned_total, tier
       from public.loyalty_members where token_hash = repeat('a', 64)$q$,
  $q$values (100, 300, 'gold'::text)$q$,
  'en base : solde descendu, cumul intact, niveau OR conservé');

-- Le prix payé est GRAVÉ sur la récompense.
select results_eq(
  $q$select spent_points, request_id from public.loyalty_rewards r
       join public.loyalty_members m on m.id = r.member_id
      where m.token_hash = repeat('a', 64)$q$,
  $q$values (200, 'fd000000-0000-4000-8000-0000000000a3'::uuid)$q$,
  'la récompense porte le montant débité et l''intention qui l''a émise');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'fd000000-0000-4000-8000-000000000011'), 1,
  'l''échange a consommé une unité de stock');


-- ══ 6. IDEMPOTENCE — LE MÊME request_id NE DÉBITE QU'UNE FOIS ═
create temporary table tap_first (id uuid, code text) on commit drop;
insert into tap_first
  select r.id, r.code from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('a', 64);

delete from tap_r;
insert into tap_r select public.spend_loyalty_points(
  'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
  'fd000000-0000-4000-8000-000000000011',
  'fd000000-0000-4000-8000-0000000000a3');

select is((select r->>'state' from tap_r), 'spent',
  'rejeu : le même état, pas une erreur');
select is((select r->>'idempotent' from tap_r), 'true',
  'rejeu : la réponse le DIT (l''appelant peut le distinguer)');
select is((select r->>'reward_id' from tap_r), (select id::text from tap_first),
  'rejeu : la MÊME récompense, pas une seconde');
select is((select r->>'code' from tap_r), (select code from tap_first),
  'rejeu : le même code de retrait');
select is((select points_balance from public.loyalty_members
    where token_hash = repeat('a', 64)), 100,
  'rejeu : UN SEUL débit (le double-clic ne coûte pas deux fois)');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'fd000000-0000-4000-8000-000000000011'), 1,
  'rejeu : le stock n''est décompté qu''une fois');
select is((select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('a', 64)), 1::bigint,
  'rejeu : toujours une seule ligne de récompense');


-- ══ 7. L'ARBITRAGE, VU DEPUIS LE TAMPON SUIVANT ═════════════
--
-- LE test du lot. Le membre a dépensé : solde 100, cumul 300. Un nouveau
-- tampon porte le solde à 200 et le cumul à 400. Si le niveau se lisait sur le
-- SOLDE, 200 rendrait « silver » — le client serait rétrogradé pour avoir
-- utilisé son café. Il se lit sur le cumul : « gold ».
select pg_temp.tap_rewind(repeat('a', 64));
delete from tap_r;
insert into tap_r select pg_temp.tap_stamp(
  'fd000000-0000-4000-8000-000000000002', repeat('a', 64));

select is((select r->>'points_balance' from tap_r), '200', 'solde remonté à 200');
select is((select r->>'points_earned_total' from tap_r), '400', 'cumul à 400');
select is((select r->>'tier' from tap_r), 'gold',
  'LE NIVEAU SE LIT SUR LE CUMUL : un membre qui dépense reste OR (le solde à 200 rendrait « silver »)');


-- ══ 8. CONTRÔLE NÉGATIF DE L'IDEMPOTENCE ════════════════════
--
-- Deux request_id DIFFÉRENTS sur le MÊME palier : deux débits. Sans cette
-- assertion, une RPC qui refuserait tout second échange passerait le §6.
-- C'est aussi la preuve que `unique (member_id, milestone_id)` ne s'applique
-- plus aux récompenses ACHETÉES.
delete from tap_r;
insert into tap_r select public.spend_loyalty_points(
  'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
  'fd000000-0000-4000-8000-000000000011',
  'fd000000-0000-4000-8000-0000000000a4');

select is((select r->>'state' from tap_r), 'spent',
  'nouvelle intention : le même palier se rachète');
select is((select r->>'idempotent' from tap_r), 'false',
  'nouvelle intention : ce n''est pas un rejeu');
select isnt((select r->>'reward_id' from tap_r), (select id::text from tap_first),
  'nouvelle intention : une récompense DIFFÉRENTE');
select is((select points_balance from public.loyalty_members
    where token_hash = repeat('a', 64)), 0,
  'nouvelle intention : SECOND débit (200 → 0)');
select is((select points_earned_total from public.loyalty_members
    where token_hash = repeat('a', 64)), 400,
  'deux dépenses plus tard, le cumul n''a toujours pas bougé');
select is((select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('a', 64)
     and r.milestone_id = 'fd000000-0000-4000-8000-000000000011'), 2::bigint,
  'le MÊME palier est acheté deux fois : la contrainte d''unicité a bien été restreinte aux récompenses offertes');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'fd000000-0000-4000-8000-000000000011'), 2,
  'deux achats, deux unités de stock');


-- ══ 9. LE TOUR DE ROUE S'ACHÈTE AUSSI (grant_token) ═════════
delete from tap_r;
insert into tap_r select pg_temp.tap_stamp(
  'fd000000-0000-4000-8000-000000000002', repeat('b', 64));
select is((select r->>'points_balance' from tap_r), '100',
  'passeport B : 100 points après un tampon');

delete from tap_r;
insert into tap_r select public.spend_loyalty_points(
  'fd000000-0000-4000-8000-000000000002', repeat('b', 64),
  'fd000000-0000-4000-8000-000000000014',
  'fd000000-0000-4000-8000-0000000000b1');

select is((select r->>'state' from tap_r), 'spent', 'palier spin acheté');
select ok((select r->>'grant_token' from tap_r) ~ '^[0-9a-f]{48}$',
  'le tour offert réutilise la génération de grant existante (48 hex)');
select is((select r->>'code' from tap_r), null::text,
  'un tour de roue ne porte pas de code de retrait');
select is((select r->>'target_wheel_id' from tap_r),
  'fd000000-0000-4000-8000-000000000022',
  'la roue cible est annoncée à l''appelant');
select is((select points_balance from public.loyalty_members
    where token_hash = repeat('b', 64)), 0,
  'le tour offert se paie comme un lot');


-- ══ 10. LES AUTRES ÉTATS NOMMÉS ═════════════════════════════
select is((public.spend_loyalty_points(
    'fd000000-0000-4000-8000-000000000002', repeat('c', 64),
    'fd000000-0000-4000-8000-000000000011',
    'fd000000-0000-4000-8000-0000000000c1'))->>'state',
  'not_a_member', 'jeton sans passeport : not_a_member');

select is((public.spend_loyalty_points(
    'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
    'fd000000-0000-4000-8000-00000000ffff',
    'fd000000-0000-4000-8000-0000000000c2'))->>'state',
  'unknown_milestone', 'palier inventé : unknown_milestone');

-- PAS D'ORACLE INTER-TENANT : le palier du voisin EXISTE, et rend pourtant la
-- même réponse qu'un identifiant inventé.
select is((public.spend_loyalty_points(
    'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
    'fd000000-0000-4000-8000-000000000033',
    'fd000000-0000-4000-8000-0000000000c3'))->>'state',
  'unknown_milestone', 'palier d''une AUTRE organisation : même réponse qu''un palier inventé');

update public.loyalty_programs set status = 'draft'
 where id = 'fd000000-0000-4000-8000-000000000002';
select is((public.spend_loyalty_points(
    'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
    'fd000000-0000-4000-8000-000000000011',
    'fd000000-0000-4000-8000-0000000000c4'))->>'state',
  'inactive', 'programme en brouillon : inactive');
update public.loyalty_programs set status = 'active'
 where id = 'fd000000-0000-4000-8000-000000000002';

update public.organizations set addon_loyalty = false
 where id = 'fd000000-0000-4000-8000-000000000001';
select is((public.spend_loyalty_points(
    'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
    'fd000000-0000-4000-8000-000000000011',
    'fd000000-0000-4000-8000-0000000000c5'))->>'state',
  'inactive', 'addon coupé : inactive (même réponse, pas d''oracle)');
update public.organizations set addon_loyalty = true
 where id = 'fd000000-0000-4000-8000-000000000001';

-- Aucun de ces refus n'a émis quoi que ce soit.
select is((select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('a', 64)), 2::bigint,
  'les refus n''ont créé aucune récompense supplémentaire');


-- ══ 11. LE LOT EST ADDITIF : LE FRANCHISSEMENT ÉMET TOUJOURS ═
insert into tap_r select pg_temp.tap_stamp(
  'fd000000-0000-4000-8000-000000000003', repeat('d', 64));
select pg_temp.tap_rewind(repeat('d', 64));
delete from tap_r;
insert into tap_r select pg_temp.tap_stamp(
  'fd000000-0000-4000-8000-000000000003', repeat('d', 64));

select is((select jsonb_array_length(r->'milestones_reached') from tap_r), 1,
  'le palier à 2 visites se déclenche TOUJOURS tout seul (émission conservée)');
select ok((select r->'milestones_reached'->0->>'code' from tap_r)
    ~ '^FIDELITE-[A-HJ-NP-Z2-9]{8}$',
  'le franchissement émet toujours un code de retrait');
select is((select r->>'points_balance' from tap_r), '200',
  'et le même tampon a crédité les points : les deux mécanismes coexistent');
-- Une récompense OFFERTE ne porte ni intention ni prix.
select results_eq(
  $q$select request_id is null, spent_points is null
       from public.loyalty_rewards r
       join public.loyalty_members m on m.id = r.member_id
      where m.token_hash = repeat('d', 64)$q$,
  $q$values (true, true)$q$,
  'une récompense offerte n''a ni request_id ni spent_points');


-- ══ 12. LA CONVERSION ×100 SUR UNE LIGNE SEMÉE ══════════════
--
-- Le seed est rejoué APRÈS les migrations : ses valeurs sont donc écrites
-- directement dans la nouvelle unité. Ces assertions gardent cette cohérence —
-- un seed resté en visites ferait passer tout nouveau membre « or » au premier
-- tampon sans que rien d'autre ne rougisse.
select is((select count(*) from public.loyalty_programs
    where id = 'e2eb0000-0000-4000-8000-000000000001'), 1::bigint,
  'le programme semé est présent (sinon la base n''a pas été semée)');
select results_eq(
  $q$select silver_threshold, gold_threshold from public.loyalty_programs
      where id = 'e2eb0000-0000-4000-8000-000000000001'$q$,
  $q$values (200, 300)$q$,
  'ligne semée : les seuils sont EN POINTS (2 et 3 visites × 100)');
select results_eq(
  $q$select visit_count, cost_points from public.loyalty_milestones
      where program_id = 'e2eb0000-0000-4000-8000-000000000001'
      order by position$q$,
  $q$values (2, 200), (3, 300)$q$,
  'ligne semée : le prix de chaque palier vaut visit_count × 100');

-- LE DÉFAUT DE COLONNE A SUIVI. Sans cette conversion, un programme créé après
-- la migration naîtrait avec un seuil or à 10 POINTS — donc « or » dès le
-- premier tampon, qui en rapporte 100. Aucune donnée existante ne serait
-- fausse pour autant : c'est exactement le genre de défaut qu'une relecture
-- ligne à ligne laisse passer.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode, min_stamp_interval_seconds
) values (
  'fd000000-0000-4000-8000-000000000061',
  'fd000000-0000-4000-8000-000000000001',
  'Programme sans seuils', 'active', 'staff', 300
);
select results_eq(
  $q$select silver_threshold, gold_threshold from public.loyalty_programs
      where id = 'fd000000-0000-4000-8000-000000000061'$q$,
  $q$values (500, 1000)$q$,
  'un programme créé sans seuils naît avec des défauts EN POINTS (500 / 1000), pas 5 / 10');


-- ══ 13. LE TRIGGER TRANSITOIRE DE DÉRIVATION DU PRIX ════════
--
-- Tant que l'écran commerçant configure des VISITES, le prix se dérive. Sans
-- ce trigger, `cost_points not null` casserait `src/actions/loyalty.ts`,
-- `experience-relance.ts` et le seed — tous insèrent un palier sans prix.
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  reward_label, reward_stock, position
) values (
  'fd000000-0000-4000-8000-000000000041',
  'fd000000-0000-4000-8000-000000000002',
  'fd000000-0000-4000-8000-000000000001', 7, 'lot', 'Dérivé', 5, 9
);
select is((select cost_points from public.loyalty_milestones
    where id = 'fd000000-0000-4000-8000-000000000041'), 700,
  'insertion sans prix : dérivé de visit_count × 100');

update public.loyalty_milestones set visit_count = 9
 where id = 'fd000000-0000-4000-8000-000000000041';
select is((select cost_points from public.loyalty_milestones
    where id = 'fd000000-0000-4000-8000-000000000041'), 900,
  'le nombre de visites change SEUL : le prix suit');

update public.loyalty_milestones set visit_count = 4, cost_points = 250
 where id = 'fd000000-0000-4000-8000-000000000041';
select is((select cost_points from public.loyalty_milestones
    where id = 'fd000000-0000-4000-8000-000000000041'), 250,
  'un prix explicite gagne toujours contre la dérivation');

-- LE TRIGGER REMPLACE LE `not null` auquel on a renoncé (voir la migration :
-- une colonne NOT NULL sans défaut rend `cost_points` obligatoire dans le type
-- Insert engendré et casse tous les écrivains existants). La garantie doit
-- donc être PROUVÉE ici, dans les deux sens.
update public.loyalty_milestones set cost_points = null
 where id = 'fd000000-0000-4000-8000-000000000041';
select is((select cost_points from public.loyalty_milestones
    where id = 'fd000000-0000-4000-8000-000000000041'), 400,
  'un prix remis à NULL est immédiatement re-dérivé (4 visites × 100)');

insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, cost_points, reward_type,
  reward_label, reward_stock, position
) values (
  'fd000000-0000-4000-8000-000000000042',
  'fd000000-0000-4000-8000-000000000002',
  'fd000000-0000-4000-8000-000000000001', 6, null, 'lot', 'Null explicite', 5, 12
);
select is((select cost_points from public.loyalty_milestones
    where id = 'fd000000-0000-4000-8000-000000000042'), 600,
  'un NULL explicite à l''insertion est dérivé lui aussi');

select is((select count(*) from public.loyalty_milestones
    where cost_points is null), 0::bigint,
  'INVARIANT : aucun palier sans prix ne peut exister en base');

-- Deux paliers au même prix seraient indistinguables à l'échange.
select throws_ok($$
  insert into public.loyalty_milestones (
    program_id, organization_id, visit_count, cost_points, reward_type,
    reward_label, reward_stock, position)
  values ('fd000000-0000-4000-8000-000000000002',
          'fd000000-0000-4000-8000-000000000001', 42, 200, 'lot',
          'Doublon de prix', 5, 10)
$$, '23505', null,
  'deux paliers au MÊME prix dans un programme : refusé');

select throws_ok($$
  insert into public.loyalty_milestones (
    program_id, organization_id, visit_count, cost_points, reward_type,
    reward_label, reward_stock, position)
  values ('fd000000-0000-4000-8000-000000000002',
          'fd000000-0000-4000-8000-000000000001', 43, 0, 'lot',
          'Gratuit', 5, 11)
$$, '23514', null,
  'un palier à 0 point : refusé (cost_points >= 1)');


-- ══ 14. ACL ═════════════════════════════════════════════════
select ok(not has_function_privilege(
    'anon', 'public.spend_loyalty_points(uuid, text, uuid, uuid)', 'EXECUTE'),
  'anon ne peut pas exécuter spend_loyalty_points');
select ok(not has_function_privilege(
    'authenticated', 'public.spend_loyalty_points(uuid, text, uuid, uuid)', 'EXECUTE'),
  'authenticated ne peut pas exécuter spend_loyalty_points');
select ok(has_function_privilege(
    'service_role', 'public.spend_loyalty_points(uuid, text, uuid, uuid)', 'EXECUTE'),
  'service_role l''exécute (c''est lui qui porte les server actions)');

-- La garde de rôle vit AUSSI dans le corps : le droit d'exécution n'est pas la
-- seule barrière.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$
  select public.spend_loyalty_points(
    'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
    'fd000000-0000-4000-8000-000000000011',
    'fd000000-0000-4000-8000-0000000000e1')
$$, 'P0001', 'not authorized',
  'même appelée, la RPC refuse un appelant qui n''est pas service_role');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Sans intention, pas d'idempotence possible : on refuse plutôt que de servir
-- un achat qu'un rejeu doublerait.
select throws_ok($$
  select public.spend_loyalty_points(
    'fd000000-0000-4000-8000-000000000002', repeat('a', 64),
    'fd000000-0000-4000-8000-000000000011', null)
$$, 'P0001', 'request id required',
  'p_request_id est obligatoire');

-- ── Les colonnes neuves : lisibles là où il faut ──
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_members', 'points_balance', 'SELECT'),
  'points_balance est lisible par le commerçant (sinon PostgREST refuse le select ENTIER)');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_members', 'points_earned_total', 'SELECT'),
  'points_earned_total est lisible par le commerçant');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_rewards', 'spent_points', 'SELECT'),
  'spent_points est lisible par la caisse');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_rewards', 'request_id', 'SELECT'),
  'request_id est lisible par la caisse');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_milestones', 'cost_points', 'SELECT'),
  'cost_points est lisible dans l''éditeur de programme');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_milestones', 'cost_points', 'INSERT'),
  'cost_points s''insère depuis l''éditeur de programme');
select ok(has_column_privilege(
    'authenticated', 'public.loyalty_milestones', 'cost_points', 'UPDATE'),
  'cost_points se corrige depuis l''éditeur — le grant de colonne manquant est la panne n°1 de ce dépôt');

-- ── Et PAS ailleurs ──
select ok(not has_column_privilege(
    'authenticated', 'public.loyalty_members', 'points_balance', 'UPDATE'),
  'une session marchande ne peut PAS écrire un solde : la monnaie se gagne, elle ne se déclare pas');
select ok(not has_column_privilege(
    'authenticated', 'public.loyalty_members', 'points_earned_total', 'UPDATE'),
  'une session marchande ne peut PAS écrire un cumul (ce serait s''offrir un niveau)');
select ok(not has_column_privilege(
    'authenticated', 'public.loyalty_rewards', 'spent_points', 'UPDATE'),
  'le prix payé est un fait historique, pas un champ de formulaire');
select ok(not has_table_privilege(
    'anon', 'public.loyalty_members', 'SELECT'),
  'anon ne lit toujours RIEN des passeports');
select ok(not has_table_privilege(
    'anon', 'public.loyalty_rewards', 'SELECT'),
  'anon ne lit toujours RIEN des récompenses');

select finish();
rollback;
