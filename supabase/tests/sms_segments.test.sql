-- ============================================================
-- 20260827120000 — le crédit SMS se compte en SEGMENTS
--
-- Plan CHIFFRÉ, et non `no_plan()` : ce fichier vit ou meurt sur ses contrôles
-- négatifs, qui sont au milieu. Avec `no_plan()`, un fichier qui meurt avant
-- eux rend exactement le même résultat qu'un fichier sain — « tout est vert ».
-- Le plan chiffré rend « planned N but ran M ».
--
-- ⚠️ L'ASSERTION QUI PORTE TOUT LE FICHIER est celle de la section 2 : sous un
-- solde de DEUX, un envoi à TROIS segments doit être REFUSÉ. C'est la seule
-- qui distingue le code corrigé du code d'origine — avec l'ancien
-- `claim_sms_delivery`, qui débitait le littéral 1, ce même envoi passait et
-- laissait le commerçant payer un tiers de ce qu'il devait. Les assertions de
-- la section 1 (« 3 segments débitent 3 ») seraient, elles, satisfaites par un
-- code qui ne compterait juste que dans le cas facile.
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE DÉBIT SUIT LES SEGMENTS (section 1) et LE REFUS AUSSI (section 2),
--      sans laisser de ligne de journal ni entamer le solde.
--   2. UNE REPRISE NE REDÉBITE RIEN (section 3), y compris multi-segment :
--      c'est la propriété « un crédit par dedup_key, jamais par tentative »
--      qui devait survivre au changement.
--   3. UN ÉCHEC DÉFINITIF REND EXACTEMENT CE QUI A ÉTÉ PRIS (section 4), lu
--      SUR LE SOLDE et non en comptant des lignes de grand livre — un
--      remboursement de 1 sur un débit de 3 produirait le même nombre de
--      lignes et passerait un test qui se contenterait de compter.
--   4. L'ENTRÉE EST BORNÉE DES DEUX CÔTÉS (section 5), et la borne existe
--      AUSSI en base (section 6) : le clamp de la fonction ne prouve rien sur
--      les chemins d'écriture futurs.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug) values
  ('f0000000-0000-4000-8000-000000000001', 'Org Segments',   'tap-smsseg-1'),
  ('f0000000-0000-4000-8000-000000000002', 'Org Segments 2', 'tap-smsseg-2');

-- ══ 0. Le socle : consentement, expéditeur déclaré, crédit ══
--
-- Les trois gardes qui précèdent le débit doivent être FRANCHIES, sinon les
-- refus mesurés plus bas prouveraient autre chose que le crédit.
select isnt(
  (select public.record_sms_consent(
     'f0000000-0000-4000-8000-000000000001', '0612345678', 'sms.v1', 'caisse')),
  null, 'le client consent (organisation 1)');
select isnt(
  (select public.request_sms_sender(
     'f0000000-0000-4000-8000-000000000001', 'SEGTEST')),
  null, 'l''organisation demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f0000000-0000-4000-8000-000000000001', 'SEGTEST', 'AF2M-2026-00200')),
  true, 'et il est déclaré au registre AF2M');
select isnt(
  (select public.credit_sms_balance(
     'f0000000-0000-4000-8000-000000000001', 10, 'purchase', 45000, 'stripe:pi_seg')),
  null, 'elle achète dix crédits');

-- ══ 1. UN ENVOI À TROIS SEGMENTS DÉBITE TROIS UNITÉS ═══════
--
-- Appel PAR NOM, comme le fait PostgREST : c'est aussi ce qui rend l'ajout de
-- `p_segments` en queue sans effet sur l'ordre des arguments.
select is(
  (select public.claim_sms_delivery(
     p_organization_id => 'f0000000-0000-4000-8000-000000000001',
     p_scenario => 'rappel',
     p_recipient => '0612345678',
     p_dedup_key => 'sms:seg:1',
     p_segments => 3)),
  true, 'la réservation d''un message à TROIS segments passe');

select is(
  (select segments from public.sms_log where dedup_key = 'sms:seg:1'),
  3, 'le journal porte 3 segments');

select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  7, 'LE POINT : le solde perd TROIS unités, pas une (10 - 3)');

select is(
  (select e.delta_units from public.sms_credit_entries e
     join public.sms_log l on l.credit_entry_id = e.id
    where l.dedup_key = 'sms:seg:1'),
  -3, 'et le mouvement du grand livre qui a payé la ligne vaut bien -3');

select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  (select sum(delta_units)::integer from public.sms_credit_entries
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  'le solde ÉGALE toujours la somme du grand livre après un débit multiple');

-- ══ 2. L'ASSERTION QUI PORTE LE FICHIER ════════════════════
--
-- Solde de DEUX, message de TROIS segments. Avec l'ancien code (débit du
-- littéral 1), cet envoi PASSAIT. Organisation dédiée pour que le solde soit
-- exactement celui qu'on veut mesurer.
select isnt(
  (select public.record_sms_consent(
     'f0000000-0000-4000-8000-000000000002', '0698765432', 'sms.v1', 'caisse')),
  null, 'le client de la seconde organisation consent');
select isnt(
  (select public.request_sms_sender(
     'f0000000-0000-4000-8000-000000000002', 'SEGDEUX')),
  null, 'elle demande son expéditeur');
select is(
  (select public.declare_sms_sender(
     'f0000000-0000-4000-8000-000000000002', 'SEGDEUX', 'AF2M-2026-00201')),
  true, 'et il est déclaré');
select isnt(
  (select public.credit_sms_balance(
     'f0000000-0000-4000-8000-000000000002', 2, 'purchase', 45000, 'stripe:pi_seg2')),
  null, 'elle achète DEUX crédits, et deux seulement');

select is(
  (select public.claim_sms_delivery(
     p_organization_id => 'f0000000-0000-4000-8000-000000000002',
     p_scenario => 'rappel',
     p_recipient => '0698765432',
     p_dedup_key => 'sms:seg:refus',
     p_segments => 3)),
  false,
  'LE POINT DU CHANTIER — un solde de 2 REFUSE un message de 3 segments (il passait avant)');

select is(
  (select count(*) from public.sms_log
    where organization_id = 'f0000000-0000-4000-8000-000000000002'),
  0::bigint,
  'et AUCUNE ligne de journal n''est écrite : le débit est en dernier, son refus ne laisse rien');

select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000002'),
  2, 'ni le moindre crédit entamé — un refus ne facture pas');

select is(
  (select count(*) from public.sms_credit_entries
    where organization_id = 'f0000000-0000-4000-8000-000000000002'
      and reason = 'send'),
  0::bigint, 'et rien n''est passé au grand livre non plus');

-- CONTRÔLE NÉGATIF DU REFUS. Sans lui, le `false` ci-dessus serait vert même
-- si le refus venait du consentement, de l'expéditeur ou d'un numéro mal
-- normalisé — c'est-à-dire même sur un canal entièrement cassé. Tout est en
-- place SAUF le nombre de segments : à DEUX, le même envoi passe.
select is(
  (select public.claim_sms_delivery(
     p_organization_id => 'f0000000-0000-4000-8000-000000000002',
     p_scenario => 'rappel',
     p_recipient => '0698765432',
     p_dedup_key => 'sms:seg:tient',
     p_segments => 2)),
  true,
  'CONTRÔLE NÉGATIF — le même envoi à DEUX segments passe : le refus venait bien du crédit');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000002'),
  0, 'et il vide exactement le solde (2 - 2)');

-- ══ 3. UNE REPRISE NE REDÉBITE RIEN ════════════════════════
--
-- « Un crédit par dedup_key, jamais par tentative » devait survivre au
-- multi-segment : sans cette section, trois tentatives d'un message de trois
-- segments sur un opérateur en panne factureraient NEUF unités.
select is(
  (select public.finish_sms_delivery(
     'f0000000-0000-4000-8000-000000000001', 'sms:seg:1', 'failed', null, 'saturation opérateur')),
  true, 'l''envoi à trois segments échoue TEMPORAIREMENT');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  7, 'un échec temporaire ne rembourse rien : le crédit reste consommé');

select is(
  (select public.claim_sms_delivery(
     p_organization_id => 'f0000000-0000-4000-8000-000000000001',
     p_scenario => 'rappel',
     p_recipient => '0612345678',
     p_dedup_key => 'sms:seg:1',
     p_segments => 3)),
  true, 'la reprise passe');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  7, 'ET ELLE NE DÉBITE RIEN DE PLUS : 7, pas 4');
select is(
  (select attempts from public.sms_log where dedup_key = 'sms:seg:1'),
  2, 'c''est bien la MÊME ligne qui est reprise, à sa seconde tentative');
select is(
  (select segments from public.sms_log where dedup_key = 'sms:seg:1'),
  3, 'et elle porte toujours ses 3 segments');
select is(
  (select count(*) from public.sms_credit_entries
    where organization_id = 'f0000000-0000-4000-8000-000000000001'
      and reason = 'send'),
  1::bigint, 'un SEUL mouvement d''envoi au grand livre pour deux tentatives');

-- ══ 4. L'ÉCHEC DÉFINITIF REND EXACTEMENT CE QU'IL A PRIS ═══
--
-- LE SOLDE EST RELU, et ce n'est pas un détail de rédaction : un
-- remboursement de 1 sur un débit de 3 écrirait le même NOMBRE de lignes au
-- grand livre qu'un remboursement correct. Compter les lignes rendrait ce test
-- vert sur un remboursement faux.
select is(
  (select public.finish_sms_delivery(
     'f0000000-0000-4000-8000-000000000001', 'sms:seg:1', 'undeliverable', null, 'numéro inexistant')),
  true, 'l''envoi échoue DÉFINITIVEMENT');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  10, 'LE SOLDE REMONTE À 10 : les TROIS unités prises sont rendues, pas une');
select is(
  (select delta_units from public.sms_credit_entries
    where organization_id = 'f0000000-0000-4000-8000-000000000001'
      and reason = 'refund'),
  3, 'le mouvement de remboursement vaut +3, image exacte du débit qu''il annule');
select ok(
  (select refunded_at is not null from public.sms_log where dedup_key = 'sms:seg:1'),
  'et la ligne de journal porte sa date de remboursement');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  (select sum(delta_units)::integer from public.sms_credit_entries
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  'solde = somme du grand livre, après débit ET remboursement multi-segments');

-- ══ 5. LE CLAMP, DES DEUX CÔTÉS ════════════════════════════
--
-- Le nombre de segments est une ESTIMATION faite par le worker à partir du
-- texte. Une estimation rend un jour zéro, un négatif, ou un nombre absurde —
-- et un `p_segments` non borné viderait le solde d'un commerçant en un appel.
-- On clampe plutôt que de lever : la fonction promet un booléen.
select is(
  (select public.claim_sms_delivery(
     p_organization_id => 'f0000000-0000-4000-8000-000000000001',
     p_scenario => 'rappel',
     p_recipient => '0612345678',
     p_dedup_key => 'sms:seg:clamp0',
     p_segments => 0)),
  true, 'un envoi annoncé à ZÉRO segment passe');
select is(
  (select segments from public.sms_log where dedup_key = 'sms:seg:clamp0'),
  1, 'et compte pour UN : le clamp bas remonte à 1');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  9, 'le solde perd exactement une unité (10 - 1)');

select is(
  (select public.claim_sms_delivery(
     p_organization_id => 'f0000000-0000-4000-8000-000000000001',
     p_scenario => 'rappel',
     p_recipient => '0612345678',
     p_dedup_key => 'sms:seg:clamp99',
     p_segments => 99)),
  true, 'un envoi annoncé à 99 segments passe');
select is(
  (select segments from public.sms_log where dedup_key = 'sms:seg:clamp99'),
  6, 'mais compte pour SIX : le clamp haut protège le solde d''un débit fou');
select is(
  (select balance_units from public.sms_credits
    where organization_id = 'f0000000-0000-4000-8000-000000000001'),
  3, 'le solde perd six unités, pas 99 (9 - 6)');

select is(
  (select public.claim_sms_delivery(
     p_organization_id => 'f0000000-0000-4000-8000-000000000001',
     p_scenario => 'rappel',
     p_recipient => '0612345678',
     p_dedup_key => 'sms:seg:clampnull',
     p_segments => null)),
  true, 'un `null` explicite passe aussi');
select is(
  (select segments from public.sms_log where dedup_key = 'sms:seg:clampnull'),
  1, 'et retombe sur le défaut de 1 — comme un appelant qui ne nomme pas le paramètre');

-- L'APPEL QUI IGNORE LE PARAMÈTRE, c'est-à-dire tout le code existant.
select is(
  (select public.claim_sms_delivery(
     'f0000000-0000-4000-8000-000000000001', 'rappel', '0612345678', 'sms:seg:defaut')),
  true, 'un appel POSITIONNEL à quatre arguments — la forme d''hier — reste valide');
select is(
  (select segments from public.sms_log where dedup_key = 'sms:seg:defaut'),
  1, 'et vaut un segment : l''ajout en queue ne change rien pour l''existant');

-- ══ 6. LA BORNE EXISTE AUSSI EN BASE ═══════════════════════
--
-- Le clamp de la fonction ne dit rien des chemins d'écriture futurs. Sans ce
-- CHECK, un `update` direct poserait 400 segments sur une ligne de journal et
-- personne ne s'en apercevrait.
select throws_ok(
  $$ update public.sms_log set segments = 7 where dedup_key = 'sms:seg:defaut' $$,
  '23514', null,
  'la colonne REFUSE 7 segments : la borne est une contrainte, pas seulement un clamp');
select throws_ok(
  $$ update public.sms_log set segments = 0 where dedup_key = 'sms:seg:defaut' $$,
  '23514', null,
  'et refuse 0 : un message qui ne coûte aucun segment n''existe pas');

-- ══ 7. UNE SEULE SURCHARGE, ET LES DROITS SURVIVENT AU DROP ═
--
-- `create or replace` ne peut pas ajouter un paramètre : sans le `drop`
-- explicite de la migration, la version à SIX paramètres cohabiterait et
-- resterait résolue pour tout appelant qui ne nomme pas `p_segments` — elle
-- débiterait 1, et le correctif serait livré sans aucun effet.
select is(
  (select count(*) from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_sms_delivery'),
  1::bigint,
  'il n''existe qu''UNE surcharge de claim_sms_delivery — celle à six paramètres, qui débitait 1, est retirée');

-- LE DROP EMPORTE LES PRIVILÈGES. Les oublier ne casse rien de visible à la
-- migration : c'est à l'exécution que le worker se ferait refuser l'appel, et
-- il traduirait ce refus en un envoi de plus qui ne part pas.
select ok(
  has_function_privilege('service_role',
    'public.claim_sms_delivery(uuid,text,text,text,integer,text,integer)', 'EXECUTE'),
  'le serveur peut toujours réserver un envoi après le drop/create');
select ok(
  not has_function_privilege('anon',
    'public.claim_sms_delivery(uuid,text,text,text,integer,text,integer)', 'EXECUTE'),
  'anon ne réserve pas d''envoi');
select ok(
  not has_function_privilege('authenticated',
    'public.claim_sms_delivery(uuid,text,text,text,integer,text,integer)', 'EXECUTE'),
  'un commerçant connecté non plus : la porte d''envoi est une affaire de serveur');

select * from finish();
rollback;
