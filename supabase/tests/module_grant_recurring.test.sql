-- ============================================================
-- P0 lot 5 — UN SEUL RÉCURRENT VIVANT, ET LA RÉSILIATION QUI REFERME
--
-- Ce que ce fichier doit prouver, dans l'ordre du coût de l'erreur :
--
--   1. QUE DEUX ACHATS DU MÊME MENSUEL NE COEXISTENT PAS. C'est l'assertion la
--      plus chère : deux octrois vivants, c'est un commerçant prélevé deux fois
--      pour le même droit — et, à la résiliation de l'un des deux abonnements,
--      plus rien ne dit lequel refermer, `source_reference` portant un
--      identifiant de SESSION et jamais d'abonnement. L'erreur va contre le
--      client, mais elle est irrattrapable : personne ne sait quel octroi est
--      lequel.
--   2. QUE LE REFUS RENDE UN VERDICT ET NE LÈVE PAS. L'appelant est un webhook.
--      Une exception y devient un 500, donc un rejeu Stripe pendant trois
--      jours, puis la désactivation du point d'entrée — ce qui couperait aussi
--      la synchronisation des abonnements principaux. Or aucun rejeu ne
--      réparera un conflit définitif.
--   3. QUE LE RACHAT APRÈS RÉSILIATION RESTE POSSIBLE. C'est la moitié fragile
--      de la règle produit : ce qui est interdit est le CUMUL, jamais le
--      retour. Un index total aurait interdit à vie ce qu'on voulait seulement
--      empêcher de doubler, et le défaut ne se serait vu qu'au premier client
--      revenant après une pause.
--   4. QUE LA RÉVOCATION REFERME VRAIMENT LE MODULE. Les termes d'un mensuel
--      posent délibérément `ends_at: null` et la pause du lot 2 est DÉRIVÉE
--      d'une échéance : sans révocation, un add-on résilié resterait ouvert
--      pour toujours. C'est le seul mécanisme qui le referme.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Instant de référence unique, jamais now() : sinon le fichier devient
-- intermittent selon la durée de sa propre exécution.
create temporary table t0 (v timestamptz);
insert into t0 values (timestamptz '2026-06-15 12:00:00+00');

create temporary table ids (nom text primary key, id uuid);
insert into ids values
  ('abonnee', '79990000-0000-4000-8000-000000000001'),
  ('voisine', '79990000-0000-4000-8000-000000000002');

insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
select i.id, 'Rec ' || i.nom, 'rec-' || i.nom, 'canceled',
       (select v from t0) + interval '30 days'
from ids i;

-- ────────────────────────────────────────────────────────────
-- 0. L'INDEX EST BIEN CE QU'IL PRÉTEND ÊTRE — lu au catalogue
--
-- Vérifié ici et pas seulement par ses effets : un index recréé un jour en
-- version TOTALE passerait toutes les assertions de cumul du fichier tout en
-- interdisant le rachat après résiliation, qui n'échoue que sur un scénario
-- précis. Le catalogue dit la forme ; les sections suivantes disent l'effet.
-- ────────────────────────────────────────────────────────────
select is(
  (select i.indisunique
     from pg_catalog.pg_class c
     join pg_catalog.pg_index i on i.indexrelid = c.oid
    where c.relname = 'organization_module_grants_recurrent_vivant_idx'),
  true,
  'organization_module_grants_recurrent_vivant_idx est UNIQUE'
);

select isnt(
  (select pg_catalog.pg_get_expr(i.indpred, i.indrelid)
     from pg_catalog.pg_class c
     join pg_catalog.pg_index i on i.indexrelid = c.oid
    where c.relname = 'organization_module_grants_recurrent_vivant_idx'),
  null,
  'et il est PARTIEL — un index total interdirait le rachat après résiliation'
);

-- La revendication de rôle est posée à la main, comme le fait PostgREST :
-- c'est la seule façon d'atteindre le corps de `grant_module_from_payment`.
set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ────────────────────────────────────────────────────────────
-- 1. Le premier achat d'un mensuel ouvre le module
-- ────────────────────────────────────────────────────────────
select is(
  (select outcome from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'loyalty', 'recurring', 'cs_rec_premier',
     (select v from t0), null, null, null, null)),
  'created',
  'le premier achat du Passeport des habitués crée l''octroi'
);

select is(
  public.org_has_live_module_grant(
    (select id from ids where nom = 'abonnee'), 'loyalty', (select v from t0)),
  true,
  'et le module est ouvert immédiatement — un mensuel n''attend aucun démarrage'
);

-- ────────────────────────────────────────────────────────────
-- 2. LE REJEU N'EST PAS LE CUMUL, et les deux se distinguent
--
-- Même paiement rejoué : `replayed`. Autre paiement : `refused`. Le webhook
-- s'appuie sur cette distinction pour crier sur le second et se taire sur le
-- premier — les confondre écrirait « déjà octroyé » sur un double débit.
--
-- Depuis 20260913120000, la distinction est portée par un MOT et non par la
-- nullité de `grant_id`. Ce fichier l'éprouve donc sur `outcome` : c'est la
-- forme que le webhook lit réellement, et c'est la seule qui survive à la
-- traversée du générateur de types (Postgres ne transporte pas la nullabilité
-- des colonnes d'un `returns table`).
-- ────────────────────────────────────────────────────────────
select is(
  (select outcome from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'loyalty', 'recurring', 'cs_rec_premier',
     (select v from t0), null, null, null, null)),
  'replayed',
  'le rejeu du MÊME paiement rend outcome = replayed'
);

select isnt(
  (select grant_id from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'loyalty', 'recurring', 'cs_rec_premier',
     (select v from t0), null, null, null, null)),
  null,
  'et il rend l''octroi EXISTANT — c''est un rejeu, pas un refus'
);

select is(
  (select outcome from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'loyalty', 'recurring', 'cs_rec_second',
     (select v from t0) + interval '1 hour', null, null, null, null)),
  'refused',
  'un SECOND paiement du même mensuel est REFUSÉ (outcome = refused)'
);

-- L'ASSERTION QUI PORTE TOUT LE LOT : les deux issues non créatrices ne se
-- confondent pas. C'est elle qui sépare « rien à faire » de « remboursement
-- dû ». L'ancien encodage les distinguait par une nullité que les types générés
-- effaçaient ; un lecteur qui supprimait le cast correctif fondait les deux cas
-- en un seul, et aucun test ne rougissait.
select isnt(
  (select outcome from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'loyalty', 'recurring', 'cs_rec_second',
     (select v from t0) + interval '1 hour', null, null, null, null)),
  'replayed',
  'et un refus de cumul ne se dit PAS comme un rejeu — un double débit n''est pas bénin'
);

-- Le refus reste sans octroi à nommer : `outcome` porte la distinction, mais
-- rendre ici l'octroi concurrent ferait ressembler un double débit à un succès.
select is(
  (select grant_id from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'loyalty', 'recurring', 'cs_rec_second',
     (select v from t0) + interval '1 hour', null, null, null, null)),
  null,
  'et il ne nomme aucun octroi : il n''y en a pas eu'
);

select is(
  (select count(*)::int from public.organization_module_grants
    where organization_id = (select id from ids where nom = 'abonnee')
      and module = 'loyalty'),
  1,
  'et le refus n''a écrit aucune seconde ligne'
);

-- Le refus ne LÈVE pas : c'est ce qui permet au webhook de répondre 200 et de
-- ne pas se faire retenter trois jours sur un état que rien ne réparera.
select lives_ok(
  format(
    'select public.grant_module_from_payment(%L::uuid, %L, %L, %L, %L::timestamptz)',
    (select id from ids where nom = 'abonnee'),
    'loyalty', 'recurring', 'cs_rec_troisieme',
    (select v from t0) + interval '2 hours'
  ),
  'le refus de cumul rend un VERDICT et ne lève pas'
);

-- ────────────────────────────────────────────────────────────
-- 3. LE CLOISONNEMENT — le blocage est par organisation et par module
--
-- Un index posé sur le seul module aurait empêché une organisation d'acheter ce
-- qu'une AUTRE a déjà. Le défaut serait passé inaperçu tant qu'un seul
-- commerçant achetait.
-- ────────────────────────────────────────────────────────────
select is(
  (select outcome from public.grant_module_from_payment(
     (select id from ids where nom = 'voisine'),
     'loyalty', 'recurring', 'cs_rec_voisine',
     (select v from t0), null, null, null, null)),
  'created',
  'une AUTRE organisation achète le même mensuel sans être bloquée'
);

select is(
  (select outcome from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'referral', 'recurring', 'cs_rec_referral',
     (select v from t0), null, null, null, null)),
  'created',
  'et le même commerçant achète un AUTRE mensuel sans être bloqué'
);

-- ────────────────────────────────────────────────────────────
-- 4. LES SIX ACHATS UNIQUES NE SONT PAS CONCERNÉS
--
-- Racheter une Chasse au trésor après la fin de la précédente est le geste
-- normal — c'est même le motif pour lequel aucune garde « déjà acheté » ne les
-- vise. Étendre l'unicité aux `pass` les rendrait invendables après le premier
-- achat, et l'erreur se serait vue en caisse, pas en test.
-- ────────────────────────────────────────────────────────────
select is(
  (select outcome from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'hunts', 'pass', 'cs_pass_1', null, null,
     (select v from t0) + interval '90 days', null, null)),
  'created',
  'un premier pass de Chasse au trésor est créé'
);

select is(
  (select outcome from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'hunts', 'pass', 'cs_pass_2', null, null,
     (select v from t0) + interval '90 days', null, null)),
  'created',
  'et un SECOND pass du même module aussi — l''unicité ne vise que le récurrent'
);

-- ────────────────────────────────────────────────────────────
-- 5. LA RÉVOCATION, telle que le webhook l'écrit
--
-- Un `update` direct et non une RPC : le trigger `freeze_module_grant_terms` ne
-- s'oppose qu'à `capacity` et `starts_at`, et c'est déjà le geste du
-- back-office. Le filtre reproduit ici est celui de la route, `source` compris.
-- ────────────────────────────────────────────────────────────
select lives_ok(
  format(
    $q$update public.organization_module_grants
          set revoked_at = %L::timestamptz,
              revoked_reason = 'stripe: abonnement sub_test résilié'
        where organization_id = %L::uuid
          and module = 'loyalty'
          and kind = 'recurring'
          and source = 'stripe'
          and revoked_at is null
          and ends_at is null$q$,
    (select v from t0) + interval '40 days',
    (select id from ids where nom = 'abonnee')
  ),
  'le gel des termes ne s''oppose pas à l''écriture de revoked_at'
);

select is(
  public.org_has_live_module_grant(
    (select id from ids where nom = 'abonnee'), 'loyalty',
    (select v from t0) + interval '41 days'),
  false,
  'la résiliation REFERME le module — sans elle, ends_at null le laisserait ouvert à jamais'
);

select is(
  (select state from public.org_module_grant_state(
     (select id from ids where nom = 'abonnee'), 'loyalty',
     (select v from t0) + interval '41 days')),
  'revoked',
  'et l''écran peut dire POURQUOI, plutôt qu''afficher une absence'
);

-- Le rejeu de la même révocation ne touche plus rien : l'idempotence est dans
-- le filtre `revoked_at is null`, pas dans une prise d'événement.
update public.organization_module_grants
   set revoked_at = (select v from t0) + interval '99 days'
 where organization_id = (select id from ids where nom = 'abonnee')
   and module = 'loyalty'
   and kind = 'recurring'
   and source = 'stripe'
   and revoked_at is null
   and ends_at is null;

select is(
  (select revoked_at from public.organization_module_grants
    where organization_id = (select id from ids where nom = 'abonnee')
      and module = 'loyalty'),
  (select v from t0) + interval '40 days',
  'un second passage ne redate pas la révocation'
);

-- ────────────────────────────────────────────────────────────
-- 6. LE RACHAT APRÈS RÉSILIATION — la moitié fragile de la règle
--
-- « Un commerçant qui résilie en janvier et reprend en mars doit pouvoir le
-- faire. » L'octroi révoqué sort du prédicat partiel, donc il ne compte plus.
-- ────────────────────────────────────────────────────────────
select is(
  (select outcome from public.grant_module_from_payment(
     (select id from ids where nom = 'abonnee'),
     'loyalty', 'recurring', 'cs_rec_retour',
     (select v from t0) + interval '100 days', null, null, null, null)),
  'created',
  'après résiliation, le même mensuel se rachète'
);

select is(
  public.org_has_live_module_grant(
    (select id from ids where nom = 'abonnee'), 'loyalty',
    (select v from t0) + interval '101 days'),
  true,
  'et le module se rouvre'
);

select is(
  (select count(*)::int from public.organization_module_grants
    where organization_id = (select id from ids where nom = 'abonnee')
      and module = 'loyalty'
      and revoked_at is null),
  1,
  'un seul octroi non révoqué à la fois, quel que soit l''historique'
);

-- ────────────────────────────────────────────────────────────
-- 7. L'INSERT DIRECT EST REFUSÉ AUSSI — la garde n'est pas dans la RPC
--
-- La distinction compte : une garde portée par la fonction se contournerait par
-- toute autre écriture (back-office, correctif manuel en base). Celle-ci est
-- portée par l'index, donc par la table.
-- ────────────────────────────────────────────────────────────
select throws_ok(
  format(
    $q$insert into public.organization_module_grants
         (organization_id, module, kind, source, source_reference, starts_at)
       values (%L::uuid, 'loyalty', 'recurring', 'backoffice', 'offert', %L::timestamptz)$q$,
    (select id from ids where nom = 'abonnee'),
    (select v from t0) + interval '102 days'
  ),
  '23505',
  null,
  'un octroi de BACK-OFFICE ne peut pas doubler un récurrent déjà vivant'
);

select * from finish();
rollback;
