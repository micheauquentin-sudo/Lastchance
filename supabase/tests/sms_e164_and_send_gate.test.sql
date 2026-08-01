-- ============================================================
-- 20260826120000 — normalisation E.164 (+33) et porte d'envoi
--
-- Plan CHIFFRÉ : voir le motif écrit en tête de sms_credit_ledger.test.sql.
-- La section 2 est celle qui compte, et elle est au début — un fichier qui
-- meurt après elle donnerait le change avec `no_plan()`.
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE RETRAIT DE CONSENTEMENT EST DÉSORMAIS OPÉRANT (section 2). C'était
--      le défaut : « 0612345678 » et « +33612345678 » faisaient deux
--      consentements, un STOP sur l'un ne valait pas pour l'autre, et le
--      client qui avait demandé l'arrêt était rappelé. On prouve le
--      rapprochement ET son contrôle négatif — deux numéros RÉELLEMENT
--      différents restent différents, sinon « ça rapproche tout » serait vrai
--      pour la pire des raisons.
--   2. LE DÉBIT A LIEU UNE FOIS PAR MESSAGE, PAS PAR TENTATIVE (section 5).
--      Trois tentatives sur un opérateur en panne ne facturent pas trois SMS.
--   3. L'ÉCHEC DÉFINITIF REMBOURSE ET NE SE REJOUE PLUS (section 6) — les
--      deux ensemble : rembourser sans fermer la reprise donnerait des SMS
--      gratuits en boucle.
--   4. L'ÉCHEC TEMPORAIRE NE REMBOURSE PAS (section 5), et reste rejouable.
--   5. Un expéditeur non déclaré et un crédit nul ferment la porte (section 4).
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(81);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug) values
  ('ef000000-0000-4000-8000-000000000001', 'Org Envoi',        'tap-smsgate-1'),
  ('ef000000-0000-4000-8000-000000000002', 'Org Sans Expéd.',  'tap-smsgate-2'),
  ('ef000000-0000-4000-8000-000000000003', 'Org Sans Crédit',  'tap-smsgate-3');

-- ══ 1. La normalisation, cas par cas ═══════════════════════
select is(public.sms_phone_e164('+33612345678'), '+33612345678',
  'une forme déjà internationale est rendue telle quelle');
select is(public.sms_phone_e164('0612345678'), '+33612345678',
  'LE CAS DÉCIDÉ : le national français prend +33');
select is(public.sms_phone_e164('06 12 34 56 78'), '+33612345678',
  'les séparateurs disparaissent');
select is(public.sms_phone_e164('06.12.34.56.78'), '+33612345678',
  'les points aussi');
select is(public.sms_phone_e164('0033612345678'), '+33612345678',
  'le préfixe international COMPOSÉ (00) vaut le +');
select is(public.sms_phone_e164('+33 (0)6 12 34 56 78'), '+33612345678',
  'la notation « +33 (0)6 » perd son 0 interurbain — aucun numéro français ne commence par 0 après le +33');
select is(public.sms_phone_e164('612345678'), '+33612345678',
  'neuf chiffres sans le 0 interurbain : +33 aussi');
select is(public.sms_phone_e164('+32475123456'), '+32475123456',
  'un numéro étranger DÉJÀ international n''est pas touché par le défaut français');
select is(public.sms_phone_e164(null), null,
  'null reste null');
select is(public.sms_phone_e164('sans chiffre'), null,
  'une saisie sans aucun chiffre rend null — plutôt qu''une clé vide qui rapprocherait tout le monde');

-- LA LIMITE ASSUMÉE DU DÉFAUT FRANÇAIS, écrite plutôt que tue : un national
-- ÉTRANGER saisi sans indicatif devient français. C'est la conséquence
-- inévitable de « +33 par défaut », pas un défaut de la fonction — et le seul
-- moyen de l'éviter serait de connaître le pays de chaque saisie.
select is(public.sms_phone_e164('0475123456'), '+33475123456',
  'LIMITE ASSUMÉE — un national étranger sans indicatif est lu comme français : c''est ce que « +33 par défaut » veut dire');
-- Le pays par défaut EST un paramètre, et il change bien l'issue : sous 'BE',
-- la règle française ne s'applique plus. Mais la fonction ne connaît aucune
-- règle belge, donc elle ne PRÉSUME PAS +32 — elle retombe sur son dernier
-- recours et rend « +0475123456 », qui n'est pas un numéro composable.
--
-- C'est laid, et c'est délibéré : rendre '+32475123456' supposerait de savoir
-- que le 0 belge est un préfixe interurbain, ce que personne n'a vérifié ici.
-- Une conversion présumée FUSIONNERAIT deux numéros réellement différents dans
-- les pays où le préfixe national ne se retire pas de la même façon — c'est
-- l'avertissement laissé par 20260823120000, et il reste juste. La sortie est
-- déterministe (même saisie, même clé) sans jamais fabriquer d'appartenance.
--
-- Ce que cette assertion garde : ouvrir le SMS hors de France demande d'écrire
-- la règle du pays visé, et ce test le dira le jour où quelqu'un l'oubliera.
select is(public.sms_phone_e164('0475123456', 'BE'), '+0475123456',
  'sous un autre pays, la règle française ne s''applique plus — et rien n''est présumé à la place : le dernier recours ne fabrique aucun indicatif');

-- ══ 2. LE DÉFAUT CORRIGÉ : le retrait est opérant ══════════
select isnt(
  (select public.record_sms_consent(
     'ef000000-0000-4000-8000-000000000001', '0612345678', 'sms.v1', 'caisse')),
  null, 'le consentement est recueilli EN CAISSE, au format national');

select is(
  (select phone_key from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  '+33612345678', 'et sa clé est normalisée');

-- LE STOP arrive par le numéro court du prestataire, donc au format
-- INTERNATIONAL. Avant cette migration, il ne touchait aucune ligne.
select is(
  (select public.revoke_sms_consent(
     'ef000000-0000-4000-8000-000000000001', '+33612345678', 'STOP')),
  true,
  'LE POINT CENTRAL : un STOP au format INTERNATIONAL retire le consentement recueilli au format NATIONAL');

select ok(
  (select revoked_at is not null from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  'le retrait est bien posé sur la ligne');
select is(
  (select count(*) from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  1::bigint,
  'et il n''existe TOUJOURS qu''une ligne : les deux formes n''ont jamais été deux consentements');

-- CONTRÔLE NÉGATIF — sans lui, « ça rapproche » serait vrai même d'une
-- fonction qui rendrait la même clé pour tout le monde, et le retrait
-- couperait alors des numéros qui n'ont rien demandé.
select isnt(
  (select public.record_sms_consent(
     'ef000000-0000-4000-8000-000000000001', '0698765432', 'sms.v1', 'caisse')),
  null, 'CONTRÔLE NÉGATIF — un AUTRE numéro consent');
select is(
  (select count(*) from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  2::bigint,
  'il crée bien une SECONDE ligne : deux numéros différents restent différents');
select is(
  (select revoked_at from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000001'
      and phone_key = '+33698765432'),
  null, 'et le STOP du premier ne l''a PAS retiré');

-- ══ 3. La porte d'envoi : le socle du cas nominal ══════════
select isnt(
  (select public.record_sms_consent(
     'ef000000-0000-4000-8000-000000000001', '+33612345678', 'sms.v2', 'caisse', true)),
  null, 'le client se réabonne explicitement');
select isnt(
  (select public.request_sms_sender(
     'ef000000-0000-4000-8000-000000000001', 'MABOUTIQUE')),
  null, 'l''organisation demande son expéditeur');
select isnt(
  (select entry_id from public.credit_sms_balance(
     'ef000000-0000-4000-8000-000000000001', 10, 'purchase', 45000, 'stripe:pi_100')),
  null, 'et achète dix crédits');

-- CONTRÔLE NÉGATIF de la garde d'expéditeur : tout est en place SAUF la
-- déclaration AF2M. Sans cette assertion, le « true » d'après serait
-- indistinguable d'une garde qui n'existe pas.
select is(
  (select public.claim_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'rappel', '0612345678', 'sms:g:1')),
  false,
  'CONTRÔLE NÉGATIF — consentement OK, crédit OK, mais expéditeur NON DÉCLARÉ : refusé');
select is(
  (select count(*) from public.sms_log
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  0::bigint, 'et aucune ligne de journal n''est posée');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  10, 'ni aucun crédit débité — un refus ne facture pas');

select is(
  (select public.declare_sms_sender(
     'ef000000-0000-4000-8000-000000000001', 'MABOUTIQUE', 'AF2M-2026-00100')),
  true, 'l''expéditeur est déclaré au registre');

-- ══ 4. Le cas nominal, et le numéro RÉELLEMENT composé ═════
select is(
  (select public.claim_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'rappel', '06 12 34 56 78', 'sms:g:1')),
  true, 'la réservation passe');
select is(
  (select recipient from public.sms_log where dedup_key = 'sms:g:1'),
  '+33612345678',
  'et le journal porte le numéro NORMALISÉ : c''est lui qu''on compose, sans renormaliser côté appelant');
select is(
  (select sender_id from public.sms_log where dedup_key = 'sms:g:1'),
  'MABOUTIQUE', 'l''expéditeur est GELÉ sur la ligne — la question du support est « sous quel nom est-ce parti ? »');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  9, 'un crédit a été débité, dans la même transaction que la réservation');
select ok(
  (select credit_entry_id is not null from public.sms_log where dedup_key = 'sms:g:1'),
  'et la ligne pointe le mouvement qui l''a payée');

-- La garde anti-rejeu de 20260823120000 tient toujours.
select is(
  (select public.claim_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'rappel', '0612345678', 'sms:g:1')),
  false, 'une réservation FRAÎCHE ne se re-réserve pas');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  9, 'et le refus n''a rien débité de plus');

-- ══ 5. UN CRÉDIT PAR MESSAGE, PAS PAR TENTATIVE ════════════
select is(
  (select public.finish_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'sms:g:1', 'failed', null, 'saturation opérateur')),
  true, 'l''envoi échoue TEMPORAIREMENT');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  9,
  'LE POINT : un échec TEMPORAIRE ne rembourse PAS — il sera rejoué, le crédit reste consommé');
select is(
  (select count(*) from public.sms_credit_entries
    where organization_id = 'ef000000-0000-4000-8000-000000000001'
      and reason = 'refund'),
  0::bigint, 'et aucune ligne de remboursement n''est écrite');

select is(
  (select public.claim_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'rappel', '0612345678', 'sms:g:1')),
  true, 'un échec temporaire est REJOUABLE');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  9,
  'LE POINT : la reprise NE REDÉBITE PAS — trois tentatives sur un opérateur en panne ne facturent pas trois SMS');
select is(
  (select attempts from public.sms_log where dedup_key = 'sms:g:1'),
  2, 'mais la tentative est comptée');
select is(
  (select count(*) from public.sms_log where dedup_key = 'sms:g:1'),
  1::bigint, 'et la reprise garde LA MÊME ligne');

-- ══ 6. L'ÉCHEC DÉFINITIF REMBOURSE ET FERME LA PORTE ═══════
select is(
  (select public.finish_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'sms:g:1', 'undeliverable', null, 'numéro inexistant')),
  true, 'l''envoi échoue DÉFINITIVEMENT');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  10, 'LE POINT : le crédit est RENDU');
select ok(
  (select refunded_at is not null from public.sms_log where dedup_key = 'sms:g:1'),
  'la ligne de journal porte la trace du remboursement');
select is(
  (select r.unit_cost_micros from public.sms_credit_entries r
    where r.reason = 'refund'
      and r.organization_id = 'ef000000-0000-4000-8000-000000000001'),
  45000, 'au coût GELÉ du mouvement annulé');

-- Les deux propriétés vont ENSEMBLE : rembourser sans fermer la reprise
-- donnerait un SMS gratuit à chaque tour de boucle.
select is(
  (select public.claim_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'rappel', '0612345678', 'sms:g:1')),
  false,
  'LE POINT : un échec DÉFINITIF n''est plus rejouable — sinon rembourser puis renvoyer donnerait des SMS gratuits en boucle');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  10, 'et le solde reste rendu, sans second remboursement');

-- Un accusé tardif ne rouvre pas la ligne, donc ne rembourse pas deux fois.
select is(
  (select public.finish_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'sms:g:1', 'undeliverable', null, 'accusé rejoué')),
  false, 'un accusé rejoué sur une ligne close ne fait rien');
select is(
  (select count(*) from public.sms_credit_entries
    where organization_id = 'ef000000-0000-4000-8000-000000000001'
      and reason = 'refund'),
  1::bigint, 'et il n''existe qu''UN remboursement');

-- ══ 7. Le retrait coupe l'envoi, le crédit reste intact ════
select is(
  (select public.revoke_sms_consent(
     'ef000000-0000-4000-8000-000000000001', '+33 6 12 34 56 78', 'STOP')),
  true, 'le client se désinscrit, dans un troisième format encore');
select is(
  (select public.claim_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'rappel', '0612345678', 'sms:g:2')),
  false, 'plus aucune réservation — la garde est à l''ENVOI, pas seulement au ciblage');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  10, 'et un refus pour consentement retiré ne débite rien');

-- ══ 8. Crédit nul : la dernière porte ══════════════════════
select isnt(
  (select public.record_sms_consent(
     'ef000000-0000-4000-8000-000000000003', '0611111111', 'sms.v1', 'caisse')),
  null, 'une troisième organisation recueille un consentement');
select isnt(
  (select public.request_sms_sender(
     'ef000000-0000-4000-8000-000000000003', 'TROISIEME')),
  null, 'demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'ef000000-0000-4000-8000-000000000003', 'TROISIEME', 'AF2M-2026-00300')),
  true, 'et le fait déclarer');

select is(
  (select public.claim_sms_delivery(
     'ef000000-0000-4000-8000-000000000003', 'rappel', '0611111111', 'sms:h:1')),
  false,
  'LE POINT : consentement OK, expéditeur DÉCLARÉ, mais AUCUN crédit — refusé');
select is(
  (select count(*) from public.sms_log
    where organization_id = 'ef000000-0000-4000-8000-000000000003'),
  0::bigint,
  'et aucune ligne de journal : le débit est en dernier, mais son refus ne laisse rien derrière lui');

-- ══ 9. L'ancienne signature a DISPARU ══════════════════════
--
-- `create or replace` ne remplace pas une fonction dont l'arité change : sans
-- le `drop` explicite de la migration, l'ancienne à cinq paramètres
-- cohabiterait — sans porte d'expéditeur ni débit. Un appelant qui l'aurait
-- atteinte aurait envoyé gratuitement, sous un nom non déclaré.
select is(
  (select count(*) from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_sms_delivery'),
  1::bigint,
  'il n''existe qu''UNE surcharge de claim_sms_delivery — l''ancienne, sans expéditeur ni débit, est retirée');
select is(
  (select count(*) from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'finish_sms_delivery'),
  1::bigint,
  'ni qu''UNE de finish_sms_delivery — la variante sans organisation clôturerait la ligne d''un autre tenant');

-- ══ 9bis. UN NUMÉRO INENVOYABLE REND `false`, PAS UNE EXCEPTION ══
--
-- `sms_phone_e164` peut rendre une forme plus courte que ce que le CHECK de
-- `sms_log.recipient` accepte : « 000000 » y devient « +0000 », cinq
-- caractères contre six exigés. L'insertion LEVAIT alors, et le worker recevait
-- une exception là où le contrat de cette fonction promet un booléen. La
-- transaction avortait proprement et aucun crédit n'était perdu — mais « ce
-- numéro n'est pas envoyable » est un état ORDINAIRE : le traiter comme une
-- panne fait remonter du bruit à la place du signal.
select is(public.sms_phone_e164('000000'), '+0000',
  'la normalisation rend bien une forme TROP COURTE pour le CHECK du journal — c''est le cas à couvrir');

-- LE CONSENTEMENT EST INDISPENSABLE À CE TEST, et c'est subtil : sans lui, le
-- refus viendrait de la garde (2) et le `false` serait vert même sans le
-- correctif. Il faut franchir consentement ET expéditeur pour atteindre
-- l'insertion qui levait.
select isnt(
  (select public.record_sms_consent(
     'ef000000-0000-4000-8000-000000000001', '000000', 'sms.v1', 'caisse')),
  null, 'un consentement est recueilli SUR CETTE SAISIE — sinon le refus prouverait autre chose');
select lives_ok(
  $$ select public.claim_sms_delivery(
       'ef000000-0000-4000-8000-000000000001'::uuid, 'rappel', '000000', 'sms:court:1') $$,
  'LE POINT : réserver sur un tel numéro ne LÈVE PAS — le contrat de la fonction est un booléen');
select is(
  (select public.claim_sms_delivery(
     'ef000000-0000-4000-8000-000000000001', 'rappel', '000000', 'sms:court:1')),
  false, 'et rend un `false` propre, comme les cinq autres refus');
select is(
  (select count(*) from public.sms_log where dedup_key = 'sms:court:1'),
  0::bigint, 'sans laisser de ligne de journal derrière lui');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'ef000000-0000-4000-8000-000000000001'),
  10, 'ni débiter quoi que ce soit : le refus est en (1), très avant le crédit');

-- ══ 9ter. LA PURGE RGPD ATTEINT ENFIN LE CANAL SMS ═════════
--
-- `sms_log.recipient` était un numéro EN CLAIR conservé SANS LIMITE, même chez
-- une organisation ayant déclaré une rétention — le seul canal du produit à
-- collecter une PII sans échéance. Le contrôle porte dans LES DEUX SENS : ce
-- qui doit partir part, ce qui doit rester reste.
insert into public.organizations (id, name, slug, data_retention_months) values
  ('ef000000-0000-4000-8000-000000000004', 'Org Rétention', 'tap-smsgate-4', 6);

-- LES DATES ANCIENNES SONT POSÉES À L'INSERTION, jamais par un `update` :
-- `sms_consents_revocation_is_final` refuse d'antidater un consentement et de
-- reculer un retrait. Ce sont les gardes de la section 3 de
-- sms_foundation.test.sql — les contourner pour fabriquer une fixture
-- reviendrait à les désarmer le temps du test.
insert into public.sms_consents
  (organization_id, phone, consented_at, consent_version, consent_source,
   revoked_at, revoked_reason)
values
  -- (1) PÉRIMÉ, JAMAIS RETIRÉ → doit être supprimé.
  ('ef000000-0000-4000-8000-000000000004', '06 11 22 33 44',
   now() - interval '2 years', 'sms.v1', 'caisse', null, null),
  -- (2) PÉRIMÉ ET RETIRÉ → doit SURVIVRE, réduit à sa clé.
  ('ef000000-0000-4000-8000-000000000004', '06 22 33 44 55',
   now() - interval '3 years', 'sms.v1', 'caisse',
   now() - interval '2 years', 'STOP par SMS');

-- (3) RÉCENT, jamais retiré → intact. Recueilli par le chemin réel.
select isnt(
  (select public.record_sms_consent(
     'ef000000-0000-4000-8000-000000000004', '0633445566', 'sms.v1', 'caisse')),
  null, 'un troisième consentement, RÉCENT, est recueilli par la RPC');

-- Le journal : une ligne ancienne et une récente.
insert into public.sms_log
  (organization_id, scenario, recipient, dedup_key, status, last_error, created_at)
values
  ('ef000000-0000-4000-8000-000000000004', 'rappel', '+33611223344',
   'sms:purge:vieux', 'failed', 'refus opérateur pour +33611223344',
   now() - interval '2 years'),
  ('ef000000-0000-4000-8000-000000000004', 'rappel', '+33633445566',
   'sms:purge:recent', 'failed', 'refus opérateur', now() - interval '1 day');

select lives_ok(
  $$ select public.purge_expired_personal_data() $$,
  'la purge s''exécute');

-- CE QUI DOIT PARTIR.
select is(
  (select recipient from public.sms_log where dedup_key = 'sms:purge:vieux'),
  '000000',
  'LE POINT : le destinataire d''un envoi au-delà de la rétention est ANONYMISÉ — c''était une PII conservée sans limite');
select is(
  (select last_error from public.sms_log where dedup_key = 'sms:purge:vieux'),
  null,
  'et last_error est vidé : un message de prestataire peut recopier le numéro');
select is(
  (select count(*) from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000004'
      and revoked_at is null
      and consented_at < now() - interval '1 year'),
  0::bigint,
  'un consentement périmé et JAMAIS retiré est supprimé — « aucun consentement au dossier » veut dire NON contactable');
select is(
  (select consent_source from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000004'
      and revoked_at is not null),
  null, 'le point de collecte d''un retrait ancien est effacé');
select is(
  (select revoked_reason from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000004'
      and revoked_at is not null),
  null, 'son motif aussi — il peut citer le contenu d''un message');

-- CE QUI DOIT RESTER. Sans ces quatre-là, une purge qui effacerait TOUT serait
-- verte sur les cinq assertions précédentes — et rendrait le numéro
-- contactable au consentement suivant, c'est-à-dire ferait le défaut que le
-- trigger de suppression vient de fermer, avec une bonne intention.
select is(
  (select count(*) from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000004'
      and revoked_at is not null),
  1::bigint,
  'LE POINT SYMÉTRIQUE : le RETRAIT survit à la purge — c''est la preuve d''opposition, et le seul moyen de l''honorer');
select is(
  (select phone_key from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000004'
      and revoked_at is not null),
  '+33622334455',
  'et sa clé normalisée est INTACTE : sans elle, un STOP ne se rapprocherait plus de rien');
select is(
  (select phone from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000004'
      and revoked_at is not null),
  '+33622334455',
  'mais la forme BRUTE de la saisie (« 06 22 33 44 55 ») a disparu — on ne garde que ce qui permet d''honorer l''opposition');
select is(
  (select count(*) from public.sms_consents
    where organization_id = 'ef000000-0000-4000-8000-000000000004'
      and revoked_at is null),
  1::bigint,
  'le consentement RÉCENT n''est pas touché — la purge suit la rétention, pas la table');
select is(
  (select recipient from public.sms_log where dedup_key = 'sms:purge:recent'),
  '+33633445566',
  'et l''envoi récent garde son destinataire : la rétention n''a pas expiré pour lui');

-- ══ 10. ACL ════════════════════════════════════════════════
select ok(
  has_function_privilege('service_role',
    'public.claim_sms_delivery(uuid,text,text,text,integer,text,integer)', 'EXECUTE'),
  'le serveur peut réserver un envoi');
select ok(
  not has_function_privilege('anon',
    'public.claim_sms_delivery(uuid,text,text,text,integer,text,integer)', 'EXECUTE'),
  'anon ne réserve pas d''envoi');
select ok(
  not has_function_privilege('anon', 'public.sms_phone_e164(text,text)', 'EXECUTE'),
  'anon n''appelle pas la normalisation — inoffensive, mais rien de public ici');
select ok(
  has_function_privilege('authenticated', 'public.sms_phone_e164(text,text)', 'EXECUTE'),
  'un commerçant connecté peut normaliser un numéro : la fonction ne lit rien');

select * from finish();
rollback;
