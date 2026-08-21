-- ============================================================
-- LES PORTES DES MODULES DANS LA VITRINE (VIT-3, lot L13)
--
-- ── LE PROBLÈME QUE CE FICHIER RÉSOUT ──
--
-- Les trois pages publiques de Réserver — `/reserver/{activityId}`,
-- `/reserver/file/{queueId}`, `/reserver/stock/{offerId}` — n'ont AUCUN
-- annuaire. Elles sont joignables par une adresse qu'il faut déjà connaître :
-- un QR imprimé, un lien collé. Un client qui arrive sur la Vitrine d'un
-- commerce ne peut donc pas découvrir qu'il peut y réserver une dégustation,
-- prendre un rang dans la file, ou bloquer une part de tarte — alors que tout
-- cela existe, tourne, et appartient au même commerçant.
--
-- La Vitrine EST l'annuaire manquant. Ce lot lui donne les deux blocs par
-- lesquels ces pages deviennent atteignables, et une seule clé de plus dans le
-- document que la page lit déjà.
--
-- ── UN SEUL VERDICT, ET IL EXISTE DÉJÀ ──
--
-- Le droit `vitrine` couvre Réserver depuis 20261001120000 : c'est le MÊME
-- droit qui ouvre les pages publiques du module et la Vitrine. Publier les
-- portes n'ouvre donc aucune surface nouvelle — `vitrine_public_state` exige
-- déjà `published` ET `org_has_module_access(…, 'vitrine')` avant la première
-- ligne de son document, et tout ce qui est ajouté ici vit sous cette garde.
-- Le seul droit qui manquait est celui du quiz, qui n'est PAS couvert par
-- `vitrine` : il est demandé explicitement, section 2.
--
-- ── CE QUE LE LOT NE FAIT PAS, ET IL FAUT LE DIRE ──
--
-- Les portes sont EN FRANÇAIS, y compris sur la page anglaise. Elles portent
-- des noms saisis par le commerçant dans Réserver — « Dégustation du
-- Comptoir », « Comptoir » — et les rendre traduisibles aurait ajouté quatre
-- familles de champs à `vitrine_champs_traduisibles`, donc au DÉNOMINATEUR de
-- la couverture : une vitrine traduite à 100 % serait retombée à 60 % le jour
-- de cette migration, sans que personne n'ait rien défait. Le sélecteur de
-- langue aurait disparu des vitrines E2E par arithmétique. Le compte de
-- couverture ne bouge donc PAS, et `vitrine.test.sql` le garde chiffré.
--
-- ── L'AUTRE MOITIÉ DU LOT : DEUX DETTES QUE LA PUBLICATION REND DUES ──
--
-- Sections 3 et 4. Elles ne sont pas ici par commodité de fichier : publier des
-- portes AUGMENTE l'exposition de ce qu'elles désignent, et c'est le moment où
-- deux écarts assumés cessent de l'être.
--   * `queue_public_state` répondait à qui que ce soit sur sa branche
--     `not_in_queue`, droit `vitrine` éteint compris (docs/bugs.md, résidu du
--     lot L6). Tant que la file n'était joignable que par un QR imprimé, la
--     surface était théorique. Publiée depuis la Vitrine, elle ne l'est plus.
--   * `import_vitrine_carte` journalisait `system` faute d'acteur (revue L12,
--     point I2) : cent vingt fiches écrites en un geste, sans savoir par qui.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. `is_valid_vitrine_theme` — SEPT BLOCS, ET LE RETRAIT EST LE RÉGLAGE
--
-- ── POURQUOI LE VALIDATEUR DOIT BOUGER ──
--
-- `ordre_blocs` est un vocabulaire FERMÉ (20261011120000:402-432) : cinq mots,
-- pas un de plus, et la longueur bornée à cinq. Deux blocs neufs sans passer
-- ici seraient REFUSÉS par le `check` de `vitrine_settings.theme` — c'est le
-- bon sens de l'échec, et c'est exactement pourquoi il faut venir l'ouvrir.
--
-- ── LE RETRAIT D'UN BLOC EST LE RÉGLAGE COMMERÇANT, ET C'EST DÉJÀ ÉCRIT ──
--
-- Aucun drapeau « afficher les portes » n'est ajouté, et ce n'est pas un oubli.
-- `ordre_blocs` est une permutation PARTIELLE depuis sa création : masquer un
-- bloc, c'est l'omettre de la liste. Un commerçant qui ne veut pas annoncer sa
-- file retire `reserver` de son ordre — le geste existe, l'écran de réglages le
-- rend déjà (`reglages-vitrine.tsx`), et le bloc disparaît. Ajouter une colonne
-- booléenne aurait créé un SECOND chemin pour dire la même chose, donc la paire
-- qui diverge : « masqué par l'ordre » et « masqué par le drapeau » auraient eu
-- à être tenus ensemble dans chaque lecture, pour toujours.
--
-- ── SEPT, PAS « AU MOINS SEPT » ──
--
-- La borne de longueur passe de 5 à 7, c'est-à-dire au cardinal EXACT du
-- vocabulaire. Elle ne borne rien d'utile à elle seule — l'absence de doublon
-- la borne déjà — mais elle refuse en 23514, avant la ligne, un fichier qui
-- répéterait le vocabulaire à l'infini, et elle dit dans le catalogue combien
-- de blocs la page connaît. `vitrine.test.sql` compte ce vocabulaire dans le
-- `prosrc` INSTALLÉ : un huitième bloc ajouté à l'écran sans passer ici fera
-- rougir la CI.
--
-- MÊME SIGNATURE, DONC PAS DE `drop` (leçon L3 a contrario) : `create or
-- replace` remplace le corps en place, la contrainte `vitrine_settings_theme_check`
-- qui l'appelle continue de pointer sur le même OID, et aucun pgTAP ne compte
-- les exemplaires de cette fonction-ci — vérifié. Un `drop` aurait exigé de
-- reconstruire la contrainte, donc de revalider toutes les lignes, pour un
-- corps que Postgres sait remplacer sans rien toucher.
-- ────────────────────────────────────────────────────────────

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

  -- ── `ordre_blocs` : une permutation PARTIELLE des SEPT blocs ──
  --
  -- Partielle et non totale : masquer un bloc, c'est l'omettre. C'EST LE
  -- RÉGLAGE COMMERÇANT DES PORTES (VIT-3) — retirer `reserver` de la liste
  -- retire le bloc des réservations de la page publique, et aucun drapeau
  -- séparé n'a été ajouté pour dire la même chose une seconde fois.
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
    -- rendu `"histoire"` AVEC ses guillemets et fait échouer la comparaison
    -- pour une raison invisible à la lecture.
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

  return true;
end;
$$;

comment on function public.is_valid_vitrine_theme(jsonb) is
  'Valide la FORME du thème d''une vitrine (VIT-1a, sept blocs depuis VIT-3). '
  'FERMÉE AUX DEUX RANGS — clés de premier rang exactement parmi {couleurs, '
  'polices, style_cartes, ordre_blocs}, et clés exactes dans chaque objet — '
  'parce qu''une colonne jsonb réputée validée mais ouverte devient le dépotoir '
  'où l''on range ce que plus rien ne borne (leçon L8, is_valid_experience_steps). '
  '`couleurs` : {primary, secondary} en hexadécimal SIX chiffres, la forme '
  'courte refusée pour que « le thème a-t-il changé » reste comparable. '
  '`polices` : {heading, body} dans le catalogue RECOPIÉ de src/lib/fonts.ts '
  '(FONT_KEYS) — une police ajoutée à l''application sans passer ici est '
  'refusée, et c''est le bon sens de l''échec. `style_cartes` : '
  'liste/grille/magazine. `ordre_blocs` : permutation PARTIELLE et sans doublon '
  'des SEPT blocs de la page d''accueil — les cinq de VIT-1a plus `reserver` et '
  '`experiences`, les portes des modules. LE RETRAIT D''UN BLOC EST LE RÉGLAGE : '
  'masquer les portes, c''est les omettre de l''ordre, et aucun drapeau séparé '
  'ne redit la même chose. Toutes les clés sont facultatives ; `null` et `{}` '
  'sont valides. EXECUTE rendu à `authenticated` et `service_role` : un `check` '
  'de table s''évalue avec les privilèges du rôle qui ÉCRIT la ligne, et un '
  'UPDATE réévalue TOUS les `check` de la ligne — sans ce grant, tout '
  'enregistrement de réglages échouait en « permission denied », thème inchangé '
  'compris (même classe que 20261008120000).';

revoke all on function public.is_valid_vitrine_theme(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.is_valid_vitrine_theme(jsonb)
  to authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 2. `vitrine_public_state` — LA CLÉ `portes`
--
-- ── LE CONTRAT, ÉCRIT UNE FOIS ──
--
--   "portes": {
--     "reserver": {
--       "activites": [{"id": "…", "nom": "…"}],
--       "files":     [{"id": "…", "nom": "…"}],
--       "offres":    [{"id": "…", "nom": "…",
--                      "window_starts_at": "…", "window_ends_at": "…"}]
--     },
--     "experiences": { "quiz": [{"slug": "…", "titre": "…"}] }
--   }
--
-- LES SIX LISTES EXISTENT TOUJOURS, éventuellement vides. Une clé absente aurait
-- obligé chaque lecture à distinguer « pas de file » de « pas de clé », et la
-- page à porter deux chemins pour un seul état. Un bloc dont les listes sont
-- vides est masqué PAR L'ÉCRAN — c'est là que la décision d'affichage vit, pas
-- ici : la base rend ce qui est ouvert, elle ne décide pas de la mise en page.
--
-- ── LES IDS SORTENT EN TEXTE ──
--
-- Ce sont des fragments d'URL (`/reserver/{activityId}`), pas des clés que
-- l'appelant recompose. `to_jsonb(uuid)` rendrait la même chaîne, mais le `::text`
-- explicite dit que le consommateur est un `href`.
--
-- ── LES QUATRE DRAPEAUX, ET CE QU'ILS VALENT ──
--
--   * activités : `active`. Une activité coupée n'est pas une activité sans
--     créneau — l'interrupteur du commerçant, celui qui retire la prestation de
--     la saison.
--   * files : `status = 'open'`. `paused` sert encore ceux qui attendent DÉJÀ,
--     mais n'accepte plus personne : l'annoncer depuis la Vitrine aurait envoyé
--     un client sur une page qui le refuse. `closed` de même.
--   * offres : `status = 'open'` ET la fenêtre de retrait EN COURS. La fenêtre
--     est la borne que `redeem_stock_hold` applique au comptoir : une offre dont
--     la fenêtre est passée ne se retire plus, et une offre dont la fenêtre n'a
--     pas commencé annoncerait un retrait impossible aujourd'hui. Les DEUX
--     bornes voyagent avec la porte, pour que l'écran puisse dire « jusqu'à
--     18 h » sans second appel.
--   * quiz : `status = 'active'`, ET `org_has_module_access(…, 'quiz')`. C'est
--     le SEUL droit demandé ici, parce que c'est le seul que le droit `vitrine`
--     ne couvre pas : Réserver est servi par `vitrine` (20261001120000), et la
--     RPC l'a déjà exigé plus haut pour rendre quoi que ce soit.
--
-- ── DOUZE PAR LISTE, ET L'ORDRE EST CELUI DU NOM ──
--
-- La borne est là parce qu'un commerçant peut avoir cent activités ACTIVES et
-- que la page est servie en ISR : un document qui grossit sans borne finit par
-- coûter à chaque visiteur pendant soixante secondes. Douze est le nombre de
-- rubriques qu'un import accepte (20261013120000) — la même idée d'« une page,
-- pas un catalogue ».
--
-- L'ORDRE EST DANS LA SOUS-REQUÊTE **ET** DANS L'AGRÉGAT, et les deux sont
-- nécessaires pour des raisons différentes : celui de la sous-requête décide
-- QUELS douze sont retenus — sans lui, `limit` prendrait douze lignes au hasard
-- du plan, et la page changerait de contenu d'un rafraîchissement à l'autre —
-- celui de l'agrégat décide dans quel ORDRE ils sortent. `id` en second rang,
-- motif du module : l'unicité porte sur le couple (organisation, libellé) et
-- deux libellés détourés différemment passent, donc les homonymes existent, et
-- sans second rang leur ordre retomberait sur le hasard.
--
-- MÊME SIGNATURE, DONC PAS DE `drop` : `src/lib/vitrine-context.ts` appelle à
-- deux arguments depuis L11, et `vitrine.test.sql` compte déjà qu'il n'existe
-- qu'UN exemplaire — un `drop`/`create` d'une forme identique le laisserait
-- vrai, mais n'aurait rien à corriger.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_public_state(
  p_slug text,
  p_lang text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings   public.vitrine_settings%rowtype;
  v_org        public.organizations%rowtype;
  v_lang       text;
  v_accroche   text;
  v_histoire   text;
  v_horaires   text;
  v_total      integer;
  v_frais      integer;
  -- LA SEULE LANGUE TRADUITE. Écrite ici et dans `vitrine_translation_state` ;
  -- le `check` de `vitrine_translations.lang` est le troisième point, et
  -- `vitrine.test.sql` compte son vocabulaire pour que les trois bougent
  -- ensemble.
  v_lang_traduite constant text := 'en';
  -- LA BORNE DES PORTES, écrite une fois pour les quatre listes : une page, pas
  -- un catalogue. Voir l'en-tête de section.
  c_max_portes constant integer := 12;
  v_activites  jsonb;
  v_files      jsonb;
  v_offres     jsonb;
  v_quiz       jsonb;
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

  -- NORMALISATION PUIS REPLI. Tout ce qui n'est pas une langue traduite servie
  -- par ce schéma retombe sur le français, silencieusement.
  v_lang := pg_catalog.lower(pg_catalog.btrim(coalesce(p_lang, 'fr')));
  if v_lang <> v_lang_traduite then
    v_lang := 'fr';
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

  -- LE CALQUE DE L'IDENTITÉ. Une seule ligne au plus par champ (contrainte
  -- unique), donc l'agrégat ne choisit rien : il transpose. En français, aucune
  -- ligne ne satisfait `t.lang = 'fr'` et les trois variables restent nulles.
  select
    pg_catalog.max(t.texte) filter (where t.champ = 'accroche'),
    pg_catalog.max(t.texte) filter (where t.champ = 'histoire'),
    pg_catalog.max(t.texte) filter (where t.champ = 'horaires_texte')
  into v_accroche, v_histoire, v_horaires
    from public.vitrine_translations t
   where t.organization_id = v_settings.organization_id
     and t.cible_type = 'settings'
     and t.cible_id = v_settings.id
     and t.lang = v_lang
     and t.version_source >= v_settings.updated_at;

  -- LA COUVERTURE, MESURÉE SUR CE QUE LE VISITEUR VOIT (`actives_seulement`).
  -- Le `left join` part des champs TRADUISIBLES : une traduction orpheline —
  -- pour un champ vidé depuis — ne peut donc pas être comptée, et le rapport ne
  -- peut pas dépasser 100 %.
  --
  -- LES PORTES N'Y ENTRENT PAS, et c'est une décision, pas un oubli : elles ne
  -- passent pas par `vitrine_champs_traduisibles`, donc ni le numérateur ni le
  -- dénominateur ne bougent en VIT-3. Voir l'en-tête du fichier.
  select pg_catalog.count(*)::integer,
         pg_catalog.count(t.id)::integer
    into v_total, v_frais
    from public.vitrine_champs_traduisibles(v_settings.organization_id, true) c
    left join public.vitrine_translations t
      on t.organization_id = v_settings.organization_id
     and t.cible_type = c.cible_type
     and t.cible_id = c.cible_id
     and t.champ = c.champ
     and t.lang = v_lang_traduite
     and t.version_source >= c.version_courante;

  -- ── LES PORTES (VIT-3) ─────────────────────────────────────
  --
  -- Le droit `vitrine` a été tranché plus haut : ces trois listes vivent sous
  -- lui, et ne le redemandent pas.
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('id', x.id::text, 'nom', x.nom)
             order by x.nom, x.id),
           '[]'::jsonb)
    into v_activites
    from (select a.id, a.name as nom
            from public.reservation_activities a
           where a.organization_id = v_settings.organization_id
             and a.active
           order by a.name, a.id
           limit c_max_portes) x;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('id', x.id::text, 'nom', x.nom)
             order by x.nom, x.id),
           '[]'::jsonb)
    into v_files
    from (select q.id, q.name as nom
            from public.reservation_queues q
           where q.organization_id = v_settings.organization_id
             and q.status = 'open'
           order by q.name, q.id
           limit c_max_portes) x;

  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'id', x.id::text,
               'nom', x.nom,
               'window_starts_at', x.window_starts_at,
               'window_ends_at', x.window_ends_at)
             order by x.nom, x.id),
           '[]'::jsonb)
    into v_offres
    from (select o.id, o.title as nom, o.window_starts_at, o.window_ends_at
            from public.reservation_stock_offers o
           where o.organization_id = v_settings.organization_id
             and o.status = 'open'
             and o.window_starts_at <= pg_catalog.now()
             and o.window_ends_at > pg_catalog.now()
           order by o.title, o.id
           limit c_max_portes) x;

  -- LE SEUL DROIT DEMANDÉ ICI. `quiz` n'est pas couvert par `vitrine` : sans ce
  -- test, une vitrine servie aurait annoncé un quiz que sa propre page publique
  -- refuse d'ouvrir.
  if public.org_has_module_access(v_settings.organization_id, 'quiz') then
    select coalesce(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object('slug', x.slug, 'titre', x.titre)
               order by x.titre, x.id),
             '[]'::jsonb)
      into v_quiz
      from (select q.id, q.public_slug as slug, q.name as titre
              from public.quizzes q
             where q.organization_id = v_settings.organization_id
               and q.status = 'active'
             order by q.name, q.id
             limit c_max_portes) x;
  else
    v_quiz := '[]'::jsonb;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'slug', v_settings.slug,
    -- LA LANGUE RÉELLEMENT SERVIE, jamais celle qui a été demandée : `?lang=de`
    -- rend `fr`, et l'écran doit pouvoir poser le bon attribut `lang` sur son
    -- `<html>` sans redeviner la règle de repli.
    'lang', v_lang,
    'lang_coverage', pg_catalog.jsonb_build_object(
      'lang', v_lang_traduite,
      'total_champs_traduisibles', v_total,
      'traduits_frais', v_frais
    ),
    -- L'IDENTITÉ DU LIEU. `name` et `logo_url` viennent d'`organizations` et ne
    -- sont PAS recopiés dans vitrine_settings. `nom` NE SE TRADUIT PAS : c'est
    -- l'enseigne, un nom propre.
    'identite', pg_catalog.jsonb_build_object(
      'nom', v_org.name,
      'logo_url', v_org.logo_url,
      'accroche', coalesce(v_accroche, v_settings.accroche),
      'histoire', coalesce(v_histoire, v_settings.histoire),
      'horaires_texte', coalesce(v_horaires, v_settings.horaires_texte),
      'cover_path', v_settings.cover_path,
      'theme', v_settings.theme
    ),
    -- LES LIENS SORTANTS, tels que le commerçant les a saisis (20260918120000).
    'liens', pg_catalog.jsonb_build_object(
      'google_review_url', v_org.google_review_url,
      'instagram_url', v_org.instagram_url,
      'tiktok_url', v_org.tiktok_url
    ),
    'cartes', public.vitrine_cartes_json(
      v_settings.organization_id, true, v_lang),
    -- LES PORTES DES MODULES (VIT-3). Les six listes existent toujours, même
    -- vides : c'est l'écran qui masque un bloc sans contenu, pas la base.
    'portes', pg_catalog.jsonb_build_object(
      'reserver', pg_catalog.jsonb_build_object(
        'activites', v_activites,
        'files', v_files,
        'offres', v_offres
      ),
      'experiences', pg_catalog.jsonb_build_object(
        'quiz', v_quiz
      )
    )
  );
end;
$$;

comment on function public.vitrine_public_state(text, text) is
  'État PUBLIC d''une vitrine, par son slug et dans une langue (VIT-1a, langue '
  'ajoutée en VIT-1b, PORTES ajoutées en VIT-3). Exige `published` ET '
  'org_has_module_access(…, ''vitrine''), relu à CHAQUE consultation. Rend '
  '`unavailable` INDISTINCTEMENT pour un slug mal formé, inconnu, non publié ou '
  'sans droit — ce point d''entrée non authentifié n''est pas un oracle. '
  '`p_lang` null, ''fr'' ou INCONNUE → français : le repli est silencieux, une '
  'adresse bricolée ne produit pas une erreur. En anglais, les traductions '
  'FRAÎCHES se superposent champ à champ et les périmées sont ignorées (le '
  'français ressort). Rend `lang` — la langue RÉELLEMENT servie — et '
  '`lang_coverage` DANS LES DEUX LANGUES, parce que c''est sur la page française '
  'que l''écran décide d''offrir l''anglais ; le SEUIL reste dans l''application, '
  'la base ne rend que le compte. `portes` rend l''ANNUAIRE des pages publiques '
  'du commerce, que rien n''exposait avant ce lot : {reserver: {activites, '
  'files, offres}, experiences: {quiz}}. Les six listes existent TOUJOURS, '
  'éventuellement vides — l''écran masque un bloc vide, la base ne met pas en '
  'page. Filtres : activité `active`, file `open` (une file en pause sert ceux '
  'qui attendent mais n''accepte plus personne), offre `open` ET fenêtre de '
  'retrait EN COURS, quiz `active` ET org_has_module_access(…, ''quiz'') — le '
  'SEUL droit redemandé, parce que Réserver est servi par `vitrine`. Douze par '
  'liste, ordonnées par nom puis id, identifiants en TEXTE (ce sont des '
  'fragments d''URL). LES PORTES NE SONT PAS TRADUISIBLES : elles n''entrent ni '
  'au numérateur ni au dénominateur de `lang_coverage`, sans quoi cette '
  'migration aurait fait retomber toute vitrine traduite sous le seuil du '
  'sélecteur de langue. N''expose aucune donnée de client, aucun identifiant '
  'd''organisation.';

revoke all on function public.vitrine_public_state(text, text)
  from public, anon, authenticated;
grant execute on function public.vitrine_public_state(text, text) to service_role;


-- ────────────────────────────────────────────────────────────
-- 3. `queue_public_state` — LA GARDE `vitrine` SUR LA BRANCHE OUVERTE
--
-- ── LA DETTE, ET POURQUOI ELLE ÉCHOIT MAINTENANT ──
--
-- `docs/bugs.md` (résidus du train Réserver & Vitrine) : « getQueuePublicState
-- reste joignable sans cookie sur la branche `not_in_queue` : environ 4 requêtes
-- non opposables à un seau d'identité. Écart assumé (ADR-032) ; piste retenue
-- si le volume d'abus devient réel : porter la garde vitrine directement dans
-- queue_public_state côté SQL plutôt qu'au-dessus en applicatif. »
--
-- Le volume d'abus n'est toujours pas observé. Ce qui a changé, c'est
-- l'EXPOSITION : jusqu'ici une file ne se découvrait que par un QR imprimé sur
-- place. La section 2 la publie dans un annuaire lisible par quiconque connaît
-- l'adresse de la Vitrine. Attendre l'abus pour poser la garde aurait consisté
-- à ouvrir la porte d'abord et à compter les entrées ensuite.
--
-- ── CE QUI EST GARDÉ, ET CE QUI NE L'EST SURTOUT PAS ──
--
-- SEULE la branche `not_in_queue` refuse. Celui qui EST dans la file continue
-- de lire son rang, droit éteint compris, et c'est le cœur de la décision :
-- l'en-tête de 20261005120000 dit « lire son propre rang n'est pas un acte
-- commercial », et quelqu'un qui attend DEBOUT dans le magasin ne doit pas
-- perdre son écran parce qu'un abonnement s'est arrêté ce matin-là. Le droit
-- garde la DÉCOUVERTE, jamais la possession.
--
-- ── LE REFUS EST `unavailable`, LE MÊME MOT QUE LA FILE INCONNUE ──
--
-- Motif `stock_offer_public_state` (20261010120000), qui tranche déjà le droit
-- DANS la RPC et rend `unavailable` indistinctement pour « offre inconnue »,
-- « brouillon » et « organisation sans le droit ». Distinguer aurait fait de
-- cette RPC un oracle : « cette file existe mais son commerçant n'a plus
-- l'offre » est un renseignement commercial sur un tiers.
--
-- SIGNATURE INCHANGÉE — `create or replace` suffit, aucun appelant ne bouge.
-- ────────────────────────────────────────────────────────────

create or replace function public.queue_public_state(
  p_queue_id uuid,
  p_player_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.reservation_queues%rowtype;
  v_entry public.reservation_queue_entries%rowtype;
  v_waiting integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  select q.* into v_queue
    from public.reservation_queues q
   where q.id = p_queue_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LA TAILLE DE LA FILE : les seules entrées `waiting`. Une personne appelée
  -- n'attend plus, et la compter aurait fait dire à l'écran « 4 personnes
  -- attendent » quand trois sont déjà au comptoir. Ce nombre est le même pour
  -- tout le monde, et c'est aussi ce qui rend le rang lisible : « 2e sur 5 ».
  select pg_catalog.count(*)::integer into v_waiting
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.status = 'waiting';

  select e.* into v_entry
    from public.reservation_queue_entries e
   where e.queue_id = p_queue_id
     and e.player_key_hash = p_player_key_hash
     -- UNE LIGNE PURGÉE NE SE RELIT PAS. La garde de forme du paramètre
     -- l'interdit déjà ; ce filtre écrit l'intention et tiendrait encore si
     -- cette garde venait à s'assouplir.
     and e.player_key_hash not like 'purge:%'
     and e.status in ('waiting', 'called');

  if not found then
    -- LA GARDE `vitrine`, ET ELLE N'EST QUE SUR CETTE BRANCHE (VIT-3). Voir
    -- l'en-tête de section : le droit garde la DÉCOUVERTE d'une file, jamais la
    -- lecture de son propre rang par quelqu'un qui attend déjà. Le mot rendu est
    -- celui de la file inconnue, motif `stock_offer_public_state` : distinguer
    -- ferait de cette RPC un oracle sur l'abonnement d'un commerçant.
    if not public.org_has_module_access(v_queue.organization_id, 'vitrine') then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;
    return pg_catalog.jsonb_build_object(
      'state', 'not_in_queue',
      'queue_name', v_queue.name,
      'queue_status', v_queue.status,
      'waiting_count', v_waiting
    );
  end if;

  -- NI l'empreinte, NI l'adresse, NI le prénom ne sortent d'ici : les deux
  -- premières sont des données que l'appelant a déjà fournies s'il les connaît,
  -- et une réponse qui les recopie ne lui apprend rien tout en les exposant à
  -- chaque journal traversé. Le prénom n'a de sens que sur l'écran du staff.
  --
  -- `status = 'called'` ET `called_at` VOYAGENT AVEC LE RANG, sur le MÊME
  -- document : c'est ce qui permet à l'écran joueur de basculer sans aller
  -- chercher ailleurs — critère RES-3 « l'appel staff prime sur tout autre
  -- écran ».
  return pg_catalog.jsonb_build_object(
    'state', 'in_queue',
    'queue_name', v_queue.name,
    'queue_status', v_queue.status,
    'entry_id', v_entry.id,
    'status', v_entry.status,
    'position', public.queue_entry_position(v_entry),
    'waiting_count', v_waiting,
    'joined_at', v_entry.created_at,
    'called_at', v_entry.called_at
  );
end;
$$;

comment on function public.queue_public_state(uuid, text) is
  'État public d''une identité pseudonyme dans UNE file d''accueil (RES-3) : son '
  'rang RÉEL — compté à la lecture, jamais stocké — le nombre de personnes qui '
  'attendent, et son statut. NE PORTE AUCUN ETA, aucune durée, aucune heure de '
  'passage : critère dur RES-3, et rien dans cette base ne permet aujourd''hui '
  'd''en calculer un qui soit fiable. N''expose AUCUNE autre identité, pas même '
  'un prénom, ni l''empreinte ni l''adresse de l''appelant. `status = ''called''` '
  'et `called_at` voyagent sur le MÊME document que le rang, pour que l''écran '
  'bascule sans second appel. Ne vérifie PAS le statut de la file : il est '
  'RENDU, pour que l''écran puisse le dire, mais il ne conditionne rien. LE '
  'DROIT `vitrine` NE GARDE QUE LA BRANCHE `not_in_queue` (VIT-3) — un visiteur '
  'qui n''est PAS dans la file reçoit `unavailable`, le mot indistinct de la '
  'file inconnue, si l''organisation n''a plus le droit ; celui qui EST dans la '
  'file lit son rang quoi qu''il arrive, parce que lire son propre rang n''est '
  'pas un acte commercial et que quelqu''un qui attend debout ne perd pas son '
  'écran parce qu''un abonnement s''est arrêté. Le droit garde la DÉCOUVERTE, '
  'jamais la possession — dette de la revue L6, échue quand VIT-3 a publié les '
  'files depuis la Vitrine.';

revoke all on function public.queue_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_public_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 4. `import_vitrine_carte` — L'ACTEUR, VÉRIFIÉ EN SQL
--
-- ── LE POINT I2 DE LA REVUE L12 ──
--
-- La RPC journalisait `actor = 'system'`, faute de recevoir un acteur. Cent
-- vingt fiches écrites en un geste, et le journal ne disait pas par qui : c'est
-- précisément le geste dont on voudra savoir l'auteur, parce que c'est le seul
-- du module qui peut refaire toute une carte d'un coup.
--
-- ── UN `p_actor` NON VÉRIFIÉ AURAIT ÉTÉ PIRE QUE PAS D'ACTEUR ──
--
-- C'est ce que dit déjà le commentaire de la version L12, et c'est ce qui est
-- corrigé ici plutôt que contourné : l'acteur est vérifié membre `owner` ou
-- `editor` de l'organisation EN SQL, motif EXACT de `set_vitrine_slug`. Sans
-- cette vérification, la ligne d'audit aurait été une déclaration sur l'honneur
-- de l'appelant — un journal qui recopie ce qu'on lui dit ne prouve rien, et il
-- est plus dangereux qu'un journal vide parce qu'on le croit.
--
-- ── PAS LE CAISSIER, MÊME ARBITRAGE QUE L'ADRESSE PUBLIQUE ──
--
-- Refaire la carte n'est pas un geste de comptoir. `owner` et `editor`, comme
-- `set_vitrine_slug`.
--
-- ── `uuid` ET NON `text`, CONTRAIREMENT À `set_vitrine_slug` ──
--
-- La garde de forme par expression régulière de `set_vitrine_slug` existe parce
-- que sa signature prend un `text` — héritée de `queue_call_next`, dont
-- l'acteur vient d'un en-tête. Ici la signature change de toute façon : la
-- prendre en `uuid` fait faire au TYPE le travail de la régulière, et un
-- appelant qui passerait une chaîne libre échoue au cast, à l'appel, avant
-- d'entrer dans le corps.
--
-- ── NOUVELLE SIGNATURE, DONC `drop` DE L'ANCIENNE (leçon L3) ──
--
-- `import_vitrine_carte(uuid, jsonb)` est SUPPRIMÉE et non surchargée. Deux
-- exemplaires auraient laissé le chemin sans acteur ouvert à service_role — un
-- appelant oublié aurait continué d'écrire `system` sans que rien ne le dise —
-- et `vitrine.test.sql` compte désormais qu'il n'en existe qu'un.
-- ────────────────────────────────────────────────────────────

drop function if exists public.import_vitrine_carte(uuid, jsonb);

create or replace function public.import_vitrine_carte(
  p_organization_id uuid,
  p_payload jsonb,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- LES DEUX BORNES DE CARDINALITÉ, écrites ici et nulle part ailleurs. Elles
  -- sont dans le corps et non dans un `check` parce qu'elles ne portent sur
  -- AUCUNE ligne : elles bornent un GESTE.
  c_max_rubriques constant integer := 12;
  c_max_fiches    constant integer := 120;

  v_rubriques    jsonb;
  v_nom          text;
  v_total_fiches bigint;
  v_ordre_carte  integer;
  v_carte_id     uuid;
  v_categorie_id uuid;
  v_badges       text[];
  v_allergenes   text[];
  v_n_rubriques  integer := 0;
  v_n_fiches     integer := 0;
  v_contrainte   text;
  v_rub          record;
  v_fic          record;
begin
  -- ── 1. LA PORTE : service_role SEUL ────────────────────────
  --
  -- Motif du module depuis RES-1a. La clé ne quitte jamais le serveur. Ce qui a
  -- changé en VIT-3, c'est que l'APPARTENANCE du commerçant n'est plus laissée
  -- à l'applicatif : elle est tranchée ci-dessous, sur l'acteur reçu.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  -- ── 2. L'ACTEUR — MEMBRE owner|editor, TRANCHÉ EN SQL ──────
  --
  -- Motif EXACT de `set_vitrine_slug`, et le MÊME 42501 indistinct que la suite :
  -- « acteur absent », « acteur d'une autre organisation », « caissier » et
  -- « organisation inconnue » rendent tous le même refus. Distinguer aurait fait
  -- de cette RPC un oracle sur les organisations qui ne sont pas les siennes et
  -- sur leurs équipes.
  --
  -- CE TEST REND AUSSI CELUI DE L'EXISTENCE DE L'ORGANISATION : aucune ligne de
  -- `organization_members` ne peut pointer une organisation absente (FK), donc
  -- un `p_organization_id` inconnu ne trouve aucun membre et tombe ici.
  if p_actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = p_actor
       and om.role in ('owner', 'editor')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- ── 3. LA FORME DU LOT — premier rang ──────────────────────
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_payload) k
     where k not in ('nom', 'rubriques')
  ) then
    raise exception 'payload carries an unknown key' using errcode = '22023';
  end if;

  if coalesce(pg_catalog.jsonb_typeof(p_payload -> 'nom'), '') <> 'string' then
    raise exception 'carte name required' using errcode = '22023';
  end if;

  -- NORMALISATION AVANT VALIDATION, motif `set_vitrine_slug` : un fichier
  -- exporté d'un tableur porte des espaces de bord sur une ligne sur trois, et
  -- refuser là-dessus aurait été de la pédanterie. La LONGUEUR, elle, reste au
  -- `check` de la colonne.
  v_nom := pg_catalog.btrim(p_payload ->> 'nom');

  -- `rubriques` absent vaut liste vide : importer une carte sans rubrique est
  -- exactement une création de carte, et refuser aurait demandé à l'appelant de
  -- choisir entre deux portes pour un même geste.
  v_rubriques := coalesce(p_payload -> 'rubriques', '[]'::jsonb);
  if pg_catalog.jsonb_typeof(v_rubriques) <> 'array' then
    raise exception 'rubriques must be an array' using errcode = '22023';
  end if;

  -- ── 4. LA PREMIÈRE BORNE DE CARDINALITÉ ────────────────────
  --
  -- Comptée AVANT toute inspection du contenu : c'est la borne qui protège du
  -- payload démesuré, et la faire passer après aurait fait parcourir dix mille
  -- éléments pour découvrir qu'il y en a dix mille.
  if pg_catalog.jsonb_array_length(v_rubriques) > c_max_rubriques then
    raise exception 'too many rubriques in one import (max %)', c_max_rubriques
      using errcode = '22023';
  end if;

  -- ── 5. LA FORME DU LOT — deuxième rang, les rubriques ──────
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
     where pg_catalog.jsonb_typeof(r.value) <> 'object'
  ) then
    raise exception 'each rubrique must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_object_keys(r.value) k
     where k not in ('nom', 'fiches')
  ) then
    raise exception 'a rubrique carries an unknown key' using errcode = '22023';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
     where coalesce(pg_catalog.jsonb_typeof(r.value -> 'nom'), '') <> 'string'
        or pg_catalog.jsonb_typeof(coalesce(r.value -> 'fiches', '[]'::jsonb))
           <> 'array'
  ) then
    raise exception 'each rubrique needs a name and an array of fiches'
      using errcode = '22023';
  end if;

  -- DEUX RUBRIQUES DE MÊME NOM DANS LE MÊME LOT. La contrainte
  -- `vitrine_categories_menu_nom_unique` le refuserait aussi — elle est le filet
  -- — mais en 23505, sous le même mot que « cette carte existe déjà », que
  -- l'écran devrait alors distinguer sans indice. Le refus est rendu ici, sous
  -- son propre nom, avant que rien ne soit écrit.
  if (select pg_catalog.count(distinct pg_catalog.btrim(r.value ->> 'nom'))
        from pg_catalog.jsonb_array_elements(v_rubriques) r)
     <> pg_catalog.jsonb_array_length(v_rubriques)::bigint then
    raise exception 'two rubriques of the import share the same name'
      using errcode = '22023';
  end if;

  -- ── 6. LA FORME DU LOT — troisième rang, les fiches ────────
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(r.value -> 'fiches', '[]'::jsonb)) f
     where pg_catalog.jsonb_typeof(f.value) <> 'object'
  ) then
    raise exception 'each fiche must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(r.value -> 'fiches', '[]'::jsonb)) f
      cross join lateral pg_catalog.jsonb_object_keys(f.value) k
     where k not in ('nom', 'description', 'prix_affiche',
                     'badges', 'allergenes')
  ) then
    raise exception 'a fiche carries an unknown key' using errcode = '22023';
  end if;

  -- `? 'clé'` AVANT le type : une clé ABSENTE est légitime pour les quatre
  -- champs facultatifs, une clé PRÉSENTE mais d'un autre type ne l'est pas. Sans
  -- ce test d'existence, `jsonb_typeof` rendrait `null` sur l'absence et la
  -- comparaison `not in (…)` rendrait `null` — c'est-à-dire « accepté », par le
  -- même piège à trois valeurs que celui refermé dans is_valid_vitrine_vocabulaire.
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(r.value -> 'fiches', '[]'::jsonb)) f
     where coalesce(pg_catalog.jsonb_typeof(f.value -> 'nom'), '') <> 'string'
        or (f.value ? 'description'
            and pg_catalog.jsonb_typeof(f.value -> 'description')
                not in ('string', 'null'))
        or (f.value ? 'prix_affiche'
            and pg_catalog.jsonb_typeof(f.value -> 'prix_affiche')
                not in ('string', 'null'))
        or (f.value ? 'badges'
            and pg_catalog.jsonb_typeof(f.value -> 'badges') <> 'array')
        or (f.value ? 'allergenes'
            and pg_catalog.jsonb_typeof(f.value -> 'allergenes') <> 'array')
  ) then
    raise exception 'a fiche has a field of the wrong type'
      using errcode = '22023';
  end if;

  -- LES ÉLÉMENTS des deux vocabulaires doivent être des CHAÎNES. Le `check` de
  -- la table refuserait `[1]` de toute façon — `'1'` n'est dans aucun des deux
  -- vocabulaires — mais il rendrait « badge inconnu » pour ce qui est en réalité
  -- un fichier mal formé, et l'écran d'import enverrait le commerçant chercher
  -- une faute de vocabulaire qui n'existe pas.
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(v_rubriques) r
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(r.value -> 'fiches', '[]'::jsonb)) f
      cross join lateral (values (f.value -> 'badges'),
                                 (f.value -> 'allergenes')) v(liste)
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(v.liste, '[]'::jsonb)) e
     where pg_catalog.jsonb_typeof(e.value) <> 'string'
  ) then
    raise exception 'badges and allergenes must be arrays of strings'
      using errcode = '22023';
  end if;

  -- ── 7. LA SECONDE BORNE DE CARDINALITÉ — le TOTAL ──────────
  --
  -- SUR LE LOT ENTIER et non par rubrique : douze rubriques de cent fiches
  -- chacune passeraient douze bornes locales et resteraient un import de mille
  -- deux cents lignes. C'est le total qui coûte.
  select coalesce(pg_catalog.sum(pg_catalog.jsonb_array_length(
           coalesce(r.value -> 'fiches', '[]'::jsonb))), 0)
    into v_total_fiches
    from pg_catalog.jsonb_array_elements(v_rubriques) r;

  if v_total_fiches > c_max_fiches then
    raise exception 'too many fiches in one import (max %)', c_max_fiches
      using errcode = '22023';
  end if;

  -- ── 8. LA CARTE — elle arrive APRÈS les cartes existantes ──
  select least(coalesce(pg_catalog.max(m.ordre) + 1, 0), 999)
    into v_ordre_carte
    from public.vitrine_menus m
   where m.organization_id = p_organization_id;

  -- LE BLOC NE COUVRE QUE CETTE ÉCRITURE, motif `set_vitrine_slug` : une garde
  -- plus large aurait avalé, sous le nom « ce nom est pris », des violations qui
  -- n'ont rien à voir. `vitrine_menus` porte deux contraintes uniques — le nom
  -- par organisation, et le couple `(id, organization_id)` qui n'existe que pour
  -- servir de cible aux FK composites et ne peut collisionner que sur un
  -- `gen_random_uuid()` répété.
  begin
    insert into public.vitrine_menus (organization_id, nom, ordre)
    values (p_organization_id, v_nom, v_ordre_carte)
    returning id into v_carte_id;
  exception
    when unique_violation then
      -- LE NOM N'EST PAS DANS LE MESSAGE. L'appelant l'a envoyé, il le connaît ;
      -- ce message-ci finit dans un journal.
      raise exception 'a carte of this name already exists in this catalogue'
        using errcode = '23505';
    when check_violation then
      get stacked diagnostics v_contrainte = constraint_name;
      raise exception 'carte rejected by constraint %',
        coalesce(v_contrainte, 'unknown') using errcode = '23514';
  end;

  -- ── 9. LES RUBRIQUES ET LES FICHES, DANS L'ORDRE DU FICHIER ─
  --
  -- `with ordinality` porte le rang, et le `order by` explicite le fige : la
  -- position dans le payload EST l'information que le commerçant a produite en
  -- écrivant sa carte, et c'est le seul travail que l'import ne doit pas lui
  -- rendre à refaire.
  begin
    for v_rub in
      select r.value as rubrique, (r.rang - 1)::integer as rang
        from pg_catalog.jsonb_array_elements(v_rubriques)
             with ordinality as r(value, rang)
       order by r.rang
    loop
      insert into public.vitrine_categories
        (menu_id, organization_id, nom, ordre)
      values
        (v_carte_id, p_organization_id,
         pg_catalog.btrim(v_rub.rubrique ->> 'nom'), v_rub.rang)
      returning id into v_categorie_id;
      v_n_rubriques := v_n_rubriques + 1;

      for v_fic in
        select f.value as fiche, (f.rang - 1)::integer as rang
          from pg_catalog.jsonb_array_elements(
                 coalesce(v_rub.rubrique -> 'fiches', '[]'::jsonb))
               with ordinality as f(value, rang)
         order by f.rang
      loop
        -- `#>> '{}'` ET NON `->> …` : sur un élément SCALAIRE, le
        -- déréférencement par chemin VIDE rend le texte nu, là où `::text`
        -- rendrait `"vegan"` AVEC ses guillemets — même idiome qu'au validateur
        -- d'`ordre_blocs`, et la même raison.
        select coalesce(
                 pg_catalog.array_agg(e.value #>> '{}' order by e.rang),
                 '{}'::text[])
          into v_badges
          from pg_catalog.jsonb_array_elements(
                 coalesce(v_fic.fiche -> 'badges', '[]'::jsonb))
               with ordinality as e(value, rang);

        select coalesce(
                 pg_catalog.array_agg(e.value #>> '{}' order by e.rang),
                 '{}'::text[])
          into v_allergenes
          from pg_catalog.jsonb_array_elements(
                 coalesce(v_fic.fiche -> 'allergenes', '[]'::jsonb))
               with ordinality as e(value, rang);

        -- `nullif(btrim(…), '')` sur les deux champs facultatifs : « absent »,
        -- « null » et « trois espaces » sont le MÊME état — rien à afficher — et
        -- trois façons de l'écrire en base auraient donné trois chemins à tenir
        -- dans chaque lecture. Le `check` de `prix_affiche` exige d'ailleurs une
        -- valeur déjà détourée : sans ce btrim, un prix copié d'un tableur avec
        -- son espace de fin ferait échouer tout l'import.
        insert into public.vitrine_items
          (categorie_id, organization_id, nom, description, prix_affiche,
           badges, allergenes, ordre)
        values (
          v_categorie_id,
          p_organization_id,
          pg_catalog.btrim(v_fic.fiche ->> 'nom'),
          nullif(pg_catalog.btrim(coalesce(v_fic.fiche ->> 'description', '')), ''),
          nullif(pg_catalog.btrim(coalesce(v_fic.fiche ->> 'prix_affiche', '')), ''),
          v_badges,
          v_allergenes,
          v_fic.rang
        );
        v_n_fiches := v_n_fiches + 1;
      end loop;
    end loop;
  exception
    -- LES DEUX BRANCHES RELÈVENT. C'est ce qui garde l'atomicité : un
    -- `return` ici rendrait un succès sur une carte à moitié écrite, et le
    -- commerçant découvrirait le trou en relisant sa carte, pas à l'import.
    when check_violation then
      get stacked diagnostics v_contrainte = constraint_name;
      raise exception 'a line of the import was rejected by constraint %',
        coalesce(v_contrainte, 'unknown') using errcode = '23514';
    when unique_violation then
      raise exception 'two lines of the import collide on their name'
        using errcode = '23505';
  end;

  -- ── 10. LE JOURNAL — un geste, une ligne, UN ACTEUR ────────
  --
  -- UNE SEULE LIGNE POUR TOUT L'IMPORT, et pas une par fiche : le journal compte
  -- les GESTES (motif `set_vitrine_slug` et `upsert_vitrine_translation`), et
  -- cent vingt lignes d'audit pour un clic l'auraient rendu illisible exactement
  -- quand on en a besoin. Le CONTENU n'y est pas non plus — un journal n'est pas
  -- un stockage, et la carte se lit dans la carte.
  --
  -- L'ACTEUR EST CELUI QUI A ÉTÉ VÉRIFIÉ EN SECTION 2, et c'est ce qui donne sa
  -- valeur à cette ligne : jusqu'à VIT-3 elle portait `system` (point I2 de la
  -- revue L12), c'est-à-dire le nom de personne pour le geste le plus lourd du
  -- module. `::text` parce que `audit_logs.actor` est une colonne de texte,
  -- partagée avec les acteurs non humains.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, p_actor::text, 'vitrine.carte_imported',
          pg_catalog.jsonb_build_object(
            'carte_id', v_carte_id,
            'rubriques_creees', v_n_rubriques,
            'fiches_creees', v_n_fiches));

  return pg_catalog.jsonb_build_object(
    'carte_id', v_carte_id,
    'rubriques_creees', v_n_rubriques,
    'fiches_creees', v_n_fiches);
end;
$$;

comment on function public.import_vitrine_carte(uuid, jsonb, uuid) is
  'Crée EN UN SEUL GESTE une carte de vitrine, ses rubriques et ses fiches '
  '(VIT-2 ; ACTEUR ajouté en VIT-3, point I2 de la revue L12). L''ACTEUR EST '
  'OBLIGATOIRE et vérifié EN SQL membre owner/editor de l''organisation, motif '
  'exact de set_vitrine_slug : refaire une carte n''est pas un geste de '
  'comptoir, et un p_actor non vérifié aurait fait de la ligne d''audit une '
  'déclaration sur l''honneur — plus dangereuse qu''un journal vide, parce '
  'qu''on la croit. Acteur absent, caissier, membre d''une AUTRE organisation et '
  'organisation inconnue rendent le MÊME 42501 indistinct : distinguer ferait de '
  'cette RPC un oracle sur les équipes des autres. TOUT OU RIEN : aucune branche '
  'n''avale d''erreur, donc une seule ligne invalide abandonne la transaction '
  'entière — le pgTAP compte les lignes APRÈS l''échec et exige zéro, parce '
  'qu''une garantie gratuite est celle qu''un futur `exception when others` fera '
  'disparaître sans bruit. Payload FERMÉ aux trois rangs — {nom, rubriques[{nom, '
  'fiches[{nom, description?, prix_affiche?, badges?, allergenes?}]}]} — une clé '
  'inconnue est REFUSÉE : acceptée en silence, « prix » au lieu de '
  '« prix_affiche » produirait une carte entière sans prix, le seul échec qui '
  'ressemble à un succès. Deux bornes de CARDINALITÉ, seules règles que ce '
  'fichier ajoute : 12 rubriques et 120 fiches au total — elles bornent le '
  'GESTE, pas la ligne. Les longueurs, le vocabulaire des badges et des '
  'allergènes restent aux `check` de 20261011120000 : les recopier ici aurait '
  'créé la paire qui diverge. AUCUN MESSAGE NE RELAIE DE TEXTE LIBRE DU '
  'PAYLOAD ; ce qui remonte est un NOM DE CONTRAINTE lu dans `get stacked '
  'diagnostics`, borné et écrit par nous, qui dit LAQUELLE des règles a mordu. '
  'Un nom de carte déjà pris rend 23505 SANS le nom. Rangs 0..n dans l''ordre du '
  'fichier pour les rubriques et les fiches ; la carte se pose APRÈS les cartes '
  'existantes. N''ÉCRIT AUCUNE TRADUCTION : une carte importée naît non traduite '
  'et la couverture publique baisse, ce qui est l''invariant de L11 et non un '
  'effet de bord — une machine ne publie pas d''anglais sur une carte que '
  'personne n''a relue. Ne contrôle PAS le droit `vitrine` (motif '
  'set_vitrine_slug : préparer sa vitrine avant d''avoir l''offre est légitime). '
  'L''ANCIENNE FORME (uuid, jsonb) EST SUPPRIMÉE, pas surchargée (leçon L3) : '
  'deux exemplaires auraient laissé ouvert le chemin sans acteur. Rendue à '
  'service_role.';

revoke all on function public.import_vitrine_carte(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.import_vitrine_carte(uuid, jsonb, uuid)
  to service_role;
