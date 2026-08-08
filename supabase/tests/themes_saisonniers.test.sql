-- ============================================================
-- 20260917120000 + 20260921120000 — la palette partagée
-- calendrier/pronostics : sa création (six clés saisonnières), puis son
-- élargissement aux habillages d'univers (onze clés)
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LA PALETTE EST LA MÊME DES DEUX CÔTÉS (sections 2 et 3), et les ONZE
--      clés sont énumérées UNE PAR UNE sur CHAQUE table. C'est tout l'enjeu
--      du chantier : `contests.theme` et `calendars.theme` doivent accepter
--      exactement le même domaine. Une assertion globale du genre « le CHECK
--      existe » laisserait passer le défaut le plus probable — une clé
--      présente d'un côté, absente de l'autre — et l'écran de l'autre module
--      refuserait silencieusement le thème que le premier propose. Les deux
--      CHECK étant réécrits À LA MAIN à chaque élargissement, ce défaut-là
--      est une faute de recopie, c'est-à-dire la plus facile à commettre.
--
--   2. QUE L'ÉLARGISSEMENT DU CALENDRIER A BIEN MORDU (section 3). La
--      contrainte d'origine était posée EN LIGNE dans le `create table`
--      (20260728120000, l. 91-92), donc nommée par Postgres et non par nous.
--      Si le nom deviné (`calendars_theme_check`) avait été faux, le
--      `drop … if exists` serait un NO-OP silencieux, l'ancienne contrainte
--      étroite survivrait à côté de la neuve, et `saint_valentin` serait
--      refusée — la migration s'appliquerait sans broncher. Le `lives_ok` sur
--      `saint_valentin` est ce qui sépare « appliqué » de « effectif ».
--      20260921120000 rejoue exactement ce drop/recreate pour les cinq clés
--      d'univers : le même risque, donc les mêmes `lives_ok`, clé par clé.
--
--   3. QUE LA RÉÉMISSION DE LA LISTE BLANCHE N'A RIEN ROUVERT (section 4).
--      La migration réécrit `grant update (…)` sur `contests` EN ENTIER pour
--      la lisibilité. Une colonne oubliée à la recopie retirerait un réglage
--      au commerçant ; une colonne ajoutée par mégarde rendrait `status` ou
--      `rewards` écrivables en direct et court-circuiterait `set_contest_status`
--      et son audit. Les deux sens sont donc assertés — ce qui doit être là,
--      et ce qui doit rester dehors.
--
--   4. QUE LE DÉFAUT EST « neutre » (section 1), c'est-à-dire que les
--      championnats existants gardent l'apparence qu'ils ont déjà.
--
-- Toutes les assertions de données sont scopées aux fixtures de ce fichier :
-- la suite doit passer sur base VIDE comme sur base SEMÉE.
-- ============================================================
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()`
-- rend « aucun plan trouvé », que rien ne distingue d'un succès.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug)
values ('ce000000-0000-4000-8000-000000000001', 'Test Thèmes', 'tap-themes');

-- ══ 0. La forme : la colonne, et les contraintes NOMMÉES ═══
select has_column('public', 'contests', 'theme',
  'le championnat de pronostics porte enfin un thème');
select col_not_null('public', 'contests', 'theme',
  'un championnat a TOUJOURS un thème — « neutre » est une valeur, pas une absence');

-- La contrainte des pronostics est nommée à la main par la migration : le
-- prochain élargissement de palette n'aura pas à deviner comment Postgres
-- l'aurait appelée, contrairement à ce qu'a coûté celle du calendrier.
select is(
  (select count(*)::int from pg_constraint
     where conrelid = 'public.contests'::regclass
       and conname = 'contests_theme_check'),
  1,
  'le CHECK des pronostics porte un nom choisi, pas un nom deviné');

-- Et celle du calendrier a bien été REPOSÉE sous son nom d'origine après le
-- drop : si le drop avait raté sa cible, on trouverait ici deux contraintes.
select is(
  (select count(*)::int from pg_constraint
     where conrelid = 'public.calendars'::regclass
       and conname like '%theme%'),
  1,
  'le calendrier porte UNE seule contrainte de thème — l''ancienne n''a pas survécu à côté de la neuve');

-- ══ 1. Le défaut : « neutre », donc rien ne change à l'écran ═══
-- Un championnat créé sans mentionner de thème est un championnat créé
-- comme AVANT ce chantier. C'est la garantie de non-régression pour les
-- lignes existantes, que le `not null default` a rétro-remplies.
insert into public.contests (id, organization_id, slug, name, competition_key, status)
values ('ce000000-0000-4000-8000-000000000010',
        'ce000000-0000-4000-8000-000000000001',
        'tap-themes-defaut', 'Championnat sans thème', 'ligue1', 'draft');

select is(
  (select theme from public.contests
     where id = 'ce000000-0000-4000-8000-000000000010'),
  'neutre',
  'un championnat créé sans thème reste « neutre » — aucune apparence ne bouge');

-- ══ 2. Le domaine des pronostics : les onze clés, une par une ═══
select lives_ok(
  $$update public.contests set theme = 'neutre'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « neutre » est accepté');
select lives_ok(
  $$update public.contests set theme = 'noel'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « noel » est accepté');
select lives_ok(
  $$update public.contests set theme = 'saint_valentin'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « saint_valentin » est accepté');
select lives_ok(
  $$update public.contests set theme = 'anniversaire'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « anniversaire » est accepté');
select lives_ok(
  $$update public.contests set theme = 'soldes'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « soldes » est accepté');
select lives_ok(
  $$update public.contests set theme = 'festival'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « festival » est accepté');

-- Les cinq clés d'univers (20260921120000). Elles ne nomment pas une
-- saison mais un décor ; côté base c'est le même domaine, et c'est
-- exactement ce qu'il faut prouver — sur CETTE table comme sur l'autre.
select lives_ok(
  $$update public.contests set theme = 'prairie'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « prairie » est accepté');
select lives_ok(
  $$update public.contests set theme = 'musique'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « musique » est accepté');
select lives_ok(
  $$update public.contests set theme = 'football'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « football » est accepté');
select lives_ok(
  $$update public.contests set theme = 'restaurant'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « restaurant » est accepté');
select lives_ok(
  $$update public.contests set theme = 'espace'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  'pronostics : « espace » est accepté');

-- Le proche plausible : une saison commerçante réelle, mais hors palette.
-- C'est le refus qui compte — sans lui, le CHECK pourrait être un no-op.
select throws_ok(
  $$update public.contests set theme = 'halloween'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  '23514'::text, null::text,
  'pronostics : une saison hors palette est refusée par la BASE, pas seulement par Zod');
-- La casse compte : 'Noel' n'est pas 'noel'. Une base tolérante ici ferait
-- diverger la clé stockée de celle que le Record de thèmes sait résoudre.
select throws_ok(
  $$update public.contests set theme = 'Noel'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  '23514'::text, null::text,
  'pronostics : la clé est sensible à la casse');
-- Et la casse compte AUSSI pour les clés neuves. L'assertion sur 'Noel'
-- ci-dessus ne dit rien de 'Prairie' : un CHECK réécrit à la main peut
-- très bien être élargi avec une clé capitalisée, et l'erreur ne se
-- verrait qu'au premier commerçant qui choisit ce fond.
select throws_ok(
  $$update public.contests set theme = 'Prairie'
      where id = 'ce000000-0000-4000-8000-000000000010'$$,
  '23514'::text, null::text,
  'pronostics : les clés d''univers sont minuscules elles aussi');

-- ══ 3. Le domaine du calendrier : la même palette, élargie ═══
insert into public.calendars (
  id, organization_id, name, status, start_date, timezone, day_count,
  public_slug, completion_reward_stock
) values (
  'ce000000-0000-4000-8000-000000000020', 'ce000000-0000-4000-8000-000000000001',
  'Calendrier de test', 'draft', current_date, 'Europe/Paris', 3,
  'tap-themes-cal', 1
);

select lives_ok(
  $$update public.calendars set theme = 'neutre'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « neutre » est accepté');
select lives_ok(
  $$update public.calendars set theme = 'noel'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « noel » est accepté');
-- LA clé du chantier, et l'assertion qui prouve que le drop/recreate a
-- vraiment atteint la contrainte d'origine (cf. en-tête, point 2).
select lives_ok(
  $$update public.calendars set theme = 'saint_valentin'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « saint_valentin » est DÉSORMAIS accepté — l''élargissement a mordu');
select lives_ok(
  $$update public.calendars set theme = 'anniversaire'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « anniversaire » est accepté');
select lives_ok(
  $$update public.calendars set theme = 'soldes'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « soldes » est accepté');
select lives_ok(
  $$update public.calendars set theme = 'festival'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « festival » est accepté');

-- Les mêmes cinq clés d'univers que sur `contests`, dans le même ordre.
-- C'est ce bloc, mis en regard du précédent, qui interdit à une palette
-- de diverger de l'autre : chaque clé doit vivre DES DEUX CÔTÉS.
select lives_ok(
  $$update public.calendars set theme = 'prairie'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « prairie » est accepté');
select lives_ok(
  $$update public.calendars set theme = 'musique'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « musique » est accepté');
select lives_ok(
  $$update public.calendars set theme = 'football'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « football » est accepté');
select lives_ok(
  $$update public.calendars set theme = 'restaurant'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « restaurant » est accepté');
select lives_ok(
  $$update public.calendars set theme = 'espace'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  'calendrier : « espace » est accepté');

select throws_ok(
  $$update public.calendars set theme = 'halloween'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  '23514'::text, null::text,
  'calendrier : une saison hors palette reste refusée — l''élargissement n''a pas ouvert la porte');
-- Le fond dessiné pour « festival » représente une fête foraine, et c'est
-- ce que voit le commerçant. La clé, elle, reste `festival` : décrire
-- l'image plutôt que la nommer est donc l'erreur d'appelant la plus
-- probable de tout ce chantier. Onze clés permises n'en font pas douze.
select throws_ok(
  $$update public.calendars set theme = 'fete_foraine'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  '23514'::text, null::text,
  'calendrier : la clé est « festival », pas ce que l''illustration représente');
-- Le séparateur exact fait partie de la clé : 'saint-valentin' (tiret) n'est
-- pas 'saint_valentin' (souligné). Le tiret est l'orthographe naturelle en
-- français, donc l'erreur la plus probable côté appelant.
select throws_ok(
  $$update public.calendars set theme = 'saint-valentin'
      where id = 'ce000000-0000-4000-8000-000000000020'$$,
  '23514'::text, null::text,
  'calendrier : le tiret n''est pas le souligné — la clé exacte est « saint_valentin »');

-- ══ 4. Les privilèges : ce qui s'ouvre, ce qui reste fermé ═══
-- Le réglage doit être ATTEIGNABLE par un éditeur, sinon la colonne est du
-- code mort : `contests` est en LISTE BLANCHE d'UPDATE depuis 00023/20260721150000.
select ok(
  has_column_privilege('authenticated', 'public.contests', 'theme', 'UPDATE'),
  'un éditeur peut CHANGER le thème d''un championnat');
-- L'INSERT, lui, est accordé au niveau TABLE sur `contests` (00022) et n'a
-- jamais été revoqué : la colonne neuve est insérable sans grant dédié.
-- Cette assertion garde cette propriété, dont la migration dépend.
select ok(
  has_column_privilege('authenticated', 'public.contests', 'theme', 'INSERT'),
  'un éditeur peut POSER le thème à la création — l''insert de contests est au niveau table');

-- La liste blanche a été réémise EN ENTIER : rien n'a été perdu à la recopie.
select ok(
  has_column_privilege('authenticated', 'public.contests', 'name', 'UPDATE'),
  'la réémission n''a pas perdu « name »');
select ok(
  has_column_privilege('authenticated', 'public.contests', 'code_ttl_seconds', 'UPDATE'),
  'la réémission n''a pas perdu « code_ttl_seconds »');

-- ... et rien n'a été gagné non plus. `status` et `rewards` ne s'écrivent
-- qu'à travers set_contest_status / les RPC de règlement, qui portent les
-- règles métier et l'audit : les rouvrir en direct les court-circuiterait.
select ok(
  not has_column_privilege('authenticated', 'public.contests', 'status', 'UPDATE'),
  'le statut reste FERMÉ à l''écriture directe — il passe par set_contest_status');
select ok(
  not has_column_privilege('authenticated', 'public.contests', 'rewards', 'UPDATE'),
  'les récompenses restent FERMÉES à l''écriture directe');

-- Le calendrier n'avait rien à recevoir : `theme` était déjà dans ses deux
-- listes blanches (20260904120000). On le vérifie plutôt que de le supposer.
select ok(
  has_column_privilege('authenticated', 'public.calendars', 'theme', 'UPDATE'),
  'le thème du calendrier était déjà modifiable, et l''est resté');
select ok(
  has_column_privilege('authenticated', 'public.calendars', 'theme', 'INSERT'),
  'le thème du calendrier était déjà posable à la création, et l''est resté');

select * from finish();
rollback;
