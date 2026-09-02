-- ════════════════════════════════════════════════════════════
-- VITRINE — LES HORAIRES DEVIENNENT STRUCTURÉS (VIT-31)
--
-- Deux phrases du propriétaire, une seule cause : « pour la vitrine il manque
-- l'heure actuel », et « quand j'ajoute les heures il faudrait déjà avoir écrit
-- Lundi Mardi etc. et que le client ait juste à rajouter ».
--
-- `horaires_texte` est un TEXTE LIBRE de 600 caractères. Il se LIT très bien et
-- ne se CALCULE pas : « Mardi au dimanche », « Fermé le lundi midi », « Service
-- continu l'été ». C'est exactement ce que dit l'en-tête de `badge_ouverture`
-- (20261121120000) — cette pastille écrite à la main N'EXISTE QUE parce que le
-- calcul était impossible. Cette colonne rend le calcul possible ; elle ne
-- remplace rien, et surtout pas le texte libre.
--
-- ── LA COMPATIBILITÉ DÉCIDE DE TOUT : `null` EST UN ÉTAT, PAS UN TROU ──
--
-- Aucune vitrine existante ne change d'apparence. `horaires` ABSENT laisse le
-- comportement d'aujourd'hui intact : bloc `horaires_texte` affiché tel quel,
-- pastille `badge_ouverture` écrite à la main. Il n'y a AUCUN remplissage
-- rétroactif, et c'est délibéré — l'absence EST le comportement voulu, motif
-- exact d'ADR-129 (« l'absence vaut le comportement d'hier ») et d'ADR-123.
--
-- Deviner des créneaux à partir du texte libre aurait été la seule autre
-- option, et c'est la pire : un badge « Ouvert » faux sur une page publique
-- fait déplacer un client pour rien, ce qui est strictement pire que pas de
-- badge. La règle tenue partout ici est donc « dans le doute, ne rien
-- affirmer », jamais « dans le doute, dire ouvert ».
--
-- ── POURQUOI LES SEPT JOURS SONT TOUS EXIGÉS ──
--
-- Une clé de jour MANQUANTE serait un troisième état, entre « fermé ce
-- jour-là » (tableau vide) et « rien n'a été dit » (colonne `null`). Trois
-- états dont deux se ressemblent, c'est la garantie que l'écran finira par les
-- confondre. On en garde DEUX, et l'absence vit au niveau de la COLONNE :
--
--   `horaires is null`      → le commerçant n'a rien structuré. Comportement
--                             d'avant ce lot, à l'octet près.
--   `{"lundi": [], …}`      → il a dit « fermé le lundi ». C'est une
--                             affirmation, et elle s'affiche.
--
-- Le formulaire pré-remplit les sept jours — c'est LA demande du propriétaire —
-- donc les sept sont toujours postés. Écarté : rendre les jours facultatifs
-- « pour la souplesse », qui aurait rendu ambiguë la seule question que la page
-- publique pose.
--
-- ── POURQUOI DES NOMS FRANÇAIS ET NON `1`..`7` ──
--
-- Le schéma de la Vitrine est en français jusqu'au bout (`accroche`,
-- `histoire`, `horaires_texte`, `secteur`, `badge_ouverture`, `allure`,
-- `jeux`), et les `<input name=…>` portent les noms de la base — c'est la règle
-- de nommage de VIT-1a, un seul jeu de noms du `check` SQL jusqu'au formulaire.
-- Des entiers ISO auraient exigé une table de correspondance dans le SQL, dans
-- le miroir TypeScript et dans l'écran, pour économiser sept mots que le
-- commerçant relit dans son propre document. Écarté aussi : les noms anglais,
-- qui auraient été le seul vocabulaire anglophone du schéma Vitrine.
--
-- ── UN CRÉNEAU NE FRANCHIT PAS MINUIT, ET C'EST ASSUMÉ ──
--
-- `de < a` interdit `{"de":"18:00","a":"02:00"}`. Un bar ouvert jusqu'à 2 h
-- s'écrit donc en deux créneaux, sur deux jours. Écarté : autoriser `de > a`
-- comme signe d'un passage de minuit — l'ordre des créneaux, le chevauchement
-- et le calcul du « ferme à » seraient devenus ambigus dans les DEUX sens de
-- lecture, pour une forme que personne ne peut trier. La limite est connue et
-- documentée côté application (`src/lib/vitrine-horaires.ts`).
--
-- Miroir de `HorairesVitrine`, `VITRINE_JOURS` et `VITRINE_HEURE_PATTERN`
-- (src/lib/vitrine.ts) ; la parité est gardée par
-- `src/lib/vitrine-parity.test.ts`, qui LIT ce fichier.
-- ════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────
-- 1. LE VALIDATEUR, FERMÉ AUX DEUX RANGS
--
-- Même forme et mêmes garanties que `is_valid_vitrine_theme` : `immutable`,
-- `set search_path = pg_catalog`, et un vocabulaire fermé au PREMIER rang (les
-- sept jours) comme au SECOND (les deux clés d'un créneau). Un validateur qui
-- ne fermerait que le premier rang laisserait passer
-- `{"lundi":[{"de":"09:00","a":"12:00","note":"…"}]}` — c'est-à-dire une clé
-- qu'aucun écran ne lira jamais, écrite dans une colonne que personne ne relit.
-- ────────────────────────────────────────────────────────────

create or replace function public.is_valid_vitrine_horaires(p_horaires jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  -- LE VOCABULAIRE, EN UN SEUL ENDROIT DU FICHIER. La garde de parité lit
  -- cette ligne ; l'écrire deux fois aurait donné deux listes à tenir d'accord
  -- dans une fonction de trente lignes.
  c_jours constant text[] := array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  -- L'HEURE SUR VINGT-QUATRE, ZÉRO EN TÊTE OBLIGATOIRE. Le zéro n'est pas une
  -- coquetterie : c'est lui qui fait que l'ordre alphabétique de deux `HH:MM`
  -- EST leur ordre chronologique, ce dont dépend la comparaison `de < a`
  -- ci-dessous et tout le calcul côté application.
  c_heure constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  c_creneaux_max constant integer := 3;
begin
  -- `null` VAUT VRAI, et c'est la compatibilité : voir l'en-tête. Une vitrine
  -- qui n'a rien structuré doit pouvoir s'enregistrer comme avant.
  if p_horaires is null then
    return true;
  end if;

  if jsonb_typeof(p_horaires) <> 'object' then
    return false;
  end if;

  -- ── PREMIER RANG : LES SEPT JOURS, TOUS LES SEPT ──
  --
  -- Deux tests et non un : le compte refuse un jour MANQUANT, le vocabulaire
  -- refuse un huitième jour. Ensemble ils disent « exactement la semaine ».
  if (select count(*) from jsonb_object_keys(p_horaires)) <> cardinality(c_jours) then
    return false;
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_horaires) k
     where k <> all (c_jours)
  ) then
    return false;
  end if;

  -- ── CHAQUE JOUR : UN TABLEAU, TROIS CRÉNEAUX AU PLUS ──
  --
  -- CE TEST DOIT PASSER AVANT TOUS LES SUIVANTS : `jsonb_array_elements` LÈVE
  -- sur autre chose qu'un tableau, et une exception dans un `check` n'est pas
  -- un refus propre — c'est une erreur que le formulaire ne sait pas expliquer.
  if exists (
    select 1 from jsonb_each(p_horaires) j
     where jsonb_typeof(j.value) <> 'array'
        or jsonb_array_length(j.value) > c_creneaux_max
  ) then
    return false;
  end if;

  -- ── CHAQUE CRÉNEAU : UN OBJET ──
  if exists (
    select 1
      from jsonb_each(p_horaires) j
      cross join lateral jsonb_array_elements(j.value) c
     where jsonb_typeof(c.value) <> 'object'
  ) then
    return false;
  end if;

  -- ── SECOND RANG : `de` ET `a`, EXACTEMENT CES DEUX CLÉS ──
  --
  -- Le compte à deux ET l'absence d'intrus : les clés d'un objet JSON étant
  -- uniques, les deux réunis valent « exactement {de, a} », donc `de` et `a`
  -- sont tous deux présents sans qu'il faille les chercher un par un.
  if exists (
    select 1
      from jsonb_each(p_horaires) j
      cross join lateral jsonb_array_elements(j.value) c
     where (select count(*) from jsonb_object_keys(c.value)) <> 2
        or exists (select 1 from jsonb_object_keys(c.value) k
                    where k not in ('de', 'a'))
  ) then
    return false;
  end if;

  -- ── LES DEUX HEURES : FORME, PUIS ORDRE ──
  --
  -- `collate "C"` sur la comparaison, et ce n'est pas un détail de style : une
  -- fonction `immutable` ne doit dépendre d'AUCUN réglage de la base, et
  -- l'ordre du texte en dépend. La collation « C » est l'ordre des octets, donc
  -- l'ordre chronologique de deux `HH:MM` à zéro en tête, aujourd'hui comme
  -- après une réindexation ou un changement de locale.
  if exists (
    select 1
      from jsonb_each(p_horaires) j
      cross join lateral jsonb_array_elements(j.value) c
     where coalesce(jsonb_typeof(c.value -> 'de'), '') <> 'string'
        or coalesce(jsonb_typeof(c.value -> 'a'), '') <> 'string'
        or (c.value ->> 'de') !~ c_heure
        or (c.value ->> 'a') !~ c_heure
        or (c.value ->> 'de') collate "C" >= (c.value ->> 'a') collate "C"
  ) then
    return false;
  end if;

  return true;
end
$$;

comment on function public.is_valid_vitrine_horaires(jsonb) is
  'Forme des horaires STRUCTURÉS de la vitrine (VIT-31), fermée aux DEUX '
  'rangs comme is_valid_vitrine_theme : les sept jours en français et rien '
  'd''autre, chacun portant 0 à 3 créneaux {de, a} au format HH:MM sur 24 h '
  'avec de < a. `null` est ACCEPTÉ et vaut « rien n''a été structuré » — c''est '
  'la compatibilité, pas une tolérance. Un créneau ne franchit pas minuit : '
  'voir l''en-tête de la migration.';

-- Mêmes droits que `is_valid_vitrine_theme` : la fonction sert un `check`, elle
-- n'est appelée par personne d'autre. `public` inclut `anon`, on nomme quand
-- même les deux rôles pour que la lecture ne dépende pas de cette subtilité.
revoke all on function public.is_valid_vitrine_horaires(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_vitrine_horaires(jsonb)
  to authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 2. LA COLONNE
--
-- Nullable, défaut `null` — voir l'en-tête. `add column if not exists` et le
-- `add constraint` gardé rendent le fichier rejouable : sur une base déjà
-- migrée, ce bloc ne touche AUCUNE ligne.
-- ────────────────────────────────────────────────────────────

alter table public.vitrine_settings
  add column if not exists horaires jsonb;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'vitrine_settings_horaires_valide'
       and conrelid = 'public.vitrine_settings'::regclass
  ) then
    alter table public.vitrine_settings
      add constraint vitrine_settings_horaires_valide
      check (public.is_valid_vitrine_horaires(horaires));
  end if;
end
$migration$;

comment on column public.vitrine_settings.horaires is
  'Les horaires STRUCTURÉS (VIT-31) : {lundi..dimanche} → 0 à 3 créneaux '
  '{de, a} en HH:MM sur 24 h. Forme fermée aux deux rangs par '
  'is_valid_vitrine_horaires. `null` signifie « rien n''a été structuré » et '
  'laisse la page EXACTEMENT comme avant ce lot — bloc horaires_texte affiché '
  'tel quel, pastille badge_ouverture écrite à la main. Ne REMPLACE pas '
  'horaires_texte, qui reste la légende libre que le tableau ne sait pas '
  'porter (jours fériés, « service continu l''été »). Un jour à `[]` est une '
  'AFFIRMATION — « fermé » — et non une absence.';


-- ────────────────────────────────────────────────────────────
-- 3. LE DROIT D'ÉCRITURE, ET SA GARDE — LE PIÈGE RDV-12
--
-- `vitrine_settings` accorde `select` au niveau de la TABLE et `update` COLONNE
-- PAR COLONNE (20261011120000, puis 20261121120000). Une colonne neuve est donc
-- lisible par héritage et MUETTE EN ÉCRITURE tant qu'aucun `grant update`
-- nommé ne la couvre.
--
-- Ce défaut ne casse RIEN de visible, et c'est ce qui le rend cher : la server
-- action réussit, la revalidation passe, le commerçant repart en croyant ses
-- horaires enregistrés. Trouvé après coup trois fois de suite sur
-- `reservations` (RDV-12), puis cinq lots de plus la même semaine — jamais par
-- une garde. La garde est donc ICI, dans le fichier qui crée la colonne, sur le
-- modèle de 20261126120000.
-- ────────────────────────────────────────────────────────────

grant update (horaires) on public.vitrine_settings to authenticated;

do $migration$
begin
  if not pg_catalog.has_column_privilege(
           'authenticated', 'public.vitrine_settings', 'horaires', 'UPDATE') then
    raise exception
      'public.vitrine_settings.horaires n est pas modifiable par authenticated : saveVitrineSettings echouerait sur « permission denied for column », ou pire, ecrirait tout le reste en laissant les horaires intacts sans que rien ne le dise.';
  end if;

  -- La LECTURE vient du `grant select` de TABLE. Si quelqu un le remplace un
  -- jour par des grants de colonnes en oubliant celle-ci, PostgREST refuserait
  -- le select ENTIER : l atelier Vitrine ne se degraderait pas, il
  -- DISPARAITRAIT. Assertion posee ici alors meme que ce fichier n accorde
  -- aucun SELECT — c est le defaut qu on ne voit qu en production.
  if not pg_catalog.has_column_privilege(
           'authenticated', 'public.vitrine_settings', 'horaires', 'SELECT') then
    raise exception
      'public.vitrine_settings.horaires n est pas lisible par authenticated : le grant de table de 20261011120000 a ete remplace par des grants de colonnes qui l oublient, et PostgREST refuserait le select entier — l atelier Vitrine disparaitrait au lieu de se degrader.';
  end if;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 4. `vitrine_public_state` — LA PAGE PUBLIQUE REÇOIT DE QUOI CALCULER
--
-- DEUX clés, et il en faut deux : les horaires ne suffisent pas.
--
-- ── LE FUSEAU EST CELUI DU COMMERCE, JAMAIS CELUI DU VISITEUR ──
--
-- Sans `timezone`, « ouvert à l'instant T » se calculerait dans le fuseau du
-- NAVIGATEUR. Faux pour un touriste qui prépare sa soirée depuis son fuseau
-- d'origine, faux pour un client à l'étranger, et faux d'une heure deux fois
-- par an pour tout le monde si les deux zones ne changent pas d'heure le même
-- jour. `organizations.timezone` est `not null default 'Europe/Paris'` (00019)
-- et validé : la clé porte donc toujours une zone IANA réelle.
--
-- ── CE QUI NE BOUGE PAS, ET POURQUOI IL NE DOIT PAS ──
--
-- `horaires` N'ENTRE PAS dans la couverture de traduction : un tableau de
-- `HH:MM` ne se traduit pas, et `vitrine_champs_traduisibles` n'est pas touché.
-- C'est la même exigence que celle écrite au-dessus du calcul de couverture
-- (L17) : les 19/19 et 5/5 du seed restent invariants, sans quoi les vitrines
-- traduites retomberaient sous le seuil du sélecteur de langue.
--
-- ── UN PATCH, ZÉRO RECOPIE ──
--
-- `vitrine_public_state` porte des patchs successifs appliqués par
-- `pg_get_functiondef` depuis 20261023120000 (sa dernière définition entière) :
-- la recopier ici écraserait en silence les gardes produit, l'indexation, le
-- badge, les portes Calendrier/Pronostics et la porte de la Bande posées
-- depuis. On patche donc le CATALOGUE VIVANT, et l'ancre est comptée avant
-- d'être remplacée.
--
-- L'ANCRE EST UN MARQUEUR À PRÉSERVER, JAMAIS L'ABSENCE DE CE QU'ON AJOUTE.
-- Vérifier que `horaires` n'est pas déjà là ferait échouer ce fichier sur toute
-- base reconstruite après lui — un `db reset` rejoue les migrations dans
-- l'ordre, et la garde d'un fichier ancien doit rester vraie dans un monde où
-- les fichiers suivants existent.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;

  -- Marqueur préservé : la FIN du bloc `identite`, badge de VIT-13 puis thème.
  -- L'ancre porte les deux lignes pour ne pouvoir désigner qu'un seul endroit
  -- du document — `'theme', v_settings.theme` seul aurait été plus fragile le
  -- jour où un autre bloc publierait un thème.
  v_ancre constant text :=
    '      ''badge_ouverture'', v_settings.badge_ouverture,' || E'\n'
    || '      ''theme'', v_settings.theme';
  v_neuf constant text :=
    '      ''badge_ouverture'', v_settings.badge_ouverture,' || E'\n'
    || '      -- VIT-31 : LES HORAIRES STRUCTURES, ou null. `null` laisse la' || E'\n'
    || '      -- page EXACTEMENT comme avant — bloc horaires_texte et pastille' || E'\n'
    || '      -- ecrite a la main. Cette cle ne passe PAS par v_horaires : un' || E'\n'
    || '      -- tableau de HH:MM ne se traduit pas, et la couverture de' || E'\n'
    || '      -- traduction ne doit pas bouger d un pouce (voir L17).' || E'\n'
    || '      ''horaires'', v_settings.horaires,' || E'\n'
    || '      -- LE FUSEAU DU COMMERCE, et non celui du visiteur. Sans lui,' || E'\n'
    || '      -- « ouvert a l instant T » se calculerait dans le fuseau du' || E'\n'
    || '      -- navigateur : faux pour un touriste, faux pour un client a' || E'\n'
    || '      -- l etranger, et faux d une heure deux fois par an.' || E'\n'
    || '      -- organizations.timezone est `not null` (00019) : la cle porte' || E'\n'
    || '      -- toujours une zone IANA reelle.' || E'\n'
    || '      ''timezone'', v_org.timezone,' || E'\n'
    || '      ''theme'', v_settings.theme';

  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state';

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_ancre, '')))
            / pg_catalog.length(v_ancre);
  if v_hits <> 1 then
    raise exception
      'vitrine_public_state porte % occurrence(s) de la fin du bloc identite (badge_ouverture puis theme) au lieu d''une seule : le document a change, migration arretee pour ne pas ecrire au mauvais endroit',
      v_hits;
  end if;

  v_def := pg_catalog.replace(v_def, v_ancre, v_neuf);

  execute v_def;
end
$migration$;


-- ────────────────────────────────────────────────────────────
-- 5. `vitrine_dashboard_state` — L'ATELIER LIT CE QU'IL ÉCRIT
--
-- Une seule clé ici, et pas de `timezone` : cet état est SERVEUR ET ORG-SCOPÉ,
-- l'atelier connaît déjà son organisation et `organizations.timezone` lui est
-- lisible en direct (`grant select(timezone)`, 00019). L'ajouter aurait été une
-- seconde source pour la même valeur, dans le seul écran qui n'en a pas besoin
-- pour se protéger d'un fuseau étranger.
--
-- `horaires_texte` reste, juste au-dessus : les deux champs coexistent dans le
-- formulaire, et c'est le point du lot.
-- ────────────────────────────────────────────────────────────

do $migration$
declare
  v_def text;

  -- Marqueur préservé : la ligne du texte libre, que ce lot ne remplace pas.
  v_ancre constant text :=
    '        ''horaires_texte'', v_settings.horaires_texte,';
  v_neuf constant text :=
    '        ''horaires_texte'', v_settings.horaires_texte,' || E'\n'
    || '        -- VIT-31 : les horaires STRUCTURES, ou null. L atelier rend' || E'\n'
    || '        -- les deux champs — le texte libre reste la legende que le' || E'\n'
    || '        -- tableau ne sait pas porter (jours feries, saison).' || E'\n'
    || '        ''horaires'', v_settings.horaires,';

  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_dashboard_state';

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_ancre, '')))
            / pg_catalog.length(v_ancre);
  if v_hits <> 1 then
    raise exception
      'vitrine_dashboard_state porte % occurrence(s) de la ligne horaires_texte au lieu d''une seule : le document a change, migration arretee',
      v_hits;
  end if;

  v_def := pg_catalog.replace(v_def, v_ancre, v_neuf);

  execute v_def;
end
$migration$;


-- ════════════════════════════════════════════════════════════
-- LA GARDE DE SORTIE
--
-- Elle relit le catalogue APRÈS l'application. Un `replace` qui n'aurait rien
-- remplacé rendrait la même fonction sans lever : les comptes ci-dessus
-- protègent l'ANCRE, ceux-ci prouvent le RÉSULTAT.
--
-- Cette garde est TEXTUELLE, et c'est sa limite : elle prouve que les deux
-- fonctions vivantes publient les clés, non que la page en tire le bon verdict.
-- La preuve de COMPORTEMENT — validation, droit d'écriture, présence des clés
-- dans les deux documents — est en pgTAP, dans
-- `supabase/tests/vitrine_horaires_structures.test.sql`, et le calcul
-- « ouvert / fermé » est éprouvé côté application dans
-- `src/lib/vitrine-horaires.test.ts` : il n'existe pas en SQL, et ne doit pas.
-- ════════════════════════════════════════════════════════════

do $verification$
declare
  v_public_horaires integer;
  v_public_fuseau   integer;
  v_dashboard       integer;
begin
  select pg_catalog.count(*)::integer into v_public_horaires
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ '''horaires'', v_settings\.horaires';
  if v_public_horaires <> 1 then
    raise exception
      'vitrine_public_state ne publie pas la cle `horaires` dans identite : la page publique n aurait rien a calculer, et le lot serait inerte sans que rien ne le dise';
  end if;

  select pg_catalog.count(*)::integer into v_public_fuseau
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ '''timezone'', v_org\.timezone';
  if v_public_fuseau <> 1 then
    raise exception
      'vitrine_public_state ne publie pas le fuseau du commerce : « ouvert » se calculerait dans le fuseau du VISITEUR, faux pour tout client qui ne lit pas la page depuis le trottoir d en face';
  end if;

  select pg_catalog.count(*)::integer into v_dashboard
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_dashboard_state'
     and p.prosrc ~ '''horaires'', v_settings\.horaires';
  if v_dashboard <> 1 then
    raise exception
      'vitrine_dashboard_state ne publie pas la cle `horaires` : l atelier ecrirait un champ qu il ne sait pas relire, donc un formulaire qui se vide a chaque rechargement';
  end if;
end
$verification$;
