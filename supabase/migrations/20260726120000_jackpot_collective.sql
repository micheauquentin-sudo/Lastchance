-- ============================================================
-- Lastchance — Module « Jackpot collectif »
--
-- Addon d'organisation (miroir EXACT d'addon_loyalty / addon_hunts) :
-- une CAMPAGNE jackpot expose une JAUGE PARTAGÉE — un compteur global que
-- TOUS les joueurs incrémentent (1 participation = +1). Trois modes de
-- résolution, au choix du commerçant :
--   · threshold_draw : à `threshold` atteint, tirage au sort automatique
--     parmi les participants du cycle → 1 gagnant, puis nouveau cycle ;
--   · rescan_win     : à `threshold` atteint le jackpot est ARMÉ ; chaque
--     participation suivante gagne INSTANTANÉMENT avec la probabilité
--     `win_probability` (défaut 1/threshold) → 1 gagnant → reset ;
--   · date_draw      : tirage à `draw_at` parmi tous les participants ; le
--     seuil n'est qu'un objectif d'affichage.
--
-- Anti-triche : RÉUTILISATION du modèle du Passeport de fidélité
-- (20260725120000 → 20260725200000), sans le modifier (miroir, pas
-- extraction — on ne régresse pas un module en production) :
--   · deux modes de validation par campagne — `rotating_code` (code type
--     TOTP recalculé serveur, secret jamais exposé, fenêtre de 2 périodes)
--     ou `staff` (jeton de check-in signé validé par un membre autorisé,
--     l'identité du validateur est exigée par la RPC) ;
--   · cooldown `min_participation_interval_seconds` par joueur, avec le MÊME
--     plancher durci que la fidélité (loyalty_programs_cooldown_floor_check,
--     état final 20260725180000) : >= 300 s dans les deux modes et
--     >= 2·période en rotating_code ;
--   · identité joueur = cookie HTTP-only côté app, seul le hash SHA-256 du
--     jeton touche la base (jackpot_players, aucune PII).
--
-- Économie (ADR-031, appliqué d'emblée) : `reward_stock` FINI et OBLIGATOIRE
--   = nombre de gagnants/cycles autorisés. À épuisement, la campagne ne tire
--   plus (état out_of_stock, aucune sur-émission). Contrairement à la
--   fidélité, la frappe d'identités n'a AUCUN rendement ici : le jackpot ne
--   produit qu'UN gagnant par cycle quel que soit le nombre de participants —
--   fabriquer N cookies ne crée pas N lots, cela ne fait qu'ajouter N entrées
--   qui se disputent le MÊME tirage. Le stock fini borne le nombre total de
--   lots ; l'unicité (campaign_id, cycle) sur jackpot_wins borne à 1 le
--   nombre de gagnants par cycle. Aucun seau fail-closed n'est nécessaire.
--
-- Contention : la jauge est PARTAGÉE. record_jackpot_participation verrouille
--   la ligne de campagne (select … for update) : l'incrément et le tirage
--   sont donc atomiques et sérialisés — un seul gagnant possible. Ce verrou
--   ne « ferme » jamais la participation (il sérialise, il ne rejette pas) ;
--   il ne doit PAS être doublé côté applicatif d'un rate-limit fail-closed sur
--   la clé partagée (ADR-032 — la jauge ne doit jamais devenir un
--   interrupteur). À relayer au backend.
--
-- Sécurité : même modèle que Fidélité / Chasse / Pronostics —
--   · AUCUN droit anon : le parcours public passe par le service role
--     (server actions) via record_jackpot_participation ; la page publique
--     lit la jauge par un SELECT service role, jamais en anon direct ;
--   · gestion commerçant (CRUD campagnes) sous RLS is_org_editor, lecture
--     d'équipe (stats, caisse) sous is_org_member ;
--   · remise en caisse par RPC dédiée redeem_jackpot_prize (même contrat que
--     redeem_loyalty_reward : atomique, auditée, org-scopée, erreur
--     générique) ;
--   · purge RGPD : purge_expired_jackpot_players (à brancher au cron
--     purge-data), miroir de purge_expired_loyalty_members.
-- ============================================================

-- ── Addon d'organisation ─────────────────────────────────────
alter table public.organizations
  add column addon_jackpot boolean not null default false;

-- `organizations` utilise des grants de colonnes (00017) : une colonne
-- ajoutée ensuite n'est pas lisible automatiquement par authenticated.
grant select (addon_jackpot) on public.organizations to authenticated;

comment on column public.organizations.addon_jackpot is
  'Module Jackpot collectif activé depuis le back-office (option payante, ou incluse dans un plan)';

-- ── Campagnes jackpot ────────────────────────────────────────
create table public.jackpot_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  -- URL publique suivable (page marchand partagée). Nullable : le backend la
  -- pose à l'activation ; la page publique peut sinon cibler l'id.
  public_slug text unique
    check (public_slug is null or public_slug ~ '^[a-z0-9-]{3,64}$'),

  -- Mode de validation d'une participation (miroir loyalty_programs).
  validation_mode text not null default 'staff'
    check (validation_mode in ('rotating_code', 'staff')),
  -- Secret du code tournant (style TOTP). NE SORT JAMAIS côté client (grant
  -- de colonne exclu pour authenticated) ; rempli à l'insertion par le
  -- trigger jackpot_campaigns_set_secret (SECURITY DEFINER).
  rotating_secret bytea,
  -- Période de rotation (15 à 300 s, plafond durci comme la fidélité : un
  -- code reste acceptable 2 périodes, donc une période longue allonge la
  -- fenêtre de devinette et de relais).
  rotating_period_seconds integer not null default 60
    check (rotating_period_seconds between 15 and 300),
  -- Cooldown anti-abus par joueur (défaut 24 h). Plancher par mode ci-dessous.
  min_participation_interval_seconds integer not null default 86400
    check (min_participation_interval_seconds between 0 and 604800),

  -- Mode de résolution du jackpot.
  draw_mode text not null default 'threshold_draw'
    check (draw_mode in ('threshold_draw', 'rescan_win', 'date_draw')),
  -- Objectif de la jauge. threshold_draw / rescan_win : déclencheur du
  -- tirage ; date_draw : simple objectif d'affichage.
  threshold integer not null default 100 check (threshold >= 1),
  -- rescan_win : probabilité de gain instantané une fois armé (null = défaut
  -- 1/threshold, calculé dans la RPC). Contrainte de cohérence par mode.
  win_probability numeric,
  -- date_draw : instant du tirage. Contrainte de cohérence par mode.
  draw_at timestamptz,

  -- Récompense : lot unique remis en caisse (code JACKPOT-…). VERROU
  -- ÉCONOMIQUE (ADR-031) : stock FINI et OBLIGATOIRE = nombre de gagnants /
  -- cycles autorisés. 0 = « en pause / épuisé », état non destructeur.
  reward_label text not null default ''
    check (char_length(btrim(reward_label)) <= 120),
  reward_details text
    check (reward_details is null or char_length(reward_details) <= 2000),
  reward_stock integer not null check (reward_stock >= 0),
  -- Lots déjà émis (RPC-only : record_jackpot_participation /
  -- run_jackpot_date_draws). C'est le compteur qui borne reward_stock.
  reward_claimed_count integer not null default 0
    check (reward_claimed_count >= 0),

  -- Jackpot croissant : champs d'AFFICHAGE purement cosmétiques. Le montant
  -- montré = display_base_cents + current_count · display_increment_cents.
  -- Le vrai lot reste le lot fini ci-dessus.
  display_base_cents integer not null default 0 check (display_base_cents >= 0),
  display_increment_cents integer not null default 0
    check (display_increment_cents >= 0),
  -- Contenu marchand affiché sur la page publique (offres, soirées…).
  merchant_content text
    check (merchant_content is null or char_length(merchant_content) <= 4000),

  -- Jauge PARTAGÉE dénormalisée (compteur du cycle courant) et n° de cycle.
  -- Maintenus par record_jackpot_participation / run_jackpot_date_draws
  -- uniquement (RPC-only) : incrément atomique sous le verrou de la ligne.
  current_count integer not null default 0 check (current_count >= 0),
  cycle integer not null default 1 check (cycle >= 1),
  created_at timestamptz not null default now(),

  -- Support des FK composites tenant (même modèle que loyalty / hunts).
  unique (id, organization_id),

  -- Cohérence mode ↔ champs (écrite en implications, même style que
  -- loyalty_milestones_reward_stock_check).
  constraint jackpot_campaigns_win_probability_check check (
    (draw_mode = 'rescan_win'
     and (win_probability is null
          or (win_probability > 0 and win_probability <= 1)))
    or (draw_mode <> 'rescan_win' and win_probability is null)
  ),
  constraint jackpot_campaigns_draw_at_check check (
    (draw_mode = 'date_draw' and draw_at is not null)
    or (draw_mode <> 'date_draw' and draw_at is null)
  ),
  -- Plancher de cooldown, MIROIR de loyalty_programs_cooldown_floor_check
  -- (état final 20260725180000) : rotating_code >= max(300, 2·période) —
  -- un code observé ne se rejoue pas en boucle ; staff >= 300 — au moins la
  -- TTL du jeton de check-in plus marge, ce jeton n'étant pas à usage unique.
  constraint jackpot_campaigns_cooldown_floor_check check (
    (validation_mode <> 'rotating_code'
     or (min_participation_interval_seconds >= 300
         and min_participation_interval_seconds >= 2 * rotating_period_seconds))
    and
    (validation_mode <> 'staff'
     or min_participation_interval_seconds >= 300)
  )
);

comment on table public.jackpot_campaigns is
  'Campagne de jackpot collectif : jauge PARTAGÉE (current_count) que tous les joueurs incrémentent, 3 modes de résolution (threshold_draw / rescan_win / date_draw), lot unique fini avec code JACKPOT-…. Parcours joueur via RPC service role uniquement.';
comment on column public.jackpot_campaigns.reward_stock is
  'Stock du lot — OBLIGATOIRE et FINI (ADR-031) : nombre de gagnants / cycles autorisés. La perte maximale d''une campagne vaut exactement ce stock, quel que soit le nombre de participants (le jackpot ne produit qu''un gagnant par cycle). 0 = épuisé / en pause. À épuisement, plus aucun tirage.';
comment on column public.jackpot_campaigns.current_count is
  'Jauge PARTAGÉE du cycle courant (dénormalisée). Incrémentée atomiquement de +1 par participation sous le verrou de la ligne (record_jackpot_participation) ; remise à 0 à chaque nouveau cycle. RPC-only.';

create index jackpot_campaigns_org_idx on public.jackpot_campaigns (organization_id);

-- ── Joueurs (identité passeport, hash du jeton — aucune PII) ──
create table public.jackpot_players (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Hash SHA-256 du jeton remis au navigateur (miroir loyalty_members).
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  participation_count integer not null default 0 check (participation_count >= 0),
  last_participation_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, token_hash),
  unique (id, campaign_id, organization_id),
  foreign key (campaign_id, organization_id)
    references public.jackpot_campaigns(id, organization_id) on delete cascade
);

comment on table public.jackpot_players is
  'Identité d''un joueur d''une campagne, créée à sa première participation : hash de jeton uniquement, aucune donnée personnelle. Porte l''état de cooldown (last_participation_at) maintenu par record_jackpot_participation.';

create index jackpot_players_org_idx on public.jackpot_players (organization_id);
create index jackpot_players_campaign_idx on public.jackpot_players (campaign_id);

-- ── Participations (les entrées du tirage) ───────────────────
-- Une ligne PAR participation : revenir crée plusieurs entrées = plus de
-- chances au tirage (voulu). Le hash du joueur est dénormalisé ici pour un
-- tirage sur une seule table sous le verrou de campagne.
create table public.jackpot_participants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_token_hash text not null check (player_token_hash ~ '^[0-9a-f]{64}$'),
  -- Cycle auquel appartient l'entrée (le tirage ne considère que le cycle
  -- courant). Dénormalisé depuis jackpot_campaigns.cycle à l'insertion.
  cycle integer not null check (cycle >= 1),
  created_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id)
    references public.jackpot_campaigns(id, organization_id) on delete cascade
);

comment on table public.jackpot_participants is
  'Entrées du tirage : une par participation (revenir = plusieurs entrées = plus de chances). L''ordre déterministe (created_at, id) et le draw_seed journalisé dans jackpot_wins rendent chaque tirage vérifiable a posteriori.';

create index jackpot_participants_org_idx on public.jackpot_participants (organization_id);
-- Index couvrant le tirage : participants d'un cycle donné.
create index jackpot_participants_campaign_cycle_idx
  on public.jackpot_participants (campaign_id, cycle);

-- ── Gains (un gagnant par cycle) ─────────────────────────────
create table public.jackpot_wins (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cycle integer not null check (cycle >= 1),
  -- Hash du jeton du gagnant (miroir : aucune PII). Pas de FK vers
  -- jackpot_players : l'entrée gagnante reste un enregistrement anonyme et
  -- vérifiable même après purge du joueur dormant.
  winner_token_hash text not null check (winner_token_hash ~ '^[0-9a-f]{64}$'),
  -- Code de retrait présenté en caisse. Même alphabet que GAIN-/FIDELITE-…
  -- (sans I/O/0/1), préfixe distinct JACKPOT- pour le routage caisse.
  code text not null unique check (code ~ '^JACKPOT-[A-HJ-NP-Z2-9]{8}$'),
  drawn_at timestamptz not null default now(),
  -- Source crypto journalisée (hex des octets aléatoires du tirage). Combinée
  -- à l'ordre déterministe des participants, elle rend le tirage reproductible
  -- et donc vérifiable (index de pick = int(draw_seed) mod N).
  draw_seed text not null check (draw_seed ~ '^[0-9a-f]+$'),
  redeemed_at timestamptz,
  redeemed_by text check (redeemed_by is null or char_length(redeemed_by) <= 120),
  -- UN SEUL gagnant par cycle : verrou structurel contre la sur-émission,
  -- en plus du verrou de ligne du tirage.
  unique (campaign_id, cycle),
  foreign key (campaign_id, organization_id)
    references public.jackpot_campaigns(id, organization_id) on delete cascade
);

comment on table public.jackpot_wins is
  'Gain d''un cycle : gagnant (hash), code de retrait JACKPOT-… remis via redeem_jackpot_prize, draw_seed pour la vérifiabilité. L''unicité (campaign_id, cycle) garantit un seul gagnant par cycle.';

create index jackpot_wins_org_idx on public.jackpot_wins (organization_id);
create index jackpot_wins_campaign_idx on public.jackpot_wins (campaign_id);

-- ── RLS et grants ────────────────────────────────────────────
alter table public.jackpot_campaigns enable row level security;
alter table public.jackpot_players enable row level security;
alter table public.jackpot_participants enable row level security;
alter table public.jackpot_wins enable row level security;

revoke all on table public.jackpot_campaigns from public, anon, authenticated;
revoke all on table public.jackpot_players from public, anon, authenticated;
revoke all on table public.jackpot_participants from public, anon, authenticated;
revoke all on table public.jackpot_wins from public, anon, authenticated;

-- Gestion (CRUD campagnes) : owners/editors. Lecture d'équipe (stats
-- dashboard, caisse) : tous les membres.
create policy "jackpot_campaigns: member select" on public.jackpot_campaigns
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "jackpot_campaigns: editor write" on public.jackpot_campaigns
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Données joueurs : lecture d'équipe, écritures service role uniquement.
create policy "jackpot_players: member select" on public.jackpot_players
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "jackpot_participants: member select" on public.jackpot_participants
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "jackpot_wins: member select" on public.jackpot_wins
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Campagnes : le SECRET du code tournant, la JAUGE et le CYCLE ne sont ni
-- lisibles-pour-le-secret ni modifiables par une session marchande — grants
-- de colonnes explicites (rotating_secret absent du select ; current_count /
-- cycle / reward_claimed_count absents de insert/update, maintenus RPC-only).
grant select (id, organization_id, name, status, public_slug, validation_mode,
              rotating_period_seconds, min_participation_interval_seconds,
              draw_mode, threshold, win_probability, draw_at,
              reward_label, reward_details, reward_stock, reward_claimed_count,
              display_base_cents, display_increment_cents, merchant_content,
              current_count, cycle, created_at)
  on public.jackpot_campaigns to authenticated;
grant insert (organization_id, name, status, public_slug, validation_mode,
              rotating_period_seconds, min_participation_interval_seconds,
              draw_mode, threshold, win_probability, draw_at,
              reward_label, reward_details, reward_stock,
              display_base_cents, display_increment_cents, merchant_content)
  on public.jackpot_campaigns to authenticated;
grant update (name, status, public_slug, validation_mode,
              rotating_period_seconds, min_participation_interval_seconds,
              draw_mode, threshold, win_probability, draw_at,
              reward_label, reward_details, reward_stock,
              display_base_cents, display_increment_cents, merchant_content)
  on public.jackpot_campaigns to authenticated;
grant delete on public.jackpot_campaigns to authenticated;

-- Données joueurs : lecture seule côté marchand.
grant select on table public.jackpot_players to authenticated;
grant select on table public.jackpot_participants to authenticated;
grant select on table public.jackpot_wins to authenticated;

grant select, insert, update, delete on table public.jackpot_campaigns to service_role;
grant select, insert, update, delete on table public.jackpot_players to service_role;
grant select, insert, update, delete on table public.jackpot_participants to service_role;
grant select, insert, update, delete on table public.jackpot_wins to service_role;

-- Secret du code tournant généré côté serveur (jamais fourni par le
-- marchand). BEFORE INSERT SECURITY DEFINER : s'exécute comme le
-- propriétaire, indépendamment de l'EXECUTE de l'appelant sur pgcrypto.
-- N'écrase pas un secret fourni par le service role (fixtures déterministes).
create or replace function public.jackpot_campaigns_set_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rotating_secret is null then
    new.rotating_secret := extensions.gen_random_bytes(32);
  end if;
  return new;
end;
$$;

revoke all on function public.jackpot_campaigns_set_secret()
  from public, anon, authenticated;

create trigger jackpot_campaigns_set_secret
  before insert on public.jackpot_campaigns
  for each row execute function public.jackpot_campaigns_set_secret();

-- Mutations commerçant auditées, comme campagnes/roues/lots/chasses/fidélité.
create trigger jackpot_campaigns_merchant_audit
  after insert or update or delete on public.jackpot_campaigns
  for each row execute function public.audit_merchant_mutation();

-- ── RPC service role : code tournant courant (écran comptoir) ─
-- Miroir exact de current_loyalty_code : code type TOTP en vigueur pour
-- l'affichage marchand, service role uniquement, jamais exposé à l'anon.
create or replace function public.current_jackpot_code(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret bytea;
  v_period integer;
  v_mode text;
  v_counter bigint;
  v_mac bytea;
  v_off integer;
  v_bin bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select c.rotating_secret, c.rotating_period_seconds, c.validation_mode
    into v_secret, v_period, v_mode
    from public.jackpot_campaigns c
   where c.id = p_campaign_id;
  if not found or v_mode <> 'rotating_code' then
    return null;
  end if;

  v_counter := pg_catalog.floor(extract(epoch from pg_catalog.now()) / v_period)::bigint;
  v_mac := extensions.hmac(pg_catalog.int8send(v_counter), v_secret, 'sha1');
  v_off := pg_catalog.get_byte(v_mac, 19) & 15;
  v_bin := ((pg_catalog.get_byte(v_mac, v_off) & 127)::bigint * 16777216)
         + (pg_catalog.get_byte(v_mac, v_off + 1)::bigint * 65536)
         + (pg_catalog.get_byte(v_mac, v_off + 2)::bigint * 256)
         + (pg_catalog.get_byte(v_mac, v_off + 3)::bigint);
  return pg_catalog.lpad((v_bin % 1000000)::text, 6, '0');
end;
$$;

revoke all on function public.current_jackpot_code(uuid)
  from public, anon, authenticated;
grant execute on function public.current_jackpot_code(uuid) to service_role;

-- ── RPC service role : enregistrer une participation ─────────
-- TOUT atomique sous le verrou de la ligne de campagne (select … for update) :
-- droits (addon + statut actif), validation (rotating_code / staff +
-- cooldown), création du joueur à la 1re participation, incrément ATOMIQUE de
-- la jauge partagée, insertion de l'entrée, puis résolution selon draw_mode.
--
-- Le verrou de campagne sérialise l'incrément ET le tirage : sur la jauge
-- partagée, deux participations concurrentes ne peuvent pas produire deux
-- gagnants. Il SÉRIALISE, il ne REJETTE jamais — pas d'interrupteur (ADR-032).
--
-- Réponse jsonb :
--   state: 'unavailable' | 'invalid_code' | 'too_soon' | 'recorded'
--   campaign: { id, name, draw_mode, validation_mode }   (sauf unavailable/invalid_code)
--   current_count, threshold, cycle                      (recorded/too_soon)
--   is_new_player: bool                                  (recorded/too_soon)
--   is_winner: bool, code: text|null                     (recorded)
--   out_of_stock: bool                                   (recorded ; seuil atteint sans stock)
--   armed: bool                                          (recorded ; rescan_win)
--   display_amount_cents: int                            (recorded/too_soon)
--   draw_at: timestamptz|null                            (recorded/too_soon)
--   retry_in_seconds                                     (too_soon)
create or replace function public.record_jackpot_participation(
  p_campaign_id uuid,
  p_player_token_hash text,
  p_rotating_code text default null,
  p_validated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.jackpot_campaigns%rowtype;
  v_player public.jackpot_players%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_code_in text;
  v_counter bigint;
  v_mac bytea;
  v_off integer;
  v_bin bigint;
  v_ok boolean;
  d integer;
  v_is_new boolean := false;
  v_cycle integer;
  v_new_count integer;
  v_display bigint;
  v_out_of_stock boolean := false;
  v_armed boolean := false;
  v_is_winner boolean := false;
  v_do_award boolean := false;
  v_win_code text;
  -- tirage
  v_n bigint;
  v_pick bigint;
  v_roll bigint;
  v_p numeric;
  v_winner text;
  v_seed_bytes bytea;
  v_seed text;
  -- génération de code
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  -- Verrou sur la campagne : fige les réglages, la jauge et le stock, et
  -- sérialise le tirage. Réponse 'unavailable' identique quel que soit le
  -- motif (addon coupé, brouillon, archivé) : pas d'oracle.
  select c.* into v_camp
    from public.jackpot_campaigns c
    join public.organizations o on o.id = c.organization_id
   where c.id = p_campaign_id
     and o.addon_jackpot
   for update of c;
  if not found or v_camp.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Validation selon le mode (AVANT toute création de joueur : un code
  -- invalide n'inscrit personne).
  if v_camp.validation_mode = 'rotating_code' then
    v_code_in := pg_catalog.regexp_replace(coalesce(p_rotating_code, ''), '\D', '', 'g');
    if pg_catalog.length(v_code_in) <> 6 then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
    v_counter := pg_catalog.floor(extract(epoch from v_now) / v_camp.rotating_period_seconds)::bigint;
    v_ok := false;
    -- Deux fenêtres (la courante et la précédente), miroir du durcissement
    -- 20260725180000 : durée d'acceptation = 2·période, bornée par le cooldown
    -- via jackpot_campaigns_cooldown_floor_check.
    for d in -1..0 loop
      v_mac := extensions.hmac(pg_catalog.int8send(v_counter + d), v_camp.rotating_secret, 'sha1');
      v_off := pg_catalog.get_byte(v_mac, 19) & 15;
      v_bin := ((pg_catalog.get_byte(v_mac, v_off) & 127)::bigint * 16777216)
             + (pg_catalog.get_byte(v_mac, v_off + 1)::bigint * 65536)
             + (pg_catalog.get_byte(v_mac, v_off + 2)::bigint * 256)
             + (pg_catalog.get_byte(v_mac, v_off + 3)::bigint);
      if pg_catalog.lpad((v_bin % 1000000)::text, 6, '0') = v_code_in then
        v_ok := true;
        exit;
      end if;
    end loop;
    if not v_ok then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
  else
    -- Mode staff : l'appelant DOIT fournir l'identité du validateur (l'action
    -- backend l'a authentifié comme membre autorisé). Ferme le chemin public.
    if p_validated_by is null then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;
  end if;

  -- Joueur créé à la première participation (aucune PII). FOUND immédiatement
  -- après l'INSERT distingue la CRÉATION du simple accès (conflit → 0 ligne).
  insert into public.jackpot_players (campaign_id, organization_id, token_hash)
  values (v_camp.id, v_camp.organization_id, p_player_token_hash)
  on conflict (campaign_id, token_hash) do nothing;
  v_is_new := found;

  select p.* into v_player
    from public.jackpot_players p
   where p.campaign_id = v_camp.id and p.token_hash = p_player_token_hash
   for update;

  -- Cooldown depuis la dernière participation (anti-abus par joueur).
  if v_player.last_participation_at is not null
     and v_camp.min_participation_interval_seconds > 0
     and v_player.last_participation_at
         + pg_catalog.make_interval(secs => v_camp.min_participation_interval_seconds) > v_now then
    return pg_catalog.jsonb_build_object(
      'state', 'too_soon',
      'retry_in_seconds', pg_catalog.ceil(extract(epoch from
        v_player.last_participation_at
        + pg_catalog.make_interval(secs => v_camp.min_participation_interval_seconds)
        - v_now))::integer,
      'campaign', pg_catalog.jsonb_build_object(
        'id', v_camp.id, 'name', v_camp.name,
        'draw_mode', v_camp.draw_mode, 'validation_mode', v_camp.validation_mode),
      'current_count', v_camp.current_count,
      'threshold', v_camp.threshold,
      'cycle', v_camp.cycle,
      'is_new_player', v_is_new,
      'armed', (v_camp.draw_mode = 'rescan_win' and v_camp.current_count >= v_camp.threshold),
      'display_amount_cents',
        v_camp.display_base_cents::bigint
        + v_camp.current_count::bigint * v_camp.display_increment_cents::bigint,
      'draw_at', v_camp.draw_at
    );
  end if;

  -- Participation validée : jauge + entrée. La jauge est PARTAGÉE, l'incrément
  -- est atomique (sous le verrou de campagne).
  v_cycle := v_camp.cycle;
  v_new_count := v_camp.current_count + 1;
  update public.jackpot_players
     set participation_count = participation_count + 1,
         last_participation_at = v_now
   where id = v_player.id;
  update public.jackpot_campaigns
     set current_count = v_new_count
   where id = v_camp.id;
  insert into public.jackpot_participants
    (campaign_id, organization_id, player_token_hash, cycle)
  values (v_camp.id, v_camp.organization_id, p_player_token_hash, v_cycle);

  -- Montant d'affichage courant (cosmétique) : au pic atteint par cette
  -- participation, avant un éventuel reset de cycle.
  v_display := v_camp.display_base_cents::bigint
             + v_new_count::bigint * v_camp.display_increment_cents::bigint;

  -- Résolution selon le mode : déterminer s'il faut clôturer un cycle sur un
  -- gagnant. L'attribution effective (code + gain + reset) se fait ensuite dans
  -- un SEUL bloc, toujours sous le verrou de campagne — sérialisée, un seul
  -- gagnant possible.
  if v_camp.draw_mode = 'threshold_draw' and v_new_count >= v_camp.threshold then
    -- Seuil atteint : tirage au sort UNIFORME parmi les participants du cycle.
    if v_camp.reward_claimed_count >= v_camp.reward_stock then
      -- Stock épuisé : plus de tirage (la jauge reste, sans reset).
      v_out_of_stock := true;
    else
      select count(*) into v_n
        from public.jackpot_participants pt
       where pt.campaign_id = v_camp.id and pt.cycle = v_cycle;
      v_seed_bytes := extensions.gen_random_bytes(4);
      v_pick := mod(
        (pg_catalog.get_byte(v_seed_bytes, 0)::bigint * 16777216
         + pg_catalog.get_byte(v_seed_bytes, 1)::bigint * 65536
         + pg_catalog.get_byte(v_seed_bytes, 2)::bigint * 256
         + pg_catalog.get_byte(v_seed_bytes, 3)::bigint), v_n);
      select q.player_token_hash into v_winner from (
        select pt.player_token_hash,
               (pg_catalog.row_number() over (order by pt.created_at, pt.id)) - 1 as rn
          from public.jackpot_participants pt
         where pt.campaign_id = v_camp.id and pt.cycle = v_cycle
      ) q where q.rn = v_pick;
      v_seed := pg_catalog.encode(v_seed_bytes, 'hex');
      v_do_award := true;
    end if;

  elsif v_camp.draw_mode = 'rescan_win' and v_new_count >= v_camp.threshold then
    -- Jackpot ARMÉ à `threshold`. La participation qui ARME (v_new_count =
    -- threshold) ne roll pas ; chaque participation SUIVANTE gagne
    -- instantanément avec la probabilité win_probability (défaut 1/threshold).
    v_armed := true;
    if v_new_count > v_camp.threshold then
      if v_camp.reward_claimed_count >= v_camp.reward_stock then
        v_out_of_stock := true;
      else
        v_seed_bytes := extensions.gen_random_bytes(4);
        v_roll := (pg_catalog.get_byte(v_seed_bytes, 0)::bigint * 16777216
                 + pg_catalog.get_byte(v_seed_bytes, 1)::bigint * 65536
                 + pg_catalog.get_byte(v_seed_bytes, 2)::bigint * 256
                 + pg_catalog.get_byte(v_seed_bytes, 3)::bigint);
        v_p := coalesce(v_camp.win_probability, 1.0 / v_camp.threshold);
        if v_roll < pg_catalog.floor(v_p * 4294967296)::bigint then
          -- Gain instantané : le gagnant est le joueur qui vient de scanner.
          v_winner := p_player_token_hash;
          v_seed := pg_catalog.encode(v_seed_bytes, 'hex');
          v_do_award := true;
        end if;
      end if;
    end if;
  end if;
  -- date_draw : aucun tirage ici (run_jackpot_date_draws s'en charge à draw_at).

  -- Attribution unique du gain : code JACKPOT-… (retry anti-collision), ligne
  -- de gain (avec draw_seed pour la vérifiabilité), puis clôture du cycle
  -- (reward_claimed_count+1, cycle+1, jauge remise à 0).
  if v_do_award then
    v_win_code := null;
    for attempt in 1..8 loop
      v_bytes := extensions.gen_random_bytes(8);
      v_win_code := 'JACKPOT-';
      for i in 0..7 loop
        v_win_code := v_win_code || pg_catalog.substr(
          v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
      end loop;
      begin
        insert into public.jackpot_wins
          (campaign_id, organization_id, cycle, winner_token_hash, code, draw_seed)
        values (v_camp.id, v_camp.organization_id, v_cycle,
                v_winner, v_win_code, v_seed);
        exit;
      exception when unique_violation then
        -- Collision de code (le verrou de campagne exclut un double gain de
        -- cycle : l'unicité (campaign_id, cycle) ne peut se violer ici).
        v_win_code := null;
      end;
    end loop;
    if v_win_code is null then
      raise exception 'jackpot code generation exhausted';
    end if;
    update public.jackpot_campaigns
       set reward_claimed_count = reward_claimed_count + 1,
           cycle = cycle + 1,
           current_count = 0
     where id = v_camp.id;
    v_is_winner := (v_winner = p_player_token_hash);
    v_armed := false;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'recorded',
    'campaign', pg_catalog.jsonb_build_object(
      'id', v_camp.id, 'name', v_camp.name,
      'draw_mode', v_camp.draw_mode, 'validation_mode', v_camp.validation_mode),
    'current_count', v_new_count,
    'threshold', v_camp.threshold,
    'cycle', v_cycle,
    'is_new_player', v_is_new,
    'is_winner', v_is_winner,
    -- CONFIDENTIALITÉ DU CODE : le code de retrait n'est renvoyé QU'AU gagnant.
    -- En threshold_draw le gagnant est tiré parmi TOUS les participants du cycle
    -- (pas forcément l'appelant) ; renvoyer v_win_code inconditionnellement
    -- fuiterait le code JACKPOT-… vers un tiers qui a franchi le seuil sans être
    -- tiré (vol de lot en caisse). v_is_winner est false par défaut et ne passe
    -- true qu'au gagnant réel (v_winner = p_player_token_hash). En rescan_win le
    -- gagnant EST toujours l'appelant, donc le code reste renvoyé. Le vrai
    -- gagnant récupère son code via la page publique (jackpot_wins filtré sur
    -- winner_token_hash), jamais par la réponse d'un autre joueur.
    'code', case when v_is_winner then v_win_code else null end,
    'out_of_stock', v_out_of_stock,
    'armed', v_armed,
    'display_amount_cents', v_display,
    'draw_at', v_camp.draw_at
  );
end;
$$;

revoke all on function public.record_jackpot_participation(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_jackpot_participation(uuid, text, text, uuid)
  to service_role;

-- ── RPC service role / pg_cron : tirages à date échue ────────
-- Pour chaque campagne date_draw dont draw_at est passé, active, avec du stock
-- et des participants pour le cycle courant, non encore tirée : tirage crypto
-- atomique (verrou de ligne), création du gain + code. Le tirage à date est un
-- ONE-SHOT : le cycle n'est PAS rouvert (cf. clôture ci-dessous), si bien que le
-- garde `not exists jackpot_wins (…cycle…)` de la boucle exclut ensuite la
-- campagne définitivement — un seul tirage, jamais de re-déclenchement au cron
-- suivant. SQL direct (pas de Vault/pg_net) ; planifiée par pg_cron.
create or replace function public.run_jackpot_date_draws()
returns table (campaign_id uuid, organization_id uuid, cycle integer, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.jackpot_campaigns%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_n bigint;
  v_pick bigint;
  v_winner text;
  v_seed_bytes bytea;
  v_seed text;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  for v_camp in
    select c.* from public.jackpot_campaigns c
    join public.organizations o on o.id = c.organization_id
    where o.addon_jackpot
      and c.status = 'active'
      and c.draw_mode = 'date_draw'
      and c.draw_at is not null
      and c.draw_at <= v_now
      and c.reward_claimed_count < c.reward_stock
      and exists (
        select 1 from public.jackpot_participants p
         where p.campaign_id = c.id and p.cycle = c.cycle)
      and not exists (
        select 1 from public.jackpot_wins w
         where w.campaign_id = c.id and w.cycle = c.cycle)
  loop
    -- Verrou de ligne + revalidation sous verrou (une exécution concurrente
    -- du cron ne tire pas deux fois).
    select c.* into v_camp from public.jackpot_campaigns c
     where c.id = v_camp.id for update of c;
    if not found
       or v_camp.reward_claimed_count >= v_camp.reward_stock
       or v_camp.draw_at is null or v_camp.draw_at > v_now
       or v_camp.status <> 'active' then
      continue;
    end if;
    if exists (select 1 from public.jackpot_wins w
                where w.campaign_id = v_camp.id and w.cycle = v_camp.cycle) then
      continue;
    end if;

    select count(*) into v_n
      from public.jackpot_participants pt
     where pt.campaign_id = v_camp.id and pt.cycle = v_camp.cycle;
    if v_n <= 0 then
      continue;
    end if;

    v_seed_bytes := extensions.gen_random_bytes(4);
    v_pick := mod(
      (pg_catalog.get_byte(v_seed_bytes, 0)::bigint * 16777216
       + pg_catalog.get_byte(v_seed_bytes, 1)::bigint * 65536
       + pg_catalog.get_byte(v_seed_bytes, 2)::bigint * 256
       + pg_catalog.get_byte(v_seed_bytes, 3)::bigint), v_n);
    select q.player_token_hash into v_winner from (
      select pt.player_token_hash,
             (pg_catalog.row_number() over (order by pt.created_at, pt.id)) - 1 as rn
        from public.jackpot_participants pt
       where pt.campaign_id = v_camp.id and pt.cycle = v_camp.cycle
    ) q where q.rn = v_pick;
    v_seed := pg_catalog.encode(v_seed_bytes, 'hex');

    -- Attribution : code JACKPOT-… (retry anti-collision), gain, puis clôture
    -- ONE-SHOT du tirage à date (reward_claimed_count+1 SEULEMENT — voir plus bas).
    v_code := null;
    for attempt in 1..8 loop
      v_bytes := extensions.gen_random_bytes(8);
      v_code := 'JACKPOT-';
      for i in 0..7 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
      end loop;
      begin
        insert into public.jackpot_wins
          (campaign_id, organization_id, cycle, winner_token_hash, code, draw_seed)
        values (v_camp.id, v_camp.organization_id, v_camp.cycle,
                v_winner, v_code, v_seed);
        exit;
      exception when unique_violation then
        v_code := null;
      end;
    end loop;
    if v_code is null then
      raise exception 'jackpot code generation exhausted';
    end if;
    -- Clôture ONE-SHOT : on N'OUVRE PAS de nouveau cycle (pas de cycle+1 ni de
    -- current_count=0). Le gain reste porté par le cycle courant, de sorte que
    -- le garde `not exists jackpot_wins (…cycle…)` de la boucle exclut ensuite
    -- DÉFINITIVEMENT cette campagne : un seul tirage à date, jamais de second au
    -- cron suivant — même s'il reste du stock et que de nouveaux joueurs scannent
    -- le cycle déjà tiré (sinon un unique scanner en heures creuses re-gagnerait).
    -- La campagne reste `active` (on n'archive PAS) : le gagnant, tiré de façon
    -- asynchrone, doit pouvoir récupérer son code JACKPOT-… sur la page publique,
    -- laquelle exige status='active' (loadJackpotContext). `reward_claimed_count`
    -- qualifié pour lever toute ambiguïté avec le paramètre OUT homonyme absent.
    update public.jackpot_campaigns c
       set reward_claimed_count = c.reward_claimed_count + 1
     where c.id = v_camp.id;

    campaign_id := v_camp.id;
    organization_id := v_camp.organization_id;
    cycle := v_camp.cycle;
    code := v_code;
    return next;
  end loop;
end;
$$;

revoke all on function public.run_jackpot_date_draws()
  from public, anon, authenticated;
grant execute on function public.run_jackpot_date_draws() to service_role;

-- Planification pg_cron (SQL direct, comme run_campaign_schedule) : les
-- tirages à date sont sensibles au temps, cadence 5 min. Suivi via
-- cron_last_success() comme les autres jobs.
create extension if not exists pg_cron;
select cron.schedule(
  'lastchance-jackpot-date-draws',
  '*/5 * * * *',
  $job$ select public.run_jackpot_date_draws() $job$
);

-- ── RPC caisse : remise d'un lot de jackpot ──────────────────
-- Miroir de redeem_loyalty_reward : recherche + validation + audit
-- atomiques, actor obligatoire, org-scopée (code inconnu, déjà remis ou d'une
-- autre organisation → aucune remise, réponse indistinguable).
create or replace function public.redeem_jackpot_prize(
  p_organization_id uuid,
  p_code text,
  p_actor text
)
returns table(
  id uuid, drawn_at timestamptz, code text, redeemed_at timestamptz,
  campaign_name text, reward_label text, reward_details text,
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

  update public.jackpot_wins w
     set redeemed_at = now(),
         redeemed_by = p_actor
   where w.organization_id = p_organization_id
     and w.code = upper(btrim(p_code))
     and w.redeemed_at is null
  returning w.id into v_id;

  if v_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'jackpot.redeem',
            pg_catalog.jsonb_build_object('win_id', v_id));
  end if;

  return query
  select w.id, w.drawn_at, w.code, w.redeemed_at,
         c.name, c.reward_label, c.reward_details, (v_id is not null)
    from public.jackpot_wins w
    join public.jackpot_campaigns c on c.id = w.campaign_id
   where w.organization_id = p_organization_id
     and w.code = upper(btrim(p_code))
   limit 1;
end;
$$;

revoke all on function public.redeem_jackpot_prize(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_jackpot_prize(uuid, text, text)
  to service_role;

-- ── Purge RGPD ───────────────────────────────────────────────
-- Miroir de purge_expired_loyalty_members : supprime les JOUEURS dormants
-- (identité + cooldown) au-delà de la rétention de l'organisation, sur la
-- DERNIÈRE ACTIVITÉ. À brancher au cron /api/cron/purge-data.
--
-- Divergence assumée (à relayer à security-review) : les entrées
-- jackpot_participants et jackpot_wins ne sont PAS cascadées par cette purge
-- (elles ne portent qu'un hash de jeton, non inversible, et constituent le
-- registre anonyme et vérifiable des tirages). Elles disparaissent avec la
-- campagne (cascade) ou la suppression de l'organisation.
create or replace function public.purge_expired_jackpot_players()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.jackpot_players p
  using public.organizations o
  where p.organization_id = o.id
    and o.data_retention_months is not null
    and coalesce(p.last_participation_at, p.created_at) < pg_catalog.now()
      - pg_catalog.make_interval(months => o.data_retention_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_jackpot_players()
  from public, anon, authenticated;
grant execute on function public.purge_expired_jackpot_players()
  to service_role;
