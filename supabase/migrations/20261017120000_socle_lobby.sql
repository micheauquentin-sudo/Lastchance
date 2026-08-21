-- ============================================================
-- SOCLE DE SESSION JOUEUR — LES LOBBIES GRATUITS (L16)
--
-- Fondation commune de Duo Miroir (L17, deux joueurs) et Portrait de la Bande
-- (L18, deux à douze). Ce lot ne livre AUCUN jeu : il livre la salle d'attente
-- où l'on se retrouve avant d'en jouer un, et rien d'autre.
--
-- ── CE QUE ADR-109 §A4 A TRANCHÉ, ET QUI GOUVERNE CE FICHIER ──
--
-- Les lobbies joueurs sont GRATUITS, distincts des paliers événement facturés.
-- Trois gardes ont été retenues, et une quatrième explicitement écartée :
--
--   1. Seau IP-seule — côté APPLICATION (observabilité, fail-open). Rien ici.
--   2. QUOTA PAR ORGANISATION — **EN SQL**, et c'est `create_player_lobby` qui
--      le tient. Vingt lobbies actifs par organisation, comptés SOUS VERROU
--      CONSULTATIF : un plafond lu hors verrou n'est pas un plafond, c'est une
--      estimation que deux appels simultanés dépassent ensemble.
--   3. TTL D'EXPIRATION des lobbies non verrouillés — trente minutes à la
--      création, prolongées à quatre heures par le VERROUILLAGE, et un plafond
--      dur de vingt-quatre heures écrit en `check` : aucune prolongation, aucun
--      bogue de calcul, aucune horloge dérivante ne peut faire vivre un lobby
--      plus d'un jour.
--   4. Le plafond par cookie joueur est DÉCORATIF (ADR-109 §A4 le dit en
--      toutes lettres : « il ne protège rien qu'un joueur motivé ne contourne
--      en effaçant son cookie »). Il n'est donc pas implémenté ici, et surtout
--      il n'est compté nulle part comme une garde.
--
-- ── L'EXPIRATION EST CONSTATÉE À LA LECTURE, JAMAIS ÉCRITE (ADR-111) ──
--
-- Aucun worker ne fait expirer un lobby. `expires_at` est une DATE, et toute
-- lecture la compare à `now()` : un lobby dépassé se lit « expired » sans
-- qu'une ligne ait bougé. Trois conséquences, toutes voulues :
--
--   · une panne de cron ne prolonge la vie d'aucun lobby, puisque rien
--     n'attendait le cron pour que le lobby soit mort ;
--   · `lobby_state` affiche « expired » SANS ÉCRIRE — la statistique ne
--     s'invente pas, et un `update` déclenché par un simple regard daterait
--     l'expiration du moment où quelqu'un a ouvert l'écran ;
--   · `purge_expired_lobbies` DATE SON SEUIL AU DERNIER INSTANT CONNU
--     (`expires_at`), jamais à `now()` du cron. Un cron qui rattrape trois
--     jours de retard efface alors exactement ce qu'il aurait effacé à
--     l'heure, et rien d'autre.
--
-- ── AUCUNE POLICY, ET C'EST LE MOTIF `vitrine_translations` ──
--
-- Les deux tables portent la RLS et ZÉRO policy : `service_role` seul y touche,
-- et il n'y touche que par les RPC de ce fichier. Un lobby n'appartient à aucun
-- compte marchand — il appartient à des joueurs anonymes tenus par un cookie —
-- donc il n'existe aucun prédicat marchand qui aurait un sens ici. La porte
-- reste fermée pour `anon` comme pour `authenticated`, `references` / `trigger`
-- / `truncate` compris (leçon SEC-4, wagon 7).
--
-- ── L'IDENTITÉ EST RÉUTILISÉE, JAMAIS DUPLIQUÉE ──
--
-- `token_hash` est le SHA-256 d'un cookie PAR LOBBY (motif `event_players`), et
-- jamais l'identité globale `lc-player` en clair. Le joueur reste le même
-- joueur d'un lobby à l'autre du point de vue de l'application ; la base, elle,
-- ne voit qu'une empreinte par lobby, et ne peut donc pas recoudre les lobbies
-- d'une même personne. C'est la session privée éphémère : elle vit le temps du
-- lobby, et la purge l'efface avec lui.
--
-- ── LE REFUS EST INDISTINCT, ET C'EST LA PROPRIÉTÉ CENTRALE ──
--
-- `join_player_lobby` rend EXACTEMENT le même document pour un code inventé,
-- un code expiré, un code clos et un code malformé : `{"state":"unavailable"}`.
-- Distinguer les quatre donnerait à n'importe qui un oracle sur les codes qui
-- ont existé — c'est-à-dire de quoi énumérer, six caractères à la fois, la vie
-- sociale des commerces d'à côté. Le code court n'est PAS REJOUABLE après
-- expiration, et son cadavre ne se distingue pas d'un code jamais né.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. `player_lobbies` — la salle d'attente
-- ────────────────────────────────────────────────────────────

create table public.player_lobbies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- Liste FERMÉE de deux valeurs. « duo » est L17, « bande » est L18 : un
  -- troisième format ne peut pas apparaître sans que ce `check` l'apprenne, et
  -- c'est le seul endroit qui rende ce couplage visible.
  kind text not null check (kind in ('duo', 'bande')),
  -- Quatre états, et le cycle ne revient jamais en arrière :
  --   lobby   → on attend, on peut rejoindre, le code vit ;
  --   locked  → l'hôte a fermé la porte, la partie appartient à L17/L18 ;
  --   closed  → l'hôte est parti avant de fermer : plus personne n'attend ;
  --   expired → réservé aux écritures futures. AUCUNE RPC de ce fichier ne
  --             l'écrit : l'expiration se CONSTATE (ADR-111), elle ne se pose
  --             pas. La valeur est admise pour qu'un lot ultérieur puisse la
  --             poser DÉLIBÉRÉMENT, jamais par effet de bord d'une lecture.
  status text not null default 'lobby'
    check (status in ('lobby', 'locked', 'closed', 'expired')),
  -- Alphabet SANS I, O, 0 ni 1 — le code se dicte à voix haute, à une table de
  -- café, et « zéro » contre « O » est la faute qui coûte le plus. Le motif est
  -- celui de `event_sessions.join_code` (20260727120000), à la lettre.
  join_code text not null unique
    check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  -- Deux à douze. Duo est FIGÉ à deux par la contrainte ci-dessous : c'est la
  -- base qui le tient, pas la bonne volonté de l'appelant.
  capacite integer not null check (capacite between 2 and 12),
  -- SHA-256 du cookie de l'hôte. C'est lui, et lui seul, qui verrouille le
  -- lobby et qui voit le code de partage.
  creator_token_hash text not null
    check (creator_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  -- `not null` : un lobby sans date de mort est un lobby immortel, et la garde
  -- 3 de l'en-tête cesserait d'exister pour lui.
  expires_at timestamptz not null,
  -- La composite dont `player_lobby_members` a besoin. Elle porte `id` en tête,
  -- donc elle ne sert PAS d'index d'organisation : celui-là est posé plus bas.
  constraint player_lobbies_org_unique unique (id, organization_id),
  -- DUO NE NÉGOCIE PAS SA CAPACITÉ. Écrit en `check` et non seulement dans la
  -- RPC : un duo à trois places serait un Duo Miroir sans miroir, et L17 le
  -- découvrirait à l'exécution.
  constraint player_lobbies_duo_fige check (kind <> 'duo' or capacite = 2),
  -- LE PLAFOND DUR DE VINGT-QUATRE HEURES (garde 3). Écrit en SOUSTRACTION et
  -- non en `expires_at <= created_at + interval '24 hours'` : l'addition
  -- `timestamptz + interval` est STABLE (elle dépend du fuseau pour les
  -- composantes jour et mois), et Postgres refuse une fonction non IMMUTABLE
  -- dans un `check`. La soustraction `timestamptz - timestamptz`, elle, est
  -- immutable. Même borne, et elle s'installe.
  constraint player_lobbies_ttl_borne check (
    expires_at > created_at
    and expires_at - created_at <= interval '24 hours'
  )
);

comment on table public.player_lobbies is
  'Salle d''attente d''une session joueur gratuite (L16, socle de L17 Duo '
  'Miroir et L18 Portrait de la Bande). Un lobby = un code court non rejouable, '
  'une capacité, une date de mort. Les gardes d''ADR-109 §A4 vivent ici : quota '
  'par organisation dans create_player_lobby, TTL en colonne, plafond dur de 24 h '
  'en check. L''expiration se CONSTATE à la lecture (ADR-111), aucun worker ne '
  'l''écrit. RLS active et AUCUNE policy : service_role seul, tout passe par les '
  'RPC de 20261017120000 (motif vitrine_translations).';
comment on column public.player_lobbies.join_code is
  'Code de partage à six caractères, alphabet sans I/O/0/1 parce qu''il se dicte '
  'à voix haute. Unique sur TOUTE la table, donc résolvable sans organisation — '
  'c''est ce qui permet à join_player_lobby de ne rien demander d''autre. Non '
  'rejouable après expiration : le lobby mort garde son code, et le code mort '
  'rend le MÊME refus qu''un code jamais né.';
comment on column public.player_lobbies.expires_at is
  'Date de mort. 30 minutes à la création, portée à 4 heures par '
  'lock_player_lobby, jamais au-delà de created_at + 24 h (check '
  'player_lobbies_ttl_borne). C''est aussi le DERNIER INSTANT CONNU du lobby : '
  'purge_expired_lobbies date son seuil dessus, jamais sur now() (ADR-111).';
comment on column public.player_lobbies.creator_token_hash is
  'SHA-256 du cookie de l''hôte. Seul ce hash verrouille le lobby et se voit '
  'rendre join_code par lobby_state. Ce n''est PAS l''identité globale du joueur : '
  'le cookie est propre au lobby (motif event_players).';

alter table public.player_lobbies enable row level security;

-- Ceinture et bretelles, motif `vitrine_translations` : depuis 20260930120000
-- les privilèges par défaut ne servent plus `authenticated` (00021 avait fait
-- de même pour `anon`), donc la table naît déjà nue. Le `revoke` explicite
-- reste écrit parce qu'une garde qui dépend d'une migration d'il y a trois
-- semaines est une garde qu'on ne relit pas.
revoke all on table public.player_lobbies from public, anon, authenticated;

-- L'index du QUOTA, et il est aussi l'index de tête de `organization_id` que la
-- FK vers `organizations` n'aurait pas eu (`player_lobbies_org_unique` porte
-- `id` en tête). Les trois colonnes sont exactement le prédicat de comptage de
-- `create_player_lobby`.
create index player_lobbies_org_actifs_idx
  on public.player_lobbies (organization_id, status, expires_at);

-- L'index de la PURGE. Elle balaie par date de mort et par elle seule ;
-- l'index ci-dessus, mené par l'organisation, ne l'aiderait pas.
create index player_lobbies_expires_idx
  on public.player_lobbies (expires_at);


-- ────────────────────────────────────────────────────────────
-- 2. `player_lobby_members` — qui attend là
-- ────────────────────────────────────────────────────────────

create table public.player_lobby_members (
  id uuid primary key default gen_random_uuid(),
  -- PAS de `references public.player_lobbies(id)` simple : la seule FK vers le
  -- lobby est la COMPOSITE ci-dessous. C'est le motif du dépôt
  -- (`fk_composites_couverture.test.sql`) : une FK simple entre deux tables
  -- tenant-scopées laisse le locataire à la garde du code applicatif, la
  -- composite le fait tenir par la base.
  lobby_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  -- SHA-256 du cookie PAR LOBBY (motif event_players). Jamais l'identité
  -- globale `lc-player` en clair : la base ne doit pas pouvoir recoudre les
  -- lobbies d'une même personne.
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Détouré puis borné 1..24, comme `event_players.pseudo`. Il s'affiche à tous
  -- les membres du lobby : c'est la seule donnée personnelle de ce fichier, et
  -- elle est saisie pour être vue.
  pseudo text not null
    check (pg_catalog.char_length(pg_catalog.btrim(pseudo)) between 1 and 24),
  -- `clock_timestamp()` et NON `now()`, seul écart assumé au motif du dépôt.
  -- Raison : `now()` rend l'instant de DÉBUT DE TRANSACTION, donc deux membres
  -- écrits dans la même transaction porteraient le MÊME `joined_at` — et le
  -- rang, qui est l'ordre d'arrivée, retomberait sur l'ordre arbitraire des
  -- uuid. L'hôte cesserait d'être le premier une fois sur deux, et les tests
  -- pgTAP (une seule transaction) ne verraient jamais de rang stable.
  joined_at timestamptz not null default pg_catalog.clock_timestamp(),
  -- UNE identité, UNE place. C'est cette contrainte qui rend `join` idempotent
  -- même si la RPC était contournée.
  unique (lobby_id, token_hash),
  foreign key (lobby_id, organization_id)
    references public.player_lobbies(id, organization_id) on delete cascade
);

comment on table public.player_lobby_members is
  'Les joueurs présents dans un lobby (L16). Une ligne = une empreinte de cookie '
  'PROPRE AU LOBBY et un pseudo affiché. La FK vers le lobby est COMPOSITE '
  '(lobby_id, organization_id) : le locataire tient par la base, pas par le code '
  'appelant. Cascade à la suppression du lobby, donc purge_expired_lobbies '
  'efface la session privée éphémère en même temps que la salle. RLS active et '
  'AUCUNE policy : service_role seul, par RPC.';
comment on column public.player_lobby_members.joined_at is
  'Ordre d''arrivée, et c''est LUI qui fait le rang. clock_timestamp() et non '
  'now() : deux membres écrits dans la même transaction doivent garder un ordre '
  'vrai, sans quoi le rang deviendrait l''ordre des uuid.';

alter table public.player_lobby_members enable row level security;

revoke all on table public.player_lobby_members from public, anon, authenticated;

-- Index de tête de `organization_id` (FK vers `organizations`). Le chemin par
-- `lobby_id` est déjà couvert par `unique (lobby_id, token_hash)`.
create index player_lobby_members_org_idx
  on public.player_lobby_members (organization_id);


-- ────────────────────────────────────────────────────────────
-- 3. Le code de partage — motif `event_sessions_set_join_code`
--
-- BEFORE INSERT SECURITY DEFINER : alphabet sans ambiguïté, douze tentatives
-- pour éviter une collision (la contrainte unique reste le filet). N'écrase pas
-- un code fourni — c'est ce qui rend les fixtures et le seed déterministes.
-- ────────────────────────────────────────────────────────────

create or replace function public.player_lobbies_set_join_code()
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
    if not exists (select 1 from public.player_lobbies l where l.join_code = v_code) then
      new.join_code := v_code;
      return new;
    end if;
  end loop;
  raise exception 'lobby join code generation exhausted';
end;
$$;

revoke all on function public.player_lobbies_set_join_code()
  from public, anon, authenticated;

create trigger player_lobbies_set_join_code
  before insert on public.player_lobbies
  for each row execute function public.player_lobbies_set_join_code();


-- ────────────────────────────────────────────────────────────
-- 4. `player_lobby_rang` — LA formule du rang, écrite UNE FOIS
--
-- Motif `queue_entry_position` (20261005120000) : deux formules de rang
-- montreraient deux rangs différents de la même personne sur deux écrans
-- ouverts en même temps. Celle-ci est appelée par `join_player_lobby` ET par
-- `lobby_state`, et par personne d'autre.
--
-- Accordée à AUCUN rôle applicatif, `service_role` compris : elle n'a de sens
-- qu'à l'intérieur des RPC, qui l'exécutent avec les privilèges de leur
-- propriétaire.
-- ────────────────────────────────────────────────────────────

create or replace function public.player_lobby_rang(
  p_lobby_id uuid,
  p_joined_at timestamptz,
  p_member_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- Comparaison de N-uplets : `joined_at` d'abord, `id` en départage. Douze
  -- membres au maximum, donc le coût quadratique est celui d'une boucle de
  -- douze — et il achète une formule unique.
  select pg_catalog.count(*)::integer
    from public.player_lobby_members m
   where m.lobby_id = p_lobby_id
     and (m.joined_at, m.id) <= (p_joined_at, p_member_id);
$$;

revoke all on function public.player_lobby_rang(uuid, timestamptz, uuid)
  from public, anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 5. `create_player_lobby` — ouvrir une salle
--
-- CONTRAT :
--   {"state":"created","lobby_id":uuid,"join_code":text,"expires_at":timestamptz}
--   {"state":"quota"}        — 20 lobbies actifs déjà ouverts par ce commerce
--   {"state":"unavailable"}  — organisation inconnue OU sans le module vitrine
--
-- `unavailable` couvre les deux derniers cas d'un seul mot, et c'est délibéré :
-- distinguer « ce commerce n'existe pas » de « ce commerce n'a pas payé »
-- donnerait à un appelant public un oracle sur le carnet de commandes d'en
-- face.
--
-- POURQUOI LE MODULE `vitrine` : les lobbies sont les jeux de la Vitrine, et
-- ADR-109 §A1 a tranché un entitlement unique pour toute la Vitrine. Un
-- deuxième droit ne serait pas plus sûr, seulement plus long à vérifier.
-- ────────────────────────────────────────────────────────────

create or replace function public.create_player_lobby(
  p_organization_id uuid,
  p_kind text,
  p_capacite integer,
  p_creator_token_hash text,
  p_pseudo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacite integer;
  v_pseudo text;
  v_actifs integer;
  v_lobby public.player_lobbies%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- Organisation ABSENTE = bogue de l'appelant, pas un refus métier : on le dit
  -- fort (motif `enter_reservation_queue`). Organisation PRÉSENTE MAIS SANS
  -- DROIT = refus métier muet, traité plus bas.
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_creator_token_hash is null
     or p_creator_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('duo', 'bande') then
    raise exception 'invalid lobby kind' using errcode = '22023';
  end if;

  -- LE PSEUDO EST REFUSÉ, PAS TRONQUÉ — et c'est l'inverse du choix fait pour
  -- la file d'attente. Raison : la personne en file est DEBOUT DANS LE MAGASIN
  -- et on ne lui fait pas payer un prénom de 41 caractères ; l'hôte d'un lobby
  -- est devant un clavier et peut corriger. Le `check` de la table dit la même
  -- chose, donc un refus ici est un refus lisible plutôt qu'une violation de
  -- contrainte remontée brute.
  v_pseudo := pg_catalog.btrim(coalesce(p_pseudo, ''));
  if pg_catalog.char_length(v_pseudo) < 1
     or pg_catalog.char_length(v_pseudo) > 24 then
    raise exception 'invalid pseudo' using errcode = '22023';
  end if;

  -- DUO NE NÉGOCIE PAS SA CAPACITÉ : le paramètre est ignoré, pas contesté. Le
  -- `check` de la table refuserait de toute façon un duo à trois, mais un refus
  -- de base n'est pas une réponse — et un Duo Miroir n'a jamais eu besoin qu'on
  -- lui demande combien il est.
  v_capacite := case when p_kind = 'duo' then 2 else p_capacite end;
  if v_capacite is null or v_capacite < 2 or v_capacite > 12 then
    raise exception 'invalid capacity' using errcode = '22023';
  end if;

  if not public.org_has_module_access(p_organization_id, 'vitrine') then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE VERROU D'ABORD, LE COMPTAGE ENSUITE — motif `enter_reservation_queue` :
  -- le plafond est lu dans le MÊME instantané que la décision de l'appliquer.
  -- Sans lui, vingt appels simultanés liraient tous « 19 actifs » et ouvriraient
  -- tous leur lobby : le quota d'ADR-109 §A4 n'existerait que sur le papier.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('player_lobby:' || p_organization_id::text, 0)
  );

  -- « Actif » = ni clos, ni mort. L'expiration se CONSTATE ici aussi (ADR-111) :
  -- un lobby dépassé cesse de peser sur le quota sans qu'aucun cron l'ait
  -- touché, donc une panne de purge ne bloque jamais un commerce.
  select pg_catalog.count(*)::integer into v_actifs
    from public.player_lobbies l
   where l.organization_id = p_organization_id
     and l.status in ('lobby', 'locked')
     and l.expires_at > pg_catalog.now();

  if v_actifs >= 20 then
    return pg_catalog.jsonb_build_object('state', 'quota');
  end if;

  insert into public.player_lobbies
    (organization_id, kind, capacite, creator_token_hash, expires_at)
  values
    (p_organization_id, p_kind, v_capacite, p_creator_token_hash,
     pg_catalog.now() + interval '30 minutes')
  returning * into v_lobby;

  -- L'HÔTE EST MEMBRE DE SON PROPRE LOBBY, et c'est un invariant du modèle : un
  -- lobby sans membre n'a pas de rang 1, `lock_player_lobby` compterait faux, et
  -- l'hôte ne se verrait pas dans sa propre salle.
  insert into public.player_lobby_members
    (lobby_id, organization_id, token_hash, pseudo)
  values (v_lobby.id, p_organization_id, p_creator_token_hash, v_pseudo);

  return pg_catalog.jsonb_build_object(
    'state', 'created',
    'lobby_id', v_lobby.id,
    'join_code', v_lobby.join_code,
    'expires_at', v_lobby.expires_at
  );
end;
$$;

revoke all on function public.create_player_lobby(uuid, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.create_player_lobby(uuid, text, integer, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 6. `join_player_lobby` — entrer par le code
--
-- CONTRAT :
--   {"state":"joined","lobby_id":uuid,"kind":text,"capacite":int,"rang":int}
--   {"state":"unavailable"}  — code inventé, MALFORMÉ, expiré ou clos
--   {"state":"full"}         — capacité atteinte
--   {"state":"locked"}       — l'hôte a fermé la porte
--
-- AUCUNE ORGANISATION EN PARAMÈTRE, et ce n'est pas un oubli : `join_code` est
-- unique sur toute la table, donc il désigne son locataire à lui seul. Exiger
-- l'organisation obligerait l'écran public à la connaître avant d'avoir résolu
-- le code — c'est-à-dire à la deviner.
--
-- L'IDEMPOTENCE : rejouer le même (lobby, token_hash) tant que le lobby est
-- ouvert rend LE MÊME document, au caractère près. Le double-clic sur le bouton
-- « rejoindre » ne crée pas deux places.
-- ────────────────────────────────────────────────────────────

create or replace function public.join_player_lobby(
  p_join_code text,
  p_token_hash text,
  p_pseudo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_pseudo text;
  v_id uuid;
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_member public.player_lobby_members%rowtype;
  v_membres integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  v_pseudo := pg_catalog.btrim(coalesce(p_pseudo, ''));
  if pg_catalog.char_length(v_pseudo) < 1
     or pg_catalog.char_length(v_pseudo) > 24 then
    raise exception 'invalid pseudo' using errcode = '22023';
  end if;

  -- UN CODE MALFORMÉ REND LE MÊME DOCUMENT QU'UN CODE INCONNU, il ne LÈVE PAS.
  -- Une exception ici serait un oracle de forme : elle apprendrait à qui sonde
  -- que « ZZZ » n'a jamais pu être un code alors que « ZZZZZZ » aurait pu.
  v_code := pg_catalog.upper(pg_catalog.btrim(coalesce(p_join_code, '')));
  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LOCALISATION, JAMAIS DÉCISION. Cette lecture ne sert qu'à trouver la CLÉ du
  -- verrou : tout ce qui décide (statut, capacité, expiration) est relu après.
  select l.id, l.organization_id into v_id, v_org
    from public.player_lobbies l
   where l.join_code = v_code;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Verrou par ORGANISATION + LOBBY : deux entrées simultanées dans le même
  -- lobby se sérialisent, deux entrées dans des lobbies différents ne
  -- s'attendent pas. C'est ce verrou qui rend le comptage de capacité vrai.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || v_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = v_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- L'EXPIRATION EST CONSTATÉE ICI, À LA LECTURE (ADR-111). Aucune écriture :
  -- ce n'est pas au premier curieux de dater la mort du lobby.
  if v_lobby.status in ('closed', 'expired')
     or v_lobby.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  -- `locked` PASSE AVANT L'IDEMPOTENCE, délibérément : une fois la porte
  -- fermée, elle l'est pour tout le monde, y compris pour qui est déjà dedans.
  -- Un membre d'un lobby verrouillé lit son état par `lobby_state`, pas en
  -- frappant à une porte close.
  if v_lobby.status = 'locked' then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  -- IDEMPOTENCE, ET ELLE PASSE AVANT LE COMPTAGE. Sous le verrou, donc deux
  -- appels simultanés de la MÊME identité n'insèrent pas deux lignes : le
  -- second attend et voit la première. L'index unique refuserait de toute
  -- façon la seconde, mais un refus de base n'est pas une réponse.
  select m.* into v_member
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id
     and m.token_hash = p_token_hash;

  if not found then
    select pg_catalog.count(*)::integer into v_membres
      from public.player_lobby_members m
     where m.lobby_id = v_lobby.id;
    if v_membres >= v_lobby.capacite then
      return pg_catalog.jsonb_build_object('state', 'full');
    end if;
    insert into public.player_lobby_members
      (lobby_id, organization_id, token_hash, pseudo)
    values (v_lobby.id, v_lobby.organization_id, p_token_hash, v_pseudo)
    returning * into v_member;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'joined',
    'lobby_id', v_lobby.id,
    'kind', v_lobby.kind,
    'capacite', v_lobby.capacite,
    'rang', public.player_lobby_rang(
              v_member.lobby_id, v_member.joined_at, v_member.id)
  );
end;
$$;

revoke all on function public.join_player_lobby(text, text, text)
  from public, anon, authenticated;
grant execute on function public.join_player_lobby(text, text, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 7. `lobby_state` — ce que voit quelqu'un qui est DEDANS
--
-- CONTRAT :
--   {"state":"ok","status":text,"kind":text,"capacite":int,
--    "expires_at":timestamptz,"join_code":text|null,
--    "membres":[{"pseudo":text,"rang":int,"est_moi":bool}]}
--   {"state":"unavailable"}  — lobby inconnu OU jeton non membre
--
-- L'APPARTENANCE EST EXIGÉE, et son absence rend le refus INDISTINCT de celui
-- d'un lobby inconnu. Sans cela, un identifiant de lobby volé suffirait à
-- lire les pseudos de gens qui n'ont rien demandé.
--
-- `join_code` N'EST RENDU QU'À L'HÔTE. Un membre ordinaire n'a pas à pouvoir
-- rameuter la ville dans un lobby qu'il n'a pas ouvert. La clé reste présente
-- avec la valeur `null` pour les autres : un document de forme stable se type
-- une fois côté application, là où une clé qui apparaît et disparaît se teste
-- à chaque lecture.
--
-- AUCUN HASH NE SORT. Les pseudos sortent — ils sont saisis pour être vus —
-- mais `token_hash` et `creator_token_hash` restent dans la base, sans quoi un
-- membre pourrait rejouer l'identité d'un autre.
-- ────────────────────────────────────────────────────────────

create or replace function public.lobby_state(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby public.player_lobbies%rowtype;
  v_est_hote boolean;
  v_statut text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  -- Identifiant absent : le même refus muet que tout le reste. Il n'y a rien à
  -- crier ici — contrairement à `create_player_lobby`, un `null` peut venir
  -- d'un cookie effacé plutôt que d'un bogue.
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_est_hote := v_lobby.creator_token_hash = p_token_hash;

  -- L'EXPIRATION EST AFFICHÉE, PAS ÉCRITE (ADR-111). `status` reste `lobby` ou
  -- `locked` en base ; c'est la lecture qui dit « expired ». Écrire ici
  -- daterait l'expiration du moment où quelqu'un a rouvert l'onglet.
  v_statut := case
    when v_lobby.status in ('lobby', 'locked')
         and v_lobby.expires_at <= pg_catalog.now() then 'expired'
    else v_lobby.status
  end;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'status', v_statut,
    'kind', v_lobby.kind,
    'capacite', v_lobby.capacite,
    'expires_at', v_lobby.expires_at,
    'join_code', case when v_est_hote then v_lobby.join_code else null end,
    'membres', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'pseudo', m.pseudo,
                 'rang', public.player_lobby_rang(
                           m.lobby_id, m.joined_at, m.id),
                 'est_moi', m.token_hash = p_token_hash)
               order by public.player_lobby_rang(
                          m.lobby_id, m.joined_at, m.id))
        from public.player_lobby_members m
       where m.lobby_id = v_lobby.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.lobby_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.lobby_state(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 8. `lock_player_lobby` — fermer la porte
--
-- CONTRAT :
--   {"state":"locked","expires_at":timestamptz}
--   {"state":"unavailable"}  — TOUT le reste
--
-- LE REFUS EST UN SEUL MOT, y compris pour « vous êtes encore seul ». C'est le
-- choix d'ADR-109 §A4 tel qu'il est arbitré pour ce lot, et il ne coûte rien à
-- l'écran : `lobby_state` rend déjà la liste des membres à l'hôte, donc
-- l'interface sait AVANT de cliquer qu'elle doit désactiver le bouton. Cette
-- RPC est le filet, pas le message.
--
-- LA PROLONGATION EST BORNÉE DEUX FOIS : `least` la plafonne à
-- `created_at + 24 h`, et le `check` de la table refuserait le dépassement
-- même si ce `least` disparaissait un jour. La ceinture ET les bretelles,
-- parce que c'est la garde 3 d'ADR-109 §A4.
-- ────────────────────────────────────────────────────────────

create or replace function public.lock_player_lobby(
  p_lobby_id uuid,
  p_creator_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
  v_membres integer;
  v_expires timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_creator_token_hash is null
     or p_creator_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Localisation, jamais décision — même motif que `join_player_lobby`.
  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- LE MÊME VERROU QUE `join_player_lobby`, sur la MÊME clé : sans quoi un
  -- treizième joueur pourrait entrer entre le comptage et le verrouillage, et
  -- la partie démarrerait à une place de plus que ce que l'hôte a vu.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found
     or v_lobby.creator_token_hash <> p_creator_token_hash
     or v_lobby.status <> 'lobby'
     or v_lobby.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select pg_catalog.count(*)::integer into v_membres
    from public.player_lobby_members m
   where m.lobby_id = v_lobby.id;
  if v_membres < 2 then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- `least` NON qualifié : ce n'est pas une fonction du catalogue, la qualifier
  -- en `pg_catalog.` casserait à l'exécution (garde `npm run sql:check`).
  v_expires := least(
    pg_catalog.now() + interval '4 hours',
    v_lobby.created_at + interval '24 hours'
  );

  update public.player_lobbies l
     set status = 'locked',
         expires_at = v_expires
   where l.id = v_lobby.id;

  return pg_catalog.jsonb_build_object(
    'state', 'locked',
    'expires_at', v_expires
  );
end;
$$;

revoke all on function public.lock_player_lobby(uuid, text)
  from public, anon, authenticated;
grant execute on function public.lock_player_lobby(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 9. `leave_player_lobby` — partir de soi-même
--
-- CONTRAT :
--   {"state":"left"}    — vous n'êtes plus dedans (que vous y ayez été ou non)
--   {"state":"locked"}  — la partie a commencé, ce lot n'y touche pas
--
-- LE DOCUMENT NE DIT RIEN DE PLUS, et c'est ce qui le rend à la fois idempotent
-- et muet. Rendre « j'ai fermé le lobby » ferait diverger le premier appel du
-- second ; rendre le statut du lobby apprendrait à un non-membre ce qu'il n'a
-- pas le droit de savoir. Les membres RESTÉS voient la fermeture par
-- `lobby_state` — celui qui part, lui, n'a plus rien à voir.
--
-- L'HÔTE QUI PART FERME LA SALLE. Un lobby sans hôte n'attend personne : son
-- code resterait vivant, il pèserait sur le quota de l'organisation, et il
-- accueillerait des gens que plus personne ne peut faire jouer.
--
-- EN `locked`, LE DÉPART N'ÉCRIT RIEN DU TOUT. Retirer un membre d'une partie
-- commencée est une décision de L17 / L18 — eux savent ce qu'un joueur manquant
-- fait à un Duo Miroir ou à un Portrait de la Bande. Ce lot ne la prend pas à
-- leur place, et surtout ne la prend pas par défaut.
-- ────────────────────────────────────────────────────────────

create or replace function public.leave_player_lobby(
  p_lobby_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lobby public.player_lobbies%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;
  if p_lobby_id is null then
    return pg_catalog.jsonb_build_object('state', 'left');
  end if;

  select l.organization_id into v_org
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'left');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player_lobby:' || v_org::text || ':' || p_lobby_id::text, 0)
  );

  select l.* into v_lobby
    from public.player_lobbies l
   where l.id = p_lobby_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'left');
  end if;

  -- L'APPARTENANCE EST TESTÉE AVANT LE STATUT, sans quoi un inconnu apprendrait
  -- par la différence entre `left` et `locked` qu'une partie est en cours ici.
  if not exists (
    select 1 from public.player_lobby_members m
     where m.lobby_id = v_lobby.id
       and m.token_hash = p_token_hash
  ) then
    return pg_catalog.jsonb_build_object('state', 'left');
  end if;

  if v_lobby.status = 'locked' then
    return pg_catalog.jsonb_build_object('state', 'locked');
  end if;

  delete from public.player_lobby_members m
   where m.lobby_id = v_lobby.id
     and m.token_hash = p_token_hash;

  if v_lobby.status = 'lobby'
     and v_lobby.creator_token_hash = p_token_hash then
    update public.player_lobbies l
       set status = 'closed'
     where l.id = v_lobby.id;
  end if;

  return pg_catalog.jsonb_build_object('state', 'left');
end;
$$;

revoke all on function public.leave_player_lobby(uuid, text)
  from public, anon, authenticated;
grant execute on function public.leave_player_lobby(uuid, text)
  to service_role;


-- ────────────────────────────────────────────────────────────
-- 10. `purge_expired_lobbies` — effacer la session privée éphémère
--
-- CONTRAT : `bigint`, le nombre de lobbies effacés. Les membres partent en
-- CASCADE, donc la purge efface la salle ET les gens qui y étaient — c'est le
-- sens de « session privée éphémère » : elle ne survit pas au lobby.
--
-- LE SEUIL EST DATÉ AU DERNIER INSTANT CONNU, JAMAIS À `now()` (ADR-111). Un
-- lobby s'efface vingt-quatre heures après SA date de mort, pas vingt-quatre
-- heures après le passage du cron. Deux conséquences :
--
--   · un cron en retard de trois jours efface exactement ce qu'il aurait
--     effacé à l'heure, ni plus ni moins ;
--   · un lobby CLOS tôt (l'hôte est parti au bout de deux minutes) garde la
--     date de mort qu'il avait — donc il survit jusqu'à `created_at + 30 min
--     + 24 h`. C'est délibéré : `closed` et `expired` se datent du MÊME champ,
--     parce qu'il n'existe pas d'autre « dernier instant connu » d'un lobby.
--     Une colonne `closed_at` serait le seul moyen de faire mieux, et elle
--     ferait dépendre la purge d'une écriture supplémentaire qui peut manquer.
--
-- LE CÂBLAGE CRON EST AU BACKEND. Cette fonction ne se planifie pas elle-même :
-- elle est rendue à `service_role`, et c'est tout ce que la base a à en dire.
-- ────────────────────────────────────────────────────────────

create or replace function public.purge_expired_lobbies()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.player_lobbies l
   where l.expires_at < pg_catalog.now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_lobbies()
  from public, anon, authenticated;
grant execute on function public.purge_expired_lobbies()
  to service_role;
