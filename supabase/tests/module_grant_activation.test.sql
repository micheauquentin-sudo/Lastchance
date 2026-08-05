-- ============================================================
-- P0 lot 4 (suite) — UN OCTROI ACHETÉ PEUT ENFIN DÉMARRER
--
-- Ce que ce fichier doit prouver, dans l'ordre d'importance :
--
--   1. QU'UN OCTROI D'UNE AUTRE ORGANISATION NE DÉMARRE PAS. C'est la seule
--      assertion dont l'échec coûterait un incident multi-tenant : un
--      identifiant d'octroi qui traîne dans un journal ouvrirait le module d'un
--      autre commerçant. Le cloisonnement est dans le `where` de la fonction et
--      non dans un contrôle après coup, pour qu'un identifiant volé ne DÉSIGNE
--      rien plutôt que d'être lu puis refusé.
--   2. QUE LE REJEU NE REDATE PAS LA FENÊTRE. Un double clic ou un retour
--      arrière rendrait sinon au commerçant une durée plus longue que celle
--      qu'il a payée — l'erreur va dans le sens du client, donc personne ne la
--      signale. Le trigger de gel du lot 2 le refuse déjà ; ce test vérifie
--      qu'on rend un VERDICT et non une exception, l'appelant étant un écran.
--   3. QU'UN PASS DONT LA FENÊTRE D'ACTIVATION EST PASSÉE NE DÉMARRE PLUS.
--      « Activable dans les 90 jours » (30 pour la Soirée en jeu) est une
--      promesse commerciale : la tenir seulement à l'écran la laisserait
--      contournable par un POST direct.
--   4. QUE LA PORTE `service_role` EST FERMÉE. Vérifiée en lisant le CATALOGUE
--      (`pg_proc` + les privilèges), jamais par une tentative d'appel : sous
--      `postgres`, `auth.role()` est null donc la fonction lève de toute façon,
--      et confondre les deux ferait croire à une preuve de fermeture là où il
--      n'y en a aucune.
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
  ('acheteuse', '78880000-0000-4000-8000-000000000001'),
  ('voisine',   '78880000-0000-4000-8000-000000000002');

insert into public.organizations (id, name, slug, subscription_status, trial_ends_at)
select i.id, 'Act ' || i.nom, 'act-' || i.nom, 'canceled',
       (select v from t0) + interval '30 days'
from ids i;

-- ────────────────────────────────────────────────────────────
-- 0. La porte est FERMÉE — lu dans le catalogue, jamais par un appel
-- ────────────────────────────────────────────────────────────
select is(
  (select prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'activate_module_grant'),
  true,
  'activate_module_grant est security definer'
);

select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'activate_module_grant'
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))),
  0,
  'ni anon ni authenticated ne peuvent exécuter activate_module_grant'
);

-- La revendication de rôle est posée à la main, comme le fait PostgREST :
-- c'est la seule façon d'atteindre le corps de la fonction.
set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ────────────────────────────────────────────────────────────
-- 1. Un pass acheté et non démarré n'ouvre rien
-- ────────────────────────────────────────────────────────────
insert into public.organization_module_grants
  (id, organization_id, module, kind, source, source_reference, activate_by)
select '78880000-0000-4000-8000-0000000000a1',
       (select id from ids where nom = 'acheteuse'),
       'hunts', 'pass', 'stripe', 'cs_test_activation',
       (select v from t0) + interval '90 days';

select is(
  (select state from public.org_module_grant_state(
     (select id from ids where nom = 'acheteuse'), 'hunts', (select v from t0))),
  'pending',
  'un octroi acheté et non démarré est pending'
);

select is(
  public.org_has_live_module_grant(
    (select id from ids where nom = 'acheteuse'), 'hunts', (select v from t0)),
  false,
  'et il n''ouvre PAS le module — c''est le défaut que ce lot ferme'
);

-- ────────────────────────────────────────────────────────────
-- 2. LE CLOISONNEMENT — l'assertion la plus coûteuse du fichier
-- ────────────────────────────────────────────────────────────
select is(
  (select state from public.activate_module_grant(
     (select id from ids where nom = 'voisine'),
     '78880000-0000-4000-8000-0000000000a1',
     (select v from t0),
     (select v from t0) + interval '30 days')),
  'introuvable',
  'une AUTRE organisation ne peut pas démarrer cet octroi'
);

select is(
  (select starts_at from public.organization_module_grants
    where id = '78880000-0000-4000-8000-0000000000a1'),
  null::timestamptz,
  'et la tentative n''a rien écrit'
);

-- ────────────────────────────────────────────────────────────
-- 3. Le démarrage nominal
-- ────────────────────────────────────────────────────────────
select is(
  (select activated from public.activate_module_grant(
     (select id from ids where nom = 'acheteuse'),
     '78880000-0000-4000-8000-0000000000a1',
     (select v from t0),
     (select v from t0) + interval '30 days')),
  true,
  'le propriétaire de l''octroi le démarre'
);

select is(
  public.org_has_live_module_grant(
    (select id from ids where nom = 'acheteuse'), 'hunts',
    (select v from t0) + interval '1 day'),
  true,
  'le module est ouvert le lendemain du démarrage'
);

select is(
  public.org_has_live_module_grant(
    (select id from ids where nom = 'acheteuse'), 'hunts',
    (select v from t0) + interval '31 days'),
  false,
  'et refermé après les 30 jours payés — la durée du catalogue est TENUE'
);

-- ────────────────────────────────────────────────────────────
-- 4. LE REJEU NE REDATE PAS
-- ────────────────────────────────────────────────────────────
select is(
  (select state from public.activate_module_grant(
     (select id from ids where nom = 'acheteuse'),
     '78880000-0000-4000-8000-0000000000a1',
     (select v from t0) + interval '20 days',
     (select v from t0) + interval '50 days')),
  'deja_demarre',
  'un second démarrage rend un VERDICT, pas une exception'
);

select is(
  (select starts_at from public.organization_module_grants
    where id = '78880000-0000-4000-8000-0000000000a1'),
  (select v from t0),
  'et la date de début n''a pas bougé'
);

select is(
  public.org_has_live_module_grant(
    (select id from ids where nom = 'acheteuse'), 'hunts',
    (select v from t0) + interval '31 days'),
  false,
  'donc le rejeu n''a pas rallongé la fenêtre payée'
);

-- ────────────────────────────────────────────────────────────
-- 5. La fenêtre d'activation est une garde, pas un affichage
-- ────────────────────────────────────────────────────────────
insert into public.organization_module_grants
  (id, organization_id, module, kind, source, source_reference, activate_by)
select '78880000-0000-4000-8000-0000000000a2',
       (select id from ids where nom = 'acheteuse'),
       'quiz', 'pass', 'stripe', 'cs_test_perime',
       (select v from t0) + interval '90 days';

select is(
  (select state from public.activate_module_grant(
     (select id from ids where nom = 'acheteuse'),
     '78880000-0000-4000-8000-0000000000a2',
     (select v from t0) + interval '91 days',
     (select v from t0) + interval '98 days',
     (select v from t0) + interval '91 days')),
  'activation_expired',
  'passé la fenêtre, le pass ne démarre plus'
);

-- ────────────────────────────────────────────────────────────
-- 6. Un octroi révoqué ne redémarre pas
-- ────────────────────────────────────────────────────────────
update public.organization_module_grants
   set revoked_at = (select v from t0)
 where id = '78880000-0000-4000-8000-0000000000a2';

select is(
  (select state from public.activate_module_grant(
     (select id from ids where nom = 'acheteuse'),
     '78880000-0000-4000-8000-0000000000a2',
     (select v from t0),
     (select v from t0) + interval '7 days')),
  'revoked',
  'un octroi révoqué ne peut pas être démarré'
);

-- ────────────────────────────────────────────────────────────
-- 7. UN PASS SANS FIN EST REFUSÉ — la seule erreur qui donne PLUS que payé
--
-- Trouvé en revue de sécurité : la contrainte `grant_fin_apres_debut` autorise
-- `ends_at is null` (c'est le cas normal d'un `recurring`), donc rien en base
-- n'aurait rattrapé un pass démarré sans terme. Et un pass sans terme n'ouvre
-- pas trop peu : il ouvre POUR TOUJOURS, la pause étant dérivée d'une échéance.
-- ────────────────────────────────────────────────────────────
insert into public.organization_module_grants
  (id, organization_id, module, kind, source, source_reference, activate_by)
select '78880000-0000-4000-8000-0000000000a3',
       (select id from ids where nom = 'acheteuse'),
       'jackpot', 'pass', 'stripe', 'cs_test_sans_fin',
       (select v from t0) + interval '90 days';

select throws_ok(
  format(
    'select public.activate_module_grant(%L::uuid, %L::uuid, %L::timestamptz, null)',
    (select id from ids where nom = 'acheteuse'),
    '78880000-0000-4000-8000-0000000000a3',
    (select v from t0)
  ),
  '22023',
  'activate_module_grant: un pass exige une fin',
  'un pass démarré sans date de fin est REFUSÉ'
);

select is(
  (select starts_at from public.organization_module_grants
    where id = '78880000-0000-4000-8000-0000000000a3'),
  null::timestamptz,
  'et le refus n''a rien écrit'
);

select * from finish();
rollback;
