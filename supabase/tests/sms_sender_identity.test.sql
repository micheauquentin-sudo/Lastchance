-- ============================================================
-- 20260824120000 — l'expéditeur SMS et sa déclaration AF2M
--
-- ── POURQUOI `plan(N)` ET NON `no_plan()` ──
--
-- Le reste du dossier utilise `no_plan()`. Ici le plan est CHIFFRÉ, parce que
-- ce fichier a des sections qui comptent plus que d'autres et qu'un fichier
-- qui MEURT avant d'y arriver rend, avec `no_plan()`, le même résultat qu'un
-- fichier sain : « tout est vert ». Avec un plan chiffré, mourir en route
-- donne « planned 47 but ran 12 » — la différence entre saboté et sain
-- redevient visible.
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE RENOMMAGE FAIT RETOMBER LA DÉCLARATION (section 4). C'est la garde
--      centrale : sans elle, un commerçant qui change d'enseigne enverrait
--      sous un nom que le registre AF2M ne connaît pas, avec un état qui
--      affirme le contraire. Contrôle négatif joué : on vérifie qu'AVANT le
--      renommage l'expéditeur était bien utilisable, sinon l'assertion
--      « plus utilisable » serait vraie pour la mauvaise raison.
--   2. UN EXPÉDITEUR NON DÉCLARÉ N'EST JAMAIS UTILISABLE (sections 2, 5, 6) :
--      pending, rejected, suspended et retired rendent tous null.
--   3. ON NE SE DÉCLARE PAS SOI-MÊME (section 3) : `declare_sms_sender` exige
--      une référence de registre, et `set_sms_sender_status` ne sait pas
--      écrire `declared`.
--   4. Le format ≤ 11 / [A-Z0-9] est refusé EN BASE (section 1).
--   5. Un seul expéditeur utilisable à la fois, mais un `pending` peut
--      cohabiter avec lui (section 7) — sinon un changement d'enseigne
--      couperait les SMS pendant le délai AF2M.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug) values
  ('ed000000-0000-4000-8000-000000000001', 'Org Expéditeur',  'tap-smssender-1'),
  ('ed000000-0000-4000-8000-000000000002', 'Org Voisine SMS', 'tap-smssender-2');

-- ══ 1. Le format est refusé EN BASE, pas seulement en Zod ═══
-- Le prestataire refuserait l'envoi : à ce moment-là le SMS est perdu ET
-- facturé. Le refus doit tomber à la saisie.
select throws_ok(
  $$ select public.request_sms_sender(
       'ed000000-0000-4000-8000-000000000001', 'BOULANGERIEDUCOIN') $$,
  'P0001', null,
  'plus de 11 caractères : refusé (la limite AF2M est une contrainte, pas un conseil)');

select throws_ok(
  $$ select public.request_sms_sender(
       'ed000000-0000-4000-8000-000000000001', 'CAFÉ') $$,
  'P0001', null,
  'un accent est refusé — et NON silencieusement retiré : « CAFEDUCOIN » serait un nom que le commerçant n''a pas choisi et découvrirait chez ses clients');

select throws_ok(
  $$ select public.request_sms_sender(
       'ed000000-0000-4000-8000-000000000001', 'LE CAFE') $$,
  'P0001', null,
  'un espace est refusé');

select throws_ok(
  $$ select public.request_sms_sender(
       'ed000000-0000-4000-8000-000000000001', '') $$,
  'P0001', null,
  'un expéditeur vide est refusé');

-- La mise en majuscules, elle, est une normalisation de saisie légitime :
-- « MaBoulangerie » et « MABOULANGERIE » sont le même nom commercial.
select isnt(
  (select public.request_sms_sender(
     'ed000000-0000-4000-8000-000000000001', '  maboulang  ')),
  null, 'la casse et les bordures sont normalisées');
select is(
  (select sender_id from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  'MABOULANG', 'et le nom est stocké en majuscules');

-- La contrainte tient aussi contre une écriture DIRECTE, pas seulement contre
-- la RPC : sans cela, tout chemin futur contournerait la règle.
select throws_ok(
  $$ insert into public.sms_senders (organization_id, sender_id)
     values ('ed000000-0000-4000-8000-000000000001', 'trop-long-et-minuscule') $$,
  '23514', null,
  'le CHECK refuse une écriture directe hors format — la règle ne dépend pas de la RPC');

-- ══ 2. Un expéditeur neuf N'EST PAS utilisable ══════════════
select is(
  (select status from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  'pending', 'un expéditeur naît « pending »');
select is(
  (select declared_at from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  null, 'et sans date de déclaration');

select is(
  (select public.sms_sender_for_send('ed000000-0000-4000-8000-000000000001')),
  null,
  'LE POINT : tant qu''il n''est pas déclaré au registre AF2M, aucun envoi ne peut partir sous ce nom');

-- ══ 3. On ne se déclare pas soi-même ═══════════════════════
select throws_ok(
  $$ select public.declare_sms_sender(
       'ed000000-0000-4000-8000-000000000001', 'MABOULANG', null) $$,
  'P0001', null,
  'une déclaration SANS référence de registre est une affirmation sans preuve : refusée');
select throws_ok(
  $$ select public.declare_sms_sender(
       'ed000000-0000-4000-8000-000000000001', 'MABOULANG', '   ') $$,
  'P0001', null,
  'une référence vide de sens est refusée aussi');

-- L'autre porte ne sait pas écrire « declared ». Sans ce refus, la séparation
-- demande/déclaration ne servirait à rien : il suffirait de passer par ici.
select throws_ok(
  $$ select public.set_sms_sender_status(
       'ed000000-0000-4000-8000-000000000001', 'MABOULANG', 'declared') $$,
  'P0001', null,
  'set_sms_sender_status ne sait PAS déclarer — sinon la référence de registre serait contournable');

select is(
  (select public.declare_sms_sender(
     'ed000000-0000-4000-8000-000000000001', 'MABOULANG', 'AF2M-2026-00042')),
  true, 'avec sa référence, la déclaration s''enregistre');
select is(
  (select status from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  'declared', 'l''état passe à « declared »');
select ok(
  (select declared_at is not null from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  'et il est daté — l''équivalence état/preuve est en contrainte');

-- ══ 4. LE RENOMMAGE FAIT RETOMBER LA DÉCLARATION ═══════════
--
-- CONTRÔLE NÉGATIF D'ABORD : on établit que l'expéditeur est bien utilisable
-- AVANT le renommage. Sans cette assertion, le « plus utilisable » d'après
-- serait vrai même si la fonction rendait null depuis le début, et le test
-- passerait sans rien garder.
select is(
  (select public.sms_sender_for_send('ed000000-0000-4000-8000-000000000001')),
  'MABOULANG',
  'CONTRÔLE NÉGATIF — déclaré, l''expéditeur est bien utilisable AVANT le renommage');

update public.sms_senders set sender_id = 'MABOULANG2'
 where organization_id = 'ed000000-0000-4000-8000-000000000001';

select is(
  (select status from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  'pending',
  'LE POINT CENTRAL : renommer un expéditeur fait retomber sa déclaration');
select is(
  (select declared_at from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  null, 'la date de déclaration part avec elle');
select is(
  (select af2m_reference from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  null, 'la référence de registre aussi — elle ne prouve plus rien');
select is(
  (select public.sms_sender_for_send('ed000000-0000-4000-8000-000000000001')),
  null,
  'et plus aucun envoi ne peut partir : sans cette garde, le SMS partait sous un nom jamais déclaré');

-- Une déclaration ne s'antidate pas — même règle et même motif que
-- `sms_consents_revocation_is_final` sur `consented_at`.
select is(
  (select public.declare_sms_sender(
     'ed000000-0000-4000-8000-000000000001', 'MABOULANG2', 'AF2M-2026-00043')),
  true, 'le nouveau nom se redéclare');
select throws_ok(
  $$ update public.sms_senders set declared_at = now() - interval '90 days'
      where organization_id = 'ed000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'une déclaration ne s''antidate pas — ce serait couvrir des envois déjà partis sous un nom non déclaré');

-- ══ 5. Refus et suspension coupent l'envoi ═════════════════
select is(
  (select public.set_sms_sender_status(
     'ed000000-0000-4000-8000-000000000001', 'MABOULANG2', 'suspended', 'plainte AF2M')),
  true, 'une suspension s''enregistre');
select is(
  (select public.sms_sender_for_send('ed000000-0000-4000-8000-000000000001')),
  null, 'un expéditeur SUSPENDU n''envoie plus');
select is(
  (select declared_at from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  null, 'et sa déclaration est retirée avec la suspension');

select is(
  (select public.set_sms_sender_status(
     'ed000000-0000-4000-8000-000000000001', 'MABOULANG2', 'rejected', 'nom non conforme')),
  true, 'un refus de registre s''enregistre');
select is(
  (select public.sms_sender_for_send('ed000000-0000-4000-8000-000000000001')),
  null, 'un expéditeur REFUSÉ n''envoie pas');

-- ══ 6. Le retrait conserve la trace ════════════════════════
select is(
  (select public.declare_sms_sender(
     'ed000000-0000-4000-8000-000000000001', 'MABOULANG2', 'AF2M-2026-00044')),
  true, 'on le redéclare pour éprouver le retrait');
select is(
  (select public.set_sms_sender_status(
     'ed000000-0000-4000-8000-000000000001', 'MABOULANG2', 'retired', 'fermeture')),
  true, 'le retrait s''enregistre');
select is(
  (select public.sms_sender_for_send('ed000000-0000-4000-8000-000000000001')),
  null, 'un expéditeur RETIRÉ n''envoie plus');
select is(
  (select count(*) from public.sms_senders
    where organization_id = 'ed000000-0000-4000-8000-000000000001'),
  1::bigint,
  'mais la LIGNE demeure : la trace de ce qui a été déclaré est ce qui permet de répondre à une réclamation sur un SMS déjà parti');

-- ══ 7. Un seul utilisable, mais la transition reste possible ══
select isnt(
  (select public.request_sms_sender(
     'ed000000-0000-4000-8000-000000000002', 'VOISIN')),
  null, 'le voisin demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'ed000000-0000-4000-8000-000000000002', 'VOISIN', 'AF2M-2026-00050')),
  true, 'et l''obtient');

-- La fenêtre de transition d'enseigne : un `pending` COHABITE avec le
-- `declared` en service. Sans cela, changer de nom couperait les SMS pendant
-- tout le délai de déclaration.
select isnt(
  (select public.request_sms_sender(
     'ed000000-0000-4000-8000-000000000002', 'VOISIN2')),
  null,
  'un SECOND expéditeur peut être demandé pendant que le premier sert — c''est la fenêtre de changement d''enseigne');
select is(
  (select public.sms_sender_for_send('ed000000-0000-4000-8000-000000000002')),
  'VOISIN', 'et c''est toujours le déclaré qui sert');

-- Deux DÉCLARÉS simultanés, en revanche : impossible.
select throws_ok(
  $$ update public.sms_senders
        set status = 'declared', declared_at = clock_timestamp()
      where organization_id = 'ed000000-0000-4000-8000-000000000002'
        and sender_id = 'VOISIN2' $$,
  '23505', null,
  'mais DEUX expéditeurs déclarés à la fois sont refusés — sinon « sous quel nom part ce SMS ? » n''aurait pas de réponse');

-- ══ 8. Isolation multi-tenant ══════════════════════════════
select is(
  (select public.declare_sms_sender(
     'ed000000-0000-4000-8000-000000000001', 'VOISIN', 'AF2M-VOL')),
  false,
  'on ne déclare pas chez soi l''expéditeur d''une AUTRE organisation');
select is(
  (select public.sms_sender_for_send('ed000000-0000-4000-8000-000000000001')),
  null, 'et l''organisation qui n''a rien de déclaré reste sans expéditeur');

-- ══ 9. ACL ═════════════════════════════════════════════════
select ok(
  has_function_privilege('service_role', 'public.sms_sender_for_send(uuid)', 'EXECUTE'),
  'le serveur lit l''expéditeur utilisable');
select ok(
  not has_function_privilege('anon', 'public.declare_sms_sender(uuid,text,text)', 'EXECUTE'),
  'anon ne déclare pas d''expéditeur');
select ok(
  not has_function_privilege('authenticated', 'public.declare_sms_sender(uuid,text,text)', 'EXECUTE'),
  'un commerçant connecté ne déclare pas son propre expéditeur au registre');
select ok(
  not has_table_privilege('anon', 'public.sms_senders', 'SELECT'),
  'anon ne lit pas la table des expéditeurs');

select * from finish();
rollback;
