-- ============================================================
-- La soirée live tient sa promesse (wagon 5) — ce que ce fichier prouve :
--
--   1. ÉQUIVALENCE. `event_etat_partage || event_etat_joueur` reproduit
--      `event_public_state` CHAMP À CHAMP, avec et sans jeton joueur. C'est la
--      promesse exacte du découpage : tant qu'elle tient, migrer un appelant
--      de la RPC mère vers la paire ne change rien de ce que le joueur voit.
--      `server_now` est exclu de la comparaison — c'est la seule clé neuve, et
--      elle vaut une horloge, donc jamais deux fois la même valeur.
--
--   2. LA GARDE FUSIONNÉE MORD. Session inexistante, `draft`, `archived`, ou
--      organisation sans le module « events » → {"state":"unavailable"}. Ces
--      trois refus vivaient dans `loadEventActionContext` au prix de deux
--      requêtes ; ils sont désormais dans la RPC, et ce test est ce qui
--      empêche qu'ils s'y perdent.
--
--   3. LA RPC MÈRE RESTE INTACTE. `event_public_state` rend encore « ok » sur
--      une session `draft` : la garde est NEUVE, elle n'a pas été rétro-posée
--      sur la fonction dont dépend encore le rendu serveur initial.
--
--   4. ACL. Les deux RPC neuves sont `service_role` seul — au catalogue
--      (has_function_privilege) ET à l'exécution (la garde `auth.role()`
--      lève), parce que le premier ne prouve pas le second.
--
--   5. VEN-1. `event_participant_capacity` rend 500 pour le plan `full` (la
--      jauge vendue redescend à ce qui est prouvé) et 1000 pour un accès
--      OFFERT (qui n'est pas une vente). Les paliers d'octroi 10/30/50 du
--      pass « Soirée en jeu » sont inchangés — c'est la non-régression du
--      wagon 2.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
-- Organisation SERVIE : abonnement actif + addon events.
insert into public.organizations
  (id, name, slug, subscription_status, plan, addon_events)
values ('5e000000-0000-4000-8000-000000000001', 'Soiree servie', 'tap-sl-ok',
        'active', 'starter', true);

-- Organisation SANS le module : même abonnement, addon coupé. C'est elle qui
-- éprouve la branche `org_has_module_access` de la garde fusionnée.
insert into public.organizations
  (id, name, slug, subscription_status, plan, addon_events)
values ('5e000000-0000-4000-8000-0000000000ff', 'Soiree fermee', 'tap-sl-ko',
        'active', 'starter', false);

insert into public.event_games (id, organization_id, name, status)
values
  ('5e000000-0000-4000-8000-000000000010',
   '5e000000-0000-4000-8000-000000000001', 'Quiz du vendredi', 'active'),
  ('5e000000-0000-4000-8000-0000000000f0',
   '5e000000-0000-4000-8000-0000000000ff', 'Quiz fermé', 'active');

-- Q1 quiz, option A correcte : au `reveal` elle alimente `correct_option_id`.
insert into public.event_questions
  (id, game_id, organization_id, position, question_type, prompt,
   time_limit_seconds, points_base)
values ('5e000000-0000-4000-8000-000000000021',
        '5e000000-0000-4000-8000-000000000010',
        '5e000000-0000-4000-8000-000000000001', 0, 'quiz',
        'Capitale de la Belgique ?', 300, 1000);
insert into public.event_question_options
  (id, question_id, organization_id, position, label, is_correct)
values
  ('5e000000-0000-4000-8000-0000000021a1', '5e000000-0000-4000-8000-000000000021',
   '5e000000-0000-4000-8000-000000000001', 0, 'Bruxelles', true),
  ('5e000000-0000-4000-8000-0000000021a2', '5e000000-0000-4000-8000-000000000021',
   '5e000000-0000-4000-8000-000000000001', 1, 'Anvers', false);

-- S1 — la session RICHE : `live` / `reveal` sur Q1. Cette phase est la seule
-- qui allume EN MÊME TEMPS les quatre blocs partagés (question, correction,
-- distribution, classement). Prouver l'équivalence sur une charge maigre
-- n'aurait rien prouvé : c'est ici que les deux fonctions ont le plus
-- d'occasions de diverger.
insert into public.event_sessions
  (id, game_id, organization_id, label, join_code, status, phase,
   current_question_id, current_question_started_at, reward_stock, reward_label)
values ('5e000000-0000-4000-8000-000000000031',
        '5e000000-0000-4000-8000-000000000010',
        '5e000000-0000-4000-8000-000000000001', 'Vendredi 20h', 'SLA234',
        'live', 'reveal', '5e000000-0000-4000-8000-000000000021',
        now() - interval '30 seconds', 2, 'Une tournée');

-- S2 draft, S3 archived — les deux statuts que loadEventActionContext refuse.
insert into public.event_sessions
  (id, game_id, organization_id, join_code, status, reward_stock)
values
  ('5e000000-0000-4000-8000-000000000032',
   '5e000000-0000-4000-8000-000000000010',
   '5e000000-0000-4000-8000-000000000001', 'SLB234', 'draft', 0),
  ('5e000000-0000-4000-8000-000000000033',
   '5e000000-0000-4000-8000-000000000010',
   '5e000000-0000-4000-8000-000000000001', 'SLC234', 'archived', 0),
  -- S5 lobby, S6 ended : les deux autres statuts JOUABLES. Sans eux, un refus
  -- écrit `status <> 'live'` passerait ce fichier au vert en fermant la salle
  -- d'attente et l'écran de fin.
  ('5e000000-0000-4000-8000-000000000035',
   '5e000000-0000-4000-8000-000000000010',
   '5e000000-0000-4000-8000-000000000001', 'SLE234', 'lobby', 0),
  ('5e000000-0000-4000-8000-000000000036',
   '5e000000-0000-4000-8000-000000000010',
   '5e000000-0000-4000-8000-000000000001', 'SLF234', 'ended', 0);

-- S4 — session parfaitement jouable, dans l'organisation au module COUPÉ.
insert into public.event_sessions
  (id, game_id, organization_id, join_code, status, phase, reward_stock)
values ('5e000000-0000-4000-8000-000000000034',
        '5e000000-0000-4000-8000-0000000000f0',
        '5e000000-0000-4000-8000-0000000000ff', 'SLD234', 'live', 'lobby', 0);

-- Trois joueurs, dont un BANNI au score le plus haut : il doit rester absent
-- du classement, de la distribution, et de sa propre vue « you ».
insert into public.event_players
  (id, session_id, organization_id, token_hash, pseudo, avatar, score, joined_at)
values
  ('5e000000-0000-4000-8000-000000000041',
   '5e000000-0000-4000-8000-000000000031',
   '5e000000-0000-4000-8000-000000000001', repeat('1', 64), 'Alice', 'renard',
   300, now() - interval '10 minutes'),
  ('5e000000-0000-4000-8000-000000000042',
   '5e000000-0000-4000-8000-000000000031',
   '5e000000-0000-4000-8000-000000000001', repeat('2', 64), 'Bob', 'hibou',
   200, now() - interval '9 minutes'),
  ('5e000000-0000-4000-8000-000000000043',
   '5e000000-0000-4000-8000-000000000031',
   '5e000000-0000-4000-8000-000000000001', repeat('3', 64), 'Tricheur', '',
   500, now() - interval '8 minutes');

update public.event_players
   set moderation_state = 'banned'
 where id = '5e000000-0000-4000-8000-000000000043';

insert into public.event_answers
  (session_id, question_id, organization_id, player_id, option_id, elapsed_ms)
values
  ('5e000000-0000-4000-8000-000000000031', '5e000000-0000-4000-8000-000000000021',
   '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000041',
   '5e000000-0000-4000-8000-0000000021a1', 1200),
  ('5e000000-0000-4000-8000-000000000031', '5e000000-0000-4000-8000-000000000021',
   '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000042',
   '5e000000-0000-4000-8000-0000000021a2', 4500),
  ('5e000000-0000-4000-8000-000000000031', '5e000000-0000-4000-8000-000000000021',
   '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000043',
   '5e000000-0000-4000-8000-0000000021a1', 900);

-- Un gain pour Alice : le bloc « you » porte alors un objet `win` non nul,
-- c'est-à-dire sa forme la plus complète.
insert into public.event_wins
  (session_id, organization_id, rank, winner_token_hash, code)
values ('5e000000-0000-4000-8000-000000000031',
        '5e000000-0000-4000-8000-000000000001', 1, repeat('1', 64),
        'EVENT-ABCD2345');


-- ══ 1. ÉQUIVALENCE — la promesse du découpage ════════════════
--
-- Les deux lectures sont figées dans une table temporaire AVANT toute
-- assertion : appeler les RPC dans chaque `is()` les rejouerait à des instants
-- différents, et l'on éprouverait alors la stabilité de la base plutôt que
-- l'équivalence des fonctions.
create temporary table tap_etat (
  libelle text primary key,
  mere jsonb not null,
  fusion jsonb not null
);

insert into tap_etat (libelle, mere, fusion)
values
  ('avec jeton',
   public.event_public_state('5e000000-0000-4000-8000-000000000031', repeat('1', 64)),
   public.event_etat_partage('5e000000-0000-4000-8000-000000000031')
     || public.event_etat_joueur('5e000000-0000-4000-8000-000000000031', repeat('1', 64))),
  ('sans jeton',
   public.event_public_state('5e000000-0000-4000-8000-000000000031'),
   public.event_etat_partage('5e000000-0000-4000-8000-000000000031')
     || public.event_etat_joueur('5e000000-0000-4000-8000-000000000031', null));

-- L'état de départ doit être RICHE, sinon l'équivalence ne prouverait que
-- l'égalité de deux objets vides.
select is((select mere->>'state' from tap_etat where libelle = 'avec jeton'),
  'ok', 'la fixture est bien un état servi (sinon tout le reste est vide)');
select isnt((select mere->'question' from tap_etat where libelle = 'avec jeton'),
  'null'::jsonb, 'la fixture porte une question');
select isnt((select mere->'you' from tap_etat where libelle = 'avec jeton'),
  'null'::jsonb, 'la fixture porte un bloc « you » non nul');

-- ── Le TOUT : paire (clé, valeur) contre paire (clé, valeur) ──
-- Cette forme attrape ce qu'une comparaison clé par clé ne peut pas voir : une
-- clé PRÉSENTE d'un côté et absente de l'autre. Les sept `is()` qui suivent ne
-- la remplacent pas, ils la rendent lisible en cas d'échec.
select set_eq(
  $$select key, value from pg_catalog.jsonb_each(
      (select fusion - 'server_now' from tap_etat where libelle = 'avec jeton'))$$,
  $$select key, value from pg_catalog.jsonb_each(
      (select mere from tap_etat where libelle = 'avec jeton'))$$,
  'ÉQUIVALENCE avec jeton : même jeu de clés, mêmes valeurs (server_now exclu)'
);
select set_eq(
  $$select key, value from pg_catalog.jsonb_each(
      (select fusion - 'server_now' from tap_etat where libelle = 'sans jeton'))$$,
  $$select key, value from pg_catalog.jsonb_each(
      (select mere from tap_etat where libelle = 'sans jeton'))$$,
  'ÉQUIVALENCE sans jeton : même jeu de clés, mêmes valeurs (server_now exclu)'
);

-- ── Clé par clé, nommément — avec jeton ──────────────────────
select is((select fusion->'state' from tap_etat where libelle = 'avec jeton'),
          (select mere->'state' from tap_etat where libelle = 'avec jeton'),
  'avec jeton : state identique');
select is((select fusion->'session' from tap_etat where libelle = 'avec jeton'),
          (select mere->'session' from tap_etat where libelle = 'avec jeton'),
  'avec jeton : session identique (revision, statut, phase, lot, jauge)');
select is((select fusion->'question' from tap_etat where libelle = 'avec jeton'),
          (select mere->'question' from tap_etat where libelle = 'avec jeton'),
  'avec jeton : question identique (options et started_at compris)');
select is((select fusion->'correct_option_id' from tap_etat where libelle = 'avec jeton'),
          (select mere->'correct_option_id' from tap_etat where libelle = 'avec jeton'),
  'avec jeton : correct_option_id identique');
select is((select fusion->'distribution' from tap_etat where libelle = 'avec jeton'),
          (select mere->'distribution' from tap_etat where libelle = 'avec jeton'),
  'avec jeton : distribution identique (le banni exclu des deux côtés)');
select is((select fusion->'leaderboard' from tap_etat where libelle = 'avec jeton'),
          (select mere->'leaderboard' from tap_etat where libelle = 'avec jeton'),
  'avec jeton : leaderboard identique');
select is((select fusion->'you' from tap_etat where libelle = 'avec jeton'),
          (select mere->'you' from tap_etat where libelle = 'avec jeton'),
  'avec jeton : you identique (pseudo, score, rang, gain)');

-- ── Clé par clé, nommément — sans jeton ──────────────────────
select is((select fusion->'state' from tap_etat where libelle = 'sans jeton'),
          (select mere->'state' from tap_etat where libelle = 'sans jeton'),
  'sans jeton : state identique');
select is((select fusion->'session' from tap_etat where libelle = 'sans jeton'),
          (select mere->'session' from tap_etat where libelle = 'sans jeton'),
  'sans jeton : session identique');
select is((select fusion->'question' from tap_etat where libelle = 'sans jeton'),
          (select mere->'question' from tap_etat where libelle = 'sans jeton'),
  'sans jeton : question identique');
select is((select fusion->'correct_option_id' from tap_etat where libelle = 'sans jeton'),
          (select mere->'correct_option_id' from tap_etat where libelle = 'sans jeton'),
  'sans jeton : correct_option_id identique');
select is((select fusion->'distribution' from tap_etat where libelle = 'sans jeton'),
          (select mere->'distribution' from tap_etat where libelle = 'sans jeton'),
  'sans jeton : distribution identique');
select is((select fusion->'leaderboard' from tap_etat where libelle = 'sans jeton'),
          (select mere->'leaderboard' from tap_etat where libelle = 'sans jeton'),
  'sans jeton : leaderboard identique');
select is((select fusion->'you' from tap_etat where libelle = 'sans jeton'),
          (select mere->'you' from tap_etat where libelle = 'sans jeton'),
  'sans jeton : you identique — null des deux côtés');

-- La clé de la fusion qui n'existe pas chez la mère : c'est la SEULE, et c'est
-- ce que les set_eq ci-dessus démontrent en creux. Ici on prouve qu'elle est
-- bien là et qu'elle vaut une horloge SERVEUR (JOU-4), pas une constante.
select isnt((select fusion->'server_now' from tap_etat where libelle = 'avec jeton'),
  'null'::jsonb, 'JOU-4 server_now voyage avec l''état partagé');
select ok(
  (select (fusion->>'server_now')::timestamptz from tap_etat where libelle = 'avec jeton')
    between now() - interval '1 minute' and now() + interval '1 minute',
  'JOU-4 server_now est bien l''horloge du SERVEUR, à la minute près'
);
select ok(
  (select (fusion->>'server_now')::timestamptz from tap_etat where libelle = 'avec jeton')
    > (select (mere->'question'->>'started_at')::timestamptz from tap_etat where libelle = 'avec jeton'),
  'JOU-4 server_now - started_at donne un délai POSITIF : le client peut compter sans son horloge'
);

-- ── Le bloc joueur, dans ses formes dégradées ────────────────
select is(
  public.event_etat_joueur('5e000000-0000-4000-8000-000000000031', null),
  '{"you": null}'::jsonb,
  'jeton absent → {"you": null}, un OBJET : `||` reste défini'
);
select is(
  public.event_etat_joueur('5e000000-0000-4000-8000-000000000031', 'pas-un-hash'),
  '{"you": null}'::jsonb,
  'jeton mal formé → {"you": null}, sans jamais toucher l''index'
);
select is(
  public.event_etat_joueur('5e000000-0000-4000-8000-000000000031', repeat('9', 64)),
  '{"you": null}'::jsonb,
  'jeton inconnu → {"you": null}'
);
select is(
  public.event_etat_joueur('5e000000-0000-4000-8000-000000000031', repeat('3', 64)),
  '{"you": null}'::jsonb,
  'joueur BANNI → {"you": null} : invisible à lui-même comme aux autres'
);
select is(
  public.event_etat_joueur('5e000000-0000-4000-8000-000000000031', repeat('1', 64))
    ->'you'->>'rank',
  '1',
  'le rang du bloc joueur ignore le banni mieux classé'
);


-- ══ 2. LA GARDE DE CONTEXTE FUSIONNÉE (EVT-2) ════════════════
select is(
  public.event_etat_partage('5e000000-0000-4000-8000-000000000031')->>'state',
  'ok', 'session LIVE dans une org servie → ok');
select is(
  public.event_etat_partage('5e000000-0000-4000-8000-000000000035')->>'state',
  'ok', 'session LOBBY → ok : la salle d''attente est un statut jouable');
select is(
  public.event_etat_partage('5e000000-0000-4000-8000-000000000036')->>'state',
  'ok', 'session ENDED → ok : l''écran de fin reste lisible');
select is(
  public.event_etat_partage('5e000000-0000-4000-8000-000000000032')->>'state',
  'unavailable', 'EVT-2 session DRAFT → unavailable (garde descendue du TypeScript)');
select is(
  public.event_etat_partage('5e000000-0000-4000-8000-000000000033')->>'state',
  'unavailable', 'EVT-2 session ARCHIVED → unavailable');
select is(
  public.event_etat_partage('5e000000-0000-4000-8000-000000000034')->>'state',
  'unavailable', 'EVT-2 module « events » COUPÉ → unavailable, session pourtant live');
select is(
  public.event_etat_partage('5e000000-0000-4000-8000-0000000000aa')->>'state',
  'unavailable', 'session inexistante → unavailable (contrat hérité de la RPC mère)');

-- Le refus ne doit RIEN dire de plus que « indisponible » : trois causes
-- distinctes, une seule réponse, aucune clé de plus.
select set_eq(
  $$select key from pg_catalog.jsonb_object_keys(
      public.event_etat_partage('5e000000-0000-4000-8000-000000000034')) key$$,
  $$values ('state')$$,
  'le refus ne porte QUE la clé state : aucun oracle sur la cause'
);

-- Non-régression (livrable 3) : la RPC mère n'a PAS reçu la garde. Le rendu
-- serveur initial en dépend encore, et c'est elle le témoin contre lequel
-- l'équivalence ci-dessus est mesurée — la modifier, c'est perdre le témoin.
select is(
  public.event_public_state('5e000000-0000-4000-8000-000000000032')->>'state',
  'ok', 'event_public_state reste INTACTE : elle sert encore une session draft');


-- ══ 3. ACL des deux RPC neuves ═══════════════════════════════
select ok(has_function_privilege('service_role',
    'public.event_etat_partage(uuid)', 'EXECUTE'),
  'ACL event_etat_partage : le serveur peut lire l''état partagé');
select ok(not has_function_privilege('authenticated',
    'public.event_etat_partage(uuid)', 'EXECUTE'),
  'ACL event_etat_partage : pas à authenticated');
select ok(not has_function_privilege('anon',
    'public.event_etat_partage(uuid)', 'EXECUTE'),
  'ACL event_etat_partage : pas à anon');
select ok(has_function_privilege('service_role',
    'public.event_etat_joueur(uuid, text)', 'EXECUTE'),
  'ACL event_etat_joueur : le serveur peut lire la part du joueur');
select ok(not has_function_privilege('authenticated',
    'public.event_etat_joueur(uuid, text)', 'EXECUTE'),
  'ACL event_etat_joueur : pas à authenticated');
select ok(not has_function_privilege('anon',
    'public.event_etat_joueur(uuid, text)', 'EXECUTE'),
  'ACL event_etat_joueur : pas à anon');

-- Le catalogue ne prouve pas l'exécution : une fonction SECURITY DEFINER
-- atteinte par un chemin détourné (une autre routine definer, un trigger)
-- s'exécuterait sans que le grant n'ait été consulté. La garde `auth.role()`
-- est le second verrou, et c'est celui-là qu'on éprouve ici.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.event_etat_partage('5e000000-0000-4000-8000-000000000031')$$,
  'P0001', 'not authorized',
  'la garde auth.role() de event_etat_partage lève hors service_role');
select throws_ok(
  $$select public.event_etat_joueur('5e000000-0000-4000-8000-000000000031', null)$$,
  'P0001', 'not authorized',
  'la garde auth.role() de event_etat_joueur lève hors service_role');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);


-- ══ 4. VEN-1 — la jauge vendable redescend à 500 ═════════════
insert into public.organizations
  (id, name, slug, subscription_status, trial_ends_at, plan, addon_events,
   comp_access, comp_access_until)
-- `trial_ends_at` est NOT NULL : toutes ces lignes portent un essai ÉCHU, pour
-- qu'aucune d'elles ne doive son accès à un essai en cours. Ce qui décide est
-- alors visible dans la ligne elle-même — `subscription_status` ou
-- `comp_access` —, et jamais un reliquat de période d'essai.
values
  -- Le plan le plus haut, celui qui promettait 1000.
  ('5e000000-0000-4000-8000-0000000000b1', 'Cap full', 'tap-sl-cap-full',
   'active', now() - interval '60 days', 'full', true, false, null),
  -- Le plan Live : inchangé, il valait déjà 500.
  ('5e000000-0000-4000-8000-0000000000b2', 'Cap live', 'tap-sl-cap-live',
   'active', now() - interval '60 days', 'live', true, false, null),
  -- Un abonnement sans la Soirée : le `else` du case.
  ('5e000000-0000-4000-8000-0000000000b3', 'Cap autre', 'tap-sl-cap-autre',
   'active', now() - interval '60 days', 'starter', false, false, null),
  -- ACCÈS OFFERT : reste à 1000, parce que rien n'y a été VENDU.
  ('5e000000-0000-4000-8000-0000000000b4', 'Cap offert', 'tap-sl-cap-offert',
   'canceled', now() - interval '60 days', 'starter', false, true, null),
  -- Trois porteurs de pass, sans aucune offre : les paliers du wagon 2.
  ('5e000000-0000-4000-8000-0000000000c1', 'Pass 10', 'tap-sl-pass-10',
   'canceled', now() - interval '60 days', 'starter', false, false, null),
  ('5e000000-0000-4000-8000-0000000000c2', 'Pass 30', 'tap-sl-pass-30',
   'canceled', now() - interval '60 days', 'starter', false, false, null),
  ('5e000000-0000-4000-8000-0000000000c3', 'Pass 50', 'tap-sl-pass-50',
   'canceled', now() - interval '60 days', 'starter', false, false, null),
  -- Plan full ET pass de 30 : c'est le plus généreux qui vaut, donc 500.
  ('5e000000-0000-4000-8000-0000000000c4', 'Full et pass', 'tap-sl-full-pass',
   'active', now() - interval '60 days', 'full', true, false, null);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at, capacity)
values
  ('5e000000-0000-4000-8000-0000000000c1', 'events', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '29 days', 10),
  ('5e000000-0000-4000-8000-0000000000c2', 'events', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '29 days', 30),
  ('5e000000-0000-4000-8000-0000000000c3', 'events', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '29 days', 50),
  ('5e000000-0000-4000-8000-0000000000c4', 'events', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '29 days', 30);

select is(
  public.event_participant_capacity('5e000000-0000-4000-8000-0000000000b1'::uuid),
  500,
  'VEN-1 le plan FULL rend 500 et non 1000 : on ne vend pas une jauge non mesurée'
);
select is(
  public.event_participant_capacity('5e000000-0000-4000-8000-0000000000b4'::uuid),
  1000,
  'VEN-1 l''ACCÈS OFFERT reste à 1000 : offrir n''est pas vendre'
);
select is(
  public.event_participant_capacity('5e000000-0000-4000-8000-0000000000b2'::uuid),
  500,
  'VEN-1 le plan LIVE est inchangé à 500'
);
select is(
  public.event_participant_capacity('5e000000-0000-4000-8000-0000000000b3'::uuid),
  100,
  'VEN-1 un abonnement sans la Soirée reste à 100'
);

-- Non-régression du wagon 2 : les trois paliers VENDUS avec le pass.
select is(
  public.event_participant_capacity('5e000000-0000-4000-8000-0000000000c1'::uuid),
  10, 'wagon 2 inchangé : le pass de 10 places rend 10');
select is(
  public.event_participant_capacity('5e000000-0000-4000-8000-0000000000c2'::uuid),
  30, 'wagon 2 inchangé : le pass de 30 places rend 30');
select is(
  public.event_participant_capacity('5e000000-0000-4000-8000-0000000000c3'::uuid),
  50, 'wagon 2 inchangé : le pass de 50 places rend 50');
select is(
  public.event_participant_capacity('5e000000-0000-4000-8000-0000000000c4'::uuid),
  500,
  'wagon 2 inchangé : c''est le plus généreux qui vaut — 500 (offre) et non 30 (pass)');

-- La jauge redescendue reste STOCKABLE : le trigger d'instantané l'écrit
-- lui-même à la création, et la contrainte doit l'accepter. Une valeur juste
-- que la table refuse serait un échec au premier soir d'événement, pas ici.
insert into public.event_games (id, organization_id, name, status)
values ('5e000000-0000-4000-8000-0000000000d1',
        '5e000000-0000-4000-8000-0000000000b1', 'Soiree full', 'active');
insert into public.event_sessions
  (id, game_id, organization_id, join_code, status, reward_stock)
values ('5e000000-0000-4000-8000-0000000000d2',
        '5e000000-0000-4000-8000-0000000000d1',
        '5e000000-0000-4000-8000-0000000000b1', 'SLG234', 'draft', 0);
select is(
  (select s.max_participants from public.event_sessions s
    where s.id = '5e000000-0000-4000-8000-0000000000d2'),
  500,
  'VEN-1 une session du plan full naît à 500, et la contrainte l''accepte'
);

select * from finish();
rollback;
