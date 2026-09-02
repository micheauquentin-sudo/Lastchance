-- ════════════════════════════════════════════════════════════
-- LE COMMERÇANT CHOISIT TOUT CE QUI PARAÎT SUR SA CARTE (VIT-32)
--
-- Deux manques, et ils se tiennent.
--
-- 1. LE PASSEPORT DE FIDÉLITÉ N'AVAIT AUCUNE PORTE. `vitrine_public_state`
--    publie six listes Réserver, les quiz, les calendriers, les pronostics et
--    les deux salons — et rien pour le passeport, alors que sa page publique
--    existe depuis 20260725120000. Un client attablé qui lit la carte n'avait
--    donc AUCUN chemin vers le passeport de ce commerce : il fallait avoir déjà
--    scanné le QR du comptoir, c'est-à-dire connaître l'adresse pour la
--    trouver. C'est le cul-de-sac exact que VIT-3 a passé un lot à défaire pour
--    Réserver, laissé ouvert pour la fidélité.
--
-- 2. `theme.jeux` NE CONNAISSAIT QUE LES DEUX SALONS. VIT-16 a donné au
--    commerçant le moyen de retirer le Duo Miroir ou le Portrait de la Bande de
--    sa carte, parce que le bloc « Jeux » les montrait tous les deux ou aucun.
--    Les quatre autres familles — quiz, calendriers, pronostics, et désormais
--    le passeport — restaient d'office : dès que la base les ouvrait, la carte
--    les annonçait. Un commerçant qui réserve son quiz à sa newsletter ou son
--    calendrier à ses habitués n'avait rien à dire.
--
-- ── LA PORTE DU PASSEPORT EST UNE LISTE, ET NON UN BOOLÉEN ──
--
-- `duo` et `bande` sont des booléens parce que leur adresse SE DÉDUIT : un seul
-- salon par commerce, à `/lobby/nouveau/{slug}`, et le slug est déjà dans le
-- document. Le passeport vit à `/passeport/{id}` — un identifiant qui n'existe
-- nulle part ailleurs dans l'état public. Un booléen aurait dit « il y a un
-- passeport » sans dire OÙ, et l'écran n'aurait eu aucun lien à peindre.
--
-- Et il en faut une LISTE, pas un identifiant seul : rien dans le schéma ne
-- borne `loyalty_programs` à une ligne par commerce — l'unique index posé sur
-- cette table (20261112130000) borne le lien vers un jackpot, pas le nombre de
-- programmes. Un booléen aurait donc obligé la RPC à en ÉLIRE un, sans règle
-- pour le faire.
--
-- FORME `{id, nom}` ET NON `{slug, titre}` : ces deux mots-là sont ceux des
-- expériences qui ont une adresse publique choisie (quiz, calendriers,
-- pronostics). Le passeport n'en a pas — il porte un UUID. Le nommer `slug`
-- aurait été un mensonge de vocabulaire, et `mapPorteSimple` lit déjà
-- exactement `{id, nom}` côté application : rien à écrire de neuf.
--
-- ── LES DEUX GARDES DE LA PORTE, ET ELLES SONT CELLES DE LA PAGE ──
--
-- Le droit `loyalty` ET `status = 'active'`. Ce sont EXACTEMENT les deux refus
-- de `loadLoyaltyContext` (`src/lib/loyalty-context.ts`) : sans le module, sans
-- programme actif, la page publique rend `unavailable`. Annoncer une porte que
-- cette page refuse d'ouvrir, c'est la promesse rompue devant le client — le
-- défaut que DUO-3a a réparé pour le Portrait de la Bande, qu'on ne réintroduit
-- pas ici.
--
-- ── LE VOCABULAIRE DES CHOIX PREND LES MOTS DES PORTES ──
--
-- `theme.jeux` s'élargit à `duo`, `bande`, `quiz`, `calendars`, `pronostics`,
-- `loyalty` : les six clés de `portes.experiences`, au pluriel compris. L'écran
-- croise les deux documents clé par clé, sans table de traduction.
--
-- ÉCARTÉ : `reserver`. Ce n'est pas un jeu, et il a déjà son réglage — sa
-- présence dans `ordre_blocs`. Deux façons de dire la même chose, c'est la
-- première à partir qui écrase l'autre ; le studio l'écrit déjà noir sur blanc
-- pour le bloc « Jeux » lui-même.
--
-- L'ABSENCE CONTINUE DE VALOIR « AFFICHÉ » (ADR-129), et l'enjeu grandit avec
-- le vocabulaire : à deux clés, l'inverse retirait deux salons ; à six, il
-- retirerait aussi les quiz, les calendriers et les pronostics de toutes les
-- vitrines publiées, en silence, le jour du déploiement. Seul un `false` ÉCRIT
-- masque quelque chose.
--
-- ── UNE SEULE ANCRE, ET C'EST CELLE QUE DUO-3a A POSÉE ──
--
-- `vitrine_public_state` porte des patchs successifs appliqués par
-- `pg_get_functiondef` depuis 20261023120000 : la recopier écraserait en
-- silence les gardes produit, l'indexation, le badge d'ouverture, les horaires
-- structurés de VIT-31 et les portes posées depuis. On patche donc le CATALOGUE
-- VIVANT, et l'ancre est comptée avant d'être remplacée.
--
-- L'ancre est le quatuor `experiences` installé par 20261127120000 — l'ouverture
-- du bloc, `quiz`, `duo`, `bande`. Les listes `calendars` et `pronostics` la
-- suivent et ne sont PAS touchées : l'ancre s'arrête avant elles. On insère donc
-- la nouvelle liste entre les booléens et les listes existantes, ce qui est un
-- choix de TEXTE et non de document — `jsonb` trie ses clés lui-même.
--
-- LES ANCRES SONT DES MARQUEURS À PRÉSERVER, JAMAIS L'ABSENCE DE CE QU'ON
-- AJOUTE. Vérifier que `loyalty` n'est pas déjà là ferait échouer ce fichier sur
-- toute base reconstruite après lui — un `db reset` rejoue les migrations dans
-- l'ordre, et la garde d'un fichier ancien doit rester vraie dans un monde où
-- les fichiers suivants existent.
-- ════════════════════════════════════════════════════════════

do $migration$
declare
  v_def text;

  -- LE MARQUEUR PRÉSERVÉ : les trois clés d'ouverture du bloc `experiences`,
  -- dans l'ordre exact où DUO-3a les a laissées. Rien de ce qui suit — ni
  -- `calendars`, ni `pronostics`, ni la fermeture du bloc — n'entre dans
  -- l'ancre, donc rien de tout cela ne peut être réécrit par mégarde.
  v_ancre constant text :=
    '      ''experiences'', pg_catalog.jsonb_build_object(' || E'\n'
    || '        ''quiz'', v_quiz,' || E'\n'
    || '        ''duo'', v_duo,' || E'\n'
    || '        ''bande'', v_bande,';

  v_neuf constant text :=
    '      ''experiences'', pg_catalog.jsonb_build_object(' || E'\n'
    || '        ''quiz'', v_quiz,' || E'\n'
    || '        ''duo'', v_duo,' || E'\n'
    || '        ''bande'', v_bande,' || E'\n'
    -- LA PORTE DU PASSEPORT (VIT-32). Une LISTE, parce que son adresse porte
    -- un identifiant que rien d'autre ne publie, et parce que rien ne borne
    -- cette table a un programme par commerce.
    || '        ''loyalty'', (' || E'\n'
    || '          select coalesce(' || E'\n'
    || '            pg_catalog.jsonb_agg(' || E'\n'
    || '              pg_catalog.jsonb_build_object(''id'', x.id, ''nom'', x.nom)' || E'\n'
    || '              order by x.nom, x.id),' || E'\n'
    || '            ''[]''::jsonb)' || E'\n'
    || '          from (' || E'\n'
    || '            select l.id, l.name as nom' || E'\n'
    || '              from public.loyalty_programs l' || E'\n'
    || '             where l.organization_id = v_settings.organization_id' || E'\n'
    -- LES DEUX MEMES REFUS QUE loadLoyaltyContext : le droit du module, et le
    -- programme ACTIF. Un brouillon ou un programme archive n'ouvre pas.
    || '               and l.status = ''active''' || E'\n'
    || '               and public.org_has_module_access(' || E'\n'
    || '                     v_settings.organization_id, ''loyalty'')' || E'\n'
    || '             order by l.name, l.id' || E'\n'
    -- LA MEME BORNE QUE LES CINQ AUTRES LISTES : une page, pas un catalogue.
    || '             limit c_max_portes' || E'\n'
    || '          ) x' || E'\n'
    || '        ),';

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
      'vitrine_public_state porte % occurrence(s) de l''ouverture du bloc experiences (quiz, duo, bande) au lieu d''une seule : le document a change, migration arretee pour ne pas ecrire au mauvais endroit',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_ancre, v_neuf);
end
$migration$;


-- ════════════════════════════════════════════════════════════
-- LA GARDE DE SORTIE DE LA PORTE
--
-- Elle lit le catalogue APRÈS l'application : un `replace` qui n'aurait rien
-- remplacé rendrait la même fonction sans lever. Le compte ci-dessus protège
-- l'ANCRE, ceux-ci prouvent le RÉSULTAT — et les deux moitiés sont exigées
-- séparément, parce qu'une porte publiée sans sa garde de droit est exactement
-- le défaut que DUO-3a a réparé ailleurs.
--
-- Ces gardes sont TEXTUELLES, et c'est leur limite : elles prouvent que la
-- fonction vivante lit le droit et publie la clé, non que le couple se comporte
-- bien. La preuve de COMPORTEMENT — porte fermée sans le droit, fermée sans
-- programme actif, ouverte avec les deux, et les cinq autres clés INCHANGÉES de
-- part et d'autre — est en pgTAP, dans `droits_par_produit.test.sql`.
-- ════════════════════════════════════════════════════════════

do $verification$
declare
  v_droit    integer;
  v_actif    integer;
  v_document integer;
begin
  select pg_catalog.count(*)::integer into v_droit
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ 'org_has_module_access\(\s*v_settings\.organization_id, ''loyalty''\)';
  if v_droit <> 1 then
    raise exception
      'vitrine_public_state ne garde pas la porte du passeport par le droit `loyalty` : elle serait annoncee a un commercant qui n''a pas le module, et son client tomberait sur le refus de la page publique';
  end if;

  select pg_catalog.count(*)::integer into v_actif
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ 'from public\.loyalty_programs l';
  if v_actif <> 1 then
    raise exception
      'vitrine_public_state ne lit pas loyalty_programs : la porte du passeport n''a aucune source, le lot serait inerte sans que rien ne le dise';
  end if;

  select pg_catalog.count(*)::integer into v_document
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state'
     and p.prosrc ~ '''loyalty'', \(';
  if v_document <> 1 then
    raise exception
      'vitrine_public_state ne publie pas la cle `loyalty` dans portes.experiences : la source est lue mais le document ne la porte pas, l''ecran n''a rien a peindre';
  end if;
end
$verification$;


-- ════════════════════════════════════════════════════════════
-- LE VOCABULAIRE DES CHOIX S'ÉLARGIT — `theme.jeux` PASSE DE DEUX À SIX
--
-- La fonction est RECRÉÉE EN ENTIER, contrairement à la RPC ci-dessus, et c'est
-- le motif de ce fichier depuis VIT-1a : `is_valid_vitrine_theme` n'est pas
-- patchée par `pg_get_functiondef`, elle est réécrite à chaque élargissement
-- (20261011120000, 20261014120000, 20261121120000, 20261125120000). La garde de
-- parité `src/lib/vitrine-parity.test.ts` suit la définition VIVANTE — le
-- dernier fichier, dans l'ordre des horodatages, qui la définit — et compare son
-- vocabulaire au miroir TypeScript. Elle lira donc celle-ci.
--
-- SEULE LA CLAUSE `jeux` CHANGE. Le reste est recopié à l'identique : cinq clés
-- de premier rang, couleurs, polices, styles de cartes, les sept blocs et les
-- vingt-cinq réglages d'allure avec leurs bornes.
-- ════════════════════════════════════════════════════════════

create or replace function public.is_valid_vitrine_theme(p_theme jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_couleurs jsonb;
  v_polices  jsonb;
  v_allure   jsonb;
  v_jeux     jsonb;
  v_blocs    text[] := '{}'::text[];
begin
  if p_theme is null then
    return true;
  end if;

  if jsonb_typeof(p_theme) <> 'object' then
    return false;
  end if;

  -- ── PREMIER RANG : six clés, toutes facultatives ──
  if exists (
    select 1 from jsonb_object_keys(p_theme) k
     where k not in ('couleurs', 'polices', 'style_cartes', 'ordre_blocs',
                     'allure', 'jeux')
  ) then
    return false;
  end if;

  -- ── `couleurs` : {primary, secondary}, hexadécimal à six chiffres ──
  if p_theme ? 'couleurs' then
    v_couleurs := p_theme -> 'couleurs';
    if jsonb_typeof(v_couleurs) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_couleurs) k
       where k not in ('primary', 'secondary')
    ) then
      return false;
    end if;
    if exists (
      select 1 from jsonb_each(v_couleurs) e
       where coalesce(jsonb_typeof(e.value), '') <> 'string'
          or (v_couleurs ->> e.key) !~ '^#[0-9a-fA-F]{6}$'
    ) then
      return false;
    end if;
  end if;

  -- ── `polices` : {heading, body}, dans le catalogue de src/lib/fonts.ts ──
  if p_theme ? 'polices' then
    v_polices := p_theme -> 'polices';
    if jsonb_typeof(v_polices) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_polices) k
       where k not in ('heading', 'body')
    ) then
      return false;
    end if;
    if exists (
      select 1 from jsonb_each(v_polices) e
       where coalesce(jsonb_typeof(e.value), '') <> 'string'
          or (v_polices ->> e.key) not in
             ('sans', 'elegant', 'impact', 'rounded', 'script', 'modern', 'mono')
    ) then
      return false;
    end if;
  end if;

  -- ── `style_cartes` : un mot d'une liste de trois ──
  if p_theme ? 'style_cartes' then
    if coalesce(jsonb_typeof(p_theme -> 'style_cartes'), '') <> 'string'
      or (p_theme ->> 'style_cartes') not in ('liste', 'grille', 'magazine')
    then
      return false;
    end if;
  end if;

  -- ── `ordre_blocs` : une permutation PARTIELLE des SEPT blocs ──
  if p_theme ? 'ordre_blocs' then
    if jsonb_typeof(p_theme -> 'ordre_blocs') <> 'array'
      or jsonb_array_length(p_theme -> 'ordre_blocs') > 7
    then
      return false;
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_theme -> 'ordre_blocs') e
       where jsonb_typeof(e.value) <> 'string'
          or (e.value #>> '{}') not in
             ('accroche', 'histoire', 'cartes', 'horaires', 'social',
              'reserver', 'experiences')
    ) then
      return false;
    end if;
    select array_agg(e.value #>> '{}')
      into v_blocs
      from jsonb_array_elements(p_theme -> 'ordre_blocs') e;
    if cardinality(coalesce(v_blocs, '{}'::text[]))
       <> (select count(distinct b) from unnest(coalesce(v_blocs, '{}'::text[])) b)
    then
      return false;
    end if;
  end if;

  -- ── `allure` : les vingt-cinq réglages visuels (VIT-13) ──
  if p_theme ? 'allure' then
    v_allure := p_theme -> 'allure';
    if jsonb_typeof(v_allure) <> 'object' then
      return false;
    end if;

    if exists (
      select 1 from jsonb_object_keys(v_allure) k
       where k not in (
         'motif', 'densite', 'style_fiche', 'photo_taille', 'photo_position',
         'style_prix', 'style_onglets', 'style_chips', 'style_rubrique',
         'barre_basse', 'carte_infos',
         'motif_opacite', 'rayon', 'ombre', 'echelle_texte',
         'hero_hauteur', 'hero_taille_nom', 'hero_voile',
         'entete_collant', 'capitales', 'capitales_desc', 'compte_rubrique',
         'monogramme', 'favoris', 'recherche')
    ) then
      return false;
    end if;

    if exists (
      select 1
        from jsonb_each(v_allure) e
        join (values
          ('motif',          array['aucun', 'diagonales', 'points', 'damier']),
          ('densite',        array['confortable', 'standard', 'compact']),
          ('style_fiche',    array['ombre', 'contour', 'plein']),
          -- « aucune » ET NON le mot qui designe une police sans empattement :
          -- ce mot-la est deja une cle de POLICE, et vitrine.test.sql compte
          -- ses occurrences quotees dans le corps de CETTE fonction pour
          -- prouver que les sept polices y sont recopiees. Une huitieme
          -- occurrence, venue d'une autre liste, cassait une garde sans
          -- rapport. Le mot n'est donc ecrit nulle part ici, PAS MEME DANS CE
          -- COMMENTAIRE : `prosrc` porte les commentaires, et la garde compte
          -- le texte installe.
          ('photo_taille',   array['grande', 'standard', 'vignette', 'aucune']),
          ('photo_position', array['droite', 'gauche', 'pleine']),
          ('style_prix',     array['simple', 'accent', 'pastille']),
          ('style_onglets',  array['soulignes', 'pastilles', 'segmentes']),
          ('style_chips',    array['contour', 'pleines', 'soulignees']),
          ('style_rubrique', array['carte', 'filet', 'simple']),
          ('barre_basse',    array['flottante', 'pleine', 'masquee']),
          ('carte_infos',    array['chevauche', 'dessous', 'masquee'])
        ) as v(cle, valeurs) on v.cle = e.key
       where coalesce(jsonb_typeof(e.value), '') <> 'string'
          or not ((v_allure ->> e.key) = any (v.valeurs))
    ) then
      return false;
    end if;

    if exists (
      select 1 from jsonb_each(v_allure) e
       where e.key in ('motif_opacite', 'rayon', 'ombre', 'echelle_texte',
                       'hero_hauteur', 'hero_taille_nom', 'hero_voile')
         and coalesce(jsonb_typeof(e.value), '') <> 'number'
    ) then
      return false;
    end if;

    if exists (
      select 1
        from jsonb_each(v_allure) e
        join (values
          ('motif_opacite',   0::numeric,    1::numeric),
          ('rayon',           0,             24),
          ('ombre',           0,             1),
          ('echelle_texte',   0.85,          1.3),
          ('hero_hauteur',    180,           420),
          ('hero_taille_nom', 28,            60),
          ('hero_voile',      0,             0.9)
        ) as v(cle, mini, maxi) on v.cle = e.key
       where (v_allure ->> e.key)::numeric not between v.mini and v.maxi
    ) then
      return false;
    end if;

    if exists (
      select 1 from jsonb_each(v_allure) e
       where e.key in ('entete_collant', 'capitales', 'capitales_desc',
                       'compte_rubrique', 'monogramme', 'favoris', 'recherche')
         and coalesce(jsonb_typeof(e.value), '') <> 'boolean'
    ) then
      return false;
    end if;
  end if;

  -- ── `jeux` : tout ce qui parait sur la carte (VIT-16, elargi VIT-32) ──
  --
  -- SIX booleens facultatifs, un par chose affichable. VIT-16 n'en connaissait
  -- que deux — les deux salons — parce que c'etaient les seuls dont le bloc
  -- « Jeux » ne savait pas dire s'ils devaient y figurer. Les quatre autres y
  -- figuraient d'office des que la base les ouvrait, et le commercant n'avait
  -- aucun moyen de retirer de sa carte un quiz qu'il garde pour un autre canal.
  --
  -- L'ABSENCE D'UNE CLE VAUT TOUJOURS « oui » cote application, et c'est encore
  -- plus vrai a six qu'a deux : faire valoir « non » a une cle absente aurait
  -- retire leurs quiz, leurs calendriers et leurs pronostics a TOUTES les
  -- vitrines publiees, en silence, le jour du deploiement.
  --
  -- LES MOTS SONT CEUX DE portes.experiences, A LA LETTRE — y compris les
  -- pluriels. L'ecran croise les deux documents cle par cle ; une table de
  -- traduction entre le mot du choix et le mot de la porte aurait ete un
  -- troisieme endroit ou se tromper, et le seul qu'aucune garde ne lit.
  --
  -- ECARTE : le bloc « Reserver ». Il n'est pas un jeu, et il a DEJA son
  -- reglage — sa presence dans ordre_blocs. L'ajouter ici aurait donne deux
  -- facons de dire la meme chose, dont la premiere a partir ecrase l'autre.
  if p_theme ? 'jeux' then
    v_jeux := p_theme -> 'jeux';
    if jsonb_typeof(v_jeux) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_jeux) k
       where k not in ('duo', 'bande', 'quiz', 'calendars',
                       'pronostics', 'loyalty')
    ) then
      return false;
    end if;
    if exists (
      select 1 from jsonb_each(v_jeux) e
       where coalesce(jsonb_typeof(e.value), '') <> 'boolean'
    ) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

comment on function public.is_valid_vitrine_theme(jsonb) is
  'Valide la FORME du thème d''une vitrine (VIT-1a, étendu VIT-13, VIT-16 puis '
  'VIT-32). FERMÉE AUX DEUX RANGS — clés de premier rang dans {couleurs, '
  'polices, style_cartes, ordre_blocs, allure, jeux}, et clés exactes dans '
  'chaque objet. `allure` : vingt-cinq réglages — onze listes fermées, sept '
  'nombres bornés, sept booléens. `jeux` : {duo, bande, quiz, calendars, '
  'pronostics, loyalty} — six booléens facultatifs, aux mots EXACTS de '
  '`portes.experiences`, dont l''ABSENCE vaut « affiché » côté application : '
  'c''est ce qui garde intactes les vitrines publiées avant chaque '
  'élargissement.';

revoke all on function public.is_valid_vitrine_theme(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_vitrine_theme(jsonb)
  to authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- LA GARDE DE SORTIE DU VOCABULAIRE
--
-- Celle-ci n'est PAS textuelle : elle appelle la fonction vivante. Un
-- `create or replace` qui aurait échoué à moitié, ou une clause recopiée de
-- travers, rendrait un validateur qui compile et qui refuse — et la première
-- personne à s'en apercevoir serait un commerçant devant une 23514 illisible,
-- qui emporterait au passage les vingt-cinq réglages d'allure valides du même
-- document.
--
-- Les deux sens sont exigés. Accepter les six sans refuser le septième
-- laisserait passer une clause ouverte à tout ; refuser le septième sans
-- accepter les six laisserait passer un vocabulaire qui n'a pas grandi.
-- ════════════════════════════════════════════════════════════

do $vocabulaire$
begin
  if not public.is_valid_vitrine_theme(
       '{"jeux":{"duo":true,"bande":false,"quiz":true,
                 "calendars":false,"pronostics":true,"loyalty":false}}'::jsonb)
  then
    raise exception
      'is_valid_vitrine_theme refuse les six choix de VIT-32 : le vocabulaire n''a pas grandi, et le studio ecrirait un theme que la base rejette en bloc';
  end if;

  if public.is_valid_vitrine_theme('{"jeux":{"reserver":true}}'::jsonb) then
    raise exception
      'is_valid_vitrine_theme accepte un septieme mot dans `jeux` : la clause est ouverte a tout, et une faute de frappe deviendrait une cle stockee que personne ne lit';
  end if;

  if public.is_valid_vitrine_theme('{"jeux":{"duo":"oui"}}'::jsonb) then
    raise exception
      'is_valid_vitrine_theme accepte une valeur non booleenne dans `jeux` : le miroir applicatif lirait autre chose qu''un choix';
  end if;
end
$vocabulaire$;
