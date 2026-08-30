-- ============================================================
-- FID-2b — LE TAMPON NE DISTRIBUE PLUS RIEN (comportement réel sur base migrée)
--
-- FID-2a avait laissé les DEUX voies ouvertes à dessein : le tampon émettait
-- encore au franchissement d'un seuil, pendant que `spend_loyalty_points`
-- apprenait à vendre. 20261115120000 ferme la première. Ce fichier prouve que
-- la fermeture est exacte — ni trop, ni trop peu.
--
-- Ce qu'il établit, dans l'ordre :
--
--   1. LE TEST DU LOT. Un tampon qui franchit le seuil d'un palier ne crée
--      AUCUNE ligne `loyalty_rewards`, n'annonce aucun palier atteint, et ne
--      décompte pas le stock. C'est la seule assertion qui rougirait si
--      l'émission revenait.
--   2. LE RESTE EST INTACT. Le même tampon crédite ses 100 points aux deux
--      compteurs, incrémente `visit_count`, fait monter le niveau et
--      journalise le tampon. Sans ce point, « ne distribue plus rien » se
--      confondrait avec « ne fait plus rien ».
--   3. LE JETON DE COMMANDE MARCHE TOUJOURS. C'est la fonctionnalité qu'une
--      mauvaise filiation aurait effacée sans bruit — `record_loyalty_stamp` a
--      été réécrite SIX fois et 20260915120000 l'a DROP-ée pour la recréer à
--      cinq paramètres. Rien d'autre ne la garde ici : `loyalty_order_codes`
--      est le seul chemin qui contourne le cooldown, et un corps repris d'une
--      version de juillet le supprimerait en passant la CI au vert.
--   4. L'ÉCHANGE EST LA VOIE RESTANTE, et il fonctionne après le changement :
--      `spend_loyalty_points` débite, émet le code, décompte le stock.
--   5. LES CODES DÉJÀ EN CIRCULATION RESTENT VALABLES. Une récompense de la
--      forme qu'écrivait le tampon d'AVANT (`request_id` null, `spent_points`
--      null) se remet en caisse exactement comme avant.
--   6. LE CATALOGUE. Le corps installé ne porte plus de génération de code,
--      porte toujours le jeton de commande et le crédit des points, l'arité
--      n'a pas bougé, les ACL non plus, et le trigger transitoire de
--      dérivation du prix est TOUJOURS LÀ — le retirer trop tôt laisserait
--      des paliers sans prix, donc inachetables, maintenant que l'autre voie
--      est fermée.
--
-- `no_plan()` comme les deux fichiers voisins (`loyalty.test.sql`,
-- `fidelite_points.test.sql`) : celui-ci ne descend jamais de
-- superutilisateur, aucune section ne peut s'interrompre en silence.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Les tests tournent en tant que `postgres` : `auth.role()` y est null et la
-- RPC lèverait. La revendication de rôle est posée à la main, comme le fait
-- PostgREST.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_loyalty)
values ('fe000000-0000-4000-8000-000000000001', 'Test Fin Émission', 'tap-fid2b', true);

-- Programme staff, cooldown au plancher (300 s). Seuils EN POINTS : argent à
-- 200 (2 visites), or à 300 (3 visites) — le niveau doit bouger sous nos yeux
-- pendant que les récompenses, elles, ne bougent plus.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  min_stamp_interval_seconds, silver_threshold, gold_threshold
) values (
  'fe000000-0000-4000-8000-000000000002',
  'fe000000-0000-4000-8000-000000000001',
  'Passeport fin émission', 'active', 'staff', 300, 200, 300
);

-- LE PALIER PIÈGE : `visit_count` = 2, donc franchi par le SECOND tampon.
-- Sous l'ancien comportement, ce tampon-là émettait un code et décomptait le
-- stock. Son prix (200 points) est laissé au trigger transitoire de
-- dérivation — c'est aussi une preuve que ce trigger est encore en place.
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  reward_label, reward_details, reward_stock, position
) values (
  'fe000000-0000-4000-8000-000000000011',
  'fe000000-0000-4000-8000-000000000002',
  'fe000000-0000-4000-8000-000000000001', 2, 'lot',
  'Café offert', 'À retirer au comptoir', 5, 0
);

-- Palier plus lointain : sert uniquement à vérifier que `next_milestone`
-- continue d'annoncer une progression.
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  reward_label, reward_stock, position
) values (
  'fe000000-0000-4000-8000-000000000012',
  'fe000000-0000-4000-8000-000000000002',
  'fe000000-0000-4000-8000-000000000001', 5, 'lot',
  'Le dixième café', 5, 1
);

create temporary table tap_r (r jsonb) on commit drop;

-- Un tampon staff exige l'identité du validateur.
create function pg_temp.tap_stamp(p_hash text)
returns jsonb language sql as $$
  select public.record_loyalty_stamp(
    'fe000000-0000-4000-8000-000000000002'::uuid, p_hash, null,
    'fe000000-0000-4000-8000-000000000099'::uuid);
$$;

-- Le cooldown (300 s) est reculé entre deux tampons du même passeport.
create function pg_temp.tap_rewind(p_hash text)
returns void language sql as $$
  update public.loyalty_members
     set last_stamp_at = last_stamp_at - interval '1 day'
   where token_hash = p_hash;
$$;

-- Récompenses d'un passeport donné — le compteur qui porte tout le lot.
create function pg_temp.tap_rewards(p_hash text)
returns bigint language sql as $$
  select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = p_hash;
$$;

-- Le trigger transitoire a-t-il dérivé le prix ? (Si non, tout le §4 devient
-- ininterprétable : un palier sans prix n'est achetable par personne.)
select is(
  (select cost_points from public.loyalty_milestones
    where id = 'fe000000-0000-4000-8000-000000000011'),
  200,
  'le prix du palier est dérivé de visit_count × 100 (trigger transitoire en place)');


-- ══ 1. PREMIER TAMPON : rien à distribuer, et rien n'est distribué ══
delete from tap_r;
insert into tap_r select pg_temp.tap_stamp(repeat('a', 64));

select is((select r->>'state' from tap_r), 'stamped', 'premier tampon validé');
select is((select r->>'visit_count' from tap_r), '1', 'première visite comptée');
select is((select r->>'points_balance' from tap_r), '100',
  'le premier tampon crédite 100 points au solde');
select is((select r->>'points_earned_total' from tap_r), '100',
  'et 100 points au cumul');
select is((select r->>'tier' from tap_r), 'bronze', 'niveau bronze à 100 points');
select is((select r->>'is_new_member' from tap_r), 'true',
  'le tampon qui crée le passeport le dit toujours');
select is((select r->'next_milestone'->>'visit_count' from tap_r), '2',
  'le prochain palier reste annoncé (repère de progression conservé)');


-- ══ 2. LE TEST DU LOT — LE SEUIL EST FRANCHI, RIEN N'EST ÉMIS ══
--
-- Sous l'ancien comportement, CE tampon précis émettait un code `FIDELITE-…`
-- et décomptait le stock du palier. Les quatre assertions ci-dessous sont les
-- seules qui rougiraient si l'émission automatique revenait — par une
-- réécriture de la fonction, ou par une migration qui reprendrait un corps
-- antérieur.
select pg_temp.tap_rewind(repeat('a', 64));
delete from tap_r;
insert into tap_r select pg_temp.tap_stamp(repeat('a', 64));

select is((select r->>'state' from tap_r), 'stamped',
  'le tampon qui franchit le seuil passe toujours');
select is((select r->>'visit_count' from tap_r), '2',
  'la visite qui franchit le palier est bien la deuxième');

select is(pg_temp.tap_rewards(repeat('a', 64)), 0::bigint,
  'FRANCHIR UN SEUIL NE CRÉE PLUS AUCUNE RÉCOMPENSE');
select is((select jsonb_array_length(r->'milestones_reached') from tap_r), 0,
  'milestones_reached reste VIDE : aucun palier n''est atteint par un tampon');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'fe000000-0000-4000-8000-000000000011'), 0,
  'le stock du palier n''est plus décompté par un tampon');
select is((select count(*) from public.loyalty_rewards
    where program_id = 'fe000000-0000-4000-8000-000000000002'), 0::bigint,
  'aucune récompense nulle part dans le programme');


-- ══ 3. LE RESTE DE LA FONCTION EST INTACT ═══════════════════
--
-- « Ne distribue plus rien » ne doit pas se confondre avec « ne fait plus
-- rien » : le même tampon a crédité, compté, fait monter le niveau et
-- journalisé.
select is((select r->>'points_balance' from tap_r), '200',
  'le tampon qui franchit le seuil crédite quand même ses 100 points');
select is((select r->>'points_earned_total' from tap_r), '200',
  'le cumul suit');
select is((select r->>'tier' from tap_r), 'silver',
  'le niveau monte à argent (200 points) — le recalcul n''est pas parti avec l''émission');
select is((select r->>'is_new_member' from tap_r), 'false',
  'is_new_member = false sur un passeport déjà connu');
select results_eq(
  $q$select visit_count, points_balance, points_earned_total, tier
       from public.loyalty_members where token_hash = repeat('a', 64)$q$,
  $q$values (2, 200, 200, 'silver')$q$,
  'le passeport porte les mêmes valeurs en base que dans la réponse');
select is((select count(*) from public.loyalty_stamps ls
    join public.loyalty_members m on m.id = ls.member_id
   where m.token_hash = repeat('a', 64)), 2::bigint,
  'les deux tampons sont journalisés (le trigger jackpot pend à cette insertion)');


-- ══ 4. LE JETON DE COMMANDE FONCTIONNE TOUJOURS ═════════════
--
-- Rien d'autre dans ce fichier ne garde cette fonctionnalité, et c'est
-- exactement celle qu'un corps repris d'une version de juillet aurait
-- effacée : `record_loyalty_stamp` a été DROP-ée puis recréée à cinq
-- paramètres par 20260915120000. Deux propriétés, indissociables : le jeton
-- tamponne, ET il contourne le cooldown (aucun `tap_rewind` ci-dessous, alors
-- que le tampon précédent vient d'avoir lieu).
insert into public.loyalty_order_codes (id, program_id, organization_id, token, label)
values ('fe000000-0000-4000-8000-000000000021',
        'fe000000-0000-4000-8000-000000000002',
        'fe000000-0000-4000-8000-000000000001', 'CMD-FID2B-0001', 'Commande 1');

delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  p_program_id => 'fe000000-0000-4000-8000-000000000002',
  p_member_token_hash => repeat('a', 64),
  p_order_token => 'CMD-FID2B-0001');

select is((select r->>'state' from tap_r), 'stamped',
  'le jeton de commande tamponne toujours (5ᵉ paramètre vivant)');
select is((select r->>'visit_count' from tap_r), '3',
  'et il contourne toujours le cooldown : la visite est comptée sans attendre');
select is((select r->>'points_earned_total' from tap_r), '300',
  'le tampon par commande crédite ses points comme les autres');
select is((select r->>'tier' from tap_r), 'gold',
  'le niveau passe à or (300 points)');
select is((select mode from public.loyalty_stamps ls
    join public.loyalty_members m on m.id = ls.member_id
   where m.token_hash = repeat('a', 64) and ls.mode = 'order_code'), 'order_code',
  'le tampon est journalisé avec le mode order_code');
select results_eq(
  $q$select consumed_at is not null, consumed_member_id is not null
       from public.loyalty_order_codes where token = 'CMD-FID2B-0001'$q$,
  $q$values (true, true)$q$,
  'le jeton est consommé et relié au passeport (verrou d''usage unique posé)');

-- Usage unique : le second passage rend le refus générique.
select is((public.record_loyalty_stamp(
    p_program_id => 'fe000000-0000-4000-8000-000000000002',
    p_member_token_hash => repeat('a', 64),
    p_order_token => 'CMD-FID2B-0001'))->>'state',
  'order_invalid', 'un jeton déjà servi ne retamponne rien');

-- Et le chemin commande ne distribue rien non plus.
select is(pg_temp.tap_rewards(repeat('a', 64)), 0::bigint,
  'un tampon de commande ne distribue AUCUNE récompense non plus');


-- ══ 5. L'ÉCHANGE EST LA SEULE VOIE — ET IL MARCHE ═══════════
--
-- Le passeport a 300 points gagnés en trois visites, dont pas un centime de
-- cadeau reçu. Il ACHÈTE le café à 200 points : c'est désormais le seul
-- moyen d'obtenir un code.
delete from tap_r;
insert into tap_r select public.spend_loyalty_points(
  'fe000000-0000-4000-8000-000000000002', repeat('a', 64),
  'fe000000-0000-4000-8000-000000000011',
  'fe000000-0000-4000-8000-0000000000a1');

select is((select r->>'state' from tap_r), 'spent',
  'l''échange fonctionne après le retrait de l''émission automatique');
select ok((select r->>'code' from tap_r) ~ '^FIDELITE-[A-HJ-NP-Z2-9]{8}$',
  'l''échange émet un code de retrait — c''est maintenant la SEULE origine d''un code');
select is((select r->>'spent_points' from tap_r), '200',
  'le prix payé est gravé sur la récompense');
select is((select r->>'points_balance' from tap_r), '100',
  'le solde est débité du prix');
select is((select r->>'points_earned_total' from tap_r), '300',
  'le cumul n''est PAS entamé : dépenser ne fait pas perdre son niveau');
select is((select r->>'tier' from tap_r), 'gold',
  'le client reste or après avoir dépensé');

select is(pg_temp.tap_rewards(repeat('a', 64)), 1::bigint,
  'une seule récompense au passeport, et c''est celle qu''il a ACHETÉE');
select results_eq(
  $q$select request_id is not null, spent_points
       from public.loyalty_rewards r
       join public.loyalty_members m on m.id = r.member_id
      where m.token_hash = repeat('a', 64)$q$,
  $q$values (true, 200)$q$,
  'la récompense porte une intention et un prix : elle est ACHETÉE, pas offerte');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'fe000000-0000-4000-8000-000000000011'), 1,
  'le stock du palier n''est plus décompté que par un achat');


-- ══ 6. LES CODES DÉJÀ EN CIRCULATION RESTENT VALABLES ═══════
--
-- Un client a son `FIDELITE-…` en poche, gagné AVANT ce lot au franchissement
-- d'un seuil. Il doit pouvoir le présenter : on arrête d'en émettre, on
-- n'annule pas ce qui a été promis.
--
-- La ligne est insérée à la main parce que la fonction qui l'écrivait n'existe
-- plus — c'est tout l'objet du lot. Sa FORME est celle qu'écrivait le tampon
-- d'avant : `request_id` null et `spent_points` null, soit une récompense
-- OFFERTE. Que le schéma l'accepte encore est la moitié de la démonstration.
select is((select pg_temp.tap_stamp(repeat('b', 64)))->>'state', 'stamped',
  'passeport B : une visite, aucun cadeau (rappel du nouveau comportement)');

insert into public.loyalty_rewards (
  member_id, program_id, organization_id, milestone_id,
  reward_type, code, earned_at
)
select m.id, 'fe000000-0000-4000-8000-000000000002',
       'fe000000-0000-4000-8000-000000000001',
       'fe000000-0000-4000-8000-000000000011',
       'lot', 'FIDELITE-ABCD2345', now() - interval '3 days'
  from public.loyalty_members m
 where m.token_hash = repeat('b', 64);

select results_eq(
  $q$select request_id is null, spent_points is null
       from public.loyalty_rewards where code = 'FIDELITE-ABCD2345'$q$,
  $q$values (true, true)$q$,
  'une récompense OFFERTE (sans intention ni prix) reste un état légal du schéma');

select is(
  (select redeemed_now from public.redeem_loyalty_reward(
    'fe000000-0000-4000-8000-000000000001',
    'fidelite-abcd2345', 'caisse@test.local')),
  true,
  'UN CODE ÉMIS AVANT CE LOT SE REMET TOUJOURS EN CAISSE (casse comprise)');
select is((select count(*) from public.loyalty_rewards
    where code = 'FIDELITE-ABCD2345'
      and redeemed_at is not null and redeemed_by = 'caisse@test.local'),
  1::bigint, 'horodatage et acteur posés atomiquement, comme avant');
select is((select count(*) from public.audit_logs
    where action = 'loyalty.redeem'
      and organization_id = 'fe000000-0000-4000-8000-000000000001'),
  1::bigint, 'la remise reste auditée');
select is(
  (select redeemed_now from public.redeem_loyalty_reward(
    'fe000000-0000-4000-8000-000000000001',
    'FIDELITE-ABCD2345', 'caisse@test.local')),
  false, 'et un code déjà remis reste refusé');


-- ══ 7. LE CORPS INSTALLÉ, LU DANS LE CATALOGUE ══════════════
--
-- Les sections précédentes éprouvent le COMPORTEMENT ; celle-ci éprouve la
-- FILIATION. Elle attrape ce qu'aucun parcours ne montrerait : une migration
-- ultérieure qui réécrirait `record_loyalty_stamp` à partir d'un corps
-- antérieur — le défaut exact qui a coûté une migration de réparation sur
-- `org_has_module_access` le 2026-08-23.

-- Ce qui doit avoir DISPARU.
select ok(
  (select pg_catalog.strpos(p.prosrc, 'FIDELITE-') = 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  'le corps de record_loyalty_stamp ne sait plus fabriquer de code de retrait');
select ok(
  (select pg_catalog.strpos(p.prosrc, 'loyalty_rewards') = 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  'le corps de record_loyalty_stamp ne touche plus du tout à la table des récompenses');

-- Ce qui doit être RESTÉ.
select ok(
  (select pg_catalog.strpos(p.prosrc, 'v_points_per_visit') > 0
      and pg_catalog.strpos(p.prosrc, 'points_earned_total') > 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  'le crédit des points de 20261114120000 est toujours dans le corps');
select ok(
  (select pg_catalog.strpos(p.prosrc, 'p_order_token') > 0
      and pg_catalog.strpos(p.prosrc, 'loyalty_order_codes') > 0
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  'le jeton de commande de 20260915120000 est toujours dans le corps');

-- L'arité n'a pas bougé : un `create or replace` sur une signature différente
-- laisserait DEUX surcharges, dont l'ancienne toujours appelable.
select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  1, 'record_loyalty_stamp n''a toujours qu''UNE surcharge');
select is(
  (select pg_catalog.pg_get_function_identity_arguments(p.oid)
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_loyalty_stamp'),
  'p_program_id uuid, p_member_token_hash text, p_rotating_code text, p_validated_by uuid, p_order_token text',
  'la signature 5-aire et ses noms de paramètres sont inchangés (appels nommés côté app)');

-- Les ACL non plus : `create or replace` les conserve, on le prouve.
select is(has_function_privilege('anon',
    'public.record_loyalty_stamp(uuid,text,text,uuid,text)', 'EXECUTE'),
  false, 'anon ne peut toujours pas tamponner');
select is(has_function_privilege('authenticated',
    'public.record_loyalty_stamp(uuid,text,text,uuid,text)', 'EXECUTE'),
  false, 'authenticated ne peut toujours pas tamponner');
select is(has_function_privilege('service_role',
    'public.record_loyalty_stamp(uuid,text,text,uuid,text)', 'EXECUTE'),
  true, 'seul le serveur tamponne');

-- LE TRIGGER TRANSITOIRE EST TOUJOURS LÀ, et ce n'est pas un oubli : il
-- attend le lot qui apprendra à l'éditeur de programme à écrire un prix.
-- Le retirer maintenant laisserait un palier créé sans prix — donc
-- inachetable — alors que l'échange vient de devenir la seule voie.
select has_trigger('public', 'loyalty_milestones', 'loyalty_milestones_derive_cost',
  'le trigger transitoire de dérivation du prix survit à ce lot (retrait au lot suivant)');

select finish();
rollback;
