-- ============================================================
-- 20260831120000 — écrire dans le Vault, sous les noms du REGISTRE
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LES DEUX NATURES DE REFUS (sections 3 et 8). C'est le cœur du lot.
--      Les refus MÉTIER ne lèvent pas : ils rendent un `status`. La raison
--      n'est PAS celle qu'une rédaction antérieure donnait ici — « une levée
--      ferait journaliser STATEMENT + DETAIL: parameters, donc le jeton ». Cet
--      argument est faux et mesuré comme tel : `log_min_error_statement`
--      gouverne le TEXTE de l'instruction, jamais ses VALEURS ;
--      `log_parameter_max_length_on_error` vaut 0, donc aucun paramètre lié
--      n'est journalisé, et PostgREST lie le corps en `$1`.
--      LA VRAIE RAISON, qui est plus solide : un refus PRÉVISIBLE (worker
--      inconnu, registre à moitié rempli) n'a rien à faire dans un journal
--      d'ERREUR, et ce choix ne dépend d'AUCUN réglage de journalisation —
--      il reste correct le jour où quelqu'un relève ce réglage. Défense en
--      profondeur, pas fuite colmatée : ne pas défaire le design en
--      découvrant que la fuite n'existait pas.
--      Chacun est vérifié en DEUX temps — `lives_ok` (il ne lève pas) puis
--      lecture du statut (il refuse bien, et pour la bonne raison). Un
--      `throws_ok` simplement retiré n'aurait prouvé que la moitié : une
--      fonction qui ACCEPTE en silence passe `lives_ok` tout aussi bien.
--      Le refus d'AUTORISATION, lui, LÈVE toujours (section 3e) : c'est un
--      événement de sécurité, et la trace au journal est ce qu'on veut.
--   2. LE CONTRE-CONTRÔLE (section 7). Poser deux secrets ne prouve rien en
--      soi ; ce qui compte est que le pg_cron `lastchance-jobs-worker` CESSE
--      d'être inerte. Sa garde — `count(*) = 2` sur deux noms — est donc
--      relue après l'écriture, et on vérifie en plus que les noms qu'elle
--      interroge sont bien ceux que le registre donne au worker `jobs`. Sans
--      ce dernier point, on aurait prouvé qu'on sait écrire dans le Vault,
--      pas qu'on sait réveiller la file : un renommage dans le registre
--      découplerait les deux en silence, et la cadence rapide resterait
--      éteinte alors que le back-office l'annoncerait armée.
--   3. LA PROPRIÉTÉ CENTRALE (section 5) : les noms écrits viennent du
--      registre, pas de l'appelant. Elle se démontre en deux temps — les noms
--      posés sont ceux du registre, ET aucune AUTRE entrée du Vault n'est
--      apparue. La seconde moitié est la vraie : c'est elle qui dit que CE
--      CHEMIN-CI ne mène pas à une case qu'on n'a pas désignée.
--      PORTÉE, ramenée à ce que la base tient : la propriété borne le chemin
--      EXPOSÉ PAR POSTGREST (`vault` n'est pas un schéma publié, `public`
--      l'est). Elle ne contraint PAS `service_role`, qui a déjà `execute` sur
--      `vault.create_secret`/`update_secret`, `select` sur
--      `vault.decrypted_secrets` et `BYPASSRLS` — réduction de surface, pas
--      confinement. Voir aussi la section 3e sur ce qui interdit RÉELLEMENT
--      l'accès.
--   4. L'ÉCRITURE PARTAGÉE EST DITE (section 5). `jobs` et `sync-contests`
--      partagent `sync_contests_secret` : armer l'un réécrit l'entrée de
--      l'autre. Le registre n'est pas changé — le fait est rendu LISIBLE.
--   5. LA REJOUABILITÉ (section 6). `vault.create_secret` LÈVE sur un nom
--      existant : sans la recherche d'id préalable, toute ROTATION du secret
--      échouerait — c'est-à-dire le geste le plus normal après une fuite.
--   6. LA VALEUR NE RESSORT JAMAIS (sections 2 et 6), Y COMPRIS SUR UN REFUS.
--      Trois angles : la FORME du retour est épinglée au catalogue (aucune
--      colonne ne peut être ajoutée en douce) ; un balayage cherche les
--      valeurs posées dans TOUTES les lignes rendues, refus compris ; et le
--      corps de la fonction est relu pour qu'aucun `sqlerrm` n'y entre
--      (section 9).
-- ============================================================
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()`
-- rend « aucun plan trouvé », indistinguable d'un succès.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

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
-- une colonne ajoutée demain — `url text` « pour vérifier ce qu'on a posé »,
-- ou `error_message text` « pour diagnostiquer » — ferait rougir ici, alors
-- qu'une assertion sur les seules valeurs actuelles ne la verrait pas.
select is(
  pg_get_function_result(
    'public.set_worker_vault_secrets(text,text,text)'::regprocedure),
  'TABLE(status text, written boolean, url_secret_name text, shared_secret_name text, url_created boolean, shared_created boolean, also_affects_workers text[], error_code text)',
  'le retour porte de quoi dire SI et POURQUOI, et aucune valeur');

-- ══ 3. Les refus MÉTIER rendent un statut et ne lèvent PAS ══
-- Deux assertions par refus, et les deux comptent :
--   `lives_ok`   → aucune exception, donc aucun événement ORDINAIRE inscrit au
--                  journal des erreurs, et ce indépendamment de tout réglage
--                  de journalisation (voir l'en-tête : la fuite de paramètres
--                  qu'on invoquait ici n'existe pas, la raison est ailleurs) ;
--   lecture du statut → le refus a bien EU LIEU. Sans elle, une fonction qui
--                  accepterait tout passerait le `lives_ok` sans broncher.

-- ── 3a. Worker absent du registre ───────────────────────────
select lives_ok(
  $$ select * from public.set_worker_vault_secrets(
       'worker-fantome', 'https://exemple.test/api/cron/jobs',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'un worker absent du registre NE LÈVE PAS : une exception imprimerait le jeton au journal');

create temporary table _refus_inconnu as
  select * from public.set_worker_vault_secrets(
    'worker-fantome', 'https://exemple.test/api/cron/jobs',
    'jeton-de-test-ne-doit-jamais-ressortir');

select results_eq(
  $$ select status, written, url_secret_name, shared_secret_name,
            also_affects_workers, error_code from _refus_inconnu $$,
  $$ values ('unknown_worker'::text, false, null::text, null::text,
             '{}'::text[], null::text) $$,
  'un worker absent du registre est REFUSÉ : le registre est la source de vérité');

-- ── 3b. Worker sans prérequis Vault ─────────────────────────
-- `purge-data` existe, mais c'est un cron quotidien : le registre ne lui
-- associe aucun nom de secret. Poser un secret pour lui inventerait une case
-- que rien ne lit.
select lives_ok(
  $$ select * from public.set_worker_vault_secrets(
       'purge-data', 'https://exemple.test/api/cron/purge-data',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'un worker sans prérequis Vault NE LÈVE PAS');

create temporary table _refus_sans_vault as
  select * from public.set_worker_vault_secrets(
    'purge-data', 'https://exemple.test/api/cron/purge-data',
    'jeton-de-test-ne-doit-jamais-ressortir');

select results_eq(
  $$ select status, written, url_secret_name, shared_secret_name,
            also_affects_workers, error_code from _refus_sans_vault $$,
  $$ values ('no_vault_secrets'::text, false, null::text, null::text,
             '{}'::text[], null::text) $$,
  'un worker sans nom de secret Vault dans le registre est REFUSÉ');

-- ── 3c. URL vide ────────────────────────────────────────────
-- Une valeur vide serait acceptée par le Vault et ferait PASSER la garde du
-- pg_cron : le job se réveillerait toutes les 5 minutes pour appeler une URL
-- vide, indéfiniment.
select lives_ok(
  $$ select * from public.set_worker_vault_secrets('jobs', '   ',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'une URL vide NE LÈVE PAS — et c''est l''appel qui porte le jeton en paramètre');

create temporary table _refus_url_vide as
  select * from public.set_worker_vault_secrets('jobs', '   ',
    'jeton-de-test-ne-doit-jamais-ressortir');

select results_eq(
  $$ select status, written, url_secret_name, shared_secret_name, error_code
       from _refus_url_vide $$,
  $$ values ('empty_value'::text, false, 'jobs_worker_url'::text,
             'sync_contests_secret'::text, null::text) $$,
  'une URL vide est REFUSÉE : elle armerait la garde du pg_cron sans rien armer du tout');

-- ── 3d. Jeton vide ──────────────────────────────────────────
-- L'autre moitié du même refus, et elle n'est pas décorative : un jeton vide
-- passerait la garde `count(*) = 2` et ferait appeler la route toutes les
-- 5 minutes pour s'y faire refuser, sans fin et sans cause visible.
select lives_ok(
  $$ select * from public.set_worker_vault_secrets(
       'jobs', 'https://exemple.test/api/cron/jobs', '  ') $$,
  'un jeton vide NE LÈVE PAS');

create temporary table _refus_jeton_vide as
  select * from public.set_worker_vault_secrets(
    'jobs', 'https://exemple.test/api/cron/jobs', '  ');

select results_eq(
  $$ select status, written from _refus_jeton_vide $$,
  $$ values ('empty_value'::text, false) $$,
  'un jeton vide est REFUSÉ, exactement comme une URL vide');

-- ── 3e. LE SEUL REFUS QUI DOIT LEVER ────────────────────────
-- Il lève PARCE QUE c'est un événement de sécurité : on veut la trace, et ce
-- chemin est inatteignable depuis l'appelant applicatif (`service_role` par
-- construction). Le taire pour économiser une ligne de journal effacerait la
-- seule preuve de la tentative.
-- ⚠ CE QUE CETTE ASSERTION NE PROUVE PAS : que le contrôle interne INTERDIT.
-- `auth.role()` lit le GUC `request.jwt.claims` — c'est d'ailleurs ce que la
-- ligne ci-dessous manipule pour se faire passer pour `authenticated`, et
-- n'importe quel rôle peut en faire autant dans sa propre session. Ce qui
-- interdit réellement est l'ACL, mesurée en section 1. Ce `raise` TRACE une
-- tentative ; il ne la bloque pas. Relâcher le `grant` en le jugeant suffisant
-- ouvrirait la fonction.
-- ROUGE SI : quelqu'un déplace le contrôle d'autorisation À L'INTÉRIEUR du
-- bloc `exception when others` — le refus deviendrait un `status` et
-- disparaîtrait des journaux.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.set_worker_vault_secrets(
       'jobs', 'https://exemple.test/api/cron/jobs',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'not authorized',
  'un appelant qui n''est pas service_role LÈVE toujours : la trace de sécurité est voulue');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ══ 4. PRÉMISSE — le pg_cron est inerte avant l'appel ═══════
-- Sans cette mesure, l'assertion du contre-contrôle (section 7) serait vraie
-- pour une raison qu'on ignore : peut-être les secrets existaient-ils déjà.
-- Elle vaut aussi pour la section 3 : les quatre refus ci-dessus n'ont RIEN
-- écrit, sans quoi ce compteur ne serait pas à zéro.
select is(
  (select count(*)::int from vault.decrypted_secrets v
    where v.name in ('jobs_worker_url', 'sync_contests_secret')),
  0,
  'PRÉMISSE — aucun des deux secrets n''existe : la garde du pg_cron est fausse, et aucun refus n''a écrit');

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
  $$ select status, written, url_secret_name, shared_secret_name,
            url_created, shared_created, error_code from _premier_appel $$,
  $$ values ('written'::text, true, 'jobs_worker_url'::text,
             'sync_contests_secret'::text, true, true, null::text) $$,
  'les noms écrits sont ceux que le REGISTRE donne au worker jobs, et les deux sont créés');

-- L'EFFET DE BORD SUR LE VOISIN, DIT ET NON DÉCOUVERT.
-- `jobs` et `sync-contests` portent le MÊME `vault_shared_secret` : armer
-- `jobs` réécrit l'entrée de `sync-contests`. C'est voulu (un seul
-- CRON_SECRET pour toutes les routes de cron) et bénin tant que la valeur est
-- la même ; ce qui le rendrait dangereux serait deux valeurs divergentes.
-- Le registre n'est pas changé — le retour rend le fait LISIBLE.
-- ROUGE SI : quelqu'un dissocie les deux entrées du registre sans que
-- l'appelant cesse d'annoncer le voisin, ou l'inverse.
select results_eq(
  $$ select also_affects_workers from _premier_appel $$,
  $$ values (array['sync-contests']::text[]) $$,
  'le retour NOMME le worker voisin dont l''entrée est réécrite par ce même geste');

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
  'AUCUNE autre entrée du Vault n''est apparue : par CE chemin, l''appelant ne choisit pas où il écrit');

-- ══ 6. Rejouable — le second appel MET À JOUR ═══════════════
create temporary table _second_appel as
  select * from public.set_worker_vault_secrets(
    'jobs',
    'https://exemple.test/api/cron/jobs?v=2',
    'jeton-pivote');

select results_eq(
  $$ select status, written, url_created, shared_created from _second_appel $$,
  $$ values ('written'::text, true, false, false) $$,
  'le second appel MET À JOUR au lieu de lever : une rotation de secret est possible');

select results_eq(
  $$ select v.name, v.decrypted_secret collate "default"
       from vault.decrypted_secrets v
      where v.name in ('jobs_worker_url', 'sync_contests_secret')
      order by v.name $$,
  $$ values ('jobs_worker_url'::text, 'https://exemple.test/api/cron/jobs?v=2'::text),
            ('sync_contests_secret'::text, 'jeton-pivote'::text) $$,
  'la mise à jour REMPLACE réellement les deux valeurs (sinon « rejouable » ne voudrait rien dire)');

-- BALAYAGE — volontairement grossier, et c'est sa raison d'être : plutôt que
-- d'inspecter les colonnes connues une par une, on sérialise CHAQUE LIGNE
-- rendue par la fonction — succès ET refus — et on y cherche les valeurs
-- posées. Une colonne ajoutée demain tombe dedans sans qu'on ait pensé à
-- l'ajouter ici. Les refus sont dans le lot exprès : un motif de refus
-- bavard (« url `https://…` invalide ») est le retour de la fuite par une
-- autre porte.
select is(
  (select count(*)::int from (
     select t::text as ligne from _premier_appel t
     union all select t::text from _second_appel t
     union all select t::text from _refus_inconnu t
     union all select t::text from _refus_sans_vault t
     union all select t::text from _refus_url_vide t
     union all select t::text from _refus_jeton_vide t
   ) tout
   where tout.ligne like '%exemple.test%'
      or tout.ligne like '%jeton-de-test%'
      or tout.ligne like '%jeton-pivote%'),
  0,
  'aucune valeur posée ne ressort de la fonction — ni l''URL, ni le jeton, refus compris');

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

-- ══ 8. Un registre incohérent est refusé, sans lever ════════
-- Sous un même nom, la seconde écriture écraserait la première et l'entrée
-- « URL » finirait par contenir le jeton Bearer, que `net.http_get` émettrait
-- alors comme URL. Le cas n'existe pas dans le registre d'aujourd'hui ; il est
-- fabriqué ici, et rollback avec le reste du fichier. Il vient EN DERNIER
-- parce qu'il modifie le registre que les sections 5 à 7 lisent.
update public.ops_worker_definitions
   set vault_shared_secret = vault_url_secret
 where worker = 'sync-contests';

select lives_ok(
  $$ select * from public.set_worker_vault_secrets(
       'sync-contests', 'https://exemple.test/api/cron/sync-contests',
       'jeton-de-test-ne-doit-jamais-ressortir') $$,
  'un registre incohérent NE LÈVE PAS');

select results_eq(
  $$ select status, written, url_secret_name, shared_secret_name, error_code
       from public.set_worker_vault_secrets(
         'sync-contests', 'https://exemple.test/api/cron/sync-contests',
         'jeton-de-test-ne-doit-jamais-ressortir') $$,
  $$ values ('registry_conflict'::text, false, 'sync_contests_url'::text,
             'sync_contests_url'::text, null::text) $$,
  'deux noms de secrets identiques dans le registre sont REFUSÉS : le jeton finirait dans l''URL');

-- ══ 9. LE CORPS LUI-MÊME, relu au catalogue ═════════════════
-- Trois assertions structurelles, et une raison précise pour chacune.
--
-- Pourquoi structurelles et non par exécution : le refus `vault_error` n'est
-- PAS atteignable depuis une session de test. Trois voies ont été tentées et
-- MESURÉES, toutes refusées — poser un trigger sur `vault.secrets` (« ERROR:
-- permission denied for table secrets » ; la table appartient à
-- `supabase_admin`), donner le rôle propriétaire de la fonction à un rôle
-- privé de Vault (la levée arrive alors dans `auth.role()`, en amont du bloc
-- gardé), et ouvrir le schéma `auth` à ce rôle (« WARNING: no privileges were
-- granted for "auth" » — `postgres` n'est pas superutilisateur ici). Le corps
-- est donc relu, faute de pouvoir le faire échouer.
select is(
  (select array_length(
            string_to_array(
              pg_get_functiondef(
                'public.set_worker_vault_secrets(text,text,text)'::regprocedure),
              'raise exception'), 1) - 1),
  1,
  'UN SEUL « raise exception » dans tout le corps : celui de l''autorisation. Chaque autre serait un chemin de fuite du jeton vers les journaux Postgres');

select ok(
  pg_get_functiondef(
    'public.set_worker_vault_secrets(text,text,text)'::regprocedure)
    not like '%sqlerrm%',
  'aucun sqlerrm : « value too long for type character varying(…) » RECOPIE la valeur du paramètre fautif, c''est-à-dire le jeton');

select ok(
  pg_get_functiondef(
    'public.set_worker_vault_secrets(text,text,text)'::regprocedure)
    like '%exception when others%vault_error%',
  'une panne INATTENDUE du Vault rend elle aussi un statut au lieu de lever');

select * from finish();
rollback;
