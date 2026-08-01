-- ============================================================
-- 20260825120000 — crédit SMS : solde matérialisé et grand livre
--
-- Plan CHIFFRÉ, et non `no_plan()` : les sections qui comptent ici sont les
-- contrôles négatifs, qui vivent au milieu du fichier. Avec `no_plan()`, un
-- fichier qui meurt avant eux rend exactement le même résultat qu'un fichier
-- sain — « tout est vert ». Le plan chiffré rend « planned N but ran M », et
-- la différence entre saboté et sain redevient lisible.
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE SOLDE NE PEUT PAS DIVERGER DU GRAND LIVRE (sections 2 et 3). On le
--      prouve dans les DEUX sens, et c'est le point : l'égalité seule ne
--      prouverait rien — elle est vraie par accident tant que personne n'a
--      essayé de la casser. On prouve donc AUSSI que les quatre portes de la
--      divergence sont fermées : modifier le solde directement, le créer non
--      nul, réécrire une ligne du livre, en effacer une.
--   2. ON N'ENVOIE JAMAIS À CRÉDIT NUL (section 4), et le refus est PROPRE :
--      `null`, pas une exception — avec la preuve qu'aucune ligne de livre
--      n'est écrite au passage.
--   3. LE COÛT EST GELÉ (section 6). Un changement de tarif ne réécrit pas
--      l'historique de facturation ; un remboursement rend le coût de la ligne
--      qu'il annule, jamais le tarif du jour.
--   4. UN REMBOURSEMENT EST STRUCTURELLEMENT UNIQUE (section 7) — contrainte,
--      pas garde applicative : un prestataire qui rejoue son accusé d'échec
--      est un cas ordinaire.
--
-- ⚠️ CE QUE CE FICHIER NE PEUT PAS PROUVER : la concurrence réelle. pgTAP joue
-- tout dans UNE transaction, donc deux débits simultanés y sont impossibles à
-- mettre en scène. Ce qui est prouvé ici, c'est l'IMPOSSIBILITÉ du découvert
-- (le CHECK) ; le comportement de deux sessions concurrentes est mesuré à
-- part, par un harnais à deux connexions psql — voir le rapport de chantier.
-- Une assertion pgTAP qui prétendrait tester la concurrence mentirait.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug) values
  ('ee000000-0000-4000-8000-000000000001', 'Org Crédit',   'tap-smscredit-1'),
  ('ee000000-0000-4000-8000-000000000002', 'Org Crédit 2', 'tap-smscredit-2'),
  ('ee000000-0000-4000-8000-000000000003', 'Org Sans Crédit', 'tap-smscredit-3');

-- ══ 1. Créditer ═══════════════════════════════════════════
select isnt(
  (select entry_id from public.credit_sms_balance(
     'ee000000-0000-4000-8000-000000000001', 100, 'purchase', 45000, 'stripe:pi_001')),
  null, 'un achat de crédits s''enregistre');

select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  100, 'et le solde matérialisé vaut 100');

select is(
  (select unit_cost_micros from public.sms_credit_entries
    where organization_id = 'ee000000-0000-4000-8000-000000000001'
      and reason = 'purchase'),
  45000, 'le coût payé est gelé sur le mouvement (45 000 micros = 0,045 €)');

select is(
  (select currency from public.sms_credit_entries
    where organization_id = 'ee000000-0000-4000-8000-000000000001'
      and reason = 'purchase'),
  'EUR', 'avec sa devise');

-- ══ 2. Le solde ÉGALE la somme du grand livre ══════════════
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  (select sum(delta_units)::integer from public.sms_credit_entries
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  'solde = somme du grand livre, après un achat');

select isnt(
  (select public.debit_sms_credit(
     'ee000000-0000-4000-8000-000000000001', 1, 'sms:a:1')),
  null, 'un débit passe');
select isnt(
  (select entry_id from public.credit_sms_balance(
     'ee000000-0000-4000-8000-000000000001', 10, 'adjustment', null, 'geste commercial')),
  null, 'un ajustement passe');
select isnt(
  (select public.debit_sms_credit(
     'ee000000-0000-4000-8000-000000000001', 3, 'sms:a:2')),
  null, 'un débit multi-unités passe');

select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  106, 'le solde suit : 100 - 1 + 10 - 3 = 106');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  (select sum(delta_units)::integer from public.sms_credit_entries
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  'et il ÉGALE toujours la somme du grand livre, après quatre mouvements');

-- ══ 3. LES QUATRE PORTES DE LA DIVERGENCE SONT FERMÉES ═════
--
-- L'égalité de la section 2 est vraie tant que personne n'a essayé de la
-- casser. Ce sont ces quatre assertions qui la rendent GARANTIE plutôt que
-- constatée : sans elles, le test serait vert sur un schéma où n'importe quel
-- `update` ferait mentir le solde.

-- (a) Le geste banal : « je dépanne un commerçant ce soir ».
select throws_ok(
  $$ update public.sms_credits set balance_units = 500
      where organization_id = 'ee000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'PORTE 1 — le solde ne se modifie PAS directement, même en service_role');

-- (b) Créer de la monnaie à l'insertion.
select throws_ok(
  $$ insert into public.sms_credits (organization_id, balance_units)
     values ('ee000000-0000-4000-8000-000000000003', 1000) $$,
  'P0001', null,
  'PORTE 2 — un solde ne NAÎT pas non nul : ce serait mille SMS sans une ligne au journal');

-- (c) Réécrire l'histoire.
select throws_ok(
  $$ update public.sms_credit_entries set delta_units = 9999
      where organization_id = 'ee000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'PORTE 3 — une ligne du grand livre ne se modifie pas');

-- (d) L'effacer. Sans ce refus, le solde et sa somme divergeraient
-- SILENCIEUSEMENT — aucune contrainte ne s'en apercevrait.
select throws_ok(
  $$ delete from public.sms_credit_entries
      where organization_id = 'ee000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'PORTE 4 — une ligne du grand livre ne s''efface pas tant que l''organisation existe');

-- (e) EFFACER LA LIGNE DE SOLDE. C'est le miroir exact de la PORTE 4, et c'est
-- la porte que l'en-tête de la migration disait fermée alors qu'elle ne l'était
-- pas : le trigger du solde ne couvrait que `insert or update`, et
-- `service_role` avait le `delete`. `delete from sms_credits` puis un crédit de
-- 10 recréaient la ligne à zéro — le commerçant lisait 10 pendant que le grand
-- livre en comptait 1010. Le sens est CONTRE lui, et on ne pouvait pas
-- fabriquer du crédit ; mais un relecteur qui lit « aucun chemin » n'ira jamais
-- chercher celui-là.
select throws_ok(
  $$ delete from public.sms_credits
      where organization_id = 'ee000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'PORTE 5 — la ligne de SOLDE ne s''efface pas non plus : la recréer la ferait repartir à zéro devant un grand livre intact');
select ok(
  not has_table_privilege('service_role', 'public.sms_credits', 'DELETE'),
  'et le privilège DELETE lui est retiré : la garde est double, trigger et grant');

-- L'égalité tient toujours après les cinq tentatives : elles n'ont RIEN
-- laissé passer. Sans cette assertion, un refus partiel serait indétectable.
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  (select sum(delta_units)::integer from public.sms_credit_entries
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  'et après les cinq tentatives, solde = somme : aucune n''a entamé la donnée');

-- ══ 4. ON N'ENVOIE JAMAIS À CRÉDIT NUL ═════════════════════
select isnt(
  (select entry_id from public.credit_sms_balance(
     'ee000000-0000-4000-8000-000000000002', 1, 'purchase', 45000, 'stripe:pi_002')),
  null, 'le voisin achète UN crédit');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000002'),
  1, 'son solde vaut 1');

select isnt(
  (select public.debit_sms_credit(
     'ee000000-0000-4000-8000-000000000002', 1, 'sms:b:1')),
  null, 'il consomme son unique crédit');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000002'),
  0, 'son solde tombe à zéro');

-- Le refus est PROPRE : null, et non une exception. « Pas assez de crédit »
-- est un état ordinaire du système ; une exception obligerait l'appelant à
-- l'attraper, et il attraperait les vraies avec.
select is(
  (select public.debit_sms_credit(
     'ee000000-0000-4000-8000-000000000002', 1, 'sms:b:2')),
  null, 'LE POINT : à solde nul, le débit rend NULL — pas d''envoi, pas d''exception');

select is(
  (select count(*) from public.sms_credit_entries
    where organization_id = 'ee000000-0000-4000-8000-000000000002'),
  2::bigint,
  'et AUCUNE ligne de livre n''est écrite au passage : le refus ne laisse pas de trace de mouvement');

-- Un débit plus grand que le solde est refusé en bloc, jamais partiellement.
select isnt(
  (select entry_id from public.credit_sms_balance(
     'ee000000-0000-4000-8000-000000000002', 2, 'purchase', 45000, 'stripe:pi_003')),
  null, 'il rachète deux crédits');
select is(
  (select public.debit_sms_credit(
     'ee000000-0000-4000-8000-000000000002', 5, 'sms:b:3')),
  null, 'un débit de 5 sur un solde de 2 est refusé EN BLOC');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000002'),
  2, 'et le solde est intact — jamais de débit partiel');

-- Une organisation sans ligne de solde n'envoie pas, et le débit ne CRÉE pas
-- son compte : sinon un débit inventerait une organisation cliente.
select is(
  (select public.debit_sms_credit(
     'ee000000-0000-4000-8000-000000000003', 1, 'sms:c:1')),
  null, 'une organisation qui n''a jamais acheté n''envoie pas');
select is(
  (select count(*) from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000003'),
  0::bigint, 'et le débit refusé ne lui a PAS créé de compte');

-- Le CHECK, dernier rempart, indépendant de toute discipline d'appel : c'est
-- lui qui rend le découvert impossible et non seulement improbable.
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint con
     where con.conrelid = 'public.sms_credits'::regclass
       and con.contype = 'c'
       and pg_catalog.pg_get_constraintdef(con.oid) ilike '%balance_units%>=%0%'),
  'le CHECK `balance_units >= 0` existe — le découvert est IMPOSSIBLE, pas seulement improbable');

-- ══ 5. Le grand livre est cohérent par construction ════════
select throws_ok(
  $$ insert into public.sms_credit_entries
       (organization_id, delta_units, reason, unit_cost_micros, currency)
     values ('ee000000-0000-4000-8000-000000000001', 5, 'send', 45000, 'EUR') $$,
  '23514', null,
  'un « envoi » de signe POSITIF est refusé — le signe découle du motif');
select throws_ok(
  $$ insert into public.sms_credit_entries
       (organization_id, delta_units, reason, unit_cost_micros, currency)
     values ('ee000000-0000-4000-8000-000000000001', -5, 'purchase', 45000, 'EUR') $$,
  '23514', null,
  'un « achat » NÉGATIF est refusé');
select throws_ok(
  $$ insert into public.sms_credit_entries
       (organization_id, delta_units, reason, unit_cost_micros, currency)
     values ('ee000000-0000-4000-8000-000000000001', 0, 'adjustment', 45000, 'EUR') $$,
  '23514', null,
  'un mouvement NUL est refusé — ce serait du bruit dans une preuve de facturation');
select throws_ok(
  $$ insert into public.sms_credit_entries
       (organization_id, delta_units, reason, unit_cost_micros, currency)
     values ('ee000000-0000-4000-8000-000000000001', 5, 'refund', 45000, 'EUR') $$,
  '23514', null,
  'un remboursement SANS mouvement annulé est refusé — sinon il serait reproductible à volonté');

-- La même porte, côté RPC : `credit_sms_balance` ne sait pas rembourser.
select throws_ok(
  $$ select public.credit_sms_balance(
       'ee000000-0000-4000-8000-000000000001', 1, 'refund') $$,
  'P0001', null,
  'credit_sms_balance REFUSE le motif « refund » — il n''existe que par refund_sms_credit, seul soumis à l''unicité');
select throws_ok(
  $$ select public.credit_sms_balance(
       'ee000000-0000-4000-8000-000000000001', 0, 'purchase') $$,
  'P0001', null,
  'un achat de zéro unité est refusé');

-- ══ 6. LE COÛT EST GELÉ ════════════════════════════════════
--
-- Le tarif varie par pays et dans le temps. S'il était relu au moment du
-- remboursement, un commerçant serait remboursé plus ou moins que ce qu'il a
-- payé selon la date de la panne de l'opérateur.
select isnt(
  (select entry_id from public.credit_sms_balance(
     'ee000000-0000-4000-8000-000000000001', 5, 'purchase', 45000, 'stripe:pi_004')),
  null, 'un achat au tarif de 45 000 micros');

-- On fige l'identifiant du mouvement d'envoi à rembourser plus bas.
create temporary table tap_credit_ref on commit drop as
  select public.debit_sms_credit(
    'ee000000-0000-4000-8000-000000000001', 1, 'sms:gel:1', 'FR') as entry_id;

select is(
  (select e.unit_cost_micros from public.sms_credit_entries e
    join tap_credit_ref t on t.entry_id = e.id),
  45000, 'l''envoi est facturé au tarif du jour : 45 000');
select is(
  (select e.destination_country from public.sms_credit_entries e
    join tap_credit_ref t on t.entry_id = e.id),
  'FR', 'et la destination qui a déterminé ce tarif est conservée');

-- LE TARIF CHANGE.
select is(
  (select public.set_sms_unit_cost('ee000000-0000-4000-8000-000000000001', 60000)),
  true, 'le tarif passe à 60 000 micros');

select is(
  (select e.unit_cost_micros from public.sms_credit_entries e
    join tap_credit_ref t on t.entry_id = e.id),
  45000,
  'LE POINT : le mouvement DÉJÀ écrit garde 45 000 — le changement de tarif ne réécrit pas la facturation passée');

select isnt(
  (select public.debit_sms_credit(
     'ee000000-0000-4000-8000-000000000001', 1, 'sms:gel:2')),
  null, 'un nouvel envoi passe');
select is(
  (select e.unit_cost_micros from public.sms_credit_entries e
    where e.reference = 'sms:gel:2'),
  60000, 'et lui est facturé au NOUVEAU tarif : 60 000');

-- ══ 6bis. LE COÛT NE VIENT PAS DE L'APPELANT ═══════════════
--
-- Le montant gelé au grand livre sert de PREUVE DE FACTURATION. La version
-- d'origine acceptait un `p_unit_cost_micros` de l'appelant et l'écrivait tel
-- quel : les unités valant toujours 1, le solde restait juste, mais le montant
-- était pilotable depuis l'extérieur. Aucun tarif par destination n'existe —
-- `destination_country` CONSERVE la destination, il ne la TARIFE pas — donc le
-- paramètre n'avait aucun emploi légitime. Il est retiré plutôt qu'ignoré : un
-- paramètre ignoré est un piège pour le prochain appelant.
select is(
  (select count(*) from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'debit_sms_credit'),
  1::bigint,
  'il n''existe qu''UNE surcharge de debit_sms_credit — pas de variante oubliée qui prendrait encore un coût');
select throws_ok(
  $$ select public.debit_sms_credit(
       'ee000000-0000-4000-8000-000000000001'::uuid, 1, 'sms:forge:1', 'FR', 1) $$,
  '42883', null,
  'LE POINT : on ne PEUT PLUS transmettre un coût — la signature ne l''accepte pas, le tarif se lit sur sms_credits');
select is(
  (select e.unit_cost_micros from public.sms_credit_entries e
    where e.reference = 'sms:gel:2'),
  (select c.unit_cost_micros from public.sms_credits c
    where c.organization_id = 'ee000000-0000-4000-8000-000000000001'),
  'et le coût écrit est EXACTEMENT le tarif de l''organisation, lu en base sous le verrou');

-- ══ 7. Le remboursement rend le coût GELÉ, une seule fois ══
select isnt(
  (select public.refund_sms_credit((select entry_id from tap_credit_ref), 'sms:gel:1')),
  null, 'l''envoi à 45 000 est remboursé');

select is(
  (select r.unit_cost_micros from public.sms_credit_entries r
    where r.reverses_entry_id = (select entry_id from tap_credit_ref)),
  45000,
  'LE POINT : le remboursement rend 45 000 — le coût de la ligne annulée, PAS le tarif courant de 60 000');
select is(
  (select r.delta_units from public.sms_credit_entries r
    where r.reverses_entry_id = (select entry_id from tap_credit_ref)),
  1, 'et il rend exactement l''unité consommée');

-- Un accusé d'échec rejoué par le prestataire est un cas ORDINAIRE : il doit
-- rendre « rien à faire », pas créditer une seconde fois.
select is(
  (select public.refund_sms_credit((select entry_id from tap_credit_ref), 'sms:gel:1')),
  null, 'un SECOND remboursement du même mouvement rend null — pas de double crédit');
select is(
  (select count(*) from public.sms_credit_entries
    where reverses_entry_id = (select entry_id from tap_credit_ref)),
  1::bigint, 'et il n''existe qu''UNE ligne de remboursement');

-- L'unicité est une CONTRAINTE, pas une garde applicative : une écriture
-- directe ne la contourne pas.
select throws_ok(
  format(
    $$ insert into public.sms_credit_entries
         (organization_id, delta_units, reason, unit_cost_micros, currency, reverses_entry_id)
       values ('ee000000-0000-4000-8000-000000000001', 1, 'refund', 45000, 'EUR', %L) $$,
    (select entry_id from tap_credit_ref)),
  '23505', null,
  'et une écriture DIRECTE d''un second remboursement se heurte à l''index unique');

-- On ne rembourse que des envois.
select is(
  (select public.refund_sms_credit(
     (select id from public.sms_credit_entries
       where reference = 'stripe:pi_001'), null)),
  null, 'on ne « rembourse » pas un ACHAT — seul un envoi se rembourse');
select is(
  (select public.refund_sms_credit(gen_random_uuid(), null)),
  null, 'ni un mouvement inconnu');

-- L'invariant, une dernière fois, après toute la séquence.
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  (select sum(delta_units)::integer from public.sms_credit_entries
    where organization_id = 'ee000000-0000-4000-8000-000000000001'),
  'INVARIANT FINAL — solde = somme du grand livre, après achats, débits, ajustement, changement de tarif et remboursement');

-- ══ 8. Isolation multi-tenant ══════════════════════════════
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ee000000-0000-4000-8000-000000000002'),
  (select sum(delta_units)::integer from public.sms_credit_entries
    where organization_id = 'ee000000-0000-4000-8000-000000000002'),
  'le solde du voisin égale SON grand livre — les mouvements ne fuient pas d''une organisation à l''autre');

-- ══ 9. ACL ═════════════════════════════════════════════════
select ok(
  has_function_privilege('service_role', 'public.debit_sms_credit(uuid,integer,text,text)', 'EXECUTE'),
  'le serveur peut débiter');
select ok(
  not has_function_privilege('anon', 'public.credit_sms_balance(uuid,integer,text,integer,text,text)', 'EXECUTE'),
  'anon ne se crédite pas de SMS');
select ok(
  not has_function_privilege('authenticated', 'public.credit_sms_balance(uuid,integer,text,integer,text,text)', 'EXECUTE'),
  'un commerçant connecté ne se crédite pas lui-même');
select ok(
  not has_function_privilege('authenticated', 'public.refund_sms_credit(uuid,text)', 'EXECUTE'),
  'ni ne se rembourse lui-même');
select ok(
  not has_table_privilege('anon', 'public.sms_credits', 'SELECT'),
  'anon ne lit pas les soldes');
select ok(
  not has_table_privilege('authenticated', 'public.sms_credits', 'UPDATE'),
  'et un commerçant connecté n''a AUCUN droit d''écriture sur son propre solde');
select ok(
  not has_table_privilege('service_role', 'public.sms_credit_entries', 'DELETE'),
  'même service_role n''a pas le privilège d''effacer une ligne du grand livre');

select * from finish();
rollback;
