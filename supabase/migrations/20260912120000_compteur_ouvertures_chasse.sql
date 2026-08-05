-- ============================================================
-- COMPTEUR D'OUVERTURES — LA CHASSE AU TRÉSOR, PAR ÉTAPE
--
-- La migration 20260911120000 a équipé six modules sur sept et laissé la
-- chasse de côté, avec ce motif inscrit dans son `check` :
--
--   « `hunts` affiche une affiche PAR ÉTAPE — un compteur unique y confondrait
--     des étapes distinctes, ce qui demande sa propre forme. »
--
-- Le motif est juste, la conclusion l'était à moitié. Un commerçant colle
-- l'étape 1 à la boulangerie et l'étape 2 chez le fleuriste ; « 40 ouvertures »
-- pour la chasse entière ne lui dit pas QUELLE affiche travaille — or c'est la
-- seule question qu'il se pose devant ces affiches.
--
-- ── « SA PROPRE FORME » EST LA FORME QUI EXISTE DÉJÀ ──
--
-- Il n'y a ni colonne ni table à ajouter, parce que le grain de `resource_id`
-- n'a JAMAIS été « la ressource de tête du module ». Il est, depuis le premier
-- jour, « la ressource que CE QR désigne » :
--
--   quiz       → quizzes.id            (tête de module)
--   calendar   → calendars.id          (tête de module)
--   jackpot    → jackpot_campaigns.id  (tête de module)
--   pronostics → contests.id           (tête de module)
--   loyalty    → loyalty_programs.id   (tête de module)
--   events     → event_sessions.id     ← SOUS-OBJET de event_games
--
-- `events` est le précédent qui tranche : un jeu d'événement porte plusieurs
-- sessions, chacune avec son `join_code`, son QR et sa ligne de compteur. Le
-- commentaire de colonne le nomme déjà — « session d'événement ». Une étape de
-- chasse a exactement cette forme : un jeton, une URL, une affiche, une ligne.
--
-- `resource_id` porte donc `hunt_steps.id`, et l'unique `(module, resource_id)`
-- rend un compteur PAR AFFICHE sans rien changer à la table. Compter la chasse
-- au lieu de l'étape aurait, lui, demandé une colonne — pour produire le
-- chiffre dont on vient d'établir qu'il ne répond pas à la question.
--
-- ── CE QUI RESTE VRAI, ET QUI COMPTE PLUS QUE LE SCHÉMA ──
--
-- 1. La RPC RÉSOUT le jeton contre `hunt_steps` et ne crée RIEN s'il ne
--    désigne aucune étape. C'est la borne qui rend l'endpoint public tenable :
--    un POST en boucle avec des jetons aléatoires ne fait pas enfler la table.
--    `hunt_steps.token` est unique GLOBALEMENT (pas seulement par chasse), donc
--    la résolution est non ambiguë sans connaître la chasse.
-- 2. L'organisation vient de l'étape, jamais de l'appelant.
-- 3. Le mot reste « ouvertures » : le beacon compte un CHARGEMENT (rechargement,
--    retour arrière et lien partagé inclus), et l'écran commerçant le dit.
-- ============================================================

-- ── 1. Le vocabulaire s'ouvre à `hunts` ──────────────────────
-- La contrainte de la migration d'origine est un `check` de colonne, donc
-- nommée par défaut `module_page_opens_module_check`. On la remplace au lieu
-- d'en ajouter une seconde : deux contraintes coexistantes laisseraient
-- l'ancienne refuser `hunts` en silence. Le test pgTAP le vérifie par le
-- COMPORTEMENT (une ligne `hunts` s'insère, une ligne `wheel` est refusée) et
-- non sur la foi de ce nom.
alter table public.module_page_opens
  drop constraint if exists module_page_opens_module_check;

alter table public.module_page_opens
  add constraint module_page_opens_module_check check (
    module in (
      'quiz', 'calendar', 'jackpot', 'pronostics', 'loyalty', 'events', 'hunts'
    )
  );

comment on column public.module_page_opens.module is
  'Module compté, vocabulaire de organization_module_grants.module. Les deux absents le sont par décision : wheel compte déjà dans qr_codes.scan_count, referral n''a pas de QR commerçant (lien fabriqué côté joueur).';

comment on column public.module_page_opens.resource_id is
  'Ressource que CE QR désigne — pas nécessairement la tête du module : quiz, calendrier, jackpot, contest et programme de fidélité sont des têtes, mais events porte une SESSION (sous-objet de event_games) et hunts une ÉTAPE (sous-objet de hunts). Le grain est l''affiche, pas le module. Polymorphe et SANS clé étrangère, comme reward_issuances.source_id.';

-- ── 2. La RPC apprend à résoudre un jeton d'étape ────────────
-- Réécrite en entier (et non complétée par un patch) pour rester le seul
-- endroit où lire les sept résolutions : c'est cette fonction que la revue
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
  -- l'imposer à sept appelants.
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
  'Incrémente le compteur d''ouvertures d''une page publique de module. Résout l''identifiant public (slug, code de jonction, jeton d''étape de chasse ou identifiant) vers la ressource que le QR désigne ; ne crée rien si l''identifiant ne désigne aucune ressource.';

-- Réémis bien que `create or replace` préserve les privilèges : la porte
-- fermée est la propriété que la revue vient relire, elle doit se lire ici et
-- non se déduire de l'histoire de la fonction.
revoke all on function public.increment_module_page_open(text, text)
  from public, anon, authenticated;
grant execute on function public.increment_module_page_open(text, text)
  to service_role;
