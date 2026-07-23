-- ============================================================
-- Lastchance — Module « Mode événement en direct »
--
-- Addon d'organisation (miroir EXACT d'addon_jackpot / addon_loyalty /
-- addon_hunts) : une expérience SYNCHRONISÉE entre un écran public (TV d'un
-- bar), les téléphones des joueurs et une télécommande organisateur. La BASE
-- détient la VÉRITÉ ; le transport temps réel (broadcast / polling) est géré
-- par le backend à partir de event_public_state, JAMAIS ici.
--
-- Séparation CONTENU / RUN :
--   · event_games       = le CONTENU réutilisable (un jeu de questions) ;
--   · event_sessions    = un DÉROULÉ live d'un game (un bar peut rejouer le
--     même quiz un autre soir → une nouvelle session, join_code neuf).
--
-- Moteur « question » générique, 3 types (question_type) :
--   · quiz  : bonne réponse PRÉDÉFINIE (une option is_correct=true) ;
--             score = correct × rapidité ;
--   · poll  : sondage — AUCUNE bonne réponse, AUCUN score, on affiche la
--             répartition des votes ;
--   · prono : bonne réponse INCONNUE à l'avance, désignée par l'organisateur
--             À LA RÉVÉLATION (reveal_event_question p_correct_option_id) ;
--             score = correct × rapidité.
--
-- INVARIANTS DE SÉCURITÉ (critiques) :
--   1. La bonne réponse ne fuit JAMAIS pendant qu'une question est active.
--      event_question_options.is_correct (et, pour prono, l'option désignée)
--      n'est lisible que par les MEMBRES de l'org (dashboard) et le
--      service_role. AUCUN accès anon. La lecture publique (écran/téléphone)
--      passe par la RPC event_public_state qui EXCLUT toute correction tant que
--      la phase n'est pas 'reveal'.
--   2. Scoring SERVEUR-AUTORITATIF sur le temps. L'instant de lancement
--      (event_sessions.current_question_started_at) est posé = now() par
--      launch_event_question. submit_event_answer calcule
--      elapsed_ms = now() - started_at (JAMAIS une valeur du client) et refuse
--      toute réponse hors fenêtre (phase ≠ question_active, autre question
--      courante, délai dépassé). Les points sont calculés au reveal à partir de
--      cet elapsed_ms stocké côté serveur.
--   3. Une seule réponse par (session, question, joueur) — contrainte unique,
--      immuable une fois commitée (aucun UPDATE joueur ; is_correct/points_
--      awarded ne sont écrits que par reveal_event_question, définer).
--
-- Récompense : podium à l'écran (toujours) + lot fini remis en caisse (code
--   EVENT-…, miroir JACKPOT-/redeem_jackpot_prize). Stock FINI OBLIGATOIRE
--   (ADR-031) : end_event_session n'émet jamais plus de codes qu'il ne reste de
--   stock. Le podium seul suffit si reward_stock = 0.
--
-- Parcours PUBLIC à IP PARTAGÉE (Wi-Fi du bar) — RAPPEL ADR-032 : join et
--   submit sont des chemins publics servis par le service_role. Le backend ne
--   doit PAS poser de rate-limit fail-closed sur une clé partagée (l'IP du bar
--   est commune à tous les joueurs) : la borne d'abus est l'identité cookie
--   (token_hash) et les contraintes d'unicité en base (un joueur par session,
--   une réponse par question), pas un interrupteur global.
--
-- Sécurité (même modèle que Jackpot / Fidélité / Chasse / Pronostics) :
--   · AUCUN droit anon ; parcours public via service_role uniquement ;
--   · gestion commerçant (CRUD games/questions/options + machine à états)
--     sous RLS is_org_member (lecture) / is_org_editor (écriture) ;
--   · écritures joueur uniquement via RPC service_role ;
--   · remise en caisse par redeem_event_prize (miroir redeem_jackpot_prize) ;
--   · purge RGPD purge_expired_event_sessions (à brancher au cron purge-data).
-- ============================================================

-- ── Addon d'organisation ─────────────────────────────────────
alter table public.organizations
  add column addon_events boolean not null default false;

-- `organizations` utilise des grants de colonnes (00017) : une colonne ajoutée
-- ensuite n'est pas lisible automatiquement par authenticated.
grant select (addon_events) on public.organizations to authenticated;

comment on column public.organizations.addon_events is
  'Module Mode événement en direct activé depuis le back-office (option payante, ou incluse dans un plan)';

-- ── Jeux (CONTENU réutilisable) ──────────────────────────────
create table public.event_games (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Support des FK composites tenant (même modèle que jackpot / loyalty).
  unique (id, organization_id)
);

comment on table public.event_games is
  'Contenu réutilisable d''un mode événement : un jeu de questions (quiz / sondage / pronostic). Rejoué via une nouvelle event_session à chaque soirée.';

create index event_games_org_idx on public.event_games (organization_id);

-- ── Questions ────────────────────────────────────────────────
create table public.event_questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position integer not null check (position >= 0),
  question_type text not null default 'quiz'
    check (question_type in ('quiz', 'poll', 'prono')),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 500),
  -- Fenêtre de réponse (bornée serveur). Le score de rapidité décroît sur cette
  -- durée ; hors fenêtre, submit_event_answer refuse.
  time_limit_seconds integer not null default 20
    check (time_limit_seconds between 5 and 300),
  points_base integer not null default 1000
    check (points_base between 0 and 100000),
  -- Média pour un futur blind-test (audio/vidéo). Nullable et NON exploité en
  -- V1 : réservé pour éviter une migration ultérieure.
  media_url text
    check (media_url is null or char_length(media_url) <= 2048),
  created_at timestamptz not null default now(),
  unique (game_id, position),
  -- FK composites tenant : options et réponses ciblent (id, organization_id).
  unique (id, organization_id),
  foreign key (game_id, organization_id)
    references public.event_games(id, organization_id) on delete cascade
);

comment on table public.event_questions is
  'Question d''un jeu : quiz (bonne réponse prédéfinie), poll (sondage sans score) ou prono (bonne réponse désignée au reveal). points_base + bonus de rapidité borné par time_limit_seconds.';

create index event_questions_org_idx on public.event_questions (organization_id);
create index event_questions_game_idx on public.event_questions (game_id, position);

-- ── Options de réponse ───────────────────────────────────────
-- CONFIDENTIALITÉ (invariant #1) : is_correct n'est JAMAIS exposé au public
-- avant reveal. La colonne est lisible par les membres de l'org (édition du
-- contenu) et le service_role ; la lecture publique passe par
-- event_public_state qui l'exclut tant que phase ≠ 'reveal'.
create table public.event_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position integer not null check (position >= 0),
  label text not null check (char_length(btrim(label)) between 1 and 200),
  -- quiz : exactement une option true (non contraint en base — validé côté app,
  -- comme les autres modules). poll : toutes false. prono : toutes false à la
  -- création ; l'organisateur désigne la gagnante au reveal (session.prono_
  -- correct_option_id), is_correct reste false.
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, position),
  -- FK composite tenant : les réponses ciblent (id, organization_id).
  unique (id, organization_id),
  foreign key (question_id, organization_id)
    references public.event_questions(id, organization_id) on delete cascade
);

comment on table public.event_question_options is
  'Option de réponse. is_correct (quiz) N''EST JAMAIS lisible par le public avant reveal : réservé aux membres de l''org et au service_role ; event_public_state l''exclut avant la phase reveal.';

create index event_question_options_org_idx on public.event_question_options (organization_id);
create index event_question_options_question_idx
  on public.event_question_options (question_id, position);

-- ── Sessions (un DÉROULÉ live d'un game) ─────────────────────
create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Étiquette libre de la soirée (« Vendredi 20h ») — facultative.
  label text check (label is null or char_length(label) <= 120),
  -- Code court d'accès (QR / URL), alphabet sans ambiguïté (sans I/O/0/1).
  -- Posé par le trigger event_sessions_set_join_code (SECURITY DEFINER) si
  -- absent ; les fixtures peuvent en fournir un déterministe.
  join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status text not null default 'draft'
    check (status in ('draft', 'lobby', 'live', 'ended', 'archived')),
  -- Phase live pilotée par la machine à états organisateur.
  phase text not null default 'lobby'
    check (phase in ('lobby', 'question_active', 'question_locked',
                     'reveal', 'leaderboard', 'ended')),
  -- Question courante et son instant de lancement SERVEUR (fait foi pour le
  -- scoring de rapidité). RPC-only (launch/lock/reveal). FK simple colonne
  -- (pas composite) : ON DELETE SET NULL ne peut nuller organization_id (NOT
  -- NULL). La cohérence tenant est garantie par les RPC (question du même org).
  current_question_id uuid references public.event_questions(id) on delete set null,
  current_question_started_at timestamptz,
  -- prono : option gagnante désignée par l'organisateur au reveal de la
  -- question courante. RPC-only.
  prono_correct_option_id uuid
    references public.event_question_options(id) on delete set null,
  -- Récompense : lot fini remis en caisse (code EVENT-…). VERROU ÉCONOMIQUE
  -- (ADR-031) : stock FINI et OBLIGATOIRE. 0 = podium seul, aucun code émis.
  reward_label text not null default ''
    check (char_length(btrim(reward_label)) <= 120),
  reward_details text
    check (reward_details is null or char_length(reward_details) <= 2000),
  reward_stock integer not null check (reward_stock >= 0),
  -- Codes déjà émis (end_event_session uniquement) : borne reward_stock.
  reward_claimed_count integer not null default 0
    check (reward_claimed_count >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  unique (id, organization_id),
  foreign key (game_id, organization_id)
    references public.event_games(id, organization_id) on delete cascade
);

comment on table public.event_sessions is
  'Déroulé live d''un game : join_code court, machine à états (status × phase), question courante + instant de lancement serveur (source de vérité du scoring). Lot fini EVENT-… remis en caisse. Parcours joueur via RPC service role uniquement.';
comment on column public.event_sessions.current_question_started_at is
  'Instant de lancement SERVEUR de la question courante (posé = now() par launch_event_question). Fait foi pour le score de rapidité : elapsed = answered_at - started_at, jamais une valeur du client.';
comment on column public.event_sessions.reward_stock is
  'Stock du lot — OBLIGATOIRE et FINI (ADR-031) : nombre maximal de gagnants récompensés par un code EVENT-…. end_event_session n''émet jamais au-delà. 0 = podium seul.';

create index event_sessions_org_idx on public.event_sessions (organization_id);
create index event_sessions_game_idx on public.event_sessions (game_id);

-- ── Joueurs (identité cookie, hash du jeton — pseudo/avatar publics) ──
create table public.event_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Hash SHA-256 du jeton cookie HTTP-only (miroir jackpot / loyalty).
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Pseudo saisi, affiché au classement (public). Validé 1..24.
  pseudo text not null check (char_length(btrim(pseudo)) between 1 and 24),
  -- Clé d'avatar du catalogue applicatif (src/lib/avatars) — miroir
  -- contest_players.avatar. Vide = avatar par défaut.
  avatar text not null default ''
    check (avatar = '' or avatar ~ '^[a-z]{1,20}$'),
  -- Score cumulé dénormalisé, maintenu par reveal_event_question uniquement.
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  unique (session_id, token_hash),
  -- FK composite tenant pour event_answers (id, session_id, organization_id).
  unique (id, session_id, organization_id),
  foreign key (session_id, organization_id)
    references public.event_sessions(id, organization_id) on delete cascade
);

comment on table public.event_players is
  'Joueur d''une session, créé au join : hash de jeton (aucune PII sensible) + pseudo/avatar PUBLICS (classement écran). score cumulé maintenu par reveal_event_question.';

create index event_players_org_idx on public.event_players (organization_id);
create index event_players_session_idx on public.event_players (session_id);

-- ── Réponses (une par (session, question, joueur), immuable) ──
create table public.event_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  question_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null,
  option_id uuid not null,
  answered_at timestamptz not null default now(),
  -- Délai SERVEUR (now() - started_at) figé au submit. Source du bonus de
  -- rapidité calculé au reveal. Jamais fourni par le client.
  elapsed_ms integer not null check (elapsed_ms >= 0),
  -- Écrits uniquement par reveal_event_question (0 tant que non révélé).
  points_awarded integer not null default 0 check (points_awarded >= 0),
  is_correct boolean not null default false,
  -- Invariant #3 : une seule réponse par joueur et par question.
  unique (session_id, question_id, player_id),
  foreign key (session_id, organization_id)
    references public.event_sessions(id, organization_id) on delete cascade,
  foreign key (question_id, organization_id)
    references public.event_questions(id, organization_id) on delete cascade,
  foreign key (player_id, session_id, organization_id)
    references public.event_players(id, session_id, organization_id) on delete cascade,
  foreign key (option_id, organization_id)
    references public.event_question_options(id, organization_id) on delete cascade
);

comment on table public.event_answers is
  'Réponse d''un joueur à une question : option choisie + elapsed_ms serveur (figé au submit). is_correct et points_awarded restent nuls jusqu''au reveal, qui les calcule. Unicité (session, question, joueur) — immuable.';

create index event_answers_org_idx on public.event_answers (organization_id);
create index event_answers_question_idx on public.event_answers (session_id, question_id);
create index event_answers_player_idx on public.event_answers (player_id);

-- ── Gains (podium récompensé, code EVENT-…) ──────────────────
create table public.event_wins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rank integer not null check (rank >= 1),
  -- Hash du jeton du gagnant (aucune PII, survit à la purge des joueurs).
  winner_token_hash text not null check (winner_token_hash ~ '^[0-9a-f]{64}$'),
  -- Code de retrait présenté en caisse. Même alphabet que JACKPOT-/GAIN-…
  -- (sans I/O/0/1), préfixe distinct EVENT- pour le routage caisse.
  code text not null unique check (code ~ '^EVENT-[A-HJ-NP-Z2-9]{8}$'),
  redeemed_at timestamptz,
  redeemed_by text check (redeemed_by is null or char_length(redeemed_by) <= 120),
  created_at timestamptz not null default now(),
  -- Un seul gagnant par rang dans une session : fige le podium.
  unique (session_id, rank),
  foreign key (session_id, organization_id)
    references public.event_sessions(id, organization_id) on delete cascade
);

comment on table public.event_wins is
  'Gagnant récompensé d''une session (rang du podium) : code de retrait EVENT-… remis via redeem_event_prize. Hash de jeton uniquement — registre anonyme qui survit à la purge des joueurs.';

create index event_wins_org_idx on public.event_wins (organization_id);
create index event_wins_session_idx on public.event_wins (session_id);

-- ── RLS et grants ────────────────────────────────────────────
alter table public.event_games enable row level security;
alter table public.event_questions enable row level security;
alter table public.event_question_options enable row level security;
alter table public.event_sessions enable row level security;
alter table public.event_players enable row level security;
alter table public.event_answers enable row level security;
alter table public.event_wins enable row level security;

revoke all on table public.event_games from public, anon, authenticated;
revoke all on table public.event_questions from public, anon, authenticated;
revoke all on table public.event_question_options from public, anon, authenticated;
revoke all on table public.event_sessions from public, anon, authenticated;
revoke all on table public.event_players from public, anon, authenticated;
revoke all on table public.event_answers from public, anon, authenticated;
revoke all on table public.event_wins from public, anon, authenticated;

-- Contenu (games / questions / options) : CRUD éditeurs, lecture d'équipe.
create policy "event_games: member select" on public.event_games
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "event_games: editor write" on public.event_games
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "event_questions: member select" on public.event_questions
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "event_questions: editor write" on public.event_questions
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "event_question_options: member select" on public.event_question_options
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "event_question_options: editor write" on public.event_question_options
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Sessions : lecture d'équipe ; création/édition par éditeurs. La machine à
-- états (status/phase/current/prono/reward_claimed_count) est portée par des
-- RPC SECURITY DEFINER : les grants de colonnes ci-dessous empêchent une
-- session marchande de la court-circuiter directement.
create policy "event_sessions: member select" on public.event_sessions
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "event_sessions: editor write" on public.event_sessions
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Données joueurs : lecture d'équipe (dashboard/stats), écritures service role.
create policy "event_players: member select" on public.event_players
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "event_answers: member select" on public.event_answers
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "event_wins: member select" on public.event_wins
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Contenu : CRUD complet côté éditeur (is_correct inclus — c'est l'auteur du
-- quiz qui pose la bonne réponse ; jamais exposé au public, cf. RPC).
grant select, insert, update, delete on table public.event_games to authenticated;
grant select, insert, update, delete on table public.event_questions to authenticated;
grant select, insert, update, delete on table public.event_question_options to authenticated;

-- Sessions : select complet (équipe) ; insert/update RESTREINTS aux colonnes
-- non pilotées par la machine à états. join_code posé par trigger ; status,
-- phase, current_question_id, current_question_started_at,
-- prono_correct_option_id, reward_claimed_count, started_at, ended_at sont
-- RPC-only (les RPC SECURITY DEFINER passent outre ces grants).
grant select on table public.event_sessions to authenticated;
grant insert (game_id, organization_id, label, join_code,
              reward_label, reward_details, reward_stock)
  on public.event_sessions to authenticated;
grant update (label, reward_label, reward_details, reward_stock)
  on public.event_sessions to authenticated;
grant delete on public.event_sessions to authenticated;

-- Données joueurs : lecture seule côté marchand.
grant select on table public.event_players to authenticated;
grant select on table public.event_answers to authenticated;
grant select on table public.event_wins to authenticated;

grant select, insert, update, delete on table public.event_games to service_role;
grant select, insert, update, delete on table public.event_questions to service_role;
grant select, insert, update, delete on table public.event_question_options to service_role;
grant select, insert, update, delete on table public.event_sessions to service_role;
grant select, insert, update, delete on table public.event_players to service_role;
grant select, insert, update, delete on table public.event_answers to service_role;
grant select, insert, update, delete on table public.event_wins to service_role;

-- Mutations commerçant auditées (miroir des autres modules).
create trigger event_games_merchant_audit
  after insert or update or delete on public.event_games
  for each row execute function public.audit_merchant_mutation();
create trigger event_sessions_merchant_audit
  after insert or update or delete on public.event_sessions
  for each row execute function public.audit_merchant_mutation();

-- ── Trigger : génération du join_code (service-authoritative) ─
-- BEFORE INSERT SECURITY DEFINER : alphabet sans ambiguïté, quelques tentatives
-- pour éviter une collision (la contrainte unique reste le filet). N'écrase pas
-- un code fourni (fixtures déterministes).
create or replace function public.event_sessions_set_join_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if new.join_code is not null then
    return new;
  end if;
  for attempt in 1..12 loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || pg_catalog.substr(
        v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
    end loop;
    if not exists (select 1 from public.event_sessions s where s.join_code = v_code) then
      new.join_code := v_code;
      return new;
    end if;
  end loop;
  raise exception 'event join code generation exhausted';
end;
$$;

revoke all on function public.event_sessions_set_join_code()
  from public, anon, authenticated;

create trigger event_sessions_set_join_code
  before insert on public.event_sessions
  for each row execute function public.event_sessions_set_join_code();

-- ============================================================
-- RPC parcours JOUEUR (service_role uniquement)
-- ============================================================

-- ── join_event_session ───────────────────────────────────────
-- Résout la session par join_code (statut lobby/live), crée/renvoie le joueur
-- (idempotent : re-join = même ligne, pseudo/avatar rafraîchis), valide
-- pseudo (1..24) et avatar (catalogue). Aucune correction n'est exposée ici.
create or replace function public.join_event_session(
  p_join_code text,
  p_player_token_hash text,
  p_pseudo text,
  p_avatar text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_player public.event_players%rowtype;
  v_pseudo text;
  v_avatar text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select s.* into v_session
    from public.event_sessions s
    join public.organizations o on o.id = s.organization_id
   where s.join_code = pg_catalog.upper(pg_catalog.btrim(coalesce(p_join_code, '')))
     and o.addon_events
   for update of s;
  -- Réponse 'unavailable' identique quel que soit le motif (code inconnu,
  -- addon coupé, session non ouverte) : pas d'oracle.
  if not found or v_session.status not in ('lobby', 'live') then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_pseudo := pg_catalog.btrim(coalesce(p_pseudo, ''));
  if pg_catalog.length(v_pseudo) < 1 or pg_catalog.length(v_pseudo) > 24 then
    return pg_catalog.jsonb_build_object('state', 'invalid_pseudo');
  end if;
  -- Avatar : coercition silencieuse vers défaut (chaîne vide) si hors catalogue.
  v_avatar := coalesce(p_avatar, '');
  if v_avatar <> '' and v_avatar !~ '^[a-z]{1,20}$' then
    v_avatar := '';
  end if;

  insert into public.event_players
    (session_id, organization_id, token_hash, pseudo, avatar)
  values (v_session.id, v_session.organization_id, p_player_token_hash, v_pseudo, v_avatar)
  on conflict (session_id, token_hash)
    do update set pseudo = excluded.pseudo, avatar = excluded.avatar
  returning * into v_player;

  return pg_catalog.jsonb_build_object(
    'state', 'joined',
    'player', pg_catalog.jsonb_build_object(
      'id', v_player.id, 'pseudo', v_player.pseudo,
      'avatar', v_player.avatar, 'score', v_player.score),
    'session', pg_catalog.jsonb_build_object(
      'id', v_session.id, 'status', v_session.status, 'phase', v_session.phase)
  );
end;
$$;

revoke all on function public.join_event_session(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.join_event_session(text, text, text, text)
  to service_role;

-- ── submit_event_answer ──────────────────────────────────────
-- Fenêtre serveur-autoritaire : n'accepte que si phase = 'question_active', la
-- question soumise = current_question_id, et now() est dans la fenêtre de temps
-- (now() - started_at <= time_limit). elapsed_ms figé côté serveur. La justesse
-- n'est PAS révélée ici (points/is_correct restent nuls → calculés au reveal).
create or replace function public.submit_event_answer(
  p_session_id uuid,
  p_question_id uuid,
  p_player_token_hash text,
  p_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_player public.event_players%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_limit_seconds integer;
  v_elapsed_ms bigint;
  v_inserted boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  -- Verrou de session : fige phase / current_question / started_at pendant la
  -- décision. Sérialise, ne rejette pas sur la clé partagée (ADR-032).
  select s.* into v_session
    from public.event_sessions s
   where s.id = p_session_id
   for update of s;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Fenêtre fermée : mauvaise phase, autre question courante, ou pas de start.
  if v_session.phase <> 'question_active'
     or v_session.current_question_id is distinct from p_question_id
     or v_session.current_question_started_at is null then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  select q.time_limit_seconds into v_limit_seconds
    from public.event_questions q
   where q.id = p_question_id and q.organization_id = v_session.organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  -- elapsed SERVEUR (jamais fourni par le client).
  v_elapsed_ms := pg_catalog.floor(
    extract(epoch from (v_now - v_session.current_question_started_at)) * 1000)::bigint;
  if v_elapsed_ms < 0 or v_elapsed_ms > v_limit_seconds::bigint * 1000 then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  -- Le joueur doit avoir rejoint (identité cookie). Pas de création implicite.
  select p.* into v_player
    from public.event_players p
   where p.session_id = p_session_id and p.token_hash = p_player_token_hash;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_joined');
  end if;

  -- L'option doit appartenir à la question courante (même tenant).
  if not exists (
    select 1 from public.event_question_options o
     where o.id = p_option_id
       and o.question_id = p_question_id
       and o.organization_id = v_session.organization_id) then
    return pg_catalog.jsonb_build_object('state', 'invalid_option');
  end if;

  -- Une seule réponse par (session, question, joueur) — immuable.
  insert into public.event_answers
    (session_id, question_id, organization_id, player_id, option_id, answered_at, elapsed_ms)
  values (p_session_id, p_question_id, v_session.organization_id, v_player.id,
          p_option_id, v_now, v_elapsed_ms::integer)
  on conflict (session_id, question_id, player_id) do nothing;
  v_inserted := found;
  if not v_inserted then
    return pg_catalog.jsonb_build_object('state', 'already_answered');
  end if;

  -- Accusé neutre : aucune information de justesse (invariant #1).
  return pg_catalog.jsonb_build_object('state', 'recorded');
end;
$$;

revoke all on function public.submit_event_answer(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_event_answer(uuid, uuid, text, uuid)
  to service_role;

-- ============================================================
-- RPC MACHINE À ÉTATS organisateur
--   Grantées à authenticated ET service_role : gardées en interne par
--   is_org_editor (défense en profondeur — un backend authentifié owner/editor
--   les appelle ; le service_role est admis pour un pilotage serveur).
-- ============================================================

-- ── start_event_session : ouvre le lobby (joignable) ─────────
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

revoke all on function public.start_event_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_event_session(uuid, uuid) to authenticated, service_role;

-- ── launch_event_question : pose la question courante ────────
-- current_question_started_at = now() = référence serveur du scoring de
-- rapidité ; réinitialise prono_correct_option_id ; phase = question_active.
create or replace function public.launch_event_question(
  p_organization_id uuid,
  p_session_id uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_now timestamptz := pg_catalog.now();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  select s.* into v_session from public.event_sessions s
   where s.id = p_session_id and s.organization_id = p_organization_id
   for update of s;
  if not found or v_session.status not in ('lobby', 'live')
     or v_session.phase = 'question_active' then
    return pg_catalog.jsonb_build_object('state', 'invalid_transition');
  end if;

  -- La question doit appartenir au game de la session (même tenant).
  if not exists (
    select 1 from public.event_questions q
     where q.id = p_question_id
       and q.organization_id = p_organization_id
       and q.game_id = v_session.game_id) then
    return pg_catalog.jsonb_build_object('state', 'unknown_question');
  end if;

  -- Une question ne se joue qu'UNE fois par session : relancer une question déjà
  -- répondue rejouerait son reveal et DOUBLERAIT les points au score. Le garde
  -- ferme ce chemin (les réponses sont immuables ; le reveal n'additionne
  -- qu'une fois).
  if exists (
    select 1 from public.event_answers a
     where a.session_id = p_session_id and a.question_id = p_question_id) then
    return pg_catalog.jsonb_build_object('state', 'already_played');
  end if;

  update public.event_sessions
     set status = 'live', phase = 'question_active',
         current_question_id = p_question_id,
         current_question_started_at = v_now,
         prono_correct_option_id = null
   where id = p_session_id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok', 'session_id', p_session_id, 'status', 'live',
    'phase', 'question_active', 'question_id', p_question_id,
    'started_at', v_now);
end;
$$;

revoke all on function public.launch_event_question(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.launch_event_question(uuid, uuid, uuid) to authenticated, service_role;

-- ── lock_event_question : ferme la fenêtre de réponse ────────
create or replace function public.lock_event_question(
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
  if not found or v_session.phase <> 'question_active' then
    return pg_catalog.jsonb_build_object('state', 'invalid_transition');
  end if;

  update public.event_sessions set phase = 'question_locked' where id = p_session_id;
  return pg_catalog.jsonb_build_object(
    'state', 'ok', 'session_id', p_session_id, 'phase', 'question_locked');
end;
$$;

revoke all on function public.lock_event_question(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.lock_event_question(uuid, uuid) to authenticated, service_role;

-- ── reveal_event_question : révèle et SCORE (atomique) ───────
-- quiz  : bonne option = celle avec is_correct=true.
-- prono : bonne option = p_correct_option_id (désignée par l'organisateur ;
--         doit appartenir à la question courante). Stockée dans
--         prono_correct_option_id.
-- poll  : aucune bonne réponse, 0 point.
-- Points d'une réponse correcte = points_base + bonus de rapidité décroissant,
-- borné : bonus = floor(points_base · (limit_ms - elapsed_ms) / limit_ms) sur
-- l'elapsed_ms SERVEUR figé au submit. Le score joueur est incrémenté sous le
-- verrou de session : rejouer un reveal est impossible (phase passe à 'reveal').
create or replace function public.reveal_event_question(
  p_organization_id uuid,
  p_session_id uuid,
  p_correct_option_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_qid uuid;
  v_qtype text;
  v_points_base integer;
  v_limit_ms integer;
  v_correct_option uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  select s.* into v_session from public.event_sessions s
   where s.id = p_session_id and s.organization_id = p_organization_id
   for update of s;
  if not found
     or v_session.phase not in ('question_active', 'question_locked')
     or v_session.current_question_id is null then
    return pg_catalog.jsonb_build_object('state', 'invalid_transition');
  end if;
  v_qid := v_session.current_question_id;

  select q.question_type, q.points_base, q.time_limit_seconds * 1000
    into v_qtype, v_points_base, v_limit_ms
    from public.event_questions q
   where q.id = v_qid and q.organization_id = p_organization_id;

  if v_qtype = 'quiz' then
    select o.id into v_correct_option
      from public.event_question_options o
     where o.question_id = v_qid and o.organization_id = p_organization_id
       and o.is_correct
     order by o.position
     limit 1;
  elsif v_qtype = 'prono' then
    -- L'organisateur DOIT désigner l'option gagnante, appartenant à la question.
    if p_correct_option_id is null
       or not exists (
         select 1 from public.event_question_options o
          where o.id = p_correct_option_id
            and o.question_id = v_qid
            and o.organization_id = p_organization_id) then
      return pg_catalog.jsonb_build_object('state', 'missing_correct_option');
    end if;
    v_correct_option := p_correct_option_id;
  else
    -- poll : aucune bonne réponse.
    v_correct_option := null;
  end if;

  -- Justesse + points de TOUTES les réponses de la question (ensembliste).
  -- v_correct_option null (poll) → aucune correcte, 0 point.
  update public.event_answers a
     set is_correct = (v_correct_option is not null and a.option_id = v_correct_option),
         points_awarded = case
           when v_correct_option is not null and a.option_id = v_correct_option then
             v_points_base + pg_catalog.floor(
               v_points_base::numeric
               * (v_limit_ms - least(greatest(a.elapsed_ms, 0), v_limit_ms))
               / greatest(v_limit_ms, 1))::integer
           else 0 end
   where a.session_id = p_session_id and a.question_id = v_qid;

  -- Report des points au score cumulé des joueurs.
  update public.event_players p
     set score = p.score + sub.pts
    from (select a.player_id, pg_catalog.sum(a.points_awarded)::integer as pts
            from public.event_answers a
           where a.session_id = p_session_id and a.question_id = v_qid
           group by a.player_id) sub
   where p.id = sub.player_id and sub.pts > 0;

  update public.event_sessions
     set phase = 'reveal',
         prono_correct_option_id = case when v_qtype = 'prono' then v_correct_option else null end
   where id = p_session_id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok', 'session_id', p_session_id, 'phase', 'reveal',
    'question_id', v_qid, 'question_type', v_qtype,
    'correct_option_id', v_correct_option);
end;
$$;

revoke all on function public.reveal_event_question(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reveal_event_question(uuid, uuid, uuid) to authenticated, service_role;

-- ── show_event_leaderboard ───────────────────────────────────
create or replace function public.show_event_leaderboard(
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
  if not found or v_session.status <> 'live' then
    return pg_catalog.jsonb_build_object('state', 'invalid_transition');
  end if;

  update public.event_sessions set phase = 'leaderboard' where id = p_session_id;
  return pg_catalog.jsonb_build_object(
    'state', 'ok', 'session_id', p_session_id, 'phase', 'leaderboard');
end;
$$;

revoke all on function public.show_event_leaderboard(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.show_event_leaderboard(uuid, uuid) to authenticated, service_role;

-- ── end_event_session : fige le podium + émet les codes ──────
-- Classe les joueurs (score desc, joined_at asc), récompense le TOP dans la
-- limite du stock FINI (ADR-031) : min(stock restant, joueurs à score > 0)
-- gagnants, chacun un code EVENT-…. reward_claimed_count décrémente le stock.
-- Stock épuisé → podium seul, aucun code (échec propre, pas d'erreur).
create or replace function public.end_event_session(
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
  v_available integer;
  v_awarded integer := 0;
  v_rank integer := 0;
  r record;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  select s.* into v_session from public.event_sessions s
   where s.id = p_session_id and s.organization_id = p_organization_id
   for update of s;
  if not found or v_session.status not in ('lobby', 'live') then
    return pg_catalog.jsonb_build_object('state', 'invalid_transition');
  end if;

  update public.event_sessions
     set status = 'ended', phase = 'ended', ended_at = pg_catalog.now()
   where id = p_session_id;

  -- Stock restant (fini). Idempotent : les wins déjà émis (unicité (session,
  -- rank)) ne sont pas ré-attribués — end n'est appelable qu'une fois (status
  -- passe à 'ended'), mais on borne quand même sur le stock.
  v_available := greatest(v_session.reward_stock - v_session.reward_claimed_count, 0);

  if v_available > 0 then
    for r in
      select p.token_hash
        from public.event_players p
       where p.session_id = p_session_id and p.score > 0
       order by p.score desc, p.joined_at asc, p.id asc
       limit v_available
    loop
      v_rank := v_rank + 1;
      v_code := null;
      for attempt in 1..8 loop
        v_bytes := extensions.gen_random_bytes(8);
        v_code := 'EVENT-';
        for i in 0..7 loop
          v_code := v_code || pg_catalog.substr(
            v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
        end loop;
        begin
          insert into public.event_wins
            (session_id, organization_id, rank, winner_token_hash, code)
          values (p_session_id, p_organization_id, v_rank, r.token_hash, v_code);
          exit;
        exception when unique_violation then
          v_code := null;
        end;
      end loop;
      if v_code is null then
        raise exception 'event win code generation exhausted';
      end if;
      v_awarded := v_awarded + 1;
    end loop;

    if v_awarded > 0 then
      update public.event_sessions
         set reward_claimed_count = reward_claimed_count + v_awarded
       where id = p_session_id;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok', 'session_id', p_session_id, 'status', 'ended',
    'phase', 'ended', 'winners', v_awarded);
end;
$$;

revoke all on function public.end_event_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.end_event_session(uuid, uuid) to authenticated, service_role;

-- ============================================================
-- RPC LECTURE PUBLIQUE de l'état (service_role) — source du transport
-- temps réel côté backend (écran / téléphone / repli polling).
-- Ne renvoie JAMAIS is_correct avant reveal (invariant #1). p_player_token_hash
-- optionnel : renvoie le score/rang du joueur et, si podium récompensé, SON
-- code EVENT-… (jamais celui d'un autre).
-- ============================================================
create or replace function public.event_public_state(
  p_session_id uuid,
  p_player_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions%rowtype;
  v_qid uuid;
  v_qtype text;
  v_reveal boolean;
  v_distribution_visible boolean;
  v_question jsonb := null;
  v_correct_option uuid := null;
  v_distribution jsonb := null;
  v_leaderboard jsonb;
  v_your jsonb := null;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select s.* into v_session from public.event_sessions s where s.id = p_session_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_qid := v_session.current_question_id;
  v_reveal := (v_session.phase = 'reveal');
  -- Répartition des votes visible seulement une fois la fenêtre fermée
  -- (jamais pendant question_active : pas d'effet moutonnier ni d'indice).
  v_distribution_visible := (v_session.phase in ('question_locked', 'reveal', 'leaderboard'));

  if v_qid is not null
     and v_session.phase in ('question_active', 'question_locked', 'reveal', 'leaderboard') then
    select q.question_type into v_qtype
      from public.event_questions q where q.id = v_qid;

    -- Question + options SANS is_correct (invariant #1).
    select pg_catalog.jsonb_build_object(
             'id', q.id, 'question_type', q.question_type, 'prompt', q.prompt,
             'time_limit_seconds', q.time_limit_seconds,
             'started_at', v_session.current_question_started_at,
             'options', coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                        'id', o.id, 'label', o.label, 'position', o.position)
                        order by o.position)
                 from public.event_question_options o
                where o.question_id = q.id), '[]'::jsonb))
      into v_question
      from public.event_questions q where q.id = v_qid;

    -- Bonne réponse UNIQUEMENT au reveal.
    if v_reveal then
      if v_qtype = 'quiz' then
        select o.id into v_correct_option
          from public.event_question_options o
         where o.question_id = v_qid and o.is_correct
         order by o.position limit 1;
      elsif v_qtype = 'prono' then
        v_correct_option := v_session.prono_correct_option_id;
      end if;
    end if;

    -- Répartition des votes (comptes par option) une fois la fenêtre fermée.
    if v_distribution_visible then
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'option_id', o.id, 'label', o.label, 'position', o.position,
               'votes', coalesce(c.votes, 0)) order by o.position), '[]'::jsonb)
        into v_distribution
        from public.event_question_options o
        left join (
          select a.option_id, pg_catalog.count(*) as votes
            from public.event_answers a
           where a.session_id = p_session_id and a.question_id = v_qid
           group by a.option_id) c on c.option_id = o.id
       where o.question_id = v_qid;
    end if;
  end if;

  -- Classement (pseudo/avatar/score publics), top 50.
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'pseudo', t.pseudo, 'avatar', t.avatar, 'score', t.score, 'rank', t.rank)
           order by t.rank), '[]'::jsonb)
    into v_leaderboard
    from (
      select p.pseudo, p.avatar, p.score,
             pg_catalog.row_number() over (order by p.score desc, p.joined_at asc, p.id asc) as rank
        from public.event_players p
       where p.session_id = p_session_id
       order by p.score desc, p.joined_at asc, p.id asc
       limit 50) t;

  -- Vue « moi » : score/rang du joueur + son code s'il fait partie du podium
  -- récompensé (jamais le code d'un autre).
  if p_player_token_hash is not null and p_player_token_hash ~ '^[0-9a-f]{64}$' then
    select pg_catalog.jsonb_build_object(
             'pseudo', mp.pseudo, 'avatar', mp.avatar, 'score', mp.score,
             -- Rang = 1 + nombre de joueurs strictement devant, selon le MÊME
             -- ordre que le classement (score desc, joined_at asc, id asc).
             'rank', 1 + (
               select pg_catalog.count(*)
                 from public.event_players x
                where x.session_id = p_session_id
                  and (x.score > mp.score
                       or (x.score = mp.score and x.joined_at < mp.joined_at)
                       or (x.score = mp.score and x.joined_at = mp.joined_at and x.id < mp.id))),
             'win', (
               select pg_catalog.jsonb_build_object('rank', w.rank, 'code', w.code)
                 from public.event_wins w
                where w.session_id = p_session_id
                  and w.winner_token_hash = p_player_token_hash
                limit 1))
      into v_your
      from public.event_players mp
     where mp.session_id = p_session_id
       and mp.token_hash = p_player_token_hash;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'session', pg_catalog.jsonb_build_object(
      'id', v_session.id, 'status', v_session.status, 'phase', v_session.phase,
      'join_code', v_session.join_code,
      'reward_label', v_session.reward_label, 'reward_stock', v_session.reward_stock,
      'reward_claimed_count', v_session.reward_claimed_count),
    'question', v_question,
    'correct_option_id', v_correct_option,
    'distribution', v_distribution,
    'leaderboard', v_leaderboard,
    'you', v_your
  );
end;
$$;

revoke all on function public.event_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.event_public_state(uuid, text) to service_role;

-- ── RPC caisse : remise d'un lot d'événement ─────────────────
-- Miroir de redeem_jackpot_prize : recherche + validation + audit atomiques,
-- actor obligatoire, org-scopée (code inconnu, déjà remis ou d'une autre
-- organisation → aucune remise, réponse indistinguable).
create or replace function public.redeem_event_prize(
  p_organization_id uuid,
  p_code text,
  p_actor text
)
returns table(
  id uuid, created_at timestamptz, code text, redeemed_at timestamptz,
  session_label text, reward_label text, reward_details text,
  redeemed_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_actor is null or length(p_actor) = 0 then
    raise exception 'actor required';
  end if;

  update public.event_wins w
     set redeemed_at = now(),
         redeemed_by = p_actor
   where w.organization_id = p_organization_id
     and w.code = upper(btrim(p_code))
     and w.redeemed_at is null
  returning w.id into v_id;

  if v_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'event.redeem',
            pg_catalog.jsonb_build_object('win_id', v_id));
  end if;

  return query
  select w.id, w.created_at, w.code, w.redeemed_at,
         coalesce(s.label, ''), s.reward_label, s.reward_details,
         (v_id is not null)
    from public.event_wins w
    join public.event_sessions s on s.id = w.session_id
   where w.organization_id = p_organization_id
     and w.code = upper(btrim(p_code))
   limit 1;
end;
$$;

revoke all on function public.redeem_event_prize(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_event_prize(uuid, text, text)
  to service_role;

-- ── Purge RGPD ───────────────────────────────────────────────
-- Miroir de purge_expired_jackpot_players : supprime les JOUEURS (pseudo saisi
-- + hash) des sessions TERMINÉES au-delà de la rétention de l'organisation.
-- Les event_answers cascadent (FK player on delete cascade). À brancher au cron
-- /api/cron/purge-data.
--
-- Divergence assumée (à relayer à security-review) : event_sessions et
-- event_wins ne sont PAS supprimés par la purge — ils ne portent qu'un hash de
-- jeton non inversible (registre anonyme des lots) et les statistiques
-- agrégées de la soirée. Ils disparaissent avec le game (cascade) ou
-- l'organisation.
create or replace function public.purge_expired_event_sessions()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.event_players pl
  using public.event_sessions s, public.organizations o
  where pl.session_id = s.id
    and s.organization_id = o.id
    and s.status in ('ended', 'archived')
    and o.data_retention_months is not null
    and coalesce(s.ended_at, s.created_at) < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_event_sessions()
  from public, anon, authenticated;
grant execute on function public.purge_expired_event_sessions()
  to service_role;
