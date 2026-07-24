-- ============================================================
-- Lastchance — Place de marché de campagnes (couche DB)
--
-- Le commerçant part d'un MODÈLE au lieu de tout configurer. Deux
-- sources de modèles, DÉLIBÉRÉMENT ASYMÉTRIQUES :
--
--   1. Le CATALOGUE Lastchance (Saint-Valentin, Halloween, Noël,
--      ouverture de boutique, anniversaire, match de football, fête des
--      Mères, happy hour, soldes, lancement de produit) vit EN CODE
--      (src/lib/…), versionné avec l'application. Il n'est PAS stocké
--      ici : un catalogue en base imposerait un seed à maintenir, une
--      migration par retouche de texte, et surtout une table LISIBLE
--      par toutes les organisations — exactement ce qu'on ne veut pas
--      avoir à sécuriser.
--
--   2. Les modèles PRIVÉS du commerçant — cette table. Un commerçant
--      enregistre sa propre campagne comme modèle réutilisable, et ce
--      modèle appartient à SON organisation, point final.
--
-- INVARIANT CENTRAL DE CE FICHIER : un modèle privé n'est ni lisible ni
-- applicable en dehors de son organisation. Il n'y a donc AUCUNE policy
-- anon/public sur `campaign_templates`, aucun slug public, aucun drapeau
-- « partagé » : la table n'est jamais dans le chemin d'un parcours
-- joueur. Toute exposition future (partage entre organisations,
-- publication) devra passer par une migration explicite qui reprendra
-- cette décision — elle n'est pas préparée ici.
--
-- Appliquer un modèle crée une campagne EN BROUILLON entièrement
-- configurée : c'est un travail de la couche applicative (lecture du
-- blueprint, création campaign + wheel + prizes en `draft`). La base ne
-- fait qu'en garder la recette. En particulier, les TEXTES d'email
-- portés par le blueprint ne sont QUE des textes : aucune colonne, aucun
-- trigger ici n'active un scénario d'emailing — l'activation reste une
-- action explicite du commerçant dans automation_settings.
-- ============================================================

-- ── Modèles de campagne privés ───────────────────────────────
create table public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text
    check (description is null or char_length(description) <= 300),
  -- La recette complète, sérialisée : visuel / style de roue, game_type,
  -- textes, lots suggérés, règles, durée RELATIVE (en jours — un modèle
  -- ne porte pas de dates absolues, sinon il périme), textes d'email.
  -- La FORME est validée côté applicatif (Zod), pas ici : le blueprint
  -- suivra l'évolution des jeux (13 game_type aujourd'hui) et un CHECK
  -- figé imposerait une migration à chaque nouveau champ. La base tient
  -- les deux garde-fous qu'un client ne peut pas contourner : c'est un
  -- OBJET, et il est BORNÉ.
  blueprint jsonb not null,
  -- Campagne d'origine — traçabilité pure (« ce modèle vient de Noël
  -- 2026 »), jamais une dépendance dure : la campagne peut être
  -- supprimée sans emporter le modèle.
  source_campaign_id uuid,
  -- Auteur. Posé par le trigger d'attribution à partir de la session
  -- (jamais fourni par le client), effacé si le compte disparaît.
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un nom = un modèle dans la bibliothèque du commerçant. L'unicité est
  -- posée par ORGANISATION (jamais globalement : deux commerçants ont
  -- évidemment le droit d'avoir chacun leur « Noël »). Elle est EXACTE
  -- et non normalisée : « Noël » et « noël » restent deux modèles
  -- distincts. C'est volontaire — la base ne décide pas à la place du
  -- commerçant que deux libellés qu'il a écrits différemment sont le
  -- même modèle ; elle empêche seulement le doublon franc, que le
  -- backend traduit en « un modèle porte déjà ce nom » (23505).
  constraint campaign_templates_org_name_unique unique (organization_id, name),
  -- Le blueprint est un document, pas un scalaire ni un tableau : un
  -- `"texte"` ou un `[…]` en base casserait toute lecture applicative.
  constraint campaign_templates_blueprint_object_check
    check (jsonb_typeof(blueprint) = 'object'),
  -- BORNE DE TAILLE (même patron que wheels_skill_config_size_check, à
  -- 8 Ko). 32 Ko ici : un blueprint transporte la configuration ENTIÈRE
  -- d'une campagne — style de roue, lots, règles ET les textes d'email,
  -- de loin le plus volumineux — là où skill_config ne portait qu'un
  -- défi. Généreuse mais FINIE : sans elle, une bibliothèque de modèles
  -- est un vecteur de gonflement de la base à coût nul pour l'attaquant.
  constraint campaign_templates_blueprint_size_check
    check (pg_column_size(blueprint) <= 32768),
  -- FK COMPOSITE TENANT (même patron que calendar_days → wheels) : la
  -- campagne d'origine doit appartenir à LA MÊME organisation. Sans le
  -- couple, un éditeur pourrait faire pointer son modèle sur l'id d'une
  -- campagne d'une autre organisation. MATCH SIMPLE : non contrôlée
  -- quand source_campaign_id est null.
  --
  -- `on delete set null (source_campaign_id)` — la liste de colonnes
  -- (PostgreSQL 15+) est ICI OBLIGATOIRE : un `set null` nu annulerait
  -- TOUTES les colonnes référençantes, donc aussi organization_id qui
  -- est NOT NULL, et la suppression d'une campagne échouerait. Avec la
  -- liste, supprimer la campagne source ne fait que couper le lien de
  -- traçabilité — le modèle survit, dans son organisation.
  constraint campaign_templates_source_campaign_id_organization_id_fkey
    foreign key (source_campaign_id, organization_id)
    references public.campaigns(id, organization_id)
    on delete set null (source_campaign_id)
);

comment on table public.campaign_templates is
  'Modèle de campagne PRIVÉ d''une organisation : recette réutilisable (visuel, jeu, textes, lots suggérés, règles, durée, textes d''email) enregistrée à partir d''une campagne. STRICTEMENT org-scopé — aucune policy anon/public, jamais exposé à un parcours joueur ni à une autre organisation. Le catalogue Lastchance (10 modèles) vit EN CODE, pas dans cette table.';
comment on column public.campaign_templates.blueprint is
  'Configuration complète sérialisée de la campagne à recréer (durée RELATIVE en jours, pas de dates absolues). Objet jsonb borné à 32 Ko ; la forme est validée côté applicatif (Zod). Les textes d''email qu''il contient ne sont QUE des textes : appliquer un modèle n''active jamais un scénario d''emailing.';
comment on column public.campaign_templates.source_campaign_id is
  'Campagne dont le modèle est issu — traçabilité seule. FK composite tenant (même organisation) ; sa suppression met ce lien à null sans détruire le modèle.';
comment on column public.campaign_templates.created_by is
  'Auteur du modèle, posé par le trigger d''attribution depuis la session marchande (jamais fourni par le client) et immuable ensuite.';

-- Bibliothèque du commerçant : « mes modèles, du plus récent au plus
-- ancien » est LA seule lecture de liste de cette table.
create index campaign_templates_org_created_idx
  on public.campaign_templates (organization_id, created_at desc);

-- ── Attribution et horodatage non falsifiables ───────────────
-- Patron repris de protect_invitation_attribution (00019) : l'auteur
-- vient de la SESSION, pas du corps de la requête, et ne bouge plus
-- ensuite. Non SECURITY DEFINER (rien à lire hors de NEW/OLD).
create or replace function public.protect_campaign_template_attribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Session marchande : auth.uid() fait autorité et écrase toute
    -- valeur fournie. Service role (auth.uid() null) : la valeur
    -- explicite est conservée — c'est le backend qui sait pour quel
    -- utilisateur il enregistre le modèle.
    -- `coalesce` NU, jamais qualifié en pg_catalog. : c'est une
    -- construction du parseur, pas une fonction du catalogue (deux
    -- incidents historiques sur ce point).
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := pg_catalog.now();
    new.updated_at := pg_catalog.now();
  else
    -- Un modèle ne change ni d'organisation ni d'auteur. Le grant de
    -- colonnes l'interdit déjà à une session marchande ; ce garde-fou
    -- vaut aussi pour le service role.
    if new.organization_id is distinct from old.organization_id then
      raise exception 'organization_id is immutable';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable';
    end if;
    new.created_at := old.created_at;
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function public.protect_campaign_template_attribution()
  from public, anon, authenticated;

drop trigger if exists campaign_templates_attribution on public.campaign_templates;
create trigger campaign_templates_attribution
  before insert or update on public.campaign_templates
  for each row execute function public.protect_campaign_template_attribution();

-- ── RLS et grants ────────────────────────────────────────────
alter table public.campaign_templates enable row level security;

-- Les privilèges par défaut de Supabase donnent anon/authenticated sur
-- toute nouvelle table de `public` : on repart de zéro avant de
-- redistribuer. anon n'est JAMAIS re-servi ci-dessous.
revoke all on table public.campaign_templates from public, anon, authenticated;

-- Lecture : toute l'équipe (un caissier voit la bibliothèque, il ne la
-- modifie pas). Écriture : éditeurs seulement — miroir exact de
-- « campaigns: editors » (00019) et de « calendars: … » (20260728).
create policy "campaign_templates: member select" on public.campaign_templates
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "campaign_templates: editor write" on public.campaign_templates
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Select complet ; insert/update RESTREINTS aux colonnes du commerçant.
-- organization_id est écrivable à l'INSERT (la policy with check impose
-- déjà que ce soit une organisation dont il est éditeur) mais JAMAIS en
-- UPDATE : sans cela, un utilisateur éditeur de deux organisations
-- pourrait déplacer un modèle de l'une à l'autre. created_by et les
-- horodatages sont posés par le trigger, donc hors grant.
grant select on table public.campaign_templates to authenticated;
grant insert (organization_id, name, description, blueprint, source_campaign_id)
  on public.campaign_templates to authenticated;
grant update (name, description, blueprint, source_campaign_id)
  on public.campaign_templates to authenticated;
grant delete on public.campaign_templates to authenticated;

grant select, insert, update, delete
  on table public.campaign_templates to service_role;

-- Mutations commerçant auditées (miroir campaigns / calendars / …).
create trigger campaign_templates_merchant_audit
  after insert or update or delete on public.campaign_templates
  for each row execute function public.audit_merchant_mutation();
