-- ============================================================
-- P0 lot 4 — UN PAIEMENT CRÉE UN OCTROI, ET LE REJEU N'EN CRÉE PAS DEUX
--
-- Ce que ce fichier doit prouver, dans l'ordre d'importance :
--
--   1. QUE LE REJEU N'OCTROIE PAS DEUX FOIS. C'est la raison d'être de la
--      migration. Stripe réessaie ses webhooks ; sans garde, le commerçant qui
--      paie une Chasse au trésor en reçoit deux — soixante jours pour trente
--      payés. L'erreur va dans le sens du client, donc personne ne la signale.
--   2. QUE LE REJEU NE REDATE PAS L'OCTROI. Plus subtil que le point 1 et tout
--      aussi coûteux : un `on conflict do update` aurait rendu `created =
--      false` tout en décalant la fenêtre de la durée écoulée depuis l'achat.
--      Le test compare donc les DATES, pas seulement le nombre de lignes.
--   3. QUE DEUX PAIEMENTS DISTINCTS OCTROIENT DEUX FOIS. Sans ce
--      contre-exemple, une fonction qui refuserait TOUT second octroi
--      passerait les points 1 et 2 — et le commerçant qui rachète son pass le
--      mois suivant ne recevrait rien.
--   4. QUE L'UNICITÉ NE DÉBORDE PAS SUR LE BACK-OFFICE. L'index est partiel ;
--      un index total aurait empêché deux octrois manuels sans référence de
--      coexister, pour fermer un trou qui ne les concerne pas.
--   5. QUE LA RÉFÉRENCE EST OBLIGATOIRE. Sans elle l'index partiel ne mord
--      pas : un octroi sans référence rendrait l'idempotence silencieusement
--      inopérante, ce qui est pire que pas d'idempotence du tout.
--
-- ── CE QUE CE FICHIER NE PEUT PAS PROUVER, ET C'EST ÉCRIT ICI ──
--
-- `supabase test db` s'exécute en tant que `postgres`, SUPERUTILISATEUR : les
-- GRANTS ne le contraignent pas et la RLS ne s'applique pas. La fermeture de la
-- fonction à `authenticated` est donc éprouvée par `has_function_privilege` —
-- qui interroge le catalogue — et jamais par une tentative d'appel. Confondre
-- les deux ferait croire à une preuve de fermeture là où il n'y en a aucune.
--
-- Même remarque pour la garde `auth.role() = 'service_role'` : sous
-- `postgres`, `auth.role()` est null, donc la fonction LÈVE. Les appels
-- nominaux ci-dessous posent donc la revendication de rôle à la main, comme le
-- fait PostgREST. C'est la seule façon d'atteindre le corps.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Instant de référence unique : toutes les fenêtres sont posées relativement à
-- lui, jamais à now(), pour que le fichier ne devienne pas intermittent selon
-- la durée de sa propre exécution.
create temporary table t0 (v timestamptz);
insert into t0 values (timestamptz '2026-06-15 12:00:00+00');

create temporary table ids (nom text primary key, id uuid);
insert into ids values
  ('acheteuse', '77770000-0000-4000-8000-000000000001'),
  ('voisine',   '77770000-0000-4000-8000-000000000002');

insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
select i.id, 'Lot4 ' || i.nom, 'lot4-' || i.nom, 'canceled',
       (select v from t0) + interval '30 days'
from ids i;

-- ────────────────────────────────────────────────────────────
-- 0. La porte est FERMÉE — lu dans le catalogue, jamais par un appel
-- ────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated',
    'public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)',
    'EXECUTE'),
  'grant_module_from_payment n''est pas exposée à authenticated');

select ok(
  not has_function_privilege('anon',
    'public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)',
    'EXECUTE'),
  'grant_module_from_payment n''est pas exposée à anon');

select ok(
  has_function_privilege('service_role',
    'public.grant_module_from_payment(uuid, text, text, text, timestamptz, timestamptz, timestamptz, integer, uuid)',
    'EXECUTE'),
  'grant_module_from_payment est exposée à service_role');

-- L'index qui PORTE l'idempotence. Sans lui, la fonction se réduirait à un
-- `insert` suivi d'une relecture, et deux livraisons simultanées du même
-- événement traverseraient toutes les deux la fenêtre entre les deux.
select ok(
  exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'organization_module_grants_stripe_ref_idx'
  ),
  'l''index unique partiel qui porte l''idempotence existe');

-- ────────────────────────────────────────────────────────────
-- Revendication de rôle, comme PostgREST la pose
-- ────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"role":"service_role"}';

-- ────────────────────────────────────────────────────────────
-- 1. Un paiement crée un octroi vivant, et le module s'ouvre
-- ────────────────────────────────────────────────────────────

select ok(
  (select created from public.grant_module_from_payment(
     (select id from ids where nom = 'acheteuse'),
     'hunts', 'pass', 'cs_test_chasse_001',
     (select v from t0),
     (select v from t0) + interval '30 days',
     null, null, null)),
  'un premier paiement CRÉE l''octroi (created = true)');

select ok(
  public.org_has_module_access(
    (select id from ids where nom = 'acheteuse'), 'hunts', (select v from t0)),
  'la Chasse au trésor achetée seule est ouverte, sans abonnement');

-- Le contre-exemple du droit : sans lui, un octroi trop généreux passerait
-- l'assertion précédente en ouvrant tout le catalogue.
select ok(
  not public.org_has_module_access(
    (select id from ids where nom = 'acheteuse'), 'quiz', (select v from t0)),
  'le paiement n''ouvre QUE le module payé');

-- ────────────────────────────────────────────────────────────
-- 2. LE REJEU — le point central de ce fichier
-- ────────────────────────────────────────────────────────────

select ok(
  not (select created from public.grant_module_from_payment(
     (select id from ids where nom = 'acheteuse'),
     'hunts', 'pass', 'cs_test_chasse_001',
     (select v from t0) + interval '3 days',
     (select v from t0) + interval '33 days',
     null, null, null)),
  'le rejeu du MÊME paiement rend created = false');

select is(
  (select count(*)::int from public.organization_module_grants
    where organization_id = (select id from ids where nom = 'acheteuse')
      and source_reference = 'cs_test_chasse_001'),
  1,
  'le rejeu n''a pas créé de second octroi');

-- LE POINT QUE LE SEUL COMPTAGE NE PROUVE PAS. Le rejeu ci-dessus a été envoyé
-- avec une fenêtre décalée de trois jours, exactement comme le ferait un
-- webhook rejoué trois jours plus tard. Un `on conflict do update` aurait rendu
-- created = false ET redaté l'octroi : le compte serait resté à 1, et le
-- commerçant aurait gagné trois jours qu'il n'a pas payés — ou perdu ceux qu'il
-- avait, selon le sens du décalage.
select is(
  (select ends_at from public.organization_module_grants
    where organization_id = (select id from ids where nom = 'acheteuse')
      and source_reference = 'cs_test_chasse_001'),
  (select v from t0) + interval '30 days',
  'le rejeu n''a PAS redaté l''octroi : les termes de l''achat sont gelés');

-- ────────────────────────────────────────────────────────────
-- 3. Le contre-exemple : deux paiements distincts octroient deux fois
-- ────────────────────────────────────────────────────────────

select ok(
  (select created from public.grant_module_from_payment(
     (select id from ids where nom = 'acheteuse'),
     'hunts', 'pass', 'cs_test_chasse_002',
     (select v from t0) + interval '40 days',
     (select v from t0) + interval '70 days',
     null, null, null)),
  'un SECOND paiement, référence différente, crée bien un second octroi');

-- Sans cette assertion, une fonction qui refuserait tout second octroi
-- passerait la section 2 — et le commerçant qui rachète son pass le mois
-- suivant ne recevrait rien, en silence.
select is(
  (select count(*)::int from public.organization_module_grants
    where organization_id = (select id from ids where nom = 'acheteuse')),
  2,
  'deux paiements distincts = deux octrois');

-- La même référence chez une AUTRE organisation n'est pas un rejeu : l'index
-- porte sur le couple (organisation, référence).
select ok(
  (select created from public.grant_module_from_payment(
     (select id from ids where nom = 'voisine'),
     'hunts', 'pass', 'cs_test_chasse_001',
     (select v from t0),
     (select v from t0) + interval '30 days',
     null, null, null)),
  'la même référence chez une autre organisation crée son propre octroi');

-- ────────────────────────────────────────────────────────────
-- 4. Ce que la fonction REFUSE
-- ────────────────────────────────────────────────────────────

select throws_ok(
  format($$select public.grant_module_from_payment(%L::uuid, 'hunts', 'pass', '   ')$$,
         (select id from ids where nom = 'acheteuse')),
  '22023',
  null,
  'une référence de paiement vide est refusée : sans elle l''index ne mord pas');

select throws_ok(
  format($$select public.grant_module_from_payment(%L::uuid, 'hunts', 'pass', null)$$,
         (select id from ids where nom = 'acheteuse')),
  '22023',
  null,
  'une référence de paiement absente est refusée');

-- Le vocabulaire de la table reste le juge du module : la fonction ne le
-- redéclare pas, elle laisse le `check` de la colonne trancher.
select throws_ok(
  format($$select public.grant_module_from_payment(%L::uuid, 'inconnu', 'pass', 'cs_x')$$,
         (select id from ids where nom = 'acheteuse')),
  '23514',
  null,
  'un module hors vocabulaire est refusé par le check de la table');

-- ────────────────────────────────────────────────────────────
-- 5. L'unicité ne déborde PAS sur le back-office
-- ────────────────────────────────────────────────────────────

insert into public.organization_module_grants
  (organization_id, module, kind, source, source_reference, starts_at)
values
  ((select id from ids where nom = 'voisine'), 'quiz', 'pass', 'backoffice', null, (select v from t0)),
  ((select id from ids where nom = 'voisine'), 'quiz', 'pass', 'backoffice', null, (select v from t0));

select is(
  (select count(*)::int from public.organization_module_grants
    where organization_id = (select id from ids where nom = 'voisine')
      and source = 'backoffice'),
  2,
  'deux octrois de back-office sans référence coexistent : l''index est PARTIEL');

-- ────────────────────────────────────────────────────────────
-- 6. La porte d'autorisation LÈVE, contrairement à celle du rejeu
-- ────────────────────────────────────────────────────────────

set local request.jwt.claims = '{"role":"authenticated"}';

select throws_ok(
  format($$select public.grant_module_from_payment(%L::uuid, 'quiz', 'pass', 'cs_test_intrus')$$,
         (select id from ids where nom = 'acheteuse')),
  '42501',
  null,
  'un appelant non service_role LÈVE : c''est un événement de sécurité, il doit laisser une trace');

select is(
  (select count(*)::int from public.organization_module_grants
    where source_reference = 'cs_test_intrus'),
  0,
  'et il n''a rien écrit');

select * from finish();
rollback;
