-- ============================================================
-- LE COMMERÇANT GARDE LA MAIN, LES CHIFFRES DISENT VRAI (wagon 4)
--
-- Six constats, un seul fichier — et c'est délibéré : `set_campaign_status`
-- est écrit par DEUX d'entre eux (FIA-3 et FIA-6), un seul
-- `create or replace` porte les deux gestes. Deux migrations concurrentes se
-- seraient écrasées sans bruit, la seconde appliquée gagnant.
--
--   FIA-1. `start_event_session` ouvrait le lobby d'un jeu resté EN BROUILLON.
--          Elle lisait le statut de la SESSION, jamais celui du JEU : un jeu
--          vide et non publié rendait sa salle d'attente joignable par le
--          public. La garde se pose APRÈS `assert_module_publish_allowed`,
--          jamais avant — sinon un défaut de droit s'annoncerait en transition
--          invalide et l'organisateur irait chercher une panne technique un
--          soir d'événement.
--
--   FIA-3. Une pause MANUELLE repartait toute seule. `run_campaign_schedule`
--          (cron, dix minutes) réactive toute campagne `auto_schedule` dans sa
--          fenêtre dont le motif n'est pas `budget_reached` — et une pause à la
--          main n'en pose aucun. Le commerçant reprenait la main pour la perdre
--          au quart d'heure suivant. `set_campaign_status` DÉSARME désormais la
--          programmation sur `paused`, `draft` et `archived`.
--
--          Conséquence à assumer : ré-armer se fait à la main, dans
--          « Programmation et budget ». C'est la branche A de l'arbitrage — la
--          branche B (un motif `paused_reason = 'manual'`) demandait une
--          migration de contrainte, une valeur d'énumération et une quatrième
--          branche de bannière, et laissait « Restaurer en brouillon » ouvert.
--
--   FIA-6. `archived → active` passait sur la campagne alors que l'écran
--          n'offre que `archived → draft`. La matrice ne vise QUE la campagne :
--          six autres modules OFFRENT la republication depuis `archived`
--          (hunt-editor, calendar-editor, quiz-editor, loyalty-editor,
--          jackpot-editor, event-editor) — l'interdire partout casserait six
--          parcours légitimes. Cette permissivité cesse d'être une affirmation
--          de commentaire : elle est désormais ÉPINGLÉE par pgTAP comme un
--          choix (publication_guards.test.sql, section 9).
--
--   NUM-1. Les tuiles d'analytique comptaient des ÉVÉNEMENTS en promettant des
--          PERSONNES. Deux volets ci-dessous, et le premier casse une série —
--          voir l'encadré.
--
--   IDX-1. Six clés étrangères sans index de tête. Constat STATIQUE : aucun
--          EXPLAIN, aucun benchmark n'a été joué, et aucun gain n'est annoncé
--          nulle part. Un index de FK manquant se démontre par lecture ; c'est
--          suffisant pour agir, pas pour chiffrer.
--
--   CNT-1. Les deux RPC de pagination sont `grant execute … to authenticated`,
--          donc appelables directement en PostgREST : un plafond posé en
--          TypeScript ne les couvre pas. L'offset est borné en base.
--
-- ── POURQUOI NUM-1 SE RÉPARE VERS L'AVANT, SANS BACKFILL ──
--
-- Les clés d'idempotence de `experience_started` / `experience_completed`
-- étaient centrées sur le joueur et l'expérience, SANS date
-- (`activity:start:campaign:<id>:<joueur>`). Un joueur qui revenait tous les
-- jours pendant un mois ne comptait qu'UNE entrée, à vie, tandis que la vue —
-- seule clé déjà datée (20260805160000:484-485) — en comptait trente. Le taux
-- de transformation affiché s'effondrait mécaniquement avec l'âge de la
-- cohorte, et le conseiller commerçant criait sur une animation qui tournait.
--
-- Les quatre émissions sont datées ici au fuseau de l'organisation. La rupture
-- est ASSUMÉE et n'est pas rattrapable : `append_experience_event_internal`
-- insère en `on conflict do nothing` (20260805160000:424), les lignes déjà
-- écrites gardent leur clé, et rien ne permet de reconstituer les journées
-- qu'elles ont absorbées. AVANT ce fichier : un `start` par joueur À VIE.
-- APRÈS : un par joueur et par JOUR LOCAL. Les périodes antérieures et
-- postérieures ne sont PAS comparables — c'est écrit ici, dans l'ADR du wagon
-- et dans docs/bugs.md.
--
-- Le second volet est purement ADDITIF et n'attend rien du premier : trois
-- compteurs de PERSONNES (`unique_viewers`, `unique_starters`,
-- `unique_finishers`) rejoignent `views`/`starts`/`completions`, qui restent.
-- Aucun compteur n'est retiré : les deux lectures sont légitimes, et c'est
-- l'écran qui doit dire laquelle il montre.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. FIA-1 · `start_event_session` LIT ENFIN LE STATUT DU JEU
-- ════════════════════════════════════════════════════════════
--
-- Corps repris VERBATIM de 20260905120000:546-591 (définition vivante), plus
-- la lecture du jeu. Les quatre transitions suivantes — `launch_event_question`,
-- `lock_event_question`, `reveal_event_question`, `end_event_session` — ne sont
-- PAS touchées : elles prolongent une publication déjà autorisée, et les couper
-- interromprait une soirée en cours (raisonnement déjà écrit
-- 20260905120000:596-599).
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
  v_game_status text;
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

  -- Après la lecture de la session : une session inexistante ou déjà `live`
  -- doit rendre 'invalid_transition' comme avant, sans révéler l'état
  -- d'abonnement de l'organisation à qui interroge un identifiant au hasard.
  --
  -- LÈVE au lieu de rendre 'invalid_transition' : les deux refusent, mais
  -- confondre « votre module n'est pas actif » avec « cette session ne peut
  -- pas démarrer » enverrait l'organisateur chercher une panne technique un
  -- soir d'événement, devant sa salle, au lieu de lui nommer la cause.
  perform public.assert_module_publish_allowed(p_organization_id, 'events');

  -- AJOUT DU WAGON 4 (FIA-1), et sa place est le fond de l'affaire.
  --
  -- APRÈS la garde de droit, jamais avant : les deux `throws_ok` de
  -- publication_guards.test.sql:481-485 et :489-493 portent sur des
  -- organisations SANS le droit `events`, et attendent
  -- « module access required: events ». Poser la lecture du jeu plus haut leur
  -- ferait rendre 'invalid_transition' — le refus changerait de cause sans que
  -- rien n'ait changé du problème du commerçant. Même ordre, même motif que
  -- `set_contest_status` (20260925120000:587-596).
  --
  -- `invalid_transition` et NON un `raise` : homogène avec la lecture de
  -- session ratée juste au-dessus, et ne révèle aucun état par le message. Le
  -- refus LISIBLE — celui qui nomme le geste (« Ouvrez le jeu aux joueurs
  -- avant de lancer une session en direct ») — vit dans la server action ;
  -- cette RPC est le filet du POST direct, et `runTransition` traduit
  -- 'invalid_transition' par « Transition impossible dans l'état actuel. »
  -- (src/actions/events.ts:443-445), qui ne nomme aucun geste.
  --
  -- `is distinct from` et non `<>` : un jeu supprimé entre-temps laisse
  -- v_game_status à NULL, et NULL doit refuser, pas laisser passer.
  select g.status into v_game_status
    from public.event_games g where g.id = v_session.game_id;
  if v_game_status is distinct from 'active' then
    return pg_catalog.jsonb_build_object('state', 'invalid_transition');
  end if;

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
  'publication joueur d''un événement. Exige is_org_editor (ou service_role), '
  'le droit effectif « events » (20260905120000) et, depuis 20260928120000 '
  '(FIA-1), un JEU PUBLIÉ — `event_games.status = ''active''`. Un jeu resté en '
  'brouillon rendait sa salle d''attente joignable par le public sans qu''aucune '
  'couche ne s''y oppose. Le refus est ''invalid_transition'' et non une '
  'exception : la RPC est le filet du POST direct, le refus qui NOMME le geste '
  'vit dans la server action. ORDRE IMPÉRATIF : la lecture du jeu vient APRÈS '
  'assert_module_publish_allowed, sinon un défaut de droit s''annoncerait en '
  'transition invalide. Les transitions suivantes (lobby → live → ended) ne '
  'sont toujours PAS gardées : elles prolongent une publication déjà autorisée '
  'et les couper interromprait une soirée en cours. Un jeu ARCHIVÉ dont une '
  'session est déjà en `lobby` reste pilotable — la garde ne porte que sur '
  'draft → lobby ; fermer les sessions vivantes d''un jeu clôturé est un AUTRE '
  'geste, consigné dans docs/bugs.md.';


-- ════════════════════════════════════════════════════════════
-- 2. FIA-3 + FIA-6 · `set_campaign_status`, UN SEUL create or replace
-- ════════════════════════════════════════════════════════════
--
-- Corps repris VERBATIM de 20260905120000:609-651, plus deux gestes qui
-- DOIVENT vivre dans la même définition : la matrice d'états et le désarmement
-- de la programmation. Les écrire dans deux migrations aurait fait perdre le
-- premier appliqué.
--
-- Deux appelants, tous deux applicatifs : src/actions/campaigns.ts:216 et :624.
-- Aucun cron, aucun service_role de production ne passe par ici — le
-- planificateur écrit `campaigns.status` par UPDATE direct en security definer
-- (20260723110000:206-234, définition vivante 20260926120000:121-205), donc
-- cette matrice ne peut pas le casser.
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
  -- FIA-3 : l'état AVANT, lu sous le même verrou que le statut.
  v_auto_avant boolean := false;
  -- FIA-3 : vrai quand la transition retire la campagne des joueurs ET qu'il y
  -- avait réellement quelque chose à désarmer.
  v_desarme boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'paused', 'archived') then
    raise exception 'invalid status';
  end if;

  -- `auto_schedule` lu DANS le même `select … for update` que le statut, et
  -- pas par une seconde lecture : la valeur qui décide de l'écriture doit être
  -- celle que le verrou protège, sinon deux transitions concurrentes
  -- pourraient auditer un effet qu'elles n'ont pas produit.
  select c.status, c.auto_schedule into v_current, v_auto_avant
    from public.campaigns c
   where c.id = p_campaign_id and c.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
  if v_current = p_status then return true; end if;

  -- AJOUT DU WAGON 4 (FIA-6) — LA MATRICE, ET ELLE NE VISE QUE LA CAMPAGNE.
  --
  -- Placée APRÈS le court-circuit idempotent et AVANT
  -- `assert_module_publish_allowed` : une transition illégale doit s'annoncer
  -- comme telle, pas se déguiser en défaut de module — sinon le commerçant va
  -- acheter un droit pour débloquer un geste que le droit ne débloque pas.
  -- Ordre calqué sur set_contest_status (20260925120000:579-585), motivé
  -- là-bas (:587-596).
  --
  -- UNE SEULE transition est fermée, et c'est la seule qu'aucun écran n'offre :
  -- `campaign-settings.tsx:36` ne propose que `archived → draft`. Les retours
  -- en arrière `active → draft` et `paused → draft` restent OUVERTS bien
  -- qu'aucun écran ne les offre non plus : ils ne PUBLIENT pas, ils dépublient,
  -- et la règle « le retour en arrière n'est jamais gardé » (20260905120000:78-83)
  -- existe pour ne pas enfermer un commerçant qui veut arrêter.
  if v_current = 'archived' and p_status = 'active' then
    raise exception 'invalid transition';
  end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'wheel');
  end if;

  -- AJOUT DU WAGON 4 (FIA-3) — LE DÉSARMEMENT, DANS LE MÊME UPDATE.
  --
  -- Une pause manuelle ne pose aucun `paused_reason`, et le planificateur
  -- n'épargne que `budget_reached` (20260926120000:130-133) : la campagne
  -- repartait seule au passage suivant du cron, en dix minutes au pire. Rien
  -- dans `updateCampaignSchema` (src/lib/validations/campaigns.ts:24-30) ne
  -- porte `auto_schedule`, donc l'écran de statut ne pouvait pas le désarmer.
  --
  -- Couvre les TROIS retraits, pas seulement la pause : « Restaurer en
  -- brouillon » et « Clôturer » avaient exactement le même défaut.
  -- `p_status = 'active'` reste intact, le trigger campaigns_clear_paused_reason
  -- (20260723110000:49-69) continuant d'y effacer le motif.
  --
  -- RIEN À CRAINDRE DU TRIGGER campaigns_guard_auto_schedule
  -- (20260906120000:242-245) : `guard_module_publication` sort dès que la
  -- valeur écrite n'est pas dans `{true}` (:160-162). Désarmer reste libre,
  -- y compris pour un commerçant dont le droit « wheel » est tombé — c'est
  -- exactement la population qui a besoin de pouvoir arrêter.
  --
  -- `v_auto_avant and …` et non `p_status in (…)` seul : sur une campagne dont
  -- la programmation était DÉJÀ éteinte, la transition ne désarme rien, et la
  -- métadonnée d'audit ci-dessous promet de dire ce qui s'est passé. Le prédicat
  -- décrit donc l'EFFET, pas l'intention.
  v_desarme := v_auto_avant and p_status in ('paused', 'draft', 'archived');

  update public.campaigns
     set status = p_status,
         auto_schedule = case when v_desarme then false else auto_schedule end
   where id = p_campaign_id and organization_id = p_organization_id;

  -- `v_desarme` et non `true` en dur : la métadonnée doit dire ce qui s'est
  -- passé. Une clé toujours vraie ne se relit pas — elle mentirait sur les
  -- publications, et aussi bien sur les retraits d'une campagne qui n'avait
  -- aucune programmation à éteindre.
  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (p_organization_id, coalesce(auth.uid()::text, auth.role(), 'system'),
    'campaign.status.update',
    pg_catalog.jsonb_build_object('campaign_id', p_campaign_id,
      'previous', v_current, 'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), ''),
      'auto_schedule_disarmed', v_desarme));
  return true;
end;
$$;

comment on function public.set_campaign_status(uuid,uuid,text,text) is
  'Transition de statut d''une campagne. Exige is_org_editor (ou service_role) '
  'et le droit « wheel » pour publier. Depuis 20260928120000 elle porte deux '
  'gestes de plus. (1) FIA-6, LA MATRICE : `archived → active` lève '
  '« invalid transition ». Elle ne vise QUE la campagne, et c''est un choix '
  'mesuré — six autres écrans OFFRENT la republication depuis `archived` '
  '(hunt-editor.tsx:677, calendar-editor.tsx:895, quiz-editor.tsx:175, '
  'loyalty-editor.tsx:884, jackpot-editor.tsx:546, event-editor.tsx:124) ; '
  'l''interdire partout casserait six parcours légitimes. Cette permissivité '
  'n''est plus seulement affirmée par un commentaire (20260905120000:91-95) : '
  'publication_guards.test.sql section 9 l''ÉPINGLE, module par module, comme '
  'un choix qu''on verra bouger si quelqu''un le change. Les dépublications '
  '`active → draft` et `paused → draft` restent libres bien qu''aucun écran ne '
  'les offre : elles ne publient pas. (2) FIA-3, LE DÉSARMEMENT : `paused`, '
  '`draft` et `archived` posent `auto_schedule = false` dans le MÊME update. '
  'Sans cela une pause manuelle repartait seule en dix minutes, le '
  'planificateur n''épargnant que `budget_reached`. Contrepartie assumée : '
  'ré-armer est un geste manuel, dans « Programmation et budget », et les '
  'boutons de la carte Statut le disent.';


-- ════════════════════════════════════════════════════════════
-- 3. NUM-1 (a) · LES QUATRE ÉMISSIONS DATÉES
-- ════════════════════════════════════════════════════════════
--
-- QUATRE, et non une. L'audit ne désignait que `track_experience_activity` ;
-- `experience_completed` a en réalité TROIS émetteurs (20260805160000:675,
-- :798 et :857) et `experience_started` un quatrième point d'émission dans la
-- même fonction. N'en dater qu'un aurait laissé le défaut intact sur la chasse,
-- le championnat, le quiz, le calendrier et la soirée live — cinq modules
-- vertueusement « corrigés » et toujours faux.
--
-- Les corps sont repris VERBATIM de 20260805160000 (définitions vivantes,
-- aucune redéfinition ultérieure : vérifié par grep sur les 131 migrations).
-- Les triggers ne sont PAS recréés : `create or replace function` conserve
-- l'oid, donc les dix `create trigger … execute function` de 20260805160000
-- continuent de pointer sur ces définitions-ci.


create or replace function public.track_experience_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_experience_id uuid;
  v_organization_id uuid;
  v_player_key text;
  v_player_row_id uuid;
  v_occurred_at timestamptz;
  v_complete boolean := false;
  v_source text := 'unknown';
  -- AJOUT DU WAGON 4 (NUM-1). Fuseau du commerce, et JOUR LOCAL qui en découle.
  v_timezone text;
  v_local_day date;
begin
  case tg_table_name
    when 'spins' then
      v_kind := 'campaign';
      v_experience_id := new.campaign_id;
      v_organization_id := new.organization_id;
      v_player_key := new.player_key;
      v_occurred_at := new.created_at;
      v_complete := true;
      v_source := case
        when new.source = 'share' then 'share'
        when new.source = 'referral' then 'referral'
        else 'direct'
      end;
    when 'hunt_scans' then
      v_kind := 'hunt';
      v_experience_id := new.hunt_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.scanned_at;
      select token_hash into v_player_key
        from public.hunt_players where id = new.player_id;
    when 'loyalty_stamps' then
      v_kind := 'loyalty';
      v_experience_id := new.program_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.member_id;
      v_occurred_at := new.stamped_at;
      v_complete := true;
      select token_hash into v_player_key
        from public.loyalty_members where id = new.member_id;
    when 'jackpot_participants' then
      v_kind := 'jackpot';
      v_experience_id := new.campaign_id;
      v_organization_id := new.organization_id;
      v_player_key := new.player_token_hash;
      v_occurred_at := new.created_at;
      v_complete := true;
    when 'event_answers' then
      v_kind := 'event';
      v_experience_id := new.session_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.answered_at;
      select token_hash into v_player_key
        from public.event_players where id = new.player_id;
    when 'calendar_openings' then
      v_kind := 'calendar';
      v_experience_id := new.calendar_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.opened_at;
      select token_hash into v_player_key
        from public.calendar_players where id = new.player_id;
      select p.opened_count >= c.day_count
        into v_complete
        from public.calendar_players p
        join public.calendars c
          on c.id = p.calendar_id
         and c.organization_id = p.organization_id
       where p.id = new.player_id;
    when 'contest_predictions' then
      v_kind := 'contest';
      v_experience_id := new.contest_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.created_at;
      select token_hash into v_player_key
        from public.contest_players where id = new.player_id;
    when 'quiz_answers' then
      v_kind := 'quiz';
      v_experience_id := new.quiz_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.started_at;
      select token_hash into v_player_key
        from public.quiz_players where id = new.player_id;
    when 'referral_sponsors' then
      v_kind := 'referral';
      v_organization_id := new.organization_id;
      v_player_key := new.sponsor_key;
      v_occurred_at := new.created_at;
      v_source := 'share';
      select id into v_experience_id
        from public.referral_programs
       where campaign_id = new.campaign_id
         and organization_id = new.organization_id;
    when 'referral_signups' then
      v_kind := 'referral';
      v_organization_id := new.organization_id;
      v_player_key := new.filleul_key;
      v_occurred_at := new.created_at;
      v_source := 'referral';
      v_complete := true;
      select id into v_experience_id
        from public.referral_programs
       where campaign_id = new.campaign_id
         and organization_id = new.organization_id;
    else
      return new;
  end case;

  -- AJOUT DU WAGON 4 (NUM-1) — LE JOUR LOCAL DE L'ÉVÉNEMENT.
  --
  -- `coalesce` posé ICI et pas seulement dans la clé : c'est exactement ce que
  -- fait `append_experience_event_internal` sur `occurred_at`
  -- (20260805160000:422). Deux coalesce indépendants dériveraient le jour d'une
  -- date et la ligne d'une autre, à une milliseconde de minuit.
  --
  -- Fuseau lu comme dans `track_player_experience_membership`
  -- (20260805160000:449-453) : c'est LE fuseau de référence des journées de ce
  -- journal, et la vue est déjà datée avec lui (:484-485). Un second fuseau
  -- ferait compter les vues et les parties sur deux calendriers différents.
  v_occurred_at := coalesce(v_occurred_at, pg_catalog.now());
  select coalesce(timezone, 'Europe/Paris')
    into v_timezone
    from public.organizations
   where id = v_organization_id;
  v_local_day := (v_occurred_at at time zone coalesce(v_timezone, 'Europe/Paris'))::date;

  perform public.append_experience_event_internal(
    v_organization_id,
    'experience_started',
    v_kind,
    v_experience_id,
    v_player_key,
    null,
    v_source,
    null,
    -- CLÉ DATÉE (NUM-1) : un `start` par joueur et par JOUR LOCAL, là où la
    -- clé sans date n'en comptait qu'un À VIE. Aucun backfill n'est possible —
    -- voir l'en-tête du fichier.
    'activity:start:' || v_kind || ':' || v_experience_id::text || ':'
      || coalesce(v_player_key, v_player_row_id::text) || ':'
      || pg_catalog.to_char(v_local_day, 'YYYYMMDD'),
    v_occurred_at
  );
  if v_complete then
    perform public.append_experience_event_internal(
      v_organization_id,
      'experience_completed',
      v_kind,
      v_experience_id,
      v_player_key,
      null,
      v_source,
      null,
      'activity:complete:' || v_kind || ':' || v_experience_id::text || ':'
        || coalesce(v_player_key, v_player_row_id::text) || ':'
        || pg_catalog.to_char(v_local_day, 'YYYYMMDD'),
      v_occurred_at
    );
  end if;
  return new;
exception
  when others then
    return new;
end;
$$;

create or replace function public.track_experience_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_experience_id uuid;
  v_organization_id uuid;
  v_player_key text;
  v_player_row_id uuid;
  v_occurred_at timestamptz;
  -- AJOUT DU WAGON 4 (NUM-1), même geste que dans track_experience_activity.
  v_timezone text;
  v_local_day date;
begin
  case tg_table_name
    when 'hunt_completions' then
      v_kind := 'hunt';
      v_experience_id := new.hunt_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.completed_at;
      select token_hash into v_player_key
        from public.hunt_players where id = new.player_id;
    when 'contest_final_standings' then
      v_kind := 'contest';
      v_experience_id := new.contest_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.created_at;
      select token_hash into v_player_key
        from public.contest_players where id = new.player_id;
    when 'quiz_players' then
      if new.finished_at is null
        or (tg_op = 'UPDATE' and old.finished_at is not null)
      then
        return new;
      end if;
      v_kind := 'quiz';
      v_experience_id := new.quiz_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.id;
      v_player_key := new.token_hash;
      v_occurred_at := new.finished_at;
    when 'calendar_players' then
      if tg_op <> 'UPDATE' or new.opened_count <= old.opened_count then
        return new;
      end if;
      if not exists (
        select 1
          from public.calendars
         where id = new.calendar_id
           and organization_id = new.organization_id
           and new.opened_count >= day_count
           and old.opened_count < day_count
      ) then
        return new;
      end if;
      v_kind := 'calendar';
      v_experience_id := new.calendar_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.id;
      v_player_key := new.token_hash;
      v_occurred_at := pg_catalog.now();
    else
      return new;
  end case;

  -- AJOUT DU WAGON 4 (NUM-1). Cette fonction porte les complétions de la
  -- CHASSE, du CHAMPIONNAT, du QUIZ et du CALENDRIER : ne dater que
  -- track_experience_activity aurait reproduit le défaut sur quatre modules,
  -- et c'est la correction n° 5 apportée à l'audit.
  v_occurred_at := coalesce(v_occurred_at, pg_catalog.now());
  select coalesce(timezone, 'Europe/Paris')
    into v_timezone
    from public.organizations
   where id = v_organization_id;
  v_local_day := (v_occurred_at at time zone coalesce(v_timezone, 'Europe/Paris'))::date;

  perform public.append_experience_event_internal(
    v_organization_id,
    'experience_completed',
    v_kind,
    v_experience_id,
    v_player_key,
    null,
    'unknown',
    null,
    'activity:complete:' || v_kind || ':' || v_experience_id::text || ':'
      || coalesce(v_player_key, v_player_row_id::text) || ':'
      || pg_catalog.to_char(v_local_day, 'YYYYMMDD'),
    v_occurred_at
  );
  return new;
exception
  when others then
    return new;
end;
$$;

create or replace function public.track_event_session_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player record;
  -- AJOUT DU WAGON 4 (NUM-1). Quatrième et dernière émission datée : une même
  -- salle qui rejoue le lendemain ne doit plus se faire absorber par la
  -- première soirée.
  v_occurred_at timestamptz;
  v_timezone text;
  v_local_day date;
begin
  if new.status <> 'ended' or old.status = 'ended' then
    return new;
  end if;

  v_occurred_at := coalesce(new.ended_at, pg_catalog.now());
  select coalesce(timezone, 'Europe/Paris')
    into v_timezone
    from public.organizations
   where id = new.organization_id;
  v_local_day := (v_occurred_at at time zone coalesce(v_timezone, 'Europe/Paris'))::date;

  for v_player in
    select distinct p.id, p.token_hash
      from public.event_players p
      join public.event_answers a
        on a.player_id = p.id
       and a.session_id = p.session_id
       and a.organization_id = p.organization_id
     where p.session_id = new.id
       and p.organization_id = new.organization_id
  loop
    perform public.append_experience_event_internal(
      new.organization_id,
      'experience_completed',
      'event',
      new.id,
      v_player.token_hash,
      null,
      'unknown',
      null,
      'activity:complete:event:' || new.id::text || ':'
        || v_player.token_hash || ':'
        || pg_catalog.to_char(v_local_day, 'YYYYMMDD'),
      v_occurred_at
    );
  end loop;
  return new;
exception
  when others then
    return new;
end;
$$;

-- ACL réémises à l'identique. `create or replace` les conserve — mais trois
-- émetteurs de journal qui ne doivent être appelables par PERSONNE ne se
-- vérifient pas dans un autre fichier.
revoke all on function public.track_experience_activity()
  from public, anon, authenticated, service_role;
revoke all on function public.track_experience_completion()
  from public, anon, authenticated, service_role;
revoke all on function public.track_event_session_completion()
  from public, anon, authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- 4. NUM-1 (b) · L'AGRÉGAT COMPTE AUSSI DES PERSONNES
-- ════════════════════════════════════════════════════════════
--
-- Volet ADDITIF, indépendant du précédent : il corrige le LIBELLÉ (l'écran
-- promettait des personnes et montrait des événements) là où les clés datées
-- corrigent la MESURE. Aucun compteur existant n'est retiré, la signature ne
-- bouge pas — la RPC rend du `jsonb`
-- (src/types/database.generated.ts:7315-7318, `Returns: Json`), donc aucune
-- régénération de types n'est due pour ce fichier.
--
-- Corps repris VERBATIM de 20260805160000:1051-1234.


create or replace function public.org_experience_analytics(
  p_organization_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
  v_result jsonb;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  v_since := pg_catalog.now()
    - pg_catalog.make_interval(
        days => least(greatest(coalesce(p_days, 30), 1), 365)
      );

  with filtered as (
    select *
      from public.experience_events
     where organization_id = p_organization_id
       and occurred_at >= v_since
  ),
  names as (
    select 'campaign'::text as kind, id, name
      from public.campaigns where organization_id = p_organization_id
    union all
    select 'hunt', id, name
      from public.hunts where organization_id = p_organization_id
    union all
    select 'loyalty', id, name
      from public.loyalty_programs where organization_id = p_organization_id
    union all
    select 'jackpot', id, name
      from public.jackpot_campaigns where organization_id = p_organization_id
    union all
    select
      'event',
      s.id,
      g.name || coalesce(' · ' || nullif(s.label, ''), '')
      from public.event_sessions s
      join public.event_games g
        on g.id = s.game_id and g.organization_id = s.organization_id
     where s.organization_id = p_organization_id
    union all
    select 'calendar', id, name
      from public.calendars where organization_id = p_organization_id
    union all
    select 'referral', r.id, 'Parrainage · ' || c.name
      from public.referral_programs r
      join public.campaigns c
        on c.id = r.campaign_id and c.organization_id = r.organization_id
     where r.organization_id = p_organization_id
    union all
    select 'contest', id, name
      from public.contests where organization_id = p_organization_id
    union all
    select 'quiz', id, name
      from public.quizzes where organization_id = p_organization_id
  ),
  per_experience as (
    select
      e.experience_kind,
      e.experience_id,
      coalesce(max(n.name), 'Expérience supprimée') as experience_name,
      count(*) filter (where event_name = 'experience_viewed') as views,
      count(*) filter (where event_name = 'experience_joined') as joins,
      count(*) filter (where event_name = 'experience_started') as starts,
      count(*) filter (where event_name = 'experience_completed') as completions,
      count(*) filter (where event_name = 'reward_issued') as rewards_issued,
      count(*) filter (where event_name = 'reward_claimed') as rewards_claimed,
      count(*) filter (where event_name = 'reward_redeemed') as rewards_redeemed,
      count(distinct coalesce(player_id::text, player_key))
        filter (where event_name = 'player_returned') as returning_players,
      count(*) filter (where event_name = 'experience_shared') as shares,
      count(distinct coalesce(player_id::text, player_key)) as unique_players,
      -- AJOUT DU WAGON 4 (NUM-1) — TROIS COMPTEURS DE PERSONNES.
      --
      -- Additifs : `views`, `starts` et `completions` restent, et restent des
      -- comptages d'ÉVÉNEMENTS. C'est à l'écran de dire lequel il montre, pas
      -- au SQL de choisir pour lui — « 120 ouvertures » et « 40 personnes »
      -- sont deux faits vrais, et le second était simplement absent.
      --
      -- LE PIÈGE DU `coalesce`, à connaître avant de lire ces chiffres :
      -- `player_id` (uuid du registre joueur) et `player_key` (SHA-256 d'un
      -- jeton appareil legacy) sont DEUX ESPACES DE NOMS distincts
      -- (20260805160000:42-46). Le même individu compte pour un seul dès lors
      -- que la résolution d'identité a eu lieu — c'est
      -- `append_experience_event_internal` qui la joue (:382-393), et le pont
      -- legacy rattache après coup ses orphelines. Tant qu'elle n'a pas eu
      -- lieu, une même personne peut apparaître sous ses deux identifiants.
      count(distinct coalesce(player_id::text, player_key))
        filter (where event_name = 'experience_viewed') as unique_viewers,
      count(distinct coalesce(player_id::text, player_key))
        filter (where event_name = 'experience_started') as unique_starters,
      count(distinct coalesce(player_id::text, player_key))
        filter (where event_name = 'experience_completed') as unique_finishers,
      count(basket_cents)
        filter (where event_name = 'reward_redeemed') as basket_observations,
      coalesce(sum(basket_cents)
        filter (where event_name = 'reward_redeemed'), 0) as basket_revenue_cents,
      count(reward_cost_cents)
        filter (where event_name = 'reward_redeemed') as reward_cost_observations,
      coalesce(sum(reward_cost_cents)
        filter (where event_name = 'reward_redeemed'), 0) as reward_cost_cents,
      count(*) filter (
        where event_name = 'reward_redeemed'
          and basket_cents is not null
          and reward_cost_cents is not null
      ) as margin_observations,
      coalesce(sum(basket_cents - reward_cost_cents) filter (
        where event_name = 'reward_redeemed'
          and basket_cents is not null
          and reward_cost_cents is not null
      ), 0) as attributable_margin_cents
    from filtered e
    left join names n
      on n.kind = e.experience_kind and n.id = e.experience_id
    group by e.experience_kind, e.experience_id
  ),
  per_source as (
    select
      source,
      count(*) filter (where event_name = 'experience_viewed') as views,
      count(*) filter (where event_name = 'experience_started') as starts,
      count(*) filter (where event_name = 'experience_completed') as completions,
      count(*) filter (where event_name = 'reward_redeemed') as rewards_redeemed,
      count(basket_cents)
        filter (where event_name = 'reward_redeemed') as basket_observations,
      coalesce(sum(basket_cents)
        filter (where event_name = 'reward_redeemed'), 0) as basket_revenue_cents
    from filtered
    group by source
  )
  select pg_catalog.jsonb_build_object(
    'period_days', least(greatest(coalesce(p_days, 30), 1), 365),
    'total_events', (select count(*) from filtered),
    'summary', pg_catalog.jsonb_build_object(
      'views', (select count(*) from filtered
        where event_name = 'experience_viewed'),
      'joins', (select count(*) from filtered
        where event_name = 'experience_joined'),
      'starts', (select count(*) from filtered
        where event_name = 'experience_started'),
      'completions', (select count(*) from filtered
        where event_name = 'experience_completed'),
      'rewards_issued', (select count(*) from filtered
        where event_name = 'reward_issued'),
      'rewards_claimed', (select count(*) from filtered
        where event_name = 'reward_claimed'),
      'rewards_redeemed', (select count(*) from filtered
        where event_name = 'reward_redeemed'),
      'returning_players', (select count(distinct coalesce(player_id::text, player_key))
        from filtered where event_name = 'player_returned'),
      'shares', (select count(*) from filtered
        where event_name = 'experience_shared'),
      'unique_players', (select count(distinct coalesce(player_id::text, player_key))
        from filtered),
      -- Les mêmes trois compteurs qu'en `per_experience`, au niveau de
      -- l'organisation. Les deux blocs DOIVENT bouger ensemble : l'écran lit le
      -- premier pour ses tuiles et le second pour son tableau, et une
      -- divergence s'y lirait comme une incohérence du produit.
      'unique_viewers', (select count(distinct coalesce(player_id::text, player_key))
        from filtered where event_name = 'experience_viewed'),
      'unique_starters', (select count(distinct coalesce(player_id::text, player_key))
        from filtered where event_name = 'experience_started'),
      'unique_finishers', (select count(distinct coalesce(player_id::text, player_key))
        from filtered where event_name = 'experience_completed'),
      'basket_observations', (select count(basket_cents)
        from filtered where event_name = 'reward_redeemed'),
      'basket_revenue_cents', (select coalesce(sum(basket_cents), 0)
        from filtered where event_name = 'reward_redeemed'),
      'reward_cost_observations', (select count(reward_cost_cents)
        from filtered where event_name = 'reward_redeemed'),
      'reward_cost_cents', (select coalesce(sum(reward_cost_cents), 0)
        from filtered where event_name = 'reward_redeemed'),
      'margin_observations', (select count(*)
        from filtered
       where event_name = 'reward_redeemed'
         and basket_cents is not null
         and reward_cost_cents is not null),
      'attributable_margin_cents', (select coalesce(
          sum(basket_cents - reward_cost_cents), 0
        )
        from filtered
       where event_name = 'reward_redeemed'
         and basket_cents is not null
         and reward_cost_cents is not null)
    ),
    'experiences', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(p) order by p.starts desc, p.views desc,
          p.experience_name
      )
      from per_experience p
    ), '[]'::jsonb),
    'sources', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(s) order by s.views desc, s.source
      )
      from per_source s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.org_experience_analytics(uuid,integer)
  from public, anon;
grant execute on function public.org_experience_analytics(uuid,integer)
  to authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- 5. IDX-1 · SIX CLÉS ÉTRANGÈRES SANS INDEX DE TÊTE
-- ════════════════════════════════════════════════════════════
--
-- Constat STATIQUE, et il faut le dire ici comme il est dit dans l'ADR : rien
-- n'a été mesuré. Ni EXPLAIN, ni benchmark. Ce qui est établi, c'est qu'aucun
-- index ne mène de ces six colonnes vers leur table — et un `on delete
-- cascade` comme un `count(*) … where fk = …` balaient alors la table entière.
-- Cela suffit pour poser six index ; cela ne suffit pas pour annoncer un gain,
-- et aucun chiffre ne sera écrit nulle part.
--
-- SIX, et le périmètre est celui des colonnes VÉRIFIÉES une par une. Le
-- recensement « 38 FK sans index » de l'audit n'a pas été rejoué, et sa seule
-- désignation contrôlée s'est révélée FAUSSE : `contest_awards.contest_id` est
-- servi par `unique (contest_id, rank)` (20260721150000:531), et
-- `contest_awards.organization_id` par `contest_awards_org_idx` (:539). Élargir
-- au-delà de ce qui a été lu serait une décision de périmètre déguisée en
-- évidence.
--
-- PAS DE `create index concurrently`, et ce n'est pas un oubli : zéro
-- occurrence sur les 131 migrations du dossier, parce que le CLI Supabase
-- applique chaque fichier DANS UNE TRANSACTION, où `concurrently` est illégal.
-- La « correction proposée » de l'audit est fautive sur ce point — elle aurait
-- fait échouer `db reset` comme `db push`.
--
-- Patron du dépôt : 00019:619-626 (`create index if not exists`, nom
-- `<table>_<colonnes>_idx`).

-- `spins` ne portait que quatre index — (wheel_id, player_key, created_at),
-- (organization_id), (wheel_id, player_key, play_window_key) et
-- (idempotency_key) — et AUCUN sur ses deux autres clés étrangères. Or
-- `org_campaign_stats` (00019:635-636) compte les spins PAR CAMPAGNE : c'est le
-- chemin le plus chaud du tableau de bord.
create index if not exists spins_campaign_idx
  on public.spins (campaign_id);
-- Sert aussi la suppression d'un lot : `prizes … on delete set null`
-- (00002_spins.sql:13) doit retrouver les spins qui le désignent.
create index if not exists spins_prize_idx
  on public.spins (prize_id);
-- `participations` en portait cinq (00001:113-115 et 00019:619-622), aucun sur
-- `prize_id`. Même chemin, même geste.
create index if not exists participations_prize_idx
  on public.participations (prize_id);
-- Les trois FK réellement découvertes du module Pronostics. `contest_awards`
-- porte `unique (contest_id, player_id)` : le couple existe, mais son index de
-- tête est `contest_id` — rien ne mène de `player_id` vers la table, et c'est
-- pourtant par lui que cascade la suppression d'un joueur.
create index if not exists contest_awards_player_idx
  on public.contest_awards (player_id);
-- `contest_final_standings` : PK `(contest_id, player_id)`, même asymétrie.
create index if not exists contest_final_standings_player_idx
  on public.contest_final_standings (player_id);
-- Et son `organization_id`, seule des trois tables du module à ne pas avoir son
-- index d'organisation (contest_awards a le sien depuis 20260721150000:539).
create index if not exists contest_final_standings_org_idx
  on public.contest_final_standings (organization_id);


-- ════════════════════════════════════════════════════════════
-- 6. CNT-1 · L'OFFSET EST BORNÉ EN BASE, PAS SEULEMENT À L'ÉCRAN
-- ════════════════════════════════════════════════════════════
--
-- Les deux RPC sont `grant execute … to authenticated` (00019:713 et
-- 20260923120000:745) : un clamp posé dans `parsePageParam` ne les couvre pas,
-- il couvre l'écran. Le plafond est CONSTANT — 500 pages — parce que le seul
-- plafond « juste » (`ceil(total / pageSize)`) suppose un total exact que la
-- moitié TypeScript du même constat fait justement disparaître. Les deux
-- moitiés de la correction proposée par l'audit étaient en tension ; une
-- constante est le seul chemin cohérent.
--
-- Corps repris VERBATIM de 20260923120000 (définitions vivantes), sans `drop
-- function` : la signature ne change pas, et `customer_profiles_page.test.sql`
-- vérifie précisément qu'il n'existe QU'UNE entrée `pg_proc` pour la seconde.


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
  -- AJOUT DU WAGON 4 (CNT-1) — L'OFFSET AUSSI EST PLAFONNÉ.
  --
  -- `p_limit` l'était depuis toujours, `p_offset` ne l'a jamais été : un
  -- `p_offset` démesuré fait matérialiser puis JETER l'union entière, pour
  -- rendre zéro ligne. La forme est celle du clamp d'à côté — repli
  -- SILENCIEUX, sans exception : c'est la convention du dépôt pour un
  -- paramètre d'URL hors domaine (module-list-filters.tsx:61-63, un `p_tri`
  -- inconnu ou une date mal formée retombent sur le défaut), et une page
  -- demandée trop loin n'est pas une erreur, juste une page vide.
  --
  -- 500 est LE plafond de pages, LE MÊME que celui de `parsePageParam` côté
  -- TypeScript (src/lib, wagon 4 · lot backend), et 100 est le plafond de
  -- `p_limit` juste au-dessus : le produit borne l'offset à 500 pages pleines,
  -- quelle que soit la taille de page demandée. Les deux chiffres doivent
  -- bouger ensemble ou pas du tout.
  v_offset := least(greatest(coalesce(p_offset, 0), 0), 500 * 100);

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
  -- AJOUT DU WAGON 4 (CNT-1) — `v_offset > 500 * v_limit`.
  --
  -- L'offset n'avait qu'un plancher. Cette RPC est `grant execute … to
  -- authenticated` (20260923120000:917) : ce n'est pas l'écran qui choisit
  -- `p_offset`, c'est le client, et un `?page=1000000` recopié dans la barre
  -- d'adresse suffisait à faire trier puis jeter la liste entière.
  --
  -- 500 est LE plafond de pages du produit, et il vaut la même chose partout :
  -- CINQ sites en SQL — `org_qr_hub` et cette fonction, plus les trois offsets
  -- des deux RPC de classement en section 7 — et `parsePageParam` côté
  -- TypeScript, qui en couvre six écrans. Une valeur, six lieux, aucune
  -- variante : c'est ce qui permet de la faire bouger d'un seul geste.
  -- Il est multiplié par la limite EFFECTIVE, déjà bornée à 100 juste
  -- au-dessous : 500 pages de la taille demandée, jamais 500 pages d'une
  -- taille imaginaire.
  --
  -- LÈVE ici, là où `org_qr_hub` replie en silence, et la différence est celle
  -- des deux fonctions, pas un oubli : celle-ci possédait déjà son
  -- « invalid pagination » pour les limites hors domaine, et une pagination
  -- qui refuse par exception ne doit pas se mettre à replier sans rien dire
  -- pour un seul de ses trois paramètres.
  if v_offset < 0 or v_limit < 1 or v_limit > 100
     or v_offset > 500 * v_limit then
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


-- ════════════════════════════════════════════════════════════
-- 7. CNT-1 (suite) · LES DEUX CLASSEMENTS AUSSI
-- ════════════════════════════════════════════════════════════
--
-- Ajout de la REVUE SÉCURITÉ du wagon (M-1). Les deux RPC de pagination du hub
-- n'étaient pas les seules à n'avoir qu'un plancher d'offset : les deux
-- classements publics — championnat et quiz — portent exactement le même motif,
-- `greatest(coalesce(p_offset, 0), 0)`, et sont l'un comme l'autre
-- `grant execute … to authenticated`. Corriger la moitié d'un défaut identique
-- sur quatre fonctions, c'est laisser deux portes ouvertes en croyant la maison
-- fermée.
--
-- Ces deux-là coûtent plus cher que les précédentes à l'appel : un offset
-- démesuré ne saute pas des lignes déjà là, il fait CALCULER le classement
-- entier — agrégats par joueur, `rank() over`, `count(*) over` — avant de tout
-- jeter. C'est ce calcul que la borne évite.
--
-- Corps repris VERBATIM des définitions VIVANTES (20260723100000:260-396 pour
-- le championnat, cette définition-là ayant droppé la signature à trois
-- arguments ; 20260803120000:1937-2016 pour le quiz), à une différence près :
-- la limite et l'offset passent par deux variables calculées une seule fois.
-- `contest_leaderboard` a DEUX sorties — le palmarès figé d'un championnat
-- clôturé et le classement vivant — et elles doivent recevoir la même borne.
--
-- REPLI SILENCIEUX ici, exception dans `org_customer_profiles_page` : la
-- différence est délibérée. Un classement se lit aussi depuis une page
-- PUBLIQUE, sans écran de tableau de bord pour porter un « invalid
-- pagination » ; et ces deux fonctions rendent déjà zéro ligne, sans rien dire,
-- pour un championnat inconnu ou un appelant non habilité. Une exception y
-- serait le seul message distinctif de la fonction, donc un oracle.


create or replace function public.contest_leaderboard(
  p_contest_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_league_id uuid default null
)
returns table (
  player_id uuid,
  first_name text,
  avatar text,
  email text,
  total_points integer,
  exact_count integer,
  diff_count integer,
  prediction_count integer,
  rank bigint,
  total_players bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_exact integer;
  v_diff integer;
  v_answer integer;
  v_finalized timestamptz;
  -- AJOUT DU WAGON 4 (CNT-1, moitié « classements »). La limite et l'offset
  -- sont calculés UNE fois et servis aux DEUX sorties — le palmarès figé et le
  -- classement vivant. Recopier l'expression à deux endroits, c'est se donner
  -- rendez-vous avec une divergence : le correctif ne serait posé que sur la
  -- branche qu'on avait sous les yeux.
  v_limit integer;
  v_offset integer;
begin
  select c.organization_id,
         coalesce(nullif(c.scoring->>'exact', '')::integer, 3),
         coalesce(nullif(c.scoring->>'diff', '')::integer, 2),
         c.tiebreaker_answer,
         c.finalized_at
    into v_org, v_exact, v_diff, v_answer, v_finalized
    from public.contests c
   where c.id = p_contest_id;
  if v_org is null then
    return; -- championnat inconnu : zéro ligne, pas d'oracle d'existence
  end if;

  -- Serveur (pages publiques) ou propriétaire (dashboard) : les emails
  -- des joueurs font partie de la réponse, réservée à ces deux rôles.
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_owner(v_org)
  ) then
    raise exception 'not authorized';
  end if;

  -- BORNES DE PAGINATION (CNT-1). `p_limit` était plafonné à 500 depuis
  -- toujours, `p_offset` n'avait qu'un PLANCHER — et cette RPC est
  -- `grant execute … to authenticated` (20260723100000:400), donc appelable
  -- directement en PostgREST : ce n'est pas l'écran qui choisit l'offset, c'est
  -- le client. Un `p_offset` démesuré faisait calculer le classement complet,
  -- fenêtres de rang comprises, pour n'en rendre aucune ligne.
  --
  -- Calculées APRÈS la garde, comme dans `org_qr_hub` : la fonction est
  -- `security definer`, et rien — pas même deux entiers — ne se fait avant
  -- qu'on sache qui appelle.
  --
  -- 500 pages de la taille demandée, la MÊME constante que les deux RPC de
  -- pagination du hub et que `parsePageParam` côté TypeScript. Repli
  -- SILENCIEUX, comme `org_qr_hub` : une page demandée trop loin n'est pas une
  -- erreur, juste une page vide — et un classement public n'a pas d'écran pour
  -- porter une exception.
  v_limit  := greatest(least(coalesce(p_limit, 50), 500), 0);
  v_offset := least(greatest(coalesce(p_offset, 0), 0), 500 * v_limit);

  -- Ligue inconnue ou d'un autre championnat : zéro ligne (même
  -- politique que le championnat inconnu, pas d'oracle).
  if p_league_id is not null and not exists (
    select 1 from public.contest_leagues l
     where l.id = p_league_id and l.contest_id = p_contest_id
  ) then
    return;
  end if;

  -- Championnat clôturé : le palmarès photographié fait foi (rangs
  -- uniques, tirage compris) — plus aucun recalcul. En ligue, on
  -- re-numérote ce palmarès sur les seuls membres.
  if v_finalized is not null then
    return query
    select s.player_id, pl.first_name, coalesce(pl.avatar, '') as avatar,
           pl.email, s.total_points, s.exact_count, s.diff_count,
           (select count(pr.player_id)::integer
              from public.contest_predictions pr
             where pr.contest_id = p_contest_id
               and pr.player_id = s.player_id
               and pr.points is not null) as prediction_count,
           case when p_league_id is null then s.rank::bigint
                else (row_number() over (order by s.rank asc))::bigint
           end as rank,
           (count(*) over ())::bigint as total_players
      from public.contest_final_standings s
      join public.contest_players pl on pl.id = s.player_id
     where s.contest_id = p_contest_id
       and (p_league_id is null or exists (
             select 1 from public.contest_league_members lm
              where lm.league_id = p_league_id
                and lm.player_id = s.player_id))
     order by s.rank asc
     limit v_limit
    offset v_offset;
    return;
  end if;

  return query
  with base as (
    select pl.id,
           pl.first_name,
           coalesce(pl.avatar, '') as avatar,
           pl.email,
           pl.created_at,
           case
             when v_answer is null or pl.tiebreaker_guess is null then null
             else pg_catalog.abs(pl.tiebreaker_guess - v_answer)
           end as tiebreaker_delta,
           coalesce(sum(pr.points), 0)::integer as total_points,
           (count(*) filter (where pr.points = v_exact))::integer as exact_count,
           (count(*) filter (where pr.points = v_diff))::integer as diff_count,
           count(pr.player_id)::integer as prediction_count
      from public.contest_players pl
      left join public.contest_predictions pr
        on pr.contest_id = pl.contest_id
       and pr.player_id = pl.id
       and pr.points is not null
     where pl.contest_id = p_contest_id
       and pl.accepted_terms = true
       and (p_league_id is null or exists (
             select 1 from public.contest_league_members lm
              where lm.league_id = p_league_id
                and lm.player_id = pl.id))
     group by pl.id, pl.first_name, pl.avatar, pl.email, pl.created_at,
              pl.tiebreaker_guess
  ),
  ranked as (
    select b.*,
           rank() over (
             order by b.total_points desc,
                      b.exact_count desc,
                      b.diff_count desc,
                      b.tiebreaker_delta asc nulls last
           ) as rnk,
           count(*) over () as total
      from base b
  )
  select r.id, r.first_name, r.avatar, r.email, r.total_points,
         r.exact_count, r.diff_count, r.prediction_count, r.rnk, r.total
    from ranked r
   order by r.rnk asc, r.created_at asc, r.id asc
   limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.quiz_leaderboard(
  p_quiz_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  player_id uuid,
  first_name text,
  avatar text,
  score integer,
  correct_count integer,
  total_elapsed_ms bigint,
  finished_at timestamptz,
  rank bigint,
  total_players bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_status text;
  v_addon boolean;
  -- AJOUT DU WAGON 4 (CNT-1, moitié « classements »).
  v_limit integer;
  v_offset integer;
begin
  select q.organization_id, q.status, o.addon_quiz
    into v_org, v_status, v_addon
    from public.quizzes q
    join public.organizations o on o.id = q.organization_id
   where q.id = p_quiz_id;
  if v_org is null then
    return; -- quiz inconnu : zéro ligne, pas d'oracle d'existence
  end if;
  -- Non habilité : ZÉRO LIGNE, comme un quiz inconnu — la réponse doit être
  -- INDISTINGUABLE dans les deux cas, sinon une exception « not authorized »
  -- prouverait à elle seule qu'un quiz existe sous cet id (oracle d'existence
  -- inter-tenant).
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(v_org)
  ) then
    return;
  end if;
  -- Défense en profondeur du chemin PUBLIC (service_role) : le module doit être
  -- souscrit et le quiz actif. Les appelants le vérifient déjà
  -- (loadQuizActionContext / loadQuizPublicContext) ; on ne s'en remet pas à
  -- eux. Un MEMBRE reste libre de consulter le classement d'un quiz en pause ou
  -- archivé — c'est le bilan de son opération.
  if coalesce(auth.role(), '') = 'service_role'
     and (not coalesce(v_addon, false) or v_status <> 'active') then
    return;
  end if;

  -- BORNES DE PAGINATION (CNT-1), jumelles de celles de `contest_leaderboard` —
  -- ce classement-ci est d'ailleurs calqué sur l'autre, jusqu'au `rank()`. Le
  -- plafond de `p_limit` existait, celui de `p_offset` non, et la RPC est
  -- `grant execute … to authenticated` (20260803120000:2023). Repli SILENCIEUX,
  -- 500 pages de la taille demandée, la même constante que partout ailleurs
  -- dans ce wagon. Posées APRÈS les trois gardes, pour la même raison que dans
  -- son jumeau : rien avant qu'on sache qui appelle.
  v_limit  := greatest(least(coalesce(p_limit, 50), 500), 0);
  v_offset := least(greatest(coalesce(p_offset, 0), 0), 500 * v_limit);

  return query
  with ranked as (
    select p.id,
           p.first_name,
           p.avatar,
           p.score,
           p.correct_count,
           p.total_elapsed_ms,
           p.finished_at,
           p.created_at,
           pg_catalog.rank() over (
             order by p.score desc, p.total_elapsed_ms asc
           ) as rnk,
           pg_catalog.count(*) over () as total
      from public.quiz_players p
     where p.quiz_id = p_quiz_id
       and p.finished_at is not null
  )
  select r.id, r.first_name, r.avatar, r.score, r.correct_count,
         r.total_elapsed_ms, r.finished_at, r.rnk, r.total
    from ranked r
   order by r.rnk asc, r.created_at asc, r.id asc
   limit v_limit
  offset v_offset;
end;
$$;
