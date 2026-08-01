-- ============================================================
-- 20260823120000 — socle SMS : consentement et journal
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE RETRAIT EST IRRÉVERSIBLE (section 3). C'est la promesse la plus
--      forte de cette migration, et la seule qui ne puisse pas s'écrire en
--      CHECK. On prouve les trois interdits séparément — annuler un retrait,
--      antidater un consentement, reculer un retrait — et on prouve aussi la
--      SORTIE légitime : un nouveau consentement, postérieur, rouvre la porte.
--   2. UN NUMÉRO RETIRÉ NE SE RÉACTIVE PAS TOUT SEUL (section 4). C'est le
--      cas réel : le client rejoue, la case est pré-cochée, et un
--      `on conflict do update` naïf le rendrait contactable à nouveau.
--   3. LE JOURNAL NE RENVOIE JAMAIS (section 6), y compris — et surtout —
--      quand la réservation est en `sending`. C'est le défaut exact du worker
--      newsletter : `sending` absent de la garde, et un job relancé
--      renvoyait TOUT. Ici `sending` compte comme réservé.
--   4. Mais une réservation MORTE se reprend (section 7) : sinon la garde
--      ci-dessus bloquerait un numéro pour toujours.
--   5. Le consentement est vérifié À L'ENVOI et pas seulement au ciblage
--      (section 5), le rapprochement des formats (section 2), l'ACL et
--      l'isolation (sections 8 et 9).
-- ============================================================
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()` rend
-- « aucun plan trouvé », indistinguable d'un succès — c'est arrivé sur ce lot,
-- sur ce fichier, quand une signature de fonction avait changé sous lui.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug) values
  ('ec000000-0000-4000-8000-000000000001', 'Org SMS',     'tap-sms'),
  ('ec000000-0000-4000-8000-000000000002', 'Org SMS Voisine', 'tap-sms-2');

-- ══ 1. Le consentement s'écrit, daté et versionné ═══════════
select isnt(
  (select public.record_sms_consent(
     'ec000000-0000-4000-8000-000000000001', '+33612345678', 'sms.v1', 'wheel')),
  null, 'un consentement SMS s''enregistre');

select is(
  (select consent_version from public.sms_consents
    where organization_id = 'ec000000-0000-4000-8000-000000000001'),
  'sms.v1',
  'la VERSION du texte accepté est conservée — sans elle on sait qu''il a consenti, pas à quoi');
select ok(
  (select consented_at is not null from public.sms_consents
    where organization_id = 'ec000000-0000-4000-8000-000000000001'),
  'et il est daté');
select is(
  (select revoked_at from public.sms_consents
    where organization_id = 'ec000000-0000-4000-8000-000000000001'),
  null, 'un consentement neuf n''est pas retiré');

-- ══ 2. Rapprochement des formats de saisie ══════════════════
-- Le même numéro saisi avec des séparateurs ne doit pas créer un SECOND
-- consentement : sinon un retrait ne porterait que sur l'une des deux lignes.
select is(
  (select public.record_sms_consent(
     'ec000000-0000-4000-8000-000000000001', '+33 6 12 34 56 78', 'sms.v1', 'wheel')),
  (select id from public.sms_consents
    where organization_id = 'ec000000-0000-4000-8000-000000000001'),
  'le même numéro avec des séparateurs retombe sur LA MÊME ligne');
select is(
  (select count(*) from public.sms_consents
    where organization_id = 'ec000000-0000-4000-8000-000000000001'),
  1::bigint, 'un seul consentement, pas deux');

-- ══ 3. LE RETRAIT EST IRRÉVERSIBLE ══════════════════════════
select is(
  (select public.revoke_sms_consent(
     'ec000000-0000-4000-8000-000000000001', '+33612345678', 'STOP reçu')),
  true, 'le retrait s''enregistre');
select ok(
  (select revoked_at is not null from public.sms_consents
    where organization_id = 'ec000000-0000-4000-8000-000000000001'),
  'et il est daté');

-- Un second retrait ne repousse pas la date du premier : c'est cette date qui
-- prouve à partir de quand les envois cessaient d'être légitimes.
select is(
  (select public.revoke_sms_consent(
     'ec000000-0000-4000-8000-000000000001', '+33612345678', 'STOP à nouveau')),
  false, 'un second retrait ne fait rien — la date du premier est une preuve, pas un état');

-- (a) Annuler un retrait, sans nouveau consentement : REFUSÉ.
select throws_ok(
  $$ update public.sms_consents set revoked_at = null
      where organization_id = 'ec000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'LE POINT CENTRAL : on ne peut pas annuler un retrait sans nouveau consentement');

-- (b) Antidater un consentement : REFUSÉ.
select throws_ok(
  $$ update public.sms_consents set consented_at = now() - interval '100 days'
      where organization_id = 'ec000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'un consentement ne s''antidate pas — ce serait couvrir après coup des envois déjà partis');

-- (c) Reculer un retrait : REFUSÉ.
select throws_ok(
  $$ update public.sms_consents set revoked_at = now() - interval '100 days'
      where organization_id = 'ec000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'un retrait ne se recule pas — ce serait légitimer les envois faits entre-temps');

-- (d) LA SORTIE LÉGITIME : un consentement postérieur au retrait rouvre la
-- porte. Sans cette assertion, « irréversible » serait indistinguable de
-- « définitif », et le client ne pourrait jamais se réabonner.
-- `clock_timestamp()` et non `now()` : dans pgTAP tout le fichier vit dans UNE
-- transaction, et `now()` y est figé à son ouverture — il serait ANTÉRIEUR au
-- retrait, que les RPC horodatent à l'instant réel. C'est ce détail qui a
-- révélé le défaut corrigé dans la migration.
select lives_ok(
  $$ update public.sms_consents
        set revoked_at = null, revoked_reason = null, consented_at = clock_timestamp()
      where organization_id = 'ec000000-0000-4000-8000-000000000001' $$,
  'un NOUVEAU consentement, postérieur au retrait, rouvre la porte');

-- ══ 4. Un numéro retiré ne se réactive pas implicitement ════
select is(
  (select public.revoke_sms_consent(
     'ec000000-0000-4000-8000-000000000001', '+33612345678', 'STOP')),
  true, 'on retire à nouveau, pour le cas suivant');

-- Le client rejoue, la case est pré-cochée : la RPC doit REFUSER, bruyamment.
-- Le silence serait pire : l'appelant croirait le numéro joignable.
select throws_ok(
  $$ select public.record_sms_consent(
       'ec000000-0000-4000-8000-000000000001', '+33612345678', 'sms.v1', 'wheel') $$,
  'P0001', null,
  'un numéro RETIRÉ n''est pas réactivé par un simple nouveau passage — il faut un geste explicite');

-- Le geste explicite, lui, fonctionne.
select isnt(
  (select public.record_sms_consent(
     'ec000000-0000-4000-8000-000000000001', '+33612345678', 'sms.v2', 'wheel', true)),
  null, 'p_renew = true matérialise le nouveau consentement explicite du joueur');
select is(
  (select revoked_at from public.sms_consents
    where organization_id = 'ec000000-0000-4000-8000-000000000001'),
  null, 'et le numéro redevient joignable');

-- ══ 4bis. CE QUE 20260826120000 A AJOUTÉ EN AMONT ══════════
--
-- `claim_sms_delivery` exige désormais DEUX choses de plus que le
-- consentement : un expéditeur déclaré au registre AF2M (20260824120000) et
-- du crédit (20260825120000). Sans elles, toutes les réservations de ce
-- fichier rendraient `false` — et les assertions ci-dessous, qui portent sur
-- le CONSENTEMENT et l'ANTI-DOUBLON, seraient vertes pour la mauvaise raison
-- ou rouges sans rapport avec ce qu'elles gardent.
--
-- On pose donc le décor minimal. Ce n'est pas un affaiblissement des gardes
-- neuves : elles sont éprouvées pour elles-mêmes dans
-- sms_sender_identity.test.sql et sms_e164_and_send_gate.test.sql, y compris
-- avec leurs contrôles négatifs. Ici, elles sont satisfaites pour que le
-- fichier continue de tester CE QU'IL TESTE.
select isnt(
  (select public.request_sms_sender(
     'ec000000-0000-4000-8000-000000000001', 'ORGSMS')),
  null, 'décor — l''organisation a un expéditeur');
select is(
  (select public.declare_sms_sender(
     'ec000000-0000-4000-8000-000000000001', 'ORGSMS', 'AF2M-TAP-0001')),
  true, 'décor — il est déclaré au registre AF2M');
select isnt(
  (select public.credit_sms_balance(
     'ec000000-0000-4000-8000-000000000001', 10, 'purchase', 45000, 'tap:setup')),
  null, 'décor — et elle a du crédit SMS');

-- ══ 5. Le consentement est vérifié À L'ENVOI ════════════════
-- Un numéro jamais consentant n'est pas joignable, même si l'appelant le
-- demande : une cible calculée quelques minutes plus tôt peut être périmée.
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33699999999', 'sms:jamais:1')),
  false, 'un numéro sans consentement n''est JAMAIS réservé');
select is(
  (select count(*) from public.sms_log
    where organization_id = 'ec000000-0000-4000-8000-000000000001'),
  0::bigint, 'et aucune ligne de journal n''est écrite pour lui');

-- ══ 6. LE JOURNAL NE RENVOIE JAMAIS ════════════════════════
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33612345678', 'sms:camp1:dest1')),
  true, 'première réservation : envoyez');
select is(
  (select status from public.sms_log where dedup_key = 'sms:camp1:dest1'),
  'sending', 'la ligne est posée AVANT l''envoi — le doublon se ferme à la réservation');

-- LE DÉFAUT DU WORKER NEWSLETTER, à ne pas répéter : `sending` était absent
-- de sa garde anti-rejeu, et un job relancé renvoyait TOUT.
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33612345678', 'sms:camp1:dest1')),
  false,
  'une réservation FRAÎCHE en « sending » ne se re-réserve pas — c''est le défaut du worker newsletter');

select is(
  (select public.finish_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'sms:camp1:dest1', 'sent', 'msg-42')),
  true, 'l''envoi se confirme');
select is(
  (select status from public.sms_log where dedup_key = 'sms:camp1:dest1'),
  'sent', 'et le journal le dit');

-- Un rejeu après succès : jamais de second SMS.
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33612345678', 'sms:camp1:dest1')),
  false, 'un SMS déjà parti n''est JAMAIS renvoyé — c''est le cas nominal d''un rejeu de job');

-- Un accusé tardif ne rouvre pas un envoi clos.
select is(
  (select public.finish_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'sms:camp1:dest1', 'failed', null, 'accusé tardif')),
  false, 'un envoi déjà « sent » ne se rouvre pas — ce serait la porte du renvoi');
select is(
  (select status from public.sms_log where dedup_key = 'sms:camp1:dest1'),
  'sent', 'son état est inchangé');

select is(
  (select count(*) from public.sms_log where dedup_key = 'sms:camp1:dest1'),
  1::bigint, 'et il n''existe TOUJOURS qu''une seule ligne pour ce destinataire');

-- ══ 7. Mais une réservation MORTE se reprend ═══════════════
-- Sans cela, la garde de la section 6 bloquerait un numéro pour toujours :
-- un worker tué en plein envoi laisserait un « sending » éternel.
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33612345678', 'sms:camp2:dest1')),
  true, 'nouvelle réservation');
update public.sms_log set claimed_at = now() - interval '2 hours'
 where dedup_key = 'sms:camp2:dest1';
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33612345678', 'sms:camp2:dest1')),
  true, 'une réservation PÉRIMÉE se reprend — un worker mort ne bloque pas le numéro');
select is(
  (select attempts from public.sms_log where dedup_key = 'sms:camp2:dest1'),
  2, 'la reprise compte la tentative');
select is(
  (select count(*) from public.sms_log where dedup_key = 'sms:camp2:dest1'),
  1::bigint,
  'et elle REPREND LA MÊME LIGNE : la reprise ne doit jamais dupliquer le destinataire');

-- Un échec se reprend aussi.
select is(
  (select public.finish_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'sms:camp2:dest1', 'failed', null, 'refus opérateur')),
  true, 'un échec se journalise');
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33612345678', 'sms:camp2:dest1')),
  true, 'et il est réessayable');

-- ══ 8. Le retrait coupe les envois en cours ════════════════
select is(
  (select public.revoke_sms_consent(
     'ec000000-0000-4000-8000-000000000001', '+33612345678', 'STOP')),
  true, 'le client se désinscrit');
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33612345678', 'sms:camp3:dest1')),
  false,
  'plus aucune réservation après le retrait — la garde est à l''ENVOI, pas seulement au ciblage');

-- ══ 9. Isolation multi-tenant ══════════════════════════════
-- Le consentement est donné À UNE ORGANISATION : celui d'une boulangerie ne
-- vaut pas pour un garage.
select isnt(
  (select public.record_sms_consent(
     'ec000000-0000-4000-8000-000000000002', '+33777777777', 'sms.v1', 'wheel')),
  null, 'le voisin recueille son propre consentement');
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33777777777', 'sms:croise:1')),
  false,
  'un consentement donné au VOISIN ne rend pas le numéro joignable par cette organisation');

-- ══ 9bis. LA CLÉ ANTI-DOUBLON EST SCOPÉE À L'ORGANISATION ══
--
-- Deux organisations calculent leurs `dedup_key` indépendamment : rien ne les
-- empêche de tomber sur la même chaîne (« rappel:2026-08-01:client-42 »). Avec
-- une unicité GLOBALE, le worker de A trouvait, VERROUILLAIT et RÉÉCRIVAIT la
-- ligne de B — qui gardait `organization_id = B`, donc restait lisible par le
-- propriétaire de B via `sms_log_owner_read`, tout en portant le NUMÉRO D'UN
-- CLIENT DE A. Fuite de PII inter-tenant. Et si la ligne de B était fraîche,
-- l'appel de A rendait `false` : le message de B ne partait jamais, sans trace.
--
-- Même classe que le finding M1 de `contest_awards` (2026-07-25), et même
-- leçon : la clé, la lecture ET l'écriture sont scopées ensemble.
select isnt(
  (select public.request_sms_sender(
     'ec000000-0000-4000-8000-000000000002', 'VOISIN')),
  null, 'décor — le voisin a un expéditeur');
select is(
  (select public.declare_sms_sender(
     'ec000000-0000-4000-8000-000000000002', 'VOISIN', 'AF2M-TAP-0002')),
  true, 'décor — déclaré au registre');
select isnt(
  (select public.credit_sms_balance(
     'ec000000-0000-4000-8000-000000000002', 10, 'purchase', 45000, 'tap:setup-2')),
  null, 'décor — et du crédit');

-- Le VOISIN réserve le premier, sous une clé quelconque.
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000002', 'rappel', '+33777777777', 'sms:collision:1')),
  true, 'le voisin réserve son envoi');

-- L'organisation 1 recueille un consentement neuf (le sien a été retiré en
-- section 8) et réserve SOUS LA MÊME CLÉ.
select isnt(
  (select public.record_sms_consent(
     'ec000000-0000-4000-8000-000000000001', '+33655555555', 'sms.v1', 'caisse')),
  null, 'un client de la première organisation consent');
select is(
  (select public.claim_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'rappel', '+33655555555', 'sms:collision:1')),
  true,
  'LE POINT : la même clé chez une AUTRE organisation réserve sa PROPRE ligne — elle ne reprend pas celle du voisin');

select is(
  (select count(*) from public.sms_log where dedup_key = 'sms:collision:1'),
  2::bigint, 'il existe donc DEUX lignes, une par organisation');
select is(
  (select recipient from public.sms_log
    where dedup_key = 'sms:collision:1'
      and organization_id = 'ec000000-0000-4000-8000-000000000002'),
  '+33777777777',
  'LA FUITE FERMÉE : la ligne du voisin porte TOUJOURS son propre destinataire, jamais le client de l''autre');
select is(
  (select status from public.sms_log
    where dedup_key = 'sms:collision:1'
      and organization_id = 'ec000000-0000-4000-8000-000000000002'),
  'sending',
  'et elle est toujours réservée : le message du voisin partira — sans le scope, il ne serait jamais parti, sans trace');

-- La clôture est scopée aussi. Ne scoper que la lecture produirait un état
-- PIRE : ligne consommée d'un côté, « rien à faire » de l'autre.
select is(
  (select public.finish_sms_delivery(
     'ec000000-0000-4000-8000-000000000001', 'sms:collision:1', 'sent', 'msg-collision')),
  true, 'la première organisation clôt SA ligne');
select is(
  (select status from public.sms_log
    where dedup_key = 'sms:collision:1'
      and organization_id = 'ec000000-0000-4000-8000-000000000002'),
  'sending',
  'et celle du voisin est INTACTE — une clôture non scopée aurait fermé, voire remboursé, l''envoi d''un autre tenant');

-- ══ 9ter. LE RETRAIT NE S'EFFACE PAS ═══════════════════════
--
-- Le trigger `sms_consents_revocation_is_final` est `before update` seulement.
-- Sans garde sur le DELETE, `delete` puis `record_sms_consent` prenait la
-- branche « inconnu » et insérait un consentement NEUF ET ACTIF, sans
-- `p_renew` : le STOP du client disparaissait, et la preuve de sa date avec.
select is(
  (select public.revoke_sms_consent(
     'ec000000-0000-4000-8000-000000000002', '+33777777777', 'STOP')),
  true, 'le client du voisin demande l''arrêt');
select throws_ok(
  $$ delete from public.sms_consents
      where organization_id = 'ec000000-0000-4000-8000-000000000002'
        and phone_key = '+33777777777' $$,
  'P0001', null,
  'LE POINT : un consentement RETIRÉ ne s''efface pas — l''effacer rendrait le numéro contactable au consentement suivant');
select ok(
  (select revoked_at is not null from public.sms_consents
    where organization_id = 'ec000000-0000-4000-8000-000000000002'
      and phone_key = '+33777777777'),
  'le retrait, et sa date, sont toujours là');

-- La dissymétrie est délibérée, et c'est elle qui rend la purge de rétention
-- possible : un consentement JAMAIS retiré s'efface, parce que le supprimer
-- échoue du bon côté — « aucun consentement au dossier » veut dire NON
-- contactable.
select isnt(
  (select public.record_sms_consent(
     'ec000000-0000-4000-8000-000000000002', '+33788888888', 'sms.v1', 'caisse')),
  null, 'un autre client du voisin consent, et ne se rétracte pas');
select lives_ok(
  $$ delete from public.sms_consents
      where organization_id = 'ec000000-0000-4000-8000-000000000002'
        and phone_key = '+33788888888' $$,
  'un consentement JAMAIS retiré s''efface, lui — sa suppression ne ressuscite rien');

-- Et `service_role` n'a même plus le privilège de tenter.
select ok(
  not has_table_privilege('service_role', 'public.sms_consents', 'DELETE'),
  'le privilège DELETE est retiré à service_role : la garde est double, trigger et grant');

-- ══ 10. ACL et absence de secrets ══════════════════════════
-- Signature à SEPT paramètres depuis 20260827120000 (ajout du nombre de
-- SEGMENTS ; auparavant six depuis 20260826120000, qui avait ajouté la
-- destination — le coût unitaire, lui, N'EST PAS un paramètre, il se lit en
-- base). Chaque version antérieure est DROPPÉE et non surchargée.
--
-- ⚠️ CETTE LIGNE EST À REMETTRE À JOUR À CHAQUE CHANGEMENT D'ARITÉ, et le
-- motif n'est pas cosmétique : `has_function_privilege` sur une fonction
-- inexistante ne rend pas `false` — ELLE LÈVE, ce qui tue le fichier entier
-- AVANT `finish()`, donc sans plan et sans compte. Ce fichier a déjà été tué
-- une fois par cet oubli, en 20260826120000, et une seconde fois l'aurait été
-- en 20260827120000 : l'ajout d'un paramètre EN QUEUE avec un défaut préserve
-- les APPELS, jamais les assertions qui nomment la signature complète.
select ok(
  has_function_privilege('service_role',
    'public.claim_sms_delivery(uuid,text,text,text,integer,text,integer)', 'EXECUTE'),
  'le serveur peut réserver un envoi');
select ok(
  not has_function_privilege('anon',
    'public.claim_sms_delivery(uuid,text,text,text,integer,text,integer)', 'EXECUTE'),
  'anon ne peut pas réserver d''envoi');
select ok(
  not has_function_privilege('authenticated', 'public.record_sms_consent(uuid,text,text,text,boolean)', 'EXECUTE'),
  'un commerçant connecté n''écrit pas un consentement à la main');
select ok(
  not has_function_privilege('anon', 'public.revoke_sms_consent(uuid,text,text)', 'EXECUTE'),
  'anon ne retire pas un consentement au hasard');

-- Les numéros sont des PII : lecture propriétaire, comme email_log.
select ok(
  not has_table_privilege('anon', 'public.sms_consents', 'SELECT'),
  'anon ne lit pas les consentements');
select ok(
  not has_table_privilege('anon', 'public.sms_log', 'SELECT'),
  'anon ne lit pas le journal des SMS');

-- Aucune table de secrets : la promesse « rien du prestataire en base ».
select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name in ('sms_consents', 'sms_log')
      and (column_name ~* '(api_?key|secret|token|password|credential)')),
  0::bigint,
  'aucune colonne de secret dans le socle SMS — le prestataire reste dehors');

select * from finish();
rollback;
