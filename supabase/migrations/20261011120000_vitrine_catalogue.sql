-- ============================================================
-- VITRINE — LA COUCHE SQL DU CATALOGUE QR (VIT-1a, lot L10)
--
-- Le lot L2 (20261001120000) a livré le DROIT `vitrine` et rien d'autre, en
-- écrivant noir sur blanc ce qu'il ne faisait pas : « aucune table de ressource
-- vitrine, donc aucun trigger guard_module_publication : il n'y a rien à publier
-- encore ». Ce fichier crée cette ressource, et referme la phrase — le trigger
-- arrive avec la table qu'il garde.
--
-- ── LA STRUCTURE, ET POURQUOI CES QUATRE NIVEAUX ──
--
--   organisation → N CARTES → CATÉGORIES → FICHES
--
-- Ce n'est pas une hiérarchie inventée ici : c'est celle que le benchmark
-- (docs/benchmark-mennoo.md §2) a MESURÉE sur la référence du marché — un même
-- lieu y publie sept listes distinctes (Menu, Fruits de mer, Livraison,
-- Desserts, Vins, Boissons, Menu sans photos), chacune avec ses sous-catégories.
-- Un seul niveau de catégories sous une carte unique aurait forcé le commerçant
-- à écrire « MIDI — Entrées » et « SOIR — Entrées » dans le même tiroir, et
-- l'écran n'aurait eu aucun moyen de rendre « la carte des vins » sans la
-- deviner par le préfixe d'un libellé.
--
-- ── FR SEUL. L'ANGLAIS EST LE LOT SUIVANT, ET C'EST UNE DÉCISION ──
--
-- Aucune colonne `_en`, aucune table de traductions ici. Le benchmark conclut
-- que la traduction est un ASSET STOCKÉ ET VERSIONNÉ PAR LANGUE, servi par
-- `?lang=`, avec un cache par hash de fiche — donc une table à part, avec sa
-- clé de version, et non deux colonnes jumelles par champ traduisible. Poser
-- `nom_en` aujourd'hui aurait figé le mauvais modèle : il ne sait pas exprimer
-- « cette traduction est périmée depuis que la description a changé », qui est
-- exactement ce que L11 doit rendre vrai.
--
-- ── AUCUNE PROMESSE DE STOCK TEMPS RÉEL ──
--
-- `vitrine_items.disponible` est un BOOLÉEN SAISI À LA MAIN, et le cahier
-- l'exige en toutes lettres : « état de disponibilité saisi manuellement, sans
-- promesse de synchronisation de stock ». Il n'est décrémenté par personne, il
-- ne se recharge pas, aucun cron ne le touche. La fiche indisponible est RENDUE
-- QUAND MÊME par la RPC publique, avec son drapeau : l'écran la grise. La
-- retirer de la réponse aurait fait disparaître un plat de la carte au lieu de
-- le montrer épuisé — deux messages très différents pour le client qui cherche
-- ce qu'il a mangé la semaine dernière.
--
-- ── LE VOCABULAIRE EST À LA PLATEFORME, PAS AU COMMERÇANT ──
--
-- Badges de régime et allergènes sont des LISTES FERMÉES, gardées par `check`.
-- Deux raisons, et la seconde est économique :
--
--   * RÉGLEMENTAIRE. Les quatorze allergènes sont ceux de l'annexe II du
--     règlement UE 1169/2011. Un champ libre y aurait laissé écrire « noix ? »
--     ou « peut contenir des traces », c'est-à-dire une information que
--     personne ne peut ni filtrer ni traduire, sur le seul sujet où se tromper
--     compte vraiment.
--   * TRADUISIBLE UNE FOIS POUR TOUTES. Le benchmark en fait sa conclusion la
--     plus utile : « badges/allergènes = vocabulaire fixe plateforme, traduit
--     une fois pour toutes, coût nul par commerce ». Un vocabulaire libre aurait
--     mis les champs les plus sensibles de la carte dans le pipeline de
--     traduction automatique de L11 — précisément là où le cahier interdit
--     qu'une machine publie sans contrôle.
--
-- ── LA PUBLICATION : `published` EN BASE, LE DRAPEAU AILLEURS ──
--
-- Décision actée : la vitrine reste SOUS DRAPEAU SERVEUR jusqu'à L11. Ce
-- fichier ne connaît pas ce drapeau et n'a pas à le connaître — il vit côté
-- application, où il peut se retirer sans migration. Ce que la base tient, et
-- elle seule peut le tenir, c'est `published` PAR ORGANISATION, plus les deux
-- gardes qui lui donnent son sens :
--
--   * en LECTURE, `vitrine_public_state` exige `published` ET le droit
--     `vitrine` vivant — un abonnement qui s'arrête éteint la vitrine sans
--     qu'aucun travail de fond n'ait à passer ;
--   * en ÉCRITURE, `guard_module_publication` refuse la TRANSITION vers
--     `published = true` à qui n'a pas le droit, exactement comme les neuf
--     autres modules. Le retour en arrière n'est jamais gardé : on ne bloque
--     pas quelqu'un qui veut dépublier.
--
-- ── CE QUE CE FICHIER NE FAIT PAS ──
--
--   * Aucun pipeline d'images. `cover_path` et `photo_path` sont des CHEMINS
--     texte : le bucket, la conversion et les tailles vivent côté application,
--     comme pour les logos et les affiches. La base ne valide pas qu'un fichier
--     existe — elle mentirait à la première suppression de bucket.
--   * Aucune policy `anon`, sur aucune des quatre tables. Le visiteur ne lit
--     JAMAIS ces lignes directement : il passe par une RPC `service_role` qui
--     choisit ce qui sort. C'est le motif du dépôt depuis RES-1a.
--   * Aucun QR, aucune analytique de consultation, aucun lien vers Réserver ou
--     les Expériences : ce sont VIT-2 et VIT-3.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. LES VALIDATEURS — trois fonctions immuables, appelées par des `check`
--
-- Motif des validateurs du dépôt (`is_valid_experience_steps`, 20261007120000 ;
-- `is_valid_progression_rule`, 20260805200000) : `immutable`,
-- `set search_path = pg_catalog` — d'où les appels NON qualifiés, qui s'y
-- résolvent — et RENDUES À PERSONNE. Un `check` de table évalue son expression
-- sans contrôle de privilège ; une RPC `security definer` appartenant au
-- propriétaire les atteint de même. Personne d'autre n'a de raison de les
-- appeler.
-- ────────────────────────────────────────────────────────────

-- ── 1a. Le vocabulaire réservé des slugs publics ─────────────
--
-- POURQUOI UNE FONCTION ET NON UN `not in (…)` DANS LE `check` : la même liste
-- doit servir DEUX FOIS — la contrainte de table, qui est le filet, et
-- `set_vitrine_slug`, qui est la porte et doit rendre au commerçant un refus
-- QUI SE DISTINGUE de « mal formé ». Recopiée aux deux endroits, elle aurait
-- divergé à la première addition, et c'est la copie du `check` qui aurait gagné
-- — en 23514, un code que l'écran ne sait pas traduire.
--
-- CE QUE LA LISTE PROTÈGE : la vitrine est servie sous une adresse publique de
-- premier niveau. Un slug `admin`, `api` ou `dashboard` n'est pas une faille en
-- soi — le routage de l'application décide, pas cette table — mais il crée une
-- collision d'intention que personne ne remarque avant de la voir en
-- production, et un commerçant qui a imprimé ses QR ne peut plus reculer.
create or replace function public.is_reserved_vitrine_slug(p_slug text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_slug is null then
    return false;
  end if;
  return lower(btrim(p_slug)) = any (array[
    -- Les segments que l'application se réserve aujourd'hui.
    'admin', 'api', 'dashboard', 'app', 'auth', 'login', 'logout', 'signup',
    'account', 'settings', 'billing', 'stripe', 'webhook', 'webhooks',
    -- Les segments publics déjà servis par le produit.
    'play', 'pronos', 'scan', 'jouer', 'wallet', 'portefeuille', 'reserver',
    'vitrine', 'menu', 'carte',
    -- Les segments techniques et d'infrastructure.
    'static', 'assets', 'public', 'www', 'cdn', 'health', 'status',
    'robots', 'sitemap', 'favicon', 'next',
    -- Les segments institutionnels du site.
    'blog', 'help', 'support', 'contact', 'legal', 'cgu', 'cgv', 'privacy',
    'pricing', 'tarifs', 'demo',
    -- Les verbes qu'un routeur finit toujours par vouloir.
    'new', 'edit', 'test'
  ]);
end;
$$;

comment on function public.is_reserved_vitrine_slug(text) is
  'Vrai si le slug demandé appartient au vocabulaire RÉSERVÉ de la plateforme. '
  'Appelée à deux endroits qui ne peuvent pas diverger : le `check` de '
  'vitrine_settings.slug (le filet) et set_vitrine_slug (la porte, qui rend '
  '« reserved_slug » plutôt qu''un 23514 illisible). Rendue à personne : les '
  '`check` évaluent sans contrôle de privilège et la RPC `security definer` '
  'l''atteint par son propriétaire.';

revoke all on function public.is_reserved_vitrine_slug(text)
  from public, anon, authenticated, service_role;


-- ── 1b. Le vocabulaire d'un tableau fermé ────────────────────
--
-- UNE SEULE FONCTION POUR LES BADGES ET LES ALLERGÈNES, et le vocabulaire reste
-- ÉCRIT DANS LA DDL de la table. C'est délibéré : la FORME (une dimension, pas
-- de null, pas de doublon, borné au vocabulaire) est la même des deux côtés et
-- n'a aucune raison d'être écrite deux fois ; les VALEURS, elles, doivent se
-- lire dans `pg_get_constraintdef` — c'est là que `vitrine.test.sql` va les
-- compter, et une liste enfermée dans un corps de fonction ne se compte pas.
--
-- LE REFUS DES DOUBLONS N'EST PAS DU ZÈLE. Un `check` ne peut pas contenir de
-- sous-requête, donc `count(distinct …)` n'y est pas exprimable ; sans cette
-- fonction, `{vegan,vegan}` entrait en base et l'écran rendait deux fois le
-- même badge sur la même fiche.
create or replace function public.is_valid_vitrine_vocabulaire(
  p_valeurs text[],
  p_vocabulaire text[]
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_n integer;
begin
  -- `null` est VALIDE ici : c'est l'absence. Ce qui l'interdit aux deux
  -- colonnes, c'est leur `not null default '{}'`, pas ce validateur — même
  -- séparation que `is_valid_experience_steps`.
  if p_valeurs is null then
    return true;
  end if;

  -- `array_ndims` rend 0 sur un tableau vide et non null : le `coalesce` ne
  -- couvre donc qu'un cas théorique, mais il coûte moins cher que de dépendre
  -- d'un détail de version sur une garde qui décide d'un refus.
  if coalesce(array_ndims(p_valeurs), 1) > 1 then
    return false;
  end if;

  v_n := cardinality(p_valeurs);

  -- Le plafond N'EST PAS un nombre choisi : c'est la taille du vocabulaire.
  -- Un tableau plus long que la liste fermée contient forcément un doublon,
  -- et le dire ici rend le refus indépendant de la liste.
  if v_n > cardinality(p_vocabulaire) then
    return false;
  end if;

  -- Un `null` DANS le tableau : `<@` le laisserait passer en silence
  -- (`array[null]::text[] <@ array['a']` rend null, pas false), et le `check`
  -- accepte tout ce qui n'est pas false. C'est le même piège que les `coalesce`
  -- de is_valid_experience_steps, et il se ferme de la même façon — par un
  -- test à part, avant.
  if array_position(p_valeurs, null) is not null then
    return false;
  end if;

  if not (p_valeurs <@ p_vocabulaire) then
    return false;
  end if;

  if v_n <> (select count(distinct v) from unnest(p_valeurs) v) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.is_valid_vitrine_vocabulaire(text[], text[]) is
  'Valide un tableau de VOCABULAIRE FERMÉ : une dimension, aucun `null`, aucun '
  'doublon, tout élément appartenant au vocabulaire passé en second argument. '
  'Le vocabulaire reste écrit dans le `check` de la table — c''est là qu''il se '
  'lit et se compte — la fonction ne porte que la forme, identique pour les '
  'badges de régime et les allergènes UE-14. `null` est accepté : les deux '
  'colonnes sont `not null default ''{}''`. Rendue à personne.';

revoke all on function public.is_valid_vitrine_vocabulaire(text[], text[])
  from public, anon, authenticated, service_role;


-- ── 1c. Le thème — CLÉS EXACTES, PAS DE PASSAGER CLANDESTIN ──
--
-- LA LEÇON DE L8, APPLIQUÉE SANS L'ATTENDRE. `is_valid_experience_steps` a été
-- livrée une première fois OUVERTE : elle exigeait les clés utiles bien formées
-- et se taisait sur tout le reste. Une carte
-- `{"title":"…","body":"…","cta":"https://…"}` entrait donc en base sous une
-- colonne réputée validée, où plus rien ne la bornait — ni en longueur, ni en
-- nature — et le jour où un écran aurait décidé d'afficher `cta`, il aurait
-- rendu une chaîne que personne n'avait jamais vérifiée.
--
-- Le thème est exactement la même colonne à risque, en pire : c'est le tiroir
-- où l'on rangera tout ce qui « tient dans le style ». Il est donc FERMÉ AUX
-- DEUX NIVEAUX — les clés de premier rang, et les clés de chaque objet.
--
-- ── LA PARITÉ DES POLICES, ET POURQUOI ELLE EST RECOPIÉE ICI ──
--
-- Les sept clés admises sont EXACTEMENT `FONT_KEYS` de `src/lib/fonts.ts`. La
-- liste est recopiée parce qu'un `check` ne peut pas lire un fichier
-- TypeScript ; l'écart se surveille par `vitrine.test.sql`, qui compte les
-- valeurs portées par la contrainte VIVANTE, et par la garde de parité à écrire
-- côté application (relayée dans le rapport de ce lot). Une huitième police
-- ajoutée à `fonts.ts` sans passer ici sera REFUSÉE par la base — c'est le bon
-- sens de l'échec : la vitrine ne rendra jamais une police que le CSS ne
-- charge pas.
--
-- ── LE MVP EST UN SITE DE MARQUE GUIDÉ, PAS UN CONSTRUCTEUR ──
--
-- « Personnalisation recommandée : logo, couleurs, couverture, deux polices
-- choisies, style des cartes, ordre des blocs. Sont exclus au MVP : HTML/CSS
-- libre et réglage pixel par pixel. » Le validateur EST cette phrase : quatre
-- clés, pas une de plus, et aucune ne prend de chaîne libre.
create or replace function public.is_valid_vitrine_theme(p_theme jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_couleurs jsonb;
  v_polices  jsonb;
  v_blocs    text[] := '{}'::text[];
begin
  if p_theme is null then
    return true;
  end if;

  if jsonb_typeof(p_theme) <> 'object' then
    return false;
  end if;

  -- ── PREMIER RANG : quatre clés, toutes facultatives ──
  if exists (
    select 1 from jsonb_object_keys(p_theme) k
     where k not in ('couleurs', 'polices', 'style_cartes', 'ordre_blocs')
  ) then
    return false;
  end if;

  -- ── `couleurs` : {primary, secondary}, hexadécimal à six chiffres ──
  --
  -- La forme courte `#abc` est REFUSÉE, et ce n'est pas une coquetterie : la
  -- couleur voyage jusqu'à un attribut `style` et jusqu'à un QR, et deux
  -- écritures de la même couleur rendent la comparaison « le thème a-t-il
  -- changé » fausse — ce dont L11 aura besoin pour invalider ses caches.
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
  -- par vitrine.test.sql et par la garde applicative à écrire côté `src/lib`.
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

  -- ── `ordre_blocs` : une permutation PARTIELLE des cinq blocs ──
  --
  -- Partielle et non totale : masquer un bloc, c'est l'omettre. Ce qui est
  -- refusé, c'est le DOUBLON — un bloc listé deux fois ferait rendre deux fois
  -- l'histoire du lieu, et aucune couche au-dessus ne le rattraperait.
  if p_theme ? 'ordre_blocs' then
    if jsonb_typeof(p_theme -> 'ordre_blocs') <> 'array'
      or jsonb_array_length(p_theme -> 'ordre_blocs') > 5
    then
      return false;
    end if;
    -- `e.value #>> '{}'` et NON `e.value ->> …` : sur un élément SCALAIRE, le
    -- déréférencement par chemin VIDE rend le texte nu, là où `::text` aurait
    -- rendu `"histoire"` AVEC ses guillemets et fait échouer la comparaison
    -- pour une raison invisible à la lecture.
    if exists (
      select 1 from jsonb_array_elements(p_theme -> 'ordre_blocs') e
       where jsonb_typeof(e.value) <> 'string'
          or (e.value #>> '{}') not in
             ('accroche', 'histoire', 'cartes', 'horaires', 'social')
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

  return true;
end;
$$;

comment on function public.is_valid_vitrine_theme(jsonb) is
  'Valide la FORME du thème d''une vitrine (VIT-1a). FERMÉE AUX DEUX RANGS — '
  'clés de premier rang exactement parmi {couleurs, polices, style_cartes, '
  'ordre_blocs}, et clés exactes dans chaque objet — parce qu''une colonne jsonb '
  'réputée validée mais ouverte devient le dépotoir où l''on range ce que plus '
  'rien ne borne (leçon L8, is_valid_experience_steps). `couleurs` : {primary, '
  'secondary} en hexadécimal SIX chiffres, la forme courte refusée pour que '
  '« le thème a-t-il changé » reste comparable. `polices` : {heading, body} '
  'dans le catalogue RECOPIÉ de src/lib/fonts.ts (FONT_KEYS) — une police '
  'ajoutée à l''application sans passer ici est refusée, et c''est le bon sens '
  'de l''échec. `style_cartes` : liste/grille/magazine. `ordre_blocs` : '
  'permutation PARTIELLE et sans doublon des cinq blocs de la page d''accueil. '
  'Toutes les clés sont facultatives ; `null` et `{}` sont valides. Rendue à '
  'personne.';

revoke all on function public.is_valid_vitrine_theme(jsonb)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 2. `vitrine_settings` — l'identité publique, une ligne par organisation
--
-- ── POURQUOI UN SLUG À ELLE, ALORS QUE `organizations.slug` EXISTE ──
--
-- `organizations.slug` (00001:16) est de forme `^[a-z0-9-]{2,48}$` et sert
-- l'identité INTERNE du locataire depuis la première migration : il apparaît
-- dans des chemins déjà imprimés et dans le back-office. Le slug de vitrine est
-- une ADRESSE COMMERCIALE — celle qu'on met sur une carte de visite, qu'on
-- change quand l'enseigne change de nom, et qu'un commerçant doit pouvoir
-- choisir sans que cela renomme quoi que ce soit d'autre. Les confondre aurait
-- fait d'un renommage d'enseigne une migration de l'identité du locataire.
--
-- Il est UNIQUE GLOBALEMENT, et pas par organisation : c'est une adresse.
-- ────────────────────────────────────────────────────────────

create table public.vitrine_settings (
  id uuid primary key default gen_random_uuid(),
  -- `unique` ET NON une clé primaire sur `organization_id` : la table garde un
  -- `id` propre pour que les chemins d'images et les journaux puissent la
  -- désigner sans recopier l'identifiant du locataire.
  organization_id uuid not null unique
    references public.organizations(id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9-]{3,60}$'
           and not public.is_reserved_vitrine_slug(slug)),
  published boolean not null default false,
  accroche text
    check (accroche is null or pg_catalog.char_length(accroche) <= 200),
  histoire text
    check (histoire is null or pg_catalog.char_length(histoire) <= 1200),
  horaires_texte text
    check (horaires_texte is null
           or pg_catalog.char_length(horaires_texte) <= 600),
  -- `not null default '{}'` plutôt que nullable : « aucune personnalisation »
  -- et « personnalisation vide » sont le même état, et deux façons de l'écrire
  -- auraient donné deux chemins à tenir dans chaque lecture.
  theme jsonb not null default '{}'::jsonb
    check (public.is_valid_vitrine_theme(theme)),
  -- CHEMIN, pas URL : le bucket et la conversion vivent côté application, comme
  -- pour les logos (00006) et les affiches. La base ne prétend pas savoir si le
  -- fichier existe.
  cover_path text
    check (cover_path is null or pg_catalog.char_length(cover_path) <= 300),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

comment on table public.vitrine_settings is
  'Identité publique de la vitrine d''une organisation (VIT-1a) — une ligne au '
  'plus par organisation. STRICTEMENT org-scopée et réservée aux ÉDITEURS : '
  'aucune policy anon, le visiteur ne lit ces lignes QUE par '
  'vitrine_public_state, qui exige `published` ET le droit `vitrine`. La ligne '
  'NAÎT de set_vitrine_slug : aucun `grant insert` n''est accordé, pour que '
  'l''adresse publique ne puisse pas être posée sans laisser de trace d''audit.';
comment on column public.vitrine_settings.slug is
  'Adresse publique de la vitrine, UNIQUE GLOBALEMENT et distincte de '
  'organizations.slug (00001:16), qui est l''identité interne du locataire — '
  'renommer une enseigne ne doit pas renommer le locataire. Forme '
  '^[a-z0-9-]{3,60}$, vocabulaire réservé refusé par is_reserved_vitrine_slug. '
  'NON ÉCRIVABLE en direct : le `grant update` de la table l''exclut, seule '
  'set_vitrine_slug l''écrit et journalise.';
comment on column public.vitrine_settings.published is
  'Publication de la vitrine. Deux gardes lui donnent son sens : en lecture, '
  'vitrine_public_state exige `published` ET org_has_module_access(…, '
  '''vitrine'') — un droit qui s''arrête éteint la vitrine sans qu''aucun cron '
  'ne passe ; en écriture, le trigger vitrine_settings_guard_publication refuse '
  'la TRANSITION vers `true` sans le droit, et ne garde jamais le retour en '
  'arrière. Le DRAPEAU SERVEUR qui retient la fonctionnalité jusqu''à L11 est '
  'ailleurs, côté application : il doit pouvoir se retirer sans migration.';
comment on column public.vitrine_settings.theme is
  'Personnalisation guidée du mini-site : {couleurs, polices, style_cartes, '
  'ordre_blocs}, forme fermée aux deux rangs par is_valid_vitrine_theme. Le MVP '
  'exclut HTML/CSS libre et réglage pixel par pixel — le validateur EST cette '
  'décision.';
comment on column public.vitrine_settings.cover_path is
  'Chemin de l''image de couverture dans le Storage, ou null. Le pipeline '
  'd''images (bucket, conversion, tailles) vit côté application : la base ne '
  'valide pas l''existence du fichier, elle mentirait à la première purge de '
  'bucket.';


-- ────────────────────────────────────────────────────────────
-- 3. `vitrine_menus` — les CARTES
--
-- « Un même lieu peut publier des cartes séparées : petit-déjeuner, carte midi,
-- boissons, enfants, room service, bar ou offres saisonnières. » `active` est
-- l'interrupteur qui rend cette phrase praticable : la carte d'été se retire en
-- octobre et revient en juin, sans rien ressaisir.
-- ────────────────────────────────────────────────────────────

create table public.vitrine_menus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  nom text not null
    check (pg_catalog.char_length(pg_catalog.btrim(nom)) between 1 and 80),
  -- ENTIER BORNÉ, pas un flottant ni un rang dense : le commerçant réordonne
  -- à la main sur son téléphone, et la borne haute existe pour qu'un champ
  -- numérique libre ne devienne pas un canal de stockage.
  ordre integer not null default 0 check (ordre between 0 and 999),
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  -- Un nom = une carte dans le catalogue du commerçant. Unicité PAR
  -- ORGANISATION et EXACTE — même arbitrage que reservation_activities : la
  -- base n'assimile pas deux libellés que le commerçant a écrits différemment.
  -- Sert aussi d'index de tête à `organization_id`.
  constraint vitrine_menus_org_nom_unique unique (organization_id, nom),
  -- Cible de la FK composite de `vitrine_categories`.
  unique (id, organization_id)
);

comment on table public.vitrine_menus is
  'Carte d''une vitrine (VIT-1a) — « carte du midi », « vins », « boissons ». '
  'Le pluriel est le point : la référence du marché publie sept listes par '
  'lieu, et un niveau unique aurait forcé le commerçant à préfixer ses '
  'catégories pour distinguer midi et soir. `active = false` retire la carte du '
  'parcours public sans rien effacer — c''est la carte saisonnière.';
comment on column public.vitrine_menus.active is
  'Interrupteur d''affichage, jamais une suppression : `false` fait disparaître '
  'la carte de vitrine_public_state et la laisse intacte dans l''éditeur. La '
  'suppression réelle existe aussi, mais seulement sur une carte VIDE — voir le '
  'trigger vitrine_menus_refuse_suppression_non_vide.';

create index vitrine_menus_org_ordre_idx
  on public.vitrine_menus (organization_id, ordre, id);


-- ────────────────────────────────────────────────────────────
-- 4. `vitrine_categories` — les rubriques d'une carte
--
-- FK COMPOSITE, et colonne `menu_id` NUE. Une FK d'une seule colonne ne dit
-- rien de l'appartenance : elle laisserait la base accepter, si le code
-- appelant se trompe, une catégorie du locataire A sous la carte du locataire
-- B. La RLS ne rattrape pas cela — elle décide de ce qu'une session VOIT, pas
-- de ce qu'une écriture peut coudre ensemble. C'est exactement ce que
-- `fk_composites_couverture.test.sql` refuse de voir apparaître en silence.
-- ────────────────────────────────────────────────────────────

create table public.vitrine_categories (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  nom text not null
    check (pg_catalog.char_length(pg_catalog.btrim(nom)) between 1 and 80),
  ordre integer not null default 0 check (ordre between 0 and 999),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  -- Une rubrique par nom DANS UNE CARTE — « Entrées » peut exister au midi et
  -- au soir, jamais deux fois au midi. Sert d'index de tête à `menu_id`, donc à
  -- la cascade de la FK composite.
  constraint vitrine_categories_menu_nom_unique unique (menu_id, nom),
  -- Cible de la FK composite de `vitrine_items`.
  unique (id, organization_id),
  foreign key (menu_id, organization_id)
    references public.vitrine_menus(id, organization_id) on delete cascade
);

comment on table public.vitrine_categories is
  'Rubrique d''une carte de vitrine (VIT-1a) : « Entrées », « Crus au verre ». '
  'Rattachée à sa carte par une FK COMPOSITE (menu_id, organization_id) : une '
  'FK simple aurait laissé coudre une rubrique du locataire A sous la carte du '
  'locataire B, ce que la RLS ne rattrape pas. Supprimable par un éditeur — '
  'c''est du contenu éditorial, pas un historique client — et sa suppression '
  'emporte ses fiches par cascade.';

create index vitrine_categories_org_ordre_idx
  on public.vitrine_categories (organization_id, ordre, id);


-- ────────────────────────────────────────────────────────────
-- 5. `vitrine_items` — les FICHES
--
-- ── `prix_affiche` EST DU TEXTE, ET C'EST UNE DÉCISION ──
--
-- Pas de `numeric`, pas de devise, pas de centimes. Le cahier dit « prix
-- affiché si le commerçant le renseigne », et la carte réelle d'un restaurant
-- écrit « 12 € », « à partir de 8 € », « 4,5 / 8 € », « selon arrivage ». Un
-- décimal contraint aurait obligé à REFUSER ces trois dernières formes, ou à
-- inventer un second champ « mention » que personne n'aurait tenu d'accord avec
-- le premier. Le corollaire est écrit ici pour qu'on ne l'oublie pas en L11 :
-- ce champ ne se traduit PAS et ne s'additionne PAS — le benchmark le dit
-- (« les prix ne se traduisent pas »), et rien dans ce schéma ne permet de
-- calculer un total, ce qui est le contraire d'un oubli : la commande, le
-- paiement et la caisse sont HORS PÉRIMÈTRE.
-- ────────────────────────────────────────────────────────────

create table public.vitrine_items (
  id uuid primary key default gen_random_uuid(),
  categorie_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  nom text not null
    check (pg_catalog.char_length(pg_catalog.btrim(nom)) between 1 and 120),
  description text
    check (description is null or pg_catalog.char_length(description) <= 400),
  prix_affiche text
    check (prix_affiche is null
           or (prix_affiche = pg_catalog.btrim(prix_affiche)
               and pg_catalog.char_length(prix_affiche) between 1 and 40)),
  photo_path text
    check (photo_path is null or pg_catalog.char_length(photo_path) <= 300),
  -- ── LES HUIT BADGES DE RÉGIME — vocabulaire de la PLATEFORME ──
  -- Écrits ICI et non dans le corps du validateur : c'est dans
  -- `pg_get_constraintdef` que vitrine.test.sql les compte, et une liste
  -- enfermée dans une fonction ne se compte pas.
  badges text[] not null default '{}'::text[]
    check (public.is_valid_vitrine_vocabulaire(
      badges,
      array['vegetarien', 'vegan', 'epice', 'traditionnel',
            'sain', 'grille', 'nouveau', 'fait_maison']::text[]
    )),
  -- ── LES QUATORZE ALLERGÈNES DE L'ANNEXE II DU RÈGLEMENT UE 1169/2011 ──
  -- Liste FERMÉE sur le seul sujet de la carte où se tromper compte vraiment,
  -- et vocabulaire traduit une fois pour toutes par la plateforme (L11) plutôt
  -- que passé à une machine, ce que le cahier interdit explicitement.
  allergenes text[] not null default '{}'::text[]
    check (public.is_valid_vitrine_vocabulaire(
      allergenes,
      array['gluten', 'crustaces', 'oeufs', 'poissons', 'arachides', 'soja',
            'lait', 'fruits_a_coque', 'celeri', 'moutarde', 'sesame',
            'sulfites', 'lupin', 'mollusques']::text[]
    )),
  -- SAISI À LA MAIN. Aucun décompte, aucun cron, aucune synchronisation de
  -- caisse : « sans promesse de synchronisation de stock ».
  disponible boolean not null default true,
  ordre integer not null default 0 check (ordre between 0 and 999),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (categorie_id, organization_id)
    references public.vitrine_categories(id, organization_id) on delete cascade
);

comment on table public.vitrine_items is
  'Fiche d''une vitrine (VIT-1a) : plat, boisson, produit ou prestation. '
  'Rattachée à sa rubrique par une FK COMPOSITE. `prix_affiche` est du TEXTE '
  'COURT et non un décimal — une carte réelle écrit « à partir de 8 € » — et '
  'rien ici ne permet de calculer un total : commande, paiement et caisse sont '
  'hors périmètre. Badges et allergènes sont des vocabulaires FERMÉS de la '
  'plateforme, traduits une fois pour toutes. `disponible` est un drapeau '
  'MANUEL : la fiche indisponible sort quand même de vitrine_public_state, avec '
  'son drapeau, pour que l''écran la grise plutôt que de la faire disparaître.';
comment on column public.vitrine_items.disponible is
  'Disponibilité SAISIE À LA MAIN par le commerçant (« une action rapide permet '
  'de marquer un plat indisponible »). Aucun décompte, aucun cron, aucune '
  'synchronisation POS : le produit ne promet PAS de stock temps réel. La fiche '
  'reste rendue au visiteur avec ce drapeau — la retirer ferait disparaître un '
  'plat de la carte au lieu de le montrer épuisé.';
comment on column public.vitrine_items.allergenes is
  'Allergènes de l''annexe II du règlement UE 1169/2011, en slugs, vocabulaire '
  'FERMÉ de la plateforme (14 valeurs). Fermé pour deux raisons : un champ '
  'libre y laisserait écrire « peut contenir des traces », qui ne se filtre ni '
  'ne se traduit ; et un vocabulaire fixe se traduit une fois pour toutes, là '
  'où la traduction automatique est explicitement interdite de publier un '
  'allergène sans contrôle du commerçant.';

create index vitrine_items_categorie_ordre_idx
  on public.vitrine_items (categorie_id, ordre, id);
create index vitrine_items_org_idx
  on public.vitrine_items (organization_id);


-- ────────────────────────────────────────────────────────────
-- 6. LA SUPPRESSION D'UNE CARTE — une garde qui COMPTE
--
-- Le motif dominant du dépôt pour un geste destructif est de COMPTER D'ABORD ce
-- qui serait perdu ; RES-1a a tranché dans l'autre sens (aucun `grant delete`
-- du tout) parce qu'une cascade y emportait l'HISTORIQUE DES ARRIVÉES, c'est-à-
-- dire des faits clients qu'aucun écran n'aurait recomptés.
--
-- Ici, la matière est ÉDITORIALE : une carte, ses rubriques, ses fiches. Rien
-- n'y est un fait client, rien n'y est irremplaçable autrement que par la
-- ressaisie. Fermer complètement la porte aurait laissé s'accumuler pour
-- toujours les cartes créées par erreur, et poussé le commerçant à les
-- « vider » pour s'en débarrasser — ce qui détruit exactement autant, en plus
-- long.
--
-- LE CHOIX : la suppression est OUVERTE, et REFUSÉE SUR UNE CARTE NON VIDE.
-- Le message NOMME le compte, parce qu'un refus qui ne dit pas combien ne dit
-- rien. Vider la carte reste possible rubrique par rubrique — chacune sur son
-- écran, chacune décidée. Ce qui est fermé, c'est le geste UNIQUE qui emporte
-- une carte entière sans que personne ait vu passer ce qu'il détruisait.
--
-- Les RUBRIQUES et les FICHES, elles, se suppriment librement : leur cascade
-- tient sur un écran, et le commerçant voit ce qu'il retire.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_menus_refuse_suppression_non_vide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categories integer;
begin
  -- ARMÉ POUR LE SEUL PORTEUR D'UN JWT MARCHAND, motif
  -- `guard_module_publication` : la cascade d'une organisation supprimée passe
  -- par `postgres`, et un seed qui réécrit ses fixtures ne doit pas se heurter
  -- à une garde d'ergonomie. Ce que la garde protège, c'est le clic.
  if coalesce((select auth.role()), '') <> 'authenticated' then
    return old;
  end if;

  select pg_catalog.count(*)::integer into v_categories
    from public.vitrine_categories c
   where c.menu_id = old.id
     and c.organization_id = old.organization_id;

  if v_categories > 0 then
    raise exception
      'cette carte porte encore % rubrique(s) : videz-la ou désactivez-la',
      v_categories
      using errcode = '23503';
  end if;

  return old;
end;
$$;

comment on function public.vitrine_menus_refuse_suppression_non_vide() is
  'Refuse la suppression d''une carte de vitrine qui porte encore des '
  'rubriques, et NOMME LE COMPTE dans le message — un refus qui ne dit pas '
  'combien ne dit rien. Motif « compter d''abord » du dépôt, appliqué à une '
  'matière ÉDITORIALE : contrairement à RES-1a, aucun fait client n''est en '
  'jeu, donc la porte n''est pas fermée mais gardée. `active = false` reste le '
  'geste réversible. ARMÉE POUR auth.role() = ''authenticated'' seulement : la '
  'cascade d''une organisation supprimée et le seed passent par postgres.';

revoke all on function public.vitrine_menus_refuse_suppression_non_vide()
  from public, anon, authenticated;

create trigger vitrine_menus_refuse_suppression_non_vide
  before delete on public.vitrine_menus
  for each row
  execute function public.vitrine_menus_refuse_suppression_non_vide();


-- ────────────────────────────────────────────────────────────
-- 7. LA GARDE DE PUBLICATION — la dixième, celle que L2 annonçait
--
-- 20261001120000 écrivait : « Aucune table de ressource vitrine, donc aucun
-- trigger guard_module_publication : il n'y a rien à publier encore. Les neuf
-- triggers de 20260905120000 restent neuf. » La table existe maintenant, et la
-- phrase se referme ici.
--
-- MÊME FONCTION, MÊME FORME QUE `referral_programs` — le seul autre module dont
-- la publication est un BOOLÉEN. Rien n'est réécrit : `guard_module_publication`
-- est générique et lit sa colonne par jsonb.
--
-- ── CE QUE CELA NE CASSE PAS, VÉRIFIÉ ET NON SUPPOSÉ ──
--
-- `src/lib/module-resources-parity.test.ts` PARSE le seul fichier
-- 20260905120000_p0_gardes_publication.sql : ce trigger-ci n'y entre pas, le
-- compte de neuf déclarations reste neuf, et `vitrine` reste l'unique module
-- exempté de `RESSOURCE_MODULE` — ce qui est correct tant qu'aucun quota de
-- brouillons ne s'applique à la vitrine. Le commentaire de ce test dit encore
-- « pas de table, donc rien à publier » : il est désormais PÉRIMÉ et doit être
-- réécrit côté application (relayé dans le rapport de ce lot).
-- ────────────────────────────────────────────────────────────

create trigger vitrine_settings_guard_publication
  before insert or update on public.vitrine_settings
  for each row
  execute function public.guard_module_publication('vitrine', 'published', '{true}');


-- ────────────────────────────────────────────────────────────
-- 8. RLS ET GRANTS
--
-- Motif « campaign_templates: editors » (20260802120000) sur les quatre tables :
-- une vitrine est de la CONFIGURATION, pas un écran de comptoir. Le caissier
-- n'a rien à y faire — il ne modifie pas la carte entre deux cafés — et lui
-- ouvrir la lecture n'aurait servi qu'à élargir la surface sans usage.
-- ────────────────────────────────────────────────────────────

alter table public.vitrine_settings   enable row level security;
alter table public.vitrine_menus      enable row level security;
alter table public.vitrine_categories enable row level security;
alter table public.vitrine_items      enable row level security;

-- Les privilèges par défaut de Supabase servent anon/authenticated sur toute
-- nouvelle table de `public` : on repart de zéro. anon n'est JAMAIS re-servi —
-- le visiteur passe par vitrine_public_state, qui choisit ce qui sort.
revoke all on table public.vitrine_settings   from public, anon, authenticated;
revoke all on table public.vitrine_menus      from public, anon, authenticated;
revoke all on table public.vitrine_categories from public, anon, authenticated;
revoke all on table public.vitrine_items      from public, anon, authenticated;

create policy "vitrine_settings: editors" on public.vitrine_settings
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "vitrine_menus: editors" on public.vitrine_menus
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "vitrine_categories: editors" on public.vitrine_categories
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "vitrine_items: editors" on public.vitrine_items
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- ── vitrine_settings : AUCUN `grant insert`, et c'est la clé du journal ──
--
-- La ligne NAÎT de `set_vitrine_slug`, qui audite. Accorder l'insertion aurait
-- laissé poser l'adresse publique d'un commerce sans qu'aucune trace n'existe,
-- et rendu le contrôle de vocabulaire réservé contournable dans le seul cas qui
-- compte — le premier. `slug` est de même hors du `grant update` : une
-- réservation d'adresse est un fait, pas un champ de formulaire.
--
-- `organization_id` n'est écrivable nulle part : c'est le locataire, il se pose
-- une fois, par la RPC.
grant select on table public.vitrine_settings to authenticated;
grant update (published, accroche, histoire, horaires_texte, theme, cover_path)
  on public.vitrine_settings to authenticated;

grant select on table public.vitrine_menus to authenticated;
grant insert (organization_id, nom, ordre, active)
  on public.vitrine_menus to authenticated;
grant update (nom, ordre, active)
  on public.vitrine_menus to authenticated;
-- Suppression OUVERTE mais GARDÉE : le trigger de la section 6 refuse une carte
-- non vide et nomme le compte.
grant delete on public.vitrine_menus to authenticated;

-- `menu_id` EST écrivable en update : déplacer une rubrique d'une carte à
-- l'autre est un geste éditorial ordinaire, et la FK composite garde le
-- locataire quoi qu'il arrive.
grant select on table public.vitrine_categories to authenticated;
grant insert (menu_id, organization_id, nom, ordre)
  on public.vitrine_categories to authenticated;
grant update (menu_id, nom, ordre)
  on public.vitrine_categories to authenticated;
grant delete on public.vitrine_categories to authenticated;

grant select on table public.vitrine_items to authenticated;
grant insert (categorie_id, organization_id, nom, description, prix_affiche,
              photo_path, badges, allergenes, disponible, ordre)
  on public.vitrine_items to authenticated;
grant update (categorie_id, nom, description, prix_affiche, photo_path,
              badges, allergenes, disponible, ordre)
  on public.vitrine_items to authenticated;
grant delete on public.vitrine_items to authenticated;


-- ────────────────────────────────────────────────────────────
-- 9. `vitrine_cartes_json` — l'arbre du catalogue, écrit UNE FOIS
--
-- Les deux RPC d'état rendent le même arbre, à un filtre près : le public ne
-- voit que les cartes `active`, l'éditeur les voit toutes. Écrire deux fois une
-- expression de cinquante lignes aurait garanti qu'elles divergent — et la
-- divergence la plus probable est justement L'ORDRE, qui est ce que le
-- commerçant a passé son temps à régler.
--
-- ── L'ORDRE EST (ordre, id), ET LES TROIS NIVEAUX L'APPLIQUENT ──
--
-- `ordre` seul ne suffit pas : le défaut est 0, et deux fiches créées sans
-- réglage se retrouvent à égalité. Postgres est alors libre de les rendre dans
-- n'importe quel ordre, et il en change quand le plan change — la carte se
-- réordonne toute seule entre deux consultations, sans que personne n'ait rien
-- touché. `id` en second rang est arbitraire mais STABLE, et c'est tout ce
-- qu'on lui demande.
--
-- ── LES FICHES INDISPONIBLES SORTENT AUSSI ──
--
-- Avec leur drapeau, pour que l'écran les grise. Voir l'en-tête du fichier.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_cartes_json(
  p_organization_id uuid,
  p_actives_seulement boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cartes jsonb;
begin
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', m.id,
        'nom', m.nom,
        'ordre', m.ordre,
        'active', m.active,
        'categories', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', k.id,
              'nom', k.nom,
              'ordre', k.ordre,
              'fiches', coalesce((
                select pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'id', i.id,
                    'nom', i.nom,
                    'description', i.description,
                    'prix_affiche', i.prix_affiche,
                    'photo_path', i.photo_path,
                    'badges', pg_catalog.to_jsonb(i.badges),
                    'allergenes', pg_catalog.to_jsonb(i.allergenes),
                    'disponible', i.disponible,
                    'ordre', i.ordre
                  )
                  order by i.ordre, i.id
                )
                from public.vitrine_items i
                where i.categorie_id = k.id
                  and i.organization_id = p_organization_id
              ), '[]'::jsonb)
            )
            order by k.ordre, k.id
          )
          from public.vitrine_categories k
          where k.menu_id = m.id
            and k.organization_id = p_organization_id
        ), '[]'::jsonb)
      )
      order by m.ordre, m.id
    ),
    '[]'::jsonb
  ) into v_cartes
  from public.vitrine_menus m
  where m.organization_id = p_organization_id
    and (not p_actives_seulement or m.active);

  return v_cartes;
end;
$$;

comment on function public.vitrine_cartes_json(uuid, boolean) is
  'Arbre cartes → rubriques → fiches d''une organisation, en jsonb. Écrit UNE '
  'FOIS et appelé par les deux RPC d''état : le public filtre sur `active`, '
  'l''éditeur non — deux copies auraient divergé, et d''abord sur l''ORDRE. '
  'Ordre (ordre, id) AUX TROIS NIVEAUX : `ordre` seul laisse les ex æquo à la '
  'main du planificateur, et la carte se réordonnerait toute seule entre deux '
  'consultations. Les fiches INDISPONIBLES sont rendues avec leur drapeau — '
  'l''écran les grise, il ne les fait pas disparaître. Ne contrôle NI le droit, '
  'NI la publication : c''est le travail de ses deux appelantes. Rendue à '
  'personne.';

revoke all on function public.vitrine_cartes_json(uuid, boolean)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 10. `vitrine_public_state` — ce que le visiteur du QR reçoit
--
-- ── UN SEUL MOT POUR TOUS LES REFUS : `unavailable` ──
--
-- Slug mal formé, slug inconnu, vitrine non publiée, droit `vitrine` éteint :
-- la réponse est la MÊME. Distinguer aurait fait de cette RPC un oracle —
-- « ce commerce existe mais n'a pas payé », « cette adresse est libre » — sur
-- un point d'entrée que personne n'authentifie et que tout le monde peut
-- balayer. Le motif est celui de `reservation_public_state` et de
-- `queue_call_next` : un commerçant ne doit pas apprendre, en tapant des
-- identifiants, ce que le voisin possède.
--
-- ── LE DROIT EST RELU À CHAQUE CONSULTATION ──
--
-- `org_has_module_access` et non une colonne recopiée : la pause à l'échéance
-- opère alors PAR ABSENCE, sans cron et sans écriture. Une vitrine dont
-- l'octroi expire s'éteint à la consultation suivante ; elle se rallume seule
-- si l'octroi reprend, sans que rien n'ait eu à être « resynchronisé ».
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_public_state(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.vitrine_settings%rowtype;
  v_org      public.organizations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- FORME D'ABORD, et le refus est déjà `unavailable` : une adresse mal formée
  -- ne peut désigner aucune vitrine, et lever ici aurait donné à l'appelant un
  -- moyen de distinguer « impossible » de « inconnu ».
  if p_slug is null or p_slug !~ '^[a-z0-9-]{3,60}$' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select * into v_settings
    from public.vitrine_settings s
   where s.slug = p_slug;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not v_settings.published then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not public.org_has_module_access(v_settings.organization_id, 'vitrine') then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select * into v_org
    from public.organizations o
   where o.id = v_settings.organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'slug', v_settings.slug,
    -- L'IDENTITÉ DU LIEU. `name` et `logo_url` viennent d'`organizations` et ne
    -- sont PAS recopiés dans vitrine_settings : le commerçant les règle déjà
    -- ailleurs, et une seconde copie aurait donné deux enseignes à tenir
    -- d'accord — celle de la roue et celle de la vitrine.
    'identite', pg_catalog.jsonb_build_object(
      'nom', v_org.name,
      'logo_url', v_org.logo_url,
      'accroche', v_settings.accroche,
      'histoire', v_settings.histoire,
      'horaires_texte', v_settings.horaires_texte,
      'cover_path', v_settings.cover_path,
      'theme', v_settings.theme
    ),
    -- LES LIENS SORTANTS, tels que le commerçant les a saisis (20260918120000).
    -- '' = non renseigné, et c'est l'écran qui décide de ne rien afficher —
    -- traduire '' en null ici aurait créé une troisième écriture du même fait.
    'liens', pg_catalog.jsonb_build_object(
      'google_review_url', v_org.google_review_url,
      'instagram_url', v_org.instagram_url,
      'tiktok_url', v_org.tiktok_url
    ),
    'cartes', public.vitrine_cartes_json(v_settings.organization_id, true)
  );
end;
$$;

comment on function public.vitrine_public_state(text) is
  'État PUBLIC d''une vitrine, par son slug (VIT-1a) — ce que reçoit le '
  'visiteur du QR. Exige `published` ET org_has_module_access(…, ''vitrine''), '
  'relu à CHAQUE consultation : la pause à l''échéance opère par absence, sans '
  'cron et sans écriture. Rend `unavailable` INDISTINCTEMENT pour un slug mal '
  'formé, inconnu, non publié ou sans droit — distinguer aurait fait de ce '
  'point d''entrée non authentifié un oracle sur l''existence et l''état '
  'commercial des commerces. Ne rend que les cartes ACTIVES ; rend les fiches '
  'indisponibles AVEC leur drapeau. N''expose aucune donnée de client, aucun '
  'identifiant d''organisation.';

revoke all on function public.vitrine_public_state(text)
  from public, anon, authenticated;
grant execute on function public.vitrine_public_state(text) to service_role;


-- ────────────────────────────────────────────────────────────
-- 11. `vitrine_dashboard_state` — ce que l'éditeur voit
--
-- TOUT : les cartes inactives, les fiches indisponibles, la ligne de réglages
-- même vide. L'éditeur ne doit pas découvrir qu'une carte existe en tentant de
-- créer son homonyme.
--
-- ── LA GARDE EST DANS L'APPLICATION, ET LE DIRE EST HONNÊTE ──
--
-- Cette RPC est `service_role` et n'interroge PAS l'appartenance de l'appelant :
-- elle ne peut pas, un serveur en service_role n'a pas de session marchande.
-- C'est donc l'action serveur qui garde, comme pour toutes les vues de
-- dashboard du dépôt. Ce qui rend cela sûr, c'est que `service_role` n'est
-- jamais atteignable depuis un navigateur : la clé ne quitte pas le serveur.
--
-- `module_access` est rendu AVEC l'état, plutôt que laissé à un second appel :
-- l'éditeur a besoin de savoir s'il PEUT publier avant de cliquer, et le calcul
-- est déjà fait ici. Ce n'est PAS la garde — le trigger de publication l'est.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_dashboard_state(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.vitrine_settings%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.organizations o where o.id = p_organization_id
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select * into v_settings
    from public.vitrine_settings s
   where s.organization_id = p_organization_id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'module_access',
      public.org_has_module_access(p_organization_id, 'vitrine'),
    -- `null` et non un objet vide quand la ligne n'existe pas : « la vitrine
    -- n'a jamais été ouverte » est un état que l'écran doit rendre par un
    -- premier pas (« choisissez votre adresse »), pas par un formulaire vide
    -- qui laisserait croire qu'il suffit d'enregistrer.
    'settings', case when v_settings.id is null then null else
      pg_catalog.jsonb_build_object(
        'id', v_settings.id,
        'slug', v_settings.slug,
        'published', v_settings.published,
        'accroche', v_settings.accroche,
        'histoire', v_settings.histoire,
        'horaires_texte', v_settings.horaires_texte,
        'theme', v_settings.theme,
        'cover_path', v_settings.cover_path,
        'updated_at', v_settings.updated_at
      )
    end,
    'cartes', public.vitrine_cartes_json(p_organization_id, false)
  );
end;
$$;

comment on function public.vitrine_dashboard_state(uuid) is
  'État COMPLET de la vitrine pour l''éditeur (VIT-1a) : cartes inactives et '
  'fiches indisponibles comprises, plus `module_access` pour que l''écran '
  'sache si la publication est ouverte AVANT le clic. `settings` vaut `null` — '
  'et non un objet vide — tant qu''aucune adresse n''a été choisie : c''est un '
  'premier pas à proposer, pas un formulaire à enregistrer. NE GARDE PAS '
  'l''appartenance de l''appelant : `service_role` n''a pas de session '
  'marchande, la garde est dans l''action serveur, motif de toutes les vues de '
  'dashboard du dépôt.';

revoke all on function public.vitrine_dashboard_state(uuid)
  from public, anon, authenticated;
grant execute on function public.vitrine_dashboard_state(uuid) to service_role;


-- ────────────────────────────────────────────────────────────
-- 12. `set_vitrine_slug` — la seule porte de l'adresse publique
--
-- ── POURQUOI UNE RPC ET NON UN `grant update (slug)` ──
--
-- Trois choses doivent arriver ensemble, et une seule d'entre elles est
-- exprimable par une contrainte :
--
--   1. l'UNICITÉ GLOBALE — la contrainte la tient, mais rend un 23505 que
--      l'écran ne sait pas distinguer d'une autre violation ;
--   2. le VOCABULAIRE RÉSERVÉ, qui doit se dire autrement que « mal formé » ;
--   3. l'AUDIT. Une adresse publique change rarement, et chaque changement
--      casse les QR déjà imprimés. Savoir QUI l'a changée, QUAND, et depuis
--      QUOI est la seule façon de répondre à « mes QR ne marchent plus » sans
--      deviner.
--
-- ── ELLE CRÉE LA LIGNE, ET C'EST POURQUOI `insert` N'EST PAS ACCORDÉ ──
--
-- Une adresse posée par un `insert` PostgREST direct n'aurait laissé aucune
-- trace du premier choix — celui qui, précisément, engage l'impression.
--
-- ── CE QU'ELLE NE VÉRIFIE PAS : LE DROIT `vitrine` ──
--
-- Choisir une adresse n'est pas publier. Un commerçant peut préparer sa vitrine
-- avant que son offre ne soit active ; elle restera `unavailable` au public
-- tant que `published` et le droit ne sont pas là tous les deux. Exiger le
-- droit ici n'aurait rien fermé — il n'y a rien à voir — et aurait empêché de
-- préparer.
-- ────────────────────────────────────────────────────────────

create or replace function public.set_vitrine_slug(
  p_organization_id uuid,
  p_slug text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id  uuid;
  v_slug      text;
  v_precedent text;
  v_cree      boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  -- MÊME GARDE DE FORME QUE `queue_call_next`, mot pour mot : l'acteur vient de
  -- la session de l'appelant et sa forme est vérifiée AVANT le cast, pour
  -- qu'une valeur libre ne fasse pas lever un 22P02 illisible.
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;

  -- OWNER ET EDITOR, PAS LE CAISSIER. L'adresse publique n'est pas un geste de
  -- comptoir : elle engage l'impression des QR et la mémoire des clients.
  -- Tranché EN SQL — un `p_actor` libre ferait de la ligne d'audit une
  -- déclaration sur l'honneur.
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- NORMALISATION AVANT VALIDATION : le commerçant tape « Le Comptoir » avec
  -- une majuscule et un espace de trop, et le refuser sur ce motif seul aurait
  -- été de la pédanterie. Ce qui n'est pas normalisé, en revanche, ne l'est
  -- jamais en silence : les espaces internes et les accents restent des
  -- caractères hors forme, et sont REFUSÉS.
  v_slug := pg_catalog.lower(pg_catalog.btrim(coalesce(p_slug, '')));

  if v_slug !~ '^[a-z0-9-]{3,60}$' then
    return pg_catalog.jsonb_build_object('state', 'invalid_slug');
  end if;
  if public.is_reserved_vitrine_slug(v_slug) then
    return pg_catalog.jsonb_build_object('state', 'reserved_slug');
  end if;

  select s.slug into v_precedent
    from public.vitrine_settings s
   where s.organization_id = p_organization_id;
  v_cree := not found;

  -- RIEN À FAIRE, ET LE DIRE : réenregistrer la même adresse ne doit pas
  -- produire une ligne d'audit de plus. Un journal qui compte les non-gestes
  -- devient illisible exactement quand on en a besoin.
  if v_precedent is not distinct from v_slug then
    return pg_catalog.jsonb_build_object(
      'state', 'ok', 'slug', v_slug, 'created', false, 'changed', false);
  end if;

  -- LE BLOC D'EXCEPTION NE COUVRE QUE L'ÉCRITURE. `unique_violation` y désigne
  -- forcément la collision de SLUG : le conflit sur `organization_id` est
  -- absorbé par le `on conflict`, et c'est la seule autre contrainte unique de
  -- la table. Une garde plus large aurait avalé, sous le nom « slug pris », des
  -- violations qui n'ont rien à voir.
  begin
    insert into public.vitrine_settings (organization_id, slug)
    values (p_organization_id, v_slug)
    on conflict (organization_id) do update
      set slug = excluded.slug,
          updated_at = pg_catalog.now();
  exception
    when unique_violation then
      return pg_catalog.jsonb_build_object('state', 'slug_taken');
  end;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor, 'vitrine.slug_set',
          -- CE QUE LE JOURNAL RETIENT : l'adresse d'avant et celle d'après,
          -- c'est-à-dire de quoi expliquer un QR devenu muet. Rien d'autre —
          -- ni le thème, ni les cartes, qui ne se lisent pas dans un journal.
          pg_catalog.jsonb_build_object(
            'slug', v_slug,
            'previous_slug', v_precedent,
            'created', v_cree));

  return pg_catalog.jsonb_build_object(
    'state', 'ok', 'slug', v_slug, 'created', v_cree, 'changed', true);
end;
$$;

comment on function public.set_vitrine_slug(uuid, text, text) is
  'Pose ou change l''ADRESSE PUBLIQUE d''une vitrine, et CRÉE la ligne de '
  'réglages si elle n''existe pas — c''est pourquoi `insert` n''est accordé à '
  'personne sur vitrine_settings : un premier choix sans trace est justement '
  'celui qui engage l''impression des QR. Acteur obligatoire, vérifié EN SQL '
  'membre owner/editor (pas le caissier : ce n''est pas un geste de comptoir). '
  'Normalise en minuscules détourées, puis refuse séparément « invalid_slug » '
  '(forme), « reserved_slug » (vocabulaire de la plateforme) et « slug_taken » '
  '(unicité globale) — trois refus que l''écran doit savoir distinguer. '
  'Réenregistrer la MÊME adresse ne journalise rien. Ne vérifie PAS le droit '
  '`vitrine` : préparer sa vitrine avant d''avoir l''offre est légitime, et '
  'rien n''est visible du public tant que `published` et le droit ne sont pas '
  'réunis.';

revoke all on function public.set_vitrine_slug(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_vitrine_slug(uuid, text, text)
  to service_role;
