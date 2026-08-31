-- ════════════════════════════════════════════════════════════
-- VITRINE — L'ALLURE ET LE SECTEUR (VIT-13)
--
-- La vitrine publique prend l'allure de la carte de référence : hero pleine
-- largeur, onglets collants, chips filtrantes, fiches à photo latérale, barre
-- basse. Deux choses seulement descendent jusqu'ici.
--
--  1. `secteur` — ce que le commerce EST. Il choisit les MOTS que le visiteur
--     lit (« Nos cartes » / « Nos prestations » / « Nos chambres ») et le
--     préréglage de palette. La mise en page, elle, ne dépend jamais de lui.
--  2. `theme.allure` — les vingt-cinq réglages visuels, sous UNE seule clé de
--     premier rang.
--
-- Plus `badge_ouverture`, la phrase du hero.
--
-- ════════════════════════════════════════════════════════════
-- POURQUOI `allure` EST UN OBJET IMBRIQUÉ ET NON VINGT-CINQ CLÉS
-- ════════════════════════════════════════════════════════════
--
-- `is_valid_vitrine_theme` ferme les clés AUX DEUX RANGS depuis VIT-1a. Poser
-- vingt-cinq réglages à la racine aurait porté la liste blanche du premier rang
-- à vingt-neuf entrées, où « ce qui structure la page » (`ordre_blocs`) et « ce
-- qui la décore » (`rayon`) auraient été indiscernables à la relecture. Un seul
-- objet garde le premier rang à cinq mots, et la fermeture du second rang reste
-- une liste qu'on peut lire d'un coup d'œil.
--
-- ════════════════════════════════════════════════════════════
-- CE FICHIER NE RECOPIE AUCUNE DES DEUX RPC — LIRE 20261027120000
-- ════════════════════════════════════════════════════════════
--
-- `vitrine_public_state` et `vitrine_dashboard_state` portent des patchs
-- successifs appliqués par `pg_get_functiondef` + `replace` (20261020120000,
-- 20261027120000, 20261101120000), invisibles à toute recherche de
-- `create ... function`. Un `create or replace` recopié depuis un fichier les
-- efface — c'est ce que 20261023120000 a fait, et ce que 20261026120000 a dû
-- réparer EN PRODUCTION.
--
-- Cette migration insère donc ses deux clés après une ancre, dans le corps
-- VIVANT, et vérifie que l'ancre est unique avant d'écrire.
--
-- `is_valid_vitrine_theme`, elle, se recopie sans risque : c'est un validateur
-- pur, défini une seule fois par fichier (20261014120000 en dernier), que
-- personne n'a jamais patché textuellement.
-- ════════════════════════════════════════════════════════════

-- ── 1. LE SECTEUR ────────────────────────────────────────────

-- ── LE REMPLISSAGE RÉTROACTIF EST « restaurant », LE DÉFAUT EST « commerce » ──
--
-- Ce n'est pas une coquetterie, et l'ordre des deux ordres compte.
--
-- Les vitrines DÉJÀ EN LIGNE affichent aujourd'hui le vocabulaire de la
-- restauration — « Nos cartes », « Réserver une table », « Aucun plat ne
-- correspond » — parce que c'était le SEUL qui existait. Créer la colonne avec
-- le neutre aurait changé les mots de chaque page publiée, en production, sans
-- que le commerçant l'ait demandé ni même su : un fleuriste verrait « Notre
-- catalogue » là où il lisait « Nos cartes » hier.
--
-- `add column ... default 'restaurant'` remplit donc l'existant avec ce qu'il
-- AFFICHE DÉJÀ — aucun changement visible nulle part — puis `set default`
-- bascule la colonne sur le neutre pour les vitrines À NAÎTRE, qui n'ont, elles,
-- aucun vocabulaire à préserver.
--
-- Les deux ordres sont rejouables : `if not exists` ne refait rien, et poser
-- deux fois le même défaut est sans effet. Sur une base déjà migrée, ce bloc ne
-- touche donc AUCUNE ligne — en particulier pas celles dont le commerçant a
-- depuis choisi son métier.

alter table public.vitrine_settings
  add column if not exists secteur text not null default 'restaurant';

alter table public.vitrine_settings
  alter column secteur set default 'commerce';

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'vitrine_settings_secteur_vocab'
       and conrelid = 'public.vitrine_settings'::regclass
  ) then
    alter table public.vitrine_settings
      add constraint vitrine_settings_secteur_vocab
      check (secteur in ('restaurant', 'bar', 'coiffeur', 'fleuriste',
                         'hotel', 'spa', 'commerce'));
  end if;
end
$migration$;

comment on column public.vitrine_settings.secteur is
  'Le métier du commerce (VIT-13). Il choisit le VOCABULAIRE public — « Nos '
  'cartes » chez un restaurant, « Nos prestations » chez un coiffeur, « Nos '
  'chambres » à l''hôtel — et le préréglage de palette et de polices. Il ne '
  'change JAMAIS la mise en page : les sept secteurs rendent le même écran, '
  'sans quoi il y aurait sept écrans à tenir d''accord au lieu d''un. '
  '`commerce` est le défaut NEUTRE, et non un septième métier : c''est ce que '
  'rend une vitrine dont personne n''a rien dit, y compris toutes celles '
  'écrites avant cette colonne. Miroir de VITRINE_SECTEURS (src/lib/vitrine.ts).';

-- ── 2. LE BADGE DU HERO ──────────────────────────────────────
--
-- UN TEXTE ÉCRIT À LA MAIN, ET NON UN CALCUL. `horaires_texte` est un champ
-- multiligne LIBRE (« Fermé le lundi midi », « Service continu l'été ») : rien
-- n'en déduit une ouverture à l'instant T sans se tromper un jour férié, et un
-- badge « Ouvert » faux sur une page publique fait déplacer un client pour
-- rien — strictement pire que pas de badge. Le commerçant écrit donc la phrase
-- qu'il assume, et `null` la retire.

alter table public.vitrine_settings
  add column if not exists badge_ouverture text;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'vitrine_settings_badge_ouverture_len'
       and conrelid = 'public.vitrine_settings'::regclass
  ) then
    alter table public.vitrine_settings
      add constraint vitrine_settings_badge_ouverture_len
      check (badge_ouverture is null
             or pg_catalog.char_length(pg_catalog.btrim(badge_ouverture))
                between 1 and 48);
  end if;
end
$migration$;

comment on column public.vitrine_settings.badge_ouverture is
  'La pastille du hero (VIT-13) — « Ouvert · 12h–23h », écrite à la main par '
  'le commerçant. 48 caractères : au-delà, elle passe à la ligne par-dessus le '
  'nom du commerce dans une largeur de téléphone. `null` la retire. Un horaire '
  'STRUCTURÉ (jour, plage, exceptions, fuseau, jours fériés) est un autre lot.';

-- ── 3. LES DROITS D'ÉCRITURE ─────────────────────────────────
--
-- `vitrine_settings` accorde ses droits COLONNE PAR COLONNE. Une colonne neuve
-- n'hérite donc de RIEN, et l'oublier ne casse pas la lecture : le tableau de
-- bord affiche le champ, l'enregistrement échoue en silence sur un 42501 que
-- personne ne relie au réglage. C'est exactement le défaut RDV-12, trouvé après
-- coup trois fois de suite sur `reservations`. Les deux colonnes sont donc
-- accordées ICI, dans le même fichier que leur création.

grant update (secteur, badge_ouverture) on public.vitrine_settings to authenticated;

-- ── 4. LE VALIDATEUR DE THÈME, ÉTENDU À `allure` ─────────────
--
-- Recopie de 20261014120000, plus la cinquième clé de premier rang et la
-- fermeture de son second rang.

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
  v_blocs    text[] := '{}'::text[];
begin
  if p_theme is null then
    return true;
  end if;

  if jsonb_typeof(p_theme) <> 'object' then
    return false;
  end if;

  -- ── PREMIER RANG : cinq clés, toutes facultatives ──
  if exists (
    select 1 from jsonb_object_keys(p_theme) k
     where k not in ('couleurs', 'polices', 'style_cartes', 'ordre_blocs',
                     'allure')
  ) then
    return false;
  end if;

  -- ── `couleurs` : {primary, secondary}, hexadécimal à six chiffres ──
  --
  -- La forme courte `#abc` est REFUSÉE, et ce n'est pas une coquetterie : la
  -- couleur voyage jusqu'à un attribut `style` et jusqu'à un QR, et deux
  -- écritures de la même couleur rendent la comparaison « le thème a-t-il
  -- changé » fausse.
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
  --
  -- PARITÉ AVEC `FONT_KEYS` (src/lib/fonts.ts) — recopie assumée, surveillée
  -- par vitrine.test.sql et par la garde applicative côté `src/lib`.
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
  --
  -- Partielle et non totale : masquer un bloc, c'est l'omettre. C'EST LE
  -- RÉGLAGE COMMERÇANT DES PORTES (VIT-3) — retirer `reserver` de la liste
  -- retire le bloc des réservations de la page publique.
  --
  -- Ce qui est refusé, c'est le DOUBLON — un bloc listé deux fois ferait rendre
  -- deux fois l'histoire du lieu, et aucune couche au-dessus ne le rattraperait.
  if p_theme ? 'ordre_blocs' then
    if jsonb_typeof(p_theme -> 'ordre_blocs') <> 'array'
      or jsonb_array_length(p_theme -> 'ordre_blocs') > 7
    then
      return false;
    end if;
    -- `e.value #>> '{}'` et NON `e.value ->> …` : sur un élément SCALAIRE, le
    -- déréférencement par chemin VIDE rend le texte nu, là où `::text` aurait
    -- rendu `"histoire"` AVEC ses guillemets.
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
  --
  -- TOUTES FACULTATIVES, ET LE SECOND RANG EST FERMÉ. Une clé inconnue refuse
  -- le thème ENTIER — même contrat qu'aux quatre autres. Une clé tolérée en
  -- silence est une clé qu'on croit lue alors que rien ne la lit, et le
  -- commerçant chercherait longtemps pourquoi son réglage ne fait rien.
  --
  -- Miroir de VITRINE_ALLURE_ENUMS, VITRINE_ALLURE_BORNES et
  -- VITRINE_ALLURE_BOOLEENS (src/lib/vitrine.ts). La parité est surveillée par
  -- src/lib/vitrine-parity.test.ts, qui lit la définition VIVANTE de cette
  -- fonction — donc ce fichier tant qu'aucune migration ultérieure ne la
  -- recrée. Cinq gardes : les 25 clés, les 11 listes, les 7 bornes, les 7
  -- interrupteurs, et l'appartenance de chaque défaut à sa propre liste.
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

    -- Les onze listes. `->>` sur un scalaire non-textuel rend sa
    -- représentation et ne lève rien : le `or` est sûr ici.
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

    -- Les sept curseurs, EN DEUX PASSES.
    --
    -- Le type d'abord, la borne ensuite, et jamais dans le même `or` : SQL ne
    -- garantit aucun court-circuit, et `('bleu')::numeric` lèverait une
    -- exception. Dans une fonction `immutable` appelée depuis un `check`, cela
    -- ferait ÉCHOUER l'insertion sur une 22P02 illisible au lieu de la
    -- REFUSER proprement sur la contrainte.
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

    -- Les sept interrupteurs.
    if exists (
      select 1 from jsonb_each(v_allure) e
       where e.key in ('entete_collant', 'capitales', 'capitales_desc',
                       'compte_rubrique', 'monogramme', 'favoris', 'recherche')
         and coalesce(jsonb_typeof(e.value), '') <> 'boolean'
    ) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

comment on function public.is_valid_vitrine_theme(jsonb) is
  'Valide la FORME du thème d''une vitrine (VIT-1a, étendu VIT-13). FERMÉE AUX '
  'DEUX RANGS — clés de premier rang dans {couleurs, polices, style_cartes, '
  'ordre_blocs, allure}, et clés exactes dans chaque objet. `couleurs` : '
  '#RRGGBB, forme courte refusée. `polices` : miroir de FONT_KEYS. '
  '`style_cartes` : liste/grille/magazine. `ordre_blocs` : permutation '
  'PARTIELLE et sans doublon des sept blocs. `allure` : les vingt-cinq '
  'réglages visuels — onze listes fermées, sept nombres bornés, sept booléens. '
  'Une clé d''allure inconnue refuse le thème ENTIER : une clé tolérée en '
  'silence est une clé qu''on croit lue alors que rien ne la lit.';

revoke all on function public.is_valid_vitrine_theme(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_vitrine_theme(jsonb)
  to authenticated, service_role;

-- ── 5. LES DEUX CLÉS DANS LA LECTURE PUBLIQUE ────────────────
--
-- Patch textuel du corps VIVANT — voir l'en-tête. L'ancre est la clé posée par
-- 20261027120000, la dernière à avoir touché ce bloc `identite`.

do $migration$
declare
  v_def text;
  v_ancre constant text := '      ''indexable'', v_settings.indexable,';
  v_neuf  constant text :=
       '      ''indexable'', v_settings.indexable,' || E'\n'
    -- LES COMMENTAIRES INJECTES SONT EN ASCII SANS APOSTROPHE, comme ceux de
    -- 20261027120000. Ils traversent deux niveaux de citation (ce littéral,
    -- puis le corps dollar-quoté que `execute` reparse) : une apostrophe s'y
    -- écrit `''`, se relit doublée dans `pg_get_functiondef`, et se redouble
    -- au patch suivant. Les accents, eux, dépendent de l'encodage de la
    -- session qui rejoue. Ni l'un ni l'autre ne vaut le risque pour un
    -- commentaire.
    || '      -- VIT-13 : le metier choisit les MOTS du chrome et le'
    || ' prereglage' || E'\n'
    || '      -- de palette. La mise en page ne depend jamais de lui.'
    || E'\n'
    || '      ''secteur'', v_settings.secteur,' || E'\n'
    || '      -- La pastille du hero, ECRITE A LA MAIN : horaires_texte est'
    || ' libre' || E'\n'
    || '      -- et multiligne, aucun calcul fiable ne dit ouvert a l instant T.'
    || E'\n'
    || '      ''badge_ouverture'', v_settings.badge_ouverture,';
  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_public_state';

  -- DÉJÀ POSÉE : on sort sans bruit. Motif de 20261026120000 — une migration
  -- doit pouvoir se rejouer sur une base déjà à jour.
  if pg_catalog.strpos(v_def, '''secteur'', v_settings.secteur') > 0 then
    return;
  end if;

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_ancre, '')))
            / pg_catalog.length(v_ancre);
  if v_hits <> 1 then
    raise exception
      'vitrine_public_state porte % occurrence(s) de la cle indexable au lieu d''une seule : la fonction a change',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_ancre, v_neuf);
end
$migration$;

-- ── 6. LES DEUX CLÉS DANS LA LECTURE COMMERÇANT ──────────────
--
-- L'éditeur doit relire ce qu'il vient d'écrire, sans quoi le champ repart vide
-- à chaque ouverture de l'écran. Indentation à HUIT espaces ici : le bloc
-- `identite` du tableau de bord est imbriqué d'un niveau de plus.

do $migration$
declare
  v_def text;
  v_ancre constant text := '        ''indexable'', v_settings.indexable,';
  v_neuf  constant text :=
       '        ''indexable'', v_settings.indexable,' || E'\n'
    || '        ''secteur'', v_settings.secteur,' || E'\n'
    || '        ''badge_ouverture'', v_settings.badge_ouverture,';
  v_hits integer;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into strict v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'vitrine_dashboard_state';

  if pg_catalog.strpos(v_def, '''secteur'', v_settings.secteur') > 0 then
    return;
  end if;

  v_hits := (pg_catalog.length(v_def)
             - pg_catalog.length(pg_catalog.replace(v_def, v_ancre, '')))
            / pg_catalog.length(v_ancre);
  if v_hits <> 1 then
    raise exception
      'vitrine_dashboard_state porte % occurrence(s) de la cle indexable au lieu d''une seule : la fonction a change',
      v_hits;
  end if;

  execute pg_catalog.replace(v_def, v_ancre, v_neuf);
end
$migration$;

-- ── 7. LA GARDE ──────────────────────────────────────────────
--
-- Les deux patchs ci-dessus sortent SANS BRUIT quand la clé est déjà là (rejeu)
-- et lèvent quand l'ancre a bougé. Il reste un cas qu'aucun des deux ne couvre :
-- une base où l'ancre n'existait pas du tout, où `strpos` vaut 0, où `v_hits`
-- vaut 0 — et où l'exception aurait bien été levée. Ce bloc le redit à
-- l'endroit où on le lira : après la migration, les deux fonctions portent les
-- deux clés, ou la migration n'est pas passée.

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'vitrine_public_state'
       and pg_catalog.strpos(
             pg_catalog.pg_get_functiondef(p.oid),
             '''badge_ouverture'', v_settings.badge_ouverture') > 0
  ) then
    raise exception 'vitrine_public_state ne rend pas badge_ouverture';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'vitrine_dashboard_state'
       and pg_catalog.strpos(
             pg_catalog.pg_get_functiondef(p.oid),
             '''secteur'', v_settings.secteur') > 0
  ) then
    raise exception 'vitrine_dashboard_state ne rend pas secteur';
  end if;
end
$migration$;
