-- ============================================================
-- P0 lot 2 — L'OCTROI DATÉ ET LE DROIT CORE
--
-- Ce que ce fichier doit prouver, dans l'ordre d'importance :
--
--   1. QU'UN ADD-ON ACHETÉ SEUL SUFFIT. C'est la décision produit du cahier
--      (§2) que le schéma ne pouvait pas représenter : avant ce lot,
--      `org_has_module_access` exigeait `org_has_active_access`, donc un
--      ABONNEMENT. Un commerçant n'ayant acheté que la Chasse au trésor se
--      voyait refuser la Chasse au trésor.
--   2. QU'IL NE DÉVERROUILLE QUE LUI. « Sans déverrouiller les autres
--      modules » (§2). Sans cette assertion, un droit core trop généreux
--      passerait le point 1 en offrant tout le catalogue.
--   3. QUE L'ÉCHÉANCE COUPE. C'est la « mise en pause » du cahier, et elle est
--      DÉRIVÉE : aucun cron ne bascule de statut. L'assertion doit donc porter
--      sur le verdict de la garde à un instant donné, pas sur une colonne.
--   4. QUE LA PAUSE NE DÉTRUIT RIEN. « Les données et exports restent
--      lisibles » : la ligne d'octroi expirée est toujours là et dit POURQUOI.
--   5. LA NON-RÉGRESSION. Un abonné avec addon garde exactement le
--      comportement d'avant ce lot. Sans ce contrôle, « ça refuse » ne
--      prouverait rien qu'un refus inconditionnel ne prouverait aussi.
--
-- ── CE QUE CE FICHIER NE PEUT PAS PROUVER, ET C'EST ÉCRIT ICI ──
--
-- `supabase test db` s'exécute en tant que `postgres`, SUPERUTILISATEUR : les
-- GRANTS ne le contraignent pas et la RLS ne s'applique pas. Une écriture
-- réussie depuis ce fichier ne prouve donc RIEN sur ce qu'un porteur de JWT
-- pourrait faire. La fermeture de la table est donc éprouvée par
-- `has_table_privilege` — qui interroge le catalogue — et jamais par une
-- tentative d'écriture. Confondre les deux ferait croire à une preuve de
-- fermeture là où il n'y en a aucune (même piège que publication_guards).
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Instant de référence unique : toutes les fenêtres sont posées relativement
-- à lui, jamais à now(), pour que le fichier ne devienne pas intermittent
-- selon la durée de son propre exécution.
create temporary table t0 (v timestamptz);
insert into t0 values (timestamptz '2026-06-15 12:00:00+00');

create temporary table ids (nom text primary key, id uuid);
insert into ids values
  ('seule',    '11110000-0000-4000-8000-000000000001'),
  ('echue',    '22220000-0000-4000-8000-000000000002'),
  ('jamais',   '33330000-0000-4000-8000-000000000003'),
  ('abonnee',  '44440000-0000-4000-8000-000000000004'),
  ('revoquee', '55550000-0000-4000-8000-000000000005');

insert into public.organizations (id, name, slug, subscription_status, trial_ends_at, addon_hunts)
select i.id, 'Lot2 ' || i.nom, 'lot2-' || i.nom,
       case when i.nom = 'abonnee' then 'active' else 'canceled' end,
       (select v from t0) + interval '30 days',
       i.nom = 'abonnee'
from ids i;

-- ────────────────────────────────────────────────────────────
-- 1. La table est FERMÉE — lu dans le catalogue, jamais par une écriture
-- ────────────────────────────────────────────────────────────

select has_table('public', 'organization_module_grants', 'la table des octrois existe');

select is(
  (select relrowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'organization_module_grants'),
  true,
  'RLS activée sur organization_module_grants'
);

-- La table DÉCIDE de ce qui est payé : un éditeur qui pourrait y écrire
-- repousserait sa propre échéance par un PATCH PostgREST. C'est la même
-- classe de trou que le lot 1 a fermée sur `status`, en plus grave — elle
-- porterait sur le droit lui-même et non sur son application.
select is(
  has_table_privilege('authenticated', 'public.organization_module_grants', 'SELECT'),
  false, 'authenticated ne LIT pas les octrois');
select is(
  has_table_privilege('authenticated', 'public.organization_module_grants', 'INSERT'),
  false, 'authenticated n''INSÈRE pas d''octroi');
select is(
  has_table_privilege('authenticated', 'public.organization_module_grants', 'UPDATE'),
  false, 'authenticated ne MODIFIE pas un octroi (échéance comprise)');
select is(
  has_table_privilege('authenticated', 'public.organization_module_grants', 'DELETE'),
  false, 'authenticated ne SUPPRIME pas un octroi');
select is(
  has_table_privilege('anon', 'public.organization_module_grants', 'SELECT'),
  false, 'anon ne lit rien');

-- Les deux fonctions neuves sont SECURITY DEFINER et liraient l'état
-- commercial de N'IMPORTE QUELLE organisation : même raisonnement qu'au lot 1.
select is(
  has_function_privilege('authenticated',
    'public.org_has_live_module_grant(uuid, text, timestamptz)', 'EXECUTE'),
  false, 'org_has_live_module_grant n''est pas exposée à authenticated');
select is(
  has_function_privilege('authenticated',
    'public.org_module_grant_state(uuid, text, timestamptz)', 'EXECUTE'),
  false, 'org_module_grant_state n''est pas exposée à authenticated');

-- ────────────────────────────────────────────────────────────
-- 2. LE POINT CENTRAL — un add-on acheté seul suffit, et ne donne que lui
-- ────────────────────────────────────────────────────────────

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select (select id from ids where nom = 'seule'), 'hunts', 'pass', 'backoffice',
       (select v from t0) - interval '1 day',
       (select v from t0) + interval '29 days';

select is(
  public.org_has_active_access((select id from ids where nom = 'seule'), (select v from t0)),
  true,
  'DROIT CORE : un octroi vivant porte le socle SANS aucun abonnement'
);

select is(
  public.org_has_module_access((select id from ids where nom = 'seule'), 'hunts', (select v from t0)),
  true,
  'le module acheté est ouvert, sans abonnement'
);

-- L'assertion qui empêche un droit core trop généreux de passer pour un succès.
select is(
  public.org_has_module_access((select id from ids where nom = 'seule'), 'quiz', (select v from t0)),
  false,
  'un octroi de hunts n''ouvre PAS quiz — « sans déverrouiller les autres modules »'
);
select is(
  public.org_has_module_access((select id from ids where nom = 'seule'), 'wheel', (select v from t0)),
  true,
  'la roue suit le socle : elle n''a pas d''addon propre, et le socle est acquis'
);

select is(
  (select state from public.org_module_grant_state(
     (select id from ids where nom = 'seule'), 'hunts', (select v from t0))),
  'live', 'l''état rendu est « live »'
);

-- ────────────────────────────────────────────────────────────
-- 3. LA PAUSE À L'ÉCHÉANCE — dérivée, et non destructive
-- ────────────────────────────────────────────────────────────

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select (select id from ids where nom = 'echue'), 'hunts', 'pass', 'backoffice',
       (select v from t0) - interval '40 days',
       (select v from t0) - interval '10 days';

select is(
  public.org_has_module_access((select id from ids where nom = 'echue'), 'hunts', (select v from t0)),
  false, 'PAUSE : passé ends_at, le module est refusé'
);
select is(
  public.org_has_active_access((select id from ids where nom = 'echue'), (select v from t0)),
  false, 'PAUSE : le socle tombe aussi quand le pass était le seul droit'
);

-- « Les données et exports restent lisibles » : la pause n'efface rien.
select is(
  (select count(*)::int from public.organization_module_grants
    where organization_id = (select id from ids where nom = 'echue')),
  1, 'la ligne d''octroi expirée est CONSERVÉE'
);
select is(
  (select state from public.org_module_grant_state(
     (select id from ids where nom = 'echue'), 'hunts', (select v from t0))),
  'expired', 'et elle dit POURQUOI : « expired »'
);

-- LA MÊME LIGNE, LUE AVANT SON ÉCHÉANCE, ÉTAIT VIVANTE. C'est ce qui prouve
-- que la pause vient du TEMPS et non d'une propriété figée de la ligne — donc
-- qu'aucun cron n'a eu besoin d'écrire quoi que ce soit.
select is(
  public.org_has_module_access(
    (select id from ids where nom = 'echue'), 'hunts',
    (select v from t0) - interval '20 days'),
  true, 'la MÊME ligne, lue 20 jours plus tôt, ouvrait le module'
);

-- ────────────────────────────────────────────────────────────
-- 4. Les états qui ne sont pas « fini » — un achat jamais démarré
-- ────────────────────────────────────────────────────────────

insert into public.organization_module_grants
  (organization_id, module, kind, source, activate_by)
select (select id from ids where nom = 'jamais'), 'quiz', 'pass', 'backoffice',
       (select v from t0) - interval '2 days';

select is(
  (select state from public.org_module_grant_state(
     (select id from ids where nom = 'jamais'), 'quiz', (select v from t0))),
  'activation_expired',
  'un pass jamais démarré dont le délai est passé se distingue d''un pass fini'
);
select is(
  public.org_has_module_access((select id from ids where nom = 'jamais'), 'quiz', (select v from t0)),
  false, 'et il n''ouvre rien'
);
-- Le même, lu AVANT la date limite : encore démarrable, mais pas encore un droit.
select is(
  (select state from public.org_module_grant_state(
     (select id from ids where nom = 'jamais'), 'quiz',
     (select v from t0) - interval '5 days')),
  'pending', 'avant sa date limite, il est « pending » — acheté, pas démarré'
);
select is(
  public.org_has_module_access(
    (select id from ids where nom = 'jamais'), 'quiz',
    (select v from t0) - interval '5 days'),
  false,
  'ET IL N''OUVRE TOUJOURS RIEN : acheté n''est pas démarré'
);

-- ────────────────────────────────────────────────────────────
-- 5. La révocation
-- ────────────────────────────────────────────────────────────

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at, revoked_at, revoked_reason)
select (select id from ids where nom = 'revoquee'), 'jackpot', 'pass', 'backoffice',
       (select v from t0) - interval '1 day',
       (select v from t0) + interval '29 days',
       (select v from t0) - interval '1 hour', 'remboursement';

select is(
  public.org_has_module_access((select id from ids where nom = 'revoquee'), 'jackpot', (select v from t0)),
  false, 'un octroi révoqué n''ouvre rien, même dans sa fenêtre'
);
select is(
  public.org_has_active_access((select id from ids where nom = 'revoquee'), (select v from t0)),
  false, 'et il ne porte plus le socle non plus'
);

-- ────────────────────────────────────────────────────────────
-- 6. NON-RÉGRESSION — le chemin d'avant ce lot est intact
-- ────────────────────────────────────────────────────────────

select is(
  public.org_has_active_access((select id from ids where nom = 'abonnee'), (select v from t0)),
  true, 'NON-RÉGRESSION : un abonnement actif porte toujours le socle'
);
select is(
  public.org_has_module_access((select id from ids where nom = 'abonnee'), 'hunts', (select v from t0)),
  true, 'NON-RÉGRESSION : addon + abonnement ouvre toujours le module'
);
select is(
  public.org_has_module_access((select id from ids where nom = 'abonnee'), 'quiz', (select v from t0)),
  false, 'NON-RÉGRESSION : un addon éteint refuse toujours'
);

-- Une organisation INCONNUE rend false et non null : le null ferait échouer
-- OUVERT tout appelant plpgsql, sur exactement l'entrée qu'un attaquant
-- contrôle. Reprise du lot 1, revérifiée parce que ce lot RÉÉCRIT la fonction.
select is(
  public.org_has_active_access('99999999-9999-4999-8999-999999999999', (select v from t0)),
  false, 'une organisation inconnue rend false, pas null'
);

select throws_ok(
  $$ select public.org_has_module_access('99999999-9999-4999-8999-999999999999', 'inexistant') $$,
  'unknown module: inexistant',
  'un module inconnu LÈVE — un refus silencieux masquerait une faute de frappe'
);

-- ────────────────────────────────────────────────────────────
-- 7. Les gels : ce qui a été promis au client ne bouge plus
-- ────────────────────────────────────────────────────────────

insert into public.organization_module_grants
  (id, organization_id, module, kind, source, starts_at, ends_at, capacity)
select '66660000-0000-4000-8000-000000000006',
       (select id from ids where nom = 'abonnee'), 'events', 'pass', 'backoffice',
       (select v from t0) - interval '1 hour',
       (select v from t0) + interval '23 hours', 30;

select throws_ok(
  $$ update public.organization_module_grants set capacity = 50
      where id = '66660000-0000-4000-8000-000000000006' $$,
  'grant capacity is frozen',
  'la jauge posée est gelée — « jamais ajustée ou facturée rétroactivement »'
);

select throws_ok(
  $$ update public.organization_module_grants
        set starts_at = timestamptz '2026-07-01 00:00:00+00'
      where id = '66660000-0000-4000-8000-000000000006' $$,
  'grant start is frozen',
  'la date de démarrage posée est gelée'
);

-- LE GEL PORTE SUR LA VALEUR, PAS SUR LA COLONNE. Sans cette distinction,
-- poser une jauge après coup deviendrait impossible et un octroi acheté sans
-- jauge le resterait à vie. (Même piège que le gel des libellés de lots :
-- y tester la présence de la clé aurait gravé un état vide à perpétuité.)
insert into public.organization_module_grants
  (id, organization_id, module, kind, source, activate_by)
select '77770000-0000-4000-8000-000000000007',
       (select id from ids where nom = 'abonnee'), 'calendar', 'pass', 'backoffice',
       (select v from t0) + interval '90 days';

select lives_ok(
  $$ update public.organization_module_grants
        set starts_at = timestamptz '2026-06-16 00:00:00+00',
            ends_at   = timestamptz '2026-07-16 00:00:00+00'
      where id = '77770000-0000-4000-8000-000000000007' $$,
  'null → valeur reste permis : c''est le DÉMARRAGE, pas une modification'
);

select is(
  (select capacity from public.organization_module_grants
    where id = '66660000-0000-4000-8000-000000000006'),
  30, 'après les deux refus, la jauge vaut toujours ce qui a été vendu'
);

-- ────────────────────────────────────────────────────────────
-- 8. Les contraintes de cohérence
-- ────────────────────────────────────────────────────────────

select throws_ok(
  $$ insert into public.organization_module_grants
       (organization_id, module, kind, source, ends_at)
     values ('44440000-0000-4000-8000-000000000004', 'quiz', 'pass', 'backoffice',
             timestamptz '2026-07-01 00:00:00+00') $$,
  '23514',
  null,
  'une fin sans début est refusée — elle se lirait « déjà expiré »'
);

select throws_ok(
  $$ insert into public.organization_module_grants
       (organization_id, module, kind, source, starts_at, ends_at)
     values ('44440000-0000-4000-8000-000000000004', 'quiz', 'pass', 'backoffice',
             timestamptz '2026-07-01 00:00:00+00', timestamptz '2026-06-01 00:00:00+00') $$,
  '23514',
  null,
  'une fin AVANT le début est refusée'
);

select throws_ok(
  $$ insert into public.organization_module_grants
       (organization_id, module, kind, source)
     values ('44440000-0000-4000-8000-000000000004', 'quiz', 'pass', 'backoffice') $$,
  '23514',
  null,
  'un pass sans borne d''aucune sorte est refusé — il serait éternel'
);

select throws_ok(
  $$ insert into public.organization_module_grants
       (organization_id, module, kind, source, starts_at)
     values ('44440000-0000-4000-8000-000000000004', 'inexistant', 'pass', 'backoffice',
             timestamptz '2026-06-01 00:00:00+00') $$,
  '23514',
  null,
  'un module hors vocabulaire est refusé'
);

-- ────────────────────────────────────────────────────────────
-- 9. LE VOCABULAIRE NE PEUT PAS DIVERGER
--
-- La migration répète la liste des neuf modules à deux endroits : le `check`
-- de la table et le `if not in` de `org_has_module_access`. C'est assumé — un
-- `check` ne peut pas appeler une fonction stable — mais assumé ne veut pas
-- dire non gardé : un dixième module ajouté d'un seul côté produirait, selon
-- le côté, soit des lignes qu'aucune garde ne sait lire, soit une garde qui
-- lève sur un module légitime.
--
-- La comparaison porte sur pg_proc et pg_constraint, c'est-à-dire sur le
-- catalogue VIVANT — jamais sur le fichier de migration, qu'une redéfinition
-- ultérieure rendrait muet.
-- ────────────────────────────────────────────────────────────

-- `(regexp_matches(…, 'g'))[1]` et NON `unnest(regexp_matches(…))[1]` : la
-- seconde forme est une erreur de syntaxe — le résultat d'`unnest` ne
-- s'indexe pas. Avec le drapeau 'g', `regexp_matches` est déjà génératrice de
-- lignes en liste de sélection, chaque ligne étant un text[] dont on prend le
-- premier groupe.
create temporary table vocab_table as
select (regexp_matches(
         pg_get_constraintdef(c.oid),
         '''([a-z]+)''::text', 'g'))[1] as m
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
 where n.nspname = 'public'
   and t.relname = 'organization_module_grants'
   and c.contype = 'c'
   -- La contrainte est désignée par la COLONNE qu'elle porte, jamais par son
   -- nom : un filtre `conname like '%module%check'` attrape aussi
   -- `..._kind_check` et `..._source_check`, puisque le nom de la TABLE
   -- contient déjà « module ». Il ramenait 13 valeurs au lieu de 9, et sans
   -- l'assertion de comptage ci-dessous la comparaison serait passée pour un
   -- accord — c'est elle qui l'a trouvé.
   and c.conkey = array[(
     select a.attnum from pg_attribute a
      where a.attrelid = t.oid and a.attname = 'module'
   )];

create temporary table vocab_fonction as
select (regexp_matches(
         substring(p.prosrc from 'p_module not in \(([^)]*)\)'),
         '''([a-z]+)''', 'g'))[1] as m
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'org_has_module_access';

-- CONTRÔLE DU CONTRÔLE : deux extractions vides seraient « d'accord » et ne
-- prouveraient rien. C'est la forme de détecteur muet que ce dépôt s'est déjà
-- fait prendre plusieurs fois — un zéro rouge indistinguable d'un succès.
select is((select count(*)::int from vocab_table), 9,
  'la contrainte de table énumère bien neuf modules (sinon l''accord ci-dessous est vide)');
select is((select count(*)::int from vocab_fonction), 9,
  'la fonction énumère bien neuf modules');

select is_empty(
  $$ (select m from vocab_table except select m from vocab_fonction)
     union all
     (select m from vocab_fonction except select m from vocab_table) $$,
  'le vocabulaire de la table et celui de la garde sont identiques'
);

select * from finish();
rollback;
