-- ════════════════════════════════════════════════════════════
-- DE LA FICHE À LA DÉCISION — FACETTES ET PORTE UNIQUE (VIT-10)
--
-- Une carte présentait. Elle ne proposait rien : le client lisait soixante
-- plats et refermait la page. Ce lot ajoute deux choses, et deux seulement.
--
--
-- ── 1. LES FACETTES — UN VOCABULAIRE FERMÉ DE PLUS ─────────
--
-- Motif exact de `badges` et `allergenes` (20261011120000) : un `text[]`, un
-- `check` par `is_valid_vitrine_vocabulaire`, et la liste ÉCRITE DANS LA
-- CONTRAINTE — c'est dans `pg_get_constraintdef` que `vitrine.test.sql` la
-- compte, et une liste enfermée dans une fonction ne se compte pas.
--
-- ONZE VALEURS, QUATRE DIMENSIONS, et le préfixe porte la dimension :
--
--     occasion_repas  occasion_apero  occasion_cafe  occasion_fete
--     temps_rapide    temps_pose
--     envie_sale      envie_sucre     envie_boisson
--     table_seul      table_groupe
--
-- POURQUOI UNE SEULE COLONNE ET NON QUATRE. Quatre tableaux auraient donné
-- quatre `check`, quatre `grant`, quatre clés dans chaque lecture — et
-- surtout quatre endroits où oublier d'ajouter une dimension. Le préfixe
-- suffit à les séparer, et l'application seule décide quelles valeurs forment
-- une question : la base n'a pas à savoir ce qu'est une « occasion ».
--
-- CE QUE LA BASE NE FAIT PAS : elle n'exige aucune facette, n'en déduit
-- aucune, et n'a pas d'avis sur les combinaisons. Une fiche « apéro + repas »
-- est parfaitement valide — c'est le commerçant qui sait.
--
--
-- ── 2. UNE PORTE PAR FICHE, ET AU PLUS UNE ────────────────
--
-- `action` est une colonne SCALAIRE, pas un tableau, et c'est tout le sujet :
-- la contrainte du cahier — « au plus une action configurée » — devient une
-- propriété du type plutôt qu'une règle à faire respecter par un écran. Une
-- fiche ne peut pas proposer six boutons, il n'y a pas de place pour six.
--
-- ELLE DÉSIGNE UN MODULE, JAMAIS UN OBJET. `reserver` et non « l'activité
-- n° 42 » ; `quiz` et non « le quiz du mardi ». Trois conséquences, toutes
-- voulues :
--
--   * aucune clé étrangère vers quatre tables différentes, donc aucune
--     jointure à tenir et aucune suppression à propager ;
--   * la porte se ferme TOUTE SEULE quand le module n'a plus rien d'ouvert —
--     `vitrine_public_state` publie déjà `portes`, qui dit ce qui est
--     réellement joignable, et l'écran croise les deux. « Désactiver
--     proprement une action quand sa cible n'est plus publiée » ne demande
--     donc aucun code : c'est une intersection ;
--   * le commerçant choisit dans une liste de six, pas dans un catalogue.
--
--
-- ── CE QUE CE LOT N'AJOUTE PAS ────────────────────────────
--
-- Aucune table de parcours, aucune trace de réponse, aucun profil. La
-- Boussole pose ses questions, filtre, et oublie : les réponses vivent dans
-- l'état d'un composant et meurent avec l'onglet. Rien n'est écrit côté
-- serveur, donc rien n'est à conserver, à exporter ou à effacer.
--
-- Et rien ici ne touche à la file, au rang, à la capacité ni au droit à une
-- réservation : `action` ne fait qu'ouvrir une page qui existait déjà.
-- ════════════════════════════════════════════════════════════

-- ── 1. LES FACETTES ─────────────────────────────────────────

alter table public.vitrine_items
  add column if not exists facettes text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'vitrine_items_facettes_vocabulaire'
  ) then
    alter table public.vitrine_items
      add constraint vitrine_items_facettes_vocabulaire
      check (public.is_valid_vitrine_vocabulaire(
        facettes,
        array['occasion_repas', 'occasion_apero', 'occasion_cafe',
              'occasion_fete', 'temps_rapide', 'temps_pose',
              'envie_sale', 'envie_sucre', 'envie_boisson',
              'table_seul', 'table_groupe']::text[]
      ));
  end if;
end
$$;

-- ── 2. LA PORTE ─────────────────────────────────────────────
--
-- LISTE FERMÉE DE SIX, `null` compris comme « aucune ». Un septième module ne
-- peut pas apparaître sans que ce `check` l'apprenne — et sans que quelqu'un
-- se demande si l'écran sait le peindre.

alter table public.vitrine_items
  add column if not exists action text;

alter table public.vitrine_categories
  add column if not exists action text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'vitrine_items_action_ferme'
  ) then
    alter table public.vitrine_items
      add constraint vitrine_items_action_ferme
      check (action is null
             or action in ('boussole', 'reserver', 'offre', 'quiz', 'duo', 'bande'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'vitrine_categories_action_ferme'
  ) then
    alter table public.vitrine_categories
      add constraint vitrine_categories_action_ferme
      check (action is null
             or action in ('boussole', 'reserver', 'offre', 'quiz', 'duo', 'bande'));
  end if;
end
$$;

comment on column public.vitrine_items.facettes is
  'Vocabulaire FERMÉ de la Boussole (VIT-10), préfixé par dimension : '
  'occasion_*, temps_*, envie_*, table_*. Une fiche SANS aucune facette n''est '
  'jamais proposée par la Boussole — étiqueter est le geste qui la fait '
  'exister. Une fiche sans valeur dans UNE dimension y est neutre : le '
  'commerçant n''étiquette que ce qui distingue.';

comment on column public.vitrine_items.action is
  'AU PLUS UNE porte par fiche (VIT-10) : boussole, reserver, offre, quiz, duo '
  'ou bande. Désigne un MODULE, jamais un objet — la porte se ferme d''elle-même '
  'quand `portes` ne publie plus rien pour ce module. Aucun effet sur la file, '
  'le rang, la capacité ou le droit à une réservation.';

comment on column public.vitrine_categories.action is
  'Même contrat que vitrine_items.action, au rang de la rubrique.';

-- ── 3. LES DROITS D'ÉCRITURE ────────────────────────────────

grant update (facettes, action) on public.vitrine_items to authenticated;
grant update (action) on public.vitrine_categories to authenticated;

-- ── 4. LA LECTURE DU CATALOGUE APPREND LES TROIS COLONNES ───
--
-- `vitrine_cartes_json` sert les DEUX écrans, public et tableau de bord : les
-- facettes et les portes n'y entrent qu'une fois. Le corps est RECOPIÉ À
-- L'IDENTIQUE de sa dernière définition — 20261023120000, qui lui avait ajouté
-- `photo_alt` — parce que Postgres remplace une fonction entière, jamais une
-- ligne. Le diff contre cette source est le seul contrôle qui vaille.
--
-- `to_jsonb` sur `facettes` comme sur `badges` et `allergenes` : un `text[]`
-- ne traverse pas `jsonb_build_object` sans conversion explicite, et la
-- laisser implicite rendrait une chaîne PostgreSQL (`{a,b}`) au lieu d'un
-- tableau JSON.

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
              'action', k.action,
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
                    'facettes', pg_catalog.to_jsonb(i.facettes),
                    'action', i.action,
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
