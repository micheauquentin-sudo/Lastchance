-- ============================================================
-- VITRINE — CONTENUS MIS EN AVANT, BEACON, ET LES FAITS « RÉSERVER »
-- DANS L'ÉCRAN CLIENTS (VIT-4, lot L14)
--
-- Trois chantiers qui n'ont en commun que leur cause : la Vitrine existe
-- maintenant (L10 à L13), et trois choses lui manquaient pour être un mini-site
-- de commerce plutôt qu'une carte en ligne.
--
--   1. LES CONTENUS MIS EN AVANT — « un à trois contenus choisis à la main ».
--   2. LE BEACON — le commerçant ne sait pas combien de gens ouvrent sa vitrine.
--   3. LES SEGMENTS « A RÉSERVÉ » / « EST VENU » — l'écran Clients ne connaît
--      que les GAINS, alors que Réserver produit depuis RES-1a des faits bien
--      plus proches de la question « qui sont mes clients ? ».
--
-- ── LE PIÈGE QUI A DICTÉ LA FORME DE CE FICHIER ──
--
-- AUCUNE ÉCRITURE sur `vitrine_settings`, `vitrine_menus`, `vitrine_categories`
-- ni `vitrine_items` — pas même un `alter table` ajoutant une colonne nullable.
-- Ces quatre tables portent depuis 20261012120000 un trigger
-- `touch_updated_at`, et `vitrine_translations` déclare une traduction PÉRIMÉE
-- dès que `version_source < updated_at`. La portée de ce trigger est LA LIGNE,
-- pas le champ (décision assumée de L11) : toucher une seule colonne d'une
-- ligne de réglages périmerait d'un coup l'accroche, l'histoire et les horaires
-- anglais de TOUTES les vitrines traduites. La couverture E2E tomberait sous le
-- seuil, le sélecteur de langue disparaîtrait de la page, et rien n'aurait
-- signalé la cause — c'est exactement l'accident que le seed de L11 décrit
-- avoir évité de justesse en refusant un `update` de rattrapage.
--
-- Les contenus mis en avant vivent donc dans une TABLE À PART, et non dans un
-- `jsonb` de `vitrine_settings.theme` ou trois colonnes de plus. Le coût est une
-- jointure ; le bénéfice est qu'éditer un lien ne périme aucune traduction.
--
-- ── CE QUE CE FICHIER NE FAIT PAS ──
--
--   * Aucun OAuth, aucune API tierce, aucun rafraîchissement automatique. Le
--     cahier dit « un à trois contenus mis en avant MANUELLEMENT » : ce sont un
--     titre et une adresse, saisis par le commerçant. Aller chercher les trois
--     derniers posts d'un compte Instagram demanderait un jeton par commerce,
--     son renouvellement, et une panne silencieuse le jour où il expire.
--   * Aucune vignette, aucun aperçu. `url` est une adresse, pas un média : la
--     base ne va rien télécharger, et l'écran rend un lien.
--   * Aucun nouveau champ traduisible. `vitrine_translations.cible_type` reste
--     la liste fermée des quatre cibles de L11 — un titre de contenu mis en
--     avant ne se traduit pas, exactement comme les portes de L13, et pour la
--     même raison arithmétique : l'ajouter au dénominateur ferait retomber
--     toute vitrine traduite sous le seuil du sélecteur de langue.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. `vitrine_contenus` — UN À TROIS LIENS, CHOISIS À LA MAIN
--
-- ── POURQUOI UN `rang` BORNÉ À TROIS ET NON UN `ordre` LIBRE ──
--
-- `vitrine_menus.ordre` et `vitrine_items.ordre` sont des entiers `between 0 and
-- 999` : le commerçant y range une liste dont personne ne connaît la longueur.
-- Ici la longueur EST la spécification — « un à trois » — et elle doit être
-- tenue par la base, pas par un écran qui compte avant d'insérer. Le couple
-- `check (rang between 1 and 3)` + `unique (organization_id, rang)` donne les
-- deux propriétés d'un coup : au plus trois lignes par commerce, et jamais deux
-- contenus qui se disputent la même place. Un `ordre` libre plus un compte à
-- l'insertion aurait laissé passer la quatrième ligne à la première course
-- entre deux onglets.
--
-- L'unicité sert AUSSI d'index de tête à `organization_id` — c'est ce que
-- `index_fk_couverture.test.sql` exige de toute clé étrangère, et c'est pour la
-- même raison qu'elle est écrite dans cet ordre.
--
-- ── `https://` EXIGÉ, ET LE RESTE SANS ESPACE ──
--
-- Cette valeur part en `href` sur une page publique servie sous le nom du
-- commerce. Trois refus, tous à l'écriture :
--
--   * le schéma est CLOS à `https` — `javascript:`, `data:` et `http:` sont
--     refusés par la même expression, et le dernier compte autant que les deux
--     premiers : un lien en clair depuis une page servie en TLS est bloqué par
--     le navigateur sans que personne ne sache pourquoi ;
--   * aucun caractère d'espacement dans la suite, retour à la ligne compris —
--     c'est ce qui empêche une adresse d'emporter un attribut supplémentaire
--     dans le balisage rendu ;
--   * une longueur bornée, comme `cover_path` et `photo_path` (300).
--
-- LA REVALIDATION À LA LECTURE RESTE CÔTÉ APPLICATION, et ce n'est pas une
-- redondance : `src/lib/vitrine.ts` applique déjà `asLienSortant` aux trois
-- liens sociaux de `organizations`, précisément parce qu'une valeur écrite
-- AVANT qu'une garde n'existe traverse toutes les gardes posées après elle.
-- C'est la lecture qui doit être sûre ; ce `check` ne fait que rendre le cas
-- rare.
-- ════════════════════════════════════════════════════════════

create table public.vitrine_contenus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- La PLACE, pas un ordre : 1, 2, 3 et rien d'autre.
  rang integer not null check (rang between 1 and 3),
  titre text not null
    check (pg_catalog.char_length(pg_catalog.btrim(titre)) between 1 and 80),
  url text not null
    check (pg_catalog.char_length(url) <= 300
           and url ~ '^https://[^[:space:]]+$'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  -- Au plus trois lignes par commerce, jamais deux à la même place, et l'index
  -- de tête de la clé étrangère par la même occasion.
  constraint vitrine_contenus_org_rang_unique unique (organization_id, rang)
);

comment on table public.vitrine_contenus is
  'Les UN À TROIS contenus mis en avant MANUELLEMENT sur la vitrine d''un '
  'commerce (VIT-4) : un titre et une adresse, saisis par le commerçant. '
  'Aucun OAuth, aucune API tierce, aucun rafraîchissement — le cahier dit '
  '« manuellement », et un jeton par commerce serait une panne silencieuse le '
  'jour où il expire. Table À PART et non colonnes de vitrine_settings : ces '
  'quatre tables portent un trigger touch_updated_at dont la portée est la '
  'LIGNE, donc éditer un lien y aurait PÉRIMÉ les traductions anglaises de '
  'l''accroche, de l''histoire et des horaires (20261012120000). Ne se traduit '
  'pas : vitrine_translations.cible_type reste la liste fermée de L11.';
comment on column public.vitrine_contenus.rang is
  'La PLACE du contenu, 1 à 3. Le `check` et l''unique (organization_id, rang) '
  'tiennent ENSEMBLE la spécification « un à trois » : au plus trois lignes par '
  'commerce, jamais deux au même rang. Un `ordre` libre plus un comptage à '
  'l''insertion aurait laissé passer la quatrième ligne à la première course '
  'entre deux onglets.';
comment on column public.vitrine_contenus.url is
  'Adresse du contenu mis en avant. Schéma CLOS à https — javascript:, data: et '
  'http: refusés par la même expression, le dernier autant que les deux autres '
  '(un lien en clair depuis une page TLS est bloqué sans explication) — et '
  'aucun caractère d''espacement dans la suite, pour qu''une adresse ne puisse '
  'pas emporter un attribut de plus dans le balisage. La REVALIDATION À LA '
  'LECTURE reste côté application (motif asLienSortant) : une valeur écrite '
  'avant qu''une garde n''existe traverse toutes les gardes posées après elle.';

-- Le trigger générique de L11. La colonne existe (`not null default now()`
-- ci-dessus) : il ne manquait que l'écriture.
create trigger vitrine_contenus_touch_updated_at
  before update on public.vitrine_contenus
  for each row execute function public.touch_updated_at();


-- ── RLS ET GRANTS ────────────────────────────────────────────
--
-- ÉCART ASSUMÉ AVEC LES QUATRE TABLES DE 20261011120000, qui sont « editors »
-- pour TOUT, lecture comprise. Celles-là sont de la CONFIGURATION — le caissier
-- ne modifie pas la carte entre deux cafés, et lui ouvrir la lecture n'aurait
-- servi qu'à élargir la surface sans usage. Un contenu mis en avant est
-- l'inverse : c'est ce que le commerce MONTRE, et l'écran de comptoir a une
-- raison de le lire (dire à un client où retrouver la vidéo affichée sur le
-- QR). La lecture va donc à tous les membres, l'écriture aux seuls éditeurs —
-- motif `hunts`/`hunt_steps` (20260724120000), qui est celui du dépôt dès qu'un
-- objet est à la fois éditorial et consultable au comptoir.
--
-- Les privilèges par défaut de Supabase servent anon/authenticated sur toute
-- nouvelle table de `public` : on repart de zéro. `anon` n'est JAMAIS re-servi
-- — le visiteur passe par `vitrine_public_state`, qui choisit ce qui sort.
alter table public.vitrine_contenus enable row level security;

revoke all on table public.vitrine_contenus from public, anon, authenticated;

create policy "vitrine_contenus: member select" on public.vitrine_contenus
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "vitrine_contenus: editor write" on public.vitrine_contenus
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Grants COLONNE PAR COLONNE, motif des quatre tables de L11.
-- `organization_id` est écrivable à l'INSERT (c'est ainsi que la ligne se
-- rattache) et jamais à l'UPDATE : le locataire d'une ligne ne se corrige pas,
-- il se supprime et se ressaisit. `rang` EST modifiable — réordonner ses trois
-- contenus est le geste éditorial le plus banal qui soit.
grant select on table public.vitrine_contenus to authenticated;
grant insert (organization_id, rang, titre, url)
  on public.vitrine_contenus to authenticated;
grant update (rang, titre, url)
  on public.vitrine_contenus to authenticated;
-- Suppression OUVERTE et NON GARDÉE, contrairement à `vitrine_menus` : il n'y a
-- rien à compter avant de retirer un lien, et aucune cascade ne part d'ici.
grant delete on public.vitrine_contenus to authenticated;


-- ════════════════════════════════════════════════════════════
-- 2. `vitrine_public_state` — LA CLÉ `contenus`
--
-- ── LE CONTRAT, ÉCRIT UNE FOIS ──
--
--   "contenus": [{"titre": "…", "url": "…", "rang": 1}, …]
--
-- CLÉ SŒUR DE `liens`, ET NON UNE EXTENSION DE `liens`. Les deux ne sont pas de
-- même nature et n'ont pas la même durée de vie : `liens` porte TROIS adresses
-- FIXES et NOMMÉES, lues dans `organizations` (20260918120000) — l'écran sait
-- d'avance qu'il rendra une icône Google, une Instagram et une TikTok. Les
-- contenus mis en avant sont une LISTE ORDONNÉE, de longueur variable, dont
-- l'écran ne connaît ni le nombre ni les libellés. Les fondre dans un même objet
-- aurait forcé chaque lecture à distinguer « une clé que je connais » d'« une
-- clé que je découvre » à l'intérieur d'un seul enregistrement.
--
-- LA LISTE EXISTE TOUJOURS, éventuellement vide — même règle que les six listes
-- de `portes` (L13) : une clé absente aurait obligé la page à porter deux
-- chemins pour un seul état. Un bloc vide est masqué PAR L'ÉCRAN.
--
-- ── `limit 3` ALORS QUE LA TABLE NE PEUT PAS EN PORTER PLUS ──
--
-- Ce n'est pas une redondance gratuite : c'est la borne du DOCUMENT, et elle
-- vit là où le document se fabrique. La page est servie en ISR, donc payée par
-- chaque visiteur pendant toute la durée du cache ; la propriété « ce document
-- ne grossit pas » doit se lire dans la fonction qui le construit, sans avoir à
-- aller vérifier une contrainte de table trois cents lignes plus haut. Même
-- doctrine que `c_max_portes` en L13.
--
-- ── L'ORDRE EST `rang`, ET IL SUFFIT ──
--
-- Contrairement aux cartes (`order by ordre, id`) et aux portes (`order by nom,
-- id`), aucun second rang n'est nécessaire : `unique (organization_id, rang)`
-- interdit les ex æquo. C'est la contrainte qui rend le tri total, pas une
-- colonne de départage — et c'est précisément pour cela qu'elle a été posée.
--
-- MÊME SIGNATURE, DONC PAS DE `drop` : `src/lib/vitrine-context.ts` appelle à
-- deux arguments depuis L11, et `vitrine.test.sql` compte déjà qu'il n'existe
-- qu'UN exemplaire.
-- ════════════════════════════════════════════════════════════

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
  -- un catalogue. Voir l'en-tête de section de 20261014120000.
  c_max_portes constant integer := 12;
  -- LA BORNE DES CONTENUS MIS EN AVANT. Redondante avec le `check (rang between
  -- 1 and 3)` de la table, et délibérément : c'est la borne du DOCUMENT, elle
  -- se lit là où le document se fabrique.
  c_max_contenus constant integer := 3;
  v_activites  jsonb;
  v_files      jsonb;
  v_offres     jsonb;
  v_quiz       jsonb;
  v_contenus   jsonb;
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
  -- NI LES PORTES (L13) NI LES CONTENUS MIS EN AVANT (ce lot) n'y entrent, et
  -- c'est une décision, pas un oubli : ils ne passent pas par
  -- `vitrine_champs_traduisibles`, donc ni le numérateur ni le dénominateur ne
  -- bougent. La même arithmétique appliquée à l'envers ferait tomber le
  -- sélecteur de langue de toute vitrine traduite.
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

  -- ── LES CONTENUS MIS EN AVANT (VIT-4) ──────────────────────
  --
  -- Sous le droit `vitrine`, comme les portes : la garde est plus haut.
  -- L'ORDRE EST `rang` SEUL — l'unicité (organization_id, rang) interdit les ex
  -- æquo, donc le tri est déjà total. Aucun `id` de départage n'est nécessaire,
  -- et en poser un aurait laissé croire que des ex æquo sont possibles.
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
    -- TROIS adresses FIXES ET NOMMÉES : l'écran sait d'avance ce qu'il rendra.
    'liens', pg_catalog.jsonb_build_object(
      'google_review_url', v_org.google_review_url,
      'instagram_url', v_org.instagram_url,
      'tiktok_url', v_org.tiktok_url
    ),
    -- LES CONTENUS MIS EN AVANT (VIT-4) — CLÉ SŒUR de `liens`, et non une
    -- extension : une LISTE ORDONNÉE de longueur variable, dont l'écran ne
    -- connaît ni le nombre ni les libellés. Toujours présente, éventuellement
    -- vide.
    'contenus', v_contenus,
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
  'ajoutée en VIT-1b, PORTES en VIT-3, CONTENUS MIS EN AVANT en VIT-4). Exige '
  '`published` ET org_has_module_access(…, ''vitrine''), relu à CHAQUE '
  'consultation. Rend `unavailable` INDISTINCTEMENT pour un slug mal formé, '
  'inconnu, non publié ou sans droit — ce point d''entrée non authentifié n''est '
  'pas un oracle. `p_lang` null, ''fr'' ou INCONNUE → français : le repli est '
  'silencieux. En anglais, les traductions FRAÎCHES se superposent champ à champ '
  'et les périmées sont ignorées. Rend `lang` — la langue RÉELLEMENT servie — et '
  '`lang_coverage` DANS LES DEUX LANGUES ; le SEUIL reste dans l''application. '
  '`portes` rend l''annuaire des pages publiques du commerce : {reserver: '
  '{activites, files, offres}, experiences: {quiz}}, six listes TOUJOURS '
  'présentes, douze par liste, identifiants en TEXTE. `contenus` rend les UN À '
  'TROIS contenus mis en avant manuellement — [{titre, url, rang}], ordonnés par '
  'rang, liste TOUJOURS présente et bornée à trois DANS LA FONCTION (la borne du '
  'document se lit là où le document se fabrique). CLÉ SŒUR de `liens` et non '
  'une extension : `liens` porte trois adresses fixes et nommées, `contenus` une '
  'liste de longueur variable. NI LES PORTES NI LES CONTENUS NE SONT '
  'TRADUISIBLES : ils n''entrent ni au numérateur ni au dénominateur de '
  '`lang_coverage`, sans quoi toute vitrine traduite retomberait sous le seuil '
  'du sélecteur de langue. N''expose aucune donnée de client, aucun identifiant '
  'd''organisation.';

revoke all on function public.vitrine_public_state(text, text)
  from public, anon, authenticated;
grant execute on function public.vitrine_public_state(text, text) to service_role;


-- ════════════════════════════════════════════════════════════
-- 3. LE BEACON DE LA VITRINE — HUITIÈME VALEUR DU VOCABULAIRE COMPTÉ
--
-- ── LE GRAIN EST LA VITRINE, ET C'EST UNE LIGNE PAR COMMERCE ──
--
-- `module_page_opens.resource_id` porte « ce que CE QR désigne, pas
-- nécessairement la tête du module » : `events` compte par SESSION, `hunts` par
-- ÉTAPE, parce que ces deux modules impriment une affiche par sous-objet. La
-- vitrine, elle, EST une page unique par commerce — un seul QR, une seule
-- adresse. `resource_id` porte donc `vitrine_settings.id`, et il y a au plus une
-- ligne de compteur par commerce, ce qui est exactement le chiffre que le
-- commerçant attend : « combien de gens ont ouvert ma vitrine ».
--
-- Pourquoi `vitrine_settings.id` et non `organization_id` : la colonne est
-- documentée comme désignant une RESSOURCE, et `vitrine_settings` a justement
-- reçu un `id` propre en L10 « pour que les chemins d'images et les journaux
-- puissent la désigner sans recopier l'identifiant du locataire ». Recopier
-- l'organisation dans les deux colonnes aurait fait de `resource_id` un doublon.
--
-- ── LE CHECK SE REMPLACE, IL NE SE DOUBLE PAS ──
--
-- Motif exact de 20260912120000, qui a élargi ce même `check` à `hunts` :
-- contrainte de colonne, donc nommée par défaut
-- `module_page_opens_module_check`, remplacée et non complétée — deux
-- contraintes coexistantes laisseraient l'ancienne refuser `vitrine` en
-- silence. Le test pgTAP le vérifie par le COMPORTEMENT et non sur la foi du
-- nom.
--
-- ── ET LA RPC APPREND UNE HUITIÈME RÉSOLUTION, CE QUI N'EST PAS FACULTATIF ──
--
-- `src/lib/module-page-opens.test.ts` garde l'invariant à trois branches : la
-- liste TypeScript, ce `check`, et les branches de résolution de la RPC. Une clé
-- acceptée par le `check` mais absente de la RPC tomberait dans le `else return`
-- — zéro erreur, zéro comptage, pour toujours. C'est la faute la plus coûteuse
-- de cette table parce qu'elle est MUETTE : le commerçant lit 0 et croit que
-- personne ne scanne son affiche.
-- ════════════════════════════════════════════════════════════

alter table public.module_page_opens
  drop constraint if exists module_page_opens_module_check;

alter table public.module_page_opens
  add constraint module_page_opens_module_check check (
    module in (
      'quiz', 'calendar', 'jackpot', 'pronostics', 'loyalty', 'events',
      'hunts', 'vitrine'
    )
  );

comment on column public.module_page_opens.module is
  'Module compté, vocabulaire de organization_module_grants.module. Les deux absents le sont par décision : wheel compte déjà dans qr_codes.scan_count, referral n''a pas de QR commerçant (lien fabriqué côté joueur).';

comment on column public.module_page_opens.resource_id is
  'Ressource que CE QR désigne — pas nécessairement la tête du module : quiz, calendrier, jackpot, contest et programme de fidélité sont des têtes, events porte une SESSION (sous-objet de event_games), hunts une ÉTAPE (sous-objet de hunts), et vitrine la ligne de RÉGLAGES (vitrine_settings.id, une par commerce : la vitrine est une page unique, un seul QR). Le grain est l''affiche, pas le module. Polymorphe et SANS clé étrangère, comme reward_issuances.source_id.';

-- Réécrite EN ENTIER (et non complétée par un patch) pour rester le seul
-- endroit où lire les huit résolutions : c'est cette fonction que la revue
-- ouvre quand elle demande « qu'est-ce qui borne cet endpoint public ? ».
create or replace function public.increment_module_page_open(
  p_module text,
  p_public_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_id uuid;
  v_org_id uuid;
begin
  -- Garde de forme AVANT toute lecture : borne la longueur pour qu'un POST
  -- public ne fasse pas balayer un index avec une chaîne de 10 Mo.
  if p_module is null
     or p_public_id is null
     or pg_catalog.char_length(p_public_id) = 0
     or pg_catalog.char_length(p_public_id) > 128 then
    return;
  end if;

  -- Résolution de l'identifiant PUBLIC (celui de l'URL, donc du QR) vers la
  -- ressource et son organisation. Chaque module a sa forme propre — c'est
  -- exactement ce qu'une table générique doit absorber ici plutôt que de
  -- l'imposer à huit appelants.
  case p_module
    when 'quiz' then
      select q.id, q.organization_id into v_resource_id, v_org_id
        from public.quizzes q
       where q.public_slug = p_public_id;
    when 'calendar' then
      select c.id, c.organization_id into v_resource_id, v_org_id
        from public.calendars c
       where c.public_slug = p_public_id;
    when 'pronostics' then
      select c.id, c.organization_id into v_resource_id, v_org_id
        from public.contests c
       where c.slug = p_public_id;
    when 'events' then
      select s.id, s.organization_id into v_resource_id, v_org_id
        from public.event_sessions s
       where s.join_code = p_public_id;
    when 'hunts' then
      -- L'ÉTAPE, pas la chasse : `/hunt/[token]` porte le jeton de l'étape, et
      -- c'est une affiche par étape. `hunt_steps.token` est unique globalement
      -- — la résolution ne demande donc pas de connaître la chasse, et deux
      -- chasses ne peuvent pas se disputer une ligne de compteur.
      select s.id, s.organization_id into v_resource_id, v_org_id
        from public.hunt_steps s
       where s.token = p_public_id;
    when 'jackpot' then
      -- /jackpot/[id] accepte l'identifiant OU le slug. On caste l'uuid en
      -- TEXTE, jamais le texte en uuid : sur une entrée malformée le premier
      -- ne désigne rien, le second lèverait une 22P02 depuis un endpoint
      -- public.
      select j.id, j.organization_id into v_resource_id, v_org_id
        from public.jackpot_campaigns j
       where j.public_slug = p_public_id or j.id::text = p_public_id;
    when 'loyalty' then
      -- Le passeport n'a pas de slug : son URL porte l'identifiant.
      select p.id, p.organization_id into v_resource_id, v_org_id
        from public.loyalty_programs p
       where p.id::text = p_public_id;
    when 'vitrine' then
      -- LA LIGNE DE RÉGLAGES, une par commerce : `/v/[slug]` est une page
      -- unique, contrairement à `events` et `hunts` qui impriment une affiche
      -- par sous-objet. Le slug est unique GLOBALEMENT (L10), donc la
      -- résolution n'a pas besoin de connaître l'organisation.
      --
      -- NI `published` NI LE DROIT `vitrine` ne sont exigés ici, et c'est
      -- cohérent avec les sept autres branches : aucune ne teste le statut de
      -- sa ressource. La garde utile est ailleurs — une vitrine dépubliée rend
      -- `unavailable`, donc personne n'ouvre la page, donc le beacon n'est
      -- jamais appelé. La tester ici n'aurait rien fermé et aurait fait
      -- diverger cette branche des autres.
      select s.id, s.organization_id into v_resource_id, v_org_id
        from public.vitrine_settings s
       where s.slug = p_public_id;
    else
      -- Module hors vocabulaire : on ne lève pas, l'appelant est un beacon
      -- best-effort dont la réponse n'est pas lue.
      return;
  end case;

  -- L'identifiant ne désigne aucune ressource : on ne crée RIEN. C'est CETTE
  -- ligne qui borne la table et rend l'endpoint public tenable.
  if v_resource_id is null then
    return;
  end if;

  insert into public.module_page_opens as m (
    module, resource_id, organization_id,
    open_count, first_opened_at, last_opened_at
  )
  values (
    p_module, v_resource_id, v_org_id,
    1, pg_catalog.now(), pg_catalog.now()
  )
  on conflict (module, resource_id) do update
    set open_count = m.open_count + 1,
        last_opened_at = pg_catalog.now();
end;
$$;

comment on function public.increment_module_page_open(text, text) is
  'Incrémente le compteur d''ouvertures d''une page publique de module. Résout l''identifiant public (slug de quiz, de calendrier, de championnat ou de VITRINE, code de jonction, jeton d''étape de chasse ou identifiant) vers la ressource que le QR désigne ; ne crée rien si l''identifiant ne désigne aucune ressource. Huit branches depuis VIT-4 : la vitrine résout son slug vers vitrine_settings.id, une ligne de compteur par commerce.';

-- Réémis bien que `create or replace` préserve les privilèges : la porte
-- fermée est la propriété que la revue vient relire, elle doit se lire ici et
-- non se déduire de l'histoire de la fonction.
revoke all on function public.increment_module_page_open(text, text)
  from public, anon, authenticated;
grant execute on function public.increment_module_page_open(text, text)
  to service_role;


-- ════════════════════════════════════════════════════════════
-- 4. LES FAITS « RÉSERVER », ÉCRITS UNE FOIS
--
-- ── LE PROBLÈME ──
--
-- L'écran Clients agrège des PARTICIPATIONS par e-mail : gains, gains
-- récupérés, premier et dernier gain. Réserver produit depuis RES-1a des faits
-- au moins aussi parlants pour un commerçant — quelqu'un a réservé, quelqu'un
-- est VENU — et l'écran ne les connaît pas.
--
-- ── AUCUN E-MAIL NOUVEAU N'EST EXPOSÉ, ET C'EST LA CONTRAINTE CENTRALE ──
--
-- Ces trois tables portent des e-mails de clients. Cette fonction ne peut donc
-- jamais devenir un moyen d'en LIRE de nouveaux : elle sert d'ENRICHISSEMENT à
-- deux populations déjà rendues (les e-mails de `participations` pour la liste,
-- ceux de `newsletter_subscribers` pour les compteurs), par une jointure sur une
-- clé que l'appelant possède DÉJÀ. Un e-mail qui n'apparaît que dans une
-- réservation ne sort d'aucune des deux RPC : la jointure est un `left join`
-- DEPUIS la population, jamais une union avec elle.
--
-- C'est aussi pourquoi cette fonction est rendue à PERSONNE — pas même à
-- `service_role`. Appelée directement, elle rendrait la liste complète des
-- e-mails ayant réservé chez un commerçant, sans aucune garde : c'est le
-- contraire de ce qu'elle sert. Ses deux appelantes sont `security definer` et
-- s'exécutent sous leur propriétaire, qui n'a besoin d'aucun `grant`. Même
-- régime que `vitrine_cartes_json`.
--
-- ── POURQUOI UNE FONCTION ET NON DEUX BLOCS RECOPIÉS ──
--
-- Les deux RPC ont besoin des mêmes faits sur deux populations différentes.
-- C'est exactement le cas qui a fait naître `customer_segment_matches` en
-- 20260923120000 : « elles vivent sinon dans deux fichiers séparés, vertes
-- chacune de son côté pendant que leurs définitions divergent ». Six sous-
-- requêtes recopiées auraient divergé à la première correction de statut.
--
-- ── LES TROIS TABLES, ET CE QUE CHACUNE APPELLE « VENIR » ──
--
--   * `reservations`        — venu = `status = 'checked_in'` (la caisse a
--     enregistré l'arrivée ; le `check` de la table lie ce statut à
--     `checked_in_at`, les deux ne peuvent pas diverger) ;
--   * `reservation_queue_entries` — venu = `status = 'served'` (la file a
--     appelé la personne ET elle s'est présentée ; `no_show` est l'inverse
--     exact et il existe, ce qui rend `served` porteur) ;
--   * `reservation_stock_holds`   — venu = `status = 'redeemed'` (l'offre a été
--     retirée au comptoir).
--
-- LES TROIS PORTENT UN E-MAIL, vérifié dans le catalogue et non supposé :
-- `reservations.email`, `reservation_queue_entries.email`,
-- `reservation_stock_holds.email`, toutes trois nullables et toutes trois liées
-- à `consent_transactional_at` par un `check` d'équivalence. La quatrième table
-- à e-mail du module — `reservation_waitlist_entries` — est VOLONTAIREMENT
-- exclue : s'inscrire sur une liste d'attente n'est pas réserver, et la compter
-- aurait fait dire « a réservé » à quelqu'un qui n'a jamais obtenu de place.
--
-- `a_reserve` vaut `true` pour tout groupe rendu, et la simplicité est le
-- point : un groupe n'existe que si au moins une ligne existe. « Toute forme »
-- inclut donc les réservations ANNULÉES, et c'est voulu — une annulation reste
-- un client qui a voulu venir, ce qui est précisément ce qu'un commerçant veut
-- pouvoir relancer.
-- ════════════════════════════════════════════════════════════

create or replace function public.org_customer_reserver_facts(
  p_organization_id uuid
)
returns table (
  email text,
  a_reserve boolean,
  est_venu boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.email,
    -- Un groupe n'existe que si une ligne existe : « a réservé » EST la
    -- présence. L'écrire en dur plutôt qu'en `bool_or(true)` dit la même chose
    -- sans faire croire qu'une ligne pourrait valoir « n'a pas réservé ».
    true                        as a_reserve,
    pg_catalog.bool_or(f.venu)  as est_venu
    from (
      select r.email as email, r.status = 'checked_in' as venu
        from public.reservations r
       where r.organization_id = p_organization_id
         and r.email is not null
      union all
      select q.email, q.status = 'served'
        from public.reservation_queue_entries q
       where q.organization_id = p_organization_id
         and q.email is not null
      union all
      select h.email, h.status = 'redeemed'
        from public.reservation_stock_holds h
       where h.organization_id = p_organization_id
         and h.email is not null
    ) f
   group by f.email;
$$;

comment on function public.org_customer_reserver_facts(uuid) is
  'Faits « Réserver » d''une organisation, agrégés PAR E-MAIL : a_reserve (une '
  'ligne existe, toute forme et tout statut — une annulation reste un client qui '
  'a voulu venir) et est_venu (reservations.checked_in OU file served OU hold '
  'redeemed). Écrite UNE FOIS et appelée par org_segment_counts et '
  'org_customer_profiles_page : recopier six sous-requêtes aurait divergé à la '
  'première correction de statut, exactement le cas qui a fait naître '
  'customer_segment_matches. reservation_waitlist_entries est VOLONTAIREMENT '
  'exclue — s''inscrire sur une liste d''attente n''est pas réserver. RENDUE À '
  'PERSONNE, pas même à service_role : appelée directement elle rendrait la '
  'liste complète des e-mails ayant réservé chez un commerçant, sans garde. Ses '
  'deux appelantes sont security definer et s''exécutent sous leur propriétaire. '
  'Elle n''EXPOSE aucun e-mail nouveau : les deux RPC la joignent en `left join` '
  'DEPUIS leur population, jamais en union avec elle.';

revoke all on function public.org_customer_reserver_facts(uuid)
  from public, anon, authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- 5. `customer_segment_matches` — DEUX SEGMENTS DE PLUS
--
-- ── LA SIGNATURE CHANGE, DONC ON `drop` ──
--
-- Leçon de 20260923120000, réappliquée telle quelle : `create or replace` ne
-- remplacerait rien, il créerait une SURCHARGE, et deux fonctions homonymes
-- toutes deux appelables avec les anciens arguments rendraient AMBIGU (42725)
-- chaque appel resté à trois arguments. Le `drop` explicite garantit UNE entrée
-- `pg_proc` par nom — ce que `customer_profiles_page.test.sql` compte déjà pour
-- `org_customer_profiles_page` et compte désormais aussi pour celle-ci.
--
-- ── AUCUN DÉFAUT SUR LES DEUX NOUVEAUX ARGUMENTS ──
--
-- Les rendre facultatifs aurait laissé un appelant futur les omettre et
-- recevoir `false` en silence, c'est-à-dire un segment vide sans qu'aucune
-- erreur ne le dise. La fonction n'a que deux appelantes, toutes deux réécrites
-- dans ce fichier : le coût de l'explicite est nul, le coût de l'implicite est
-- un compteur muet.
--
-- ── DEUX LIBELLÉS, ET PAS DE JUMEAU ANGLAIS ──
--
-- Les trois segments existants portent chacun deux noms — `fidele`/`loyal`,
-- `nouveau`/`new`, `a_relancer`/`inactive` — parce que l'écran Newsletter parle
-- anglais depuis 00013 et que le faire migrer n'était pas dans ce chantier-là.
-- `a_reserve` et `venu` n'ont AUCUN appelant historique : leur inventer un
-- jumeau anglais reviendrait à créer aujourd'hui la dette que l'autre moitié
-- traîne. Deux libellés, un vocabulaire.
--
-- Les segments ne sont toujours PAS exclusifs : quelqu'un peut être fidèle, à
-- relancer, avoir réservé et être venu. C'est déjà vrai des trois premiers.
-- ════════════════════════════════════════════════════════════

drop function if exists public.customer_segment_matches(text, bigint, timestamptz);

create or replace function public.customer_segment_matches(
  p_segment text,
  p_wins bigint,
  p_last_win timestamptz,
  p_a_reserve boolean,
  p_est_venu boolean
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case pg_catalog.lower(pg_catalog.btrim(coalesce(p_segment, '')))
    -- Absence de filtre : `null`, chaîne vide, ou le `all` de l'existant.
    when ''           then true
    when 'all'        then true
    when 'tous'       then true
    -- Fidèle : au moins trois gains. Seuil de `org_segment_counts`.
    when 'fidele'     then coalesce(p_wins, 0) >= 3
    when 'loyal'      then coalesce(p_wins, 0) >= 3
    -- Nouveau : EXACTEMENT un gain. `= 1` et non `<= 1` — un client à zéro
    -- gain n'est pas « nouveau », il n'a simplement jamais joué.
    when 'nouveau'    then coalesce(p_wins, 0) = 1
    when 'new'        then coalesce(p_wins, 0) = 1
    -- À relancer : dernier gain daté, et vieux de plus de soixante jours.
    -- Le `is not null` est porteur : sans lui, un client sans aucun gain
    -- passerait le test par comparaison nulle… non, il le raterait
    -- silencieusement, et c'est pire — on ne saurait pas lequel des deux
    -- comportements est voulu. Il est écrit.
    when 'a_relancer' then p_last_win is not null
                        and p_last_win < pg_catalog.now() - interval '60 days'
    when 'inactive'   then p_last_win is not null
                        and p_last_win < pg_catalog.now() - interval '60 days'
    -- A RÉSERVÉ : au moins une trace dans Réserver, tout statut confondu.
    -- Le `coalesce` couvre l'absence de fait — un client sans aucune ligne
    -- reçoit `null` du `left join`, et `null` n'est pas `false` pour un
    -- `filter`, qui ne compte que ce qui est vrai. Il est écrit pour que la
    -- fonction rende un BOOLÉEN et jamais `null`.
    when 'a_reserve'  then coalesce(p_a_reserve, false)
    -- EST VENU : la caisse a enregistré l'arrivée, la file a servi, ou l'offre
    -- a été retirée. C'est le fait le plus rare et le plus précieux des deux.
    when 'venu'       then coalesce(p_est_venu, false)
    else false
  end;
$$;

comment on function public.customer_segment_matches(text, bigint, timestamptz, boolean, boolean) is
  'Prédicat de segmentation client, partagé par org_segment_counts (qui compte des newsletter_subscribers) et org_customer_profiles_page (qui liste des e-mails de participations). Les deux populations diffèrent — un abonné qui n''a jamais joué n''est pas dans la liste, un joueur non abonné n''est pas dans le compteur — mais la DÉFINITION des segments est écrite à un seul endroit : « fidèle » (3 gains), « nouveau » (exactement 1), « à relancer » (dernier gain > 60 jours), « a réservé » (une trace dans Réserver, tout statut) et « venu » (arrivée enregistrée, file servie ou offre retirée). Les cinq segments ne sont PAS exclusifs. Vocabulaires acceptés : fidele/nouveau/a_relancer (écran Clients) et loyal/new/inactive (historique de l''écran Newsletter) ; a_reserve et venu n''ont pas de jumeau anglais, aucun appelant historique ne les nomme et leur en inventer un créerait aujourd''hui la dette que l''autre moitié traîne. Les deux booléens sont OBLIGATOIRES, sans défaut : les rendre facultatifs aurait laissé un appelant futur recevoir false en silence, donc un segment vide sans erreur. Segment inconnu ⇒ false. N''est PAS utilisée par org_segment_emails, dont les seuils sont paramétrables.';

-- Fonction interne : elle n'est appelée que depuis le corps de fonctions
-- `security definer`, lesquelles s'exécutent sous leur propriétaire et n'ont
-- donc besoin d'aucun `grant` pour l'atteindre. `authenticated` est retiré au
-- même titre qu'`anon` — même patron que `purge_expired_personal_data`. Le
-- `drop` ci-dessus a emporté l'ACL d'origine : sans ce couple, la fonction
-- porterait l'EXECUTE par défaut de PUBLIC (ADR-082), dont `anon` hérite.
revoke all on function
  public.customer_segment_matches(text, bigint, timestamptz, boolean, boolean)
  from public, anon, authenticated;
grant execute on function
  public.customer_segment_matches(text, bigint, timestamptz, boolean, boolean)
  to service_role;


-- ════════════════════════════════════════════════════════════
-- 6. `org_segment_counts` — DEUX COMPTEURS DE PLUS
--
-- ── POURQUOI UN `drop` ICI AUSSI, ALORS QUE LES ARGUMENTS NE BOUGENT PAS ──
--
-- Ce sont les colonnes de SORTIE qui changent. Postgres refuse de remplacer une
-- fonction dont le type de retour diffère (42P13, « cannot change return type of
-- existing function ») : `create or replace` seul aurait fait ÉCHOUER la
-- migration, pas créer une surcharge. Le `drop` est donc obligatoire, et il
-- impose en retour de réémettre l'intégralité du couple `revoke`/`grant` — une
-- fonction fraîchement créée porte l'EXECUTE par défaut de PUBLIC.
--
-- Les deux colonnes s'ajoutent EN QUEUE. Les appelants lisent par NOM
-- (PostgREST rend des objets, `src/app/dashboard/newsletter/page.tsx` et
-- `.../customers/page.tsx` déstructurent des propriétés), donc la position ne
-- porte rien — mais l'ordre reste le contrat lisible du fichier, et insérer au
-- milieu aurait fait diverger la lecture de la déclaration pour rien.
--
-- LA POPULATION NE CHANGE PAS : `newsletter_subscribers` non désabonnés. Un
-- client qui a réservé sans s'être abonné n'entre pas dans ces compteurs, comme
-- il n'y entrait pas quand il jouait sans s'abonner. La fonction compte des
-- ABONNÉS, pas des clients — c'est la liste d'`org_customer_profiles_page` qui
-- compte des clients, et l'écart entre les deux est mesuré depuis 20260923120000
-- plutôt que passé sous silence.
--
-- La garde reste `is_org_owner`.
-- ════════════════════════════════════════════════════════════

drop function if exists public.org_segment_counts(uuid);

create or replace function public.org_segment_counts(p_organization_id uuid)
returns table (
  all_count bigint,
  loyal_count bigint,
  new_count bigint,
  inactive_count bigint,
  reserve_count bigint,
  venu_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_owner(p_organization_id) then
    raise exception 'not authorized';
  end if;

  return query
  with faits as (
    select * from public.org_customer_reserver_facts(p_organization_id)
  ),
  base as (
    select
      s.id,
      coalesce(agg.wins, 0) as wins,
      agg.last_win,
      -- `left join` DEPUIS les abonnés : un e-mail qui n'apparaît que dans une
      -- réservation n'ajoute AUCUNE ligne au compteur. C'est ce qui garantit
      -- qu'aucun e-mail nouveau n'entre par cette porte.
      coalesce(f.a_reserve, false) as a_reserve,
      coalesce(f.est_venu, false)  as est_venu
      from public.newsletter_subscribers s
      left join lateral (
        select count(*) as wins, max(p.created_at) as last_win
          from public.participations p
         where p.organization_id = s.organization_id
           and p.email = s.email
      ) agg on true
      left join faits f on f.email = s.email
     where s.organization_id = p_organization_id
       and s.unsubscribed_at is null
  )
  select
    count(*),
    count(*) filter (
      where public.customer_segment_matches(
        'loyal', b.wins, b.last_win, b.a_reserve, b.est_venu)),
    count(*) filter (
      where public.customer_segment_matches(
        'new', b.wins, b.last_win, b.a_reserve, b.est_venu)),
    count(*) filter (
      where public.customer_segment_matches(
        'inactive', b.wins, b.last_win, b.a_reserve, b.est_venu)),
    count(*) filter (
      where public.customer_segment_matches(
        'a_reserve', b.wins, b.last_win, b.a_reserve, b.est_venu)),
    count(*) filter (
      where public.customer_segment_matches(
        'venu', b.wins, b.last_win, b.a_reserve, b.est_venu))
    from base b;
end;
$$;

comment on function public.org_segment_counts(uuid) is
  'Taille des segments d''abonnés newsletter d''une organisation : total, fidèles, nouveaux, à relancer, PLUS « a réservé » et « est venu » depuis VIT-4. Le prédicat des cinq segments vit dans customer_segment_matches, partagé avec org_customer_profiles_page ; les faits Réserver viennent d''org_customer_reserver_facts, partagée elle aussi. Population comptée : newsletter_subscribers non désabonnés — pas les joueurs, qui sont la population d''org_customer_profiles_page. Le `left join` sur les faits Réserver part DES ABONNÉS : un e-mail qui n''existe que dans une réservation n''ajoute aucune ligne, donc aucun e-mail nouveau n''entre par cette porte. Gardée par is_org_owner.';

-- Le `drop` ci-dessus a emporté l'ACL de l'ancienne signature.
revoke all on function public.org_segment_counts(uuid) from public, anon;
grant execute on function public.org_segment_counts(uuid)
  to authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- 7. `org_customer_profiles_page` — DEUX FAITS DE PLUS PAR PROFIL
--
-- Même raison de `drop` qu'à la section 6 : le type de retour change (deux
-- colonnes en queue), et Postgres refuse alors le `create or replace`. Les
-- ARGUMENTS, eux, ne bougent pas — `(uuid, integer, integer, text, text, text)`
-- reste la signature d'appel, et les assertions d'ACL de
-- `customer_profiles_page.test.sql` qui la nomment restent justes.
--
-- ── LA BASE DE DÉPART EST 20260928120000, PAS 20260923120000 ──
--
-- Cette fonction a été créée en 20260923120000 puis REDÉFINIE en
-- 20260928120000, qui lui a ajouté le plafond d'offset `v_offset > 500 *
-- v_limit`. Réécrire une fonction en entier depuis la migration qui l'a
-- INTRODUITE au lieu de celle qui la définit AUJOURD'HUI est la faute la plus
-- coûteuse de ce genre de lot : elle retire une garde en silence, la migration
-- passe, les tests de la garde retirée vivent dans un autre fichier, et le trou
-- se rouvre sans qu'aucune ligne de diff ne le dise. Le corps ci-dessous part
-- donc de la version EN VIGUEUR.
--
-- ── LES DEUX COLONNES SONT EN QUEUE, APRÈS `total_count` ──
--
-- `total_count` est une colonne de MÉTA (le total avant pagination, rendu en
-- fenêtre sur chaque ligne) et non un fait du client : la ranger au milieu des
-- faits aurait été plus joli. Elle reste où elle est, et les deux nouveaux faits
-- passent derrière, parce que la lecture est NOMINALE des deux côtés — PostgREST
-- rend des objets, `src/app/dashboard/customers/page.tsx` et son export CSV
-- lisent `r.email`, `r.wins`, `r.total_count` — et qu'un déplacement de colonne
-- ne rachèterait donc aucun risque en échange d'un diff plus large.
--
-- ── AUCUN E-MAIL NOUVEAU DANS LA SORTIE ──
--
-- La population reste STRICTEMENT `participations` groupé par e-mail : le
-- `left join` sur les faits Réserver part de ce groupe. Quelqu'un qui a réservé
-- sans jamais avoir joué n'apparaît PAS dans cette liste — ce serait un e-mail
-- que l'écran n'exposait pas hier, donc une extension de la donnée personnelle
-- rendue, qui n'est pas ce qu'un ajout de segment doit décider. La décision est
-- écrite ici parce qu'elle est invisible dans le code : un `full join` au lieu
-- d'un `left join` l'aurait retournée sans rien casser.
-- ════════════════════════════════════════════════════════════

drop function if exists
  public.org_customer_profiles_page(uuid, integer, integer, text, text, text);

create or replace function public.org_customer_profiles_page(
  p_organization_id uuid,
  p_offset integer default 0,
  p_limit integer default 50,
  p_q text default null,
  p_segment text default null,
  p_tri text default 'dernier_gain'
)
returns table (
  email text,
  first_name text,
  wins bigint,
  redeemed bigint,
  first_win timestamptz,
  last_win timestamptz,
  total_count bigint,
  a_reserve boolean,
  est_venu boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
-- `email`, `first_name` et `wins` sont à la fois colonnes de sortie et colonnes
-- réelles de `participations` : même précaution que dans `org_qr_hub`, et pour
-- la même raison — un 42702 ne se lève qu'à l'EXÉCUTION, le DDL passe. Les deux
-- nouvelles colonnes de sortie, `a_reserve` et `est_venu`, portent le même nom
-- que les colonnes rendues par org_customer_reserver_facts : elles tombent sous
-- la même règle.
#variable_conflict use_column
declare
  v_limit  integer;
  v_offset integer;
  v_q      text;
  v_tri    text;
begin
  -- Garde INCHANGÉE : `is_org_owner`, ni membre ni éditeur. Cette liste est
  -- nominative (e-mails, prénoms, historique de gains) et la page la réserve
  -- déjà au propriétaire (redirection vers /dashboard/redeem sinon).
  if not public.is_org_owner(p_organization_id) then
    raise exception 'not authorized';
  end if;

  -- `coalesce` AVANT le contrôle, et c'est le correctif d'un trou discret :
  -- l'ancienne version testait `p_limit > 100` sur la valeur brute. Un appel
  -- PostgREST passant `p_limit: null` rendait la comparaison NULL — donc pas
  -- `true`, donc pas d'exception — puis `limit null` signifie AUCUNE limite.
  -- Le plafond de cent était contournable en un paramètre.
  v_offset := coalesce(p_offset, 0);
  v_limit  := coalesce(p_limit, 50);
  -- LE PLAFOND D'OFFSET DU WAGON 4 (CNT-1, 20260928120000), REPRIS TEL QUEL.
  --
  -- Ce fichier réécrit la fonction en entier : oublier cette ligne l'aurait
  -- SILENCIEUSEMENT retirée, et rouvert exactement le trou qu'elle ferme — cette
  -- RPC est `grant execute … to authenticated`, donc ce n'est pas l'écran qui
  -- choisit `p_offset` mais le client, et un `?page=1000000` recopié dans la
  -- barre d'adresse suffisait à faire trier puis jeter la liste entière. 500 est
  -- LE plafond de pages du produit, partagé par cinq sites SQL et
  -- `parsePageParam` côté TypeScript ; il est multiplié par la limite EFFECTIVE,
  -- déjà bornée à 100 juste au-dessus.
  if v_offset < 0 or v_limit < 1 or v_limit > 100
     or v_offset > 500 * v_limit then
    raise exception 'invalid pagination';
  end if;

  -- Liste blanche du tri : la valeur ne touche JAMAIS le texte de la requête,
  -- elle est comparée dans des `case` de la clause `order by`. Une valeur
  -- inconnue retombe sur le tri par défaut — un tri ne cache aucune donnée, et
  -- un paramètre d'URL mal tapé ne doit pas rendre la page inaccessible.
  v_tri := coalesce(pg_catalog.lower(pg_catalog.btrim(coalesce(p_tri, ''))), '');
  if v_tri not in ('dernier_gain', 'gains', 'recuperes', 'premier_gain') then
    v_tri := 'dernier_gain';
  end if;

  -- Jumeau du bloc d'échappement d'`org_qr_hub` — les deux doivent bouger
  -- ensemble. Le backslash d'abord, sinon on échappe ses propres échappements.
  v_q := nullif(pg_catalog.btrim(coalesce(p_q, '')), '');
  if v_q is not null then
    v_q := '%'
        || pg_catalog.replace(
             pg_catalog.replace(
               pg_catalog.replace(v_q, '\', '\\'),
               '%', '\%'),
             '_', '\_')
        || '%';
  end if;

  return query
  with faits as (
    select * from public.org_customer_reserver_facts(p_organization_id)
  ),
  profiles as (
    -- Le regroupement est l'E-MAIL : c'est lui l'identité d'un « client » ici,
    -- faute de compte joueur côté commerçant. `first_name` et `phone` varient
    -- d'une participation à l'autre (formulaire ressaisi) : on retient le plus
    -- RÉCENT NON NUL.
    --
    -- Le `filter (where … is not null)` est un CHANGEMENT de comportement, et
    -- il est délibéré. L'ancienne version prenait le premier élément du tableau
    -- trié sans filtrer : si la participation la plus récente venait d'une
    -- campagne sans collecte de prénom (`first_name` est nullable depuis
    -- 00004), la ligne s'affichait sans prénom alors qu'une participation plus
    -- ancienne en portait un. Le garder tel quel aurait de surcroît rendu ce
    -- client INTROUVABLE par la nouvelle recherche sur le prénom — « ce que je
    -- vois » et « ce que je cherche » doivent être la même valeur, sinon le
    -- champ de recherche paraît cassé. Le prénom n'est désormais vide que si
    -- AUCUNE participation n'en a jamais porté.
    --
    -- `phone` est agrégé pour être CHERCHÉ, pas rendu : ajouter une colonne de
    -- téléphone à une liste de cinquante lignes est une décision d'exposition
    -- de données personnelles, pas un effet de bord d'un ajout de filtre.
    select
      p.email                                                   as email,
      (pg_catalog.array_agg(p.first_name order by p.created_at desc)
        filter (where p.first_name is not null))[1]             as first_name,
      (pg_catalog.array_agg(p.phone order by p.created_at desc)
        filter (where p.phone is not null))[1]                  as phone,
      count(*)                                                  as wins,
      count(*) filter (where p.redeemed_at is not null)          as redeemed,
      min(p.created_at)                                          as first_win,
      max(p.created_at)                                          as last_win
      from public.participations p
     where p.organization_id = p_organization_id
       and p.email is not null
     group by p.email
  ),
  enrichis as (
    -- `left join` DEPUIS les profils, JAMAIS une union : quelqu'un qui a
    -- réservé sans jamais avoir joué n'apparaît pas dans cette liste. Ce serait
    -- un e-mail que l'écran n'exposait pas hier.
    select
      pr.*,
      coalesce(f.a_reserve, false) as a_reserve,
      coalesce(f.est_venu, false)  as est_venu
      from profiles pr
      left join faits f on f.email = pr.email
  ),
  filtered as (
    select en.*
      from enrichis en
     -- La recherche porte sur le profil AGRÉGÉ, donc sur ce que la page
     -- affiche : chercher un prénom vu à l'écran doit le retrouver. Le
     -- téléphone est le seul critère cherché sans être rendu.
     where (
         v_q is null
         or en.email      ilike v_q escape '\'
         or en.first_name ilike v_q escape '\'
         or en.phone      ilike v_q escape '\'
       )
       -- MÊME prédicat que `org_segment_counts`, littéralement la même
       -- fonction. Les segments ne sont pas exclusifs : un client peut être
       -- « fidèle » ET « à relancer », comme il l'est déjà dans les compteurs.
       and public.customer_segment_matches(
             p_segment, en.wins, en.last_win, en.a_reserve, en.est_venu)
  )
  select
    f.email,
    f.first_name,
    f.wins,
    f.redeemed,
    f.first_win,
    f.last_win,
    -- Total AVANT pagination, sur l'ensemble FILTRÉ : la fenêtre s'évalue avant
    -- `limit`/`offset`. Ensemble vide ⇒ aucune ligne, donc aucun total à lire.
    count(*) over ()::bigint as total_count,
    -- LES DEUX FAITS RÉSERVER, en queue. Toujours des booléens, jamais `null` :
    -- le `coalesce` est posé dans `enrichis`, pas ici, pour que le prédicat de
    -- segment reçoive la même valeur que la colonne rendue.
    f.a_reserve,
    f.est_venu
    from filtered f
   -- Quatre tris possibles, quatre `case` : un seul est non nul à la fois, les
   -- trois autres valent NULL sur TOUTES les lignes et ne départagent donc
   -- rien. Un `case` unique serait impossible — il faudrait faire cohabiter un
   -- `bigint` et un `timestamptz` dans une même expression.
   order by
     case when v_tri = 'gains'        then f.wins      end desc nulls last,
     case when v_tri = 'recuperes'    then f.redeemed  end desc nulls last,
     case when v_tri = 'premier_gain' then f.first_win end desc nulls last,
     case when v_tri = 'dernier_gain' then f.last_win  end desc nulls last,
     -- Départage OBLIGATOIRE, et il manquait : `order by last_win desc` seul
     -- laissait deux clients au même dernier gain permuter entre deux appels,
     -- donc apparaître deux fois ou pas du tout d'une page à l'autre. `email`
     -- est la clé de regroupement : le tri devient total.
     f.email asc
   limit v_limit offset v_offset;
end;
$$;

comment on function public.org_customer_profiles_page(uuid, integer, integer, text, text, text) is
  'Page de la liste clients d''une organisation : un profil agrégé par e-mail distinct de participations (prénom le plus récent, nombre de gains, nombre récupérés, premier et dernier gain), avec total_count en fenêtre avant pagination, PLUS depuis VIT-4 les deux faits Réserver a_reserve et est_venu, en queue. La population reste STRICTEMENT participations : les faits Réserver arrivent par un left join DEPUIS ce groupe, jamais par une union — quelqu''un qui a réservé sans jamais avoir joué n''apparaît pas, et aucun e-mail nouveau n''est donc exposé. p_q cherche, ilike échappé, sur l''e-mail, le prénom et le TÉLÉPHONE — ce dernier est cherché mais volontairement pas rendu. p_segment (fidele|nouveau|a_relancer|a_reserve|venu, alias loyal|new|inactive) applique customer_segment_matches, la MÊME fonction qu''org_segment_counts : les deux appliquent la même définition à deux populations différentes (joueurs ici, abonnés newsletter là-bas). p_tri : dernier_gain (défaut) | gains | recuperes | premier_gain, tous décroissants, liste blanche, valeur inconnue ⇒ défaut ; départage par e-mail pour que la pagination soit stable. Gardée par is_org_owner — ni membre ni éditeur, la liste est nominative.';

-- Le `drop` ci-dessus a emporté l'ACL de l'ancienne signature : sans ce couple,
-- la nouvelle fonction porterait l'EXECUTE par défaut de PUBLIC, dont `anon`
-- hérite — une liste nominative de clients ouverte à un appel PostgREST anonyme,
-- la garde `is_org_owner` étant alors le seul rempart.
revoke all on function
  public.org_customer_profiles_page(uuid, integer, integer, text, text, text)
  from public, anon;
grant execute on function
  public.org_customer_profiles_page(uuid, integer, integer, text, text, text)
  to authenticated, service_role;
