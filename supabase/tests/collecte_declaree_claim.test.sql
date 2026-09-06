-- ============================================================
-- CE QUE LA CAMPAGNE NE COLLECTE PAS N'ENTRE PAS, ET NE SORT PAS
--
-- `claim_winning_spin` reçoit un e-mail et un opt-in du joueur ; la campagne
-- déclare, par `collect_email`, si elle a le droit de les garder. L'insert dans
-- `participations` respectait cette déclaration ; l'abonnement newsletter et le
-- webhook `newsletter.subscriber.created` la lisaient en BRUT — une campagne
-- sans collecte gagnait donc des abonnés, et l'adresse partait en clair vers
-- l'URL du commerçant (corrigé par 20261209120000).
--
-- Ce fichier tient trois propriétés, et la troisième est ce qui rend les deux
-- premières probantes :
--
--   1. SANS COLLECTE, RIEN N'EST ÉCRIT : ni abonné, ni webhook newsletter, et
--      la participation ne garde ni l'adresse ni l'opt-in.
--   2. SANS COLLECTE, RIEN NE SORT : le webhook `participation.claimed` — qui
--      part quand même, il porte le lot — ne contient PAS l'adresse.
--   3. AVEC COLLECTE, TOUT PASSE. Sans cette contre-épreuve, les assertions
--      ci-dessus resteraient vertes sur une fonction qui n'abonne plus
--      personne, ce qui serait une régression et non un correctif.
--
-- Le webhook n'est observable que si le commerce a une `webhook_url` : la
-- fixture en pose une, sinon les deux assertions de webhook seraient vertes
-- pour la mauvaise raison.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, webhook_url)
values ('cf000000-0000-4000-8000-000000000001', 'Test Collecte',
        'tap-collecte-declaree', 'https://exemple.test/hook');

-- SANS COLLECTE : aucune case à cocher n'a été montrée au joueur.
insert into public.campaigns
  (id, organization_id, name, status, collect_email, collect_phone)
values ('cf000000-0000-4000-8000-000000000002',
        'cf000000-0000-4000-8000-000000000001', 'Campagne sans collecte',
        'active', false, false);

-- AVEC COLLECTE : la contre-épreuve.
insert into public.campaigns
  (id, organization_id, name, status, collect_email, collect_phone)
values ('cf000000-0000-4000-8000-000000000012',
        'cf000000-0000-4000-8000-000000000001', 'Campagne avec collecte',
        'active', true, false);

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values
  ('cf000000-0000-4000-8000-000000000003', 'cf000000-0000-4000-8000-000000000001',
   'cf000000-0000-4000-8000-000000000002', 'Roue sans collecte', 'unlimited'),
  ('cf000000-0000-4000-8000-000000000013', 'cf000000-0000-4000-8000-000000000001',
   'cf000000-0000-4000-8000-000000000012', 'Roue avec collecte', 'unlimited');

insert into public.prizes (id, organization_id, wheel_id, label)
values
  ('cf000000-0000-4000-8000-000000000004', 'cf000000-0000-4000-8000-000000000001',
   'cf000000-0000-4000-8000-000000000003', 'Un café offert'),
  ('cf000000-0000-4000-8000-000000000014', 'cf000000-0000-4000-8000-000000000001',
   'cf000000-0000-4000-8000-000000000013', 'Un dessert offert');

insert into public.spins
  (id, organization_id, campaign_id, wheel_id, prize_id, is_losing, player_key)
values
  ('cf000000-0000-4000-8000-000000000005', 'cf000000-0000-4000-8000-000000000001',
   'cf000000-0000-4000-8000-000000000002', 'cf000000-0000-4000-8000-000000000003',
   'cf000000-0000-4000-8000-000000000004', false, repeat('5', 64)),
  ('cf000000-0000-4000-8000-000000000015', 'cf000000-0000-4000-8000-000000000001',
   'cf000000-0000-4000-8000-000000000012', 'cf000000-0000-4000-8000-000000000013',
   'cf000000-0000-4000-8000-000000000014', false, repeat('6', 64));

-- ══ 1. SANS COLLECTE : L'APPELANT INSISTE, LA RPC REFUSE DE GARDER ══
--
-- L'appel porte TOUT ce qu'un appelant négligent peut porter : un prénom, une
-- adresse, un consentement et un opt-in marketing. `claimSchema`
-- (`src/lib/validations/play.ts`) accepte ces champs sans condition et
-- `src/actions/play.ts` les transmet tels quels — la RPC est le dernier filtre.

select lives_ok(
  $q$select * from public.claim_winning_spin(
      'cf000000-0000-4000-8000-000000000005',
      'Zoé', 'zoe@tap.local', null, true, true)$q$,
  'COLLECTE-1 le gain est réclamé : refuser la collecte ne casse pas le retrait du lot'
);

select is(
  (select count(*)::int from public.newsletter_subscribers
    where organization_id = 'cf000000-0000-4000-8000-000000000001'),
  0,
  'COLLECTE-2 AUCUN abonné newsletter : la campagne ne collecte pas l''e-mail, l''opt-in de l''appelant ne vaut rien'
);

select is(
  (select count(*)::int from public.webhook_deliveries
    where organization_id = 'cf000000-0000-4000-8000-000000000001'
      and event = 'newsletter.subscriber.created'),
  0,
  'COLLECTE-3 AUCUN webhook newsletter : l''adresse ne part pas en clair vers l''URL du commerçant'
);

-- La participation, elle, est écrite — c'est le lot du joueur — mais vidée des
-- champs non collectés. Ce comportement précédait le correctif (les `case` de
-- l'insert) ; l'assertion garde qu'il n'a pas bougé en le déplaçant en tête.
select results_eq(
  $q$select first_name, email, phone, accepted_terms, marketing_opt_in
      from public.participations
     where spin_id = 'cf000000-0000-4000-8000-000000000005'$q$,
  $q$values (null::text, null::text, null::text, false, false)$q$,
  'COLLECTE-4 la participation ne garde NI prénom, NI adresse, NI opt-in — l''insert écrit exactement ce qu''il écrivait avant'
);

-- Le webhook du gain part quand même : il porte le lot et le code de retrait,
-- que le commerçant doit recevoir. Ce qu'il ne doit pas porter, c'est l'adresse.
select is(
  (select count(*)::int from public.webhook_deliveries
    where organization_id = 'cf000000-0000-4000-8000-000000000001'
      and event = 'participation.claimed'),
  1,
  'COLLECTE-5 le webhook du gain part : le commerçant apprend le lot à remettre'
);

select ok(
  not exists(
    select 1 from public.webhook_deliveries
     where organization_id = 'cf000000-0000-4000-8000-000000000001'
       and event = 'participation.claimed'
       and (data ? 'email' or data ? 'first_name')
  ),
  'COLLECTE-6 … et il ne porte NI adresse NI prénom'
);

-- ══ 2. AVEC COLLECTE : LA CONTRE-ÉPREUVE ════════════════════
--
-- SANS CE BLOC, LES SIX ASSERTIONS CI-DESSUS PASSERAIENT SUR UNE FONCTION QUI
-- N'ABONNE PLUS PERSONNE. C'est la seule chose qui distingue le correctif d'une
-- régression, et c'est pour ça qu'elle est ici et non dans un autre fichier.

select lives_ok(
  $q$select * from public.claim_winning_spin(
      'cf000000-0000-4000-8000-000000000015',
      'Yann', 'yann@tap.local', null, true, true)$q$,
  'COLLECTE-7 le gain d''une campagne qui collecte est réclamé'
);

select results_eq(
  $q$select email, source from public.newsletter_subscribers
     where organization_id = 'cf000000-0000-4000-8000-000000000001'$q$,
  $q$values ('yann@tap.local', 'claim')$q$,
  'COLLECTE-8 L''ABONNÉ EST CRÉÉ quand la campagne collecte : le correctif n''a pas coupé le chemin légitime'
);

select is(
  (select data ->> 'email' from public.webhook_deliveries
    where organization_id = 'cf000000-0000-4000-8000-000000000001'
      and event = 'newsletter.subscriber.created'),
  'yann@tap.local',
  'COLLECTE-9 … et le webhook newsletter part, avec l''adresse que le joueur a bien accepté de donner'
);

select results_eq(
  $q$select email, marketing_opt_in from public.participations
     where spin_id = 'cf000000-0000-4000-8000-000000000015'$q$,
  $q$values ('yann@tap.local', true)$q$,
  'COLLECTE-10 … et la participation garde l''adresse et l''opt-in'
);

select * from finish();
rollback;
