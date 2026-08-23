-- ════════════════════════════════════════════════════════════
-- CE QUI ATTIRE — LA MESURE AGRÉGÉE D'UNE VITRINE (VIT-9)
--
-- Le commerçant voyait un nombre d'ouvertures de page (`module_page_opens`) et
-- rien d'autre : ni quelle carte on regarde, ni quelle fiche, ni dans quelle
-- langue, ni ce sur quoi on clique. Il ne pouvait donc pas décider d'une mise
-- en avant — c'est le sujet de ce lot.
--
--
-- ── AUCUN IDENTIFIANT, ET C'EST LA DÉCISION STRUCTURANTE ───
--
-- Cette table ne porte NI cookie, NI session, NI empreinte, NI adresse IP, NI
-- horodatage plus fin que le JOUR. Une ligne est un COMPTEUR :
--
--     (organisation, jour, langue, type, référence) → n
--
-- Il est donc impossible d'en tirer un visiteur, un parcours ou une fréquence
-- de retour — non par politique interne, mais parce que la donnée n'existe
-- pas. Le commerçant lira « 120 vues », jamais « 47 visiteurs ». C'est le
-- choix explicite du 2026-08-23 : la Vitrine reste hors de toute politique de
-- consentement, et aucun profil ne peut se constituer même par accident.
--
-- CE QUE ÇA COÛTE, DIT FRANCHEMENT : pas de « visiteurs uniques », pas de
-- « revenus sur la fiche », pas d'entonnoir. Ce qui est rendu est une
-- popularité relative, et c'est exactement ce qu'il faut pour choisir quoi
-- mettre en avant.
--
--
-- ── LA CLÉ PRIMAIRE EST LE MODÈLE ENTIER ──────────────────
--
-- Cinq colonnes, une seule ligne par combinaison, et un `+1` en `on conflict`.
-- Écrire un événement par vue aurait produit des millions de lignes sur un
-- chemin public, une purge à écrire, et — surtout — un horodatage à la
-- milliseconde qui redevient un traceur dès qu'on le croise avec autre chose.
--
--
-- ── LE TYPE `action` NE COMPTE PAS UNE VENTE ──────────────
--
-- Il compte un CLIC sur une porte. Le cahier l'écrit : « ne jamais appeler ces
-- mesures des ventes ». Une intention déclenchée n'est ni une réservation, ni
-- un panier, ni un revenu, et rien ici ne permet de le prétendre — la table
-- ignore tout de ce qui se passe après le clic.
--
--
-- ── POURQUOI L'OUVERTURE DE PAGE N'Y EST PAS ──────────────
--
-- Elle est déjà comptée par `module_page_opens` (`module = 'vitrine'`), depuis
-- la route `/api/page-opens`. La recompter ici aurait donné deux chiffres pour
-- le même fait, et c'est toujours l'écart entre les deux qu'on finit par
-- expliquer.
-- ════════════════════════════════════════════════════════════

create table if not exists public.vitrine_mesures (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  jour date not null,
  -- Les deux langues servies. Le français n'est PAS l'absence ici : il est une
  -- valeur qu'on compte, sans quoi « 80 % de FR » serait indéductible.
  langue text not null check (langue in ('fr', 'en')),
  type text not null check (type in ('carte', 'rubrique', 'fiche', 'action')),
  -- Un identifiant de contenu EN TEXTE, ou un nom de porte. Pas de FK : les
  -- trois premiers types visent trois tables différentes, et le quatrième ne
  -- vise aucune table. Une fiche supprimée laisse donc son compteur — c'est
  -- voulu : effacer l'historique d'un plat retiré ferait mentir le total du
  -- mois où il existait.
  ref text not null check (pg_catalog.char_length(ref) between 1 and 64),
  compteur integer not null default 0 check (compteur >= 0),
  primary key (organization_id, jour, langue, type, ref)
);

comment on table public.vitrine_mesures is
  'Compteurs agrégés d''une Vitrine (VIT-9). AUCUN identifiant de visiteur, '
  'aucune session, aucune IP, aucun horodatage plus fin que le jour : une '
  'ligne est un compte, jamais un événement. « Vues », jamais « visiteurs ». '
  'Le type `action` compte un CLIC sur une porte — jamais une vente, un panier '
  'ni un revenu.';

alter table public.vitrine_mesures enable row level security;

-- AUCUNE POLICY, délibérément : ni `anon` ni `authenticated` ne touchent cette
-- table. L'écriture passe par `compter_vues_vitrine` (service_role, appelée
-- par une route publique sans jeton) et la lecture par `vitrine_mesures_state`
-- (service_role, appelée derrière la garde d'organisation). Une policy de
-- lecture pour `authenticated` aurait ouvert les compteurs d'un commerce à
-- tout compte connecté sachant deviner un identifiant.

-- ────────────────────────────────────────────────────────────
-- `compter_vues_vitrine` — un lot de compteurs, ou rien
--
-- ── LE SLUG, PAS L'ORGANISATION ──
--
-- L'appelant est une route PUBLIQUE SANS JETON : lui laisser nommer une
-- organisation aurait permis d'écrire dans les compteurs de n'importe quel
-- commerce. Il ne connaît qu'un slug — l'adresse déjà publique — et c'est la
-- fonction qui le résout, en exigeant `published` ET le droit `vitrine`,
-- exactement comme `vitrine_public_state`.
--
-- ── LE LOT PLUTÔT QUE L'UNITÉ ──
--
-- Un visiteur qui parcourt une carte voit dix fiches. Dix requêtes auraient
-- coûté dix allers-retours sur le chemin le plus chaud du produit ; l'écran
-- accumule et envoie une fois, au départ de la page.
--
-- ── LES BORNES SONT DANS LA FONCTION, PAS DANS L'APPELANT ──
--
-- Soixante entrées par appel, et chaque `+1` est un `+1` : la charge ne porte
-- aucun compteur, seulement des références. Laisser l'appelant fournir un
-- incrément aurait fait d'une route publique un moyen d'écrire « 10 000 vues »
-- sur la fiche d'un concurrent.
-- ────────────────────────────────────────────────────────────

create or replace function public.compter_vues_vitrine(
  p_slug text,
  p_langue text,
  p_mesures jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_langue text;
  v_entree jsonb;
  v_type text;
  v_ref text;
  v_n integer := 0;
begin
  if p_slug is null or p_mesures is null
     or pg_catalog.jsonb_typeof(p_mesures) <> 'array' then
    return;
  end if;

  -- Repli silencieux sur le français, comme la lecture publique : une langue
  -- inconnue n'est pas une erreur de comptage, c'est une adresse bricolée.
  v_langue := case when p_langue = 'en' then 'en' else 'fr' end;

  select s.organization_id into v_org
  from public.vitrine_settings s
  where s.slug = p_slug and s.published;

  if v_org is null then return; end if;
  if not public.org_has_module_access(v_org, 'vitrine') then return; end if;

  for v_entree in select * from pg_catalog.jsonb_array_elements(p_mesures) loop
    v_n := v_n + 1;
    exit when v_n > 60;

    v_type := v_entree ->> 'type';
    v_ref := v_entree ->> 'ref';

    continue when v_type is null or v_ref is null;
    continue when v_type not in ('carte', 'rubrique', 'fiche', 'action');
    continue when pg_catalog.char_length(v_ref) not between 1 and 64;

    insert into public.vitrine_mesures
      (organization_id, jour, langue, type, ref, compteur)
    values (v_org, current_date, v_langue, v_type, v_ref, 1)
    on conflict (organization_id, jour, langue, type, ref)
    do update set compteur = public.vitrine_mesures.compteur + 1;
  end loop;
end;
$$;

comment on function public.compter_vues_vitrine(text, text, jsonb) is
  'Incrémente les compteurs agrégés d''une Vitrine (VIT-9). Résout le SLUG '
  'lui-même — l''appelant est une route publique sans jeton — et exige '
  '`published` ET org_has_module_access(…, ''vitrine''). Au plus 60 entrées, '
  'et chaque entrée vaut +1 : la charge ne porte aucun incrément.';

revoke all on function public.compter_vues_vitrine(text, text, jsonb) from public;
revoke all on function public.compter_vues_vitrine(text, text, jsonb) from anon;
revoke all on function public.compter_vues_vitrine(text, text, jsonb) from authenticated;
grant execute on function public.compter_vues_vitrine(text, text, jsonb) to service_role;

-- ────────────────────────────────────────────────────────────
-- `vitrine_mesures_state` — ce que le tableau de bord affiche
--
-- Rend les compteurs d'une FENÊTRE de jours, déjà agrégés par type et par
-- référence, plus la répartition des langues. L'écran n'a rien à sommer : le
-- faire en SQL évite qu'un total affiché dépende de ce qu'un mappeur a su lire.
-- ────────────────────────────────────────────────────────────

create or replace function public.vitrine_mesures_state(
  p_organization_id uuid,
  p_jours integer default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_depuis date;
  v_jours integer;
begin
  if p_organization_id is null then
    return pg_catalog.jsonb_build_object(
      'jours', 0, 'langues', pg_catalog.jsonb_build_object('fr', 0, 'en', 0),
      'contenus', '[]'::jsonb, 'actions', '[]'::jsonb
    );
  end if;

  -- Fenêtre bornée : 1 à 90 jours. Un `p_jours` libre aurait laissé demander
  -- l'historique entier depuis un écran, sur une table qui grossit tous les
  -- jours.
  v_jours := least(greatest(coalesce(p_jours, 7), 1), 90);
  v_depuis := current_date - (v_jours - 1);

  return pg_catalog.jsonb_build_object(
    'jours', v_jours,
    'langues', (
      select coalesce(
        pg_catalog.jsonb_object_agg(m.langue, m.total),
        pg_catalog.jsonb_build_object()
      )
      from (
        select langue, pg_catalog.sum(compteur)::integer as total
        from public.vitrine_mesures
        where organization_id = p_organization_id and jour >= v_depuis
        group by langue
      ) m
    ),
    -- LES CONTENUS, TOUS TYPES CONFONDUS ET TRIÉS PAR VUES. Vingt lignes : un
    -- écran de commerçant n'a pas à porter une carte de soixante plats classée
    -- — il a à montrer ce qui ressort.
    'contenus', (
      select coalesce(pg_catalog.jsonb_agg(x), '[]'::jsonb)
      from (
        select pg_catalog.jsonb_build_object(
                 'type', type, 'ref', ref,
                 'vues', pg_catalog.sum(compteur)::integer
               ) as x
        from public.vitrine_mesures
        where organization_id = p_organization_id
          and jour >= v_depuis
          and type in ('carte', 'rubrique', 'fiche')
        group by type, ref
        order by pg_catalog.sum(compteur) desc
        limit 20
      ) t
    ),
    'actions', (
      select coalesce(pg_catalog.jsonb_agg(x), '[]'::jsonb)
      from (
        select pg_catalog.jsonb_build_object(
                 'ref', ref, 'clics', pg_catalog.sum(compteur)::integer
               ) as x
        from public.vitrine_mesures
        where organization_id = p_organization_id
          and jour >= v_depuis
          and type = 'action'
        group by ref
        order by pg_catalog.sum(compteur) desc
      ) t
    )
  );
end;
$$;

comment on function public.vitrine_mesures_state(uuid, integer) is
  'Compteurs agrégés d''une Vitrine sur une fenêtre de 1 à 90 jours (VIT-9). '
  'Rend des VUES et des CLICS, jamais des visiteurs ni des ventes. Aucune '
  'vérification d''appartenance : l''appelant passe l''organisation de la '
  'SESSION, jamais un paramètre venu du navigateur.';

revoke all on function public.vitrine_mesures_state(uuid, integer) from public;
revoke all on function public.vitrine_mesures_state(uuid, integer) from anon;
revoke all on function public.vitrine_mesures_state(uuid, integer) from authenticated;
grant execute on function public.vitrine_mesures_state(uuid, integer) to service_role;
