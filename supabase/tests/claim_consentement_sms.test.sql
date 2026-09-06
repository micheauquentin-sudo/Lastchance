-- ============================================================
-- LE CONSENTEMENT SMS VIT ET MEURT AVEC LE GAIN (SMS-C1)
--
-- Écrit APRÈS le commit de `claim_winning_spin`, le consentement se perdait
-- avec toute invocation serverless expirée entre les deux : le rejeu ne le
-- réémet pas (`replayExistingClaim` ne fait qu'une lecture) et l'envoi
-- ultérieur refuse EN SILENCE faute de le trouver. Pas un message perdu — le
-- CANAL perdu, définitivement, pour ce couple (commerce, numéro).
--
-- Quatre propriétés portent le correctif, et ce fichier ne teste qu'elles.
--
--   1. IL EST ÉCRIT. Un claim portant le drapeau d'opt-in laisse un
--      consentement daté, versionné, à la source `play`.
--   2. IL EST ÉCRIT DANS LA MÊME TRANSACTION. Un `raise` postérieur au claim
--      annule LES DEUX — la participation et le consentement. C'est
--      l'assertion centrale : elle est ce qui distingue « on l'écrit un peu
--      plus tôt » de « on l'écrit atomiquement ».
--   3. IL NE COÛTE JAMAIS SON LOT AU GAGNANT. `record_sms_consent` lève sur un
--      numéro retiré (un STOP) ; le savepoint annule le consentement SEUL, la
--      participation survit, et l'échec laisse une TRACE — le silence était la
--      moitié du défaut d'origine.
--   4. LA CAMPAGNE DÉCIDE ENCORE. Sans `collect_phone`, aucun consentement,
--      quoi que l'appelant transmette — la normalisation de 20261209120000
--      gouverne aussi ce nouveau site.
--
-- LA CONTRE-ÉPREUVE DU DÉFAUT `false` est le dernier bloc : l'appel à SIX
-- arguments, celui de `src/actions/play.ts` aujourd'hui, doit continuer de
-- résoudre ET n'écrire aucun consentement. Sans elle, on ne saurait pas si la
-- migration est sûre à appliquer avant le changement d'appelant.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug)
values ('5c000000-0000-4000-8000-000000000001', 'Test Consentement SMS',
        'tap-consentement-sms');

-- A : la campagne collecte le TÉLÉPHONE. C'est la seule qui peut ouvrir un
-- canal SMS.
insert into public.campaigns
  (id, organization_id, name, status, collect_email, collect_phone)
values ('5c000000-0000-4000-8000-000000000002',
        '5c000000-0000-4000-8000-000000000001', 'Campagne avec téléphone',
        'active', false, true);

-- B : elle collecte l'e-mail et PAS le téléphone. Le joueur n'y a jamais vu de
-- champ « numéro », donc jamais de case « recevez le code par SMS ».
insert into public.campaigns
  (id, organization_id, name, status, collect_email, collect_phone)
values ('5c000000-0000-4000-8000-000000000012',
        '5c000000-0000-4000-8000-000000000001', 'Campagne sans téléphone',
        'active', true, false);

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values
  ('5c000000-0000-4000-8000-000000000003', '5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000002', 'Roue téléphone', 'unlimited'),
  ('5c000000-0000-4000-8000-000000000013', '5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000012', 'Roue e-mail', 'unlimited');

insert into public.prizes (id, organization_id, wheel_id, label)
values
  ('5c000000-0000-4000-8000-000000000004', '5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000003', 'Un café offert'),
  ('5c000000-0000-4000-8000-000000000014', '5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000013', 'Un dessert offert');

-- Cinq spins gagnants, un par scénario : un claim consomme son spin, et les
-- réutiliser rendrait chaque assertion dépendante de l'ordre des précédentes.
insert into public.spins
  (id, organization_id, campaign_id, wheel_id, prize_id, is_losing, player_key)
values
  ('5c000000-0000-4000-8000-000000000101', '5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000003',
   '5c000000-0000-4000-8000-000000000004', false, repeat('1', 64)),
  ('5c000000-0000-4000-8000-000000000102', '5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000003',
   '5c000000-0000-4000-8000-000000000004', false, repeat('2', 64)),
  ('5c000000-0000-4000-8000-000000000104', '5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000003',
   '5c000000-0000-4000-8000-000000000004', false, repeat('4', 64)),
  ('5c000000-0000-4000-8000-000000000105', '5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000003',
   '5c000000-0000-4000-8000-000000000004', false, repeat('5', 64)),
  ('5c000000-0000-4000-8000-000000000103', '5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000012', '5c000000-0000-4000-8000-000000000013',
   '5c000000-0000-4000-8000-000000000014', false, repeat('3', 64));

-- ══ 1. LE CONSENTEMENT EST ÉCRIT ════════════════════════════

select lives_ok(
  $q$select * from public.claim_winning_spin(
      '5c000000-0000-4000-8000-000000000101',
      'Zoé', null, '0612345601', true, false, true)$q$,
  'SMS-1 le gain est réclamé, drapeau d''opt-in SMS levé'
);

-- `phone_key` est GÉNÉRÉE par `sms_phone_e164(phone, 'FR')` : on compare donc
-- à cette fonction et jamais à la saisie brute, sinon « 0612345601 » et
-- « +33612345601 » seraient deux lignes différentes dans l'assertion.
select results_eq(
  $q$select consent_version, consent_source, revoked_at
       from public.sms_consents
      where organization_id = '5c000000-0000-4000-8000-000000000001'
        and phone_key = public.sms_phone_e164('0612345601', 'FR')$q$,
  $q$values ('sms.v1', 'play', null::timestamptz)$q$,
  'SMS-2 LE CONSENTEMENT EXISTE, versionné `sms.v1` et daté à la source `play` — mot pour mot ce qu''écrivait le chemin applicatif'
);

-- ══ 2. LA MÊME TRANSACTION — L'ASSERTION CENTRALE ═══════════
--
-- Le bloc `begin … exception` de plpgsql ouvre un SAVEPOINT : le `raise` posé
-- APRÈS le claim annule tout ce que le bloc a écrit, exactement comme le ferait
-- l'échec d'une invocation. Le constat est fait AVANT le raise et ressort par
-- une variable — les écritures sont annulées, pas les variables — puis il est
-- posé dans une table temporaire depuis le bloc EXTÉRIEUR, où il survit.
--
-- Sans le constat intérieur, les deux assertions « à zéro » ci-dessous seraient
-- vertes sur une fonction qui n'écrit RIEN : c'est le vert-pour-la-mauvaise-
-- raison habituel, et c'est ce que cette table temporaire ferme.

create temporary table t_atomicite (constat text) on commit drop;

do $atomicite$
declare
  v_constat text;
begin
  begin
    perform public.claim_winning_spin(
      '5c000000-0000-4000-8000-000000000102',
      'Yann', null, '0612345602', true, false, true);

    select 'participation=' || (
             select pg_catalog.count(*) from public.participations
              where spin_id = '5c000000-0000-4000-8000-000000000102')
        || ' consentement=' || (
             select pg_catalog.count(*) from public.sms_consents
              where organization_id = '5c000000-0000-4000-8000-000000000001'
                and phone_key = public.sms_phone_e164('0612345602', 'FR'))
      into v_constat;

    -- LA PANNE SIMULÉE : l'invocation meurt ici, après le claim.
    raise exception using message = v_constat;
  exception when others then
    -- `when others` et non `raise_exception` : si le claim lui-même échouait,
    -- son message remonterait ici et l'assertion le montrerait, au lieu de
    -- masquer la vraie panne derrière un filtre trop précis.
    v_constat := SQLERRM;
  end;
  insert into t_atomicite values (v_constat);
end
$atomicite$;

select is(
  (select constat from t_atomicite),
  'participation=1 consentement=1',
  'SMS-3 avant la panne, LES DEUX lignes existent — la participation et le consentement'
);

select is(
  (select count(*)::int from public.participations
    where spin_id = '5c000000-0000-4000-8000-000000000102'),
  0,
  'SMS-4 après la panne, la participation a disparu'
);

select is(
  (select count(*)::int from public.sms_consents
    where organization_id = '5c000000-0000-4000-8000-000000000001'
      and phone_key = public.sms_phone_e164('0612345602', 'FR')),
  0,
  'SMS-5 … ET LE CONSENTEMENT AUSSI : un seul `raise` emporte les deux, donc ils sont bien dans LA MÊME transaction'
);

-- ══ 3. UN CONSENTEMENT IMPOSSIBLE NE COÛTE PAS LE LOT ═══════
--
-- Le cas réel : ce numéro a envoyé STOP il y a trois mois.
-- `record_sms_consent` REFUSE de le réactiver sans `p_renew` — et elle a
-- raison, rejouer un STOP par une case cochée serait la faute grave. Ce que le
-- correctif doit garantir, c'est que ce refus reste local : sans le savepoint,
-- il ferait échouer toute la transaction et le gagnant perdrait son lot pour
-- un STOP qu'il n'a peut-être même pas envoyé lui-même.

insert into public.sms_consents
  (organization_id, phone, consented_at, consent_version, consent_source,
   revoked_at, revoked_reason)
values
  ('5c000000-0000-4000-8000-000000000001', '0612345604',
   now() - interval '90 days', 'sms.v1', 'play',
   now() - interval '30 days', 'STOP');

select lives_ok(
  $q$select * from public.claim_winning_spin(
      '5c000000-0000-4000-8000-000000000104',
      'Wanda', null, '0612345604', true, false, true)$q$,
  'SMS-6 LE GAIN SURVIT à un consentement impossible à écrire'
);

select is(
  (select count(*)::int from public.participations
    where spin_id = '5c000000-0000-4000-8000-000000000104'),
  1,
  'SMS-7 … la participation est bien là'
);

select ok(
  (select revoked_at is not null from public.sms_consents
    where organization_id = '5c000000-0000-4000-8000-000000000001'
      and phone_key = public.sms_phone_e164('0612345604', 'FR')),
  'SMS-8 … et le STOP n''a PAS été rejoué : le numéro reste retiré'
);

select is(
  (select count(*)::int from public.audit_logs
    where organization_id = '5c000000-0000-4000-8000-000000000001'
      and action = 'sms.consent.failed'),
  1,
  'SMS-9 … l''échec laisse une TRACE : le silence était la moitié du défaut d''origine'
);

select ok(
  not exists(
    select 1 from public.audit_logs
     where organization_id = '5c000000-0000-4000-8000-000000000001'
       and action = 'sms.consent.failed'
       and (metadata ? 'phone' or metadata::text like '%0612345604%')
  ),
  'SMS-10 … et cette trace ne recopie PAS le numéro : un journal n''est pas un fichier client'
);

-- ══ 4. LA CAMPAGNE DÉCIDE ENCORE (LE PIÈGE DU LOT) ══════════
--
-- L'appelant transmet un numéro ET le drapeau d'opt-in sur une campagne qui ne
-- déclare pas collecter le téléphone. 20261209120000 ramène `p_phone` à null ;
-- le drapeau doit suivre. C'est ISO-COMPORTEMENT avec le chemin applicatif
-- d'aujourd'hui, qui garde déjà l'écriture derrière
-- `if (collectPhone && parsed.data.phone)` (`src/actions/play.ts:836`).

select lives_ok(
  $q$select * from public.claim_winning_spin(
      '5c000000-0000-4000-8000-000000000103',
      'Xavier', 'xavier@tap.local', '0612345603', true, false, true)$q$,
  'SMS-11 le gain d''une campagne sans collecte de téléphone est réclamé'
);

select is(
  (select count(*)::int from public.sms_consents
    where organization_id = '5c000000-0000-4000-8000-000000000001'
      and phone_key = public.sms_phone_e164('0612345603', 'FR')),
  0,
  'SMS-12 AUCUN consentement : la campagne ne collecte pas le téléphone, le drapeau de l''appelant ne vaut rien'
);

select is(
  (select phone from public.participations
    where spin_id = '5c000000-0000-4000-8000-000000000103'),
  null,
  'SMS-13 … et la participation ne garde pas le numéro non plus (20261209120000, inchangé)'
);

-- ══ 5. LE DÉFAUT `false` — SÛRETÉ D'APPLICATION ═════════════
--
-- L'appel à SIX arguments est celui que `src/actions/play.ts` fait
-- aujourd'hui. Il doit continuer de résoudre — sinon la migration casse la
-- production à l'instant où elle s'applique — et n'écrire aucun consentement,
-- sinon elle en écrirait sans que personne n'ait coché.

select lives_ok(
  $q$select * from public.claim_winning_spin(
      '5c000000-0000-4000-8000-000000000105',
      'Victor', null, '0612345605', true, false)$q$,
  'SMS-14 L''APPEL À SIX ARGUMENTS RÉSOUT ENCORE : la migration est sûre à appliquer avant le changement d''appelant'
);

select is(
  (select count(*)::int from public.sms_consents
    where organization_id = '5c000000-0000-4000-8000-000000000001'
      and phone_key = public.sms_phone_e164('0612345605', 'FR')),
  0,
  'SMS-15 … et sans drapeau, aucun consentement — il ne s''en écrit jamais par défaut'
);

select * from finish();
rollback;
