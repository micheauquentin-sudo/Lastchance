-- ============================================================
-- P0 lot 1 — CORRECTIFS DE LA REVUE SÉCURITÉ SUR 20260905120000
--
-- Quatre points, dont deux bloquants. Aucun ne porte sur du code ancien :
-- tous portent sur le lot précédent, et deux d'entre eux existent PARCE QUE
-- ce lot a réécrit de sa main un grant qu'il ne faisait jusque-là qu'hériter.
--
-- ── POURQUOI UN FICHIER NEUF ET NON UNE CORRECTION EN PLACE ──
--
-- 20260905120000 n'est pas fusionnée : la corriger en place serait tentant, et
-- passerait même la CI d'une PR. Elle NE PASSERAIT PAS celle d'un push.
-- `scripts/check-migration-order.mjs` compare des OCTETS à un commit de base,
-- et `.github/workflows/ci.yml:128` ne lui donne pas le même selon l'événement :
--   * PR   → `pull_request.base.sha`, c'est-à-dire `main`, qui ne porte pas
--            encore 20260905120000 — une édition en place y serait invisible ;
--   * push → `github.event.before`, c'est-à-dire l'ancien head de CETTE
--            branche, qui la porte depuis le commit 64a2dfa — une édition en
--            place y rendrait « existait dans la base et a été modifiée ».
-- L'usage du dépôt (CLAUDE.md, enseignement (b) du chantier SMS) dit la même
-- chose en plus court : une correction va dans une migration née sur la branche
-- courante. C'est le seul geste qui tient sous les DEUX événements, et il ne
-- dépend pas de la promesse de ne pousser qu'une fois.
--
-- ── CE QUE CE FICHIER FERME ──
--
--   E1 (ÉLEVÉ) — `auto_schedule` était la télécommande de la seule porte que
--     20260905120000 laissait ouverte, et son en-tête décrivait ce cas comme
--     PASSIF : « un commerçant qui arme une planification pendant qu'il a
--     accès, puis dont l'abonnement s'arrête ». Les deux moitiés de la phrase
--     étaient fausses. Armer n'exige aucun accès, et l'armeur n'a pas besoin
--     d'en avoir jamais eu : deux requêtes suffisaient, `PATCH
--     /rest/v1/campaigns` posant `auto_schedule = true` et un `starts_at`
--     passé, puis l'attente du cron. Les quatre colonnes étaient dans la liste
--     re-grantée (20260905120000:296-300), la RLS « campaigns: editors »
--     autorise, et le trigger de publication ne se déclenchait pas — `status`
--     ne change pas, donc `v_old is not distinct from v_new`. Dix minutes plus
--     tard, `run_campaign_schedule()` publiait la campagne en `postgres`, où
--     `auth.role()` est NULL et où le trigger sort à sa première ligne.
--
--   M2 (MOYEN) — le trigger d'INSERT rouvrait l'oracle inter-tenant que la
--     même migration révoque vingt lignes plus haut. Voir la section 2 : c'est
--     le point le plus instructif du lot.
--
--   M3 (MOYEN) — un éditeur pouvait déplacer une campagne d'une organisation à
--     l'autre. Signalé « préexistant, non traité » par l'en-tête de
--     20260905120000 ; la revue a montré qu'il est exploitable, et surtout que
--     ce lot venait de le réécrire de sa main — il passait d'héritage à choix.
--
--   F7 (FAIBLE) — une divergence de parité d'un mot, invisible de la matrice
--     qui garde justement cette parité. Voir la section 4.
--
-- ── CE QUE CE FICHIER NE FERME PAS, ET IL FAUT LE LIRE ──
--
--   * La campagne dont `auto_schedule` était DÉJÀ vrai avant cette migration
--     n'est touchée par rien : le trigger ne garde qu'une TRANSITION vers vrai.
--     C'est aussi, exactement, le cas que l'en-tête de 20260905120000 décrivait
--     — armé légitimement, puis abonnement expiré — à ceci près qu'il est
--     désormais le SEUL restant au lieu d'être le seul décrit. Il relève du
--     lot 2, et le geste juste y est un refus VISIBLE (notification,
--     `paused_reason` dédié), pas une garde muette en tâche de fond.
--   * `run_campaign_schedule` n'est toujours pas gardé, délibérément et pour
--     la raison déjà écrite : un refus en tâche de fond n'a pas d'écran pour
--     se dire. Ce fichier ne déplace pas cette décision, il retire seulement
--     à un attaquant le moyen d'ARMER la télécommande.
--   * `organization_entitlements` / `org_effective_entitlements` : lot 2.
-- ============================================================

-- ============================================================
-- 1. M2 — LE TRIGGER NE DOIT PAS RÉPONDRE SUR UNE ORGANISATION
--    DONT L'APPELANT N'EST PAS ÉDITEUR
--
-- 20260905120000:232-245 révoque `org_has_active_access` et
-- `org_has_module_access` à `authenticated`, avec le bon motif : SECURITY
-- DEFINER, elles liraient l'état d'abonnement de N'IMPORTE QUELLE
-- organisation, donnant à tout commerçant une sonde sur ses concurrents.
-- Le trigger défaisait cette révocation.
--
-- LE MÉCANISME, ET IL TIENT À UN ORDRE D'ÉVALUATION : en PostgreSQL, un
-- trigger BEFORE ROW sur INSERT s'exécute AVANT le `WITH CHECK` de la RLS.
-- `guard_module_publication` lisait `organization_id` dans la ligne FOURNIE
-- PAR L'APPELANT, puis appelait la garde en SECURITY DEFINER. Un
-- `POST /rest/v1/hunts` portant l'identifiant d'organisation d'un concurrent
-- (lisible dans le payload RSC de /play/<slug>) rendait donc deux réponses
-- DISTINCTES sans écrire la moindre ligne :
--   * `P0001 module access required: hunts`      → la victime n'a pas le droit
--   * `42501 violates row-level security`        → la victime l'a
-- Neuf sondes donnaient la carte complète des add-ons payés d'un concurrent.
--
-- LE CORRECTIF SORT AVANT TOUTE LECTURE DE DROIT quand l'appelant n'est de
-- toute façon pas éditeur de l'organisation visée. Ce n'est pas une garde
-- ajoutée par-dessus la RLS, c'est un ALIGNEMENT sur elle : les neuf tables
-- portent toutes une policy d'écriture `with check (is_org_editor(
-- organization_id))`, donc le chemin qui sort ici est exactement celui que la
-- RLS refusera ensuite — avec le même 42501 dans les deux cas. La garde ne
-- perd rien : un éditeur légitime est éditeur, et lui seul atteint la ligne
-- suivante.
--
-- CETTE PRÉMISSE EST DÉSORMAIS TENUE PAR UNE ASSERTION, et pas seulement par
-- cette phrase : supabase/tests/publication_guards.test.sql dérive les neuf
-- `with check` de `pg_policies` et rougit si l'une d'elles cesse d'exiger
-- `is_org_editor`. Sans elle, affaiblir une policy transformerait ce
-- `return new` en trou, en silence.
--
-- ── ET LE POINT DE MÉTHODE, QUI VAUT AU-DELÀ DE CE DÉFAUT ──
-- Ni pgTAP ni QA ne pouvaient voir ce défaut : `supabase test db` s'exécute en
-- `postgres`, superutilisateur, QUI CONTOURNE LA RLS. Sous ce harnais l'INSERT
-- à organisation étrangère RÉUSSIT simplement, et les deux branches ne se
-- distinguent pas. L'assertion qui l'éprouve doit donc être jouée sous un rôle
-- NON superutilisateur (`set role authenticated`), sinon elle est verte sans
-- rien mesurer — ce dépôt appelle cela un détecteur muet et en a déjà payé
-- plusieurs.
-- ============================================================
create or replace function public.guard_module_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module    text   := tg_argv[0];
  v_column    text   := tg_argv[1];
  v_published text[] := tg_argv[2]::text[];
  v_new       text;
  v_old       text;
  v_org       uuid;
begin
  -- ARMÉ POUR LE SEUL PORTEUR D'UN JWT MARCHAND, et 20260905120000 dit
  -- pourquoi : le seed insère des lignes publiées en tant que `postgres`
  -- (aucun JWT) et les crons écrivent en service_role. Armer pour tous
  -- casserait le seed, donc tous les E2E, avec un échec sans rapport visible
  -- avec sa cause.
  if coalesce((select auth.role()), '') <> 'authenticated' then
    return new;
  end if;

  -- Lecture générique par jsonb : la même fonction sert une colonne texte
  -- (`status`) et une colonne booléenne (`enabled`, `auto_schedule`, qui se
  -- lisent 'true'/'false').
  v_new := pg_catalog.to_jsonb(new) ->> v_column;

  -- Retrait, pause, archivage, désarmement : jamais gardés. On ne bloque pas
  -- quelqu'un qui veut cesser d'utiliser.
  if v_new is null or not (v_new = any (v_published)) then
    return new;
  end if;

  -- Sur UPDATE, seule la TRANSITION est gardée : ré-enregistrer une ligne
  -- déjà publiée sans toucher à sa publication ne doit pas exiger le droit,
  -- sinon éditer le libellé d'un lot deviendrait impossible dès la fin de
  -- l'abonnement.
  if tg_op = 'UPDATE' then
    v_old := pg_catalog.to_jsonb(old) ->> v_column;
    if v_old is not distinct from v_new then
      return new;
    end if;
  end if;

  v_org := (pg_catalog.to_jsonb(new) ->> 'organization_id')::uuid;

  -- CORRECTIF M2. Placé ICI et pas plus haut : les quatre sorties ci-dessus
  -- ne lisent que la ligne fournie par l'appelant lui-même, elles ne peuvent
  -- rien révéler de personne, et les faire précéder d'un `is_org_editor`
  -- ferait payer une lecture de table à toutes les écritures qui ne publient
  -- rien — c'est-à-dire la quasi-totalité d'entre elles.
  --
  -- On ne refuse pas, ON SE TAIT : refuser ici (avec un message propre)
  -- recréerait l'oracle sous un autre code d'erreur. Laisser passer rend la
  -- main à la RLS, dont le refus est le MÊME que l'organisation visée ait le
  -- droit ou non — et c'est cette indistinction qui est le correctif.
  if not public.is_org_editor(v_org) then
    return new;
  end if;

  perform public.assert_module_publish_allowed(v_org, v_module);
  return new;
end;
$$;

comment on function public.guard_module_publication() is
  'Trigger de publication : refuse qu''une ligne atteigne un état PUBLIÉ sans '
  'le droit du module. Arguments : (module, colonne, valeurs publiées). '
  'Ferme la porte de l''INSERT, que les révocations de 20260905120000 laissent '
  'ouverte à dessein (duplication et modèles de campagne insèrent status=draft). '
  'ARMÉ UNIQUEMENT POUR auth.role() = ''authenticated'' : le seed insère des '
  'lignes publiées sans JWT et les crons écrivent en service_role. '
  'NE SE PRONONCE PAS sur une organisation dont l''appelant n''est pas éditeur '
  '(correctif M2, 20260906120000) : lire un droit là révélerait les add-ons '
  'd''un concurrent par la différence entre P0001 et 42501, un trigger BEFORE '
  'ROW s''exécutant AVANT le WITH CHECK de la RLS. La RLS refuse ensuite, '
  'identiquement dans les deux cas. Ne garde ni le retour en arrière, ni une '
  'écriture qui ne change pas l''état de publication.';

-- ============================================================
-- 2. E1 — GARDER L'ARMEMENT, PAS LE CRON
--
-- Le refus doit arriver DANS LE FORMULAIRE, au clic, là où il y a un écran
-- pour le porter. C'est ce qui distingue ce correctif de celui que
-- 20260905120000 a écarté à juste titre : garder `run_campaign_schedule`
-- ferait échouer une activation en tâche de fond, sans que le commerçant
-- puisse jamais apprendre pourquoi sa campagne n'a pas démarré.
--
-- AUCUNE FONCTION NEUVE, ET C'EST DÉLIBÉRÉ. `guard_module_publication` sait
-- déjà faire exactement ceci : une colonne, une liste de valeurs « publiées »,
-- une garde sur la seule transition vers cette liste. Écrire une seconde
-- fonction dupliquerait la règle de sécurité que 20260905120000 a précisément
-- pris soin de n'écrire qu'une fois — et c'est le motif « six lignes recopiées
-- dans douze fichiers » que ce dépôt paie déjà ailleurs. Le correctif M2
-- ci-dessus profite donc à cette garde-ci sans avoir à y être recopié.
--
-- `update of auto_schedule` : le trigger ne se déclenche que si la colonne est
-- dans la liste SET de l'UPDATE (la clause de colonnes ne vaut que pour
-- l'UPDATE ; l'INSERT déclenche toujours, et la garde y laisse passer
-- `auto_schedule = false`). Renommer une campagne déjà armée ne réveille donc
-- rien, et l'armer deux fois de suite non plus — `v_old is not distinct from
-- v_new` sort avant toute lecture de droit.
--
-- CE QUE LE SEED ET LES MODÈLES FONT, VÉRIFIÉ ET NON SUPPOSÉ : supabase/seed.sql
-- n'écrit `auto_schedule` nulle part (huit insertions de campagnes, la colonne
-- n'y figure pas, `default false`), `src/lib/campaign-templates.ts:189` pose
-- `auto_schedule: false` en dur, `duplicateCampaign` ne le transmet pas. Le
-- SEUL écrivain applicatif de cette colonne est `updateCampaignAutomation`
-- (src/actions/campaigns.ts:392), sous JWT marchand — exactement la population
-- visée.
-- ============================================================
drop trigger if exists campaigns_guard_auto_schedule on public.campaigns;
create trigger campaigns_guard_auto_schedule
  before insert or update of auto_schedule on public.campaigns
  for each row execute function public.guard_module_publication('wheel', 'auto_schedule', '{true}');

comment on trigger campaigns_guard_auto_schedule on public.campaigns is
  'Correctif E1 (20260906120000) : ARMER la programmation automatique exige le '
  'droit « wheel », parce que run_campaign_schedule (cron, service_role) publie '
  'ensuite sans lire aucun droit. Garde l''armement et non le cron : le refus '
  'arrive dans le formulaire, au clic, où un écran peut le porter. Désarmer '
  'reste libre. NE COUVRE PAS une planification armée AVANT la fin de '
  'l''abonnement — seule transition vers vrai, jamais l''état vrai déjà en '
  'place : c''est le cas restant du lot 2.';

-- ============================================================
-- 3. M3 — UNE CAMPAGNE NE CHANGE PAS D'ORGANISATION
--
-- L'en-tête de 20260905120000 signalait `update(id, organization_id)` comme
-- « préexistant, signalé, non traité », en le supposant inoffensif. Il ne
-- l'est pas : un utilisateur éditeur chez la victime ET propriétaire de sa
-- propre organisation faisait
--   PATCH /rest/v1/campaigns?id=eq.<victime> {"organization_id":"<sienne>"}
-- L'ancienne ligne passe le `using`, la nouvelle passe le `with check`, et le
-- trigger sort puisque `status` est inchangé. La campagne disparaît du tableau
-- de bord de la victime ; ses `wheels`, `prizes` et `qr_codes` restent chez
-- elle, donc la campagne devient injouable ET irrécupérable. Une campagne déjà
-- `active` change ainsi de tenant sans repasser par aucune garde.
--
-- Ce n'est plus « préexistant » au sens qui compte : jusqu'à 20260905120000 ce
-- droit était hérité d'un `grant update` de table écrit en 00001 ; depuis, il
-- est ÉNUMÉRÉ colonne par colonne. Il est devenu un choix, et le choix se
-- corrige là où il a été fait.
--
-- Vérifié avant de retirer : aucun chemin applicatif n'écrit ces deux colonnes
-- en UPDATE. `updateCampaign` fait `const { id, ...fields }` (campaigns.ts:164)
-- — l'identifiant part en filtre `.eq()`, jamais en charge utile — et
-- `organization_id` n'apparaît dans aucun schéma Zod d'écriture. Idem pour
-- `event_games` (events.ts:616, `{ name }` seul).
--
-- UNE SEULE RÉVOCATION SUFFIT, ET CELA A ÉTÉ MESURÉ SUR CE POSTGRES PLUTÔT
-- QUE DÉDUIT. 20260905120000 a établi que la révocation d'une COLONNE ne mord
-- pas contre un grant de TABLE (son piège (a)). La réciproque n'était pas
-- mesurée, et l'écrire au jugé aurait été reproduire l'erreur que ce lot vient
-- de documenter — dans un sens ou dans l'autre, une révocation qui ne mord pas
-- se lit exactement comme une révocation qui mord. Sonde :
--   grant update (a, b) on t to authenticated;
--   has_column_privilege('authenticated','t','a','UPDATE') → TRUE
--   revoke update on t from authenticated;
--   has_column_privilege('authenticated','t','a','UPDATE') → FALSE
-- Un `revoke` de TABLE emporte donc bien les grants de COLONNE, et ajouter un
-- `revoke update (id, organization_id)` par prudence n'aurait rien gardé de
-- plus tout en laissant croire qu'il gardait quelque chose. Le RÉSULTAT (et
-- non le geste) est de toute façon asserté dans publication_guards.test.sql :
-- `id` et `organization_id` non écrivables, les douze autres colonnes intactes.
-- ============================================================
revoke update on public.campaigns from authenticated;
grant update (
  name, starts_at, ends_at, created_at, engagement,
  collect_email, collect_phone, code_ttl_seconds, auto_schedule,
  budget_cents, budget_spent_cents, paused_reason
) on public.campaigns to authenticated;

revoke update on public.event_games from authenticated;
grant update (name, created_at, updated_at)
  on public.event_games to authenticated;

-- ============================================================
-- 4. F7 — UNE DURÉE ABSOLUE NE S'ÉCRIT PAS EN JOURS
--
-- `o.past_due_since + interval '14 days'` ajoute un intervalle dont le champ
-- « jours » est CALENDAIRE : Postgres le résout dans le fuseau de session.
-- `src/lib/subscription.ts:88-90` ajoute `14 * 86_400_000` millisecondes, une
-- durée ABSOLUE. Les deux coïncident sous `TimeZone = 'UTC'` et divergent
-- d'une heure deux fois l'an dès que le fuseau de session change.
--
-- LA MATRICE DE PARITÉ NE POUVAIT PAS L'ATTRAPER, et c'est ce qui rend ce
-- point intéressant plutôt que cosmétique : elle joue les deux côtés dans le
-- même fuseau, donc le seul cas où les implémentations diffèrent est
-- précisément celui qu'elle n'exprime pas. La garde était vraie et aveugle.
--
-- `interval '336 hours'` est la même durée, écrite dans un champ que Postgres
-- ne réajuste jamais : la divergence devient structurellement impossible au
-- lieu d'être seulement non observée. Une assertion HORS matrice, jouée sous
-- `Europe/Paris` en travers du changement d'heure de mars, la mesure
-- désormais (access_parity.test.sql).
--
-- Le reste du corps est repris VERBATIM de 20260905120000:128-162 : seul le
-- littéral d'intervalle change.
-- ============================================================
create or replace function public.org_has_active_access(
  p_organization_id uuid,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- coalesce EXTÉRIEUR, et il porte tout le poids de la garde : une
  -- organisation inconnue rend zéro ligne, donc NULL, et `if not NULL` ne
  -- déclenche AUCUNE branche en plpgsql — la garde échouerait OUVERTE sur
  -- exactement l'entrée qu'un attaquant contrôle. Un identifiant inconnu doit
  -- se lire « pas d'accès », jamais « pas d'avis ».
  select coalesce((
    select case
      -- Accès offert par le back-office : prime sur l'état Stripe.
      when o.comp_access
       and (o.comp_access_until is null or o.comp_access_until > p_now)
        then true
      when o.subscription_status = 'active' then true
      -- Impayé : 14 j de grâce (PAST_DUE_GRACE_DAYS, src/lib/subscription.ts:36).
      -- ÉCRIT EN HEURES, PAS EN JOURS : le champ « jours » d'un interval est
      -- calendaire (résolu dans le fuseau de session), le champ « heures » est
      -- absolu. Le TypeScript ajoute des millisecondes ; 336 h est la seule
      -- écriture qui ne puisse pas en diverger sous un changement d'heure.
      -- `past_due_since` nul = transition en cours que le webhook datera :
      -- on ne coupe pas sur un état incomplet.
      when o.subscription_status = 'past_due'
        then o.past_due_since is null
          or o.past_due_since + interval '336 hours' > p_now
      when o.subscription_status <> 'trialing' then false
      else o.trial_ends_at > p_now
    end
    from public.organizations o
    where o.id = p_organization_id
  ), false);
$$;

comment on function public.org_has_active_access(uuid, timestamptz) is
  'Accès complet de l''organisation (abonnement actif, essai en cours, impayé '
  'dans les 14 jours, ou accès offert non échu). Port SQL de hasActiveAccess '
  '(src/lib/subscription.ts:70-82) ; la parité des deux implémentations est '
  'jouée sur une matrice unique par supabase/tests/access_parity.test.sql et '
  'src/lib/subscription-parity.test.ts. Une organisation INCONNUE rend false, '
  'pas null : le null ferait échouer ouvert tout appelant plpgsql. '
  'N''applique PAS TRIAL_EXPIRY_GRACE_DAYS, qui borne le cron expire-trials et '
  'non l''accès. La grâce d''impayé s''écrit « 336 hours » et non « 14 days » '
  '(correctif F7, 20260906120000) : le champ jours d''un interval est '
  'calendaire, le TypeScript ajoute une durée absolue, et la matrice de parité '
  'joue les deux côtés dans un même fuseau — elle ne pouvait pas voir l''écart.';

-- Les grants de 20260905120000:238-241 survivent au `create or replace`
-- (celui-ci ne réinitialise pas les privilèges d'une fonction existante). Ils
-- sont réécrits ici quand même : c'est la propriété qui compte — ces deux
-- fonctions ne sont PAS une sonde publique — et elle ne doit pas dépendre de
-- ce qu'un relecteur sache que `create or replace` préserve l'ACL.
revoke all on function public.org_has_active_access(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_active_access(uuid, timestamptz)
  to service_role;

-- ============================================================
-- 5. LES COMMENTAIRES QUI AFFIRMAIENT LE FAUX
--
-- `set_campaign_status` se décrivait comme « la seule écriture possible de
-- campaigns.status par un marchand ». C'était inexact tant qu'E1 restait
-- ouvert, et un relecteur s'y serait fié. Le commentaire disait bien qu'un
-- cron publie aussi ; ce qu'il ne disait pas, c'est que le marchand tenait la
-- commande de ce cron. La phrase est réécrite pour ce qui est vrai APRÈS le
-- correctif — et pour ce qui ne l'est toujours pas.
-- ============================================================
comment on function public.set_campaign_status(uuid,uuid,text,text) is
  'Seule écriture DIRECTE de campaigns.status par un marchand (le grant '
  'table-wide UPDATE a été remplacé par un grant colonne sans status). Exige '
  'is_org_editor ou service_role ; exige en plus le droit effectif « wheel » '
  '(abonnement seul, pas d''addon) pour passer active. draft/paused/archived '
  'restent atteignables sans droit. '
  'CE N''EST PAS LE SEUL CHEMIN VERS campaigns.status = ''active'' : le cron '
  'run_campaign_schedule active en service_role toute campagne auto_schedule '
  'dont la fenêtre s''ouvre, sans lire aucun droit. Depuis 20260906120000, '
  'ARMER auto_schedule exige le droit « wheel » (trigger '
  'campaigns_guard_auto_schedule), ce qui retire à un marchand sans droit le '
  'moyen de déclencher ce chemin. RESTE VRAI ET NON FERMÉ : une planification '
  'armée pendant que le droit existait continue de publier après sa perte — '
  'c''est le cas du lot 2, dont le geste juste est un refus VISIBLE et non une '
  'garde de plus en tâche de fond.';
