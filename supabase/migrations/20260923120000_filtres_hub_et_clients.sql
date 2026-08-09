-- ============================================================
-- TRIS ET FILTRES — `org_qr_hub` ET `org_customer_profiles_page`
--
-- Deux écrans gagnent des filtres que leur liste ne savait pas porter, et dans
-- les deux cas le prédicat descend en base parce qu'il porte sur un ENSEMBLE
-- que le client ne détient pas en entier : l'union des huit modules pour le
-- hub, le total avant pagination pour les clients.
--
-- ── LOT A · `org_qr_hub` : `p_etat` ET `p_jamais_scanne` ──
--
-- Les tuiles de la Vue d'ensemble (« Brouillons », « En cours », « QR jamais
-- scannés ») comptent des choses que la liste du hub ne savait pas isoler. Un
-- compteur sur lequel on clique doit mener à la liste EXACTE qu'il a comptée,
-- sinon il ment.
--
--   * `p_etat` filtre sur un état NORMALISÉ, et la normalisation est le sujet :
--     les huit tables n'ont pas le même vocabulaire de statut. Relevé au
--     catalogue vivant (pg_constraint), pas dans les migrations d'origine :
--
--       campaigns          draft · active · paused · archived
--       quizzes            draft · active ·          archived
--       calendars          draft · active ·          archived
--       contests           draft · active ·                    finished
--       jackpot_campaigns  draft · active ·          archived
--       loyalty_programs   draft · active ·          archived
--       event_games        draft · active ·          archived
--       hunts              draft · active ·          archived
--
--     Deux singularités, et une seule table les porte chacune : `paused`
--     n'existe QUE pour `campaigns`, `finished` QUE pour `contests`. Un filtre
--     écrit sur le vocabulaire d'une table serait donc faux sur les sept
--     autres — c'est précisément pourquoi il ne peut pas vivre côté client.
--
--     L'ensemble normalisé est volontairement PETIT — `brouillon`, `actif`,
--     `en_pause`, `termine` — parce qu'il doit valoir pour huit modules à la
--     fois. `termine` recouvre donc DEUX vocables : l'`archived` des sept
--     modules qui archivent, et le `finished` des pronostics. Ce n'est pas un
--     amalgame paresseux : du point de vue du commerçant qui cherche « ce qui
--     ne tourne plus », un concours terminé et un calendrier archivé sont la
--     même chose.
--
--     Le mapping est écrit DANS CHAQUE BRANCHE, et non factorisé dans une
--     fonction commune. Une fonction commune mapperait silencieusement vers
--     NULL le jour où une table gagne un statut ; huit `case` explicites
--     obligent l'auteur du neuvième module à écrire le sien.
--
--     `status` — le vocable BRUT — reste rendu tel quel : le front le mappe
--     déjà pour ses pastilles, et la colonne `etat` s'ajoute À CÔTÉ.
--
--     ⚠ CE QUE `p_etat` NE FAIT PAS : rendre le MÊME NOMBRE que les tuiles
--     « Brouillons » et « En cours » du Centre d'animation. Les deux comptent
--     à un GRAIN différent, et aucun paramètre ne peut les réconcilier :
--
--       · `org_animation_center_counts.drafts` compte des CAMPAGNES à l'état
--         `draft` ; le hub rend UNE LIGNE PAR QR de ces campagnes. Une campagne
--         brouillon sans aucun QR compte pour 1 dans la tuile et pour ZÉRO ici ;
--         une campagne brouillon à trois affiches compte 1 là-bas et 3 ici.
--       · La tuile balaie NEUF modules — le parrainage en fait partie, via son
--         booléen `enabled`. Le hub n'en connaît que HUIT : le parrainage n'a
--         pas d'adresse publique à imprimer, il n'a donc aucune ligne ici.
--
--     Ce n'est pas réparable dans cette fonction sans casser ce qui fait le
--     hub — « une ligne par affiche » est sa raison d'être (20260922120000).
--     C'est donc l'ÉCRAN qui doit ne pas promettre l'égalité : une tuile qui
--     mène à une liste plus courte que son propre chiffre est exactement le
--     compteur menteur qu'on cherchait à éviter. Le libellé de destination doit
--     dire « les affiches concernées », pas répéter le nombre.
--
--   * `p_jamais_scanne` ne rend que les lignes `campaign` dont `scan_count`
--     vaut 0. Le prédicat est copié à l'identique de `qr_never_scanned`
--     (`org_animation_center_counts`, 20260914120000) :
--         from public.qr_codes q
--        where q.organization_id = p_organization_id and q.scan_count = 0
--     La branche `campaign` du hub rend déjà UNE ligne par `qr_codes` de
--     l'organisation (le `left join` sur `campaigns` n'en retire aucune), donc
--     `kind = 'campaign' and scan_count = 0` désigne exactement le même
--     ensemble. Si l'un des deux prédicats bouge un jour sans l'autre, le
--     compteur et la liste divergeront sans qu'aucun test générique ne le voie :
--     `qr_hub.test.sql` compare désormais les deux sur les mêmes fixtures.
--
--     Les sept autres modules n'ont pas de compteur de scans (`scan_count` est
--     NULL chez eux, leur compteur est `open_count`), donc `p_jamais_scanne`
--     les exclut TOUS. Ce n'est pas une omission : « jamais scanné » n'a de
--     sens que pour une affiche, et la roue est le seul module qui en ait une
--     comme objet de première classe.
--
-- ── LOT B · `org_customer_profiles_page` : recherche, segment, tri ──
--
-- La page Clients affichait 50 lignes triées par dernier gain, sans autre
-- prise. Trois paramètres s'ajoutent, et le deuxième est le seul qui demande
-- une décision.
--
--   * `p_q` : `ilike` échappé, sur l'e-mail, le prénom et le téléphone. La
--     table `participations` ne porte PAS de nom de famille — il n'a jamais été
--     collecté (00001, puis 00004 qui rend `first_name` nullable et ajoute
--     `phone`). « Recherche sur le nom » se réduit donc au prénom, faute de
--     colonne, et non par choix.
--
--   * `p_segment` : le prédicat des segments EXISTE DÉJÀ, dans
--     `org_segment_counts` (relevé au catalogue vivant : c'est la version de
--     00017 qui a gagné, gardée par `is_org_owner`). Le recopier ici
--     garantirait qu'un jour l'un des deux bouge seul. Il est donc EXTRAIT dans
--     `public.customer_segment_matches(text, bigint, timestamptz)`, que les
--     DEUX fonctions appellent — c'est la seule façon d'écrire « le compteur et
--     la liste comptent la même chose » plutôt que de l'espérer.
--
--     Ce qu'il faut savoir avant de lire les chiffres, et qui n'est écrit nulle
--     part ailleurs : les deux fonctions appliquent le même PRÉDICAT à des
--     POPULATIONS DIFFÉRENTES. `org_segment_counts` compte des
--     `newsletter_subscribers` ; `org_customer_profiles_page` liste des e-mails
--     distincts de `participations`. Un joueur qui a gagné sans s'abonner est
--     dans la liste et hors du compteur ; un abonné qui n'a jamais joué est
--     l'inverse. Les deux nombres n'ont donc aucune raison d'être égaux, et
--     ce n'est pas un défaut : ce sont deux questions différentes. Ce que la
--     factorisation garantit, c'est qu'ils appliquent la MÊME définition de
--     « fidèle ».
--
--     Les seuils (3 gains, 60 jours) restent ceux de `org_segment_counts`.
--     `org_segment_emails` n'est PAS ralliée : elle porte ses seuils en
--     paramètres (`p_loyal_wins`, `p_inactive_days`), la fonction commune ne
--     saurait pas les honorer, et l'écran Newsletter s'en sert.
--
--     Les segments ne sont PAS exclusifs, exactement comme les `filter` de
--     `org_segment_counts` : un client à cinq gains dont le dernier remonte à
--     quatre-vingts jours est fidèle ET à relancer. La pastille de la page
--     (src/app/dashboard/customers/page.tsx) le classe, elle, dans UN seul
--     segment avec « à relancer » en premier — c'est un affichage, pas le
--     prédicat, et c'est désormais le SQL qui fait foi pour le filtre.
--
--   * `p_tri` : liste blanche dans la fonction, jamais d'interpolation. Une
--     valeur hors liste retombe sur le tri par défaut plutôt que de lever :
--     c'est un tri, il ne cache aucune donnée, et un paramètre d'URL mal tapé
--     ne doit pas rendre la page inaccessible au commerçant.
--
--     Le départage par `email` est nouveau et il corrige un défaut latent : le
--     tri d'origine (`order by last_win desc`, sans second critère) laissait
--     deux clients au même dernier gain changer d'ordre entre deux pages, donc
--     apparaître deux fois ou pas du tout. `email` est la clé de regroupement,
--     donc unique : le tri devient total.
--
-- ── POURQUOI UN DROP, ET NON UN `CREATE OR REPLACE` ──
--
-- Les deux signatures changent. `create or replace` ne remplacerait rien : il
-- créerait une SURCHARGE, et deux fonctions homonymes toutes deux appelables
-- avec les anciens arguments rendraient tout appel ambigu (42725), y compris
-- ceux de la page en production. Le `drop` explicite garantit UNE entrée
-- `pg_proc` par nom. Il impose en retour de réémettre l'intégralité du couple
-- `revoke`/`grant` : une fonction fraîchement créée porte l'EXECUTE par défaut
-- de PUBLIC (ADR-082), dont `anon` hérite.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 0. LE PRÉDICAT DE SEGMENT, EXTRAIT
--
-- Pur : il ne lit aucune table, il juge deux scalaires déjà agrégés par
-- l'appelant. C'est ce qui lui permet de servir deux populations différentes
-- sans rien savoir d'elles.
--
-- `stable` et non `immutable` : « à relancer » se compare à `now()`.
--
-- Les deux vocabulaires sont acceptés — le français de l'écran Clients
-- (`fidele`, `nouveau`, `a_relancer`) et l'anglais historique de
-- `org_segment_counts` et `org_segment_emails` (`loyal`, `new`, `inactive`).
-- Faire migrer le second aurait demandé de toucher l'écran Newsletter, qui
-- n'est pas dans ce chantier ; accepter les deux coûte trois lignes et évite
-- une traduction dans chaque appelant.
--
-- Un segment inconnu rend FALSE, jamais TRUE : une faute de frappe doit vider
-- la liste, pas la rendre en entier en laissant croire au filtre.
-- ════════════════════════════════════════════════════════════
create or replace function public.customer_segment_matches(
  p_segment text,
  p_wins bigint,
  p_last_win timestamptz
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
    else false
  end;
$$;

comment on function public.customer_segment_matches(text, bigint, timestamptz) is
  'Prédicat de segmentation client, partagé par org_segment_counts (qui compte des newsletter_subscribers) et org_customer_profiles_page (qui liste des e-mails de participations). Les deux populations diffèrent — un abonné qui n''a jamais joué n''est pas dans la liste, un joueur non abonné n''est pas dans le compteur — mais la DÉFINITION de « fidèle » (3 gains), « nouveau » (exactement 1) et « à relancer » (dernier gain > 60 jours) est désormais écrite à un seul endroit. Accepte les deux vocabulaires : fidele/nouveau/a_relancer (écran Clients) et loyal/new/inactive (historique). Segment inconnu ⇒ false. N''est PAS utilisée par org_segment_emails, dont les seuils sont paramétrables.';

-- Fonction interne : elle n'est appelée que depuis le corps de fonctions
-- `security definer`, lesquelles s'exécutent sous leur propriétaire et n'ont
-- donc besoin d'aucun `grant` pour l'atteindre. `authenticated` est retiré au
-- même titre qu'`anon` — même patron que `purge_expired_personal_data`.
revoke all on function public.customer_segment_matches(text, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.customer_segment_matches(text, bigint, timestamptz)
  to service_role;

-- ════════════════════════════════════════════════════════════
-- 1. `org_segment_counts` RALLIÉE AU PRÉDICAT COMMUN
--
-- La signature ne bouge pas : `create or replace` suffit, l'OID et l'ACL sont
-- préservés. Le comportement est identique au vocable près — `wins >= 3`,
-- `wins = 1` et `last_win < now() - 60 jours` sont maintenant lus dans la
-- fonction commune au lieu d'être écrits ici.
--
-- La garde reste `is_org_owner` : c'est ce que porte la version vivante (celle
-- de 00017, qui a durci le `is_org_member` de 00013), et l'écran Newsletter
-- comme l'écran Clients sont réservés au propriétaire.
-- ════════════════════════════════════════════════════════════
create or replace function public.org_segment_counts(p_organization_id uuid)
returns table (
  all_count bigint,
  loyal_count bigint,
  new_count bigint,
  inactive_count bigint
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
  with base as (
    select
      s.id,
      coalesce(agg.wins, 0) as wins,
      agg.last_win
      from public.newsletter_subscribers s
      left join lateral (
        select count(*) as wins, max(p.created_at) as last_win
          from public.participations p
         where p.organization_id = s.organization_id
           and p.email = s.email
      ) agg on true
     where s.organization_id = p_organization_id
       and s.unsubscribed_at is null
  )
  select
    count(*),
    count(*) filter (
      where public.customer_segment_matches('loyal', b.wins, b.last_win)),
    count(*) filter (
      where public.customer_segment_matches('new', b.wins, b.last_win)),
    count(*) filter (
      where public.customer_segment_matches('inactive', b.wins, b.last_win))
    from base b;
end;
$$;

comment on function public.org_segment_counts(uuid) is
  'Taille des segments d''abonnés newsletter d''une organisation (total, fidèles, nouveaux, à relancer). Le prédicat des trois segments vit dans customer_segment_matches, partagé avec org_customer_profiles_page : le compteur et la liste appliquent la même définition. Population comptée : newsletter_subscribers non désabonnés — pas les joueurs, qui sont la population d''org_customer_profiles_page. Gardée par is_org_owner.';

revoke all on function public.org_segment_counts(uuid) from public, anon;
grant execute on function public.org_segment_counts(uuid)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 2. `org_qr_hub` — DEUX FILTRES DE PLUS
-- ════════════════════════════════════════════════════════════
drop function if exists public.org_qr_hub(uuid, text, text, integer, integer);

create or replace function public.org_qr_hub(
  p_organization_id uuid,
  p_kind text default null,
  p_q text default null,
  p_etat text default null,
  p_jamais_scanne boolean default false,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  kind text,
  item_id uuid,
  name text,
  status text,
  etat text,
  url_path text,
  open_count bigint,
  qr_id uuid,
  qr_slug text,
  qr_label text,
  qr_style jsonb,
  scan_count bigint,
  extra_count integer,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
-- Les QUINZE colonnes de sortie deviennent des variables plpgsql en scope dans
-- tout le corps, et huit d'entre elles — `kind`, `name`, `status`,
-- `created_at`, `open_count`, `scan_count`, `item_id`, `url_path` — sont
-- homonymes de colonnes réelles des tables lues. C'est exactement le piège qui
-- a cassé la création de ligue EN PRODUCTION (42702 levé à l'exécution, DDL
-- appliqué sans broncher — voir 20260724130000). Toutes les références sont
-- qualifiées ci-dessous, et cette directive est la ceinture par-dessus.
#variable_conflict use_column
declare
  v_limit         integer;
  v_offset        integer;
  v_q             text;
  v_jamais_scanne boolean;
begin
  -- Premier geste, avant toute lecture : `security definer` fait tomber la RLS
  -- de onze tables, donc rien ne doit être lu avant qu'on sache qui appelle.
  -- La garde est `is_org_editor` et NON `is_org_member` : `campaigns`,
  -- `contests` et `qr_codes` n'ont aucune policy de lecture membre, un caissier
  -- qui obtiendrait une ligne ici lirait ce que la RLS lui refuse par ailleurs.
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  -- Bornes défensives : la RPC est appelable directement via PostgREST, donc
  -- `p_limit` n'est pas ce que l'écran envoie mais ce qu'un client choisit.
  -- Sans plafond, un `p_limit` démesuré ferait matérialiser l'union entière.
  v_limit  := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  -- `coalesce` et pas seulement le défaut : PostgREST transmet un `null`
  -- explicite quand le client envoie `p_jamais_scanne: null`, et le défaut de
  -- la signature ne s'applique alors PAS. Sans ce garde-fou, `not null` vaut
  -- NULL et le filtre laisserait passer zéro ligne au lieu de toutes.
  v_jamais_scanne := coalesce(p_jamais_scanne, false);

  -- Recherche : on échappe AVANT d'encadrer de `%`. `sanitizeSearchTerm`
  -- (src/lib/utils.ts) retire déjà `%`, `(`, `)` et `\` côté client, mais il ne
  -- retire PAS `_` et surtout il n'est pas sur le chemin d'un appel PostgREST
  -- direct. L'échappement doit donc vivre ici aussi. Ordre impératif : le
  -- backslash d'abord, sinon on échapperait les échappements qu'on vient de
  -- poser. Le jumeau de ce bloc est dans `org_customer_profiles_page` ; les
  -- deux doivent bouger ensemble.
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
  with base as (
    -- ── roue : UNE LIGNE PAR QR, pas par campagne ─────────────
    -- La jointure porte sur (id, organization_id) et non sur le seul id :
    -- `qr_campaign_org_fk` est composite, et rester sur le couple interdit
    -- structurellement qu'un QR aille chercher le nom d'une campagne d'une
    -- AUTRE organisation. LEFT JOIN par prudence seulement — `campaign_id` est
    -- NOT NULL et sa FK cascade à la suppression, donc `name` ne peut pas être
    -- nul en pratique.
    --
    -- SEULE table des huit à connaître `paused` : c'est elle qui justifie que
    -- `en_pause` figure dans le vocabulaire normalisé.
    select
      'campaign'::text     as kind,
      c.id                 as item_id,
      c.name               as name,
      c.status             as status,
      case c.status
        when 'draft'    then 'brouillon'
        when 'active'   then 'actif'
        when 'paused'   then 'en_pause'
        when 'archived' then 'termine'
      end::text            as etat,
      '/play/' || q.slug   as url_path,
      null::bigint         as open_count,
      q.id                 as qr_id,
      q.slug               as qr_slug,
      q.label              as qr_label,
      q.style              as qr_style,
      q.scan_count::bigint as scan_count,
      null::integer        as extra_count,
      q.created_at         as created_at
      from public.qr_codes q
      left join public.campaigns c
        on c.id = q.campaign_id
       and c.organization_id = q.organization_id
     where q.organization_id = p_organization_id

    union all

    -- ── créateur de quiz ──────────────────────────────────────
    -- `public_slug` est NOT NULL ; le `coalesce` est une ceinture, et il reste
    -- servable puisque `/quiz/[slug]` résout aussi un UUID.
    select
      'quiz'::text                as kind,
      qz.id                       as item_id,
      qz.name                     as name,
      qz.status                   as status,
      case qz.status
        when 'draft'    then 'brouillon'
        when 'active'   then 'actif'
        when 'archived' then 'termine'
      end::text                   as etat,
      case when qz.status = 'active'
           then '/quiz/' || coalesce(qz.public_slug, qz.id::text)
      end                         as url_path,
      mo.open_count::bigint       as open_count,
      null::uuid                  as qr_id,
      null::text                  as qr_slug,
      null::text                  as qr_label,
      null::jsonb                 as qr_style,
      null::bigint                as scan_count,
      null::integer               as extra_count,
      qz.created_at               as created_at
      from public.quizzes qz
      left join public.module_page_opens mo
        on mo.module = 'quiz'
       and mo.resource_id = qz.id
       and mo.organization_id = qz.organization_id
     where qz.organization_id = p_organization_id

    union all

    -- ── calendrier de l'Avent ─────────────────────────────────
    select
      'calendar'::text            as kind,
      cal.id                      as item_id,
      cal.name                    as name,
      cal.status                  as status,
      case cal.status
        when 'draft'    then 'brouillon'
        when 'active'   then 'actif'
        when 'archived' then 'termine'
      end::text                   as etat,
      case when cal.status = 'active'
           then '/calendar/' || cal.public_slug
      end                         as url_path,
      mo.open_count::bigint       as open_count,
      null::uuid                  as qr_id,
      null::text                  as qr_slug,
      null::text                  as qr_label,
      null::jsonb                 as qr_style,
      null::bigint                as scan_count,
      null::integer               as extra_count,
      cal.created_at              as created_at
      from public.calendars cal
      left join public.module_page_opens mo
        on mo.module = 'calendar'
       and mo.resource_id = cal.id
       and mo.organization_id = cal.organization_id
     where cal.organization_id = p_organization_id

    union all

    -- ── pronostics ────────────────────────────────────────────
    -- Le `kind` rendu est `pronostics`, vocabulaire commerçant du catalogue de
    -- modules (src/lib/module-resources.ts) — et non `contest`, qui est le
    -- vocabulaire joueur/analytics. La TABLE, elle, s'appelle `contests`.
    -- Publié dès que le statut n'est plus `draft` : `finished` garde sa page.
    --
    -- SEULE table des huit à connaître `finished`, et elle n'a PAS d'`archived`.
    -- `finished` → `termine` : un concours dont les résultats sont tombés a la
    -- même place, dans une liste, qu'un calendrier archivé. Conséquence à
    -- assumer : un pronostic `termine` garde son `url_path` (classement,
    -- réclamation) alors que les sept autres modules perdent le leur en
    -- s'archivant. `etat` classe, `url_path` dit ce qui reste imprimable — ce
    -- sont deux questions distinctes.
    select
      'pronostics'::text          as kind,
      co.id                       as item_id,
      co.name                     as name,
      co.status                   as status,
      case co.status
        when 'draft'    then 'brouillon'
        when 'active'   then 'actif'
        when 'finished' then 'termine'
      end::text                   as etat,
      case when co.status <> 'draft'
           then '/pronos/' || co.slug
      end                         as url_path,
      mo.open_count::bigint       as open_count,
      null::uuid                  as qr_id,
      null::text                  as qr_slug,
      null::text                  as qr_label,
      null::jsonb                 as qr_style,
      null::bigint                as scan_count,
      null::integer               as extra_count,
      co.created_at               as created_at
      from public.contests co
      left join public.module_page_opens mo
        on mo.module = 'pronostics'
       and mo.resource_id = co.id
       and mo.organization_id = co.organization_id
     where co.organization_id = p_organization_id

    union all

    -- ── jackpot collectif ─────────────────────────────────────
    -- `public_slug` est NULLABLE ici (seul des trois) : le `coalesce` est
    -- nécessaire, pas décoratif. `/jackpot/[id]` accepte les deux formes.
    select
      'jackpot'::text             as kind,
      jc.id                       as item_id,
      jc.name                     as name,
      jc.status                   as status,
      case jc.status
        when 'draft'    then 'brouillon'
        when 'active'   then 'actif'
        when 'archived' then 'termine'
      end::text                   as etat,
      case when jc.status = 'active'
           then '/jackpot/' || coalesce(jc.public_slug, jc.id::text)
      end                         as url_path,
      mo.open_count::bigint       as open_count,
      null::uuid                  as qr_id,
      null::text                  as qr_slug,
      null::text                  as qr_label,
      null::jsonb                 as qr_style,
      null::bigint                as scan_count,
      null::integer               as extra_count,
      jc.created_at               as created_at
      from public.jackpot_campaigns jc
      left join public.module_page_opens mo
        on mo.module = 'jackpot'
       and mo.resource_id = jc.id
       and mo.organization_id = jc.organization_id
     where jc.organization_id = p_organization_id

    union all

    -- ── passeport de fidélité ─────────────────────────────────
    -- Le passeport n'a pas de slug : son URL porte l'identifiant.
    select
      'loyalty'::text             as kind,
      lp.id                       as item_id,
      lp.name                     as name,
      lp.status                   as status,
      case lp.status
        when 'draft'    then 'brouillon'
        when 'active'   then 'actif'
        when 'archived' then 'termine'
      end::text                   as etat,
      case when lp.status = 'active'
           then '/passeport/' || lp.id::text
      end                         as url_path,
      mo.open_count::bigint       as open_count,
      null::uuid                  as qr_id,
      null::text                  as qr_slug,
      null::text                  as qr_label,
      null::jsonb                 as qr_style,
      null::bigint                as scan_count,
      null::integer               as extra_count,
      lp.created_at               as created_at
      from public.loyalty_programs lp
      left join public.module_page_opens mo
        on mo.module = 'loyalty'
       and mo.resource_id = lp.id
       and mo.organization_id = lp.organization_id
     where lp.organization_id = p_organization_id

    union all

    -- ── mode événement live : une ligne par JEU ───────────────
    -- L'adresse publique est celle d'une SESSION (`/event/[join_code]`), et un
    -- jeu peut en avoir plusieurs. On rend la PREMIÈRE (la plus ancienne) comme
    -- adresse représentative, et `extra_count` dit combien il y en a en tout
    -- pour que le front ne laisse pas croire qu'il n'y en a qu'une.
    -- Le compteur d'ouvertures étant lui aussi au grain de la session, il se
    -- SOMME — voir l'en-tête.
    --
    -- `etat` se lit sur le JEU, jamais sur ses sessions. `event_sessions` porte
    -- un tout autre vocabulaire (`draft`/`lobby`/`live`/`ended`/`archived`) et
    -- le hub ne liste pas les sessions : les mélanger donnerait un état qui ne
    -- correspond à aucune ligne rendue.
    select
      'event'::text               as kind,
      eg.id                       as item_id,
      eg.name                     as name,
      eg.status                   as status,
      case eg.status
        when 'draft'    then 'brouillon'
        when 'active'   then 'actif'
        when 'archived' then 'termine'
      end::text                   as etat,
      case when prem.join_code is not null
           then '/event/' || prem.join_code
      end                         as url_path,
      ses.opens                   as open_count,
      null::uuid                  as qr_id,
      null::text                  as qr_slug,
      null::text                  as qr_label,
      null::jsonb                 as qr_style,
      null::bigint                as scan_count,
      ses.n                       as extra_count,
      eg.created_at               as created_at
      from public.event_games eg
      left join lateral (
        select es.join_code
          from public.event_sessions es
         where es.game_id = eg.id
           and es.organization_id = eg.organization_id
         order by es.created_at asc, es.id asc
         limit 1
      ) prem on true
      left join lateral (
        select
          count(*)::integer            as n,
          sum(mo.open_count)::bigint   as opens
          from public.event_sessions es
          left join public.module_page_opens mo
            on mo.module = 'events'
           and mo.resource_id = es.id
           and mo.organization_id = es.organization_id
         where es.game_id = eg.id
           and es.organization_id = eg.organization_id
      ) ses on true
     where eg.organization_id = p_organization_id

    union all

    -- ── chasse au trésor : une ligne par CHASSE, sans URL ─────
    -- `url_path` NULL est délibéré : il y a une affiche par étape, pas une par
    -- chasse. `extra_count` porte le nombre d'étapes ; le compteur se somme sur
    -- elles, au même grain.
    select
      'hunt'::text                as kind,
      h.id                        as item_id,
      h.name                      as name,
      h.status                    as status,
      case h.status
        when 'draft'    then 'brouillon'
        when 'active'   then 'actif'
        when 'archived' then 'termine'
      end::text                   as etat,
      null::text                  as url_path,
      st.opens                    as open_count,
      null::uuid                  as qr_id,
      null::text                  as qr_slug,
      null::text                  as qr_label,
      null::jsonb                 as qr_style,
      null::bigint                as scan_count,
      st.n                        as extra_count,
      h.created_at                as created_at
      from public.hunts h
      left join lateral (
        select
          count(*)::integer            as n,
          sum(mo.open_count)::bigint   as opens
          from public.hunt_steps hs
          left join public.module_page_opens mo
            on mo.module = 'hunts'
           and mo.resource_id = hs.id
           and mo.organization_id = hs.organization_id
         where hs.hunt_id = h.id
           and hs.organization_id = h.organization_id
      ) st on true
     where h.organization_id = p_organization_id
  ),
  filtered as (
    select b.*
      from base b
     where (p_kind is null or b.kind = p_kind)
       -- Un `p_etat` hors vocabulaire rend zéro ligne sans lever, comme
       -- `p_kind` : c'est un filtre de liste, pas une validation d'entrée.
       and (p_etat is null or b.etat = p_etat)
       -- « Jamais scanné » n'existe que pour la roue : `scan_count` est NULL
       -- chez les sept autres modules, donc `b.scan_count = 0` les écarterait
       -- de toute façon. Le `b.kind = 'campaign'` est écrit quand même, pour
       -- que l'intention se lise sans avoir à connaître la forme des NULL.
       and (not v_jamais_scanne
            or (b.kind = 'campaign' and b.scan_count = 0))
       and (
         v_q is null
         or b.name     ilike v_q escape '\'
         or b.qr_label ilike v_q escape '\'
         or b.qr_slug  ilike v_q escape '\'
       )
  )
  select
    f.kind,
    f.item_id,
    f.name,
    f.status,
    f.etat,
    f.url_path,
    f.open_count,
    f.qr_id,
    f.qr_slug,
    f.qr_label,
    f.qr_style,
    f.scan_count,
    f.extra_count,
    f.created_at,
    -- Total AVANT pagination, calculé sur l'ensemble filtré. Sur un ensemble
    -- vide la fenêtre ne rend AUCUNE ligne : l'appelant lit alors zéro ligne et
    -- doit en déduire un total de 0, il n'y a pas de ligne fantôme à 0.
    count(*) over ()::bigint as total_count
    from filtered f
   -- Tri global demandé, plus deux départages : sans eux, deux ressources
   -- créées dans la même transaction pourraient changer d'ordre entre deux
   -- pages et une ligne serait vue deux fois, ou jamais. (kind, item_id, qr_id)
   -- est unique — c'est ce qui rend la pagination sûre.
   order by f.created_at desc, f.kind asc, f.item_id asc, f.qr_id asc nulls first
   limit v_limit offset v_offset;
end;
$$;

comment on function public.org_qr_hub(uuid, text, text, text, boolean, integer, integer) is
  'Hub QR unifié du commerçant : unionne les affiches et adresses publiques des huit modules porteurs de QR (campaign — une ligne par qr_codes —, quiz, calendar, pronostics, jackpot, loyalty, event, hunt), avec filtre par type, par état normalisé, par « jamais scanné », recherche sur nom/libellé/slug, tri par date de création décroissante et pagination (total_count en fenêtre, avant limite). `etat` normalise les vocabulaires DIVERGENTS des huit tables vers brouillon|actif|en_pause|termine : `paused` n''existe que sur campaigns, `finished` que sur contests, et `termine` recouvre à la fois `archived` et `finished`. La colonne `status` rend le vocable BRUT, inchangée. `p_jamais_scanne` ne rend que les lignes campaign à scan_count = 0 — le prédicat exact de qr_never_scanned dans org_animation_center_counts, pour que la tuile et la liste ne divergent pas. url_path est NULL quand il n''y a rien à imprimer : module non publié, ou chasse au trésor (dont les affiches sont par étape — extra_count donne leur nombre, comme il donne le nombre de sessions d''un événement). open_count agrège module_page_opens au grain réel de resource_id (la SESSION pour events, l''ÉTAPE pour hunts). Gardée par is_org_editor, et non is_org_member : campaigns, contests et qr_codes n''ont pas de policy de lecture membre, un caissier n''y a donc pas accès aujourd''hui.';

-- ── ACL ──────────────────────────────────────────────────────
-- ADR-082 : une fonction fraîchement créée porte l'EXECUTE par défaut de
-- PUBLIC. Le `drop` ci-dessus a emporté l'ACL de l'ancienne signature, donc ce
-- couple n'est pas une redite : sans lui, `anon` (qui hérite de PUBLIC) lirait
-- le hub de n'importe quelle organisation sur simple appel PostgREST — la garde
-- interne étant tout ce qui l'en empêcherait, et elle ne s'appuie que sur
-- `auth.uid()`.
--
-- `service_role` reçoit l'EXECUTE par convention de dépôt (comme
-- `org_dashboard_summary` et `org_animation_center_counts`), mais la garde
-- interne le refuse quand même : `is_org_editor` lit `auth.uid()`, nul pour un
-- appel service. C'est volontaire — cette RPC sert un écran connecté, pas un job.
revoke all on function public.org_qr_hub(uuid, text, text, text, boolean, integer, integer)
  from public, anon;
grant execute on function public.org_qr_hub(uuid, text, text, text, boolean, integer, integer)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 3. `org_customer_profiles_page` — RECHERCHE, SEGMENT, TRI
-- ════════════════════════════════════════════════════════════
drop function if exists public.org_customer_profiles_page(uuid, integer, integer);

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
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
-- `email`, `first_name` et `wins` sont à la fois colonnes de sortie et colonnes
-- réelles de `participations` : même précaution que dans `org_qr_hub`, et pour
-- la même raison — un 42702 ne se lève qu'à l'EXÉCUTION, le DDL passe.
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
  if v_offset < 0 or v_limit < 1 or v_limit > 100 then
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
  with profiles as (
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
  filtered as (
    select pr.*
      from profiles pr
     -- La recherche porte sur le profil AGRÉGÉ, donc sur ce que la page
     -- affiche : chercher un prénom vu à l'écran doit le retrouver. Le
     -- téléphone est le seul critère cherché sans être rendu.
     where (
         v_q is null
         or pr.email      ilike v_q escape '\'
         or pr.first_name ilike v_q escape '\'
         or pr.phone      ilike v_q escape '\'
       )
       -- MÊME prédicat que `org_segment_counts`, littéralement la même
       -- fonction. Les segments ne sont pas exclusifs : un client peut être
       -- « fidèle » ET « à relancer », comme il l'est déjà dans les compteurs.
       and public.customer_segment_matches(p_segment, pr.wins, pr.last_win)
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
    count(*) over ()::bigint as total_count
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
  'Page de la liste clients d''une organisation : un profil agrégé par e-mail distinct de participations (prénom le plus récent, nombre de gains, nombre récupérés, premier et dernier gain), avec total_count en fenêtre avant pagination. p_q cherche, ilike échappé, sur l''e-mail, le prénom et le TÉLÉPHONE — ce dernier est cherché mais volontairement pas rendu. p_segment (fidele|nouveau|a_relancer, alias loyal|new|inactive) applique customer_segment_matches, la MÊME fonction qu''org_segment_counts : les deux appliquent la même définition à deux populations différentes (joueurs ici, abonnés newsletter là-bas). p_tri : dernier_gain (défaut) | gains | recuperes | premier_gain, tous décroissants, liste blanche, valeur inconnue ⇒ défaut ; départage par e-mail pour que la pagination soit stable. Gardée par is_org_owner — ni membre ni éditeur, la liste est nominative.';

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
