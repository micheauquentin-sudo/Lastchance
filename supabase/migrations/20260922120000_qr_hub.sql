-- ============================================================
-- HUB QR PAR TYPE DE JEU — `org_qr_hub`
--
-- La page `/dashboard/qr-codes` ne listait que `qr_codes`, c'est-à-dire les
-- affiches de la ROUE. Les huit autres modules ont pourtant tous une adresse
-- publique à imprimer — un slug de quiz, un code de jonction d'événement, un
-- jeton d'étape de chasse — et aucune ne s'y voyait. Le commerçant qui cherche
-- « où est le QR de mon calendrier » n'avait pas d'écran pour le lui dire.
--
-- ── POURQUOI UNE RPC, ET NON HUIT REQUÊTES POSTGREST ──
--
-- Même raison que `org_animation_center_counts` (20260914120000), dont cette
-- fonction est le voisin : le filtre par type, la recherche et la pagination
-- doivent porter sur l'ENSEMBLE unionné. Fait côté client, il faudrait
-- rapatrier les huit listes entières pour trier huit tableaux en mémoire, puis
-- paginer à la main un ensemble dont on ne connaît le total qu'après les huit
-- allers-retours. Le prédicat reste donc en base, à un seul endroit.
--
-- La forme de l'union — un `union all` de sources hétérogènes ramenées à un
-- tuple commun — reprend la CTE `names` d'`org_experience_analytics`
-- (20260805160000, l.1085-1116), y compris ses deux cas tordus : l'événement
-- qui passe par ses sessions, et le module dont le nom vit sur une autre table.
--
-- ── LA GARDE EST `is_org_editor`, ET CE N'EST PAS UN DURCISSEMENT GRATUIT ──
--
-- Le point mérite d'être écrit, parce que la lecture naïve — « c'est un écran
-- de consultation, donc `is_org_member` » — ouvrirait une fuite.
--
-- Cette fonction est `security definer` : elle traverse la RLS des onze tables
-- qu'elle lit. La garde interne est donc le SEUL contrôle d'accès. Or la RLS de
-- ces tables n'est pas uniforme, et l'écart tombe exactement sur les colonnes
-- que ce hub expose :
--
--   * `campaigns`, `contests` et `qr_codes` ne portent qu'UNE policy, en
--     `for all using (is_org_editor(...))`. Il n'existe aucun `member select`.
--     Un caissier ne lit donc AUJOURD'HUI aucune de ces trois tables — et la
--     page `/dashboard/qr-codes`, qui les interroge avec le client RLS de
--     l'utilisateur, lui rend déjà zéro ligne.
--   * Les huit autres (`quizzes`, `calendars`, `jackpot_campaigns`,
--     `loyalty_programs`, `event_games`, `event_sessions`, `hunts`,
--     `hunt_steps`, `module_page_opens`) portent bien un `member select`.
--
-- Garder cette RPC en `is_org_member` donnerait donc au caissier les noms, les
-- statuts, les slugs de campagne et les slugs de QR que la RLS lui refuse
-- explicitement : une ESCALADE, pas une simplification. `is_org_editor` aligne
-- la fonction sur la plus stricte des tables qu'elle unionne, et sur le régime
-- de son voisin d'écran `org_animation_center_counts`.
--
-- ── LE GRAIN DE `module_page_opens.resource_id` N'EST PAS LE MODULE ──
--
-- Piège coûteux, et invisible à la relecture : `resource_id` est polymorphe et
-- ne pointe PAS toujours sur la ressource que ce hub liste (20260911120000,
-- puis 20260912120000 pour la chasse).
--
--   * quiz, calendar, pronostics, jackpot, loyalty → l'identifiant du module.
--     Jointure directe.
--   * `events`  → `event_sessions.id`, la SESSION. Un jeu d'événement a N
--     sessions, donc N lignes de compteur.
--   * `hunts`   → `hunt_steps.id`, l'ÉTAPE. `/hunt/[token]` porte le jeton de
--     l'étape et il y a une affiche par étape.
--
-- Joindre naïvement sur l'identifiant du jeu ou de la chasse ne lèverait
-- aucune erreur : la jointure ne ramènerait simplement JAMAIS de ligne, et les
-- deux modules afficheraient un compteur vide à vie. On SOMME donc, sur les
-- sessions pour l'événement et sur les étapes pour la chasse.
--
-- Noter aussi que le vocabulaire de `module_page_opens.module` est celui des
-- droits (`events`, `hunts`, `pronostics` — pluriels), pas celui des `kind`
-- rendus ici. La traduction se fait dans les jointures, pas dans l'appelant.
--
-- ── UNE LIGNE PAR QR POUR LA ROUE, UNE LIGNE PAR RESSOURCE AILLEURS ──
--
-- La roue est le seul module dont l'affiche est un objet de première classe :
-- `qr_codes` porte un libellé, un style et son propre compteur de scans, et un
-- commerçant en crée plusieurs par campagne (une par vitrine). Le hub rend donc
-- une ligne par QR, `name` portant le nom de la CAMPAGNE.
--
-- Les huit autres modules n'ont pas de table d'affiches : leur QR est dérivé de
-- l'URL publique. Une ligne par ressource, `qr_*` et `scan_count` à NULL.
--
-- ── `url_path` À NULL VEUT DIRE « RIEN À IMPRIMER AUJOURD'HUI » ──
--
-- Un module non publié n'a pas d'adresse publique servable : rendre son URL
-- laisserait le commerçant imprimer une affiche qui mène à une 404. NULL est
-- donc porteur de sens, et c'est au front de l'afficher comme tel.
-- Deux cas particuliers :
--   * pronostics : publié dès que `status <> 'draft'` — un concours `finished`
--     garde sa page (classement, réclamation), contrairement aux autres
--     modules dont l'archivage ferme l'accès.
--   * hunt : url_path est TOUJOURS NULL. Ce n'est pas un oubli — une chasse n'a
--     pas d'adresse unique, elle a une affiche PAR ÉTAPE. `extra_count` porte le
--     nombre d'étapes pour que le front y renvoie.
--
-- ── `extra_count` : LES SOUS-RESSOURCES PORTEUSES DE QR ──
--
-- Rempli pour les deux seuls modules dont l'affiche n'est pas au grain de la
-- ressource listée : la chasse (nombre d'étapes) et l'événement (nombre de
-- sessions, chacune ayant son code de jonction). NULL pour les six autres, qui
-- n'ont qu'une adresse. C'est la même asymétrie que celle du compteur
-- d'ouvertures ci-dessus, et pour la même raison.
-- ============================================================

create or replace function public.org_qr_hub(
  p_organization_id uuid,
  p_kind text default null,
  p_q text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  kind text,
  item_id uuid,
  name text,
  status text,
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
-- Les QUATORZE colonnes de sortie deviennent des variables plpgsql en scope
-- dans tout le corps, et huit d'entre elles — `kind`, `name`, `status`,
-- `created_at`, `open_count`, `scan_count`, `item_id`, `url_path` — sont
-- homonymes de colonnes réelles des tables lues. C'est exactement le piège qui
-- a cassé la création de ligue EN PRODUCTION (42702 levé à l'exécution, DDL
-- appliqué sans broncher — voir 20260724130000). Toutes les références sont
-- qualifiées ci-dessous, et cette directive est la ceinture par-dessus.
#variable_conflict use_column
declare
  v_limit  integer;
  v_offset integer;
  v_q      text;
begin
  -- Premier geste, avant toute lecture : `security definer` fait tomber la RLS
  -- de onze tables, donc rien ne doit être lu avant qu'on sache qui appelle.
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  -- Bornes défensives : la RPC est appelable directement via PostgREST, donc
  -- `p_limit` n'est pas ce que l'écran envoie mais ce qu'un client choisit.
  -- Sans plafond, un `p_limit` démesuré ferait matérialiser l'union entière.
  v_limit  := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  -- Recherche : on échappe AVANT d'encadrer de `%`. `sanitizeSearchTerm`
  -- (src/lib/utils.ts) retire déjà `%`, `(`, `)` et `\` côté client, mais il ne
  -- retire PAS `_` et surtout il n'est pas sur le chemin d'un appel PostgREST
  -- direct. L'échappement doit donc vivre ici aussi. Ordre impératif : le
  -- backslash d'abord, sinon on échapperait les échappements qu'on vient de
  -- poser.
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
    select
      'campaign'::text     as kind,
      c.id                 as item_id,
      c.name               as name,
      c.status             as status,
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
    select
      'pronostics'::text          as kind,
      co.id                       as item_id,
      co.name                     as name,
      co.status                   as status,
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
    select
      'event'::text               as kind,
      eg.id                       as item_id,
      eg.name                     as name,
      eg.status                   as status,
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

comment on function public.org_qr_hub(uuid, text, text, integer, integer) is
  'Hub QR unifié du commerçant : unionne les affiches et adresses publiques des huit modules porteurs de QR (campaign — une ligne par qr_codes —, quiz, calendar, pronostics, jackpot, loyalty, event, hunt), avec filtre par type, recherche sur nom/libellé/slug, tri par date de création décroissante et pagination (total_count en fenêtre, avant limite). url_path est NULL quand il n''y a rien à imprimer : module non publié, ou chasse au trésor (dont les affiches sont par étape — extra_count donne leur nombre, comme il donne le nombre de sessions d''un événement). open_count agrège module_page_opens au grain réel de resource_id (la SESSION pour events, l''ÉTAPE pour hunts). Gardée par is_org_editor, et non is_org_member : campaigns, contests et qr_codes n''ont pas de policy de lecture membre, un caissier n''y a donc pas accès aujourd''hui.';

-- ── ACL ──────────────────────────────────────────────────────
-- ADR-082 : une fonction fraîchement créée porte l'EXECUTE par défaut de
-- PUBLIC. Sans ce couple revoke/grant, `anon` (qui hérite de PUBLIC) lirait le
-- hub de n'importe quelle organisation sur simple appel PostgREST — la garde
-- interne étant tout ce qui l'en empêcherait, et elle ne s'appuie que sur
-- `auth.uid()`.
--
-- `service_role` reçoit l'EXECUTE par convention de dépôt (comme
-- `org_dashboard_summary` et `org_animation_center_counts`), mais la garde
-- interne le refuse quand même : `is_org_editor` lit `auth.uid()`, nul pour un
-- appel service. C'est volontaire — cette RPC sert un écran connecté, pas un job.
revoke all on function public.org_qr_hub(uuid, text, text, integer, integer)
  from public, anon;
grant execute on function public.org_qr_hub(uuid, text, text, integer, integer)
  to authenticated, service_role;
