-- ============================================================
-- COMPTEUR D'OUVERTURES DES PAGES PUBLIQUES DE MODULE
--
-- Le QR universel a équipé huit modules sur neuf, mais une seule expérience
-- comptait quoi que ce soit : la roue, via `qr_codes.scan_count`. Un
-- commerçant colle une affiche de quiz en vitrine et n'apprend jamais si
-- quelqu'un l'a scannée. Cette migration généralise le comptage aux six
-- modules qui exposent un QR par `PublicShare`.
--
-- ── POURQUOI UNE TABLE GÉNÉRIQUE ET NON UNE COLONNE PAR MODULE ──
--
-- Le dépôt a déjà tranché ce type d'arbitrage deux fois, dans le même sens :
-- `reward_issuances (source_type text CHECK, source_id uuid)` et
-- `organization_module_grants (module text CHECK, resource_id uuid)` portent
-- un identifiant polymorphe SANS clé étrangère, avec un commentaire de colonne
-- pour toute documentation. Six colonnes `scan_count` dans six tables, ce
-- serait six migrations, six RPC et six chemins applicatifs pour un seul geste
-- — et le septième module arriverait sans compteur, comme aujourd'hui.
--
-- Ce qu'on perd (l'intégrité référentielle) est compensé comme ailleurs dans
-- ce dépôt : un unique partiel sur `(module, resource_id)`, et
-- `organization_id` porté en propre — donc soumis à la CASCADE de
-- l'organisation, ce qui borne la seule fuite qui compte vraiment.
--
-- ── CE QUE LE CHIFFRE MESURE, ET POURQUOI IL NE S'APPELLE PAS « SCANS » ──
--
-- Le beacon se déclenche à chaque CHARGEMENT de la page : un rechargement, un
-- retour arrière, un lien partagé par SMS incrémentent aussi. `scan_count`,
-- sur la roue, promet donc une mesure qu'il ne fait pas — un commerçant qui
-- lit « 40 scans » croit à 40 personnes devant sa vitrine. On ne reproduit pas
-- ce mensonge : la colonne s'appelle `open_count`, l'écran dit « ouvertures »,
-- et le détail (« chaque chargement compte ») est écrit au commerçant.
--
-- ── LA BORNE QUI REND L'ENDPOINT PUBLIC SÛR ──
--
-- La RPC RÉSOUT l'identifiant public contre la table du module et ne fait
-- RIEN s'il ne désigne aucune ressource. Sans cette résolution, un POST
-- répété avec des chaînes aléatoires ferait croître la table sans borne depuis
-- Internet. Avec elle, le nombre de lignes est majoré par le nombre
-- d'expériences réellement créées : le pire cas d'abus est un chiffre
-- d'affichage faux, jamais une table qui enfle.
-- ============================================================

create table if not exists public.module_page_opens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- Vocabulaire de `organization_module_grants.module`, et non celui de
  -- `reward_issuances.source_type` : on compte l'ouverture d'un MODULE.
  -- Les trois absents le sont pour trois raisons distinctes, toutes durables :
  -- `wheel` compte déjà dans `qr_codes.scan_count` (deux sources de vérité
  -- pour un même chiffre valent moins qu'une), `referral` n'a pas de QR
  -- commerçant par décision produit (son lien est fabriqué côté joueur), et
  -- `hunts` affiche une affiche PAR ÉTAPE — un compteur unique y conflerait
  -- des étapes distinctes, ce qui demande sa propre forme.
  module text not null check (
    module in ('quiz', 'calendar', 'jackpot', 'pronostics', 'loyalty', 'events')
  ),
  -- Polymorphe et SANS clé étrangère, comme `reward_issuances.source_id` et
  -- `organization_module_grants.resource_id` : six tables cibles possibles.
  resource_id uuid not null,
  open_count integer not null default 0 check (open_count >= 0),
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  constraint module_page_opens_resource_unique unique (module, resource_id)
);

comment on table public.module_page_opens is
  'Compteur d''OUVERTURES des pages publiques de module (un chargement = une unité, rechargement inclus). Ce n''est pas un compteur de scans : voir le commentaire de open_count.';

comment on column public.module_page_opens.resource_id is
  'Ressource du module comptée (quiz, calendrier, jackpot, contest, programme de fidélité, session d''événement). Polymorphe et SANS clé étrangère, comme reward_issuances.source_id.';

comment on column public.module_page_opens.open_count is
  'Nombre de CHARGEMENTS de la page publique, pas de scans distincts : un rechargement, un retour arrière ou un lien partagé incrémentent aussi. Le libellé commerçant doit dire « ouvertures ».';

create index if not exists module_page_opens_org_idx
  on public.module_page_opens (organization_id, module);

-- ── RLS ──────────────────────────────────────────────────────
-- Lecture d'équipe (c'est une statistique d'affichage, pas une donnée de
-- facturation : `is_org_member` et non `is_org_owner`). Aucune écriture pour
-- `authenticated` : le compteur ne s'incrémente QUE par la RPC ci-dessous,
-- sinon un éditeur porteur d'un JWT gonflerait ses propres statistiques par un
-- simple PATCH PostgREST.
alter table public.module_page_opens enable row level security;
revoke all on table public.module_page_opens from public, anon, authenticated;

create policy "module_page_opens: member select" on public.module_page_opens
  for select to authenticated
  using (public.is_org_member(organization_id));

grant select on table public.module_page_opens to authenticated;
grant select, insert, update on table public.module_page_opens to service_role;

-- ── RPC d'incrément ──────────────────────────────────────────
-- Révoquée d'`anon` et `authenticated` comme son aînée `increment_qr_scan` :
-- elle n'est appelable que par le client admin, derrière /api/scan et son
-- rate-limit. Un compteur incrémentable depuis le navigateur serait
-- falsifiable à volonté.
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
  -- l'imposer à six appelants.
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
  'Incrémente le compteur d''ouvertures d''une page publique de module. Résout l''identifiant public (slug, code de jonction ou identifiant) vers la ressource ; ne crée rien si l''identifiant ne désigne aucune ressource.';

revoke all on function public.increment_module_page_open(text, text)
  from public, anon, authenticated;
grant execute on function public.increment_module_page_open(text, text)
  to service_role;
