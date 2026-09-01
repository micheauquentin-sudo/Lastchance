-- ════════════════════════════════════════════════════════════
-- VITRINE — QUELS JEUX PARAISSENT SUR LA CARTE (VIT-16)
--
-- `ordre_blocs` porte UN mot, `experiences` : il dit si le bloc des jeux
-- existe, pas lequel des deux y figure. Le commerçant qui voulait le Duo
-- Miroir sans le Portrait de la Bande n'avait aucun moyen de le dire — le bloc
-- les montrait tous les deux, ou aucun.
--
-- ── L'ABSENCE VAUT « LES DEUX », ET C'EST LA COMPATIBILITÉ ──
--
-- Une vitrine qui a déjà `experiences` dans son ordre affiche AUJOURD'HUI les
-- deux jeux. Faire valoir `false` à une clé absente les aurait retirés de
-- toutes les pages publiées, en silence. C'est le piège exact du vocabulaire de
-- secteur (VIT-13), et c'est la même réponse : ce qui n'a pas été décidé garde
-- le comportement d'hier. Seul un `false` ÉCRIT masque un jeu.
--
-- Aucun remplissage rétroactif n'est donc nécessaire ici : l'absence EST le
-- comportement voulu pour l'existant.
--
-- ── DEUX BOOLÉENS, PAS UNE LISTE ──
--
-- Une liste `["duo"]` aurait rendu l'absence ambiguë : liste vide ou clé
-- manquante ? Deux booléens facultatifs disent exactement trois états par jeu
-- — voulu, refusé, pas encore décidé — et c'est le troisième qui compte.
--
-- Miroir de `JeuxVitrine` et `VITRINE_JEUX` (src/lib/vitrine.ts) ; la parité
-- est gardée par `src/lib/vitrine-parity.test.ts`.
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

  -- ── `jeux` : quels jeux paraissent sur la carte (VIT-16) ──
  --
  -- Deux booleens facultatifs. L'ABSENCE d'une cle vaut « oui » cote
  -- application : c'est ce qui garde intactes les vitrines deja publiees.
  if p_theme ? 'jeux' then
    v_jeux := p_theme -> 'jeux';
    if jsonb_typeof(v_jeux) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_jeux) k
       where k not in ('duo', 'bande')
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
  'Valide la FORME du thème d''une vitrine (VIT-1a, étendu VIT-13 puis VIT-16). '
  'FERMÉE AUX DEUX RANGS — clés de premier rang dans {couleurs, polices, '
  'style_cartes, ordre_blocs, allure, jeux}, et clés exactes dans chaque objet. '
  '`allure` : vingt-cinq réglages — onze listes fermées, sept nombres bornés, '
  'sept booléens. `jeux` : {duo, bande}, deux booléens facultatifs dont '
  'l''ABSENCE vaut « affiché » côté application — c''est ce qui garde intactes '
  'les vitrines publiées avant ce lot.';

revoke all on function public.is_valid_vitrine_theme(jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_vitrine_theme(jsonb)
  to authenticated, service_role;
