-- ============================================================
-- 20260831120000 — écrire dans le Vault, sous les noms du REGISTRE
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE CONTRE-CONTRÔLE (section 7). Poser deux secrets ne prouve rien en
--      soi ; ce qui compte est que le pg_cron `lastchance-jobs-worker` CESSE
--      d'être inerte. Sa garde — `count(*) = 2` sur deux noms — est donc
--      relue après l'écriture, et on vérifie en plus que les noms qu'elle
--      interroge sont bien ceux que le registre donne au worker `jobs`. Sans
--      ce dernier point, on aurait prouvé qu'on sait écrire dans le Vault,
--      pas qu'on sait réveiller la file : un renommage dans le registre
--      découplerait les deux en silence, et la cadence rapide resterait
--      éteinte alors que le back-office l'annoncerait armée.
--   2. LA PROPRIÉTÉ CENTRALE (section 5) : les noms écrits viennent du
--      registre, pas de l'appelant. Elle se démontre en deux temps — les noms
--      posés sont ceux du registre, ET aucune AUTRE entrée du Vault n'est
--      apparue. La seconde moitié est la vraie : c'est elle qui dit qu'un
--      appelant ne peut pas atteindre une case qu'on ne lui a pas désignée.
--   3. LA REJOUABILITÉ (section 6). `vault.create_secret` LÈVE sur un nom
--      existant : sans la recherche d'id préalable, toute ROTATION du secret
--      échouerait — c'est-à-dire le geste le plus normal après une fuite.
--   4. LA VALEUR NE RESSORT JAMAIS (sections 2 et 6). Deux angles
--      complémentaires : la FORME du retour est épinglée au catalogue (aucune
--      colonne ne peut être ajoutée en douce), et les valeurs réellement
--      rendues sont comparées aux deux valeurs posées.
--   5. Les quatre refus (section 3) et l'ACL (section 1).
-- ============================================================
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()`
-- rend « aucun plan trouvé », indistinguable d'un succès.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Les deux valeurs de test. Elles sont ici en clair parce qu'elles sont
-- fabriquées pour ce fichier ; leur seul rôle est de pouvoir être CHERCHÉES
-- dans ce que la fonction rend.
--   URL    : https://exemple.test/api/cron/jobs
--   jeton  : jeton-de-test-ne-doit-jamais-ressortir

-- L'état du Vault AVANT tout appel, pour pouvoir affirmer plus loin qu'aucune
-- entrée autre que les deux attendues n'est apparue. Une base de CI l'a vide,
-- mais on ne veut pas que la preuve DÉPENDE de ça.
create temporary table _vault_avant as select s.name from vault.secrets s;

-- ══ 1. ACL — la fonction n'est joignable que par le serveur ══
select ok(
  has_function_privilege('service_role',
    'public.set_worker_vault_secrets(text,text,text)', 'EXECUTE'),
  'le serveur peut armer la cadence rapide');

select ok(
  not has_function_privilege('authenticated',
    'public.set_worker_vault_secrets(text,text,text)', 'EXECUTE'),
  'un commerçant connecté ne peut pas écrire dans le Vault');

select ok(
  not has_function_privilege('anon',
    'public.set_worker_vault_secrets(text,text,text)', 'EXECUTE'),
  'anon ne peut pas écrire dans le Vault');

-- ══ 2. La FORME du retour est épinglée ══════════════════════
-- Épingler la forme au catalogue plutôt que de relire les valeurs rendues :
-- une colonne ajoutée demain — `url text` « pour vérifier ce qu'on a posé » —
-- ferait rougir ici, alors qu'une assertion sur les seules valeurs actuelles
-- ne la verrait pas.
select is(
  pg_get_function_result(
    'public.set_worker_vault_secrets(text,text,text)'::regprocedure),
  'TABLE(url_secret_name text, shared_secret_name text, url_created boolean, shared_created boolean)',
  'le retour ne peut PAS porter de valeur : deux noms et deux booléens, rien d''autre');

-- ══ 3. Les quatre refus ═════════════════════════════════════
select throws_ok(
  $$ select * from public.set_worker_vault_secrets(
       'worker-fantome', 'https://exemple.test/api/cron/jobs',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'P0001', null,
  'un worker absent du registre est REFUSÉ : le registre est la source de vérité');

-- `purge-data` existe, mais c'est un cron quotidien : le registre ne lui
-- associe aucun nom de secret. Poser un secret pour lui inventerait une case
-- que rien ne lit.
select throws_ok(
  $$ select * from public.set_worker_vault_secrets(
       'purge-data', 'https://exemple.test/api/cron/purge-data',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'P0001', null,
  'un worker sans nom de secret Vault dans le registre est REFUSÉ');

-- Une valeur vide serait acceptée par le Vault et ferait PASSER la garde du
-- pg_cron : le job se réveillerait toutes les 5 minutes pour appeler une URL
-- vide, indéfiniment.
select throws_ok(
  $$ select * from public.set_worker_vault_secrets('jobs', '   ',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'P0001', null,
  'une URL vide est REFUSÉE : elle armerait la garde du pg_cron sans rien armer du tout');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.set_worker_vault_secrets(
       'jobs', 'https://exemple.test/api/cron/jobs',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'not authorized',
  'un appelant qui n''est pas service_role ne peut pas écrire dans le Vault');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ══ 4. PRÉMISSE — le pg_cron est inerte avant l'appel ═══════
-- Sans cette mesure, l'assertion du contre-contrôle (section 7) serait vraie
-- pour une raison qu'on ignore : peut-être les secrets existaient-ils déjà.
select is(
  (select count(*)::int from vault.decrypted_secrets v
    where v.name in ('jobs_worker_url', 'sync_contests_secret')),
  0,
  'PRÉMISSE — aucun des deux secrets n''existe : la garde du pg_cron est fausse');

-- ══ 5. L'écriture pose les deux secrets, sous les noms du REGISTRE ══
-- L'appel est matérialisé une fois pour toutes : le rejouer changerait
-- `url_created`, et une assertion qui exécute deux fois son SQL mesurerait
-- alors autre chose que ce qu'elle annonce.
create temporary table _premier_appel as
  select * from public.set_worker_vault_secrets(
    'jobs',
    'https://exemple.test/api/cron/jobs',
    'jeton-de-test-ne-doit-jamais-ressortir');

select results_eq(
  $$ select url_secret_name, shared_secret_name, url_created, shared_created
       from _premier_appel $$,
  $$ values ('jobs_worker_url'::text, 'sync_contests_secret'::text, true, true) $$,
  'les noms écrits sont ceux que le REGISTRE donne au worker jobs, et les deux sont créés');

-- `collate "default"` n'est pas décoratif : `decrypted_secret` est déchiffré
-- depuis du `bytea`, donc sa collation est INDÉTERMINÉE, et la comparaison de
-- lignes de `results_eq` échoue dessus (« could not determine which collation
-- to use »). Mesuré au premier passage, pas anticipé.
select results_eq(
  $$ select v.name, v.decrypted_secret collate "default"
       from vault.decrypted_secrets v
      where v.name in ('jobs_worker_url', 'sync_contests_secret')
      order by v.name $$,
  $$ values ('jobs_worker_url'::text, 'https://exemple.test/api/cron/jobs'::text),
            ('sync_contests_secret'::text, 'jeton-de-test-ne-doit-jamais-ressortir'::text) $$,
  'chaque valeur atterrit dans la case que le registre lui désigne, et pas dans l''autre');

-- LA MOITIÉ QUI COMPTE : rien d'autre n'a bougé. L'appelant a fourni deux
-- VALEURS et un nom de worker ; il n'a eu aucune prise sur la destination.
select is(
  (select coalesce(string_agg(s.name, ',' order by s.name), '')
     from vault.secrets s
    where not exists (select 1 from _vault_avant a where a.name = s.name)),
  'jobs_worker_url,sync_contests_secret',
  'AUCUNE autre entrée du Vault n''est apparue : l''appelant ne choisit pas où il écrit');

-- ══ 6. Rejouable — le second appel MET À JOUR ═══════════════
create temporary table _second_appel as
  select * from public.set_worker_vault_secrets(
    'jobs',
    'https://exemple.test/api/cron/jobs?v=2',
    'jeton-pivote');

select results_eq(
  $$ select url_created, shared_created from _second_appel $$,
  $$ values (false, false) $$,
  'le second appel MET À JOUR au lieu de lever : une rotation de secret est possible');

select results_eq(
  $$ select v.name, v.decrypted_secret collate "default"
       from vault.decrypted_secrets v
      where v.name in ('jobs_worker_url', 'sync_contests_secret')
      order by v.name $$,
  $$ values ('jobs_worker_url'::text, 'https://exemple.test/api/cron/jobs?v=2'::text),
            ('sync_contests_secret'::text, 'jeton-pivote'::text) $$,
  'la mise à jour REMPLACE réellement les deux valeurs (sinon « rejouable » ne voudrait rien dire)');

-- La forme est épinglée en section 2 ; ici on relit les valeurs réellement
-- rendues et on y cherche ce qui ne doit jamais en sortir.
select is(
  (select count(*)::int
     from (select url_secret_name as v from _premier_appel
           union all select shared_secret_name from _premier_appel
           union all select url_secret_name from _second_appel
           union all select shared_secret_name from _second_appel) rendu
    where rendu.v in ('https://exemple.test/api/cron/jobs',
                      'https://exemple.test/api/cron/jobs?v=2',
                      'jeton-de-test-ne-doit-jamais-ressortir',
                      'jeton-pivote')),
  0,
  'aucune valeur posée ne ressort de la fonction — ni l''URL, ni le jeton');

-- ══ 7. CONTRE-CONTRÔLE — le pg_cron cesse d'être inerte ═════
select ok(
  (select j.active from cron.job j where j.jobname = 'lastchance-jobs-worker'),
  'le pg_cron lastchance-jobs-worker existe et est ACTIF : seule sa garde Vault le retenait');

-- Le maillon qu'on oublierait sans le nommer : la garde du job et le registre
-- doivent parler des MÊMES noms. Renommer `vault_url_secret` dans le registre
-- sans toucher au job laisserait l'écriture réussir et le job inerte.
select ok(
  (select j.command like '%' || d.vault_url_secret || '%'
      and j.command like '%' || d.vault_shared_secret || '%'
     from cron.job j
     cross join public.ops_worker_definitions d
    where j.jobname = 'lastchance-jobs-worker'
      and d.worker = 'jobs'),
  'la garde du pg_cron interroge EXACTEMENT les deux noms que le registre donne au worker jobs');

select is(
  (select count(*)::int from vault.decrypted_secrets v
    where v.name in (
      select d.vault_url_secret from public.ops_worker_definitions d where d.worker = 'jobs'
      union all
      select d.vault_shared_secret from public.ops_worker_definitions d where d.worker = 'jobs'
    )),
  2,
  'CONTRE-CONTRÔLE — la garde « count(*) = 2 » du pg_cron est désormais VRAIE : la file passe de 1×/jour à toutes les 5 min');

-- ══ 8. Un registre incohérent est refusé ════════════════════
-- Sous un même nom, la seconde écriture écraserait la première et l'entrée
-- « URL » finirait par contenir le jeton Bearer, que `net.http_get` émettrait
-- alors comme URL. Le cas n'existe pas dans le registre d'aujourd'hui ; il est
-- fabriqué ici, et rollback avec le reste du fichier.
update public.ops_worker_definitions
   set vault_shared_secret = vault_url_secret
 where worker = 'sync-contests';

select throws_ok(
  $$ select * from public.set_worker_vault_secrets(
       'sync-contests', 'https://exemple.test/api/cron/sync-contests',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'P0001', null,
  'deux noms de secrets identiques dans le registre sont REFUSÉS : le jeton finirait dans l''URL');

select * from finish();
rollback;
