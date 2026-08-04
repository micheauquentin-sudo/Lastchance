-- ============================================================
-- P0 lot 1 — LE DROIT DE PUBLIER DESCEND EN BASE
--
-- Constat d'origine : sur neuf modules, la garde « ce commerçant a-t-il le
-- droit d'activer ce module ? » ne vivait QUE dans la server action. Un
-- `PATCH /rest/v1/<table>?id=eq.…` porteur du JWT d'un éditeur publiait donc
-- sans aucun droit de module et sans abonnement actif — la policy RLS
-- (`is_org_editor`) autorise l'écriture, et le `grant update(status)`
-- l'autorisait colonne comprise.
--
-- ── CE QUE CETTE MIGRATION FERME ──
--   1. `org_has_active_access` / `org_has_module_access` : le droit effectif
--      (abonnement + addon) devient lisible EN BASE. Il ne l'était pas :
--      aucune des 22 fonctions qui lisent `addon_*` ne regardait l'état
--      d'abonnement (asymétrie documentée dans src/lib/quiz-context.ts:52-57,
--      vérifiée ici sur pg_proc — seules apply_stripe_subscription_event*,
--      event_participant_capacity lisent `subscription_status`).
--   2. La colonne de publication cesse d'être écrivable par `authenticated`
--      sur les huit modules ; une RPC de transition par module la remplace,
--      portant rôle + droit de module + droit effectif + audit.
--   3. `set_contest_status` reçoit le droit `addon_pronostics` qui lui
--      manquait ; `start_event_session` reçoit le droit `addon_events` —
--      c'était la seule porte de publication joueur gardée NULLE PART.
--   4. Un trigger ferme la porte d'à côté : l'INSERT. Voir ci-dessous.
--
-- ── LE PIÈGE QUE CETTE MIGRATION A DÛ CONTOURNER, MESURÉ ET NON SUPPOSÉ ──
--
-- (a) `revoke update (status)` NE MORD PAS quand un `grant update` TABLE-WIDE
--     existe. Vérifié sur ce Postgres, pas déduit d'une lecture de la doc :
--       grant update on t to authenticated;
--       revoke update (status) on t from authenticated;
--       has_column_privilege('authenticated','t','status','UPDATE') → TRUE
--     Postgres tient les privilèges table et colonne dans deux registres
--     distincts ; révoquer la colonne ne retire rien au grant de table, et
--     n'émet AUCUN avertissement. `campaigns` et `event_games` portaient
--     exactement ce grant table-wide (leurs colonnes `id`, `organization_id`,
--     `created_at` apparaissaient dans information_schema.column_privileges,
--     ce qu'aucun grant colonne écrit à la main n'aurait produit). Pour ces
--     deux tables il faut donc `revoke update on <table>` puis re-grant
--     colonne par colonne — c'est ce que fait la section 3.
--     UNE GARDE QUI NE MORD PAS SE LIT EXACTEMENT COMME UNE GARDE QUI MORD.
--
-- (b) `authenticated` porte `insert(status)` sur les NEUF tables (et
--     `insert(enabled)` sur referral_programs). Fermer l'UPDATE en laissant
--     l'INSERT ouvert n'aurait rien fermé : `POST /rest/v1/hunts` avec
--     `status: 'active'` publie tout aussi bien. C'est vrai y compris pour
--     `contests`, dont l'UPDATE était pourtant fermé depuis 20260721150000 :
--     la porte était verrouillée et la fenêtre à côté grande ouverte.
--
-- ── CE QUE CETTE MIGRATION NE FERME PAS (à lire avant de s'y fier) ──
--
--   * `service_role` publie sans droit, par construction. Les RPC ci-dessous
--     exigent le droit de TOUT LE MONDE, mais le TRIGGER n'est armé que pour
--     `auth.role() = 'authenticated'`. Ce n'est pas un oubli : `supabase/seed.sql`
--     insère des campagnes, chasses, quiz et calendriers `active` en tant que
--     `postgres` (aucun JWT), et `archiveElapsedCalendars` (cron) écrit en
--     service_role. Armer le trigger pour tous ferait échouer le seed, donc
--     tous les E2E, sans rapport visible avec la cause. La population visée
--     est celle qui DÉTIENT une porte : le porteur d'un JWT marchand.
--
--   * CONSÉQUENCE NOMMÉE, ET C'EST LA PORTE QUI RESTE LA PLUS OUVERTE :
--     `run_campaign_schedule` (cron, service_role, 20260723110000:214-217)
--     fait passer en `active` toute campagne portant `auto_schedule` dès que
--     sa fenêtre s'ouvre, `where c.auto_schedule and c.status in
--     ('draft','paused')` — sans lire le moindre droit, ni avant ce lot ni
--     après. Un commerçant qui arme une planification pendant qu'il a accès,
--     puis dont l'abonnement s'arrête, verra donc sa campagne s'activer
--     quand même. Ce n'est PAS fermé ici, délibérément : y poser la garde
--     ferait échouer une activation en tâche de fond, sans écran ni message,
--     et le commerçant n'aurait aucun moyen d'apprendre pourquoi sa campagne
--     n'a jamais démarré — un refus muet est pire que le trou qu'il bouche.
--     Le geste juste est un refus VISIBLE (notification, `paused_reason`
--     dédié), qui appartient au lot 2 avec le reste du modèle de droits.
--     Vérifié : c'est le SEUL chemin service_role qui publie réellement ;
--     `settle_hunt_completions`, `draw_quiz_winners`, `finalize_contest`,
--     `resync_calendar_progress` et `run_jackpot_date_draws` opèrent sur des
--     modules DÉJÀ publiés et n'en publient aucun.
--   * Le RETOUR EN ARRIÈRE n'est jamais gardé, délibérément : passer une
--     campagne en `draft`/`paused`/`archived` ne demande aucun droit. Un
--     commerçant dont l'abonnement s'arrête doit pouvoir ARRÊTER ses modules ;
--     l'en empêcher serait un enfermement qui se règle par un appel au
--     support (le raisonnement est déjà écrit dans src/actions/hunts.ts:200-208
--     et cette migration s'y aligne plutôt que d'inventer une seconde règle).
--   * `event_sessions.status` ne reçoit PAS de trigger. Ni `update(status)` ni
--     `insert(status)` ne sont accordés à `authenticated` sur cette table :
--     il n'y a pas de porte de côté à fermer, seulement la RPC, qui est
--     fermée en section 5. Les transitions `lobby → live → ended` ne sont pas
--     gardées non plus : elles prolongent une publication déjà autorisée, et
--     les garder risquerait de couper une session EN COURS sans fermer
--     quoi que ce soit de neuf.
--   * La matrice de transitions est volontairement PERMISSIVE hors
--     publication (tout statut valide au CHECK est atteignable, `archived`
--     n'est pas terminal). Inventer ici des états terminaux que
--     l'application ne connaît pas casserait des parcours que ce lot n'a pas
--     audités. La seule règle neuve est le droit exigé pour PUBLIER.
--   * Le motif (`p_reason`) est enregistré à l'audit mais jamais EXIGÉ, à la
--     différence de `set_contest_status`. Aucune des huit actions n'en
--     fournit aujourd'hui ; l'exiger refuserait des transitions légitimes.
--   * `campaigns` et `event_games` récupèrent au re-grant leurs colonnes
--     `id` / `organization_id` en UPDATE, parce qu'elles les avaient déjà via
--     le grant table-wide et que ce lot ne restructure pas ce qu'on ne lui a
--     pas demandé. C'EST UN GRANT DISCUTABLE (il laisse un éditeur déplacer
--     une ligne vers une autre organisation où il est aussi éditeur) — il est
--     PRÉEXISTANT, il est signalé ici, il n'est pas traité ici.
--   * `organization_entitlements` / `org_effective_entitlements` ne sont pas
--      touchées : leur `exists` sans `active` ferait rejaillir les droits de
--      toute organisation résiliée (20260818120000:44-51). Lot 2.
-- ============================================================

-- ============================================================
-- 1. LE DROIT EFFECTIF, EN SQL
-- ============================================================

-- Port SQL de `hasActiveAccess` (src/lib/subscription.ts:70-82) et de
-- `hasCompAccess` (:19-26).
--
-- LE DANGER DE CE GESTE EST D'EN FAIRE UNE SECONDE SOURCE DE VÉRITÉ. Il est
-- traité par une garde de parité (supabase/tests/access_parity.test.sql +
-- src/lib/subscription-parity.test.ts), qui joue UNE MÊME matrice de cas des
-- deux côtés. Ce qu'elle prouve et ce qu'elle ne prouve pas est écrit dans son
-- en-tête : lire là-bas avant de se fier à celle-ci.
--
-- TRIAL_EXPIRY_GRACE_DAYS (3 j) N'APPARAÎT PAS ICI, ET C'EST VOULU. Son
-- absence serait autrement lue comme un oubli : la constante TS existe, mais
-- son propre commentaire (src/lib/subscription.ts:54-56) dit qu'aucun accès
-- n'en dépend — elle borne le cron `expire-trials`, pas l'accès. La reprendre
-- ici accorderait trois jours d'accès que le TypeScript n'accorde pas.
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
      -- `past_due_since` nul = transition en cours que le webhook datera :
      -- on ne coupe pas sur un état incomplet.
      when o.subscription_status = 'past_due'
        then o.past_due_since is null
          or o.past_due_since + interval '14 days' > p_now
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
  'non l''accès.';

-- Droit effectif d'un MODULE = addon allumé ET accès actif. C'est le miroir
-- exact des huit `has<Module>Access` de src/lib/subscription.ts (:101-177),
-- qui sont tous `addon_x && hasActiveAccess(org)`.
create or replace function public.org_has_module_access(
  p_organization_id uuid,
  p_module text,
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_addon boolean;
begin
  -- Un module inconnu LÈVE au lieu de rendre false. Les deux refusent, mais
  -- seul le premier se remarque : un `case` sans `else` rendrait null, donc
  -- un refus silencieux, et une faute de frappe dans un nom de module se
  -- lirait comme « ce commerçant n'a pas le droit » pour l'éternité.
  if p_module not in ('wheel', 'hunts', 'calendar', 'loyalty', 'quiz',
                      'jackpot', 'events', 'referral', 'pronostics') then
    raise exception 'unknown module: %', p_module;
  end if;

  if not public.org_has_active_access(p_organization_id, p_now) then
    return false;
  end if;

  select case p_module
    -- La roue / les campagnes sont le produit de base : aucun addon ne les
    -- conditionne, seul l'abonnement compte (src/actions/campaigns.ts:171).
    when 'wheel'      then true
    when 'hunts'      then o.addon_hunts
    when 'calendar'   then o.addon_calendar
    when 'loyalty'    then o.addon_loyalty
    when 'quiz'       then o.addon_quiz
    when 'jackpot'    then o.addon_jackpot
    when 'events'     then o.addon_events
    when 'referral'   then o.addon_referral
    when 'pronostics' then o.addon_pronostics
  end
  into v_addon
  from public.organizations o
  where o.id = p_organization_id;

  return coalesce(v_addon, false);
end;
$$;

comment on function public.org_has_module_access(uuid, text, timestamptz) is
  'Droit effectif d''un module : addon allumé ET org_has_active_access. '
  'Miroir des has<Module>Access de src/lib/subscription.ts:101-177. '
  'Le module « wheel » n''a pas d''addon (produit de base) : seul l''abonnement '
  'compte. Un nom de module inconnu LÈVE, il ne rend pas false — un refus '
  'silencieux masquerait une faute de frappe indéfiniment.';

-- Ni l'une ni l'autre n'est exposée à `authenticated` : elles sont
-- SECURITY DEFINER et liraient l'état d'abonnement de N'IMPORTE QUELLE
-- organisation, ce qui donnerait à tout commerçant une sonde sur les addons
-- et la santé d'abonnement de ses concurrents. Les triggers et RPC ci-dessous
-- les appellent depuis leur propre contexte SECURITY DEFINER, qui n'a pas
-- besoin du grant.
revoke all on function public.org_has_active_access(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_active_access(uuid, timestamptz)
  to service_role;
revoke all on function public.org_has_module_access(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.org_has_module_access(uuid, text, timestamptz)
  to service_role;

-- ============================================================
-- 2. LA GARDE PARTAGÉE
--
-- Elle est UNE, et c'est le point. Les huit RPC qui suivent ne peuvent pas
-- différer sur la règle de sécurité : elles ne la portent pas, elles
-- l'appellent. Le motif « six lignes recopiées dans douze fichiers » est
-- exactement ce qui les avait désynchronisées ailleurs dans ce dépôt.
-- ============================================================
create or replace function public.assert_module_publish_allowed(
  p_organization_id uuid,
  p_module text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.org_has_module_access(p_organization_id, p_module) then
    raise exception 'module access required: %', p_module
      using hint = 'addon inactif ou abonnement sans acces';
  end if;
end;
$$;

comment on function public.assert_module_publish_allowed(uuid, text) is
  'Lève si l''organisation ne peut pas PUBLIER le module demandé. Point de '
  'passage unique des huit RPC de transition et du trigger de publication : '
  'aucune d''elles ne réimplémente la règle. Ne garde QUE la publication — '
  'retirer, mettre en pause ou archiver n''exige aucun droit, un commerçant '
  'sans abonnement devant pouvoir arrêter ce qu''il a lancé.';

revoke all on function public.assert_module_publish_allowed(uuid, text)
  from public, anon, authenticated;
grant execute on function public.assert_module_publish_allowed(uuid, text)
  to service_role;

-- ============================================================
-- 3. FERMETURE DES COLONNES DE PUBLICATION
--
-- Deux gestes différents pour deux situations différentes — voir le piège (a)
-- de l'en-tête. Se tromper de geste ici produit une révocation qui ne révoque
-- rien, sans le moindre avertissement de Postgres.
-- ============================================================

-- ── 3a. Grant TABLE-WIDE : révoquer la table, puis re-grant colonne à
--        colonne. `revoke update (status)` seul serait un NO-OP ici.
revoke update on public.campaigns from authenticated;
grant update (
  id, organization_id, name, starts_at, ends_at, created_at, engagement,
  collect_email, collect_phone, code_ttl_seconds, auto_schedule,
  budget_cents, budget_spent_cents, paused_reason
) on public.campaigns to authenticated;

revoke update on public.event_games from authenticated;
grant update (id, organization_id, name, created_at, updated_at)
  on public.event_games to authenticated;

-- ── 3b. Grants déjà par colonne : la révocation colonne suffit et mord.
revoke update (status) on public.hunts             from authenticated;
revoke update (status) on public.calendars         from authenticated;
revoke update (status) on public.loyalty_programs  from authenticated;
revoke update (status) on public.quizzes           from authenticated;
revoke update (status) on public.jackpot_campaigns from authenticated;
revoke update (enabled) on public.referral_programs from authenticated;

-- `contests.status` était déjà révoqué (20260721150000:399) et `event_sessions`
-- n'a jamais reçu `update(status)` : rien à faire pour ces deux-là côté UPDATE.

-- ============================================================
-- 4. LE TRIGGER — la porte d'à côté (INSERT), et le filet de l'UPDATE
--
-- Pourquoi un trigger EN PLUS des révocations : `insert(status)` reste
-- accordé, et doit le rester. `duplicateCampaign` et `applyCampaignTemplate`
-- insèrent explicitement `status: 'draft'` ; révoquer `insert(status)` les
-- casserait pour fermer un trou que le trigger ferme sans rien casser, parce
-- qu'il ne regarde QUE les valeurs publiées.
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
  -- ARMÉ POUR LE SEUL PORTEUR D'UN JWT MARCHAND, et l'en-tête dit pourquoi :
  -- le seed insère des lignes publiées en tant que `postgres` (aucun JWT) et
  -- les crons écrivent en service_role. Armer pour tous casserait le seed,
  -- donc tous les E2E, avec un échec sans rapport visible avec sa cause.
  if coalesce((select auth.role()), '') <> 'authenticated' then
    return new;
  end if;

  -- Lecture générique par jsonb : la même fonction sert une colonne texte
  -- (`status`) et une colonne booléenne (`enabled`, qui se lit 'true'/'false').
  v_new := pg_catalog.to_jsonb(new) ->> v_column;

  -- Retrait, pause, archivage : jamais gardés. Voir l'en-tête — on ne bloque
  -- pas quelqu'un qui veut cesser d'utiliser.
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
  perform public.assert_module_publish_allowed(v_org, v_module);
  return new;
end;
$$;

comment on function public.guard_module_publication() is
  'Trigger de publication : refuse qu''une ligne atteigne un état PUBLIÉ sans '
  'le droit du module. Arguments : (module, colonne, valeurs publiées). '
  'Ferme la porte de l''INSERT, que les révocations de la section 3 laissent '
  'ouverte à dessein (duplication et modèles de campagne insèrent status=draft). '
  'ARMÉ UNIQUEMENT POUR auth.role() = ''authenticated'' : le seed insère des '
  'lignes publiées sans JWT et les crons écrivent en service_role, les armer '
  'ferait échouer le seed et tous les E2E. Ne garde ni le retour en arrière, '
  'ni une écriture qui ne change pas l''état de publication.';

revoke all on function public.guard_module_publication()
  from public, anon, authenticated;

drop trigger if exists campaigns_guard_publication on public.campaigns;
create trigger campaigns_guard_publication
  before insert or update on public.campaigns
  for each row execute function public.guard_module_publication('wheel', 'status', '{active}');

drop trigger if exists hunts_guard_publication on public.hunts;
create trigger hunts_guard_publication
  before insert or update on public.hunts
  for each row execute function public.guard_module_publication('hunts', 'status', '{active}');

drop trigger if exists calendars_guard_publication on public.calendars;
create trigger calendars_guard_publication
  before insert or update on public.calendars
  for each row execute function public.guard_module_publication('calendar', 'status', '{active}');

drop trigger if exists loyalty_programs_guard_publication on public.loyalty_programs;
create trigger loyalty_programs_guard_publication
  before insert or update on public.loyalty_programs
  for each row execute function public.guard_module_publication('loyalty', 'status', '{active}');

drop trigger if exists quizzes_guard_publication on public.quizzes;
create trigger quizzes_guard_publication
  before insert or update on public.quizzes
  for each row execute function public.guard_module_publication('quiz', 'status', '{active}');

drop trigger if exists jackpot_campaigns_guard_publication on public.jackpot_campaigns;
create trigger jackpot_campaigns_guard_publication
  before insert or update on public.jackpot_campaigns
  for each row execute function public.guard_module_publication('jackpot', 'status', '{active}');

drop trigger if exists event_games_guard_publication on public.event_games;
create trigger event_games_guard_publication
  before insert or update on public.event_games
  for each row execute function public.guard_module_publication('events', 'status', '{active}');

drop trigger if exists referral_programs_guard_publication on public.referral_programs;
create trigger referral_programs_guard_publication
  before insert or update on public.referral_programs
  for each row execute function public.guard_module_publication('referral', 'enabled', '{true}');

-- `contests` : l'UPDATE était déjà fermé, mais `insert(status)` est accordé —
-- la porte était verrouillée et la fenêtre d'à côté grande ouverte.
drop trigger if exists contests_guard_publication on public.contests;
create trigger contests_guard_publication
  before insert or update on public.contests
  for each row execute function public.guard_module_publication('pronostics', 'status', '{active}');

-- ============================================================
-- 5. LES DEUX RPC EXISTANTES QUI NE TESTAIENT PAS LE DROIT
-- ============================================================

-- ── 5a. set_contest_status : corps repris VERBATIM de 20260721150000:317-391
--        (seule définition vivante, vérifiée dans pg_proc), plus l'appel à la
--        garde. C'était la meilleure porte du dépôt — matrice de transitions,
--        motif obligatoire, audit — et elle ne testait pourtant aucun droit de
--        module : `addon_pronostics` pouvait être éteint et l'abonnement
--        résilié, le championnat passait `active`.
create or replace function public.set_contest_status(
  p_organization_id uuid,
  p_contest_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_finalized timestamptz;
  v_needs_reason boolean := false;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'finished') then
    raise exception 'invalid status';
  end if;

  select c.status, c.finalized_at into v_current, v_finalized
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  if v_current = p_status then
    return true;
  end if;
  -- Un championnat clôturé (récompenses attribuées) ne bouge plus.
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  -- Transitions permises : draft↔active, active→finished,
  -- finished→active (réouverture motivée tant que non clôturé).
  if not (
    (v_current = 'draft' and p_status = 'active')
    or (v_current = 'active' and p_status in ('draft', 'finished'))
    or (v_current = 'finished' and p_status = 'active')
  ) then
    raise exception 'invalid transition';
  end if;

  -- AJOUT DE CE LOT. Placé APRÈS la matrice de transitions et non avant :
  -- un `finished → active` illégal doit continuer de s'annoncer comme une
  -- transition invalide, pas comme un défaut de droit, sinon le commerçant
  -- irait acheter un module pour débloquer un geste que le module ne
  -- débloque pas. Seule la publication est gardée : `active → draft` et
  -- `active → finished` restent ouverts sans droit.
  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'pronostics');
  end if;

  -- Motif obligatoire pour retirer un championnat en cours de route ou
  -- le rouvrir après l'avoir terminé.
  v_needs_reason := (v_current = 'finished' and p_status = 'active')
    or (v_current = 'active' and p_status = 'draft'
        and public.contest_is_locked(p_contest_id));
  if v_needs_reason
     and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10)
  then
    raise exception 'locked: reason required';
  end if;

  update public.contests
  set status = p_status
  where id = p_contest_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.status.update',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'previous', v_current,
      'next', p_status,
      'reason', case when v_needs_reason then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

comment on function public.set_contest_status(uuid,uuid,text,text) is
  'Transition de statut d''un championnat. Exige is_org_editor, et depuis ce '
  'lot le droit effectif « pronostics » (addon + abonnement) pour PUBLIER. '
  'Le droit est vérifié APRÈS la matrice de transitions, pour qu''une '
  'transition illégale continue de se nommer telle. Aucun droit exigé pour '
  'repasser en draft ou terminer.';

-- ── 5b. start_event_session : LA PIRE PORTE DU DÉPÔT.
--        C'est la vraie publication joueur d'un événement live
--        (`draft → lobby` = session joignable), elle est `grant execute … to
--        authenticated`, et elle ne testait QUE `is_org_editor` — aucun droit
--        de module ici, aucun dans `authorizeRemote`
--        (src/actions/events.ts:363-392). Ni base, ni application.
--        Corps repris verbatim de 20260727120000:633-666, plus la garde.
create or replace function public.start_event_session(
  p_organization_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  select s.* into v_session from public.event_sessions s
   where s.id = p_session_id and s.organization_id = p_organization_id
   for update of s;
  if not found or v_session.status not in ('draft', 'lobby') then
    return pg_catalog.jsonb_build_object('state', 'invalid_transition');
  end if;

  -- AJOUT DE CE LOT. Après la lecture de la session : une session
  -- inexistante ou déjà `live` doit rendre 'invalid_transition' comme avant,
  -- sans révéler l'état d'abonnement de l'organisation à qui interroge un
  -- identifiant au hasard.
  --
  -- LÈVE au lieu de rendre 'invalid_transition' : les deux refusent, mais
  -- confondre « votre module n'est pas actif » avec « cette session ne peut
  -- pas démarrer » enverrait l'organisateur chercher une panne technique un
  -- soir d'événement, devant sa salle, au lieu de lui nommer la cause.
  perform public.assert_module_publish_allowed(p_organization_id, 'events');

  update public.event_sessions
     set status = 'lobby', phase = 'lobby',
         current_question_id = null, current_question_started_at = null,
         prono_correct_option_id = null,
         started_at = coalesce(started_at, pg_catalog.now())
   where id = p_session_id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok', 'session_id', p_session_id, 'status', 'lobby', 'phase', 'lobby');
end;
$$;

comment on function public.start_event_session(uuid, uuid) is
  'Ouvre le lobby d''une session live (draft/lobby → lobby) : c''est la '
  'publication joueur d''un événement. Exige is_org_editor (ou service_role) '
  'et, depuis ce lot, le droit effectif « events ». Avant ce lot elle n''était '
  'gardée nulle part — ni en base, ni dans authorizeRemote. Les transitions '
  'suivantes (lobby → live → ended) ne sont PAS gardées : elles prolongent une '
  'publication déjà autorisée et les couper interromprait une session en cours.';

-- ============================================================
-- 6. LES HUIT RPC DE TRANSITION
--
-- Une par module, comme demandé, mais aucune ne porte la règle de sécurité :
-- toutes appellent `assert_module_publish_allowed`. Ce qui leur est propre est
-- ce qui diffère réellement — la table, la colonne, le vocabulaire de statut.
-- ============================================================

create or replace function public.set_campaign_status(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'paused', 'archived') then
    raise exception 'invalid status';
  end if;

  select c.status into v_current from public.campaigns c
   where c.id = p_campaign_id and c.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_status then return true; end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'wheel');
  end if;

  update public.campaigns set status = p_status
   where id = p_campaign_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, coalesce(auth.uid()::text, auth.role(), 'system'),
    'campaign.status.update',
    pg_catalog.jsonb_build_object('campaign_id', p_campaign_id,
      'previous', v_current, 'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')));
  return true;
end;
$$;

create or replace function public.set_hunt_status(
  p_organization_id uuid,
  p_hunt_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'archived') then
    raise exception 'invalid status';
  end if;

  select h.status into v_current from public.hunts h
   where h.id = p_hunt_id and h.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_status then return true; end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'hunts');
  end if;

  update public.hunts set status = p_status
   where id = p_hunt_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, coalesce(auth.uid()::text, auth.role(), 'system'),
    'hunt.status.update',
    pg_catalog.jsonb_build_object('hunt_id', p_hunt_id,
      'previous', v_current, 'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')));
  return true;
end;
$$;

create or replace function public.set_calendar_status(
  p_organization_id uuid,
  p_calendar_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'archived') then
    raise exception 'invalid status';
  end if;

  select c.status into v_current from public.calendars c
   where c.id = p_calendar_id and c.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_status then return true; end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'calendar');
  end if;

  update public.calendars set status = p_status
   where id = p_calendar_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, coalesce(auth.uid()::text, auth.role(), 'system'),
    'calendar.status.update',
    pg_catalog.jsonb_build_object('calendar_id', p_calendar_id,
      'previous', v_current, 'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')));
  return true;
end;
$$;

create or replace function public.set_loyalty_program_status(
  p_organization_id uuid,
  p_program_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'archived') then
    raise exception 'invalid status';
  end if;

  select l.status into v_current from public.loyalty_programs l
   where l.id = p_program_id and l.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_status then return true; end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'loyalty');
  end if;

  update public.loyalty_programs set status = p_status
   where id = p_program_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, coalesce(auth.uid()::text, auth.role(), 'system'),
    'loyalty.status.update',
    pg_catalog.jsonb_build_object('program_id', p_program_id,
      'previous', v_current, 'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')));
  return true;
end;
$$;

create or replace function public.set_quiz_status(
  p_organization_id uuid,
  p_quiz_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'archived') then
    raise exception 'invalid status';
  end if;

  select q.status into v_current from public.quizzes q
   where q.id = p_quiz_id and q.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_status then return true; end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'quiz');
  end if;

  update public.quizzes set status = p_status
   where id = p_quiz_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, coalesce(auth.uid()::text, auth.role(), 'system'),
    'quiz.status.update',
    pg_catalog.jsonb_build_object('quiz_id', p_quiz_id,
      'previous', v_current, 'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')));
  return true;
end;
$$;

create or replace function public.set_jackpot_campaign_status(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'archived') then
    raise exception 'invalid status';
  end if;

  select j.status into v_current from public.jackpot_campaigns j
   where j.id = p_campaign_id and j.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_status then return true; end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'jackpot');
  end if;

  update public.jackpot_campaigns set status = p_status
   where id = p_campaign_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, coalesce(auth.uid()::text, auth.role(), 'system'),
    'jackpot.status.update',
    pg_catalog.jsonb_build_object('campaign_id', p_campaign_id,
      'previous', v_current, 'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')));
  return true;
end;
$$;

create or replace function public.set_event_game_status(
  p_organization_id uuid,
  p_game_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'archived') then
    raise exception 'invalid status';
  end if;

  select g.status into v_current from public.event_games g
   where g.id = p_game_id and g.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_status then return true; end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'events');
  end if;

  update public.event_games set status = p_status
   where id = p_game_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, coalesce(auth.uid()::text, auth.role(), 'system'),
    'event_game.status.update',
    pg_catalog.jsonb_build_object('game_id', p_game_id,
      'previous', v_current, 'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')));
  return true;
end;
$$;

-- Le parrainage n'a pas de `status` : sa publication est un booléen.
create or replace function public.set_referral_program_enabled(
  p_organization_id uuid,
  p_program_id uuid,
  p_enabled boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_enabled is null then
    raise exception 'invalid status';
  end if;

  select r.enabled into v_current from public.referral_programs r
   where r.id = p_program_id and r.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_enabled then return true; end if;

  if p_enabled then
    perform public.assert_module_publish_allowed(p_organization_id, 'referral');
  end if;

  update public.referral_programs set enabled = p_enabled
   where id = p_program_id and organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, coalesce(auth.uid()::text, auth.role(), 'system'),
    'referral.enabled.update',
    pg_catalog.jsonb_build_object('program_id', p_program_id,
      'previous', v_current, 'next', p_enabled,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')));
  return true;
end;
$$;

comment on function public.set_campaign_status(uuid,uuid,text,text) is
  'Seule écriture possible de campaigns.status par un marchand (le grant '
  'table-wide UPDATE a été remplacé par un grant colonne sans status). Exige '
  'is_org_editor ou service_role ; exige en plus le droit effectif « wheel » '
  '(abonnement seul, pas d''addon) pour passer active. draft/paused/archived '
  'restent atteignables sans droit. '
  'CE N''EST PAS LE SEUL CHEMIN VERS campaigns.status = ''active'', et croire '
  'le contraire ici serait l''erreur : le cron run_campaign_schedule active en '
  'service_role toute campagne auto_schedule dont la fenêtre s''ouvre, sans '
  'lire aucun droit. Une planification armée avant la fin de l''abonnement '
  'démarre donc quand même. Non fermé délibérément — un refus en tâche de '
  'fond serait muet — voir l''en-tête de 20260905120000.';
comment on function public.set_hunt_status(uuid,uuid,text,text) is
  'Seule écriture possible de hunts.status par un marchand. Droit « hunts » '
  'exigé pour publier ; archiver ou repasser en brouillon reste libre.';
comment on function public.set_calendar_status(uuid,uuid,text,text) is
  'Seule écriture possible de calendars.status par un marchand. Droit '
  '« calendar » exigé pour publier ; archiver reste libre (le cron '
  'archiveElapsedCalendars écrit en service_role et n''est pas concerné).';
comment on function public.set_loyalty_program_status(uuid,uuid,text,text) is
  'Seule écriture possible de loyalty_programs.status par un marchand. Droit '
  '« loyalty » exigé pour publier.';
comment on function public.set_quiz_status(uuid,uuid,text,text) is
  'Seule écriture possible de quizzes.status par un marchand. Droit « quiz » '
  'exigé pour publier.';
comment on function public.set_jackpot_campaign_status(uuid,uuid,text,text) is
  'Seule écriture possible de jackpot_campaigns.status par un marchand. Droit '
  '« jackpot » exigé pour publier. NE POSE PAS public_slug : l''appelant qui '
  'active une campagne sans slug doit l''écrire AVANT (la colonne reste '
  'grantée), cette RPC ne touche que le statut.';
comment on function public.set_event_game_status(uuid,uuid,text,text) is
  'Seule écriture possible de event_games.status par un marchand. Droit '
  '« events » exigé pour publier. À ne pas confondre avec start_event_session, '
  'qui est la publication JOUEUR (ouverture du lobby).';
comment on function public.set_referral_program_enabled(uuid,uuid,boolean,text) is
  'Seule écriture possible de referral_programs.enabled par un marchand. Droit '
  '« referral » exigé pour allumer ; éteindre reste libre. NE TOUCHE QUE '
  '`enabled` : la configuration (récompenses, seuils, fenêtre) garde ses '
  'grants colonne et s''enregistre séparément.';

revoke all on function public.set_campaign_status(uuid,uuid,text,text) from public, anon;
grant execute on function public.set_campaign_status(uuid,uuid,text,text) to authenticated, service_role;
revoke all on function public.set_hunt_status(uuid,uuid,text,text) from public, anon;
grant execute on function public.set_hunt_status(uuid,uuid,text,text) to authenticated, service_role;
revoke all on function public.set_calendar_status(uuid,uuid,text,text) from public, anon;
grant execute on function public.set_calendar_status(uuid,uuid,text,text) to authenticated, service_role;
revoke all on function public.set_loyalty_program_status(uuid,uuid,text,text) from public, anon;
grant execute on function public.set_loyalty_program_status(uuid,uuid,text,text) to authenticated, service_role;
revoke all on function public.set_quiz_status(uuid,uuid,text,text) from public, anon;
grant execute on function public.set_quiz_status(uuid,uuid,text,text) to authenticated, service_role;
revoke all on function public.set_jackpot_campaign_status(uuid,uuid,text,text) from public, anon;
grant execute on function public.set_jackpot_campaign_status(uuid,uuid,text,text) to authenticated, service_role;
revoke all on function public.set_event_game_status(uuid,uuid,text,text) from public, anon;
grant execute on function public.set_event_game_status(uuid,uuid,text,text) to authenticated, service_role;
revoke all on function public.set_referral_program_enabled(uuid,uuid,boolean,text) from public, anon;
grant execute on function public.set_referral_program_enabled(uuid,uuid,boolean,text) to authenticated, service_role;
