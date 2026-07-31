-- ============================================================
-- Droits Stripe : source de vérité, ordre, idempotence et isolation.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.organizations (
  id, name, slug, stripe_customer_id, addon_pronostics
) values (
  'e1700000-0000-4000-8000-000000000001',
  'Entitlements A',
  'tap-entitlements-a',
  'cus_entitlements_a',
  true
);

insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at
) values (
  'e1700000-0000-4000-8000-0000000000a1',
  'authenticated',
  'authenticated',
  'owner@entitlements.test',
  '',
  now(),
  now()
);
insert into public.organization_members (organization_id, user_id, role)
values (
  'e1700000-0000-4000-8000-000000000001',
  'e1700000-0000-4000-8000-0000000000a1',
  'owner'
);
insert into public.organization_entitlements (
  organization_id, entitlement, source, active, source_reference
) values (
  'e1700000-0000-4000-8000-000000000001',
  'pronostics',
  'legacy',
  true,
  'test_projection'
);

-- Contexte d'appel du serveur pour toute la section qui suit. Sans lui,
-- org_effective_entitlements rend son verdict légitime — « not authorized » —
-- et tue la suite : auth.role() est nul, auth.uid() aussi, donc ni service
-- role ni membre. La section « authenticated » plus bas repose ce contexte
-- pour elle-même ; ce claim ne doit pas y fuir, sous peine de court-circuiter
-- la garde qu'elle teste.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(
  not has_table_privilege(
    'authenticated', 'public.organization_entitlements', 'SELECT'
  ),
  'les détails Stripe ne sont pas lisibles directement par les membres'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.apply_stripe_subscription_event_v2(text,timestamptz,text,text,timestamptz,text,text,text[],text[])',
    'EXECUTE'
  ),
  'le serveur peut synchroniser les droits'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.apply_stripe_subscription_event_v2(text,timestamptz,text,text,timestamptz,text,text,text[],text[])',
    'EXECUTE'
  ),
  'un membre ne peut pas s accorder de droits'
);

-- Avant le premier snapshot Stripe, la reprise des booléens protège la bêta.
select results_eq(
  $$select entitlement from public.org_effective_entitlements(
    'e1700000-0000-4000-8000-000000000001'
  )$$,
  $$values ('pronostics'::text)$$,
  'le droit legacy existant reste actif avant synchronisation'
);

create temporary table tap_entitlement_sync on commit drop as
select * from public.apply_stripe_subscription_event_v2(
  'evt_entitlements_1',
  '2026-07-25T12:00:00Z',
  'cus_entitlements_a',
  'active',
  null,
  'sub_entitlements_a',
  'live',
  array['core', 'events', 'jackpot'],
  array['price_live']
);

select is((select applied from tap_entitlement_sync), true,
  'la photographie Stripe est appliquée');
select is(
  (select plan from public.organizations
    where id = 'e1700000-0000-4000-8000-000000000001'),
  'live',
  'le plan canonique est synchronisé'
);
select is(
  (select addon_events from public.organizations
    where id = 'e1700000-0000-4000-8000-000000000001'),
  true,
  'la projection events suit Stripe'
);
select is(
  (select addon_pronostics from public.organizations
    where id = 'e1700000-0000-4000-8000-000000000001'),
  false,
  'un ancien booléen manuel ne survit pas au snapshot Stripe'
);
select results_eq(
  $$select entitlement from public.org_effective_entitlements(
    'e1700000-0000-4000-8000-000000000001'
  )$$,
  $$values ('core'::text), ('events'::text), ('jackpot'::text)$$,
  'le snapshot Stripe masque complètement la reprise legacy'
);

select is(
  (select duplicate from public.apply_stripe_subscription_event_v2(
    'evt_entitlements_1',
    '2026-07-25T12:00:00Z',
    'cus_entitlements_a',
    'active',
    null,
    'sub_entitlements_a',
    'full',
    array['core', 'loyalty'],
    array['price_full']
  )),
  true,
  'une relivraison est idempotente'
);
select is(
  (select plan from public.organizations
    where id = 'e1700000-0000-4000-8000-000000000001'),
  'live',
  'la relivraison ne réécrit pas les droits'
);

select is(
  (select applied from public.apply_stripe_subscription_event_v2(
    'evt_entitlements_old',
    '2026-07-25T11:00:00Z',
    'cus_entitlements_a',
    'active',
    null,
    'sub_entitlements_a',
    'full',
    array['core', 'loyalty'],
    array['price_full']
  )),
  false,
  'un événement antérieur est acquitté sans être appliqué'
);
select is(
  (select plan from public.organizations
    where id = 'e1700000-0000-4000-8000-000000000001'),
  'live',
  'un événement plus ancien ne remplace pas le snapshot'
);

-- ── L'AUTORITÉ DE STRIPE, TANT QU'IL GOUVERNE ──────────────────────────
--
-- Ces deux assertions vivaient APRÈS la résiliation, plus bas. Elles ont été
-- REMONTÉES ici, sur l'abonnement `active`, et n'ont pas été supprimées :
-- la propriété qu'elles protègent est « Stripe fait autorité TANT QU'IL
-- GOUVERNE », et un abonnement résilié ne gouverne plus rien. Leur miroir
-- (le back-office reprend la main) est posé à l'endroit qu'elles quittent, et
-- la frontière `past_due` est vérifiée juste après. Migration
-- 20260818120000, qui porte le raisonnement complet.
--
-- ROUGE SI : le trigger cesse de mordre alors qu'un abonnement Stripe est
-- vivant — le back-office pourrait alors ouvrir un module non payé, qui
-- resterait ouvert jusqu'au prochain événement Stripe.
set local role service_role;
select throws_ok(
  -- `addon_pronostics` et non `addon_events`, à dessein : le trigger ne lève
  -- que sur `is distinct from`, et le snapshot `live` a DÉJÀ posé
  -- `addon_events = true`. Écrire `set addon_events = true` ici serait un
  -- no-op qui ne déclenche rien et rendrait un rouge inexplicable. Viser un
  -- module que Stripe n'a PAS accordé est de surcroît l'abus exact que la
  -- garde existe pour empêcher : ouvrir à la main un accès non payé.
  $$update public.organizations
       set addon_pronostics = true
     where id = 'e1700000-0000-4000-8000-000000000001'$$,
  '42501',
  'entitlements are managed by Stripe',
  'même la service role ne contourne pas le snapshot par une projection directe'
);
select throws_ok(
  $$update public.organizations
       set plan = 'full'
     where id = 'e1700000-0000-4000-8000-000000000001'$$,
  '42501',
  'entitlements are managed by Stripe',
  'le plan Stripe ne peut pas être remplacé par le back-office'
);
reset role;
select is(
  (select addon_pronostics from public.organizations
    where id = 'e1700000-0000-4000-8000-000000000001'),
  false,
  'le module refusé n a pas été écrit malgré la tentative'
);
select is(
  (select plan from public.organizations
    where id = 'e1700000-0000-4000-8000-000000000001'),
  'live',
  'le plan refusé n a pas été écrit malgré la tentative'
);

select is(
  (select applied from public.apply_stripe_subscription_event_v2(
    'evt_entitlements_cancel',
    '2026-07-25T13:00:00Z',
    'cus_entitlements_a',
    'canceled',
    null,
    'sub_entitlements_a',
    'live',
    array['core', 'events', 'jackpot'],
    array['price_live']
  )),
  true,
  'la résiliation la plus récente est appliquée'
);
select is(
  (select count(*) from public.org_effective_entitlements(
    'e1700000-0000-4000-8000-000000000001'
  )),
  0::bigint,
  'une résiliation désactive les droits sans réactiver le legacy'
);

-- ── LE MIROIR : RÉSILIÉ, LE BACK-OFFICE REPREND LA MAIN ────────────────
--
-- Exactement les deux instructions qui levaient ici avant la migration
-- 20260818120000, au même point de l'histoire — elles aboutissent désormais.
-- Une résiliation repose les neuf droits avec `active = false` ; plus aucun
-- abonnement ne gouverne, donc le back-office peut à nouveau accorder un accès
-- offert à un client parti (partenaire, compensation, presse, reconquête).
--
-- ROUGE SI : le `and e.active` du trigger disparaît — l'organisation resterait
-- « pilotée par Stripe » à vie et aucun geste commercial ne serait possible.
set local role service_role;
select lives_ok(
  $$update public.organizations
       set addon_events = true
     where id = 'e1700000-0000-4000-8000-000000000001'$$,
  'après résiliation, le back-office peut rouvrir un module'
);
select lives_ok(
  $$update public.organizations
       set plan = 'full'
     where id = 'e1700000-0000-4000-8000-000000000001'$$,
  'après résiliation, le back-office peut reposer un plan'
);
reset role;
-- `lives_ok` ne prouve que l'absence d'exception. Un trigger `before` qui
-- renverrait `null` au lieu de `new` annulerait la ligne EN SILENCE et les
-- deux assertions ci-dessus resteraient vertes sur une base qui n'a rien
-- écrit. On relit donc la valeur.
select is(
  (select addon_events from public.organizations
    where id = 'e1700000-0000-4000-8000-000000000001'),
  true,
  'le module rouvert par le back-office est réellement écrit'
);
select is(
  (select plan from public.organizations
    where id = 'e1700000-0000-4000-8000-000000000001'),
  'full',
  'le plan reposé par le back-office est réellement écrit'
);

-- ── LA FRONTIÈRE : UN IMPAYÉ N'EST PAS UNE RÉSILIATION ─────────────────
--
-- `v_access_active` est VRAI pour `trialing`, `active` ET `past_due`
-- (20260805170000:231) : un impayé repose donc les droits avec
-- `active = true`. C'est la limite la plus facile à casser par accident en
-- relisant le correctif — un `and e.active` mal placé, ou déplacé vers un test
-- sur le seul `subscription_status`, rendrait la main au back-office pendant
-- le délai de grâce alors que Stripe relance encore la carte.
--
-- ROUGE SI : la garde se met à confondre « impayé » et « résilié ».
select is(
  (select applied from public.apply_stripe_subscription_event_v2(
    'evt_entitlements_past_due',
    '2026-07-25T14:00:00Z',
    'cus_entitlements_a',
    'past_due',
    null,
    'sub_entitlements_a',
    'live',
    array['core', 'events', 'jackpot'],
    array['price_live']
  )),
  true,
  'un impayé postérieur reprend la main sur le snapshot'
);
select is(
  (select count(*) from public.org_effective_entitlements(
    'e1700000-0000-4000-8000-000000000001'
  )),
  3::bigint,
  'un impayé laisse les droits actifs, contrairement à une résiliation'
);
set local role service_role;
select throws_ok(
  $$update public.organizations
       set addon_pronostics = true
     where id = 'e1700000-0000-4000-8000-000000000001'$$,
  '42501',
  'entitlements are managed by Stripe',
  'impayé : Stripe gouverne encore, aucun module ne s ouvre à la main'
);
select throws_ok(
  $$update public.organizations
       set plan = 'starter'
     where id = 'e1700000-0000-4000-8000-000000000001'$$,
  '42501',
  'entitlements are managed by Stripe',
  'impayé : le plan reste celui de Stripe'
);
reset role;

-- Bascule vers le vrai chemin membre. Le claim est RÉÉCRIT en entier, pas
-- complété : laisser `{"role":"service_role"}` en place ferait court-circuiter
-- la garde par sa première branche, et les deux assertions ci-dessous
-- passeraient sans rien prouver de l'appartenance.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e1700000-0000-4000-8000-0000000000a1"}',
  true
);
-- Trois et non zéro depuis la section « impayé » ci-dessus : l'organisation
-- n'est plus laissée résiliée en fin de scénario. Le chiffre y gagne — lire
-- zéro ligne ne prouvait pas grand-chose de « le propriétaire peut lire ses
-- droits », un membre non autorisé lisant zéro ligne tout autant.
select is(
  (select count(*) from public.org_effective_entitlements(
    'e1700000-0000-4000-8000-000000000001'
  )),
  3::bigint,
  'le propriétaire peut lire ses droits effectifs via la RPC bornée'
);
select throws_ok(
  $$select * from public.org_effective_entitlements(
    'e1700000-0000-4000-8000-000000000099'
  )$$,
  'P0001',
  'not authorized',
  'un membre ne peut pas sonder une autre organisation'
);

-- Verrou de la découverte : un appelant SANS contexte est refusé. Toute la
-- première section de cette suite s'exécutait exactement dans cet état et ne
-- le prouvait pas — l'appel mourait avant d'atteindre le verdict. On garde le
-- rôle Postgres `authenticated` pour que l'EXECUTE passe : ce qu'on teste ici
-- est la garde interne, pas le GRANT (déjà couvert plus haut).
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select * from public.org_effective_entitlements(
    'e1700000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'not authorized',
  'sans rôle de service ni appartenance, la lecture des droits est refusée'
);
reset role;

select finish();
rollback;
