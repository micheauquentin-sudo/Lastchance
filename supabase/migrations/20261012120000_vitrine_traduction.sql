-- ============================================================
-- VITRINE — LA COUCHE SQL DE LA TRADUCTION (VIT-1b, lot L11)
--
-- Le lot L10 (20261011120000) a écrit noir sur blanc ce qu'il ne faisait pas :
-- « Aucune colonne `_en`, aucune table de traductions ici. […] Poser `nom_en`
-- aujourd'hui aurait figé le mauvais modèle : il ne sait pas exprimer "cette
-- traduction est périmée depuis que la description a changé", qui est exactement
-- ce que L11 doit rendre vrai. » Ce fichier rend cette phrase vraie.
--
-- ── AUCUN FOURNISSEUR N'EST BRANCHÉ, ET C'EST LA DÉCISION (ADR-109) ──
--
-- Zéro IA payante, zéro clé, DeepL écarté : le propriétaire a tranché que L11
-- livre une INFRASTRUCTURE — une table, une clé de version, deux RPC — et pas un
-- pipeline. Rien ici n'appelle quoi que ce soit à l'extérieur, rien ici ne
-- traduit. `upsert_vitrine_translation` est le point d'entrée que remplira plus
-- tard un pipeline, une saisie humaine dans le back-office, ou les deux. La
-- conséquence est assumée : tant que personne n'écrit dans `vitrine_translations`,
-- la couverture vaut zéro et la Vitrine ouvre EN FRANÇAIS SEUL — ce qui est un
-- état normal du système, pas une panne.
--
-- ── LA TRADUCTION EST UN ACTIF STOCKÉ, PAS UN CALCUL PAR VISITEUR ──
--
-- Rien n'est traduit à la volée. Une traduction est une LIGNE, écrite une fois,
-- servie ensuite gratuitement à tous les visiteurs. C'est la seule forme qui
-- tienne pour un point d'entrée public non authentifié : un calcul par
-- consultation aurait mis une facture externe au bout de chaque scan de QR, et
-- une latence réseau au bout de chaque ouverture de carte.
--
-- ── LE FRANÇAIS EST LA RÉFÉRENCE, ET IL NE SE STOCKE PAS ICI ──
--
-- `vitrine_translations` ne contient JAMAIS de français. Le texte français vit
-- dans sa colonne d'origine (`vitrine_items.nom`, `vitrine_settings.accroche`…),
-- il est la vérité, et la traduction n'est qu'un CALQUE posé dessus. Écrire le
-- français dans la table de traduction aurait créé deux exemplaires du même fait
-- — et le jour où ils divergent, personne ne sait lequel est la carte.
--
-- ── CE QUI NE PASSE JAMAIS PAR CETTE TABLE ──
--
--   * Les PRIX (`prix_affiche`). Le lot L10 l'a écrit en toutes lettres : « ce
--     champ ne se traduit PAS ». « à partir de 8 € » traduit deviendrait une
--     promesse commerciale rédigée par une machine.
--   * La DISPONIBILITÉ, l'ORDRE, les CHEMINS D'IMAGE : des données communes aux
--     deux langues, pas du texte.
--   * Les BADGES et les ALLERGÈNES. Ce sont les VOCABULAIRES FERMÉS de la
--     plateforme (8 et 14 valeurs), et ils sont traduits UNE FOIS POUR TOUTES
--     côté application, à la main, par des humains. Les faire passer par cette
--     table aurait mis les quatorze allergènes de l'annexe II du règlement
--     UE 1169/2011 — le seul endroit de la carte où se tromper compte vraiment —
--     dans le même tuyau qu'une accroche marketing.
--
-- ── LES CINQ CHAMPS TRADUISIBLES, ET PAS UN DE PLUS ──
--
--   vitrine_settings  → accroche, histoire, horaires_texte
--   vitrine_menus     → nom
--   vitrine_categories→ nom
--   vitrine_items     → nom, description
--
-- L'enseigne (`organizations.name`) n'y est pas : c'est un nom propre.
--
-- ── LE TROU QUE L10 A LAISSÉ, ET QUE CE FICHIER REFERME ──
--
-- Les quatre tables de la Vitrine portent une colonne `updated_at` depuis L10.
-- PERSONNE NE L'ÉCRIVAIT. Elle valait la date de création, pour toujours, sur
-- toutes les lignes sauf celles que `set_vitrine_slug` touchait à la main. Une
-- colonne qui ment est pire qu'une colonne absente : on s'y fie.
--
-- Or c'est exactement la clé dont la traduction a besoin. Une traduction est
-- valable POUR UNE VERSION du texte source ; sans signal de version, il n'existe
-- aucun moyen de savoir qu'une description a changé depuis qu'on l'a traduite,
-- et l'anglais publierait indéfiniment l'ancien plat. La même clé sert
-- l'invalidation de l'ISR côté Next.js — une page publique qui ne sait pas
-- quand son contenu a bougé ne peut pas décider quand se régénérer.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. `touch_updated_at` — la PREMIÈRE de ce dépôt, et elle est générique
--
-- Quarante tables du schéma portent `updated_at` et pas une n'avait de trigger :
-- la colonne était tenue à la main, quand elle l'était. On n'en corrige pas
-- quarante ici — ce serait un chantier de fond déguisé en lot de traduction —
-- mais la fonction est écrite GÉNÉRIQUE pour que la prochaine table n'ait qu'à
-- poser son trigger. Elle ne lit rien, ne connaît aucune table, et ne suppose
-- que l'existence d'une colonne `updated_at`.
--
-- ── `clock_timestamp()` ET NON `now()`, ET CE N'EST PAS UN DÉTAIL ──
--
-- `now()` rend l'heure de DÉBUT DE TRANSACTION : elle est constante d'un bout à
-- l'autre. Deux écritures successives dans la même transaction produiraient donc
-- exactement le même `updated_at`, et une traduction capturée entre les deux
-- serait déclarée FRAÎCHE alors que le texte a bougé après elle. C'est le cas
-- que le pgTAP joue — un fichier de test est UNE transaction — mais ce n'est pas
-- un artefact de test : une RPC qui corrige deux fiches d'affilée est dans le
-- même cas. `clock_timestamp()` avance à chaque appel : la péremption est
-- exacte, y compris à l'intérieur d'une transaction.
--
-- ── PORTÉE : LA LIGNE, PAS LE CHAMP ──
--
-- Déplacer une rubrique d'une carte à l'autre bouge son `updated_at` et périme
-- donc la traduction de son `nom`, que personne n'a pourtant touché. C'est
-- assumé : une clé de version PAR CHAMP aurait demandé cinq colonnes de plus par
-- table et une écriture pour chacune. Le coût de l'imprécision est une
-- retraduction de trop ; le coût de l'inverse serait un anglais faux.
-- ────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

comment on function public.touch_updated_at() is
  'Trigger BEFORE UPDATE générique : pose `updated_at` à `clock_timestamp()`. '
  'Première fonction de ce genre du dépôt — les colonnes `updated_at` y étaient '
  'jusqu''ici tenues à la main, donc rarement. `clock_timestamp()` et non '
  '`now()` : `now()` est constante sur toute la transaction, deux écritures '
  'successives y rendraient le même instant et une traduction capturée entre les '
  'deux passerait pour fraîche. Ne lit aucune table, ne connaît aucun schéma : '
  'la prochaine table n''a qu''à poser son trigger. Rendue à personne — un '
  'trigger s''exécute sans contrôle d''EXECUTE sur sa fonction.';

revoke all on function public.touch_updated_at()
  from public, anon, authenticated, service_role;

-- Les quatre colonnes `updated_at` EXISTENT DÉJÀ (20261011120000, `not null
-- default now()` sur les quatre tables) : aucun `alter table` n'est nécessaire,
-- et c'est vérifié et non supposé. Ce qui manquait, c'est uniquement l'écriture.
create trigger vitrine_settings_touch_updated_at
  before update on public.vitrine_settings
  for each row execute function public.touch_updated_at();

create trigger vitrine_menus_touch_updated_at
  before update on public.vitrine_menus
  for each row execute function public.touch_updated_at();

create trigger vitrine_categories_touch_updated_at
  before update on public.vitrine_categories
  for each row execute function public.touch_updated_at();

create trigger vitrine_items_touch_updated_at
  before update on public.vitrine_items
  for each row execute function public.touch_updated_at();


-- ────────────────────────────────────────────────────────────
-- 2. `vitrine_translations` — le calque, et sa clé de version
--
-- ── POURQUOI UNE CIBLE POLYMORPHE ET NON QUATRE TABLES ──
--
-- Quatre tables `vitrine_settings_translations`, `vitrine_menus_translations`…
-- auraient donné quatre FK propres — et quatre fois la même RPC, quatre fois le
-- même calcul de couverture, quatre fois la même règle de péremption. Le prix
-- payé ici est explicite : `cible_id` NE PORTE AUCUNE FK, parce qu'aucune FK ne
-- peut désigner quatre tables. Ce que la base ne garantit plus, la seule porte
-- d'écriture le garantit — `upsert_vitrine_translation` vérifie, PAR TYPE, que
-- la cible existe ET appartient à l'organisation, et c'est le seul chemin :
-- personne d'autre que `service_role` n'a le moindre privilège sur cette table.
--
-- ── `version_source` EST LA COLONNE QUI PORTE TOUT LE MODÈLE ──
--
-- Elle vaut l'`updated_at` de la cible AU MOMENT OÙ LA TRADUCTION A ÉTÉ FAITE.
-- La règle de fraîcheur tient en un signe : la traduction est FRAÎCHE tant que
-- `version_source >= cible.updated_at`, PÉRIMÉE dès que la cible a bougé après
-- elle. Une périmée n'est jamais servie — le français ressort à sa place — et
-- elle n'est pas effacée pour autant : elle reste sous les yeux du commerçant
-- comme « à revoir », et elle redevient valide si le pipeline la rafraîchit.
--
-- ── AUCUNE POLICY, ET C'EST LA FORME LA PLUS FERMÉE ──
--
-- RLS active, zéro policy, zéro privilège pour `anon` et `authenticated`. Le
-- commerçant NE LIT PAS cette table en direct, pas plus que le visiteur : les
-- deux passent par une RPC qui choisit ce qui sort. C'est le motif du dépôt
-- depuis RES-1a, et il est ici plus strict encore que pour les quatre tables de
-- L10, qui accordaient au moins le SELECT à leurs éditeurs.
-- ────────────────────────────────────────────────────────────

create table public.vitrine_translations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- Les quatre niveaux de L10, en toutes lettres. Liste FERMÉE : un cinquième
  -- type ne peut pas apparaître sans que la RPC d'ownership apprenne à le
  -- vérifier, et un `check` est le seul endroit qui rende ce couplage visible.
  cible_type text not null
    check (cible_type in ('settings', 'menu', 'categorie', 'item')),
  -- SANS FK, voir l'en-tête de section. L'appartenance est tenue par la RPC.
  cible_id uuid not null,
  -- UNE SEULE LANGUE CIBLE AUJOURD'HUI, et la liste est extensible par
  -- migration. Le français n'y figure PAS et n'y figurera jamais : il est la
  -- référence, il vit dans les colonnes d'origine.
  --
  -- CE QUI DOIT CHANGER ENSEMBLE le jour où une seconde langue entre : ce
  -- `check`, `vitrine_public_state` (qui mesure la couverture d'une langue) et
  -- `vitrine_translation_state` (idem). `vitrine.test.sql` compte les valeurs de
  -- cette contrainte et rougit si on n'en change qu'une.
  lang text not null check (lang in ('en')),
  champ text not null
    check (champ in ('accroche', 'histoire', 'horaires_texte',
                     'nom', 'description')),
  -- 2000 : au-dessus du plus long champ traduisible (`histoire`, 1200 en
  -- français) avec la marge d'une traduction plus longue que l'original, et en
  -- dessous de ce qui ferait de cette table un canal de stockage.
  texte text not null
    check (pg_catalog.char_length(pg_catalog.btrim(texte)) between 1 and 2000),
  -- L'`updated_at` de la cible au moment de la traduction. `not null` : une
  -- traduction sans version source est une traduction dont personne ne peut dire
  -- si elle est encore vraie, c'est-à-dire pire qu'aucune traduction.
  version_source timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  -- UNE traduction par (cible, langue, champ). Sert aussi d'index de tête à
  -- `organization_id` — la FK vers `organizations` n'en aurait eu aucun — et
  -- c'est l'index que parcourent les deux RPC de lecture.
  constraint vitrine_translations_cible_unique
    unique (organization_id, cible_type, cible_id, lang, champ),
  -- LE COUPLAGE TYPE ↔ CHAMP, parce que la couverture en dépend. Sans lui, une
  -- ligne `('menu', 'description')` serait acceptée, comptée dans les traduits
  -- et absente des traduisibles : la couverture dépasserait 100 % et le
  -- sélecteur de langue s'afficherait sur la foi d'un chiffre faux.
  constraint vitrine_translations_champ_par_cible check (
    (cible_type = 'settings'
       and champ in ('accroche', 'histoire', 'horaires_texte'))
    or (cible_type in ('menu', 'categorie') and champ = 'nom')
    or (cible_type = 'item' and champ in ('nom', 'description'))
  )
);

comment on table public.vitrine_translations is
  'Calque de traduction d''une vitrine (VIT-1b) — jamais du français, qui reste '
  'la RÉFÉRENCE dans ses colonnes d''origine. Une ligne = un champ d''une cible '
  'dans une langue, valable POUR UNE VERSION du texte source : '
  '`version_source >= cible.updated_at` = fraîche, sinon PÉRIMÉE et le français '
  'ressort. Prix, disponibilité, badges et allergènes n''y passent JAMAIS — les '
  'deux premiers sont communs aux langues, les deux derniers sont le vocabulaire '
  'FERMÉ de la plateforme, traduit une fois pour toutes à la main. `cible_id` ne '
  'porte aucune FK (quatre tables cibles) : l''appartenance est vérifiée PAR '
  'TYPE dans upsert_vitrine_translation, seule porte d''écriture. RLS active et '
  'AUCUNE policy : service_role seul, lectures par RPC.';
comment on column public.vitrine_translations.version_source is
  'Valeur de `updated_at` de la cible à l''instant de la traduction. C''est la '
  'clé de péremption : la traduction cesse d''être servie dès que la cible bouge '
  'après elle (trigger touch_updated_at). Elle n''est pas effacée pour autant — '
  'l''écran commerçant la montre « à revoir », et un rafraîchissement la '
  'revalide.';
comment on column public.vitrine_translations.lang is
  'Langue CIBLE. Le français n''y figure jamais : il est la référence. Une '
  'seconde langue s''ajoute par migration, et doit changer EN MÊME TEMPS le '
  '`check` de cette colonne et la mesure de couverture des deux RPC.';

alter table public.vitrine_translations enable row level security;

-- Ceinture et bretelles : depuis 20260930120000 les privilèges par défaut de
-- `postgres` ne servent plus `authenticated` (00021 avait fait de même pour
-- `anon`), donc cette table naît déjà nue pour les deux. Le `revoke` explicite
-- reste écrit parce qu'une garde qui dépend d'une migration d'il y a deux
-- semaines est une garde qu'on ne relit pas.
revoke all on table public.vitrine_translations from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. `vitrine_champs_traduisibles` — la définition, écrite UNE FOIS
--
-- « Quels champs de cette vitrine sont traduisibles, et quelle est la version
-- courante de chacun ? » Trois appelants ont besoin de cette réponse : la
-- couverture rendue au visiteur, l'état rendu au commerçant, et — demain — le
-- pipeline qui décide quoi retraduire. Trois copies auraient divergé, et la
-- divergence la plus probable est la plus coûteuse : un champ compté dans le
-- total ici et pas là fait osciller un pourcentage que l'écran compare à un
-- seuil.
--
-- ── UN CHAMP VIDE N'EST PAS UN CHAMP TRADUISIBLE ──
--
-- `accroche` null, `description` null, `histoire` non renseignée : il n'y a rien
-- à traduire, et les compter aurait plafonné la couverture d'une vitrine sobre à
-- 60 % pour toujours — donc éteint son sélecteur de langue alors que TOUT son
-- texte est traduit.
--
-- ── LE MÊME FILTRE `active` QUE `vitrine_cartes_json` ──
--
-- La couverture publique doit mesurer CE QUE LE VISITEUR VOIT. Une carte
-- saisonnière désactivée en octobre ne doit pas faire chuter la couverture d'un
-- menu d'hiver intégralement traduit. L'écran commerçant, lui, appelle avec
-- `false` : il montre le travail restant sur tout le catalogue, y compris ce
-- qui n'est pas publié.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_champs_traduisibles(
  p_organization_id uuid,
  p_actives_seulement boolean
)
returns table (
  cible_type text,
  cible_id uuid,
  champ text,
  version_courante timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'settings'::text, s.id, v.nom_champ, s.updated_at
    from public.vitrine_settings s
    cross join lateral (values ('accroche', s.accroche),
                               ('histoire', s.histoire),
                               ('horaires_texte', s.horaires_texte))
      as v(nom_champ, valeur)
   where s.organization_id = p_organization_id
     and v.valeur is not null
     and pg_catalog.btrim(v.valeur) <> ''

  union all

  select 'menu'::text, m.id, 'nom'::text, m.updated_at
    from public.vitrine_menus m
   where m.organization_id = p_organization_id
     and (not p_actives_seulement or m.active)

  union all

  select 'categorie'::text, k.id, 'nom'::text, k.updated_at
    from public.vitrine_categories k
    join public.vitrine_menus m
      on m.id = k.menu_id and m.organization_id = k.organization_id
   where k.organization_id = p_organization_id
     and (not p_actives_seulement or m.active)

  union all

  select 'item'::text, i.id, v.nom_champ, i.updated_at
    from public.vitrine_items i
    join public.vitrine_categories k
      on k.id = i.categorie_id and k.organization_id = i.organization_id
    join public.vitrine_menus m
      on m.id = k.menu_id and m.organization_id = k.organization_id
    cross join lateral (values ('nom', i.nom),
                               ('description', i.description))
      as v(nom_champ, valeur)
   where i.organization_id = p_organization_id
     and (not p_actives_seulement or m.active)
     and v.valeur is not null
     and pg_catalog.btrim(v.valeur) <> '';
$$;

comment on function public.vitrine_champs_traduisibles(uuid, boolean) is
  'Les champs TRADUISIBLES d''une vitrine et la version courante de chacun '
  '(VIT-1b) : settings.accroche/histoire/horaires_texte, menus.nom, '
  'categories.nom, items.nom/description. Écrite UNE FOIS et appelée par les '
  'deux RPC de couverture — trois copies auraient fait osciller un pourcentage '
  'que l''écran compare à un seuil. Un champ NULL ou vide n''est PAS traduisible '
  ': le compter aurait plafonné pour toujours la couverture d''une vitrine '
  'sobre. `p_actives_seulement` reprend le filtre de vitrine_cartes_json — le '
  'public mesure ce qu''il voit, l''éditeur mesure tout. Ne contrôle NI le '
  'droit, NI la publication : c''est le travail de ses appelantes. Rendue à '
  'personne.';

revoke all on function public.vitrine_champs_traduisibles(uuid, boolean)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 4. `vitrine_cartes_json` — LA MÊME, avec un calque
--
-- ── POURQUOI `drop` PUIS `create`, ET NON `create or replace` ──
--
-- Leçon du lot L3, payée une fois (20261007120000 sur `reserve_slot`) : ajouter
-- un paramètre par `create or replace` ne remplace RIEN, il crée une SURCHARGE.
-- Les deux fonctions coexistent alors, et l'appel à deux arguments de
-- `vitrine_dashboard_state` devient AMBIGU entre l'ancienne (exacte) et la
-- nouvelle (par défaut) — « function is not unique », à l'exécution seulement.
--
-- L'ancienne signature est donc supprimée D'ABORD. Aucun `cascade` : rien ne
-- dépend de cette fonction en DDL, et une dépendance inattendue doit faire
-- échouer la migration, pas disparaître avec elle.
--
-- ── `vitrine_dashboard_state` N'EST PAS RÉÉCRITE, ET C'EST VOLONTAIRE ──
--
-- Elle appelle `vitrine_cartes_json(p_organization_id, false)`. PL/pgSQL résout
-- ses appels à l'EXÉCUTION : après ce fichier, cet appel-là désigne la nouvelle
-- fonction, `p_lang` prend son défaut `null`, et le tableau de bord reste en
-- français — c'est-à-dire exactement ce qu'il faisait hier. Le réécrire pour n'y
-- rien changer aurait ajouté cinquante lignes de diff à relire pour zéro effet.
--
-- ── LE CALQUE EST UN `left join`, ET IL EST NUL-SÛR PAR CONSTRUCTION ──
--
-- Aucun `if p_lang is null then … else … end if` : quand `p_lang` vaut `null` ou
-- `'fr'`, la condition `t.lang = p_lang` n'est vraie pour AUCUNE ligne (le
-- français n'est jamais stocké, et `= null` n'est jamais vrai), les jointures ne
-- ramènent rien, et les `coalesce` rendent le français. La branche française
-- n'est pas un cas particulier du code : elle est le cas général quand la table
-- est vide.
--
-- La condition de FRAÎCHEUR est DANS la jointure et non dans un `where` : une
-- traduction périmée ne doit pas faire disparaître sa fiche, elle doit être
-- ignorée. Mise en `where`, elle aurait retiré le plat de la carte.
-- ────────────────────────────────────────────────────────────

drop function if exists public.vitrine_cartes_json(uuid, boolean);

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

comment on function public.vitrine_cartes_json(uuid, boolean, text) is
  'Arbre cartes → rubriques → fiches d''une organisation, en jsonb, éventuellement '
  'CALQUÉ d''une traduction (VIT-1b). Écrit UNE FOIS et appelé par les deux RPC '
  'd''état : le public filtre sur `active`, l''éditeur non. Ordre (ordre, id) aux '
  'trois niveaux. `p_lang` null ou ''fr'' → français, SANS branche dédiée : les '
  '`left join` ne ramènent alors rien et les `coalesce` rendent la colonne '
  'd''origine. Une traduction PÉRIMÉE (version_source < updated_at de la cible) '
  'est ignorée et le français ressort — la condition est dans la JOINTURE, pas '
  'dans un `where`, sinon le plat disparaîtrait de la carte. Prix, photo, badges, '
  'allergènes et disponibilité passent inchangés : ils ne se traduisent pas. Ne '
  'contrôle NI le droit, NI la publication. Rendue à personne.';

revoke all on function public.vitrine_cartes_json(uuid, boolean, text)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 5. `vitrine_public_state` — la même porte, deux langues
--
-- ── LA NOUVELLE SIGNATURE, ET LE MÊME `drop` PRÉALABLE ──
--
-- Même raison qu'à la section 4 : une surcharge aurait rendu ambigu l'appel à un
-- seul argument que fait déjà `src/lib/vitrine-context.ts`.
--
-- ── UNE LANGUE INCONNUE N'EST PAS UNE ERREUR ──
--
-- `?lang=de`, `?lang=xx`, `?lang=` : la Vitrine répond EN FRANÇAIS. Lever
-- aurait transformé une adresse bricolée en page d'erreur, et refuser aurait
-- donné au visiteur un moyen de distinguer les langues configurées des autres.
-- Le repli français est de toute façon la décision d'ADR-109, et il vaut ici
-- pour la même raison qu'ailleurs : le français est TOUJOURS une réponse valable.
--
-- ── `lang_coverage` : LE CHIFFRE, PAS LA DÉCISION ──
--
-- La base RECOMPTE, elle ne conclut pas. Elle rend `total_champs_traduisibles`
-- et `traduits_frais` ; le seuil (95 %) et la décision d'afficher le sélecteur
-- vivent dans l'application, où ils se règlent sans migration. Poser le seuil ici
-- aurait enfermé un arbitrage de produit dans une fonction SQL.
--
-- IL EST RENDU DANS LES DEUX LANGUES, et c'est nécessaire : c'est sur la page
-- FRANÇAISE que l'écran doit décider s'il propose l'anglais. Un `lang_coverage`
-- réservé à la réponse anglaise aurait obligé l'application à appeler deux fois
-- la RPC pour afficher une seule page. Il décrit toujours la langue TRADUITE —
-- il n'y en a qu'une aujourd'hui, et son nom est écrit dans la charge utile
-- plutôt que deviné.
-- ────────────────────────────────────────────────────────────

drop function if exists public.vitrine_public_state(text);

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
      v_settings.organization_id, true, v_lang)
  );
end;
$$;

comment on function public.vitrine_public_state(text, text) is
  'État PUBLIC d''une vitrine, par son slug et dans une langue (VIT-1a, langue '
  'ajoutée en VIT-1b). Exige `published` ET org_has_module_access(…, '
  '''vitrine''), relu à CHAQUE consultation. Rend `unavailable` INDISTINCTEMENT '
  'pour un slug mal formé, inconnu, non publié ou sans droit — ce point d''entrée '
  'non authentifié n''est pas un oracle. `p_lang` null, ''fr'' ou INCONNUE → '
  'français : le repli est silencieux, une adresse bricolée ne produit pas une '
  'erreur. En anglais, les traductions FRAÎCHES se superposent champ à champ et '
  'les périmées sont ignorées (le français ressort). Rend `lang` — la langue '
  'RÉELLEMENT servie — et `lang_coverage` DANS LES DEUX LANGUES, parce que c''est '
  'sur la page française que l''écran décide d''offrir l''anglais ; le SEUIL '
  'reste dans l''application, la base ne rend que le compte. N''expose aucune '
  'donnée de client, aucun identifiant d''organisation.';

revoke all on function public.vitrine_public_state(text, text)
  from public, anon, authenticated;
grant execute on function public.vitrine_public_state(text, text) to service_role;


-- ────────────────────────────────────────────────────────────
-- 6. `upsert_vitrine_translation` — la seule porte d'écriture
--
-- ── POURQUOI UNE RPC ET NON UN `grant insert` À service_role ──
--
-- `service_role` a déjà tous les privilèges sur cette table par défaut : cette
-- RPC ne ferme donc rien qu'un serveur ne puisse contourner. Ce qu'elle apporte
-- est ailleurs, et c'est ce qu'un `insert` direct ne peut pas faire :
--
--   1. L'APPARTENANCE. `cible_id` ne porte aucune FK — quatre tables cibles —
--      donc RIEN dans le schéma n'empêche d'écrire une traduction du locataire A
--      sur la fiche du locataire B. C'est ici, et seulement ici, que le lien est
--      vérifié, par une jointure choisie SELON LE TYPE.
--   2. LES REFUS NOMMÉS. Un `insert` direct rend des 23514 que l'appelant ne sait
--      pas distinguer ; le pipeline doit savoir si son texte est trop long, sa
--      langue non servie ou son champ incompatible avec sa cible.
--   3. LE JOURNAL. Une traduction est du texte PUBLIÉ sous l'enseigne d'un
--      commerçant. Savoir quand elle a été posée ou remplacée est la seule façon
--      de répondre à « qui a écrit ça sur ma carte ».
--
-- ── L'INTER-LOCATAIRE LÈVE, ET IL LÈVE EN 42501 ──
--
-- Pas un état nommé : une violation de locataire n'est pas un cas d'usage dont
-- on informe l'appelant, c'est une erreur de programme. Et le refus est le MÊME
-- pour « la cible n'existe pas » et « la cible appartient à quelqu'un d'autre » —
-- les distinguer aurait fait de cette RPC un oracle sur les identifiants des
-- autres locataires, exactement ce que `vitrine_public_state` refuse d'être.
--
-- ── LE JOURNAL COMPTE LES GESTES, PAS LES NON-GESTES ──
--
-- Motif `set_vitrine_slug`, et il est ici vital pour le volume : un pipeline qui
-- repasse sur une carte de cinquante fiches réécrirait deux cents lignes d'audit
-- par exécution. Réécrire le MÊME texte pour la MÊME version ne journalise rien
-- et rend `changed = false`.
-- ────────────────────────────────────────────────────────────

create or replace function public.upsert_vitrine_translation(
  p_organization_id uuid,
  p_cible_type text,
  p_cible_id uuid,
  p_lang text,
  p_champ text,
  p_texte text,
  p_version_source timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lang       text;
  v_texte      text;
  v_appartient boolean;
  v_precedent  text;
  v_version    timestamptz;
  v_cree       boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null or p_cible_id is null then
    raise exception 'organization and target required' using errcode = '22023';
  end if;
  if p_version_source is null then
    raise exception 'source version required' using errcode = '22023';
  end if;

  if p_cible_type is null
     or p_cible_type not in ('settings', 'menu', 'categorie', 'item') then
    return pg_catalog.jsonb_build_object('state', 'invalid_cible');
  end if;

  -- Normalisation avant validation, motif `set_vitrine_slug` : « EN » et « en »
  -- sont la même langue, et refuser sur la casse aurait été de la pédanterie.
  v_lang := pg_catalog.lower(pg_catalog.btrim(coalesce(p_lang, '')));
  if v_lang <> 'en' then
    return pg_catalog.jsonb_build_object('state', 'invalid_lang');
  end if;

  -- LE COUPLAGE TYPE ↔ CHAMP, rendu sous son propre mot. La contrainte de table
  -- le tient aussi — elle est le filet — mais elle ne rend qu'un 23514.
  if p_champ is null or not (
       (p_cible_type = 'settings'
          and p_champ in ('accroche', 'histoire', 'horaires_texte'))
    or (p_cible_type in ('menu', 'categorie') and p_champ = 'nom')
    or (p_cible_type = 'item' and p_champ in ('nom', 'description'))
  ) then
    return pg_catalog.jsonb_build_object('state', 'invalid_champ');
  end if;

  v_texte := pg_catalog.btrim(coalesce(p_texte, ''));
  if pg_catalog.char_length(v_texte) < 1
     or pg_catalog.char_length(v_texte) > 2000 then
    return pg_catalog.jsonb_build_object('state', 'invalid_texte');
  end if;

  -- L'APPARTENANCE, PAR TYPE. C'est la garde que la FK absente ne peut pas
  -- rendre, et elle est la raison d'être de cette RPC.
  v_appartient := case p_cible_type
    when 'settings' then exists (
      select 1 from public.vitrine_settings s
       where s.id = p_cible_id and s.organization_id = p_organization_id)
    when 'menu' then exists (
      select 1 from public.vitrine_menus m
       where m.id = p_cible_id and m.organization_id = p_organization_id)
    when 'categorie' then exists (
      select 1 from public.vitrine_categories k
       where k.id = p_cible_id and k.organization_id = p_organization_id)
    when 'item' then exists (
      select 1 from public.vitrine_items i
       where i.id = p_cible_id and i.organization_id = p_organization_id)
  end;

  -- `coalesce(…, false)` ET NON `not v_appartient` seul : un `case` sans `else`
  -- rend `null` si le type sortait un jour de la liste, et `if not null then`
  -- NE LÈVE PAS — la traduction s'écrirait alors sans qu'aucune appartenance
  -- ait été vérifiée. Le cas est aujourd'hui inatteignable (le type est validé
  -- plus haut), et c'est précisément le genre de garde qui cesse de l'être
  -- quand quelqu'un ajoute un cinquième niveau.
  if not coalesce(v_appartient, false) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select t.texte, t.version_source into v_precedent, v_version
    from public.vitrine_translations t
   where t.organization_id = p_organization_id
     and t.cible_type = p_cible_type
     and t.cible_id = p_cible_id
     and t.lang = v_lang
     and t.champ = p_champ;
  v_cree := not found;

  if v_precedent is not distinct from v_texte
     and v_version is not distinct from p_version_source then
    return pg_catalog.jsonb_build_object(
      'state', 'ok', 'created', false, 'changed', false);
  end if;

  insert into public.vitrine_translations
    (organization_id, cible_type, cible_id, lang, champ, texte, version_source)
  values
    (p_organization_id, p_cible_type, p_cible_id, v_lang, p_champ,
     v_texte, p_version_source)
  on conflict on constraint vitrine_translations_cible_unique do update
    set texte = excluded.texte,
        version_source = excluded.version_source;

  -- AUDIT LÉGER : de quoi savoir QUAND un texte anglais a été posé ou remplacé,
  -- et sur quoi. LE TEXTE N'Y EST PAS — un journal n'est pas un stockage, et
  -- l'y recopier aurait doublé le volume de chaque traduction pour ne rien
  -- apprendre que la table ne dise déjà.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, 'system', 'vitrine.translation_set',
          pg_catalog.jsonb_build_object(
            'cible_type', p_cible_type,
            'cible_id', p_cible_id,
            'lang', v_lang,
            'champ', p_champ,
            'version_source', p_version_source,
            'created', v_cree));

  return pg_catalog.jsonb_build_object(
    'state', 'ok', 'created', v_cree, 'changed', true);
end;
$$;

comment on function public.upsert_vitrine_translation(uuid, text, uuid, text, text, text, timestamp with time zone) is
  'Pose ou remplace UNE traduction d''un champ de vitrine (VIT-1b) — seule porte '
  'd''écriture de vitrine_translations. Vérifie PAR TYPE que la cible appartient '
  'à l''organisation : `cible_id` ne porte aucune FK (quatre tables cibles), donc '
  'rien d''autre dans le schéma n''empêche d''écrire chez le voisin. Une cible '
  'inconnue ou d''un autre locataire lève 42501 — le MÊME refus pour les deux, '
  'sans quoi la RPC deviendrait un oracle sur les identifiants d''autrui. Refus '
  'nommés et distincts pour « invalid_cible », « invalid_lang », « invalid_champ » '
  '(le couplage type↔champ) et « invalid_texte » (1 à 2000 caractères détourés). '
  'Réécrire le MÊME texte pour la MÊME version ne journalise rien : un pipeline '
  'qui repasse sur cinquante fiches écrirait sinon deux cents lignes d''audit par '
  'passage. Le journal ne contient PAS le texte.';

revoke all on function public.upsert_vitrine_translation(uuid, text, uuid, text, text, text, timestamp with time zone)
  from public, anon, authenticated;
grant execute on function public.upsert_vitrine_translation(uuid, text, uuid, text, text, text, timestamp with time zone)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 7. `vitrine_translation_state` — ce que le commerçant verra (L15)
--
-- L11 n'a besoin que du compteur ; l'écran de suivi arrive au lot L15. La forme
-- est néanmoins rendue COMPLÈTE dès maintenant — par cible et par champ — parce
-- que la refaire au moment de l'écran aurait demandé une seconde migration pour
-- une fonction que personne n'appelait encore.
--
-- ── `p_actives_seulement = false`, ET LE CHIFFRE DIFFÈRE DE CELUI DU PUBLIC ──
--
-- Le commerçant voit le travail restant sur TOUT son catalogue, cartes
-- désactivées comprises ; le visiteur ne mesure que ce qu'il voit. Les deux
-- nombres peuvent donc différer, et c'est correct : un menu d'été non traduit et
-- désactivé n'éteint pas le sélecteur de langue en janvier, mais il reste à
-- traduire avant juin.
--
-- ── TROIS ÉTATS, PAS DEUX ──
--
-- `absent` (jamais traduit), `perime` (traduit, puis le texte a bougé) et
-- `frais`. Les deux premiers demandent la même action mais ne racontent pas la
-- même histoire : « il reste des plats à traduire » et « vos modifications
-- d'hier ont périmé six fiches » sont deux écrans différents.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_translation_state(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cibles jsonb;
  v_total  integer;
  v_frais  integer;
  v_perime integer;
  v_absent integer;
  v_lang_traduite constant text := 'en';
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

  with champs as (
    select c.cible_type,
           c.cible_id,
           c.champ,
           c.version_courante,
           case
             when t.id is null then 'absent'
             when t.version_source >= c.version_courante then 'frais'
             else 'perime'
           end as etat
      from public.vitrine_champs_traduisibles(p_organization_id, false) c
      left join public.vitrine_translations t
        on t.organization_id = p_organization_id
       and t.cible_type = c.cible_type
       and t.cible_id = c.cible_id
       and t.champ = c.champ
       and t.lang = v_lang_traduite
  ),
  par_cible as (
    select ch.cible_type,
           ch.cible_id,
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('champ', ch.champ, 'etat', ch.etat)
             order by ch.champ
           ) as champs
      from champs ch
     group by ch.cible_type, ch.cible_id
  )
  select
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'cible_type', p.cible_type,
          'cible_id', p.cible_id,
          'champs', p.champs
        )
        -- ORDRE STABLE, même raison qu'au catalogue : sans second rang, deux
        -- ouvertures de l'écran ne rendraient pas la même liste.
        order by p.cible_type, p.cible_id
      )
      from par_cible p
    ), '[]'::jsonb),
    (select pg_catalog.count(*)::integer from champs),
    (select pg_catalog.count(*)::integer from champs ch where ch.etat = 'frais'),
    (select pg_catalog.count(*)::integer from champs ch where ch.etat = 'perime'),
    (select pg_catalog.count(*)::integer from champs ch where ch.etat = 'absent')
  into v_cibles, v_total, v_frais, v_perime, v_absent;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'lang', v_lang_traduite,
    'resume', pg_catalog.jsonb_build_object(
      'total_champs_traduisibles', v_total,
      'traduits_frais', v_frais,
      'perimes', v_perime,
      'manquants', v_absent
    ),
    'cibles', v_cibles
  );
end;
$$;

comment on function public.vitrine_translation_state(uuid) is
  'État de TRADUCTION d''une vitrine pour l''éditeur (VIT-1b) : par cible et par '
  'champ, `frais` / `perime` / `absent`, plus un résumé chiffré. Trois états et '
  'non deux — « il reste des plats à traduire » et « vos modifications d''hier '
  'ont périmé six fiches » sont deux écrans différents. Mesure TOUT le catalogue, '
  'cartes désactivées comprises : le compte diffère donc de `lang_coverage` du '
  'public, qui ne mesure que ce que le visiteur voit, et c''est voulu. NE GARDE '
  'PAS l''appartenance de l''appelant : `service_role` n''a pas de session '
  'marchande, la garde est dans l''action serveur, motif de toutes les vues de '
  'dashboard du dépôt. Rendue à service_role seul.';

revoke all on function public.vitrine_translation_state(uuid)
  from public, anon, authenticated;
grant execute on function public.vitrine_translation_state(uuid) to service_role;
