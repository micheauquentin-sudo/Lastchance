-- ════════════════════════════════════════════════════════════
-- LES PHOTOS DE LA VITRINE (VIT-7)
--
-- `vitrine_items.photo_path` et `vitrine_settings.cover_path` existent depuis
-- 20261011120000, sont bornées par la base, accordées en écriture — et valent
-- `null` PARTOUT. Le commentaire de l'époque le disait sans détour : « le
-- pipeline d'images (bucket, conversion, tailles) est un chantier à lui seul,
-- un lot suivant les remplira ». C'est ce lot.
--
--
-- ── CE QUE CETTE MIGRATION AJOUTE, ET RIEN DE PLUS ─────────
--
--   1. Un bucket, parce qu'il n'en existait pas pour la Vitrine ;
--   2. deux colonnes de TEXTE ALTERNATIF, parce qu'une photo sans description
--      est invisible pour qui n'y voit pas — et que l'alternative ne peut pas
--      se déduire d'un fichier.
--
-- Aucune colonne de chemin n'est créée : elles sont là. Aucune policy de
-- Storage non plus, et c'est le sujet du paragraphe suivant.
--
--
-- ── POURQUOI AUCUNE POLICY D'ÉCRITURE SUR LE BUCKET ────────
--
-- Motif exact de `logos` (00006) et de `poster-images` (20260719040000) : le
-- bucket est PUBLIC EN LECTURE — une carte se lit sans compte, ses photos
-- aussi — et les écritures passent EXCLUSIVEMENT par le `service_role`, après
-- `gardeEditeurVitrine()` côté application. Il n'existe donc aucune policy
-- d'écriture pour `anon` ni `authenticated`, et c'est délibéré : une policy
-- d'écriture ouverte à `authenticated` aurait laissé n'importe quel compte
-- déposer un fichier dans le préfixe d'un autre commerce, là où le préfixe
-- `{organization_id}/…` n'est vérifié que par du code applicatif.
--
--
-- ── `image/webp` SEUL, ET 2 Mo ─────────────────────────────
--
-- Comme `poster-images`. Rien n'entre dans ce bucket sans être passé par
-- `sharp` : l'application ré-encode, redimensionne et RETIRE LES MÉTADONNÉES
-- — l'EXIF de localisation en particulier, qui dirait où la photo a été prise.
-- N'accepter que le format de sortie du pipeline rend la règle vérifiable par
-- la base plutôt que promise par un commentaire : un JPEG déposé directement,
-- métadonnées comprises, est refusé par le bucket lui-même.
--
--
-- ── LE TEXTE ALTERNATIF N'EST PAS TRADUISIBLE, POUR L'INSTANT ─
--
-- `vitrine_translations.champ` est une liste FERMÉE, et son en-tête prévient
-- que la couverture (`vitrine_public_state`, `vitrine_translation_state`) et
-- le seuil du sélecteur de langue changent ENSEMBLE avec elle. Ajouter deux
-- champs traduisibles ferait retomber toute vitrine traduite sous les 95 % le
-- jour de la livraison — exactement l'accident que la migration
-- 20261014120000 s'est déjà refusé pour les portes. L'alternative reste donc
-- en français, comme les portes, et un lot ultérieur la fera entrer dans la
-- couverture DÉLIBÉRÉMENT.
-- ════════════════════════════════════════════════════════════

-- ── 1. LE BUCKET ────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vitrine-images',
  'vitrine-images',
  true,
  2097152, -- 2 Mo, comme les affiches
  array['image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. LES TEXTES ALTERNATIFS ───────────────────────────────

alter table public.vitrine_items
  add column if not exists photo_alt text;

alter table public.vitrine_settings
  add column if not exists cover_alt text;

-- Les bornes sont posées SÉPARÉMENT de la colonne : `add column if not exists`
-- ne rejoue pas son `check` sur une base où la colonne existe déjà, et une
-- contrainte nommée se retrouve, se teste et se remplace.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'vitrine_items_photo_alt_len'
  ) then
    alter table public.vitrine_items
      add constraint vitrine_items_photo_alt_len
      check (photo_alt is null
             or pg_catalog.char_length(pg_catalog.btrim(photo_alt)) between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'vitrine_settings_cover_alt_len'
  ) then
    alter table public.vitrine_settings
      add constraint vitrine_settings_cover_alt_len
      check (cover_alt is null
             or pg_catalog.char_length(pg_catalog.btrim(cover_alt)) between 1 and 200);
  end if;
end
$$;

comment on column public.vitrine_items.photo_alt is
  'Description de la photo pour qui ne la voit pas (VIT-7). Saisie à la main : '
  'aucune alternative ne se déduit d''un fichier, et une alternative inventée '
  'est pire qu''aucune. Reste en FRANÇAIS — voir l''en-tête de la migration.';

comment on column public.vitrine_settings.cover_alt is
  'Description de l''image de couverture (VIT-7). Même contrat que '
  'vitrine_items.photo_alt.';

-- ── 3. LES DEUX COLONNES ENTRENT DANS LE `grant update` ─────
--
-- `photo_path` et `cover_path` y étaient déjà (20261011120000). Sans ces deux
-- lignes, l'écriture d'une alternative produirait un 42501 sur un formulaire
-- pourtant valide — le refus le plus opaque du lot.

grant update (photo_alt) on public.vitrine_items to authenticated;
grant update (cover_alt) on public.vitrine_settings to authenticated;

-- ── 4. LES TROIS LECTURES APPRENNENT LES DEUX COLONNES ─────
--
-- `create or replace` conserve les privilèges et les commentaires : ni
-- `grant` ni `revoke` ne sont rejoués ici, seul le corps change.
--
-- CE QUI CHANGE, EXACTEMENT : une clé de plus dans chacune des trois
-- fonctions. Les corps sont RECOPIÉS À L'IDENTIQUE de leur dernière
-- définition — `vitrine_cartes_json` de 20261012120000, `vitrine_public_state`
-- de 20261018120000, `vitrine_dashboard_state` de 20261011120000 — parce que
-- Postgres remplace une fonction entière, jamais une ligne. Relire le diff de
-- ce fichier contre ces trois sources est le seul contrôle qui vaille.
--
-- POURQUOI LES TROIS ET PAS UNE. `vitrine_cartes_json` sérialise les fiches
-- pour les DEUX écrans (public et tableau de bord) : le texte alternatif d'une
-- photo de fiche n'y entre qu'une fois. La couverture, elle, est assemblée
-- séparément dans chacune des deux lectures — d'où deux insertions jumelles.
create or replace function public.vitrine_cartes_json(
  p_organization_id uuid,
  p_actives_seulement boolean,
  p_lang text default null
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
        'nom', coalesce(tm.texte, m.nom),
        'ordre', m.ordre,
        'active', m.active,
        'categories', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', k.id,
              'nom', coalesce(tk.texte, k.nom),
              'ordre', k.ordre,
              'fiches', coalesce((
                select pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'id', i.id,
                    'nom', coalesce(ti_nom.texte, i.nom),
                    'description', coalesce(ti_desc.texte, i.description),
                    -- LE PRIX NE SE TRADUIT PAS (L10, en toutes lettres), et
                    -- badges/allergènes sont le vocabulaire de la plateforme,
                    -- traduit à la main côté application. Ces trois-là passent
                    -- INCHANGÉS, dans les deux langues.
                    'prix_affiche', i.prix_affiche,
                    'photo_path', i.photo_path,
                    'photo_alt', i.photo_alt,
                    'badges', pg_catalog.to_jsonb(i.badges),
                    'allergenes', pg_catalog.to_jsonb(i.allergenes),
                    'disponible', i.disponible,
                    'ordre', i.ordre
                  )
                  order by i.ordre, i.id
                )
                from public.vitrine_items i
                left join public.vitrine_translations ti_nom
                  on ti_nom.organization_id = p_organization_id
                 and ti_nom.cible_type = 'item'
                 and ti_nom.cible_id = i.id
                 and ti_nom.lang = p_lang
                 and ti_nom.champ = 'nom'
                 and ti_nom.version_source >= i.updated_at
                left join public.vitrine_translations ti_desc
                  on ti_desc.organization_id = p_organization_id
                 and ti_desc.cible_type = 'item'
                 and ti_desc.cible_id = i.id
                 and ti_desc.lang = p_lang
                 and ti_desc.champ = 'description'
                 and ti_desc.version_source >= i.updated_at
                where i.categorie_id = k.id
                  and i.organization_id = p_organization_id
              ), '[]'::jsonb)
            )
            order by k.ordre, k.id
          )
          from public.vitrine_categories k
          left join public.vitrine_translations tk
            on tk.organization_id = p_organization_id
           and tk.cible_type = 'categorie'
           and tk.cible_id = k.id
           and tk.lang = p_lang
           and tk.champ = 'nom'
           and tk.version_source >= k.updated_at
          where k.menu_id = m.id
            and k.organization_id = p_organization_id
        ), '[]'::jsonb)
      )
      order by m.ordre, m.id
    ),
    '[]'::jsonb
  ) into v_cartes
  from public.vitrine_menus m
  left join public.vitrine_translations tm
    on tm.organization_id = p_organization_id
   and tm.cible_type = 'menu'
   and tm.cible_id = m.id
   and tm.lang = p_lang
   and tm.champ = 'nom'
   and tm.version_source >= m.updated_at
  where m.organization_id = p_organization_id
    and (not p_actives_seulement or m.active);

  return v_cartes;
end;
$$;

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
  v_lang_traduite constant text := 'en';
  c_max_portes constant integer := 12;
  c_max_contenus constant integer := 3;
  v_activites  jsonb;
  v_files      jsonb;
  v_offres     jsonb;
  v_quiz       jsonb;
  v_contenus   jsonb;
  -- LA PORTE DU JEU (L17). Un booléen : voir l'en-tête de section.
  v_duo        boolean;
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

  -- NI LES PORTES, NI LES CONTENUS, NI LA PORTE DUO n'entrent dans la
  -- couverture : aucun ne passe par `vitrine_champs_traduisibles`, donc ni le
  -- numérateur ni le dénominateur ne bougent. Un booléen n'a d'ailleurs rien à
  -- traduire — mais il fallait que l'ajout de L17 laisse ce calcul EXACTEMENT
  -- où il était, sans quoi les vitrines traduites seraient retombées sous le
  -- seuil du sélecteur de langue (19/19 et 5/5 du seed restent invariants).
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

  -- LE SEUL DROIT REDEMANDÉ ICI. `quiz` n'est pas couvert par `vitrine` : sans
  -- ce test, une vitrine servie aurait annoncé un quiz que sa propre page
  -- publique refuse d'ouvrir. Duo Miroir, lui, EST la Vitrine (ADR-109 §A1) et
  -- ne redemande rien — voir l'en-tête de section.
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

  -- LA PORTE DU JEU (L17). Le seuil vit dans `duo_jouable`, partagé avec
  -- `duo_start` : la porte est visible si et seulement si le jeu démarre.
  v_duo := public.duo_jouable(v_settings.organization_id);

  -- ── LES CONTENUS MIS EN AVANT (VIT-4) ──────────────────────
  select coalesce(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'titre', x.titre, 'url', x.url, 'rang', x.rang)
             order by x.rang),
           '[]'::jsonb)
    into v_contenus
    from (select c.titre, c.url, c.rang
            from public.vitrine_contenus c
           where c.organization_id = v_settings.organization_id
           order by c.rang
           limit c_max_contenus) x;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'slug', v_settings.slug,
    'lang', v_lang,
    'lang_coverage', pg_catalog.jsonb_build_object(
      'lang', v_lang_traduite,
      'total_champs_traduisibles', v_total,
      'traduits_frais', v_frais
    ),
    'identite', pg_catalog.jsonb_build_object(
      'nom', v_org.name,
      'logo_url', v_org.logo_url,
      'accroche', coalesce(v_accroche, v_settings.accroche),
      'histoire', coalesce(v_histoire, v_settings.histoire),
      'horaires_texte', coalesce(v_horaires, v_settings.horaires_texte),
      'cover_path', v_settings.cover_path,
      'cover_alt', v_settings.cover_alt,
      'theme', v_settings.theme
    ),
    'liens', pg_catalog.jsonb_build_object(
      'google_review_url', v_org.google_review_url,
      'instagram_url', v_org.instagram_url,
      'tiktok_url', v_org.tiktok_url
    ),
    'contenus', v_contenus,
    'cartes', public.vitrine_cartes_json(
      v_settings.organization_id, true, v_lang),
    -- LES PORTES DES MODULES (VIT-3, plus la porte Duo de L17). Les quatre
    -- listes et le drapeau existent TOUJOURS, même vides et même à faux : c'est
    -- l'écran qui masque un bloc sans contenu, pas la base. `duo` à `false` est
    -- une réponse, pas une absence — et une clé qui apparaît et disparaît se
    -- teste à chaque lecture, là où une forme stable se type une fois.
    'portes', pg_catalog.jsonb_build_object(
      'reserver', pg_catalog.jsonb_build_object(
        'activites', v_activites,
        'files', v_files,
        'offres', v_offres
      ),
      'experiences', pg_catalog.jsonb_build_object(
        'quiz', v_quiz,
        'duo', v_duo
      )
    )
  );
end;
$$;

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
        'cover_alt', v_settings.cover_alt,
        'updated_at', v_settings.updated_at
      )
    end,
    'cartes', public.vitrine_cartes_json(p_organization_id, false)
  );
end;
$$;
